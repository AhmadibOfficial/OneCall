import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onecall/core/api.dart';
import 'package:onecall/core/models.dart';
import 'package:onecall/main.dart';
import 'package:onecall/ui/order_pages.dart';
import 'package:onecall/ui/finance_pages.dart';
import 'package:onecall/ui/auth_page.dart';
import 'package:onecall/ui/appearance_page.dart';

const service = PilotService(
  key: 'tailoring',
  name: 'Tailoring',
  description: 'Clothing repairs and alterations',
  icon: 'tailoring',
);

class FakeApi extends OneCallApi {
  FakeApi({PilotUser? initialUser}) : _user = initialUser;
  PilotUser? _user;
  int loginCalls = 0, createCalls = 0;
  String? registeredPhone, requestedAddress, lastPath;
  Map<String, dynamic>? lastBody;
  ServiceOrder? currentOrder;
  @override
  PilotUser? get user => _user;
  @override
  bool get restoring => false;
  @override
  Future<void> restore() async {}
  PilotUser profile(bool active) => PilotUser(
    id: 'customer-1',
    uid: '1234567890',
    email: 'ahmad@example.com',
    firstName: 'Ahmad',
    phone: '+2348012345678',
    status: active ? 'ACTIVE' : 'PENDING',
    emailVerified: active,
    phoneVerified: active,
  );
  @override
  Future<void> login(String email, String password) async {
    loginCalls++;
    _user = profile(true);
    notifyListeners();
  }

  @override
  Future<void> register({
    required String firstName,
    required String lastName,
    required String email,
    required String phone,
    required String password,
  }) async {
    registeredPhone = phone;
    _user = profile(false);
    notifyListeners();
  }

  @override
  Future<void> logout() async {
    _user = null;
    notifyListeners();
  }

  @override
  Future<PilotUser> reloadUser() async => _user!;
  @override
  Future<List<PilotService>> services() async => [service];
  @override
  Future<List<ServiceOrder>> orders() async =>
      currentOrder == null ? [] : [currentOrder!];
  @override
  Future<ServiceOrder> createOrder(
    PilotService service,
    String address,
    String description,
  ) async {
    createCalls++;
    requestedAddress = address;
    return currentOrder = ServiceOrder(
      id: 'order-1',
      serviceName: service.name,
      status: 'PENDING',
      createdAt: DateTime(2026, 10, 9),
      address: address,
      description: description,
    );
  }

  @override
  Future<ServiceOrder> order(String id) async => currentOrder!;
  @override
  Future<ServiceOrder> cancelOrder(String id) async =>
      currentOrder = ServiceOrder(
        id: id,
        serviceName: service.name,
        status: 'CANCELLED',
        createdAt: currentOrder!.createdAt,
      );
  @override
  Future<Map<String, dynamic>> requestVerification(bool phone) async => {
    'accepted': true,
    if (phone) 'selector': 'test-selector',
  };
  @override
  Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool authenticated = true,
  }) async {
    lastPath = path;
    lastBody = body;
    if (path == '/wallet') {
      return {
        'currency': 'NGN',
        'balance': '0.00',
        'checkoutEnabled': false,
        'fundingEnabled': false,
        'transactions': <dynamic>[],
      };
    }
    if (path.endsWith('/quote/accept')) {
      currentOrder = ServiceOrder(
        id: currentOrder!.id,
        serviceName: currentOrder!.serviceName,
        status: 'ACCEPTED',
        createdAt: currentOrder!.createdAt,
        amount: '5000.00',
        providerAssigned: true,
        quote: {
          'id': 'quote-current',
          'amount': '5000.00',
          'acceptedAt': '2026-10-11T12:00:00Z',
        },
      );
      return {'accepted': true};
    }
    if (path == '/auth/social/configuration') {
      return {'google': false, 'apple': false};
    }
    if (path == '/favorites' ||
        path == '/notifications' ||
        path == '/addresses') {
      return <dynamic>[];
    }
    throw const ApiFailure('Unavailable in this test');
  }

  @override
  Future<void> confirmVerification(
    bool phone,
    String value, {
    String? selector,
  }) async {}
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  Future<void> display(WidgetTester tester, FakeApi api) async {
    tester.view.physicalSize = const Size(900, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(OneCallApp(api: api));
    await tester.pumpAndSettle();
  }

  Finder field(String label) => find.widgetWithText(TextFormField, label);
  testWidgets(
    'appearance preferences persist and preserve device text scaling',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final preferences = AppearancePreferences();
      await preferences.setTextSize(1.15);
      await preferences.setReducedMotion(true);
      final restored = AppearancePreferences();
      await restored.load();
      expect(restored.textSize, 1.15);
      expect(restored.reducedMotion, isTrue);
      expect(const OneCallTextScaler(TextScaler.linear(2), 1.15).scale(10), 23);
      preferences.dispose();
      restored.dispose();
    },
  );

  testWidgets(
    'Google and Apple options are visible in sign in and registration',
    (tester) async {
      final api = FakeApi();
      addTearDown(api.dispose);
      for (final register in [false, true]) {
        await tester.pumpWidget(
          MaterialApp(
            home: AuthPage(
              key: ValueKey(register),
              api: api,
              initialRegister: register,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Continue with Apple'), findsOneWidget);
        expect(find.text('Continue with Google'), findsOneWidget);
        expect(find.text('or with email'), findsOneWidget);
        expect(
          find.widgetWithText(TextFormField, 'Email address'),
          findsOneWidget,
        );
        await tester.pumpWidget(const SizedBox());
      }
    },
  );

  testWidgets(
    'chat inbox hides unassigned bookings and shows assigned conversations',
    (tester) async {
      final api = FakeApi();
      addTearDown(api.dispose);
      await api.login('ahmad@example.com', 'Password123!');
      api.currentOrder = ServiceOrder(
        id: 'booking-chat',
        serviceName: 'Tailoring',
        status: 'PENDING',
        createdAt: DateTime(2026, 10, 13),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: ChatInboxPanel(api: api)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Tailoring'), findsNothing);
      expect(
        find.textContaining('once a provider is assigned'),
        findsOneWidget,
      );
      api.currentOrder = ServiceOrder(
        id: 'booking-chat',
        serviceName: 'Tailoring',
        status: 'ACCEPTED',
        createdAt: DateTime(2026, 10, 13),
        providerAssigned: true,
        provider: {'uid': '9999999999'},
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ChatInboxPanel(key: const ValueKey('assigned'), api: api),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Tailoring'), findsOneWidget);
      expect(find.textContaining('Booking booking-chat'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'unconfigured social buttons explain availability without signing in',
    (tester) async {
      final api = FakeApi();
      addTearDown(api.dispose);
      await tester.pumpWidget(MaterialApp(home: AuthPage(api: api)));
      await tester.pumpAndSettle();
      for (final key in ['apple-sign-in', 'google-sign-in']) {
        await tester.ensureVisible(find.byKey(ValueKey(key)));
        await tester.tap(find.byKey(ValueKey(key)));
        await tester.pumpAndSettle();
        expect(find.textContaining('not configured yet'), findsOneWidget);
        expect(api.loginCalls, 0);
        expect(api.createCalls, 0);
      }
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('guest can browse services but account details require sign in', (
    tester,
  ) async {
    final api = FakeApi();
    addTearDown(api.dispose);
    await display(tester, api);
    await tester.tap(find.text('Continue as Guest'));
    await tester.pumpAndSettle();
    expect(find.text('Tailoring'), findsOneWidget);
    await tester.tap(find.text('Bookings'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in to continue'), findsOneWidget);
    expect(api.createCalls, 0);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'customer explicitly accepts the current quote before payment appears',
    (tester) async {
      final api = FakeApi();
      addTearDown(api.dispose);
      await api.login('ahmad@example.com', 'Password123!');
      api.currentOrder = ServiceOrder(
        id: 'order-quote',
        serviceName: 'Tailoring',
        status: 'ACCEPTED',
        createdAt: DateTime(2026, 10, 11),
        providerAssigned: true,
        quote: {'id': 'quote-current', 'amount': '5000.00', 'acceptedAt': null},
      );
      await tester.pumpWidget(
        MaterialApp(
          home: OrderDetailsPage(api: api, initialOrder: api.currentOrder!),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Choose payment method'), findsNothing);
      await tester.scrollUntilVisible(
        find.text('Accept quote'),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Accept quote'));
      await tester.pumpAndSettle();
      expect(api.lastPath, '/orders/order-quote/quote/accept');
      expect(api.lastBody, {'quoteId': 'quote-current'});
      expect(find.text('Quote accepted'), findsOneWidget);
      expect(find.text('Choose payment method'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'unconfigured wallet shows its real zero balance and disables funding',
    (tester) async {
      final api = FakeApi();
      addTearDown(api.dispose);
      await tester.pumpWidget(MaterialApp(home: WalletPage(api: api)));
      await tester.pumpAndSettle();
      expect(find.text('₦0.00'), findsOneWidget);
      expect(find.text('No wallet transactions yet.'), findsOneWidget);
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Fund Wallet'),
      );
      expect(button.onPressed, isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('invalid login input never reaches the API', (tester) async {
    final api = FakeApi();
    addTearDown(api.dispose);
    await display(tester, api);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign In'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Enter a valid email address'), findsOneWidget);
    expect(api.loginCalls, 0);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'registration normalizes Nigerian phones and gates service requests',
    (tester) async {
      final api = FakeApi();
      addTearDown(api.dispose);
      await display(tester, api);
      await tester.tap(find.widgetWithText(OutlinedButton, 'Create Account'));
      await tester.pumpAndSettle();
      await tester.enterText(field('First name'), 'Ahmad');
      await tester.enterText(field('Last name'), 'Pilot');
      await tester.enterText(field('Phone number'), '08012345678');
      await tester.enterText(field('Email address'), 'ahmad@example.com');
      await tester.enterText(field('Password'), 'Password123!');
      await tester.ensureVisible(
        find.widgetWithText(FilledButton, 'Create account'),
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
      await tester.pumpAndSettle();
      expect(api.registeredPhone, '+2348012345678');
      expect(find.text('Verify your email and phone'), findsOneWidget);
      await tester.ensureVisible(find.text('Tailoring'));
      await tester.tap(find.text('Tailoring'));
      await tester.pumpAndSettle();
      expect(find.text('Verify your account'), findsOneWidget);
      expect(api.createCalls, 0);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'verified customer sends a request and sees refreshed order status',
    (tester) async {
      final api = FakeApi();
      addTearDown(api.dispose);
      await display(tester, api);
      await tester.tap(find.widgetWithText(FilledButton, 'Sign In'));
      await tester.pumpAndSettle();
      await tester.enterText(field('Email address'), 'ahmad@example.com');
      await tester.enterText(field('Password'), 'Password123!');
      await tester.ensureVisible(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Tailoring'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
      await tester.pumpAndSettle();
      await tester.enterText(field('What do you need?'), 'Alter a kaftan');
      await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
      await tester.pumpAndSettle();
      expect(api.createCalls, 0);
      expect(find.text('Enter an address and nearby landmark'), findsOneWidget);
      await tester.enterText(
        field('Address and landmark'),
        'Unguwan Rimi, Kaduna',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Review & send'), findsOneWidget);
      expect(find.text('Alter a kaftan'), findsOneWidget);
      expect(api.createCalls, 0);
      await tester.ensureVisible(
        find.widgetWithText(FilledButton, 'Send request'),
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Send request'));
      await tester.pumpAndSettle();
      expect(api.createCalls, 1);
      expect(api.requestedAddress, 'Unguwan Rimi, Kaduna');
      expect(find.text('Awaiting a provider'), findsOneWidget);
      api.currentOrder = ServiceOrder(
        id: 'order-1',
        serviceName: 'Tailoring',
        status: 'COMPLETED',
        createdAt: DateTime(2026, 10, 9),
        address: api.requestedAddress,
        providerAssigned: true,
      );
      await tester.tap(find.byTooltip('Refresh status'));
      await tester.pumpAndSettle();
      expect(find.text('Completed'), findsNWidgets(2));
      expect(find.text('Cancel request'), findsNothing);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Logout'),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.pumpAndSettle();
      await Scrollable.ensureVisible(
        tester.element(find.text('Logout')),
        alignment: 0.5,
      );
      await tester.pumpAndSettle();
      expect(find.text('Logout').hitTestable(), findsOneWidget);
      await tester.tap(find.text('Logout').hitTestable());
      await tester.pumpAndSettle();
      expect(find.widgetWithText(FilledButton, 'Sign In'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets(
    'editing the review retains details and does not create a booking',
    (tester) async {
      final api = FakeApi();
      addTearDown(api.dispose);
      await api.login('ahmad@example.com', 'Password123!');
      await tester.pumpWidget(
        MaterialApp(
          home: RequestPage(api: api, service: service),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
      await tester.pumpAndSettle();
      await tester.enterText(field('What do you need?'), 'Two kaftans');
      await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
      await tester.pumpAndSettle();
      await tester.enterText(
        field('Address and landmark'),
        'Unguwan Rimi, Kaduna',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
      await tester.pumpAndSettle();
      expect(api.createCalls, 0);
      await tester.tap(find.text('Two kaftans'));
      await tester.pumpAndSettle();
      final input = tester.widget<TextFormField>(field('What do you need?'));
      expect(input.controller!.text, 'Two kaftans');
      await tester.enterText(field('What do you need?'), 'Three kaftans');
      await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextFormField>(field('Address and landmark'))
            .controller!
            .text,
        'Unguwan Rimi, Kaduna',
      );
      expect(api.createCalls, 0);
      await tester.pumpWidget(const SizedBox());
    },
  );
}

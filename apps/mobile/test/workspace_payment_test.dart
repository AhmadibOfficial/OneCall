import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:onecall/core/models.dart';
import 'package:onecall/ui/home_page.dart';
import 'package:onecall/ui/finance_pages.dart';
import 'widget_test.dart' show FakeApi;

const customer = PilotUser(
  id: 'user-a',
  uid: '1234567890',
  email: 'customer@example.com',
  status: 'ACTIVE',
  emailVerified: false,
  phoneVerified: false,
);

class WorkspaceApi extends FakeApi {
  WorkspaceApi({
    PilotUser user = customer,
    this.approved = false,
    this.paymentMode = 'disabled',
  }) : super(initialUser: user);
  final bool approved;
  final String paymentMode;
  final calls = <String>[];
  @override
  Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool authenticated = true,
  }) async {
    calls.add('$method $path');
    if (path == '/provider/me') {
      return {
        'provider': {
          'approved': approved,
          'displayName': 'Ahmad Services',
          'coverage': <dynamic>[],
        },
      };
    }
    if (path == '/orders/available') {
      return <dynamic>[];
    }
    if (path == '/wallet') {
      return {
        'balance': '0.00',
        'paymentMode': paymentMode,
        'checkoutEnabled': paymentMode == 'test',
        'walletPaymentEnabled': false,
        'fundingEnabled': false,
        'transactions': <dynamic>[],
      };
    }
    return super.request(
      method,
      path,
      body: body,
      authenticated: authenticated,
    );
  }

  @override
  Future<List<ServiceOrder>> orders() async => [
    ServiceOrder(
      id: 'customer-booking',
      serviceName: 'Customer repair',
      status: 'ACCEPTED',
      createdAt: DateTime(2026),
      providerAssigned: true,
      provider: {'uid': '9999999999'},
    ),
    ServiceOrder(
      id: 'assigned-job',
      serviceName: 'Assigned plumbing job',
      status: 'ACCEPTED',
      createdAt: DateTime(2026),
      providerAssigned: true,
      provider: {'uid': user!.uid},
    ),
  ];
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<void> display(WidgetTester tester, Widget child) async {
    await tester.pumpWidget(MaterialApp(home: child));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'switch keeps the same session, saves preference and does not grant provider approval',
    (tester) async {
      final api = WorkspaceApi();
      addTearDown(api.dispose);
      await display(tester, HomePage(api: api));
      expect(find.byKey(const ValueKey('workspace-switch')), findsNothing);
      await tester.tap(find.text('Profile').last);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('workspace-switch')),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.byKey(const ValueKey('workspace-switch')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Workspace').last);
      await tester.pumpAndSettle();
      expect(find.text('Application awaiting approval'), findsOneWidget);
      expect(api.user, same(customer));
      expect(api.loginCalls, 0);
      expect(
        api.calls.where((c) => c.startsWith('POST') || c.startsWith('PATCH')),
        isEmpty,
      );
      expect(api.calls, isNot(contains('GET /orders/available')));
      expect(
        (await SharedPreferences.getInstance()).getString(
          'onecall.workspace.${customer.uid}',
        ),
        'provider',
      );
      await tester.tap(find.text('Profile').last);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('workspace-switch')),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.byKey(const ValueKey('workspace-switch')));
      await tester.pumpAndSettle();
      expect(find.text('Home'), findsOneWidget);
      expect(api.user, same(customer));
    },
  );

  testWidgets(
    'saved workspace is restored only for its account and guest has no switch',
    (tester) async {
      SharedPreferences.setMockInitialValues({
        'onecall.workspace.${customer.uid}': 'provider',
      });
      final api = WorkspaceApi();
      addTearDown(api.dispose);
      await display(tester, HomePage(key: ValueKey(customer.uid), api: api));
      await tester.tap(find.text('Workspace').last);
      await tester.pumpAndSettle();
      expect(find.text('Application awaiting approval'), findsOneWidget);
      final other = WorkspaceApi(
        user: const PilotUser(
          id: 'user-b',
          uid: '2222222222',
          email: 'other@example.com',
        ),
      );
      addTearDown(other.dispose);
      await display(
        tester,
        HomePage(key: ValueKey(other.user!.uid), api: other),
      );
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Application awaiting approval'), findsNothing);
      final guest = FakeApi();
      addTearDown(guest.dispose);
      await display(tester, HomePage(key: const ValueKey('guest'), api: guest));
      expect(find.byKey(const ValueKey('workspace-switch')), findsNothing);
    },
  );

  testWidgets(
    'customer and provider bookings and chat follow the selected workspace',
    (tester) async {
      final api = WorkspaceApi(approved: true);
      addTearDown(api.dispose);
      await display(tester, HomePage(api: api));
      await tester.tap(find.text('Bookings'));
      await tester.pumpAndSettle();
      expect(find.text('Customer repair'), findsOneWidget);
      expect(find.text('Assigned plumbing job'), findsNothing);
      await tester.tap(find.text('Profile').last);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('workspace-switch')),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.byKey(const ValueKey('workspace-switch')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('My jobs').last);
      await tester.pumpAndSettle();
      expect(find.text('Assigned plumbing job'), findsOneWidget);
      expect(find.text('Customer repair'), findsNothing);
      await tester.tap(find.text('Chat'));
      await tester.pumpAndSettle();
      expect(find.text('Assigned plumbing job'), findsOneWidget);
      expect(find.text('Customer repair'), findsNothing);
      await tester.tap(find.text('Profile').last);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('workspace-switch')),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.byKey(const ValueKey('workspace-switch')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Chat'));
      await tester.pumpAndSettle();
      expect(find.text('Customer repair'), findsOneWidget);
      expect(find.text('Assigned plumbing job'), findsNothing);
    },
  );

  testWidgets('inactive account cannot load provider jobs', (tester) async {
    final api = WorkspaceApi(
      user: const PilotUser(
        id: 'pending',
        uid: '3333333333',
        email: 'pending@example.com',
      ),
    );
    addTearDown(api.dispose);
    await display(tester, HomePage(api: api));
    await tester.tap(find.text('Profile').last);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('workspace-switch')));
    await tester.tap(find.byKey(const ValueKey('workspace-switch')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Workspace').last);
    await tester.pumpAndSettle();
    expect(find.text('Account unavailable'), findsOneWidget);
    expect(api.calls, isNot(contains('GET /provider/me')));
    expect(find.text('Available jobs'), findsNothing);
    expect(api.loginCalls, 0);
  });

  testWidgets(
    'workspace switch remains usable on narrow screens with large text',
    (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = WorkspaceApi();
      addTearDown(api.dispose);
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(2)),
            child: child!,
          ),
          home: HomePage(api: api),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Profile').last);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('workspace-switch')),
        300,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.byKey(const ValueKey('workspace-switch')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Workspace').last);
      await tester.pumpAndSettle();
      expect(find.text('Application awaiting approval'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('unconfigured payments cannot call checkout or debit a wallet', (
    tester,
  ) async {
    final api = WorkspaceApi();
    addTearDown(api.dispose);
    await display(
      tester,
      PaymentPage(
        api: api,
        order: ServiceOrder(
          id: 'booking',
          serviceName: 'Repair',
          status: 'ACCEPTED',
          createdAt: DateTime(2026),
          amount: '5000.00',
        ),
      ),
    );
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Pay now'))
          .onPressed,
      isNull,
    );
    expect(api.calls.where((c) => c.startsWith('POST')), isEmpty);
  });

  testWidgets(
    'test checkout is labelled before payment and after confirmation',
    (tester) async {
      final api = WorkspaceApi(paymentMode: 'test');
      addTearDown(api.dispose);
      await display(
        tester,
        PaymentPage(
          api: api,
          order: ServiceOrder(
            id: 'booking',
            serviceName: 'Repair',
            status: 'ACCEPTED',
            createdAt: DateTime(2026),
            amount: '5000.00',
          ),
        ),
      );
      expect(
        find.text('Test payments only. No real money is collected.'),
        findsOneWidget,
      );
      expect(find.text('Continue to test checkout'), findsOneWidget);
      await display(
        tester,
        CheckoutPage(
          api: api,
          intent: {
            'id': 'test-checkout',
            'amount': '5000.00',
            'paymentMode': 'test',
            'status': 'SUCCEEDED',
          },
        ),
      );
      expect(
        find.text('Test payment · No real money is collected.'),
        findsOneWidget,
      );
    },
  );
}

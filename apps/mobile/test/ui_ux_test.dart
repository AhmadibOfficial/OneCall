import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:onecall/core/models.dart';
import 'package:onecall/ui/app_theme.dart';
import 'package:onecall/ui/auth_page.dart';
import 'package:onecall/ui/home_page.dart';
import 'package:onecall/ui/order_pages.dart';
import 'package:onecall/ui/service_catalogue.dart';
import 'package:onecall/ui/welcome_page.dart';
import 'widget_test.dart' show FakeApi;

const catalogue = [
  PilotService(
    key: 'plumbing',
    name: 'Plumbing',
    description: 'Leaking taps and household pipe repairs',
    icon: 'plumbing',
    availableProviders: 2,
  ),
  PilotService(
    key: 'tailoring',
    name: 'Tailoring',
    description: 'Clothing repairs and alterations',
    icon: 'tailoring',
  ),
  PilotService(
    key: 'delivery',
    name: 'Parcel delivery',
    description: 'Move parcels across town',
    icon: 'delivery',
    kind: 'delivery',
    availableProviders: 1,
  ),
];

class CatalogueApi extends FakeApi {
  @override
  Future<List<PilotService>> services() async => catalogue;
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    WidgetController.hitTestWarningShouldBeFatal = true;
    addTearDown(() => WidgetController.hitTestWarningShouldBeFatal = false);
  });

  Future<void> display(
    WidgetTester tester,
    Widget child, {
    double width = 390,
    double scale = 1,
    double height = 900,
  }) async {
    tester.view.physicalSize = Size(width, height);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        theme: oneCallTheme(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: child,
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('search has its own accessible label before and after typing', (
    tester,
  ) async {
    final api = CatalogueApi();
    addTearDown(api.dispose);
    final semantics = tester.ensureSemantics();
    addTearDown(semantics.dispose);
    await display(tester, HomePage(api: api));
    final search = find.byKey(const ValueKey('home-service-search'));
    expect(
      tester.getSemantics(search).getSemanticsData().label,
      'Search services',
    );
    await tester.enterText(find.byType(TextField), 'leaks');
    await tester.pumpAndSettle();
    expect(
      tester.getSemantics(search).getSemanticsData().label,
      'Search services',
    );
  });

  test('service search combines words, aliases and the selected category', () {
    expect(
      matchingServices(
        catalogue,
        '  repairs   taps ',
        ServiceCategory.all,
      ).single.key,
      'plumbing',
    );
    expect(
      matchingServices(
        catalogue,
        'repairs',
        ServiceCategory.lifestyle,
      ).single.key,
      'tailoring',
    );
    expect(
      matchingServices(catalogue, 'plumbing', ServiceCategory.errands),
      isEmpty,
    );
  });

  testWidgets(
    'empty results can be cleared and mobile navigation preserves search',
    (tester) async {
      final api = CatalogueApi();
      addTearDown(api.dispose);
      await display(tester, HomePage(api: api));
      await tester.enterText(find.byType(TextField), 'not-a-service');
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Clear search & filters'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Clear search & filters'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('service-plumbing')), findsOneWidget);
      await tester.scrollUntilVisible(
        find.byType(TextField),
        -300,
        scrollable: find
            .descendant(
              of: find.byKey(const PageStorageKey('home-scroll')),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'tailoring');
      await tester.tap(find.text('Bookings'));
      await tester.pumpAndSettle();
      expect(find.text('Sign in to continue'), findsOneWidget);
      await tester.tap(find.text('Home'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'tailoring',
      );
      expect(find.byKey(const ValueKey('service-plumbing')), findsNothing);
      expect(find.byKey(const ValueKey('service-tailoring')), findsOneWidget);
      expect(find.byType(NavigationBar), findsOneWidget);
    },
  );

  testWidgets('desktop navigation retains the private booking gate', (
    tester,
  ) async {
    final api = CatalogueApi();
    addTearDown(api.dispose);
    await display(tester, HomePage(api: api), width: 1440);
    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    await tester.tap(find.text('Bookings'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in to continue'), findsOneWidget);
    expect(
      tester.widget<NavigationRail>(find.byType(NavigationRail)).selectedIndex,
      1,
    );
  });

  testWidgets('desktop navigation scrolls on a short window with large text', (
    tester,
  ) async {
    final api = CatalogueApi();
    addTearDown(api.dispose);
    await display(
      tester,
      HomePage(api: api),
      width: 1440,
      height: 600,
      scale: 2,
    );
    await tester.ensureVisible(find.text('Profile'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Profile'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in to continue'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'catalogue keeps incoming filters and favourites never create bookings',
    (tester) async {
      var booked = 0, saved = 0;
      final favorites = <String>{};
      await display(
        tester,
        AllServicesPage(
          services: catalogue,
          location: 'Kaduna, Kaduna',
          initialQuery: 'repairs',
          initialCategory: ServiceCategory.lifestyle,
          onBook: (_) async {
            booked++;
          },
          favorites: favorites,
          onFavorite: (service) async {
            saved++;
            favorites.add(service.name);
          },
        ),
      );
      expect(find.byKey(const ValueKey('service-tailoring')), findsOneWidget);
      expect(find.byKey(const ValueKey('service-plumbing')), findsNothing);
      await tester.tap(find.byTooltip('Save Tailoring to favourites'));
      await tester.pumpAndSettle();
      expect(saved, 1);
      expect(booked, 0);
      expect(
        find.byTooltip('Remove Tailoring from favourites'),
        findsOneWidget,
      );
      await tester.tap(find.text('Tailoring'));
      expect(booked, 1);
    },
  );

  for (final width in [320.0, 390.0, 768.0, 1440.0]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('home fits ${width.toInt()}px at ${scale}x text size', (
        tester,
      ) async {
        final api = CatalogueApi();
        addTearDown(api.dispose);
        await display(
          tester,
          HomePage(api: api),
          width: width,
          scale: scale,
        );
        await tester.scrollUntilVisible(
          find.text('Request first. Agree a quote.'),
          300,
          scrollable: find
              .descendant(
                of: find.byKey(const PageStorageKey('home-scroll')),
                matching: find.byType(Scrollable),
              )
              .first,
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets(
    'welcome, sign in and registration fit a narrow screen with large text',
    (tester) async {
      final api = CatalogueApi();
      addTearDown(api.dispose);
      for (final screen in [
        WelcomePage(api: api, onGuest: () {}),
        AuthPage(api: api),
        AuthPage(api: api, initialRegister: true),
      ]) {
        await display(tester, screen, width: 320, scale: 2);
        await tester.drag(
          find.byType(SingleChildScrollView).first,
          const Offset(0, -1800),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      }
    },
  );

  testWidgets('booking progress and back button preserve the entered details', (
    tester,
  ) async {
    final api = CatalogueApi();
    addTearDown(api.dispose);
    await api.login('preview@example.invalid', 'Test1234');
    await display(
      tester,
      RequestPage(api: api, service: catalogue.first),
      width: 320,
      scale: 2,
    );
    expect(find.text('Step 1 of 5 · Service'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('request-description')),
      'Repair a leaking tap',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Step 3 of 5 · Where'), findsOneWidget);
    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('request-description')),
          )
          .controller!
          .text,
      'Repair a leaking tap',
    );
    expect(api.createCalls, 0);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
    'timing and review remain usable at 200% text without creating a booking',
    (tester) async {
      final api = CatalogueApi();
      addTearDown(api.dispose);
      await api.login('preview@example.invalid', 'Test1234');
      await display(
        tester,
        RequestPage(api: api, service: catalogue.first),
        width: 320,
        scale: 2,
      );
      for (var step = 0; step < 2; step++) {
        await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
        await tester.pumpAndSettle();
      }
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('request-address')),
        250,
        scrollable: find
            .descendant(
              of: find.byType(ListView).first,
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.enterText(
        find.byKey(const ValueKey('request-address')),
        'Sample address near the main market',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Step 4 of 5 · When'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Step 5 of 5 · Review'), findsOneWidget);
      expect(
        find.widgetWithText(FilledButton, 'Send request').hitTestable(),
        findsOneWidget,
      );
      expect(api.createCalls, 0);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onecall/core/api.dart';
import 'package:onecall/core/models.dart';
import 'package:onecall/ui/order_pages.dart';
import 'package:onecall/ui/parcel_pages.dart';
import 'widget_test.dart' show FakeApi;

const shop = {
  'id': 'shop-1',
  'shopName': 'Kaduna Park Shop',
  'address': '12 Test motor park road',
  'city': 'Kaduna',
  'state': 'Kaduna',
};
const destination = {
  'id': 'shop-2',
  'shopName': 'Kano Park Shop',
  'address': '18 Test motor park road',
  'city': 'Kano',
  'state': 'Kano',
};
const route = {
  'id': 'route-1',
  'originAgent': shop,
  'destinationAgent': destination,
  'priceKobo': 250000,
  'homePickup': false,
  'homePickupFeeKobo': 0,
  'maxWeightGrams': 10000,
  'estimatedHours': 24,
};

class ParcelFake extends FakeApi {
  final List<Map<String, dynamic>> bookings = [];
  bool failOnce = true;
  String status = 'REQUESTED', role = 'sender';
  Map get parcel => {
    'id': 'parcel-1',
    'reference': 'OC-TEST-PARCEL',
    'role': role,
    'status': status,
    'agentSide': role == 'agent' ? 'destination' : null,
    'originAgent': shop,
    'destinationAgent': destination,
    'recipientName': 'Recipient Test',
    'recipientPhone': '+2348012345678',
    'description': 'Safely packed clothes',
    'weightGrams': 1000,
    'priceKobo': 250000,
    'events': <Map>[],
  };
  @override
  Future<List<PilotService>> servicesForLocation(
    String state,
    String city,
  ) async => const [
    PilotService(
      key: 'parcel-delivery',
      name: 'Parcel Delivery',
      description: 'Approved parcel shops',
      icon: 'delivery',
      kind: 'delivery',
    ),
  ];
  @override
  Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool authenticated = true,
  }) async {
    if (path.startsWith('/parcels/routes')) return <Map>[];
    if (method == 'GET' && path == '/parcels') {
      return {'items': <Map>[], 'nextCursor': null};
    }
    if (path == '/parcels/agent') {
      return {
        'agent': {...shop, 'status': 'PENDING'},
        'routes': <Map>[],
      };
    }
    if (method == 'POST' && path == '/parcels') {
      bookings.add(Map<String, dynamic>.from(body!));
      if (failOnce) {
        failOnce = false;
        throw const ApiFailure('Connection interrupted');
      }
      return parcel;
    }
    if (path == '/parcels/parcel-1/collection-code') {
      return {
        'code': '123456',
        'expiresAt': '2026-10-24T12:00:00Z',
        'purpose': 'DELIVERY',
        'instruction': 'Share only with your recipient.',
      };
    }
    if (path == '/parcels/parcel-1') return parcel;
    return super.request(
      method,
      path,
      body: body,
      authenticated: authenticated,
    );
  }
}

void main() {
  Future<void> display(
    WidgetTester tester,
    Widget child, {
    bool large = false,
  }) async {
    tester.view.physicalSize = const Size(360, 840);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(large ? 2 : 1)),
          child: child!,
        ),
        home: child,
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> tapVisible(WidgetTester tester, Finder finder) async {
    await Scrollable.ensureVisible(tester.element(finder), alignment: 0.5);
    await tester.pumpAndSettle();
    await tester.tap(finder.hitTestable());
    await tester.pumpAndSettle();
  }

  testWidgets('switching to Parcel Delivery uses the shop flow', (
    tester,
  ) async {
    final api = ParcelFake();
    addTearDown(api.dispose);
    await api.login('parcel@example.com', 'Password123!');
    await display(
      tester,
      RequestPage(
        api: api,
        service: const PilotService(
          key: 'tailoring',
          name: 'Tailoring',
          description: 'Clothes repairs',
          icon: 'tailoring',
        ),
        state: 'Kaduna',
        city: 'Kaduna',
      ),
    );
    await tapVisible(tester, find.text('Choose another service'));
    await tapVisible(tester, find.text('Parcel Delivery'));
    expect(find.text('My parcels'), findsOneWidget);
    expect(find.text('Send a parcel'), findsOneWidget);
    expect(find.text('What do you need?'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'service providers can track their parcels without parcel-agent approval',
    (tester) async {
      final api = ParcelFake();
      addTearDown(api.dispose);
      await api.login('provider@example.com', 'Password123!');
      await display(
        tester,
        Scaffold(body: BookingsPanel(api: api, providerView: true)),
      );
      await tapVisible(tester, find.text('Parcel delivery & tracking'));
      expect(find.text('My parcels'), findsOneWidget);
      expect(find.text('Parcel shop jobs'), findsNothing);
      expect(find.textContaining('No parcels yet.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('route search clearly reports areas with no approved routes', (
    tester,
  ) async {
    final api = ParcelFake();
    addTearDown(api.dispose);
    await display(
      tester,
      ParcelRoutesPage(api: api, state: 'Kaduna', city: 'Kaduna'),
    );
    expect(find.textContaining('No approved route'), findsOneWidget);
    expect(find.text('Send parcel request'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'lost booking response keeps the idempotency reference on retry',
    (tester) async {
      final api = ParcelFake();
      addTearDown(api.dispose);
      await display(tester, ParcelBookingPage(api: api, route: route));
      final fields = find.byType(TextFormField);
      for (final entry in [
        (0, 'Recipient Test'),
        (1, '08012345678'),
        (2, 'Two packed cotton shirts'),
        (3, '1000'),
      ]) {
        await tester.ensureVisible(fields.at(entry.$1));
        await tester.enterText(fields.at(entry.$1), entry.$2);
      }
      await tapVisible(tester, find.byType(CheckboxListTile).at(0));
      await tapVisible(tester, find.byType(CheckboxListTile).at(1));
      await tapVisible(tester, find.text('Send parcel request'));
      expect(api.bookings, hasLength(1));
      expect(find.textContaining('Connection interrupted'), findsOneWidget);
      await tapVisible(tester, find.text('Send parcel request'));
      expect(api.bookings, hasLength(2));
      expect(
        api.bookings[0]['clientReference'],
        api.bookings[1]['clientReference'],
      );
      expect(
        api.bookings[0]['clientReference'],
        matches(
          RegExp(r'^[a-f0-9-]{14}4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
        ),
      );
      expect(find.text('OC-TEST-PARCEL'), findsOneWidget);
      expect(find.text('Record departure'), findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('recipient cannot issue collection codes or record custody', (
    tester,
  ) async {
    final api = ParcelFake()
      ..role = 'recipient'
      ..status = 'READY_FOR_COLLECTION';
    addTearDown(api.dispose);
    await display(tester, ParcelDetailPage(api: api, id: 'parcel-1'));
    expect(find.text('Create or replace collection code'), findsNothing);
    expect(find.text('Verify code and hand over parcel'), findsNothing);
    expect(find.text('Cancel parcel request'), findsNothing);
  });
  testWidgets('sender can create a collection code on a large-text phone', (
    tester,
  ) async {
    final api = ParcelFake()..status = 'READY_FOR_COLLECTION';
    addTearDown(api.dispose);
    await display(
      tester,
      ParcelDetailPage(api: api, id: 'parcel-1'),
      large: true,
    );
    await tapVisible(tester, find.text('Create or replace collection code'));
    expect(find.text('123456'), findsOneWidget);
    expect(find.text('Verify code and hand over parcel'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'pending agents see review status without job operation controls',
    (tester) async {
      final api = ParcelFake();
      addTearDown(api.dispose);
      await display(
        tester,
        ParcelAgentPage(api: api, state: 'Kaduna', city: 'Kaduna'),
        large: true,
      );
      expect(find.textContaining('pending'), findsOneWidget);
      expect(find.text('Open assigned parcel jobs'), findsNothing);
      expect(find.text('Propose a route'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
}

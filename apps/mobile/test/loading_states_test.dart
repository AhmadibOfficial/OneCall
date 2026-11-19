import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onecall/ui/loading_widgets.dart';
import 'package:onecall/ui/resource_widgets.dart';
import 'package:onecall/ui/home_page.dart';
import 'package:onecall/core/models.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'widget_test.dart' show FakeApi, service;

void main() {
  testWidgets('OneCall home allows Profile navigation while services load', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final api = _WaitingCatalogueApi();
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: HomePage(api: api)));
    await tester.pump();
    await tester.pump();
    expect(find.byType(ContentSkeleton), findsOneWidget);
    await tester.tap(find.text('Profile').last);
    await tester.pumpAndSettle();
    expect(find.text('Sign in to continue'), findsOneWidget);
    api.pending.complete([service]);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('initial loading keeps navigation usable and has no fake actions', (tester) async {
    final pending = Completer<List<dynamic>>();
    var navigated = false;
    await tester.pumpWidget(MaterialApp(home: Scaffold(
      body: ResourceList(
        load: () => pending.future,
        emptyText: 'No bookings',
        itemBuilder: (_, item, reload) => Text('$item'),
      ),
      bottomNavigationBar: TextButton(onPressed: () => navigated = true, child: const Text('Profile')),
    )));
    expect(find.byType(ContentSkeleton), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    await tester.tap(find.text('Profile'));
    expect(navigated, isTrue);
    pending.complete(['Booking one']);
    await tester.pumpAndSettle();
    expect(find.byType(ContentSkeleton), findsNothing);
    expect(find.text('Booking one'), findsOneWidget);
  });

  testWidgets('refresh retains records on failure and retries without duplicate requests', (tester) async {
    final requests = <Completer<List<dynamic>>>[];
    late VoidCallback reload;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ResourceList(
      load: () {
        final request = Completer<List<dynamic>>();
        requests.add(request);
        return request.future;
      },
      emptyText: 'No bookings',
      itemBuilder: (_, item, refresh) {
        reload = refresh;
        return Text('$item');
      },
    ))));
    requests.first.complete(['Existing booking']);
    await tester.pumpAndSettle();
    reload();
    reload();
    await tester.pump();
    expect(requests.length, 2);
    expect(find.text('Existing booking'), findsOneWidget);
    expect(find.byType(ContentSkeleton), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    requests.last.completeError(Exception('offline'));
    await tester.pumpAndSettle();
    expect(find.text('Existing booking'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    await tester.tap(find.text('Try again'));
    await tester.pump();
    requests.last.complete(['Updated booking']);
    await tester.pumpAndSettle();
    expect(find.text('Existing booking'), findsNothing);
    expect(find.text('Updated booking'), findsOneWidget);
  });

  testWidgets('synchronous errors can retry and disposal ignores late results', (tester) async {
    var calls = 0;
    final pending = Completer<List<dynamic>>();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ResourceList(
      load: () {
        calls++;
        if (calls == 1) {
          throw Exception('offline');
        }
        return pending.future;
      },
      emptyText: 'No items',
      itemBuilder: (_, item, reload) => Text('$item'),
    ))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Try again'));
    await tester.pump();
    expect(calls, 2);
    await tester.pumpWidget(const SizedBox());
    pending.complete(['Late result']);
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty results are real empty states rather than placeholders', (tester) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ResourceList(
      load: () async => [],
      emptyText: 'No bookings yet',
      itemBuilder: (_, item, reload) => Text('$item'),
    ))));
    await tester.pumpAndSettle();
    expect(find.text('No bookings yet'), findsOneWidget);
    expect(find.byType(ContentSkeleton), findsNothing);
  });

  testWidgets('skeleton adapts to dark mode large text and narrow screens', (tester) async {
    tester.view.physicalSize = const Size(280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(theme: ThemeData.dark(), home: MediaQuery(
      data: const MediaQueryData(textScaler: TextScaler.linear(2), disableAnimations: true),
      child: const Scaffold(body: SingleChildScrollView(child: ContentSkeleton(cards: true))),
    )));
    // Let initial Material layout settle before checking for ongoing animation.
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(tester.binding.hasScheduledFrame, isFalse);
  });
}

class _WaitingCatalogueApi extends FakeApi {
  final pending = Completer<List<PilotService>>();
  @override
  Future<List<PilotService>> servicesForLocation(String state, String city) => pending.future;
}

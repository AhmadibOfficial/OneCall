import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onecall/core/models.dart';
import 'package:onecall/ui/home_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_client_test.dart' show MemoryStore, client, jsonResponse;
import 'widget_test.dart' show FakeApi, service;

const catalogue = {
  'services': [
    {'key': 'tailoring', 'name': 'Tailoring', 'description': 'Clothing repairs', 'icon': 'tailoring'},
  ],
};

void main() {
  test('simultaneous catalogue requests share a network read but later refresh is fresh', () async {
    final gate = Completer<void>();
    var count = 0;
    final api = client(MemoryStore(), (_) async {
      count++;
      if (count == 1) {
        await gate.future;
      }
      return jsonResponse(catalogue);
    });
    addTearDown(api.dispose);
    final a = api.servicesForLocation('Kaduna', 'Kaduna');
    final b = api.servicesForLocation('Kaduna', 'Kaduna');
    await Future<void>.delayed(Duration.zero);
    expect(count, 1);
    gate.complete();
    final results = await Future.wait([a, b]);
    expect(results[0].single.name, 'Tailoring');
    expect(results[1].single.name, 'Tailoring');
    expect(() => results[0].clear(), throwsUnsupportedError);
    await api.servicesForLocation('Kaduna', 'Kaduna');
    expect(count, 2);
  });

  test('different locations do not share catalogue results', () async {
    final paths = <String>[];
    final api = client(MemoryStore(), (options) async {
      paths.add(options.path);
      return jsonResponse(catalogue);
    });
    addTearDown(api.dispose);
    await Future.wait([
      api.servicesForLocation('Kaduna', 'Kaduna'),
      api.servicesForLocation('FCT', 'Abuja'),
    ]);
    expect(paths.length, 2);
    expect(paths.any((path) => path.contains('city=Abuja')), isTrue);
    expect(paths.any((path) => path.contains('city=Kaduna')), isTrue);
  });

  test('failed shared requests are cleared so retry can reach the server', () async {
    final gate = Completer<void>();
    var count = 0;
    final api = client(MemoryStore(), (_) async {
      count++;
      if (count == 1) {
        await gate.future;
        return jsonResponse({'message': 'Unavailable'}, 503);
      }
      return jsonResponse(catalogue);
    });
    addTearDown(api.dispose);
    final pending = Future.wait([api.services(), api.services()]);
    final failure = expectLater(pending, throwsA(isA<Exception>()));
    await Future<void>.delayed(Duration.zero);
    expect(count, 1);
    gate.complete();
    await failure;
    expect((await api.services()).single.name, 'Tailoring');
    expect(count, 2);
  });

  testWidgets('favourites begin while the catalogue is still pending', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final api = _ParallelHomeApi();
    await api.login('ahmad@example.com', 'Password123!');
    addTearDown(api.dispose);
    await tester.pumpWidget(MaterialApp(home: HomePage(api: api)));
    await tester.pump();
    await tester.pump();
    expect(api.favouritesStarted, isTrue);
    expect(api.pending.isCompleted, isFalse);
    await tester.pumpWidget(const SizedBox());
    api.pending.complete([service]);
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}

class _ParallelHomeApi extends FakeApi {
  final pending = Completer<List<PilotService>>();
  bool favouritesStarted = false;
  @override
  Future<List<PilotService>> servicesForLocation(String state, String city) => pending.future;
  @override
  Future<dynamic> request(String method, String path, {
    Map<String, dynamic>? body,
    bool authenticated = true,
  }) async {
    if (path == '/favorites') {
      favouritesStarted = true;
      return [];
    }
    return super.request(method, path, body: body, authenticated: authenticated);
  }
}

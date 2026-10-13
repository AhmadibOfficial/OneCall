import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onecall/core/api.dart';
import 'package:onecall/core/models.dart';

const profile = <String, dynamic>{
  'id': 'user-a',
  'uid': '1234567890',
  'email': 'ahmad@example.com',
  'firstName': 'Ahmad',
  'lastName': 'Pilot',
  'phone': '+2348012345678',
  'status': 'ACTIVE',
  'emailVerified': true,
  'phoneVerified': true,
};

class MemoryStore implements SessionStore {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String next) async {
    value = next;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

class UnavailableStore implements SessionStore {
  @override
  Future<String?> read() async => throw StateError('Secure store unavailable');
  @override
  Future<void> write(String value) async =>
      throw StateError('Secure store unavailable');
  @override
  Future<void> clear() async => throw StateError('Secure store unavailable');
}

class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this.respond);
  final Future<ResponseBody> Function(RequestOptions) respond;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) => respond(options);
  @override
  void close({bool force = false}) {}
}

ResponseBody jsonResponse(Object body, [int status = 200]) =>
    ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
MemoryStore savedSession() => MemoryStore()
  ..value = jsonEncode({
    'accessToken': 'old-access',
    'refreshToken': 'old-refresh',
    'user': profile,
  });
OneCallClient client(
  MemoryStore store,
  Future<ResponseBody> Function(RequestOptions) respond,
) {
  final dio = Dio()..httpClientAdapter = FakeAdapter(respond);
  return OneCallClient(
    baseUrl: 'https://api.example.com/api/v1',
    store: store,
    dio: dio,
  );
}

void main() {
  test(
    'unavailable secure storage starts signed out without an unhandled failure',
    () async {
      var requests = 0;
      final client = OneCallClient(
        baseUrl: 'https://onecall.example/api/v1',
        store: UnavailableStore(),
        dio: Dio()
          ..httpClientAdapter = FakeAdapter((options) async {
            requests++;
            return ResponseBody.fromString('{}', 500);
          }),
      );
      addTearDown(client.dispose);
      await client.restore();
      expect(client.user, isNull);
      expect(client.restoring, isFalse);
      expect(requests, 0);
    },
  );

  test(
    'nationwide ride requests send route and location without a client price',
    () async {
      Map<String, dynamic>? sent;
      final api = client(savedSession(), (options) async {
        if (options.path == '/users/me') {
          return jsonResponse({'user': profile});
        }
        if (options.path == '/orders') {
          sent = Map<String, dynamic>.from(options.data as Map);
          expect(options.headers['Authorization'], 'Bearer old-access');
          return jsonResponse({
            'id': 'ride-id',
            'serviceName': 'Ride Booking',
            'status': 'PENDING',
            'createdAt': '2026-10-11T12:00:00Z',
            'state': sent!['state'],
            'city': sent!['city'],
            'pickupAddress': sent!['pickupAddress'],
            'destinationAddress': sent!['destinationAddress'],
          }, 201);
        }
        throw StateError('Unexpected request');
      });
      addTearDown(api.dispose);
      await api.restore();
      final order = await api.book(
        const PilotService(
          key: 'ride',
          name: 'Ride Booking',
          description: 'Local ride',
          icon: 'ride',
          kind: 'ride',
        ),
        'Pickup',
        'One passenger',
        state: 'Lagos',
        city: 'Ikeja',
        pickupAddress: 'Ikeja pickup',
        destinationAddress: 'Lekki destination',
        vehicleType: 'economy',
      );
      expect(sent, containsPair('state', 'Lagos'));
      expect(sent, containsPair('city', 'Ikeja'));
      expect(sent, containsPair('pickupAddress', 'Ikeja pickup'));
      expect(sent!.containsKey('amount'), isFalse);
      expect(order.state, 'Lagos');
    },
  );
  test(
    'state and city query values are encoded in the public catalogue request',
    () async {
      Uri? requested;
      final api = client(MemoryStore(), (options) async {
        requested = options.uri;
        expect(options.headers.containsKey('Authorization'), isFalse);
        return jsonResponse({'services': <dynamic>[]});
      });
      addTearDown(api.dispose);
      await api.servicesForLocation('Akwa Ibom', 'Uyo & area');
      expect(requested!.queryParameters, {
        'state': 'Akwa Ibom',
        'city': 'Uyo & area',
      });
    },
  );
  for (final status in <int?>[null, 503]) {
    test(
      'refresh outage ($status) retains the session for a later retry',
      () async {
        final store = savedSession();
        final saved = store.value;
        var refreshCalls = 0;
        final api = client(store, (options) async {
          if (options.path == '/users/me') {
            return jsonResponse({'user': profile});
          }
          if (options.path == '/auth/refresh') {
            if (++refreshCalls == 1) {
              if (status == null) {
                throw DioException(
                  requestOptions: options,
                  type: DioExceptionType.connectionError,
                );
              }
              return jsonResponse({'message': 'Unavailable'}, status);
            }
            return jsonResponse({
              'accessToken': 'new-access',
              'refreshToken': 'new-refresh',
              'user': profile,
            });
          }
          return options.headers['Authorization'] == 'Bearer new-access'
              ? jsonResponse(<Object>[])
              : jsonResponse({'message': 'Unauthorized'}, 401);
        });
        addTearDown(api.dispose);
        await api.restore();
        final persisted = store.value;
        expect(
          jsonDecode(persisted!)['refreshToken'],
          jsonDecode(saved!)['refreshToken'],
        );
        await expectLater(api.orders(), throwsA(isA<ApiFailure>()));
        expect(api.user!.id, 'user-a');
        expect(store.value, persisted);
        expect(await api.orders(), isEmpty);
        expect(refreshCalls, 2);
        expect(jsonDecode(store.value!)['refreshToken'], 'new-refresh');
      },
    );
  }

  test(
    'a pending refresh from an old account cannot block a new account refresh',
    () async {
      final store = savedSession();
      final oldStarted = Completer<void>(), releaseOld = Completer<void>();
      final nextProfile = {
        ...profile,
        'id': 'user-b',
        'uid': '9876543210',
        'email': 'next@example.com',
      };
      var nextRefreshCalls = 0;
      final api = client(store, (options) async {
        if (options.path == '/auth/refresh') {
          final refresh = (options.data as Map)['refreshToken'];
          if (refresh == 'old-refresh') {
            oldStarted.complete();
            await releaseOld.future;
            return jsonResponse({
              'accessToken': 'obsolete-access',
              'refreshToken': 'obsolete-refresh',
              'user': profile,
            });
          }
          nextRefreshCalls++;
          return jsonResponse({
            'accessToken': 'rotated-next-access',
            'refreshToken': 'rotated-next-refresh',
            'user': nextProfile,
          });
        }
        if (options.path == '/auth/login') {
          return jsonResponse({
            'accessToken': 'next-access',
            'refreshToken': 'next-refresh',
            'user': nextProfile,
          });
        }
        if (options.path == '/auth/logout') {
          return jsonResponse({'loggedOut': true});
        }
        if (options.path == '/users/me') {
          return jsonResponse({
            'user': options.headers['Authorization'] == 'Bearer old-access'
                ? profile
                : nextProfile,
          });
        }
        return options.headers['Authorization'] == 'Bearer rotated-next-access'
            ? jsonResponse(<Object>[])
            : jsonResponse({'message': 'Unauthorized'}, 401);
      });
      addTearDown(api.dispose);
      await api.restore();
      final oldRequest = api.orders();
      final oldRejected = expectLater(oldRequest, throwsA(isA<ApiFailure>()));
      await oldStarted.future;
      try {
        await api.logout();
        await api.login('next@example.com', 'Password123!');
        expect(await api.orders().timeout(const Duration(seconds: 2)), isEmpty);
        expect(nextRefreshCalls, 1);
      } finally {
        releaseOld.complete();
      }
      await oldRejected;
      expect(api.user!.id, 'user-b');
      expect(jsonDecode(store.value!)['refreshToken'], 'rotated-next-refresh');
    },
  );

  test(
    'simultaneous 401 responses share one refresh and retain the API prefix',
    () async {
      final store = savedSession();
      final bothOldRequests = Completer<void>(),
          refreshStarted = Completer<void>(),
          releaseRefresh = Completer<void>();
      var oldRequests = 0, refreshCalls = 0, newRequests = 0;
      final api = client(store, (options) async {
        expect(options.uri.path, startsWith('/api/v1/'));
        if (options.path == '/users/me') {
          return jsonResponse({'user': profile});
        }
        if (options.path == '/auth/refresh') {
          refreshCalls++;
          expect(options.data, {'refreshToken': 'old-refresh'});
          refreshStarted.complete();
          await releaseRefresh.future;
          return jsonResponse({
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
            'user': profile,
          }, 201);
        }
        if (options.path == '/orders' &&
            options.headers['Authorization'] == 'Bearer old-access') {
          if (++oldRequests == 2) {
            bothOldRequests.complete();
          }
          return jsonResponse({'message': 'Unauthorized'}, 401);
        }
        expect(options.headers['Authorization'], 'Bearer new-access');
        newRequests++;
        return jsonResponse(<Object>[]);
      });
      addTearDown(api.dispose);
      await api.restore();
      final requests = Future.wait([api.orders(), api.orders()]);
      await Future.wait([refreshStarted.future, bothOldRequests.future]);
      releaseRefresh.complete();
      expect(await requests, [isEmpty, isEmpty]);
      expect(refreshCalls, 1);
      expect(newRequests, 2);
      expect(jsonDecode(store.value!)['refreshToken'], 'new-refresh');
    },
  );

  test(
    'a rejected refresh clears credentials and asks the user to sign in',
    () async {
      final store = savedSession();
      final api = client(
        store,
        (options) async => options.path == '/users/me'
            ? jsonResponse({'user': profile})
            : jsonResponse({'message': 'Invalid refresh token'}, 401),
      );
      addTearDown(api.dispose);
      await api.restore();
      await expectLater(
        api.orders(),
        throwsA(isA<ApiFailure>().having((e) => e.status, 'status', 401)),
      );
      expect(api.user, isNull);
      expect(store.value, isNull);
    },
  );

  test('a delayed request cannot retry under a different account', () async {
    final store = savedSession();
    final arrived = Completer<void>(), delayed = Completer<ResponseBody>();
    var orderCalls = 0, refreshCalls = 0;
    final nextProfile = {
      ...profile,
      'id': 'user-b',
      'uid': '9876543210',
      'email': 'next@example.com',
    };
    final api = client(store, (options) async {
      if (options.path == '/orders/old-order') {
        orderCalls++;
        arrived.complete();
        return delayed.future;
      }
      if (options.path == '/auth/refresh') {
        refreshCalls++;
        return jsonResponse({}, 401);
      }
      if (options.path == '/auth/logout') {
        return jsonResponse({'loggedOut': true}, 201);
      }
      if (options.path == '/auth/login') {
        return jsonResponse({
          'accessToken': 'next-access',
          'refreshToken': 'next-refresh',
          'user': nextProfile,
        }, 201);
      }
      return jsonResponse({
        'user': options.headers['Authorization'] == 'Bearer next-access'
            ? nextProfile
            : profile,
      });
    });
    addTearDown(api.dispose);
    await api.restore();
    final old = api.order('old-order');
    final rejected = expectLater(
      old,
      throwsA(isA<ApiFailure>().having((e) => e.status, 'status', 401)),
    );
    await arrived.future;
    await api.logout();
    await api.login('next@example.com', 'Password123!');
    delayed.complete(jsonResponse({'message': 'Unauthorized'}, 401));
    await rejected;
    expect(orderCalls, 1);
    expect(refreshCalls, 0);
    expect(api.user!.id, 'user-b');
    expect(jsonDecode(store.value!)['refreshToken'], 'next-refresh');
  });

  test('service creation sends only the agreed customer fields', () async {
    final store = savedSession();
    final api = client(store, (options) async {
      if (options.path == '/users/me') {
        return jsonResponse({'user': profile});
      }
      expect(options.method, 'POST');
      expect(options.path, '/orders');
      expect(options.data, {
        'serviceName': 'Tailoring',
        'address': 'Unguwan Rimi, Kaduna',
        'description': 'Alter a kaftan',
      });
      return jsonResponse({
        'id': 'order-1',
        'serviceName': 'Tailoring',
        'status': 'PENDING',
        'city': 'Kaduna',
        'createdAt': '2026-10-09T12:00:00.000Z',
        'amount': null,
        'providerAssigned': false,
      }, 201);
    });
    addTearDown(api.dispose);
    await api.restore();
    final servicesApi = client(
      MemoryStore(),
      (_) async => jsonResponse({
        'city': 'Kaduna',
        'services': [
          {
            'key': 'tailoring',
            'name': 'Tailoring',
            'description': 'Alterations',
            'icon': 'tailoring',
          },
        ],
      }),
    );
    addTearDown(servicesApi.dispose);
    final service = (await servicesApi.services()).single;
    final order = await api.createOrder(
      service,
      ' Unguwan Rimi, Kaduna ',
      ' Alter a kaftan ',
    );
    expect(order.city, 'Kaduna');
    expect(order.status, 'PENDING');
    expect(order.amount, isNull);
  });
}

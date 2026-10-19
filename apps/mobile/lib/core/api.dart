import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'models.dart';

class ApiFailure implements Exception {
  const ApiFailure(this.message, {this.status});
  final String message;
  final int? status;
  @override
  String toString() => message;
}

abstract interface class SessionStore {
  Future<String?> read();
  Future<void> write(String value);
  Future<void> clear();
}

class SecureSessionStore implements SessionStore {
  const SecureSessionStore();
  static const _storage = FlutterSecureStorage();
  static const _key = 'onecall.kaduna.session.v1';
  @override
  Future<String?> read() => _storage.read(key: _key);
  @override
  Future<void> write(String value) => _storage.write(key: _key, value: value);
  @override
  Future<void> clear() => _storage.delete(key: _key);
}

abstract class OneCallApi extends ChangeNotifier {
  PilotUser? get user;
  bool get restoring;
  Future<void> restore();
  Future<void> login(String email, String password);
  Future<void> register({
    required String firstName,
    required String lastName,
    required String email,
    required String phone,
    required String password,
  });
  Future<void> acceptSocialSession(Map<String, dynamic> response) async =>
      throw const ApiFailure('Social sign-in is not available in this client.');
  Future<void> uploadBookingPhoto(String orderId, List<int> bytes) async =>
      throw const ApiFailure('Photo upload is unavailable.');
  Future<List<int>> bookingPhotoBytes(String orderId, String photoId) async =>
      throw const ApiFailure('Photo is unavailable.');
  Future<void> clearAfterRevocation() => logout();
  Future<void> logout();
  Future<PilotUser> reloadUser();
  Future<List<PilotService>> services();
  Future<List<ServiceOrder>> orders();
  Future<ServiceOrder> createOrder(
    PilotService service,
    String address,
    String description,
  );
  Future<ServiceOrder> order(String id);
  Future<ServiceOrder> cancelOrder(String id);
  Future<Map<String, dynamic>> requestVerification(bool phone);
  Future<void> confirmVerification(
    bool phone,
    String value, {
    String? selector,
  });
  Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool authenticated = true,
  }) async =>
      throw const ApiFailure('This action is unavailable. Please try again.');
  Future<List<PilotService>> servicesForLocation(String state, String city) =>
      services();
  Future<ServiceOrder> book(
    PilotService service,
    String address,
    String description, {
    required String state,
    required String city,
    String? pickupAddress,
    String? destinationAddress,
    DateTime? scheduledAt,
    String? vehicleType,
  }) => createOrder(service, address, description);
}

class OneCallClient extends OneCallApi {
  OneCallClient({required String baseUrl, SessionStore? store, Dio? dio})
    : _store = store ?? const SecureSessionStore(),
      _dio = dio ?? Dio() {
    final uri = Uri.parse(baseUrl);
    if (!['http', 'https'].contains(uri.scheme) ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (!kDebugMode && uri.scheme != 'https')) {
      throw ArgumentError(
        'Configure a valid HTTPS OneCall API URL. HTTP is available only in debug builds.',
      );
    }
    _dio.options = BaseOptions(
      baseUrl: baseUrl.replaceAll(RegExp(r'/+$'), ''),
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(seconds: 15),
      followRedirects: false,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    );
  }
  final Dio _dio;
  final SessionStore _store;
  PilotUser? _user;
  String? _accessToken, _refreshToken;
  Future<void>? _rotation;
  Future<void> _storageQueue = Future<void>.value();
  int _generation = 0;
  bool _restoring = true;
  @override
  PilotUser? get user => _user;
  @override
  bool get restoring => _restoring;

  Map<String, dynamic> _object(dynamic value) =>
      Map<String, dynamic>.from(value as Map);
  ApiFailure _failure(DioException error) {
    final status = error.response?.statusCode;
    if (status == 429) {
      return const ApiFailure(
        'Too many attempts. Please wait before trying again.',
        status: 429,
      );
    }
    if (error.response?.data is Map) {
      final value = (error.response!.data as Map)['message'];
      if (value is String) {
        return ApiFailure(value, status: status);
      }
      if (value is List) {
        return ApiFailure(value.join('\n'), status: status);
      }
    }
    return ApiFailure(
      status == null
          ? 'Cannot reach OneCall. Check your connection and try again.'
          : 'OneCall could not complete this request. Please try again.',
      status: status,
    );
  }

  Future<void> _persist(int generation) {
    final snapshot = _user == null
        ? null
        : jsonEncode({
            'accessToken': _accessToken,
            'refreshToken': _refreshToken,
            'user': _user!.toJson(),
          });
    final operation = _storageQueue.catchError((Object _) {}).then((_) async {
      if (generation != _generation) {
        return;
      }
      if (snapshot == null) {
        await _store.clear();
      } else {
        await _store.write(snapshot);
      }
    });
    _storageQueue = operation;
    return operation;
  }

  Future<void> _clear() async {
    _generation++;
    _rotation = null;
    _accessToken = null;
    _refreshToken = null;
    _user = null;
    notifyListeners();
    await _persist(_generation);
  }

  Future<dynamic> _send(
    String method,
    String path, {
    Object? body,
    Object? Function()? bodyFactory,
    ResponseType? responseType,
    bool authenticated = true,
  }) async {
    final generation = _generation;
    final token = _accessToken;
    if (authenticated && token == null) {
      throw const ApiFailure('Please sign in again.', status: 401);
    }
    try {
      final response = await _dio.request(
        path,
        data: bodyFactory?.call() ?? body,
        options: Options(
          method: method,
          responseType: responseType,
          contentType: bodyFactory == null
              ? null
              : Headers.multipartFormDataContentType,
          headers: authenticated ? {'Authorization': 'Bearer $token'} : null,
        ),
      );
      if (authenticated) {
        _assertSession(generation);
      }
      return response.data;
    } on DioException catch (error) {
      if (authenticated) {
        _assertSession(generation);
      }
      if (authenticated &&
          error.response?.statusCode == 401 &&
          _refreshToken != null) {
        // Another request may already have rotated the access token.
        if (_accessToken == token) {
          await _rotate();
        }
        _assertSession(generation);
        if (_accessToken == null) {
          throw const ApiFailure(
            'Your session ended. Please sign in again.',
            status: 401,
          );
        }
        try {
          final response = await _dio.request(
            path,
            data: bodyFactory?.call() ?? body,
            options: Options(
              method: method,
              responseType: responseType,
              contentType: bodyFactory == null
                  ? null
                  : Headers.multipartFormDataContentType,
              headers: {'Authorization': 'Bearer $_accessToken'},
            ),
          );
          _assertSession(generation);
          return response.data;
        } on DioException catch (retryError) {
          _assertSession(generation);
          if (retryError.response?.statusCode == 401) {
            await _clear();
          }
          throw _failure(retryError);
        }
      }
      if (authenticated && error.response?.statusCode == 401) {
        await _clear();
      }
      throw _failure(error);
    }
  }

  void _assertSession(int generation) {
    if (generation != _generation) {
      throw const ApiFailure(
        'Your session ended. Please sign in again.',
        status: 401,
      );
    }
  }

  Future<void> _rotate() {
    if (_rotation != null) {
      return _rotation!;
    }
    final generation = _generation;
    final refreshToken = _refreshToken;
    final operation = () async {
      try {
        final response = await _dio.post(
          '/auth/refresh',
          data: {'refreshToken': refreshToken},
        );
        if (generation != _generation) {
          throw const ApiFailure(
            'Your session ended. Please sign in again.',
            status: 401,
          );
        }
        final data = _object(response.data);
        _accessToken = data['accessToken'] as String;
        _refreshToken = data['refreshToken'] as String;
        if (data['user'] is Map) {
          _user = PilotUser.fromJson({
            ...?_user?.toJson(),
            ..._object(data['user']),
          });
        }
        await _persist(generation);
      } catch (error) {
        // A temporary outage does not revoke the saved refresh credential.
        // Clear a rejected credential or malformed response, and retry outages later.
        if (generation == _generation &&
            (error is! DioException ||
                error.response?.statusCode == 401 ||
                error.response?.statusCode == 403)) {
          await _clear();
        }
        if (error is DioException) {
          throw _failure(error);
        }
        rethrow;
      }
    }();
    _rotation = operation;
    return operation.whenComplete(() {
      if (identical(_rotation, operation)) {
        _rotation = null;
      }
    });
  }

  @override
  Future<void> restore() async {
    try {
      final saved = await _store.read();
      if (saved != null) {
        final value = _object(jsonDecode(saved));
        _accessToken = value['accessToken'] as String;
        _refreshToken = value['refreshToken'] as String;
        _user = PilotUser.fromJson(_object(value['user']));
        await reloadUser();
      }
    } on ApiFailure catch (error) {
      // Keep an offline session for a later retry; the server authorizes every operation.
      if (error.status == 401) {
        await _clear();
      }
    } catch (_) {
      try {
        await _clear();
      } catch (_) {
        // Local credentials were cleared before persistence. A locked or
        // unavailable secure store must not crash signed-out startup.
      }
    } finally {
      _restoring = false;
      notifyListeners();
    }
  }

  @override
  Future<void> login(String email, String password) async {
    final response = _object(
      await _send(
        'POST',
        '/auth/login',
        authenticated: false,
        body: {'email': email.trim().toLowerCase(), 'password': password},
      ),
    );
    final generation = ++_generation;
    _rotation = null;
    _accessToken = response['accessToken'] as String;
    _refreshToken = response['refreshToken'] as String;
    _user = PilotUser.fromJson(_object(response['user']));
    try {
      await reloadUser();
      await _persist(generation);
    } catch (_) {
      await _clear();
      rethrow;
    }
    notifyListeners();
  }

  @override
  Future<void> acceptSocialSession(Map<String, dynamic> response) async {
    if (response['authenticated'] != true ||
        response['accessToken'] is! String ||
        response['refreshToken'] is! String ||
        response['user'] is! Map) {
      throw const ApiFailure('Sign-in did not complete. Try again.');
    }
    final generation = ++_generation;
    _rotation = null;
    _accessToken = response['accessToken'] as String;
    _refreshToken = response['refreshToken'] as String;
    _user = PilotUser.fromJson(_object(response['user']));
    try {
      await reloadUser();
      await _persist(generation);
    } catch (_) {
      await _clear();
      rethrow;
    }
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
    await _send(
      'POST',
      '/auth/register',
      authenticated: false,
      body: {
        'firstName': firstName.trim(),
        'lastName': lastName.trim(),
        'email': email.trim().toLowerCase(),
        'phone': phone.trim(),
        'password': password,
      },
    );
    await login(email, password);
  }

  @override
  Future<void> uploadBookingPhoto(String orderId, List<int> bytes) async {
    if (bytes.isEmpty || bytes.length > 5 * 1024 * 1024) {
      throw const ApiFailure('Choose a photo smaller than 5 MB.');
    }
    await _send(
      'POST',
      '/orders/$orderId/photos',
      bodyFactory: () => FormData.fromMap({
        'file': MultipartFile.fromBytes(bytes, filename: 'booking-photo.jpg'),
      }),
    );
  }

  @override
  Future<List<int>> bookingPhotoBytes(String orderId, String photoId) async =>
      List<int>.from(
        await _send(
              'GET',
              '/orders/$orderId/photos/$photoId',
              responseType: ResponseType.bytes,
            )
            as List,
      );

  @override
  Future<void> clearAfterRevocation() => _clear();

  @override
  Future<void> logout() async {
    try {
      await _send('POST', '/auth/logout', body: <String, dynamic>{});
    } finally {
      await _clear();
    }
  }

  @override
  Future<PilotUser> reloadUser() async {
    final generation = _generation;
    final response = _object(await _send('GET', '/users/me'));
    if (generation != _generation) {
      throw const ApiFailure(
        'Your session ended. Please sign in again.',
        status: 401,
      );
    }
    _user = PilotUser.fromJson(_object(response['user']));
    await _persist(generation);
    notifyListeners();
    return _user!;
  }

  @override
  Future<List<PilotService>> services() async {
    final result = _object(
      await _send('GET', '/services', authenticated: false),
    );
    return (result['services'] as List)
        .map((j) => PilotService.fromJson(_object(j)))
        .toList();
  }

  @override
  Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool authenticated = true,
  }) => _send(method, path, body: body, authenticated: authenticated);
  @override
  Future<List<PilotService>> servicesForLocation(
    String state,
    String city,
  ) async {
    final data = _object(
      await _send(
        'GET',
        '/services?state=${Uri.encodeQueryComponent(state)}&city=${Uri.encodeQueryComponent(city)}',
        authenticated: false,
      ),
    );
    return (data['services'] as List)
        .map((value) => PilotService.fromJson(_object(value)))
        .toList();
  }

  @override
  Future<ServiceOrder> book(
    PilotService service,
    String address,
    String description, {
    required String state,
    required String city,
    String? pickupAddress,
    String? destinationAddress,
    DateTime? scheduledAt,
    String? vehicleType,
  }) async => ServiceOrder.fromJson(
    _object(
      await _send(
        'POST',
        '/orders',
        body: {
          'serviceName': service.name,
          'state': state,
          'city': city.trim(),
          'address': address.trim(),
          'description': description.trim(),
          if (pickupAddress != null) 'pickupAddress': pickupAddress.trim(),
          if (destinationAddress != null)
            'destinationAddress': destinationAddress.trim(),
          if (scheduledAt != null)
            'scheduledAt': scheduledAt.toUtc().toIso8601String(),
          'vehicleType': ?vehicleType,
        },
      ),
    ),
  );

  @override
  Future<List<ServiceOrder>> orders() async =>
      (await _send('GET', '/orders') as List)
          .map((j) => ServiceOrder.fromJson(_object(j)))
          .toList();
  @override
  Future<ServiceOrder> createOrder(
    PilotService service,
    String address,
    String description,
  ) async => ServiceOrder.fromJson(
    _object(
      await _send(
        'POST',
        '/orders',
        body: {
          'serviceName': service.name,
          'address': address.trim(),
          'description': description.trim(),
        },
      ),
    ),
  );
  @override
  Future<ServiceOrder> order(String id) async => ServiceOrder.fromJson(
    _object(await _send('GET', '/orders/${Uri.encodeComponent(id)}')),
  );
  @override
  Future<ServiceOrder> cancelOrder(String id) async => ServiceOrder.fromJson(
    _object(
      await _send(
        'POST',
        '/orders/${Uri.encodeComponent(id)}/cancel',
        body: <String, dynamic>{},
      ),
    ),
  );
  @override
  Future<Map<String, dynamic>> requestVerification(bool phone) async => _object(
    await _send(
      'POST',
      '/auth/${phone ? 'phone' : 'email'}-verification/request',
      body: <String, dynamic>{},
    ),
  );
  @override
  Future<void> confirmVerification(
    bool phone,
    String value, {
    String? selector,
  }) async {
    await _send(
      'POST',
      '/auth/${phone ? 'phone' : 'email'}-verification/confirm',
      authenticated: false,
      body: phone
          ? {'selector': selector, 'verificationCode': value.trim()}
          : {'verificationToken': value.trim()},
    );
    await reloadUser();
  }

  @override
  void dispose() {
    _dio.close(force: true);
    super.dispose();
  }
}

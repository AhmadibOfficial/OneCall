// Development-only visual preview. All accounts, bookings and counts are samples.
// Run: flutter run -d chrome -t tool/ui_preview.dart
// Add ?signedOut=1 to preview welcome and authentication screens.
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:onecall/core/api.dart';
import 'package:onecall/core/models.dart';
import 'package:onecall/main.dart';

void main() {
  if (!kDebugMode) throw StateError('The sample-data preview is debug-only.');
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    Directionality(
      textDirection: TextDirection.ltr,
      child: Banner(
        message: 'SAMPLE DATA',
        location: BannerLocation.topEnd,
        child: OneCallApp(
          api: _PreviewApi(
            signedOut: Uri.base.queryParameters['signedOut'] == '1',
          ),
        ),
      ),
    ),
  );
}

const _services = [
  PilotService(
    key: 'plumbing',
    name: 'Plumbing',
    icon: 'plumbing',
    availableProviders: 4,
    description: 'Help with leaks, taps and household pipe repairs.',
  ),
  PilotService(
    key: 'cleaning',
    name: 'Home cleaning',
    icon: 'cleaning',
    availableProviders: 3,
    description: 'A helping hand to keep your space clean and comfortable.',
  ),
  PilotService(
    key: 'electrical',
    name: 'Electrical repairs',
    icon: 'electrical',
    availableProviders: 2,
    description: 'Help with lights, sockets and electrical faults.',
  ),
  PilotService(
    key: 'tailoring',
    name: 'Tailoring',
    icon: 'tailoring',
    availableProviders: 5,
    description: 'Clothing alterations and repairs for a better fit.',
  ),
  PilotService(
    key: 'delivery',
    name: 'Parcel delivery',
    icon: 'delivery',
    kind: 'delivery',
    availableProviders: 2,
    description: 'Get a parcel from one address to another.',
  ),
  PilotService(
    key: 'laundry',
    name: 'Laundry',
    icon: 'laundry',
    availableProviders: 3,
    description: 'Make light work of laundry day.',
  ),
  PilotService(
    key: 'mechanic',
    name: 'Car repairs',
    icon: 'mechanic',
    availableProviders: 1,
    description: 'Find help for vehicle maintenance and repairs.',
  ),
  PilotService(
    key: 'solar',
    name: 'Solar & inverter',
    icon: 'solar',
    description: 'Installation and maintenance help for your power system.',
  ),
  PilotService(
    key: 'beauty',
    name: 'Beauty & grooming',
    icon: 'beauty',
    availableProviders: 2,
    description: 'Personal care from local service providers.',
  ),
];

class _PreviewApi extends OneCallApi {
  _PreviewApi({required bool signedOut})
    : _user = signedOut ? null : _sampleUser;
  static const _sampleUser = PilotUser(
    id: 'preview-user',
    uid: '0000000000',
    email: 'preview@example.invalid',
    firstName: 'Demo',
    lastName: 'Account',
    phone: '',
    status: 'ACTIVE',
    emailVerified: true,
    phoneVerified: true,
  );
  PilotUser? _user;
  final _favorites = <String>{'Tailoring'};
  ServiceOrder _order = ServiceOrder(
    id: 'sample-booking',
    serviceName: 'Plumbing',
    status: 'PENDING',
    createdAt: DateTime(2026, 10, 17),
    address: 'Sample address, Kaduna',
  );
  @override
  PilotUser? get user => _user;
  @override
  bool get restoring => false;
  @override
  Future<void> restore() async {}
  @override
  Future<void> login(String email, String password) async {
    _user = _sampleUser;
    notifyListeners();
  }

  @override
  Future<void> register({
    required String firstName,
    required String lastName,
    required String email,
    required String phone,
    required String password,
  }) => login(email, password);
  @override
  Future<void> logout() async {
    _user = null;
    notifyListeners();
  }

  @override
  Future<PilotUser> reloadUser() async => _sampleUser;
  @override
  Future<List<PilotService>> services() async => _services;
  @override
  Future<List<ServiceOrder>> orders() async => [_order];
  @override
  Future<ServiceOrder> createOrder(
    PilotService service,
    String address,
    String description,
  ) async => _order = ServiceOrder(
    id: 'sample-request',
    serviceName: service.name,
    status: 'PENDING',
    createdAt: DateTime.now(),
    address: address,
    description: description,
  );
  @override
  Future<ServiceOrder> order(String id) async => _order;
  @override
  Future<ServiceOrder> cancelOrder(String id) async => _order = ServiceOrder(
    id: id,
    serviceName: _order.serviceName,
    status: 'CANCELLED',
    createdAt: _order.createdAt,
  );
  @override
  Future<Map<String, dynamic>> requestVerification(bool phone) async => {
    'accepted': true,
  };
  @override
  Future<void> confirmVerification(
    bool phone,
    String value, {
    String? selector,
  }) async {}
  @override
  Future<dynamic> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool authenticated = true,
  }) async {
    if (path == '/auth/social/configuration') {
      return {'google': false, 'apple': false};
    }
    if (path == '/favorites') {
      if (method == 'PUT') _favorites.add(body!['serviceName'] as String);
      if (method == 'DELETE') _favorites.remove(body!['serviceName'] as String);
      return [
        for (final name in _favorites) {'serviceName': name},
      ];
    }
    if (path == '/notifications' ||
        path == '/addresses' ||
        path.endsWith('/photos')) {
      return [];
    }
    throw const ApiFailure(
      'This action is unavailable in the sample-data preview.',
    );
  }
}

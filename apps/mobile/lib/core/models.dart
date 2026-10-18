class PilotUser {
  const PilotUser({
    required this.id,
    required this.uid,
    required this.email,
    this.firstName = '',
    this.lastName = '',
    this.phone = '',
    this.status = 'PENDING',
    this.emailVerified = false,
    this.phoneVerified = false,
    this.avatarUrl,
  });
  final String id, uid, email, firstName, lastName, phone, status;
  final bool emailVerified, phoneVerified;
  final String? avatarUrl;
  bool get canBook => status == 'ACTIVE' && emailVerified && phoneVerified;
  factory PilotUser.fromJson(Map<String, dynamic> j) => PilotUser(
    id: j['id'] as String,
    uid: j['uid'] as String,
    email: j['email'] as String,
    firstName: j['firstName'] as String? ?? '',
    lastName: j['lastName'] as String? ?? '',
    phone: j['phone'] as String? ?? '',
    status: j['status'] as String? ?? 'PENDING',
    emailVerified: j['emailVerified'] == true,
    phoneVerified: j['phoneVerified'] == true,
    avatarUrl: j['avatarUrl'] as String?,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'uid': uid,
    'email': email,
    'firstName': firstName,
    'lastName': lastName,
    'phone': phone,
    'status': status,
    'emailVerified': emailVerified,
    'phoneVerified': phoneVerified,
    'avatarUrl': avatarUrl,
  };
}

class PilotService {
  const PilotService({
    required this.key,
    required this.name,
    required this.description,
    required this.icon,
    this.label,
    this.kind = 'home',
    this.availableProviders = 0,
  });
  final String key, name, description, icon;
  final String? label;
  final String kind;
  final int availableProviders;
  String get shortName => label ?? name;
  bool get needsRoute => kind == 'ride' || kind == 'delivery';
  factory PilotService.fromJson(Map<String, dynamic> j) => PilotService(
    key: j['key'] as String,
    name: j['name'] as String,
    description: j['description'] as String,
    icon: j['icon'] as String,
    label: j['label'] as String?,
    kind: j['kind'] as String? ?? 'home',
    availableProviders: j['availableProviders'] as int? ?? 0,
  );
}

class ServiceOrder {
  const ServiceOrder({
    required this.id,
    required this.serviceName,
    required this.status,
    required this.createdAt,
    this.city = 'Kaduna',
    this.address,
    this.description,
    this.amount,
    this.providerAssigned = false,
    this.state = 'Kaduna',
    this.pickupAddress,
    this.destinationAddress,
    this.scheduledAt,
    this.vehicleType,
    this.quote,
    this.provider,
    this.paymentStatus,
  });
  final String id, serviceName, status, city;
  final String? address, description, amount;
  final DateTime createdAt;
  final bool providerAssigned;
  final String state;
  final String? pickupAddress, destinationAddress, vehicleType, paymentStatus;
  final DateTime? scheduledAt;
  final Map<String, dynamic>? quote, provider;
  bool get canCancel =>
      (status == 'PENDING' || status == 'ACCEPTED') &&
      (paymentStatus == null ||
          paymentStatus == 'FAILED' ||
          paymentStatus == 'REFUNDED');
  bool get isFinished => status == 'COMPLETED' || status == 'CANCELLED';
  String get statusLabel => switch (status) {
    'PENDING' => 'Awaiting a provider',
    'ACCEPTED' => 'Provider accepted',
    'IN_PROGRESS' => 'Work in progress',
    'COMPLETED' => 'Completed',
    'CANCELLED' => 'Cancelled',
    _ => status,
  };
  factory ServiceOrder.fromJson(Map<String, dynamic> j) => ServiceOrder(
    id: j['id'] as String,
    serviceName: j['serviceName'] as String,
    status: j['status'] as String,
    city: j['city'] as String? ?? 'Kaduna',
    address: j['address'] as String?,
    description: j['description'] as String?,
    amount: j['amount']?.toString(),
    providerAssigned: j['providerAssigned'] == true,
    createdAt: DateTime.parse(j['createdAt'] as String),
    state: j['state'] as String? ?? 'Kaduna',
    pickupAddress: j['pickupAddress'] as String?,
    destinationAddress: j['destinationAddress'] as String?,
    scheduledAt: j['scheduledAt'] == null
        ? null
        : DateTime.parse(j['scheduledAt'] as String),
    vehicleType: j['vehicleType'] as String?,
    quote: j['quote'] is Map
        ? Map<String, dynamic>.from(j['quote'] as Map)
        : null,
    provider: j['provider'] is Map
        ? Map<String, dynamic>.from(j['provider'] as Map)
        : null,
    paymentStatus: j['paymentStatus'] as String?,
  );
}

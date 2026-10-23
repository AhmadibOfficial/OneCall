import 'package:flutter_test/flutter_test.dart';
import 'package:onecall/core/models.dart';

void main() {
  PilotUser user(String status, bool emailVerified, bool phoneVerified) =>
      PilotUser(
        id: 'id',
        uid: '1234567890',
        email: 'customer@example.com',
        firstName: 'Test',
        lastName: 'Customer',
        phone: '+2348012345678',
        status: status,
        emailVerified: emailVerified,
        phoneVerified: phoneVerified,
      );
  test(
    'email verification enables booking without claiming a verified phone',
    () {
      final customer = user('ACTIVE', true, false);
      expect(customer.canBook, isTrue);
      expect(customer.phoneVerified, isFalse);
      expect(user('ACTIVE', false, true).canBook, isFalse);
      expect(user('SUSPENDED', true, true).canBook, isFalse);
      expect(user('PENDING', true, false).canBook, isFalse);
    },
  );
}

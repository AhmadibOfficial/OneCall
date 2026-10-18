import 'package:flutter/material.dart';
import '../core/api.dart';

const navy = Color(0xFF031B46);
const teal = Color(0xFF0878FA);

class PageIntro extends StatelessWidget {
  const PageIntro({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
  });
  final IconData icon;
  final String title, message;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 24),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: const Color(0xFFEAF3FF),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Icon(icon, color: teal, size: 28),
        ),
        const SizedBox(height: 16),
        Text(
          title,
          style: const TextStyle(
            fontSize: 25,
            color: navy,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        Text(message, style: const TextStyle(color: Color(0xFF536581))),
      ],
    ),
  );
}

class EmptyNotice extends StatelessWidget {
  const EmptyNotice(
    this.message, {
    super.key,
    this.icon = Icons.inbox_outlined,
  });
  final String message;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: teal, size: 46),
        const SizedBox(height: 18),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Color(0xFF536581), height: 1.5),
        ),
      ],
    ),
  );
}

String errorMessage(Object error) => error is ApiFailure
    ? error.message
    : 'OneCall could not complete this action. Please try again.';

class ErrorNotice extends StatelessWidget {
  const ErrorNotice(this.message, {super.key, this.onRetry});
  final String message;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.symmetric(vertical: 12),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.errorContainer,
      borderRadius: BorderRadius.circular(12),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.info_outline,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onErrorContainer,
                ),
              ),
            ),
          ],
        ),
        if (onRetry != null)
          TextButton(onPressed: onRetry, child: const Text('Try again')),
      ],
    ),
  );
}

class BusyButton extends StatelessWidget {
  const BusyButton({
    super.key,
    required this.label,
    required this.busy,
    required this.onPressed,
  });
  final String label;
  final bool busy;
  final VoidCallback? onPressed;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: double.infinity,
    child: FilledButton(
      onPressed: busy ? null : onPressed,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: busy
            ? SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                  semanticsLabel: '$label in progress',
                ),
              )
            : Text(label),
      ),
    ),
  );
}

IconData serviceIcon(String value) => switch (value) {
  'tailoring' => Icons.checkroom,
  'mechanic' => Icons.car_repair,
  'shoe' => Icons.build_circle_outlined,
  'shopping' => Icons.shopping_basket_outlined,
  'food' => Icons.restaurant,
  'solar' => Icons.solar_power_outlined,
  'carpentry' => Icons.handyman_outlined,
  'painting' => Icons.format_paint_outlined,
  'more' => Icons.more_horiz,
  'ride' => Icons.local_taxi,
  'delivery' => Icons.local_shipping,
  'laundry' => Icons.local_laundry_service,
  'cleaning' => Icons.cleaning_services,
  'plumbing' => Icons.plumbing,
  'electrical' => Icons.lightbulb,
  'beauty' => Icons.face_retouching_natural,
  'car-wash' => Icons.local_car_wash,
  'tutoring' => Icons.school,
  'pharmacy' => Icons.local_pharmacy,
  _ => Icons.miscellaneous_services,
};

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.status, this.label, {super.key});
  final String status, label;
  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'COMPLETED' => Colors.green.shade800,
      'CANCELLED' => Colors.grey.shade700,
      'IN_PROGRESS' => teal,
      _ => navy,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .08),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontWeight: FontWeight.w600),
      ),
    );
  }
}

import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'common.dart';

class AppLoading extends StatelessWidget {
  const AppLoading({super.key, this.splash = false});
  final bool splash;
  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        OneCallLogo(light: splash, size: splash ? 116 : 52),
        const SizedBox(height: 24),
        SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: splash ? Colors.white : teal,
            semanticsLabel: 'Loading OneCall',
          ),
        ),
        if (splash) ...[
          const SizedBox(height: 28),
          const Text(
            'ONE CALL. EVERY SERVICE.',
            style: TextStyle(
              color: Colors.white70,
              fontSize: 11,
              letterSpacing: 1,
            ),
          ),
        ],
      ],
    ),
  );
}

class OneCallLogo extends StatelessWidget {
  const OneCallLogo({super.key, this.light = false, this.size = 88});
  final bool light;
  final double size;
  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      CustomPaint(size: Size.square(size), painter: _MarkPainter(light)),
      RichText(
        text: TextSpan(
          style: TextStyle(
            fontSize: size * .42,
            fontWeight: FontWeight.w800,
            letterSpacing: -1.8,
          ),
          children: [
            TextSpan(
              text: 'One',
              style: TextStyle(color: light ? Colors.white : navy),
            ),
            const TextSpan(
              text: 'Call',
              style: TextStyle(color: teal, fontStyle: FontStyle.italic),
            ),
          ],
        ),
      ),
    ],
  );
}

class _MarkPainter extends CustomPainter {
  const _MarkPainter(this.light);
  final bool light;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 100, size.height / 100);
    final ring = Paint()
      ..color = light ? Colors.white : navy
      ..style = PaintingStyle.stroke
      ..strokeWidth = 13;
    canvas.drawArc(
      const Rect.fromLTWH(10, 10, 80, 80),
      -.8,
      math.pi * 1.7,
      false,
      ring,
    );
    final accent = Paint()
      ..color = teal
      ..style = PaintingStyle.stroke
      ..strokeWidth = 13;
    canvas.drawArc(
      const Rect.fromLTWH(10, 10, 80, 80),
      -.65,
      1.35,
      false,
      accent,
    );
    final one = Path()
      ..moveTo(47, 30)
      ..lineTo(66, 30)
      ..lineTo(49, 85)
      ..lineTo(34, 80)
      ..lineTo(44, 47)
      ..lineTo(29, 47)
      ..close();
    canvas.drawPath(
      one,
      Paint()
        ..shader = const LinearGradient(
          colors: [Color(0xFF0799FF), Color(0xFF0050C8)],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ).createShader(const Rect.fromLTWH(29, 30, 40, 55)),
    );
  }

  @override
  bool shouldRepaint(covariant _MarkPainter oldDelegate) =>
      oldDelegate.light != light;
}

class WelcomeCity extends StatelessWidget {
  const WelcomeCity({super.key});
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 190,
    width: 300,
    child: Stack(
      alignment: Alignment.bottomCenter,
      children: [
        Positioned(
          bottom: 28,
          left: 22,
          child: _building(38, 82, const Color(0xFFB8D6FF)),
        ),
        Positioned(
          bottom: 28,
          left: 70,
          child: _building(48, 135, const Color(0xFF78B7FF)),
        ),
        Positioned(
          bottom: 28,
          right: 72,
          child: _building(38, 102, const Color(0xFFA3C9FF)),
        ),
        Positioned(
          bottom: 28,
          right: 20,
          child: _building(35, 153, const Color(0xFF378AF2)),
        ),
        Positioned(
          bottom: 32,
          child: Container(
            width: 67,
            height: 118,
            decoration: BoxDecoration(
              color: navy,
              borderRadius: BorderRadius.circular(12),
            ),
            padding: const EdgeInsets.all(5),
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFFDBEDFF),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.location_on, size: 42, color: teal),
            ),
          ),
        ),
        const Positioned(
          bottom: 0,
          right: 34,
          child: Icon(
            Icons.directions_car_filled,
            size: 115,
            color: Color(0xFF0878FA),
          ),
        ),
        const Positioned(
          bottom: 7,
          left: 32,
          child: Icon(Icons.delivery_dining, size: 68, color: navy),
        ),
        Positioned(
          bottom: 10,
          left: 10,
          right: 10,
          child: Container(height: 2, color: teal),
        ),
      ],
    ),
  );
  Widget _building(double width, double height, Color color) => Container(
    width: width,
    height: height,
    decoration: BoxDecoration(
      color: color,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(7)),
    ),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: List.generate(
        4,
        (_) => Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: List.generate(
            2,
            (_) => Container(
              width: 5,
              height: 9,
              color: Colors.white.withValues(alpha: .7),
            ),
          ),
        ),
      ),
    ),
  );
}

Color serviceColor(String icon) => switch (icon) {
  'food' => const Color(0xFFFF8A00),
  'shopping' => const Color(0xFF22AE53),
  'delivery' => const Color(0xFFE9A539),
  'beauty' => const Color(0xFFE83E88),
  'cleaning' => const Color(0xFF1688FF),
  'pharmacy' => const Color(0xFF25AD5B),
  'carpentry' => const Color(0xFFF09A2F),
  'electrical' => const Color(0xFFFFB20C),
  'ride' || 'mechanic' || 'tailoring' => navy,
  _ => teal,
};

class ServiceGlyph extends StatelessWidget {
  const ServiceGlyph(this.icon, {super.key, this.size = 44});
  final String icon;
  final double size;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: const Color(0xFFE6ECF6)),
      borderRadius: BorderRadius.circular(13),
    ),
    child: Icon(serviceIcon(icon), color: serviceColor(icon), size: size * .6),
  );
}

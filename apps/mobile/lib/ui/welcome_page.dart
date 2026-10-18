import 'package:flutter/material.dart';
import '../core/api.dart';
import 'auth_page.dart';
import 'brand.dart';
import 'common.dart';

class WelcomePage extends StatelessWidget {
  const WelcomePage({super.key, required this.api, required this.onGuest});
  final OneCallApi api;
  final VoidCallback onGuest;
  void _auth(BuildContext context, bool register) => Navigator.push(
    context,
    MaterialPageRoute<void>(
      builder: (_) => AuthPage(
        api: api,
        initialRegister: register,
        onAuthenticated: () =>
            Navigator.of(context).popUntil((route) => route.isFirst),
      ),
    ),
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 900;
          final intro = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const OneCallLogo(size: 60),
              const SizedBox(height: 28),
              Text(
                'Help for home.\nTime for you.',
                style: TextStyle(
                  fontSize: wide ? 48 : 34,
                  fontWeight: FontWeight.w700,
                  color: navy,
                  height: 1.1,
                  letterSpacing: -1,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'From home repairs to everyday errands, find local help with OneCall.',
                style: TextStyle(fontSize: 16, color: Color(0xFF536581)),
              ),
              if (wide) ...[
                const SizedBox(height: 32),
                const Center(child: WelcomeCity()),
              ],
            ],
          );
          final actions = Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'One place to get things done.',
                    style: TextStyle(
                      fontSize: 23,
                      fontWeight: FontWeight.w700,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Request a service, review your provider’s quote and follow your booking in one place.',
                    style: TextStyle(color: Color(0xFF536581)),
                  ),
                  const SizedBox(height: 24),
                  BusyButton(
                    label: 'Sign In',
                    busy: false,
                    onPressed: () => _auth(context, false),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _auth(context, true),
                      child: const Text('Create Account'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Center(
                    child: TextButton(
                      onPressed: onGuest,
                      child: const Text('Continue as Guest'),
                    ),
                  ),
                  const Divider(height: 28),
                  const Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.travel_explore, size: 20, color: teal),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Browse first. You’ll need a verified account to send a request.',
                          style: TextStyle(
                            fontSize: 13,
                            color: Color(0xFF536581),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
          return Center(
            child: SingleChildScrollView(
              padding: EdgeInsets.all(wide ? 48 : 24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1120),
                child: wide
                    ? Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Expanded(child: intro),
                          const SizedBox(width: 64),
                          Expanded(child: actions),
                        ],
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          intro,
                          const SizedBox(height: 28),
                          actions,
                          const SizedBox(height: 24),
                          const Text(
                            'OneCall · Nigeria',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Color(0xFF536581),
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          );
        },
      ),
    ),
  );
}

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
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Column(
              children: [
                Image.asset(
                  'assets/onecall-brand.png',
                  height: 220,
                  width: 280,
                  fit: BoxFit.contain,
                  semanticLabel: 'OneCall — one call, every service',
                ),
                const SizedBox(height: 14),
                const Text(
                  'Everything You Need, One Call Away.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: navy, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 28),
                const WelcomeCity(),
                const SizedBox(height: 40),
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
                    child: const Padding(
                      padding: EdgeInsets.symmetric(vertical: 15),
                      child: Text('Create Account'),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                TextButton(
                  onPressed: onGuest,
                  child: const Text('Continue as Guest'),
                ),
                const SizedBox(height: 12),
                const Text(
                  'OneCall · Nigeria',
                  style: TextStyle(color: Colors.grey, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

import 'package:flutter/material.dart';
import '../core/api.dart';
import 'common.dart';
import 'resource_widgets.dart';

class PasswordResetPage extends StatefulWidget {
  const PasswordResetPage({super.key, required this.api});
  final OneCallApi api;
  @override
  State<PasswordResetPage> createState() => _PasswordResetPageState();
}

class _PasswordResetPageState extends State<PasswordResetPage> {
  final _emailForm = GlobalKey<FormState>(),
      _resetForm = GlobalKey<FormState>();
  final _email = TextEditingController(),
      _token = TextEditingController(),
      _password = TextEditingController();
  bool _busy = false, _requested = false;
  String? _error, _developmentToken;
  Future<void> _request() async {
    if (!_emailForm.currentState!.validate()) {
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result =
          await widget.api.request(
                'POST',
                '/auth/password-reset/request',
                authenticated: false,
                body: {'email': _email.text.trim().toLowerCase()},
              )
              as Map;
      if (mounted) {
        setState(() {
          _requested = true;
          _developmentToken = result['developmentResetToken'] as String?;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = errorMessage(e));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _confirm() async {
    if (!_resetForm.currentState!.validate()) {
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.request(
        'POST',
        '/auth/password-reset/confirm',
        authenticated: false,
        body: {'resetToken': _token.text.trim(), 'newPassword': _password.text},
      );
      if (mounted) {
        notice(context, 'Password reset. Sign in with your new password.');
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = errorMessage(e));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _token.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Reset password')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const PageIntro(
          icon: Icons.lock_reset,
          title: 'Get back into your account',
          message:
              'Request a password reset for your account email. If the account exists, instructions will be sent to that address.',
        ),
        Form(
          key: _emailForm,
          child: TextFormField(
            controller: _email,
            enabled: !_busy,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email address'),
            validator: (v) =>
                RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch((v ?? '').trim())
                ? null
                : 'Enter a valid email address',
          ),
        ),
        const SizedBox(height: 16),
        BusyButton(
          label: 'Send reset instructions',
          busy: _busy,
          onPressed: _request,
        ),
        if (_requested) ...[
          const SizedBox(height: 24),
          const Text(
            'Enter the reset token from your email and choose a new password.',
          ),
          if (_developmentToken != null) ...[
            const Text(
              'Development reset token',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            SelectableText(_developmentToken!),
          ],
          Form(
            key: _resetForm,
            child: Column(
              children: [
                TextFormField(
                  controller: _token,
                  enabled: !_busy,
                  maxLength: 4096,
                  autocorrect: false,
                  decoration: const InputDecoration(labelText: 'Reset token'),
                  validator: (v) => (v ?? '').trim().isEmpty
                      ? 'Enter your reset token'
                      : null,
                ),
                TextFormField(
                  controller: _password,
                  enabled: !_busy,
                  obscureText: true,
                  maxLength: 128,
                  enableSuggestions: false,
                  autocorrect: false,
                  decoration: const InputDecoration(labelText: 'New password'),
                  validator: (v) =>
                      (v ?? '').length >= 8 &&
                          RegExp(r'[A-Za-z]').hasMatch(v ?? '') &&
                          RegExp(r'\d').hasMatch(v ?? '')
                      ? null
                      : 'Use at least 8 characters, with a letter and a number',
                ),
              ],
            ),
          ),
          BusyButton(
            label: 'Save new password',
            busy: _busy,
            onPressed: _confirm,
          ),
        ],
        if (_error != null) ErrorNotice(_error!),
      ],
    ),
  );
}

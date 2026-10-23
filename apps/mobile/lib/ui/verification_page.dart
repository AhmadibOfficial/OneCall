import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../core/api.dart';
import 'common.dart';

class VerificationPage extends StatefulWidget {
  const VerificationPage({super.key, required this.api});
  final OneCallApi api;
  @override
  State<VerificationPage> createState() => _VerificationPageState();
}

class _VerificationPageState extends State<VerificationPage> {
  final _emailToken = TextEditingController();
  String? _error, _notice;
  bool _busy = false;
  Future<void> _request() async {
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final data = await widget.api.requestVerification(false);
      if (data['alreadyVerified'] == true) {
        await widget.api.reloadUser();
        if (mounted) {
          setState(() {
            _notice = 'Email is already verified.';
          });
        }
        return;
      }
      if (!mounted) {
        return;
      }
      setState(() {
        if (kDebugMode && data['developmentVerificationToken'] is String) {
          _emailToken.text = data['developmentVerificationToken'] as String;
        }
        _notice =
            data.keys.any((k) => k.startsWith('development')) && kDebugMode
            ? 'Local development challenge loaded. Confirm it below.'
            : 'Check your email for the verification token.';
      });
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = errorMessage(error);
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  Future<void> _confirm() async {
    final value = _emailToken.text.trim();
    if (value.isEmpty) {
      setState(() => _error = 'Enter the token from your verification email.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.confirmVerification(false, value);
      if (mounted) {
        setState(() {
          _notice = 'Email verified.';
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = errorMessage(error);
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _emailToken.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.api.user;
    return Scaffold(
      appBar: AppBar(title: const Text('Verify your account')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const PageIntro(
            icon: Icons.verified_user_outlined,
            title: 'A safer start',
            message: 'Verify your email before sending a service request.',
          ),
          if (_error != null) ErrorNotice(_error!),
          if (_notice != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text(_notice!),
            ),
          const SizedBox(height: 20),
          Text(
            'Email: ${user?.email ?? ''}',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          if (user?.emailVerified == true)
            const ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.verified, color: teal),
              title: Text('Email verified'),
            )
          else ...[
            TextButton(
              onPressed: _busy ? null : () => _request(),
              child: const Text('Send email verification'),
            ),
            TextField(
              controller: _emailToken,
              enabled: !_busy,
              maxLength: 512,
              decoration: const InputDecoration(
                labelText: 'Email verification token',
                prefixIcon: Icon(Icons.mark_email_read_outlined),
                counterText: '',
              ),
            ),
            TextButton(
              onPressed: _busy ? null : () => _confirm(),
              child: const Text('Confirm email'),
            ),
          ],
          if (_busy) const Center(child: CircularProgressIndicator()),
          if (user?.canBook == true)
            BusyButton(
              label: 'Continue to services',
              busy: false,
              onPressed: () => Navigator.pop(context),
            ),
        ],
      ),
    );
  }
}

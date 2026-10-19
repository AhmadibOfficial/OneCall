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
  final _emailToken = TextEditingController(),
      _phoneCode = TextEditingController();
  String? _selector, _error, _notice;
  bool _busy = false;
  Future<void> _request(bool phone) async {
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final data = await widget.api.requestVerification(phone);
      if (data['alreadyVerified'] == true) {
        await widget.api.reloadUser();
        if (mounted) {
          setState(() {
            _notice = '${phone ? 'Phone' : 'Email'} is already verified.';
          });
        }
        return;
      }
      if (!mounted) {
        return;
      }
      setState(() {
        if (phone) {
          _selector = data['selector'] as String?;
          if (kDebugMode && data['developmentVerificationCode'] is String) {
            _phoneCode.text = data['developmentVerificationCode'] as String;
          }
        } else if (kDebugMode &&
            data['developmentVerificationToken'] is String) {
          _emailToken.text = data['developmentVerificationToken'] as String;
        }
        _notice =
            data.keys.any((k) => k.startsWith('development')) && kDebugMode
            ? 'Local development challenge loaded. Confirm it below.'
            : 'Check your ${phone ? 'phone' : 'email'} for the verification ${phone ? 'code' : 'token'}.';
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

  Future<void> _confirm(bool phone) async {
    final value = phone ? _phoneCode.text.trim() : _emailToken.text.trim();
    if (value.isEmpty ||
        (phone && (_selector == null || !RegExp(r'^\d{6}$').hasMatch(value)))) {
      setState(() {
        _error = phone
            ? 'Request a code and enter its 6 digits.'
            : 'Enter the token from your verification email.';
      });
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.confirmVerification(phone, value, selector: _selector);
      if (mounted) {
        setState(() {
          _notice = '${phone ? 'Phone' : 'Email'} verified.';
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
    _phoneCode.dispose();
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
            message:
                'Verify your email and phone before sending a service request.',
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
              onPressed: _busy ? null : () => _request(false),
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
              onPressed: _busy ? null : () => _confirm(false),
              child: const Text('Confirm email'),
            ),
          ],
          const Divider(height: 36),
          Text(
            'Phone: ${user?.phone ?? ''}',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          if (user?.phoneVerified == true)
            const ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(Icons.verified, color: teal),
              title: Text('Phone verified'),
            )
          else ...[
            TextButton(
              onPressed: _busy ? null : () => _request(true),
              child: const Text('Send phone code'),
            ),
            TextField(
              controller: _phoneCode,
              enabled: !_busy,
              maxLength: 6,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Phone verification code',
                prefixIcon: Icon(Icons.sms_outlined),
              ),
            ),
            TextButton(
              onPressed: _busy ? null : () => _confirm(true),
              child: const Text('Confirm phone'),
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

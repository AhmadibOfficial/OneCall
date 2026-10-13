import 'package:flutter/material.dart';
import '../core/api.dart';
import 'common.dart';
import 'brand.dart';
import 'password_reset_page.dart';
import 'legal_page.dart';
import 'social_sign_in.dart';

class AuthPage extends StatefulWidget {
  const AuthPage({
    super.key,
    required this.api,
    this.initialRegister = false,
    this.onAuthenticated,
  });
  final OneCallApi api;
  final bool initialRegister;
  final VoidCallback? onAuthenticated;
  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController(), _password = TextEditingController();
  final _first = TextEditingController(),
      _last = TextEditingController(),
      _phone = TextEditingController();
  late bool _register = widget.initialRegister;
  bool _busy = false, _showPassword = false;
  String? _error;
  String? _required(String? value) =>
      value == null || value.trim().isEmpty ? 'This field is required' : null;
  String? _validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return 'This field is required';
    }
    if (_register &&
        (value.length < 8 ||
            !RegExp(r'[A-Za-z]').hasMatch(value) ||
            !RegExp(r'\d').hasMatch(value))) {
      return 'Use at least 8 characters, a letter and a number';
    }
    return null;
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) {
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_register) {
        var phone = _phone.text.trim();
        if (RegExp(r'^0[789]\d{9}$').hasMatch(phone)) {
          phone = '+234${phone.substring(1)}';
        }
        await widget.api.register(
          firstName: _first.text,
          lastName: _last.text,
          email: _email.text,
          phone: phone,
          password: _password.text,
        );
      } else {
        await widget.api.login(_email.text, _password.text);
      }
      if (mounted) {
        widget.onAuthenticated?.call();
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
    for (final c in [_email, _password, _first, _last, _phone]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: navy,
    appBar: AppBar(title: Text(_register ? 'Create account' : 'Sign in')),
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(32),
              ),
              child: AutofillGroup(
                child: Form(
                  key: _form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Center(child: OneCallLogo(size: 76)),
                      const SizedBox(height: 18),
                      Text(
                        _register ? 'Create your account' : 'Welcome back',
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w800,
                          color: navy,
                        ),
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'Everything you need, one call away.',
                        style: TextStyle(fontSize: 16),
                      ),
                      const SizedBox(height: 12),
                      const Chip(
                        avatar: Icon(Icons.location_on_outlined, size: 18),
                        label: Text('Across Nigeria'),
                      ),
                      const SizedBox(height: 24),
                      SegmentedButton<bool>(
                        segments: const [
                          ButtonSegment(value: false, label: Text('Sign in')),
                          ButtonSegment(
                            value: true,
                            label: Text('Create account'),
                          ),
                        ],
                        selected: {_register},
                        onSelectionChanged: _busy
                            ? null
                            : (value) => setState(() {
                                _register = value.first;
                                _error = null;
                                _form.currentState?.reset();
                              }),
                      ),
                      const SizedBox(height: 20),
                      SocialSignInButtons(
                        api: widget.api,
                        disabled: _busy,
                        onBusy: (value) {
                          if (mounted) setState(() => _busy = value);
                        },
                        onAuthenticated: widget.onAuthenticated,
                      ),
                      const SizedBox(height: 20),
                      const Row(
                        children: [
                          Expanded(child: Divider()),
                          Padding(
                            padding: EdgeInsets.symmetric(horizontal: 16),
                            child: Text('or with email'),
                          ),
                          Expanded(child: Divider()),
                        ],
                      ),
                      const SizedBox(height: 20),
                      if (_register) ...[
                        TextFormField(
                          controller: _first,
                          enabled: !_busy,
                          maxLength: 100,
                          decoration: const InputDecoration(
                            labelText: 'First name',
                            counterText: '',
                          ),
                          validator: _required,
                          textCapitalization: TextCapitalization.words,
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _last,
                          enabled: !_busy,
                          maxLength: 100,
                          decoration: const InputDecoration(
                            labelText: 'Last name',
                            counterText: '',
                          ),
                          validator: _required,
                          textCapitalization: TextCapitalization.words,
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _phone,
                          enabled: !_busy,
                          maxLength: 16,
                          keyboardType: TextInputType.phone,
                          decoration: const InputDecoration(
                            labelText: 'Phone number',
                            hintText: '+2348012345678',
                            counterText: '',
                          ),
                          validator: (v) =>
                              RegExp(
                                r'^(?:\+?[1-9]\d{7,14}|0[789]\d{9})$',
                              ).hasMatch((v ?? '').trim())
                              ? null
                              : 'Enter a valid phone number',
                        ),
                        const SizedBox(height: 14),
                      ],
                      TextFormField(
                        controller: _email,
                        enabled: !_busy,
                        keyboardType: TextInputType.emailAddress,
                        maxLength: 254,
                        autofillHints: const [AutofillHints.email],
                        autocorrect: false,
                        decoration: const InputDecoration(
                          labelText: 'Email address',
                          counterText: '',
                        ),
                        validator: (v) =>
                            RegExp(
                              r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                            ).hasMatch((v ?? '').trim())
                            ? null
                            : 'Enter a valid email address',
                      ),
                      const SizedBox(height: 14),
                      TextFormField(
                        controller: _password,
                        enabled: !_busy,
                        obscureText: !_showPassword,
                        maxLength: 128,
                        autofillHints: [
                          _register
                              ? AutofillHints.newPassword
                              : AutofillHints.password,
                        ],
                        autocorrect: false,
                        enableSuggestions: false,
                        decoration: InputDecoration(
                          labelText: 'Password',
                          counterText: '',
                          helperText: _register
                              ? 'At least 8 characters, with a letter and a number'
                              : null,
                          suffixIcon: IconButton(
                            tooltip: _showPassword
                                ? 'Hide password'
                                : 'Show password',
                            onPressed: () => setState(() {
                              _showPassword = !_showPassword;
                            }),
                            icon: Icon(
                              _showPassword
                                  ? Icons.visibility_off_outlined
                                  : Icons.visibility_outlined,
                            ),
                          ),
                        ),
                        validator: _validatePassword,
                        onFieldSubmitted: (_) {
                          if (!_busy) {
                            _submit();
                          }
                        },
                      ),
                      if (_error != null) ErrorNotice(_error!),
                      const SizedBox(height: 20),
                      if (!_register)
                        TextButton(
                          onPressed: _busy
                              ? null
                              : () => Navigator.push(
                                  context,
                                  MaterialPageRoute<void>(
                                    builder: (_) =>
                                        PasswordResetPage(api: widget.api),
                                  ),
                                ),
                          child: const Text('Forgot password?'),
                        ),
                      const SizedBox(height: 16),
                      const Text(
                        'OneCall is intended for adults aged 18 or above. Read the terms and privacy notice before creating an account. Optional permissions are requested separately.',
                        style: TextStyle(color: Colors.black54),
                      ),
                      TextButton(
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute<void>(
                            builder: (_) => const LegalPage(),
                          ),
                        ),
                        child: const Text('Legal & privacy'),
                      ),
                      BusyButton(
                        label: _register ? 'Create account' : 'Sign in',
                        busy: _busy,
                        onPressed: _submit,
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'Find local services, send a request, and follow its progress.',
                        style: TextStyle(color: Colors.black54),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

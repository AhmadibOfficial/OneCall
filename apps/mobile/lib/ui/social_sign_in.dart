import 'input_dialogs.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api.dart';
import 'common.dart';
import 'legal_page.dart';
import 'password_reset_page.dart';
import 'resource_widgets.dart';

class SocialSignInButtons extends StatefulWidget {
  const SocialSignInButtons({
    super.key,
    required this.api,
    this.disabled = false,
    this.link = false,
    this.onBusy,
    this.onAuthenticated,
    this.onLinked,
  });
  final OneCallApi api;
  final bool disabled, link;
  final ValueChanged<bool>? onBusy;
  final VoidCallback? onAuthenticated, onLinked;
  @override
  State<SocialSignInButtons> createState() => _SocialSignInButtonsState();
}

class _SocialSignInButtonsState extends State<SocialSignInButtons> {
  static Future<void>? _googleInitialization;
  bool _working = false;
  String? _message;

  Future<void> _signIn(String provider) async {
    if (_working || widget.disabled) return;
    setState(() {
      _working = true;
      _message = null;
    });
    widget.onBusy?.call(true);
    try {
      final config = Map<String, dynamic>.from(
        await widget.api.request(
              'GET',
              '/auth/social/configuration',
              authenticated: false,
            )
            as Map,
      );
      final browser =
          kIsWeb ||
          ![
            TargetPlatform.android,
            TargetPlatform.iOS,
          ].contains(defaultTargetPlatform) ||
          (provider == 'apple' && defaultTargetPlatform != TargetPlatform.iOS);
      if (config[browser ? '${provider}Browser' : provider] != true) {
        throw const ApiFailure(
          'This sign-in option is not configured yet. You can use email and password.',
        );
      }
      final attempt = Map<String, dynamic>.from(
        await widget.api.request(
              'POST',
              browser && widget.link
                  ? '/auth/social/browser/link-challenge'
                  : '/auth/social/challenge',
              body: {'provider': provider, if (browser) 'browser': true},
              authenticated: browser && widget.link,
            )
            as Map,
      );
      if (browser) {
        final uri = Uri.parse(attempt['authorizationUrl'] as String);
        if (uri.scheme != 'https' ||
            !['accounts.google.com', 'appleid.apple.com'].contains(uri.host)) {
          throw const ApiFailure('Sign-in configuration is invalid.');
        }
        if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
          throw const ApiFailure(
            'Allow the sign-in browser window and try again.',
          );
        }
        final deadline = DateTime.now().add(const Duration(minutes: 5));
        while (mounted && DateTime.now().isBefore(deadline)) {
          await Future<void>.delayed(const Duration(seconds: 2));
          if (!mounted) return;
          final result = Map<String, dynamic>.from(
            await widget.api.request(
                  'POST',
                  '/auth/social/browser/result',
                  body: {'challenge': attempt['challenge']},
                  authenticated: false,
                )
                as Map,
          );
          if (result['pending'] == true) continue;
          if (result['error'] is String) {
            throw ApiFailure(result['error'] as String);
          }
          await _finish(result);
          return;
        }
        if (mounted) {
          throw const ApiFailure('Sign-in attempt expired. Try again.');
        }
        return;
      }
      String? token, code;
      if (provider == 'google') {
        const serverId = String.fromEnvironment(
          'ONECALL_GOOGLE_SERVER_CLIENT_ID',
        );
        const iosId = String.fromEnvironment('ONECALL_GOOGLE_IOS_CLIENT_ID');
        if (serverId.isEmpty) {
          throw const ApiFailure(
            'Google sign-in needs the OneCall OAuth client configuration. Use email and password.',
          );
        }
        _googleInitialization ??= GoogleSignIn.instance.initialize(
          serverClientId: serverId,
          clientId: iosId.isEmpty ? null : iosId,
        );
        await _googleInitialization;
        if (!GoogleSignIn.instance.supportsAuthenticate()) {
          throw const ApiFailure(
            'Google sign-in is unavailable on this device.',
          );
        }
        final account = await GoogleSignIn.instance.authenticate();
        token = account.authentication.idToken;
      } else {
        final credential = await SignInWithApple.getAppleIDCredential(
          scopes: [
            AppleIDAuthorizationScopes.email,
            AppleIDAuthorizationScopes.fullName,
          ],
          nonce: attempt['nonce'] as String,
        );
        token = credential.identityToken;
        code = credential.authorizationCode;
      }
      if (token == null || token.isEmpty) {
        throw const ApiFailure(
          'No sign-in credential was returned. Try again.',
        );
      }
      final response = Map<String, dynamic>.from(
        await widget.api.request(
              'POST',
              widget.link ? '/auth/social/link' : '/auth/social/exchange',
              authenticated: widget.link,
              body: {
                'provider': provider,
                'challenge': attempt['challenge'],
                'idToken': token,
                'authorizationCode': ?code,
              },
            )
            as Map,
      );
      await _finish(response);
    } on GoogleSignInException catch (e) {
      if (mounted) {
        setState(
          () => _message = e.code == GoogleSignInExceptionCode.canceled
              ? 'Google sign-in cancelled.'
              : 'Google sign-in could not complete. Check the app configuration or use email.',
        );
      }
    } on SignInWithAppleAuthorizationException catch (e) {
      if (mounted) {
        setState(
          () => _message = e.code == AuthorizationErrorCode.canceled
              ? 'Apple sign-in cancelled.'
              : 'Apple sign-in could not complete. Use email or try again.',
        );
      }
    } catch (e) {
      if (mounted) setState(() => _message = errorMessage(e));
    } finally {
      widget.onBusy?.call(false);
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _finish(Map<String, dynamic> response) async {
    if (!mounted) return;
    if (widget.link) {
      setState(
        () => _message = 'Sign-in option linked to your OneCall account.',
      );
      widget.onLinked?.call();
      return;
    }
    if (response['profileRequired'] == true) {
      final session = await Navigator.push<Map<String, dynamic>>(
        context,
        MaterialPageRoute(
          builder: (_) => SocialProfilePage(
            api: widget.api,
            ticket: response['ticket'] as String,
          ),
        ),
      );
      if (session == null) return;
      await widget.api.acceptSocialSession(session);
    } else {
      await widget.api.acceptSocialSession(response);
    }
    if (mounted) widget.onAuthenticated?.call();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      FilledButton.icon(
        key: const ValueKey('apple-sign-in'),
        style: FilledButton.styleFrom(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(54),
        ),
        onPressed: _working || widget.disabled ? null : () => _signIn('apple'),
        icon: const Icon(Icons.apple),
        label: Text(widget.link ? 'Link Apple account' : 'Continue with Apple'),
      ),
      const SizedBox(height: 12),
      OutlinedButton.icon(
        key: const ValueKey('google-sign-in'),
        style: OutlinedButton.styleFrom(
          foregroundColor: Colors.black,
          backgroundColor: Colors.white,
          minimumSize: const Size.fromHeight(54),
          side: const BorderSide(color: Colors.black, width: 1.5),
        ),
        onPressed: _working || widget.disabled ? null : () => _signIn('google'),
        icon: const Icon(Icons.account_circle_outlined),
        label: Text(
          widget.link ? 'Link Google account' : 'Continue with Google',
        ),
      ),
      if (_working)
        const Padding(
          padding: EdgeInsets.all(12),
          child: Center(child: CircularProgressIndicator()),
        ),
      if (_message != null)
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text(_message!, style: const TextStyle(color: navy)),
        ),
    ],
  );
}

class LinkedSignInPage extends StatefulWidget {
  const LinkedSignInPage({super.key, required this.api});
  final OneCallApi api;
  @override
  State<LinkedSignInPage> createState() => _LinkedSignInPageState();
}

class _LinkedSignInPageState extends State<LinkedSignInPage> {
  int _revision = 0;
  bool _busy = false;
  Future<void> _unlink(String provider) async {
    final proof = await confirmPassword(
      context,
      title: 'Unlink $provider',
      action: 'Unlink',
    );
    if (!mounted || proof == null) return;
    setState(() => _busy = true);
    try {
      await widget.api.request(
        'POST',
        '/auth/social/unlink',
        body: {'provider': provider, 'password': proof},
      );
      // Clear locally as soon as the server confirms revocation.
      await widget.api.clearAfterRevocation();
    } catch (e) {
      if (mounted && widget.api.user != null) notice(context, errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Linked sign-in accounts')),
    body: Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Text(
                'Link an account you own. To unlink, confirm a working OneCall password. If you only use social sign-in, set a password through verified email recovery first.',
              ),
              TextButton(
                onPressed: _busy
                    ? null
                    : () => Navigator.push(
                        context,
                        MaterialPageRoute<void>(
                          builder: (_) => PasswordResetPage(api: widget.api),
                        ),
                      ),
                child: const Text('Set or reset OneCall password'),
              ),
              SocialSignInButtons(
                api: widget.api,
                link: true,
                disabled: _busy,
                onLinked: () {
                  if (mounted) setState(() => _revision++);
                },
              ),
            ],
          ),
        ),
        Expanded(
          child: ResourceList(
            key: ValueKey(_revision),
            load: () async =>
                await widget.api.request('GET', '/auth/social/linked') as List,
            emptyText: 'No social sign-in accounts linked yet.',
            itemBuilder: (context, value, reload) {
              final item = Map<String, dynamic>.from(value as Map);
              final provider = item['provider'] as String;
              return Card(
                child: ListTile(
                  title: Text(
                    provider == 'apple' ? 'Apple linked' : 'Google linked',
                  ),
                  trailing: TextButton(
                    onPressed: _busy ? null : () => _unlink(provider),
                    child: const Text('Unlink'),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    ),
  );
}

class SocialProfilePage extends StatefulWidget {
  const SocialProfilePage({super.key, required this.api, required this.ticket});
  final OneCallApi api;
  final String ticket;
  @override
  State<SocialProfilePage> createState() => _SocialProfilePageState();
}

class _SocialProfilePageState extends State<SocialProfilePage> {
  final _form = GlobalKey<FormState>();
  final _first = TextEditingController(),
      _last = TextEditingController(),
      _phone = TextEditingController();
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _complete() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    var phone = _phone.text.trim();
    if (phone.startsWith('0')) phone = '+234${phone.substring(1)}';
    try {
      final session = Map<String, dynamic>.from(
        await widget.api.request(
              'POST',
              '/auth/social/complete',
              authenticated: false,
              body: {
                'ticket': widget.ticket,
                'firstName': _first.text.trim(),
                'lastName': _last.text.trim(),
                'phone': phone,
              },
            )
            as Map,
      );
      if (mounted) Navigator.pop(context, session);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: Scaffold(
      appBar: AppBar(title: const Text('Complete your OneCall account')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const Text(
              'Add your name and Nigerian phone number. Email and phone verification are optional for service access. No new password is required for this sign-in option.',
            ),
            const SizedBox(height: 20),
            for (final field in [
              (_first, 'First name'),
              (_last, 'Last name'),
            ]) ...[
              TextFormField(
                controller: field.$1,
                enabled: !_busy,
                maxLength: 100,
                decoration: InputDecoration(labelText: field.$2),
                validator: (v) =>
                    (v ?? '').trim().isEmpty ? 'Enter your name' : null,
              ),
              const SizedBox(height: 12),
            ],
            TextFormField(
              controller: _phone,
              enabled: !_busy,
              keyboardType: TextInputType.phone,
              maxLength: 16,
              decoration: const InputDecoration(
                labelText: 'Phone number',
                hintText: '08012345678',
              ),
              validator: (v) =>
                  RegExp(
                    r'^(?:0[789]\d{9}|\+234[789]\d{9})$',
                  ).hasMatch((v ?? '').trim())
                  ? null
                  : 'Enter a Nigerian mobile number',
            ),
            const Text(
              'Review the OneCall terms and privacy notice before creating your account.',
            ),
            TextButton(
              onPressed: _busy
                  ? null
                  : () => Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => const LegalPage(),
                      ),
                    ),
              child: const Text('Legal & privacy'),
            ),
            if (_error != null) ErrorNotice(_error!),
            BusyButton(
              label: 'Create account',
              busy: _busy,
              onPressed: _complete,
            ),
          ],
        ),
      ),
    ),
  );
}

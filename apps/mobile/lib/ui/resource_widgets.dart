import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api.dart';
import 'auth_page.dart';
import 'common.dart';
import 'brand.dart';
import 'verification_page.dart';

class PrivateGate extends StatelessWidget {
  const PrivateGate({
    super.key,
    required this.api,
    required this.child,
    this.verified = false,
  });
  final OneCallApi api;
  final Widget child;
  final bool verified;
  @override
  Widget build(BuildContext context) {
    final user = api.user;
    if (user != null && (!verified || user.canBook)) {
      return child;
    }
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                user == null
                    ? Icons.lock_outline
                    : Icons.verified_user_outlined,
                color: teal,
                size: 50,
              ),
              const SizedBox(height: 16),
              Text(
                user == null ? 'Sign in to continue' : 'Verify your account',
                style: const TextStyle(
                  fontSize: 23,
                  color: navy,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                user == null
                    ? 'Your bookings and account details stay with your OneCall account.'
                    : 'Verify your email and phone to book services and use your wallet.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              BusyButton(
                label: user == null ? 'Sign In' : 'Verify account',
                busy: false,
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => user == null
                        ? AuthPage(
                            api: api,
                            onAuthenticated: () => Navigator.of(
                              context,
                            ).popUntil((route) => route.isFirst),
                          )
                        : VerificationPage(api: api),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ResourceList extends StatefulWidget {
  const ResourceList({
    super.key,
    required this.load,
    required this.itemBuilder,
    required this.emptyText,
  });
  final Future<List<dynamic>> Function() load;
  final Widget Function(BuildContext, dynamic, VoidCallback) itemBuilder;
  final String emptyText;
  @override
  State<ResourceList> createState() => _ResourceListState();
}

class _ResourceListState extends State<ResourceList> {
  late Future<List<dynamic>> _future = widget.load();
  Future<void> _reload() async {
    setState(() => _future = widget.load());
    try {
      await _future;
    } catch (_) {
      // FutureBuilder renders the failure and its retry action.
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<List<dynamic>>(
    future: _future,
    builder: (context, snapshot) {
      if (snapshot.connectionState == ConnectionState.waiting) {
        return const AppLoading();
      }
      if (snapshot.hasError) {
        return Padding(
          padding: const EdgeInsets.all(24),
          child: ErrorNotice(
            errorMessage(snapshot.error!),
            onRetry: () {
              _reload().catchError((Object _) {});
            },
          ),
        );
      }
      final items = snapshot.data ?? [];
      return RefreshIndicator(
        onRefresh: _reload,
        child: ListView(
          padding: const EdgeInsets.all(18),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            if (items.isEmpty) EmptyNotice(widget.emptyText),
            ...items.map(
              (item) => widget.itemBuilder(context, item, () {
                _reload().catchError((Object _) {});
              }),
            ),
          ],
        ),
      );
    },
  );
}

void notice(BuildContext context, String message) => ScaffoldMessenger.of(
  context,
).showSnackBar(SnackBar(content: Text(message)));

Future<void> openExternal(BuildContext context, Uri uri) async {
  try {
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
        context.mounted) {
      notice(context, 'No application is available to open this link.');
    }
  } catch (_) {
    if (context.mounted) {
      notice(context, 'This link could not be opened.');
    }
  }
}

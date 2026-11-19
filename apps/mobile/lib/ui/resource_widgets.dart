import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api.dart';
import 'auth_page.dart';
import 'common.dart';
import 'loading_widgets.dart';

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
                user == null ? 'Sign in to continue' : 'Account unavailable',
                style: TextStyle(
                  fontSize: 23,
                  color: Theme.of(context).colorScheme.onSurface,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                user == null
                    ? 'Your bookings and account details stay with your OneCall account.'
                    : 'This account cannot use services. Contact Support for help.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              BusyButton(
                label: user == null ? 'Sign In' : 'Back',
                busy: false,
                onPressed: () => user != null
                    ? Navigator.maybePop(context)
                    : Navigator.push(
                        context,
                        MaterialPageRoute<void>(
                          builder: (_) => AuthPage(
                            api: api,
                            onAuthenticated: () => Navigator.of(
                              context,
                            ).popUntil((route) => route.isFirst),
                          ),
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
  List<dynamic>? _items;
  Object? _error;
  bool _loading = true;
  Future<void>? _inFlight;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() {
    // Coalesce refresh gestures and item actions into the current request.
    return _inFlight ??= _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await Future<List<dynamic>>.sync(widget.load);
      if (mounted) {
        setState(() => _items = items);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = error);
      }
    } finally {
      _inFlight = null;
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(18),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (_loading && items == null)
            const ContentSkeleton()
          else ...[
            if (_loading)
              const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: LinearProgressIndicator(semanticsLabel: 'Refreshing content'),
              ),
            if (_error != null)
              ErrorNotice(errorMessage(_error!), onRetry: _reload),
            if (items != null) ...[
              if (items.isEmpty) EmptyNotice(widget.emptyText),
              ...items.map((item) => widget.itemBuilder(context, item, _reload)),
            ],
          ],
        ],
      ),
    );
  }
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

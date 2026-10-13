import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/api.dart';
import 'common.dart';
import 'resource_widgets.dart';
import 'input_dialogs.dart';

class PrivacyRequestsPage extends StatefulWidget {
  const PrivacyRequestsPage({super.key, required this.api});
  final OneCallApi api;
  @override
  State<PrivacyRequestsPage> createState() => _PrivacyRequestsPageState();
}

class _PrivacyRequestsPageState extends State<PrivacyRequestsPage> {
  int _revision = 0;
  bool _busy = false;
  Future<void> _request() async {
    final draft = await composePrivacyRequest(context);
    if (!mounted || draft == null) return;
    setState(() => _busy = true);
    try {
      await widget.api.request(
        'POST',
        '/account/privacy/requests',
        body: {'kind': draft.kind, 'message': draft.message},
      );
      if (mounted) setState(() => _revision++);
    } catch (e) {
      if (mounted) notice(context, errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _snapshot() async {
    final proof = await confirmPassword(
      context,
      title: 'Account data snapshot',
      action: 'View data',
    );
    if (!mounted || proof == null) return;
    setState(() => _busy = true);
    try {
      final data = await widget.api.request(
        'POST',
        '/account/privacy/snapshot',
        body: {'password': proof},
      );
      if (!mounted) return;
      final json = const JsonEncoder.withIndent('  ').convert(data);
      await Navigator.push<void>(
        context,
        MaterialPageRoute(
          builder: (_) => Scaffold(
            appBar: AppBar(title: const Text('Your account snapshot')),
            body: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                const Text(
                  'Contains personal information. Copy only to a trusted place. Support handles requests for additional retained records.',
                ),
                TextButton(
                  onPressed: () => Clipboard.setData(ClipboardData(text: json)),
                  child: const Text('Copy JSON'),
                ),
                SelectableText(json),
              ],
            ),
          ),
        ),
      );
    } catch (e) {
      if (mounted) notice(context, errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Privacy requests')),
    body: Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              const Text(
                'Requests are reviewed by OneCall support. A response does not mean your account or data has been deleted. Any lawful retention must be explained by support.',
              ),
              Wrap(
                spacing: 12,
                children: [
                  FilledButton(
                    onPressed: _busy ? null : _request,
                    child: const Text('New privacy request'),
                  ),
                  TextButton(
                    onPressed: _busy ? null : _snapshot,
                    child: const Text('View account data'),
                  ),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: ResourceList(
            key: ValueKey(_revision),
            load: () async =>
                await widget.api.request('GET', '/account/privacy/requests')
                    as List,
            emptyText: 'No privacy requests yet.',
            itemBuilder: (context, value, reload) {
              final item = value as Map;
              return Card(
                child: ListTile(
                  title: Text(item['subject'] as String),
                  subtitle: Text(
                    '${item['status'] == 'OPEN' ? 'Awaiting review' : 'Support answered'}\n${item['message']}\n${item['response'] ?? ''}',
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

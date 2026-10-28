import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'common.dart';
import 'resource_widgets.dart';
import 'brand.dart';

class LegalPage extends StatefulWidget {
  const LegalPage({super.key, this.documentId, this.onRequestSupport});
  final String? documentId;
  final ValueChanged<String>? onRequestSupport;

  @override
  State<LegalPage> createState() => _LegalPageState();
}

class _LegalPageState extends State<LegalPage> {
  late final Future<Map<String, dynamic>> _document = _load();

  Future<Map<String, dynamic>> _load() async {
    final value = await rootBundle.loadString(
      'assets/legal/onecall-policies.json',
    );
    return Map<String, dynamic>.from(jsonDecode(value) as Map);
  }

  Widget _paragraph(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: SelectableText(text, style: const TextStyle(height: 1.6)),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Legal & privacy')),
    body: FutureBuilder<Map<String, dynamic>>(
      future: _document,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: ErrorNotice(
              'The document could not be opened. Contact onecalltech@gmail.com for a copy.',
            ),
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final data = snapshot.data!;
        final documents = (data['documents'] as List)
            .map((v) => Map<String, dynamic>.from(v as Map))
            .toList();
        Map<String, dynamic>? selected;
        for (final document in documents) {
          if (document['id'] == widget.documentId) {
            selected = document;
            break;
          }
        }
        final email = data['contactEmail'] as String;
        final deletion = widget.documentId == 'account-deletion';
        final subject = deletion
            ? 'OneCall account deletion'
            : 'OneCall privacy request';
        return ListView(
          padding: const EdgeInsets.all(24),
          children: [
            if (selected == null) ...[
              const Center(child: OneCallLogo(size: 66)),
              const SizedBox(height: 24),
            ],
            Text(
              selected == null
                  ? 'Legal & privacy'
                  : selected['title'] as String,
              style: TextStyle(
                fontSize: 28,
                color: Theme.of(context).colorScheme.onSurface,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 10),
            if (selected == null) _paragraph(data['subtitle'] as String),
            Text('${data['status']} · ${data['updated']}'),
            const SizedBox(height: 8),
            SelectableText('Version: ${data['version']}'),
            const SizedBox(height: 16),
            _paragraph(data['notice'] as String),
            if (selected == null) ...[
              _paragraph(data['introduction'] as String),
              for (final document in documents)
                Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 22,
                      vertical: 14,
                    ),
                    title: Text(
                      document['title'] as String,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    subtitle: Text(document['summary'] as String),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute<void>(
                        builder: (_) => LegalPage(
                          documentId: document['id'] as String,
                          onRequestSupport: widget.onRequestSupport,
                        ),
                      ),
                    ),
                  ),
                ),
            ] else ...[
              _paragraph(selected['summary'] as String),
              for (final raw in selected['sections'] as List) ...[
                const Divider(height: 32),
                Text(
                  (raw as Map)['heading'] as String,
                  style: TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                const SizedBox(height: 12),
                for (final text in (raw['paragraphs'] as List? ?? const []))
                  _paragraph(text as String),
                for (final text in (raw['bullets'] as List? ?? const []))
                  _paragraph('• $text'),
              ],
            ],
            const Divider(height: 32),
            const Text(
              'Contact & data requests',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            _paragraph(
              'Requests require identity verification and manual handling. Preparing an email or submitting a support request does not instantly delete your account. Do not include passwords, verification codes, NIN or bank details.',
            ),
            SelectableText(email),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => openExternal(
                context,
                Uri(
                  scheme: 'mailto',
                  path: email,
                  query: 'subject=${Uri.encodeComponent(subject)}',
                ),
              ),
              icon: const Icon(Icons.email_outlined),
              label: Text(
                deletion ? 'Prepare deletion email' : 'Prepare request email',
              ),
            ),
            TextButton.icon(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: email));
                if (context.mounted) {
                  notice(context, 'Contact email copied.');
                }
              },
              icon: const Icon(Icons.copy),
              label: const Text('Copy contact email'),
            ),
            if (widget.onRequestSupport != null)
              TextButton(
                onPressed: () => widget.onRequestSupport!(subject),
                child: const Text('Submit privacy request through Support'),
              ),
          ],
        );
      },
    ),
  );
}

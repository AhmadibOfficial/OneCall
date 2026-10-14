import 'package:flutter/material.dart';

Future<String?> confirmPassword(
  BuildContext context, {
  required String title,
  required String action,
}) => showDialog<String>(
  context: context,
  builder: (_) => _PasswordDialog(title: title, action: action),
);

class _PasswordDialog extends StatefulWidget {
  const _PasswordDialog({required this.title, required this.action});
  final String title, action;
  @override
  State<_PasswordDialog> createState() => _PasswordDialogState();
}

class _PasswordDialogState extends State<_PasswordDialog> {
  final _form = GlobalKey<FormState>();
  final _password = TextEditingController();
  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.title),
    scrollable: true,
    content: Form(
      key: _form,
      child: TextFormField(
        controller: _password,
        obscureText: true,
        autocorrect: false,
        enableSuggestions: false,
        maxLength: 128,
        decoration: const InputDecoration(
          labelText: 'Confirm OneCall password',
        ),
        validator: (value) => (value ?? '').length < 8
            ? 'Enter your OneCall password (8+ characters).'
            : null,
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () {
          if (_form.currentState!.validate()) {
            Navigator.pop(context, _password.text);
          }
        },
        child: Text(widget.action),
      ),
    ],
  );
}

class PrivacyRequestDraft {
  const PrivacyRequestDraft(this.kind, this.message);
  final String kind, message;
}

Future<PrivacyRequestDraft?> composePrivacyRequest(BuildContext context) =>
    showDialog<PrivacyRequestDraft>(
      context: context,
      builder: (_) => const _PrivacyDialog(),
    );

class _PrivacyDialog extends StatefulWidget {
  const _PrivacyDialog();
  @override
  State<_PrivacyDialog> createState() => _PrivacyDialogState();
}

class _PrivacyDialogState extends State<_PrivacyDialog> {
  final _form = GlobalKey<FormState>();
  final _message = TextEditingController();
  String _kind = 'ACCESS';
  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Privacy request'),
    scrollable: true,
    content: Form(
      key: _form,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          DropdownButton<String>(
            value: _kind,
            isExpanded: true,
            items: const [
              DropdownMenuItem(value: 'ACCESS', child: Text('Access my data')),
              DropdownMenuItem(
                value: 'CORRECTION',
                child: Text('Correct my data'),
              ),
              DropdownMenuItem(
                value: 'DELETION',
                child: Text('Delete my account/data'),
              ),
            ],
            onChanged: (value) {
              if (value != null) setState(() => _kind = value);
            },
          ),
          TextFormField(
            controller: _message,
            maxLength: 2000,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Explain your request',
            ),
            validator: (value) => (value ?? '').trim().length < 5
                ? 'Add a short explanation.'
                : null,
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () {
          if (_form.currentState!.validate()) {
            Navigator.pop(
              context,
              PrivacyRequestDraft(_kind, _message.text.trim()),
            );
          }
        },
        child: const Text('Send request'),
      ),
    ],
  );
}

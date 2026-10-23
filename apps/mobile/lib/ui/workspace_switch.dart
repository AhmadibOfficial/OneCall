import 'package:flutter/material.dart';

/// A navigation preference. Provider permissions always come from the server.
class WorkspaceSwitch extends StatelessWidget {
  const WorkspaceSwitch({
    super.key,
    required this.providerMode,
    required this.onChanged,
  });

  final bool providerMode;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1000),
      child: SwitchListTile.adaptive(
        key: const ValueKey('workspace-switch'),
        title: const Text('Provider mode'),
        subtitle: Text(
          providerMode
              ? 'Provider · Offer services and manage jobs'
              : 'Customer · Find services and manage bookings',
        ),
        value: providerMode,
        onChanged: onChanged,
      ),
    ),
  );
}

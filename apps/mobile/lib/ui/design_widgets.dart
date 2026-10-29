import 'package:flutter/material.dart';
import 'common.dart';

const oneCallMist = Color(0xFFF0F3F7);

class OneCallSection extends StatelessWidget {
  const OneCallSection({
    super.key,
    required this.title,
    required this.children,
  });
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 24),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 6, bottom: 12),
          child: Text(
            title,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        Card(
          clipBehavior: Clip.antiAlias,
          margin: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < children.length; i++) ...[
                if (i > 0) const Divider(height: 1),
                children[i],
              ],
            ],
          ),
        ),
      ],
    ),
  );
}

class OneCallSteps extends StatelessWidget {
  const OneCallSteps({super.key, required this.current, required this.onEdit});
  final int current;
  final ValueChanged<int>? onEdit;
  static const labels = ['Service', 'Details', 'Where', 'When', 'Review'];

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          liveRegion: true,
          child: Text(
            'Step ${current + 1} of ${labels.length} · ${labels[current]}',
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
        const SizedBox(height: 12),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: (current + 1) / labels.length,
            minHeight: 4,
            backgroundColor: const Color(0xFFDCE5F1),
            semanticsLabel: 'Booking progress',
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: List.generate(labels.length, (index) {
            final complete = index < current;
            final selected = index == current;
            return Expanded(
              child: Semantics(
                label: 'Step ${index + 1}: ${labels[index]}',
                selected: selected,
                child: Tooltip(
                  message: complete ? 'Edit ${labels[index]}' : labels[index],
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: complete && onEdit != null
                        ? () => onEdit!(index)
                        : null,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 48),
                      child: Center(
                        child: CircleAvatar(
                          radius: 15,
                          backgroundColor: selected
                              ? navy
                              : complete
                              ? const Color(0xFFE0ECFF)
                              : Colors.white,
                          child: complete
                              ? const Icon(Icons.check, color: navy, size: 18)
                              : Text(
                                  '${index + 1}',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: selected ? Colors.white : navy,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
      ],
    ),
  );
}

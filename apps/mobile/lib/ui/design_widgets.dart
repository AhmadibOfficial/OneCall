import 'package:flutter/material.dart';
import 'common.dart';

const oneCallMist = Color(0xFFF0F3F7);

class OneCallSection extends StatelessWidget {
  const OneCallSection({super.key, required this.title, required this.children});
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
            title.toUpperCase(),
            style: const TextStyle(
              color: Color(0xFF59667A),
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.4,
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
    padding: const EdgeInsets.symmetric(vertical: 16),
    child: Row(
      children: List.generate(labels.length, (index) {
        final complete = index < current;
        final selected = index == current;
        return Expanded(
          child: Semantics(
            label: 'Step ${index + 1}: ${labels[index]}',
            selected: selected,
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: index < current && onEdit != null
                  ? () => onEdit!(index)
                  : null,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 17,
                      backgroundColor: selected
                          ? navy
                          : complete
                          ? const Color(0xFFE0ECFF)
                          : Colors.white,
                      foregroundColor: navy,
                      child: complete
                          ? const Icon(Icons.check, size: 18)
                          : Text(
                              '${index + 1}',
                              style: TextStyle(
                                color: selected ? Colors.white : navy,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      labels[index],
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: selected ? FontWeight.bold : FontWeight.w500,
                        color: selected ? navy : const Color(0xFF68768A),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }),
    ),
  );
}

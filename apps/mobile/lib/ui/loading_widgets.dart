import 'package:flutter/material.dart';

/// Static placeholders respect reduced motion and never announce fake content.
class ContentSkeleton extends StatelessWidget {
  const ContentSkeleton({super.key, this.label = 'Loading content', this.cards = false});
  final String label;
  final bool cards;

  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    liveRegion: true,
    label: label,
    child: ExcludeSemantics(
      child: IgnorePointer(
        child: cards
            ? LayoutBuilder(builder: (context, constraints) {
                final largeText = MediaQuery.textScalerOf(context).scale(14) > 19;
                final columns = largeText || constraints.maxWidth < 320
                    ? 1
                    : constraints.maxWidth >= 740 ? 3 : 2;
                final width = (constraints.maxWidth - 14 * (columns - 1)) / columns;
                return Wrap(spacing: 14, runSpacing: 14, children: [
                  for (var i = 0; i < 4; i++)
                    SizedBox(width: width, child: const _SkeletonItem(card: true)),
                ]);
              })
            : Column(children: [
                for (var i = 0; i < 3; i++) const _SkeletonItem(),
              ]),
      ),
    ),
  );
}

class _SkeletonItem extends StatelessWidget {
  const _SkeletonItem({this.card = false});
  final bool card;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.only(bottom: card ? 0 : 14),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const _SkeletonBlock(width: 48, height: 48),
        const SizedBox(height: 18),
        const FractionallySizedBox(widthFactor: .72, child: _SkeletonBlock(height: 18)),
        const SizedBox(height: 10),
        const _SkeletonBlock(height: 12),
        const SizedBox(height: 8),
        const FractionallySizedBox(widthFactor: .55, child: _SkeletonBlock(height: 12)),
        if (card) ...[
          const SizedBox(height: 20),
          const _SkeletonBlock(height: 36),
        ],
      ]),
    ),
  );
}

class _SkeletonBlock extends StatelessWidget {
  const _SkeletonBlock({required this.height, this.width});
  final double height;
  final double? width;

  @override
  Widget build(BuildContext context) => Container(
    height: height,
    width: width ?? double.infinity,
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(8),
    ),
  );
}

import 'package:flutter/material.dart';
import '../core/models.dart';
import 'common.dart';

enum ServiceCategory {
  all('All services'),
  home('Home & repairs'),
  errands('Errands & transport'),
  lifestyle('Personal & lifestyle');

  const ServiceCategory(this.label);
  final String label;
}

ServiceCategory categoryFor(PilotService service) {
  if (service.needsRoute ||
      const ['shopping', 'food', 'pharmacy'].contains(service.icon)) {
    return ServiceCategory.errands;
  }
  if (const [
    'tailoring',
    'shoe',
    'beauty',
    'laundry',
    'tutoring',
  ].contains(service.icon)) {
    return ServiceCategory.lifestyle;
  }
  return ServiceCategory.home;
}

List<PilotService> matchingServices(
  List<PilotService> services,
  String query,
  ServiceCategory category,
) {
  final words = query.trim().toLowerCase().split(RegExp(r'\s+'));
  return services.where((service) {
    final text = '${service.name} ${service.shortName} ${service.description}'
        .toLowerCase();
    return (category == ServiceCategory.all ||
            categoryFor(service) == category) &&
        words.every(text.contains);
  }).toList();
}

class ServiceFilters extends StatelessWidget {
  const ServiceFilters({
    super.key,
    required this.selected,
    required this.onChanged,
  });
  final ServiceCategory selected;
  final ValueChanged<ServiceCategory> onChanged;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      children: [
        for (final category in ServiceCategory.values)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Text(category.label),
              selected: selected == category,
              showCheckmark: false,
              selectedColor: navy,
              backgroundColor: Colors.white,
              labelStyle: TextStyle(
                color: selected == category ? Colors.white : navy,
              ),
              side: BorderSide(
                color: selected == category ? navy : const Color(0xFFDCE5F1),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              onSelected: (_) => onChanged(category),
            ),
          ),
      ],
    ),
  );
}

class ServiceGrid extends StatelessWidget {
  const ServiceGrid({
    super.key,
    required this.services,
    required this.onBook,
    this.favorites = const {},
    this.saving = const {},
    this.onFavorite,
    this.compact = false,
  });
  final List<PilotService> services;
  final ValueChanged<PilotService> onBook;
  final Set<String> favorites, saving;
  final ValueChanged<PilotService>? onFavorite;
  final bool compact;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final largeText = MediaQuery.textScalerOf(context).scale(14) > 19;
      final columns = largeText || constraints.maxWidth < 320
          ? 1
          : constraints.maxWidth >= 740
          ? 3
          : 2;
      final width = (constraints.maxWidth - 14 * (columns - 1)) / columns;
      return Wrap(
        spacing: 14,
        runSpacing: 14,
        children: [
          for (final service in services)
            SizedBox(
              key: ValueKey('service-${service.key}'),
              width: width,
              child: _ServiceCard(
                service: service,
                onBook: () => onBook(service),
                favorite: favorites.contains(service.name),
                saving: saving.contains(service.name),
                onFavorite: onFavorite == null
                    ? null
                    : () => onFavorite!(service),
                compact: compact,
              ),
            ),
        ],
      );
    },
  );
}

class _ServiceCard extends StatelessWidget {
  const _ServiceCard({
    required this.service,
    required this.onBook,
    required this.favorite,
    required this.saving,
    required this.compact,
    this.onFavorite,
  });
  final PilotService service;
  final VoidCallback onBook;
  final VoidCallback? onFavorite;
  final bool favorite, saving, compact;

  @override
  Widget build(BuildContext context) {
    final (background, foreground) = switch (categoryFor(service)) {
      ServiceCategory.errands => (
        const Color(0xFFF1ECFD),
        const Color(0xFF6945A1),
      ),
      ServiceCategory.lifestyle => (
        const Color(0xFFFFEFE5),
        const Color(0xFF925327),
      ),
      _ => (const Color(0xFFEAF2FF), const Color(0xFF075ECB)),
    };
    return Semantics(
      container: true,
      button: true,
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onBook,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: background,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(
                        serviceIcon(service.icon),
                        color: foreground,
                        size: 26,
                      ),
                    ),
                    const Spacer(),
                    if (onFavorite != null)
                      IconButton(
                        tooltip: saving
                            ? 'Saving ${service.name}'
                            : favorite
                            ? 'Remove ${service.name} from favourites'
                            : 'Save ${service.name} to favourites',
                        onPressed: saving ? null : onFavorite,
                        isSelected: favorite,
                        selectedIcon: const Icon(Icons.favorite, color: teal),
                        icon: const Icon(Icons.favorite_border, size: 22),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  service.name,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                  ),
                ),
                if (!compact) ...[
                  const SizedBox(height: 8),
                  Text(
                    service.description,
                    style: const TextStyle(color: Color(0xFF536581)),
                  ),
                ],
                const SizedBox(height: 10),
                Text(
                  service.availableProviders == 0
                      ? 'Awaiting local providers'
                      : '${service.availableProviders} approved ${service.availableProviders == 1 ? 'provider' : 'providers'}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xFF536581),
                  ),
                ),
                const SizedBox(height: 16),
                const Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Request service',
                        style: TextStyle(
                          fontSize: 13,
                          color: Color(0xFF075ECB),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Icon(
                      Icons.arrow_forward,
                      color: Color(0xFF075ECB),
                      size: 18,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class CatalogueEmptyState extends StatelessWidget {
  const CatalogueEmptyState({
    super.key,
    required this.onReset,
    this.hasFilters = true,
  });
  final VoidCallback onReset;
  final bool hasFilters;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        children: [
          const Icon(Icons.search_off_rounded, size: 40, color: teal),
          const SizedBox(height: 12),
          Text(
            hasFilters
                ? 'No services match your search'
                : 'No services to show yet',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            hasFilters
                ? 'Try another name or browse all categories.'
                : 'Try refreshing the catalogue or choose another location.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: onReset,
            icon: Icon(hasFilters ? Icons.close : Icons.refresh),
            label: Text(
              hasFilters ? 'Clear search & filters' : 'Refresh services',
            ),
          ),
        ],
      ),
    ),
  );
}

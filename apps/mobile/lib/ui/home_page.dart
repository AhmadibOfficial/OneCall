import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api.dart';
import '../core/models.dart';
import 'auth_page.dart';
import 'brand.dart';
import 'common.dart';
import 'location_picker.dart';
import 'order_pages.dart';
import 'profile_pages.dart';
import 'resource_widgets.dart';
import 'verification_page.dart';
import 'service_catalogue.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key, required this.api});
  final OneCallApi api;
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _tab = 0;
  ServiceCategory _category = ServiceCategory.all;
  String _state = 'Kaduna', _city = 'Kaduna', _search = '';
  List<PilotService> _services = [];
  final Set<String> _favorites = {}, _saving = {};
  bool _loading = true;
  int _catalogueRevision = 0, _notificationsRevision = 0;
  String? _error, _favoritesError;
  bool _favoritesLoading = false;
  final _searchController = TextEditingController();
  @override
  void initState() {
    super.initState();
    unawaited(_initialize());
  }

  Future<void> _initialize() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (!mounted) {
        return;
      }
      final key = widget.api.user?.uid ?? 'guest';
      _state = prefs.getString('onecall.location.$key.state') ?? 'Kaduna';
      _city = prefs.getString('onecall.location.$key.city') ?? 'Kaduna';
      if (!nigeriaStates.contains(_state)) {
        _state = 'Kaduna';
      }
    } catch (_) {
      /* The catalogue also works without saved preferences. */
    }
    if (!mounted) {
      return;
    }
    await _load();
    if (widget.api.user != null) {
      await _loadFavorites();
    }
  }

  Future<void> _loadFavorites() async {
    if (!mounted || widget.api.user == null) {
      return;
    }
    setState(() {
      _favoritesLoading = true;
      _favoritesError = null;
    });
    try {
      final items = await widget.api.request('GET', '/favorites') as List;
      if (mounted) {
        setState(() {
          _favorites.clear();
          _favorites.addAll(
            items.map((item) => (item as Map)['serviceName'] as String),
          );
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _favoritesError = errorMessage(e));
      }
    } finally {
      if (mounted) {
        setState(() => _favoritesLoading = false);
      }
    }
  }

  Future<void> _load() async {
    final revision = ++_catalogueRevision;
    final state = _state, city = _city;
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final values = await widget.api.servicesForLocation(state, city);
      if (mounted && revision == _catalogueRevision) {
        setState(() => _services = values);
      }
    } catch (e) {
      if (mounted && revision == _catalogueRevision) {
        setState(() => _error = errorMessage(e));
      }
    } finally {
      if (mounted && revision == _catalogueRevision) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _location() async {
    final value = await chooseLocation(context, _state, _city);
    if (!mounted || value == null) {
      return;
    }
    setState(() {
      _state = value.state;
      _city = value.city;
      _services = [];
    });
    final loading = _load();
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = widget.api.user?.uid ?? 'guest';
      await prefs.setString('onecall.location.$key.state', value.state);
      await prefs.setString('onecall.location.$key.city', value.city);
    } catch (_) {}
    await loading;
  }

  Future<void> _book(PilotService service) async {
    if (widget.api.user == null) {
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => AuthPage(
            api: widget.api,
            onAuthenticated: () =>
                Navigator.of(context).popUntil((route) => route.isFirst),
          ),
        ),
      );
      return;
    }
    if (!widget.api.user!.canBook) {
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => VerificationPage(api: widget.api),
        ),
      );
      if (!mounted || widget.api.user?.canBook != true) {
        return;
      }
    }
    if (mounted) {
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => RequestPage(
            api: widget.api,
            service: service,
            state: _state,
            city: _city,
          ),
        ),
      );
    }
  }

  Future<void> _favorite(PilotService service) async {
    if (widget.api.user == null) {
      notice(context, 'Sign in to save your favourite services.');
      return;
    }
    if (_saving.contains(service.name)) {
      return;
    }
    setState(() => _saving.add(service.name));
    final add = !_favorites.contains(service.name);
    try {
      await widget.api.request(
        add ? 'PUT' : 'DELETE',
        '/favorites',
        body: {'serviceName': service.name},
      );
      if (mounted) {
        setState(() {
          if (add) {
            _favorites.add(service.name);
          } else {
            _favorites.remove(service.name);
          }
        });
      }
    } catch (e) {
      if (mounted) {
        notice(context, errorMessage(e));
      }
    } finally {
      if (mounted) {
        setState(() => _saving.remove(service.name));
      }
    }
  }

  void _allServices() => Navigator.push(
    context,
    MaterialPageRoute<void>(
      builder: (_) => AllServicesPage(
        services: _services,
        location: '$_city, $_state',
        onBook: _book,
        favorites: _favorites,
        onFavorite: _favorite,
        initialQuery: _search,
        initialCategory: _category,
      ),
    ),
  );
  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  static const _labels = ['Home', 'Bookings', 'Chat', 'Updates', 'Profile'];
  static const _icons = [
    Icons.home_outlined,
    Icons.receipt_long_outlined,
    Icons.chat_bubble_outline,
    Icons.notifications_none,
    Icons.person_outline,
  ];
  static const _selectedIcons = [
    Icons.home,
    Icons.receipt_long,
    Icons.chat_bubble,
    Icons.notifications,
    Icons.person,
  ];

  void _selectTab(int index) => setState(() => _tab = index);

  void _showFavorites() => Navigator.push<void>(
    context,
    MaterialPageRoute<void>(
      builder: (_) => Scaffold(
        appBar: AppBar(title: const Text('Favorites')),
        body: PrivateGate(api: widget.api, child: _favoriteList()),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final wide = constraints.maxWidth >= 1000;
      final content = Scaffold(
        appBar: _tab == 0
            ? null
            : AppBar(
                title: Text(_tab == 3 ? 'Notifications' : _labels[_tab]),
                actions: _tab == 2 && widget.api.user != null
                    ? [
                        IconButton(
                          tooltip: 'Favorites',
                          icon: const Icon(Icons.favorite_border),
                          onPressed: _showFavorites,
                        ),
                      ]
                    : _tab == 3 && widget.api.user != null
                    ? [
                        IconButton(
                          tooltip: 'Mark all as read',
                          onPressed: () async {
                            try {
                              await widget.api.request(
                                'POST',
                                '/notifications/read-all',
                                body: {},
                              );
                              if (mounted) {
                                setState(() => _notificationsRevision++);
                              }
                            } catch (e) {
                              if (context.mounted) {
                                notice(context, errorMessage(e));
                              }
                            }
                          },
                          icon: const Icon(Icons.done_all),
                        ),
                      ]
                    : null,
              ),
        body: switch (_tab) {
          0 => _home(),
          1 => PrivateGate(
            api: widget.api,
            verified: true,
            child: BookingsPanel(api: widget.api),
          ),
          2 => PrivateGate(
            api: widget.api,
            child: ChatInboxPanel(api: widget.api),
          ),
          3 => PrivateGate(
            api: widget.api,
            child: ResourceList(
              key: ValueKey('notifications-$_notificationsRevision'),
              load: () async =>
                  await widget.api.request('GET', '/notifications') as List,
              emptyText: 'Your booking and account updates will appear here.',
              itemBuilder: (context, item, reload) =>
                  _notification(Map<String, dynamic>.from(item as Map), reload),
            ),
          ),
          _ => PrivateGate(
            api: widget.api,
            child: ProfilePanel(api: widget.api, state: _state, city: _city),
          ),
        },
        bottomNavigationBar: wide
            ? null
            : DecoratedBox(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: Color(0xFFE5EAF2))),
                ),
                child: SafeArea(
                  top: false,
                  child: NavigationBar(
                    selectedIndex: _tab,
                    labelBehavior:
                        NavigationDestinationLabelBehavior.alwaysShow,
                    onDestinationSelected: _selectTab,
                    destinations: [
                      for (var i = 0; i < _labels.length; i++)
                        NavigationDestination(
                          icon: Icon(_icons[i]),
                          selectedIcon: Icon(_selectedIcons[i]),
                          label: _labels[i],
                        ),
                    ],
                  ),
                ),
              ),
      );
      return Row(
        children: [
          if (wide)
            Material(
              child: Container(
                width: 220,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(right: BorderSide(color: Color(0xFFE5EAF2))),
                ),
                child: SafeArea(
                  child: Column(
                    children: [
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 32),
                        child: OneCallLogo(size: 48),
                      ),
                      Expanded(
                        child: NavigationRail(
                          extended: true,
                          scrollable: true,
                          minExtendedWidth: 218,
                          selectedIndex: _tab,
                          onDestinationSelected: _selectTab,
                          backgroundColor: Colors.white,
                          indicatorColor: const Color(0xFFEAF2FF),
                          selectedIconTheme: const IconThemeData(
                            color: Color(0xFF075ECB),
                          ),
                          selectedLabelTextStyle: const TextStyle(
                            color: navy,
                            fontWeight: FontWeight.w700,
                          ),
                          destinations: [
                            for (var i = 0; i < _labels.length; i++)
                              NavigationRailDestination(
                                icon: Icon(_icons[i]),
                                selectedIcon: Icon(_selectedIcons[i]),
                                label: Text(_labels[i]),
                              ),
                          ],
                        ),
                      ),
                      const Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'Local help.\nOneCall away.',
                          style: TextStyle(
                            color: Color(0xFF536581),
                            height: 1.7,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          Expanded(child: content),
        ],
      );
    },
  );

  void _clearSearch() {
    _searchController.clear();
    setState(() {
      _search = '';
      _category = ServiceCategory.all;
    });
  }

  Widget _home() {
    final filtered = matchingServices(_services, _search, _category);
    final hasFilters =
        _search.trim().isNotEmpty || _category != ServiceCategory.all;
    final shown = hasFilters ? filtered : filtered.take(8).toList();
    final name = widget.api.user?.firstName.isNotEmpty == true
        ? widget.api.user!.firstName
        : 'there';
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        key: const PageStorageKey('home-scroll'),
        padding: EdgeInsets.zero,
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [navy, Color(0xFF12396B)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
            ),
            padding: const EdgeInsets.fromLTRB(24, 20, 24, 28),
            child: SafeArea(
              bottom: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Hello, $name',
                          style: const TextStyle(
                            color: Color(0xFFD2E1F6),
                            fontSize: 16,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Notifications',
                        onPressed: () => _selectTab(3),
                        style: IconButton.styleFrom(
                          backgroundColor: const Color(0xFF284775),
                        ),
                        icon: const Icon(
                          Icons.notifications_none_rounded,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Your day, made easier.',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 32,
                      fontWeight: FontWeight.w700,
                      height: 1.15,
                      letterSpacing: -.7,
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Find local help for your home and everyday tasks.',
                    style: TextStyle(color: Color(0xFFD2E1F6), fontSize: 15),
                  ),
                  const SizedBox(height: 16),
                  TextButton.icon(
                    onPressed: _location,
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.white,
                      backgroundColor: const Color(0xFF284775),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                    ),
                    icon: const Icon(Icons.location_on_outlined, size: 20),
                    label: Text('$_city, $_state', softWrap: true),
                  ),
                  const SizedBox(height: 20),
                  Semantics(
                    key: const ValueKey('home-service-search'),
                    container: true,
                    child: TextField(
                      controller: _searchController,
                      textInputAction: TextInputAction.search,
                      onTapOutside: (_) =>
                          FocusManager.instance.primaryFocus?.unfocus(),
                      onChanged: (value) => setState(() => _search = value),
                      decoration: InputDecoration(
                        labelText: 'Search services',
                        prefixIcon: const Icon(Icons.search_rounded),
                        suffixIcon: _search.isEmpty
                            ? null
                            : IconButton(
                                tooltip: 'Clear search',
                                onPressed: () {
                                  _searchController.clear();
                                  setState(() => _search = '');
                                },
                                icon: const Icon(Icons.close),
                              ),
                        fillColor: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => _selectTab(1),
                      icon: const Icon(Icons.receipt_long_outlined, size: 20),
                      label: const Text('My bookings'),
                    ),
                    OutlinedButton.icon(
                      onPressed: _showFavorites,
                      icon: const Icon(Icons.favorite_border, size: 20),
                      label: const Text('Saved services'),
                    ),
                  ],
                ),
                if (widget.api.user != null && !widget.api.user!.canBook) ...[
                  const SizedBox(height: 18),
                  Card(
                    color: const Color(0xFFEAF2FF),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Verify your email and phone',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 17,
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Complete contact verification before sending your first request.',
                          ),
                          TextButton.icon(
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute<void>(
                                builder: (_) =>
                                    VerificationPage(api: widget.api),
                              ),
                            ),
                            icon: const Icon(Icons.arrow_forward, size: 18),
                            label: const Text('Verify account'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 26),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Explore services',
                        style: TextStyle(
                          fontSize: 23,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -.4,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: _loading || _error != null
                          ? null
                          : _allServices,
                      child: const Text('View all'),
                    ),
                  ],
                ),
                Text(
                  'Availability for $_city',
                  style: const TextStyle(color: Color(0xFF536581)),
                ),
                const SizedBox(height: 16),
                ServiceFilters(
                  selected: _category,
                  onChanged: (value) => setState(() => _category = value),
                ),
                const SizedBox(height: 18),
                if (_loading)
                  const Padding(
                    padding: EdgeInsets.all(32),
                    child: Center(
                      child: CircularProgressIndicator(
                        semanticsLabel: 'Loading services',
                      ),
                    ),
                  ),
                if (_error != null) ErrorNotice(_error!, onRetry: _load),
                if (!_loading && _error == null) ...[
                  if (hasFilters)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Semantics(
                        liveRegion: true,
                        child: Text(
                          '${filtered.length} ${filtered.length == 1 ? 'service' : 'services'} found',
                          style: const TextStyle(color: Color(0xFF536581)),
                        ),
                      ),
                    ),
                  if (shown.isEmpty)
                    CatalogueEmptyState(
                      hasFilters: hasFilters,
                      onReset: hasFilters ? _clearSearch : _load,
                    )
                  else
                    ServiceGrid(
                      services: shown,
                      onBook: _book,
                      favorites: _favorites,
                      saving: _saving,
                      onFavorite: _favorite,
                      compact: true,
                    ),
                  if (!hasFilters && filtered.length > shown.length) ...[
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _allServices,
                        icon: const Icon(Icons.grid_view_rounded, size: 18),
                        label: Text('Browse all ${filtered.length} services'),
                      ),
                    ),
                  ],
                ],
                const SizedBox(height: 24),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEAF0F8),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(
                        Icons.fact_check_outlined,
                        color: Color(0xFF075ECB),
                        size: 28,
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Request first. Agree a quote.',
                        style: TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Tell us what you need. Once assigned, your provider sends a quote for you to review before work starts.',
                        style: TextStyle(color: Color(0xFF536581)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _favoriteList() {
    if (_favoritesLoading) {
      return const AppLoading();
    }
    if (_favoritesError != null) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: ErrorNotice(_favoritesError!, onRetry: _loadFavorites),
      );
    }
    final favorites = _services
        .where((s) => _favorites.contains(s.name))
        .toList();
    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        if (favorites.isEmpty)
          const EmptyNotice(
            'Save a service using the heart in All Services.',
            icon: Icons.favorite_border,
          ),
        ...favorites.map(
          (s) => Card(
            child: ListTile(
              leading: ServiceGlyph(s.icon),
              title: Text(s.name),
              subtitle: Text(s.description),
              trailing: IconButton(
                onPressed: () => _favorite(s),
                icon: const Icon(Icons.favorite, color: teal),
              ),
              onTap: () => _book(s),
            ),
          ),
        ),
        TextButton(
          onPressed: _allServices,
          child: const Text('Explore all services'),
        ),
      ],
    );
  }

  Widget _notification(Map<String, dynamic> item, VoidCallback reload) => Card(
    child: ListTile(
      leading: CircleAvatar(
        backgroundColor: const Color(0xFFEAF3FF),
        child: Icon(
          item['title'] == 'Payment successful'
              ? Icons.verified
              : Icons.notifications,
          color: teal,
        ),
      ),
      title: Text(
        item['title'] as String,
        style: TextStyle(
          fontWeight: item['readAt'] == null
              ? FontWeight.w700
              : FontWeight.w400,
        ),
      ),
      subtitle: Text(item['body'] as String),
      trailing: item['readAt'] == null
          ? const Icon(Icons.circle, size: 8, color: teal)
          : null,
      onTap: () async {
        try {
          await widget.api.request(
            'POST',
            '/notifications/${item['id']}/read',
            body: {},
          );
          if (!mounted) {
            return;
          }
          if (item['orderId'] != null) {
            final order = await widget.api.order(item['orderId'] as String);
            if (mounted) {
              await Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => OrderDetailsPage(
                    api: widget.api,
                    initialOrder: order,
                    providerView:
                        order.provider?['uid'] == widget.api.user?.uid,
                  ),
                ),
              );
            }
          }
          if (mounted) {
            reload();
          }
        } catch (e) {
          if (mounted) {
            notice(context, errorMessage(e));
          }
        }
      },
    ),
  );
}

class AllServicesPage extends StatefulWidget {
  const AllServicesPage({
    super.key,
    required this.services,
    required this.location,
    required this.onBook,
    required this.favorites,
    required this.onFavorite,
    this.initialQuery = '',
    this.initialCategory = ServiceCategory.all,
  });
  final List<PilotService> services;
  final String location, initialQuery;
  final ServiceCategory initialCategory;
  final Future<void> Function(PilotService) onBook, onFavorite;
  final Set<String> favorites;
  @override
  State<AllServicesPage> createState() => _AllServicesPageState();
}

class _AllServicesPageState extends State<AllServicesPage> {
  late final _search = TextEditingController(text: widget.initialQuery);
  late ServiceCategory _category = widget.initialCategory;
  final Set<String> _saving = {};

  Future<void> _favorite(PilotService service) async {
    if (_saving.contains(service.name)) return;
    setState(() => _saving.add(service.name));
    try {
      await widget.onFavorite(service);
    } catch (error) {
      if (mounted) notice(context, errorMessage(error));
    } finally {
      if (mounted) setState(() => _saving.remove(service.name));
    }
  }

  void _reset() {
    _search.clear();
    setState(() => _category = ServiceCategory.all);
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final matches = matchingServices(widget.services, _search.text, _category);
    return Scaffold(
      appBar: AppBar(title: const Text('All Services')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text(
            'A hand with the everyday.',
            style: TextStyle(fontSize: 27, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(
                Icons.location_on_outlined,
                size: 18,
                color: Color(0xFF536581),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  widget.location,
                  style: const TextStyle(color: Color(0xFF536581)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          Semantics(
            container: true,
            child: TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              onTapOutside: (_) =>
                  FocusManager.instance.primaryFocus?.unfocus(),
              decoration: InputDecoration(
                labelText: 'Search all services',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        onPressed: () {
                          _search.clear();
                          setState(() {});
                        },
                        icon: const Icon(Icons.close),
                      ),
              ),
              onChanged: (_) => setState(() {}),
            ),
          ),

          const SizedBox(height: 14),
          ServiceFilters(
            selected: _category,
            onChanged: (value) => setState(() => _category = value),
          ),
          const SizedBox(height: 16),
          Semantics(
            liveRegion: true,
            child: Text(
              '${matches.length} ${matches.length == 1 ? 'service' : 'services'} found',
              style: const TextStyle(color: Color(0xFF536581)),
            ),
          ),
          const SizedBox(height: 16),
          if (matches.isEmpty)
            CatalogueEmptyState(onReset: _reset)
          else
            ServiceGrid(
              services: matches,
              onBook: widget.onBook,
              favorites: widget.favorites,
              saving: _saving,
              onFavorite: _favorite,
            ),
        ],
      ),
    );
  }
}

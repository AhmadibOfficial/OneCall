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

class HomePage extends StatefulWidget {
  const HomePage({super.key, required this.api});
  final OneCallApi api;
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _tab = 0;
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
      ),
    ),
  );
  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: _tab == 0
        ? null
        : AppBar(
            title: Text(
              [
                'Home',
                'Bookings',
                'Chat',
                'Notifications',
                'Profile',
              ][_tab],
            ),
            actions: _tab == 2 && widget.api.user != null
                ? [IconButton(
                    tooltip: 'Favorites',
                    icon: const Icon(Icons.favorite_border),
                    onPressed: () => Navigator.push<void>(context, MaterialPageRoute<void>(builder: (_) => Scaffold(appBar: AppBar(title: const Text('Favorites')), body: _favoriteList()))),
                  )]
                : _tab == 3 && widget.api.user != null
                ? [
                    TextButton(
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
                          if (mounted && context.mounted) {
                            notice(context, errorMessage(e));
                          }
                        }
                      },
                      child: const Text(
                        'Mark all as read',
                        style: TextStyle(color: Colors.white, fontSize: 11),
                      ),
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
      2 => PrivateGate(api: widget.api, child: ChatInboxPanel(api: widget.api)),
      3 => PrivateGate(
        api: widget.api,
        child: ResourceList(
          key: ValueKey('notifications-$_notificationsRevision'),
          load: () async =>
              await widget.api.request('GET', '/notifications') as List,
          emptyText: 'Your booking and payment updates will appear here.',
          itemBuilder: (context, item, reload) =>
              _notification(Map<String, dynamic>.from(item as Map), reload),
        ),
      ),
      _ => PrivateGate(
        api: widget.api,
        child: ProfilePanel(api: widget.api, state: _state, city: _city),
      ),
    },
    bottomNavigationBar: SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(36),
        child: NavigationBar(
      height: 72,
      backgroundColor: Colors.white,
      indicatorColor: const Color(0xFFE7F0FF),
      selectedIndex: _tab,
      onDestinationSelected: (index) => setState(() => _tab = index),
      destinations: const [
        NavigationDestination(
          icon: Icon(Icons.home_outlined),
          selectedIcon: Icon(Icons.home),
          label: 'Home',
        ),
        NavigationDestination(
          icon: Icon(Icons.receipt_long_outlined),
          selectedIcon: Icon(Icons.receipt_long),
          label: 'Bookings',
        ),
        NavigationDestination(
          icon: Icon(Icons.chat_bubble_outline),
          selectedIcon: Icon(Icons.chat_bubble),
          label: 'Chat',
        ),
        NavigationDestination(
          icon: Icon(Icons.notifications_none),
          selectedIcon: Icon(Icons.notifications),
          label: 'Updates',
        ),
        NavigationDestination(
          icon: Icon(Icons.person_outline),
          selectedIcon: Icon(Icons.person),
          label: 'Profile',
        ),
      ],
        ),
      ),
    ),
  );
  Widget _home() {
    final filtered = _services
        .where(
          (s) => (s.name + ' ' + s.description).toLowerCase().contains(
            _search.toLowerCase(),
          ),
        )
        .toList();
    final shown = _search.isEmpty ? filtered.take(13).toList() : filtered;
    final name = widget.api.user?.firstName.isNotEmpty == true
        ? widget.api.user!.firstName
        : 'there';
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: EdgeInsets.zero,
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Container(
            color: navy,
            padding: const EdgeInsets.fromLTRB(22, 12, 22, 24),
            child: SafeArea(
              bottom: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Hello, $name 👋',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 23,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Notifications',
                        onPressed: () => setState(() => _tab = 3),
                        icon: const Icon(
                          Icons.notifications_none,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                  InkWell(
                    onTap: _location,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.location_on,
                            size: 16,
                            color: Color(0xFF81BDFF),
                          ),
                          const SizedBox(width: 6),
                          Flexible(
                            child: Text(
                              '$_city, $_state · Nigeria',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                              ),
                            ),
                          ),
                          const Icon(
                            Icons.keyboard_arrow_down,
                            color: Colors.white,
                            size: 18,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 13),
                  const Text(
                    'What service do you need today?',
                    style: TextStyle(color: Colors.white),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _searchController,
                    onChanged: (value) => setState(() => _search = value),
                    decoration: InputDecoration(
                      hintText: 'Search services...',
                      prefixIcon: const Icon(Icons.search, size: 21),
                      suffixIcon: _search.isEmpty
                          ? null
                          : IconButton(
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _search = '');
                              },
                              icon: const Icon(Icons.close),
                            ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 22, 18, 14),
            child: Column(
              children: [
                if (widget.api.user != null && !widget.api.user!.canBook)
                  Card(
                    color: const Color(0xFFF0F6FF),
                    child: ListTile(
                      leading: const Icon(
                        Icons.verified_user_outlined,
                        color: teal,
                      ),
                      title: const Text('Verify your email and phone'),
                      trailing: TextButton(
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute<void>(
                            builder: (_) => VerificationPage(api: widget.api),
                          ),
                        ),
                        child: const Text('Verify account'),
                      ),
                    ),
                  ),
                if (_loading)
                  const Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator(),
                  ),
                if (_error != null) ErrorNotice(_error!, onRetry: _load),
                if (!_loading && _error == null)
                  LayoutBuilder(
                    builder: (context, constraints) => GridView(
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: constraints.maxWidth < 330 ? 3 : 4,
                        mainAxisExtent:
                            112 +
                            (MediaQuery.textScalerOf(context).scale(11) - 11) *
                                3,
                        mainAxisSpacing: 9,
                        crossAxisSpacing: 5,
                      ),
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      children: [
                        ...shown.map(
                          (s) => InkWell(
                            onTap: () => _book(s),
                            borderRadius: BorderRadius.circular(14),
                            child: Column(
                              children: [
                                ServiceGlyph(s.icon, size: 49),
                                const SizedBox(height: 8),
                                Text(
                                  s.shortName,
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: navy,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        if (_search.isEmpty)
                          InkWell(
                            onTap: _allServices,
                            child: const Column(
                              children: [
                                ServiceGlyph('more', size: 49),
                                SizedBox(height: 8),
                                Text(
                                  'More Services',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: navy,
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                if (!_loading && shown.isEmpty && _error == null)
                  const Padding(
                    padding: EdgeInsets.all(24),
                    child: Text('No services match your search.'),
                  ),
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: const LinearGradient(
                      colors: [navy, Color(0xFF043270)],
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'ONE CALL. EVERY SERVICE.',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 7),
                            const Text(
                              'Find the help you need across Nigeria.',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                              ),
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              height: 48,
                              child: FilledButton(
                                style: FilledButton.styleFrom(
                                  backgroundColor: Colors.white,
                                  foregroundColor: navy,
                                ),
                                onPressed: _loading ? null : _allServices,
                                child: const Text(
                                  'Book Now',
                                  style: TextStyle(fontSize: 11),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(
                        Icons.card_giftcard,
                        color: Color(0xFF5B9EFF),
                        size: 76,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  'Availability is shown for $_city. Prices are confirmed by your provider.',
                  style: const TextStyle(color: Colors.grey, fontSize: 11),
                  textAlign: TextAlign.center,
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
            '/notifications/' + item['id'].toString() + '/read',
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
  });
  final List<PilotService> services;
  final String location;
  final Future<void> Function(PilotService) onBook, onFavorite;
  final Set<String> favorites;
  @override
  State<AllServicesPage> createState() => _AllServicesPageState();
}

class _AllServicesPageState extends State<AllServicesPage> {
  String _search = '';
  @override
  Widget build(BuildContext context) {
    final matches = widget.services
        .where(
          (s) => (s.name + ' ' + s.description).toLowerCase().contains(
            _search.toLowerCase(),
          ),
        )
        .toList();
    return Scaffold(
      appBar: AppBar(title: const Text('All Services')),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Text(
            widget.location,
            style: const TextStyle(color: navy, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 14),
          TextField(
            decoration: const InputDecoration(
              hintText: 'Search all services',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: (s) => setState(() => _search = s),
          ),
          const SizedBox(height: 14),
          if (matches.isEmpty)
            const EmptyNotice(
              'No services match your search.',
              icon: Icons.search_off,
            ),
          LayoutBuilder(
            builder: (context, constraints) => GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: matches.length,
              gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: MediaQuery.textScalerOf(context).scale(14) > 18
                    ? constraints.maxWidth + 1
                    : 320,
                mainAxisExtent: 310 + (MediaQuery.textScalerOf(context).scale(14) - 14) * 16,
                crossAxisSpacing: 14,
                mainAxisSpacing: 14,
              ),
              itemBuilder: (context, index) {
                final service = matches[index];
                return Card(
                  clipBehavior: Clip.antiAlias,
                  margin: EdgeInsets.zero,
                  child: InkWell(
                    onTap: () => widget.onBook(service),
                    child: Ink(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          colors: [Color(0xFF123969), navy],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [
                              Expanded(child: Icon(serviceIcon(service.icon), size: 40, color: Colors.white)),
                              IconButton(
                                tooltip: 'Save favourite',
                                onPressed: () async {
                                  await widget.onFavorite(service);
                                  if (mounted) setState(() {});
                                },
                                icon: Icon(
                                  widget.favorites.contains(service.name) ? Icons.favorite : Icons.favorite_border,
                                  color: Colors.white,
                                ),
                              ),
                            ]),
                            const Spacer(),
                            Text(service.name,
                                style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 8),
                            Text(service.description, maxLines: 3, overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Color(0xFFD9E7FA), fontSize: 13)),
                            const SizedBox(height: 12),
                            Text('${service.availableProviders} approved providers in this area',
                                style: const TextStyle(color: Colors.white, fontSize: 11)),
                            const SizedBox(height: 10),
                            const Text('Request service →',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
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
}

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../core/api.dart';
import 'common.dart';
import 'resource_widgets.dart';

class TrackingPage extends StatefulWidget {
  const TrackingPage({
    super.key,
    required this.api,
    required this.orderId,
    this.providerView = false,
  });
  final OneCallApi api;
  final String orderId;
  final bool providerView;
  @override
  State<TrackingPage> createState() => _TrackingPageState();
}

class _TrackingPageState extends State<TrackingPage>
    with WidgetsBindingObserver {
  static const _mapsEnabled = bool.fromEnvironment('ONECALL_MAPS_ENABLED');
  Map<String, dynamic>? _location;
  Timer? _timer;
  StreamSubscription<Position>? _positions;
  GoogleMapController? _map;
  bool _busy = false, _sharing = false, _posting = false;
  int _sharingGeneration = 0;
  String? _error;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _poll();
    unawaited(_load());
  }

  void _poll() {
    _timer?.cancel();
    _timer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => unawaited(_load()),
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _poll();
      unawaited(_load());
    } else {
      _timer?.cancel();
      unawaited(_stopSharing());
    }
  }

  Future<void> _load() async {
    if (_busy || !mounted) {
      return;
    }
    _busy = true;
    try {
      final order = await widget.api.order(widget.orderId);
      if (order.status != 'IN_PROGRESS') {
        await _stopSharing();
        _timer?.cancel();
        if (mounted) {
          setState(() {
            _location = null;
            _error = 'Location sharing has ended for this booking.';
          });
        }
        return;
      }
      final result =
          await widget.api.request(
                'GET',
                '/orders/' + widget.orderId + '/tracking',
              )
              as Map;
      if (mounted) {
        setState(() {
          _location = result['location'] == null
              ? null
              : Map<String, dynamic>.from(result['location'] as Map);
          _error = null;
        });
        if (_location != null && _map != null) {
          unawaited(_map!.animateCamera(CameraUpdate.newLatLng(_coordinates)));
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = errorMessage(e));
      }
    } finally {
      _busy = false;
    }
  }

  LatLng get _coordinates => LatLng(
    (_location!['latitude'] as num).toDouble(),
    (_location!['longitude'] as num).toDouble(),
  );
  Future<void> _stopSharing() async {
    _sharingGeneration++;
    final previous = _positions;
    _positions = null;
    if (mounted) {
      setState(() => _sharing = false);
    }
    await previous?.cancel();
  }

  Future<void> _share() async {
    if (_sharing) {
      await _stopSharing();
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Share your live location?'),
        content: const Text(
          'The customer for this booking can see your location while this screen stays open. Sharing stops when you leave the screen, put the app in the background, or finish the booking.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Share location'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) {
      return;
    }
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw const ApiFailure('Turn on your device location service.');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw const ApiFailure(
          'Location permission is required to share your position. You can enable it in device settings.',
        );
      }
      if (!mounted ||
          WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
        return;
      }
      final generation = ++_sharingGeneration;
      setState(() {
        _sharing = true;
        _error = null;
      });
      _positions =
          Geolocator.getPositionStream(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              distanceFilter: 20,
            ),
          ).listen(
            (p) {
              if (!mounted ||
                  !_sharing ||
                  _posting ||
                  generation != _sharingGeneration) {
                return;
              }
              unawaited(_post(p, generation));
            },
            onError: (Object e) {
              if (mounted) {
                setState(() => _error = 'Location is temporarily unavailable.');
              }
            },
          );
    } catch (e) {
      if (mounted) {
        setState(() => _error = errorMessage(e));
      }
    }
  }

  Future<void> _post(Position p, int generation) async {
    if (!mounted || generation != _sharingGeneration) {
      return;
    }
    _posting = true;
    try {
      await widget.api.request(
        'POST',
        '/orders/' + widget.orderId + '/location',
        body: {
          'latitude': p.latitude,
          'longitude': p.longitude,
          'accuracy': p.accuracy,
        },
      );
      if (mounted && generation == _sharingGeneration) {
        await _load();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = errorMessage(e));
      }
    } finally {
      _posting = false;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _sharingGeneration++;
    final positions = _positions;
    if (positions != null) {
      unawaited(positions.cancel());
    }
    _map?.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lastUpdate = _location == null
        ? null
        : DateTime.parse(_location!['updatedAt'] as String);
    final stale =
        lastUpdate != null &&
        DateTime.now().difference(lastUpdate) > const Duration(minutes: 2);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Live Tracking'),
        actions: [
          IconButton(
            onPressed: _load,
            tooltip: 'Refresh location',
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(22),
        children: [
          if (_error != null) ErrorNotice(_error!, onRetry: _load),
          if (_location == null)
            Container(
              height: 260,
              decoration: BoxDecoration(
                color: const Color(0xFFEAF2FF),
                borderRadius: BorderRadius.circular(15),
              ),
              child: const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.location_searching, size: 64, color: teal),
                  SizedBox(height: 18),
                  Text(
                    'Waiting for provider location',
                    style: TextStyle(fontSize: 19, color: navy),
                  ),
                  Padding(
                    padding: EdgeInsets.all(20),
                    child: Text(
                      'Your provider can share their position during an active booking.',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            )
          else if (_mapsEnabled)
            SizedBox(
              height: 340,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(15),
                child: GoogleMap(
                  initialCameraPosition: CameraPosition(
                    target: _coordinates,
                    zoom: 15,
                  ),
                  onMapCreated: (c) => _map = c,
                  myLocationButtonEnabled: false,
                  markers: {
                    Marker(
                      markerId: const MarkerId('provider'),
                      position: _coordinates,
                      infoWindow: InfoWindow(
                        title: stale
                            ? 'Last reported position'
                            : 'Provider position',
                      ),
                    ),
                  },
                ),
              ),
            )
          else
            Container(
              height: 230,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: const Color(0xFFEAF2FF),
                borderRadius: BorderRadius.circular(15),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.location_on, color: teal, size: 54),
                  const SizedBox(height: 16),
                  Text(
                    _coordinates.latitude.toStringAsFixed(5) +
                        ', ' +
                        _coordinates.longitude.toStringAsFixed(5),
                    style: const TextStyle(fontSize: 22, color: navy),
                  ),
                  const Text('Provider reported position'),
                ],
              ),
            ),
          if (_location != null) ...[
            const SizedBox(height: 18),
            Text(
              stale
                  ? 'This position is older than two minutes. Refresh for an update.'
                  : 'Last update: ' +
                        lastUpdate!.toLocal().toString().split('.').first,
            ),
            Text(
              'Accuracy: ' +
                  (_location!['accuracy'] as num).toStringAsFixed(0) +
                  ' metres',
            ),
            OutlinedButton.icon(
              onPressed: () => openExternal(
                context,
                Uri.https('www.google.com', '/maps/search/', {
                  'api': '1',
                  'query':
                      _coordinates.latitude.toString() +
                      ',' +
                      _coordinates.longitude.toString(),
                }),
              ),
              icon: const Icon(Icons.map_outlined),
              label: const Text('Open position in Maps'),
            ),
          ],
          if (widget.providerView)
            Padding(
              padding: const EdgeInsets.only(top: 22),
              child: BusyButton(
                label: _sharing ? 'Stop sharing location' : 'Share my location',
                busy: false,
                onPressed: _share,
              ),
            ),
          const SizedBox(height: 16),
          const Text(
            'The marker shows the provider’s reported location. Arrival times and navigation routes are not calculated here.',
            style: TextStyle(color: Colors.black54),
          ),
        ],
      ),
    );
  }
}

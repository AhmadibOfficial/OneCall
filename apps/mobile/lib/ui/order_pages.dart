import 'dart:async';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/models.dart';
import 'brand.dart';
import 'common.dart';
import 'finance_pages.dart';
import 'resource_widgets.dart';
import 'tracking_page.dart';
import 'location_picker.dart';
import 'design_widgets.dart';
import 'booking_photos.dart';

class RequestPage extends StatefulWidget {
  const RequestPage({
    super.key,
    required this.api,
    required this.service,
    this.state = 'Kaduna',
    this.city = 'Kaduna',
  });
  final OneCallApi api;
  final PilotService service;
  final String state, city;
  @override
  State<RequestPage> createState() => _RequestPageState();
}

class _RequestPageState extends State<RequestPage> {
  final _form = GlobalKey<FormState>();
  final _scroll = ScrollController();
  final _address = TextEditingController(),
      _landmark = TextEditingController(),
      _destination = TextEditingController(),
      _description = TextEditingController();
  late PilotService _service = widget.service;
  late String _state = widget.state, _city = widget.city;
  int _step = 0;
  bool _busy = false, _moving = false;
  String? _error;
  DateTime? _scheduled;
  String _vehicle = 'economy';

  String get _jobAddress => _landmark.text.trim().isEmpty
      ? _address.text.trim()
      : '${_address.text.trim()} · Landmark: ${_landmark.text.trim()}';

  void _go(int step) {
    if (_moving) return;
    _moving = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _moving = false;
    });
    FocusScope.of(context).unfocus();
    setState(() {
      _step = step;
      _error = null;
    });
    if (_scroll.hasClients) {
      _scroll.jumpTo(0);
    }
  }

  void _back() {
    if (_busy) return;
    if (_step > 0) {
      _go(_step - 1);
    } else {
      Navigator.maybePop(context);
    }
  }

  String? _addressError(String? value) {
    if ((value ?? '').trim().length < 5) {
      return 'Enter an address and nearby landmark';
    }
    if (_jobAddress.length > 300) {
      return 'Keep the combined address and landmark within 300 characters';
    }
    return null;
  }

  Future<void> _changeService() async {
    setState(() => _busy = true);
    try {
      final services = await widget.api.servicesForLocation(_state, _city);
      if (!mounted) return;
      final chosen = await showModalBottomSheet<PilotService>(
        context: context,
        isScrollControlled: true,
        builder: (context) => SafeArea(
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * .65,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Choose your service',
                  style: TextStyle(fontSize: 23, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                for (final service in services)
                  Card(
                    child: ListTile(
                      leading: ServiceGlyph(service.icon),
                      title: Text(service.name),
                      subtitle: Text(service.description),
                      trailing: service.key == _service.key
                          ? const Icon(Icons.check_circle, color: teal)
                          : null,
                      onTap: () => Navigator.pop(context, service),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
      if (mounted && chosen != null) setState(() => _service = chosen);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _location() async {
    final chosen = await chooseLocation(context, _state, _city);
    if (!mounted || chosen == null) return;
    final changed =
        chosen.state != _state ||
        chosen.city.trim().toLowerCase() != _city.trim().toLowerCase();
    setState(() {
      _state = chosen.state;
      _city = chosen.city;
      if (changed) {
        _address.clear();
        _landmark.clear();
      }
      _error = null;
    });
  }

  Future<void> _savedAddress() async {
    try {
      final values = await widget.api.request('GET', '/addresses') as List;
      if (!mounted) return;
      if (values.isEmpty) {
        notice(context, 'Save an address from your profile first.');
        return;
      }
      final result = await showModalBottomSheet<Map>(
        context: context,
        builder: (context) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: values.map((v) {
              final item = v as Map;
              return ListTile(
                leading: const Icon(Icons.home_outlined),
                title: Text(item['label'] as String),
                subtitle: Text(item['addressLine1'] as String),
                trailing: Text(item['city'] as String),
                onTap: () => Navigator.pop(context, item),
              );
            }).toList(),
          ),
        ),
      );
      if (!mounted || result == null) return;
      if (result['state'] != _state ||
          (result['city'] as String).trim().toLowerCase() !=
              _city.trim().toLowerCase()) {
        notice(
          context,
          'Choose a saved address in this city, or change the job location first.',
        );
        return;
      }
      setState(() {
        _address.text = result['addressLine1'] as String;
        _landmark.text = result['landmark'] as String? ?? '';
      });
    } catch (e) {
      if (mounted) notice(context, errorMessage(e));
    }
  }

  Future<void> _schedule({DateTime? day}) async {
    final now = DateTime.now();
    final date =
        day ??
        await showDatePicker(
          context: context,
          initialDate: _scheduled?.isAfter(now) == true ? _scheduled! : now,
          firstDate: now,
          lastDate: now.add(const Duration(days: 364)),
        );
    if (!mounted || date == null) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(
        _scheduled ?? now.add(const Duration(hours: 1)),
      ),
    );
    if (!mounted || time == null) return;
    final result = DateTime(
      date.year,
      date.month,
      date.day,
      time.hour,
      time.minute,
    );
    if (!result.isAfter(DateTime.now())) {
      notice(context, 'Choose a time in the future.');
      return;
    }
    setState(() => _scheduled = result);
  }

  void _next() {
    if (_busy || _moving || !_form.currentState!.validate()) return;
    _go(_step + 1);
  }

  Future<void> _submit() async {
    if (_busy) return;
    final error = _addressError(_address.text);
    if (error != null ||
        (_service.needsRoute && _destination.text.trim().length < 5)) {
      _go(2);
      setState(() => _error = error ?? 'Enter a destination address');
      return;
    }
    if (_scheduled != null && !_scheduled!.isAfter(DateTime.now())) {
      _go(3);
      setState(
        () => _error = 'The selected time has passed. Choose a new time.',
      );
      return;
    }
    if (widget.api.user?.canBook != true) {
      setState(
        () => _error =
            'Sign in and verify your email and phone before sending a request.',
      );
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final order = await widget.api.book(
        _service,
        _jobAddress,
        _description.text.trim(),
        state: _state,
        city: _city,
        pickupAddress: _service.needsRoute ? _jobAddress : null,
        destinationAddress: _service.needsRoute
            ? _destination.text.trim()
            : null,
        scheduledAt: _scheduled,
        vehicleType: _service.kind == 'ride' ? _vehicle : null,
      );
      if (!mounted) return;
      await Navigator.pushReplacement(
        context,
        MaterialPageRoute<void>(
          builder: (_) =>
              OrderDetailsPage(api: widget.api, initialOrder: order),
        ),
      );
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _reviewRow(IconData icon, String label, String value, int step) =>
      ListTile(
        leading: Icon(icon, color: navy),
        title: Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 11,
            color: Color(0xFF68768A),
            letterSpacing: 1,
          ),
        ),
        subtitle: Text(
          value,
          style: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w600,
            color: navy,
          ),
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: _busy ? null : () => _go(step),
      );

  List<Widget> _content() {
    switch (_step) {
      case 0:
        return [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ServiceGlyph(_service.icon, size: 76),
                  const SizedBox(height: 20),
                  Text(
                    _service.name,
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(_service.description),
                  const SizedBox(height: 20),
                  const Text(
                    'Your request is matched with providers covering your selected area. Availability is confirmed after assignment.',
                  ),
                ],
              ),
            ),
          ),
          TextButton.icon(
            onPressed: _busy ? null : _changeService,
            icon: const Icon(Icons.grid_view_outlined),
            label: const Text('Choose another service'),
          ),
        ];
      case 1:
        return [
          OneCallSection(
            title: 'Job details',
            children: [
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Help your provider understand the job.',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Text(
                      'Add the scope, measurements or symptoms. Notes are optional.',
                    ),
                    const SizedBox(height: 18),
                    TextFormField(
                      key: const ValueKey('request-description'),
                      controller: _description,
                      enabled: !_busy,
                      maxLength: 2000,
                      minLines: 5,
                      maxLines: 8,
                      decoration: const InputDecoration(
                        labelText: 'What do you need?',
                        hintText:
                            'For example: alter two kaftans and repair a zip.',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ];
      case 2:
        return [
          OneCallSection(
            title: 'Job location',
            children: [
              ListTile(
                leading: const Icon(Icons.location_on_outlined),
                title: Text('$_city, $_state'),
                subtitle: const Text(
                  'Change the state or town for this request',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: _busy ? null : _location,
              ),
              ListTile(
                leading: const Icon(Icons.bookmark_outline),
                title: const Text('Use saved address'),
                subtitle: const Text('Choose an address in your selected city'),
                trailing: const Icon(Icons.chevron_right),
                onTap: _busy ? null : _savedAddress,
              ),
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    TextFormField(
                      key: const ValueKey('request-address'),
                      controller: _address,
                      enabled: !_busy,
                      maxLength: 300,
                      maxLines: 2,
                      decoration: InputDecoration(
                        labelText: _service.needsRoute
                            ? 'Pickup address'
                            : 'Address and landmark',
                      ),
                      validator: _addressError,
                    ),
                    TextFormField(
                      key: const ValueKey('request-landmark'),
                      controller: _landmark,
                      enabled: !_busy,
                      maxLength: 120,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: 'Landmark or directions (optional)',
                      ),
                    ),
                    if (_service.needsRoute)
                      TextFormField(
                        key: const ValueKey('request-destination'),
                        controller: _destination,
                        enabled: !_busy,
                        maxLength: 300,
                        maxLines: 2,
                        decoration: const InputDecoration(
                          labelText: 'Destination address',
                        ),
                        validator: (value) => (value ?? '').trim().length < 5
                            ? 'Enter a destination address'
                            : null,
                      ),
                    if (_service.kind == 'ride') ...[
                      const SizedBox(height: 12),
                      SegmentedButton<String>(
                        segments: const [
                          ButtonSegment(
                            value: 'economy',
                            label: Text('Economy'),
                          ),
                          ButtonSegment(
                            value: 'comfort',
                            label: Text('Comfort'),
                          ),
                        ],
                        selected: {_vehicle},
                        onSelectionChanged: _busy
                            ? null
                            : (v) => setState(() => _vehicle = v.first),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ];
      case 3:
        final now = DateTime.now();
        const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return [
          const Text(
            'Choose a day',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 86,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: 7,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                final date = DateTime(now.year, now.month, now.day + index);
                final selected =
                    _scheduled != null && DateUtils.isSameDay(date, _scheduled);
                return OutlinedButton(
                  onPressed: _busy ? null : () => _schedule(day: date),
                  style: OutlinedButton.styleFrom(
                    backgroundColor: selected ? navy : Colors.white,
                    foregroundColor: selected ? Colors.white : navy,
                    padding: const EdgeInsets.symmetric(horizontal: 22),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(weekdays[date.weekday - 1]),
                      Text(
                        '${date.day}',
                        style: const TextStyle(
                          fontSize: 23,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 24),
          OneCallSection(
            title: 'Requested arrival',
            children: [
              ListTile(
                leading: const Icon(Icons.schedule),
                title: Text(
                  _scheduled == null
                      ? 'As soon as a provider is available'
                      : localDate(_scheduled!),
                ),
                subtitle: const Text(
                  'Timing is a request, subject to provider confirmation.',
                ),
                trailing: const Icon(Icons.edit_outlined),
                onTap: _busy ? null : () => _schedule(),
              ),
              TextButton.icon(
                onPressed: _busy
                    ? null
                    : () => setState(() => _scheduled = null),
                icon: const Icon(Icons.bolt),
                label: const Text('Use earliest availability'),
              ),
            ],
          ),
        ];
      default:
        return [
          OneCallSection(
            title: 'Confirm your request',
            children: [
              _reviewRow(
                serviceIcon(_service.icon),
                'Service',
                _service.name,
                0,
              ),
              _reviewRow(
                Icons.notes_outlined,
                'Details',
                _description.text.trim().isEmpty
                    ? 'No additional notes'
                    : _description.text.trim(),
                1,
              ),
              _reviewRow(
                Icons.location_on_outlined,
                'Where',
                '$_jobAddress\n$_city, $_state',
                2,
              ),
              if (_service.needsRoute)
                _reviewRow(
                  Icons.flag_outlined,
                  'Destination',
                  _destination.text.trim(),
                  2,
                ),
              _reviewRow(
                Icons.schedule,
                'When',
                _scheduled == null
                    ? 'Earliest provider availability'
                    : localDate(_scheduled!),
                3,
              ),
            ],
          ),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Provider quote',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Your assigned provider sends a quote. Review and accept it before work starts. Sending this request does not charge you; online payments are unavailable in this pilot.',
                  ),
                ],
              ),
            ),
          ),
        ];
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    _address.dispose();
    _landmark.dispose();
    _destination.dispose();
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy && _step == 0,
    onPopInvokedWithResult: (didPop, result) {
      if (!didPop && !_busy && _step > 0) _go(_step - 1);
    },
    child: Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: _busy ? null : _back,
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back),
        ),
        title: Text(
          [
            'What do you need?',
            'Describe your request',
            'Where is the job?',
            'When do you need it?',
            'Review & send',
          ][_step],
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(30),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                _service.name,
                style: const TextStyle(color: Colors.white70),
              ),
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: OneCallSteps(current: _step, onEdit: _busy ? null : _go),
          ),
          Expanded(
            child: Form(
              key: _form,
              child: ListView(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: [
                  ..._content(),
                  if (_error != null) ErrorNotice(_error!),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              BusyButton(
                label: _step == 4 ? 'Send request' : 'Continue',
                busy: _busy,
                onPressed: _step == 4 ? _submit : _next,
              ),
              if (_step == 4 &&
                  MediaQuery.viewInsetsOf(context).bottom == 0) ...[
                const SizedBox(height: 10),
                const Text(
                  'Review your quote before agreeing to work.',
                  style: TextStyle(color: Color(0xFF68768A), fontSize: 12),
                ),
              ],
            ],
          ),
        ),
      ),
    ),
  );
}

String localDate(DateTime date) {
  final d = date.toLocal();
  return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

class BookingsPanel extends StatefulWidget {
  const BookingsPanel({
    super.key,
    required this.api,
    this.providerView = false,
  });
  final OneCallApi api;
  final bool providerView;
  @override
  State<BookingsPanel> createState() => _BookingsPanelState();
}

class _BookingsPanelState extends State<BookingsPanel> {
  bool _history = false;
  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('Upcoming')),
            ButtonSegment(value: true, label: Text('History')),
          ],
          selected: {_history},
          onSelectionChanged: (v) => setState(() => _history = v.first),
        ),
      ),
      Expanded(
        child: ResourceList(
          key: ValueKey(_history),
          load: () async => (await widget.api.orders())
              .where(
                (o) =>
                    o.isFinished == _history &&
                    (widget.providerView
                        ? (o.provider?['uid'] == widget.api.user?.uid)
                        : (o.provider?['uid'] != widget.api.user?.uid)),
              )
              .toList(),
          emptyText: _history
              ? 'Your completed and cancelled bookings will appear here.'
              : 'You have no upcoming bookings.',
          itemBuilder: (context, item, reload) => bookingTile(
            context,
            widget.api,
            item as ServiceOrder,
            reload,
            providerView: widget.providerView,
          ),
        ),
      ),
    ],
  );
}

Widget bookingTile(
  BuildContext context,
  OneCallApi api,
  ServiceOrder order,
  VoidCallback reload, {
  bool providerView = false,
}) => Card(
  margin: const EdgeInsets.only(bottom: 14),
  child: InkWell(
    borderRadius: BorderRadius.circular(12),
    onTap: () async {
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => OrderDetailsPage(
            api: api,
            initialOrder: order,
            providerView: providerView,
          ),
        ),
      );
      reload();
    },
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            order.serviceName,
            style: const TextStyle(
              fontSize: 19,
              color: navy,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text('${order.city}, ${order.state}'),
          const SizedBox(height: 8),
          Text(localDate(order.scheduledAt ?? order.createdAt)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: StatusBadge(order.status, order.statusLabel)),
              const Icon(Icons.chevron_right),
            ],
          ),
          if (order.amount != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                '₦${order.amount!}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
        ],
      ),
    ),
  ),
);

// Keep the original public widget available for existing navigation and tests.
class OrderPage extends OrderDetailsPage {
  const OrderPage({super.key, required super.api, required super.initialOrder});
}

class OrderDetailsPage extends StatefulWidget {
  const OrderDetailsPage({
    super.key,
    required this.api,
    required this.initialOrder,
    this.providerView = false,
  });
  final OneCallApi api;
  final ServiceOrder initialOrder;
  final bool providerView;
  @override
  State<OrderDetailsPage> createState() => _OrderDetailsPageState();
}

class _OrderDetailsPageState extends State<OrderDetailsPage>
    with WidgetsBindingObserver {
  late ServiceOrder _order;
  Timer? _timer;
  bool _busy = false;
  String? _error;
  bool get _provider =>
      widget.providerView && _order.provider?['uid'] == widget.api.user?.uid;
  @override
  void initState() {
    super.initState();
    _order = widget.initialOrder;
    WidgetsBinding.instance.addObserver(this);
    _poll();
    unawaited(_refresh());
  }

  void _poll() {
    _timer?.cancel();
    if (!_order.isFinished) {
      _timer = Timer.periodic(const Duration(seconds: 15), (_) {
        if (!_busy) {
          unawaited(_refresh());
        }
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _poll();
      unawaited(_refresh());
    } else {
      _timer?.cancel();
    }
  }

  Future<void> _refresh() async {
    if (_busy || !mounted) {
      return;
    }
    setState(() => _busy = true);
    try {
      final o = await widget.api.order(_order.id);
      if (mounted) {
        setState(() {
          _order = o;
          _error = null;
          if (o.isFinished) {
            _timer?.cancel();
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = errorMessage(e));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _action(String action, {Map<String, dynamic>? body}) async {
    if (_busy) {
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.request(
        'POST',
        '/orders/${_order.id}/$action',
        body: body ?? {},
      );
    } catch (e) {
      if (mounted) {
        setState(() => _error = errorMessage(e));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
    if (mounted && _error == null) {
      await _refresh();
    }
  }

  Future<void> _quote() async {
    final amount = await amountDialog(context, 'Send a quote');
    if (amount != null && mounted) {
      await _action('quote', body: {'amount': amount});
    }
  }

  Future<void> _cancel() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this request?'),
        content: const Text('Your provider will be notified.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep request'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel request'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted || _busy) {
      return;
    }
    setState(() => _busy = true);
    try {
      final result = await widget.api.cancelOrder(_order.id);
      if (mounted) {
        setState(() {
          _order = result;
          _error = null;
          _timer?.cancel();
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = errorMessage(e));
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _contact() async {
    try {
      String? phone = _order.provider?['phone'] as String?;
      if (_provider) {
        final data =
            await widget.api.request(
                  'GET',
                  '/orders/${_order.id}/customer-contact',
                )
                as Map;
        phone = data['phone'] as String?;
      }
      if (phone != null && phone.isNotEmpty && mounted) {
        await openExternal(context, Uri(scheme: 'tel', path: phone));
      }
    } catch (e) {
      if (mounted) {
        notice(context, errorMessage(e));
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Request status'),
      actions: [
        IconButton(
          tooltip: 'Refresh status',
          onPressed: _busy ? null : _refresh,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(22),
        children: [
          BookingPhotos(
            api: widget.api,
            orderId: _order.id,
            closed: _order.isFinished,
          ),
          Text(
            _order.serviceName,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.bold,
              color: navy,
            ),
          ),
          const SizedBox(height: 14),
          Align(
            alignment: Alignment.centerLeft,
            child: StatusBadge(_order.status, _order.statusLabel),
          ),
          if (_busy) const LinearProgressIndicator(),
          if (_error != null) ErrorNotice(_error!, onRetry: _refresh),
          const SizedBox(height: 18),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Service area: ${_order.city}, ${_order.state}'),
                  const Divider(height: 24),
                  Text(
                    _order.pickupAddress ??
                        _order.address ??
                        'Address not provided',
                  ),
                  if (_order.destinationAddress != null)
                    Text('To: ${_order.destinationAddress!}'),
                  if (_order.scheduledAt != null)
                    Text('Requested time: ${localDate(_order.scheduledAt!)}'),
                  if ((_order.description ?? '').isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(_order.description!),
                    ),
                  const Divider(height: 24),
                  SelectableText(
                    'Request ID: ${_order.id}',
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                ],
              ),
            ),
          ),
          if (_order.provider != null)
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const CircleAvatar(child: Icon(Icons.person)),
                    title: Text(
                      _order.provider!['name'] as String? ??
                          'Assigned provider',
                    ),
                    subtitle: Text(
                      _order.provider!['vehicleDescription'] as String? ??
                          'Your service provider',
                    ),
                  ),
                  if (!_order.isFinished)
                    Row(
                      children: [
                        Expanded(
                          child: TextButton.icon(
                            onPressed: _contact,
                            icon: const Icon(Icons.phone_outlined),
                            label: Text(
                              _provider ? 'Call customer' : 'Call provider',
                            ),
                          ),
                        ),
                        Expanded(
                          child: TextButton.icon(
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute<void>(
                                builder: (_) => ChatPage(
                                  api: widget.api,
                                  orderId: _order.id,
                                ),
                              ),
                            ),
                            icon: const Icon(Icons.chat_bubble_outline),
                            label: const Text('Chat'),
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Price and payment',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: navy,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _order.quote == null
                        ? 'Price: awaiting a quote'
                        : 'Quote: ₦${_order.quote!['amount']}',
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (_order.quote != null)
                    Text(
                      _order.quote!['acceptedAt'] != null
                          ? 'Quote accepted'
                          : 'Awaiting customer approval',
                    ),
                  if (_order.paymentStatus != null)
                    Text('Payment: ${_order.paymentStatus!}'),
                  if (!_provider &&
                      _order.status == 'ACCEPTED' &&
                      _order.quote != null &&
                      _order.quote!['acceptedAt'] == null)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: BusyButton(
                        label: 'Accept quote',
                        busy: _busy,
                        onPressed: () => _action(
                          'quote/accept',
                          body: {'quoteId': _order.quote!['id']},
                        ),
                      ),
                    ),
                  if (!_provider &&
                      _order.quote?['acceptedAt'] != null &&
                      _order.paymentStatus != 'SUCCEEDED' &&
                      _order.status != 'CANCELLED')
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: BusyButton(
                        label: 'Choose payment method',
                        busy: _busy,
                        onPressed: () async {
                          await Navigator.push(
                            context,
                            MaterialPageRoute<void>(
                              builder: (_) =>
                                  PaymentPage(api: widget.api, order: _order),
                            ),
                          );
                          if (mounted) {
                            await _refresh();
                          }
                        },
                      ),
                    ),
                  if (_provider &&
                      _order.status == 'ACCEPTED' &&
                      _order.amount == null)
                    TextButton.icon(
                      onPressed: _busy ? null : _quote,
                      icon: const Icon(Icons.receipt_long),
                      label: const Text('Send or revise quote'),
                    ),
                ],
              ),
            ),
          ),
          if (_order.status == 'IN_PROGRESS')
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: FilledButton.icon(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => TrackingPage(
                      api: widget.api,
                      orderId: _order.id,
                      providerView: _provider,
                    ),
                  ),
                ),
                icon: const Icon(Icons.location_on),
                label: Text(_provider ? 'Share location' : 'Live Tracking'),
              ),
            ),
          if (_provider &&
              _order.status == 'ACCEPTED' &&
              _order.quote?['acceptedAt'] != null)
            BusyButton(
              label: 'Start work',
              busy: _busy,
              onPressed: () => _action('start'),
            ),
          if (_provider && _order.status == 'IN_PROGRESS')
            BusyButton(
              label: 'Mark completed',
              busy: _busy,
              onPressed: () => _action('complete'),
            ),
          const SizedBox(height: 18),
          const Text(
            'Progress',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          if (_order.status == 'CANCELLED')
            const ListTile(
              leading: Icon(Icons.cancel_outlined),
              title: Text('Request cancelled'),
            )
          else
            ...[
              'PENDING',
              'ACCEPTED',
              'IN_PROGRESS',
              'COMPLETED',
            ].asMap().entries.map((entry) {
              final done =
                  entry.key <=
                  [
                    'PENDING',
                    'ACCEPTED',
                    'IN_PROGRESS',
                    'COMPLETED',
                  ].indexOf(_order.status);
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  done ? Icons.check_circle : Icons.radio_button_unchecked,
                  color: done ? teal : Colors.grey,
                ),
                title: Text(
                  [
                    'Request sent',
                    'Provider accepted',
                    'Work in progress',
                    'Completed',
                  ][entry.key],
                ),
              );
            }),
          if (!_order.isFinished)
            const Text(
              'Status refreshes every 15 seconds while this screen is active.',
              style: TextStyle(fontSize: 12, color: Colors.black54),
            ),
          if (!_provider && _order.canCancel)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: OutlinedButton(
                onPressed: _busy ? null : _cancel,
                child: const Text('Cancel request'),
              ),
            ),
        ],
      ),
    ),
  );
}

/// Conversations are derived from the server's participant-scoped bookings.
/// No message bodies, addresses or contact details are fetched for the inbox.
class ChatInboxPanel extends StatelessWidget {
  const ChatInboxPanel({super.key, required this.api});
  final OneCallApi api;

  @override
  Widget build(BuildContext context) => ResourceList(
    load: () async =>
        (await api.orders()).where((order) => order.providerAssigned).toList()
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt)),
    emptyText:
        'Your booking conversations appear here once a provider is assigned.',
    itemBuilder: (context, item, reload) {
      final order = item as ServiceOrder;
      return Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: ListTile(
          contentPadding: const EdgeInsets.all(16),
          leading: const CircleAvatar(child: Icon(Icons.chat_bubble_outline)),
          title: Text(order.serviceName),
          subtitle: Text('${order.statusLabel}\nBooking ${order.id}'),
          isThreeLine: true,
          trailing: const Icon(Icons.chevron_right),
          onTap: () async {
            await Navigator.push<void>(
              context,
              MaterialPageRoute<void>(
                builder: (_) => ChatPage(api: api, orderId: order.id),
              ),
            );
            reload();
          },
        ),
      );
    },
  );
}

class ChatPage extends StatefulWidget {
  const ChatPage({super.key, required this.api, required this.orderId});
  final OneCallApi api;
  final String orderId;
  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> with WidgetsBindingObserver {
  final _text = TextEditingController();
  List<dynamic> _messages = [];
  Timer? _timer;
  bool _loading = false, _sending = false;
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
      const Duration(seconds: 10),
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
    }
  }

  Future<void> _load() async {
    if (_loading || !mounted) {
      return;
    }
    _loading = true;
    try {
      final data =
          await widget.api.request('GET', '/orders/${widget.orderId}/messages')
              as List;
      if (mounted) {
        setState(() {
          _messages = data;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = errorMessage(e));
      }
    } finally {
      _loading = false;
    }
  }

  Future<void> _send() async {
    if (_sending || _text.text.trim().isEmpty) {
      return;
    }
    setState(() => _sending = true);
    try {
      await widget.api.request(
        'POST',
        '/orders/${widget.orderId}/messages',
        body: {'text': _text.text.trim()},
      );
      if (mounted) {
        _text.clear();
      }
      await _load();
    } catch (e) {
      if (mounted) {
        setState(() => _error = errorMessage(e));
      }
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _text.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Booking chat')),
    body: Column(
      children: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ErrorNotice(_error!, onRetry: _load),
          ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(18),
            children: [
              if (_messages.isEmpty)
                const Text(
                  'Send a message to discuss this booking. Avoid sharing passwords, payment card details or verification codes.',
                ),
              ..._messages.map((v) {
                final m = v as Map;
                final mine = m['mine'] == true;
                return Align(
                  alignment: mine
                      ? Alignment.centerRight
                      : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    constraints: const BoxConstraints(maxWidth: 300),
                    decoration: BoxDecoration(
                      color: mine ? navy : const Color(0xFFEAF2FF),
                      borderRadius: BorderRadius.circular(15),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          m['text'] as String,
                          style: TextStyle(color: mine ? Colors.white : navy),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          localDate(DateTime.parse(m['createdAt'] as String)),
                          style: TextStyle(
                            color: mine ? Colors.white70 : Colors.black54,
                            fontSize: 10,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextField(
                    controller: _text,
                    maxLength: 1000,
                    maxLines: 3,
                    minLines: 1,
                    decoration: const InputDecoration(
                      hintText: 'Message your provider or customer',
                    ),
                  ),
                ),
                IconButton(
                  onPressed: _sending ? null : _send,
                  color: teal,
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

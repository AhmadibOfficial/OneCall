import 'dart:math';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/models.dart';
import 'common.dart';
import 'resource_widgets.dart';

String parcelStatus(Object? value) =>
    (value ?? '').toString().replaceAll('_', ' ').toLowerCase();
String parcelMoney(Object? value) =>
    '₦${((value as num?) ?? 0) ~/ 100}.${(((value as num?) ?? 0) % 100).toInt().toString().padLeft(2, '0')}';
String _shop(Map data) =>
    '${data['shopName']} · ${data['city']}, ${data['state']}';
String _reference() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

Widget _pageBody(List<Widget> children) => Center(
  child: ConstrainedBox(
    constraints: const BoxConstraints(maxWidth: 780),
    child: ListView(padding: const EdgeInsets.all(20), children: children),
  ),
);
Widget _stateField(String value, ValueChanged<String> changed) =>
    DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'State'),
      items: nigeriaStates
          .map((s) => DropdownMenuItem(value: s, child: Text(s)))
          .toList(),
      onChanged: (v) {
        if (v != null) changed(v);
      },
    );
String? _required(String? value) =>
    (value ?? '').trim().length < 5 ? 'Enter at least 5 characters' : null;

class ParcelListPage extends StatefulWidget {
  const ParcelListPage({
    super.key,
    required this.api,
    this.agentOnly = false,
    this.state = 'Kaduna',
    this.city = 'Kaduna',
  });
  final OneCallApi api;
  final bool agentOnly;
  final String state, city;
  @override
  State<ParcelListPage> createState() => _ParcelListPageState();
}

class _ParcelListPageState extends State<ParcelListPage> {
  final List<Map> _items = [];
  String? _cursor, _error;
  bool _loading = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool more = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final path = widget.agentOnly ? '/parcels/agent/jobs' : '/parcels';
      final result =
          await widget.api.request(
                'GET',
                '$path${more && _cursor != null ? '?before=$_cursor' : ''}',
              )
              as Map;
      if (!mounted) return;
      setState(() {
        if (!more) _items.clear();
        _items.addAll((result['items'] as List).cast<Map>());
        _cursor = result['nextCursor'] as String?;
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open(Widget page) async {
    await Navigator.push(
      context,
      MaterialPageRoute<void>(builder: (_) => page),
    );
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.agentOnly ? 'Parcel shop jobs' : 'My parcels'),
      actions: [
        IconButton(
          tooltip: 'Refresh parcels',
          onPressed: _loading ? null : () => _load(),
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: _pageBody([
      const Text(
        'Motor-park parcel delivery',
        style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold),
      ),
      const SizedBox(height: 8),
      const Text(
        'Book a route between approved OneCall shops. Tracking shows recorded custody handovers; it is not continuous GPS. Availability depends on approved routes.',
      ),
      const SizedBox(height: 16),
      if (!widget.agentOnly)
        FilledButton.icon(
          onPressed: () => _open(
            ParcelRoutesPage(
              api: widget.api,
              state: widget.state,
              city: widget.city,
            ),
          ),
          icon: const Icon(Icons.add),
          label: const Text('Send a parcel'),
        ),
      if (_loading) const LinearProgressIndicator(),
      if (_error != null) ErrorNotice(_error!, onRetry: () => _load()),
      if (!_loading && _error == null && _items.isEmpty)
        const EmptyNotice(
          'No parcels yet. Your outgoing and incoming parcels will appear here.',
        ),
      for (final row in _items)
        Card(
          child: ListTile(
            leading: const Icon(Icons.inventory_2_outlined),
            title: Text(row['reference'] as String),
            subtitle: Text(
              '${parcelStatus(row['status'])}\n${_shop(row['destinationAgent'] as Map)}',
            ),
            isThreeLine: true,
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _open(
              ParcelDetailPage(api: widget.api, id: row['id'] as String),
            ),
          ),
        ),
      if (_cursor != null)
        TextButton(
          onPressed: _loading ? null : () => _load(more: true),
          child: const Text('Load older parcels'),
        ),
    ]),
  );
}

class ParcelRoutesPage extends StatefulWidget {
  const ParcelRoutesPage({
    super.key,
    required this.api,
    required this.state,
    required this.city,
  });
  final OneCallApi api;
  final String state, city;
  @override
  State<ParcelRoutesPage> createState() => _ParcelRoutesPageState();
}

class _ParcelRoutesPageState extends State<ParcelRoutesPage> {
  late String _state = widget.state;
  late final _city = TextEditingController(text: widget.city);
  String? _destination;
  int _revision = 0;
  @override
  void dispose() {
    _city.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Choose a parcel route')),
    body: Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              _stateField(
                _state,
                (v) => setState(() {
                  _state = v;
                  _city.clear();
                }),
              ),
              TextField(
                controller: _city,
                maxLength: 60,
                decoration: const InputDecoration(
                  labelText: 'Origin city (optional)',
                ),
              ),
              DropdownButtonFormField<String>(
                initialValue: _destination,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Destination state',
                ),
                items: [
                  const DropdownMenuItem(
                    value: '',
                    child: Text('All destination states'),
                  ),
                  ...nigeriaStates.map(
                    (s) => DropdownMenuItem(value: s, child: Text(s)),
                  ),
                ],
                onChanged: (v) => setState(() => _destination = v),
              ),
              FilledButton(
                onPressed: () {
                  FocusScope.of(context).unfocus();
                  setState(() => _revision++);
                },
                child: const Text('Find routes'),
              ),
            ],
          ),
        ),
        Expanded(
          child: ResourceList(
            key: ValueKey(_revision),
            load: () async {
              final params = {
                'state': _state,
                if (_city.text.trim().isNotEmpty) 'city': _city.text.trim(),
                if ((_destination ?? '').isNotEmpty)
                  'destinationState': _destination!,
              };
              return await widget.api.request(
                    'GET',
                    '/parcels/routes?${Uri(queryParameters: params).query}',
                  )
                  as List;
            },
            emptyText:
                'No approved route matches this search. Try another city or state. OneCall does not yet have agents in every area.',
            itemBuilder: (context, item, reload) {
              final route = item as Map;
              return Card(
                child: ListTile(
                  title: Text(
                    '${_shop(route['originAgent'] as Map)} → ${_shop(route['destinationAgent'] as Map)}',
                  ),
                  subtitle: Text(
                    '${parcelMoney(route['priceKobo'])} · up to ${(route['maxWeightGrams'] as num) / 1000} kg\nEstimated transit: ${route['estimatedHours']} hours after dispatch',
                  ),
                  isThreeLine: true,
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) =>
                          ParcelBookingPage(api: widget.api, route: route),
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

class ParcelBookingPage extends StatefulWidget {
  const ParcelBookingPage({super.key, required this.api, required this.route});
  final OneCallApi api;
  final Map route;
  @override
  State<ParcelBookingPage> createState() => _ParcelBookingPageState();
}

class _ParcelBookingPageState extends State<ParcelBookingPage> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController(),
      _phone = TextEditingController(),
      _description = TextEditingController(),
      _weight = TextEditingController(),
      _address = TextEditingController();
  final _clientReference = _reference();
  String _category = 'GENERAL', _mode = 'SHOP_DROP_OFF';
  bool _terms = false, _quote = false, _busy = false;
  String? _error;
  int get _price =>
      (widget.route['priceKobo'] as num).toInt() +
      (_mode == 'HOME_PICKUP'
          ? (widget.route['homePickupFeeKobo'] as num).toInt()
          : 0);
  @override
  void dispose() {
    for (final c in [_name, _phone, _description, _weight, _address]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _send() async {
    if (_busy || !_form.currentState!.validate()) return;
    if (!_terms || !_quote) {
      setState(
        () => _error = 'Confirm the permitted items and route price first.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result =
          await widget.api.request(
                'POST',
                '/parcels',
                body: {
                  'routeId': widget.route['id'],
                  'clientReference': _clientReference,
                  'recipientName': _name.text.trim(),
                  'recipientPhone': _phone.text.trim(),
                  'description': _description.text.trim(),
                  'category': _category,
                  'weightGrams': int.parse(_weight.text.trim()),
                  'pickupMode': _mode,
                  if (_mode == 'HOME_PICKUP')
                    'pickupAddress': _address.text.trim(),
                  'permittedItemsConfirmed': true,
                  'quoteAccepted': true,
                  'expectedPriceKobo': _price,
                },
              )
              as Map;
      if (!mounted) return;
      await Navigator.pushReplacement(
        context,
        MaterialPageRoute<void>(
          builder: (_) =>
              ParcelDetailPage(api: widget.api, id: result['id'] as String),
        ),
      );
    } catch (e) {
      if (mounted)
        setState(
          () => _error =
              '${errorMessage(e)} If the response was lost, check My parcels before starting a different request. Retry here keeps the same booking reference.',
        );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: Scaffold(
      appBar: AppBar(title: const Text('Send a parcel')),
      body: Form(
        key: _form,
        child: _pageBody([
          Text(
            _shop(widget.route['originAgent'] as Map),
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          Text('Drop-off: ${(widget.route['originAgent'] as Map)['address']}'),
          const SizedBox(height: 12),
          Text('To: ${_shop(widget.route['destinationAgent'] as Map)}'),
          Text(
            'Collection: ${(widget.route['destinationAgent'] as Map)['address']}',
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _name,
            enabled: !_busy,
            maxLength: 120,
            decoration: const InputDecoration(labelText: 'Recipient name'),
            validator: (v) =>
                (v ?? '').trim().length < 2 ? 'Enter recipient name' : null,
          ),
          TextFormField(
            controller: _phone,
            enabled: !_busy,
            maxLength: 14,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Recipient Nigerian phone',
              hintText: '08012345678 or +2348012345678',
            ),
            validator: (v) =>
                RegExp(r'^(?:\+234|0)[789]\d{9}$').hasMatch((v ?? '').trim())
                ? null
                : 'Enter a valid Nigerian mobile number',
          ),
          TextFormField(
            controller: _description,
            enabled: !_busy,
            maxLength: 1000,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Contents and packaging',
            ),
            validator: _required,
          ),
          DropdownButtonFormField<String>(
            initialValue: _category,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Parcel category'),
            items:
                ['GENERAL', 'TEXTILES', 'DOCUMENTS', 'DRY_GOODS', 'ELECTRONICS']
                    .map(
                      (v) => DropdownMenuItem(
                        value: v,
                        child: Text(parcelStatus(v)),
                      ),
                    )
                    .toList(),
            onChanged: _busy ? null : (v) => setState(() => _category = v!),
          ),
          TextFormField(
            controller: _weight,
            enabled: !_busy,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: 'Weight in grams',
              helperText:
                  '1000 grams = 1 kg. Maximum ${widget.route['maxWeightGrams']} grams.',
            ),
            validator: (v) {
              final n = int.tryParse((v ?? '').trim());
              return n == null ||
                      n < 100 ||
                      n > (widget.route['maxWeightGrams'] as num)
                  ? 'Enter a weight within the route limit'
                  : null;
            },
          ),
          if (widget.route['homePickup'] == true)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Collect from my address'),
              subtitle: Text(
                'Adds ${parcelMoney(widget.route['homePickupFeeKobo'])}. Subject to origin shop coordination.',
              ),
              value: _mode == 'HOME_PICKUP',
              onChanged: _busy
                  ? null
                  : (v) => setState(
                      () => _mode = v ? 'HOME_PICKUP' : 'SHOP_DROP_OFF',
                    ),
            ),
          if (_mode == 'HOME_PICKUP')
            TextFormField(
              controller: _address,
              enabled: !_busy,
              maxLength: 300,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Pickup address and landmark',
              ),
              validator: _required,
            ),
          const SizedBox(height: 18),
          Text(
            'Route quote: ${parcelMoney(_price)}',
            style: const TextStyle(fontSize: 23, fontWeight: FontWeight.bold),
          ),
          const Text(
            'Online payments and agent wallet payouts are not enabled. This request does not charge you or create a protected payment hold. Confirm arrangements with the shop before handing over your parcel.',
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: _terms,
            onChanged: _busy ? null : (v) => setState(() => _terms = v!),
            title: const Text(
              'My parcel is safely packed and contains no prohibited items',
            ),
            subtitle: const Text(
              'No weapons, explosives, illegal goods, cash, live animals, hazardous materials or perishable goods. Declare contents accurately; shop inspection is required.',
            ),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: _quote,
            onChanged: _busy ? null : (v) => setState(() => _quote = v!),
            title: Text('I accept the ${parcelMoney(_price)} route quote'),
            subtitle: const Text(
              'Wait for shop acceptance. Transit estimates are not guaranteed arrival times. OneCall does not offer parcel insurance in this pilot.',
            ),
          ),
          if (_error != null) ErrorNotice(_error!),
          BusyButton(
            label: 'Send parcel request',
            busy: _busy,
            onPressed: _send,
          ),
        ]),
      ),
    ),
  );
}

class ParcelDetailPage extends StatefulWidget {
  const ParcelDetailPage({super.key, required this.api, required this.id});
  final OneCallApi api;
  final String id;
  @override
  State<ParcelDetailPage> createState() => _ParcelDetailPageState();
}

class _ParcelDetailPageState extends State<ParcelDetailPage> {
  Map? _parcel, _code;
  bool _loading = false, _busy = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result =
          await widget.api.request('GET', '/parcels/${widget.id}') as Map;
      if (mounted) setState(() => _parcel = result);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _action(String path, {String? action, bool code = false}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      Map<String, dynamic> body = {};
      if (path != 'collection-code') {
        final text = await showDialog<String>(
          context: context,
          builder: (_) => _ParcelInput(
            code: code,
            title: code
                ? 'Confirm parcel collection'
                : path == 'move'
                ? 'Record custody handover'
                : 'Explain your request',
          ),
        );
        if (!mounted || text == null) return;
        body = code
            ? {'code': text}
            : path == 'move'
            ? {'action': action, 'note': text}
            : {'reason': text};
      }
      final result =
          await widget.api.request(
                'POST',
                '/parcels/${widget.id}/$path',
                body: body,
              )
              as Map;
      if (!mounted) return;
      if (path == 'collection-code') {
        setState(() => _code = result);
      } else if (path == 'support') {
        notice(
          context,
          'Support request recorded. View Support in your profile for the response.',
        );
      } else {
        setState(() => _code = null);
      }
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _parcel;
    final sender = p?['role'] == 'sender',
        origin = p?['agentSide'] == 'origin',
        destination = p?['agentSide'] == 'destination';
    final status = p?['status'];
    String? move, moveLabel;
    if (origin) {
      if (status == 'REQUESTED') {
        move = 'accept';
        moveLabel = 'Accept parcel request';
      }
      if (status == 'ACCEPTED') {
        move = 'receive';
        moveLabel = 'Confirm parcel received at origin';
      }
      if (status == 'AT_ORIGIN') {
        move = 'dispatch';
        moveLabel = 'Record departure';
      }
      if (status == 'RETURN_IN_TRANSIT') {
        move = 'return-arrive';
        moveLabel = 'Confirm return arrival';
      }
    }
    if (destination) {
      if (status == 'IN_TRANSIT') {
        move = 'arrive';
        moveLabel = 'Confirm arrival at destination';
      }
      if (status == 'RETURN_REQUESTED') {
        move = 'return-dispatch';
        moveLabel = 'Record return departure';
      }
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Parcel tracking'),
        actions: [
          IconButton(
            tooltip: 'Refresh parcel status',
            onPressed: _loading || _busy ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _pageBody([
        if (_loading || _busy) const LinearProgressIndicator(),
        if (_error != null) ErrorNotice(_error!, onRetry: _load),
        if (p != null) ...[
          SelectableText(
            p['reference'] as String,
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          Text(parcelStatus(status), style: const TextStyle(fontSize: 20)),
          const Text(
            'Agent custody updates · refresh for the latest recorded handover',
          ),
          const SizedBox(height: 18),
          Text(
            'From: ${_shop(p['originAgent'] as Map)}\n${(p['originAgent'] as Map)['address']}',
          ),
          const SizedBox(height: 12),
          Text(
            'To: ${_shop(p['destinationAgent'] as Map)}\n${(p['destinationAgent'] as Map)['address']}',
          ),
          const SizedBox(height: 12),
          Text('Recipient: ${p['recipientName']}\n${p['recipientPhone']}'),
          Text(
            'Contents: ${p['description']}\nWeight: ${p['weightGrams']} g\nRoute quote: ${parcelMoney(p['priceKobo'])}',
          ),
          if (p['pickupAddress'] != null)
            Text('Home pickup: ${p['pickupAddress']}'),
          const Text(
            'No online payment or wallet payout has been collected by OneCall.',
          ),
          const Divider(height: 32),
          if (sender && ['REQUESTED', 'ACCEPTED'].contains(status))
            OutlinedButton(
              onPressed: _busy ? null : () => _action('cancel'),
              child: const Text('Cancel parcel request'),
            ),
          if (sender &&
              [
                'AT_ORIGIN',
                'IN_TRANSIT',
                'READY_FOR_COLLECTION',
              ].contains(status))
            OutlinedButton(
              onPressed: _busy ? null : () => _action('return'),
              child: const Text('Request return to origin'),
            ),
          if (sender &&
              [
                'READY_FOR_COLLECTION',
                'READY_FOR_RETURN',
              ].contains(status)) ...[
            FilledButton(
              onPressed: _busy ? null : () => _action('collection-code'),
              child: const Text('Create or replace collection code'),
            ),
            const Text(
              'Only the sender can create a code. A replacement invalidates the previous code. Maximum three issues per day for each collection stage.',
            ),
          ],
          if (_code != null &&
              ['READY_FOR_COLLECTION', 'READY_FOR_RETURN'].contains(status))
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SelectableText(
                      _code!['code'] as String,
                      style: const TextStyle(
                        fontSize: 32,
                        letterSpacing: 6,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text('Expires: ${_code!['expiresAt']}'),
                    Text(_code!['instruction'] as String),
                    const Text(
                      'This code is not saved on your device. Keep it private until collection.',
                    ),
                  ],
                ),
              ),
            ),
          if (move != null)
            FilledButton(
              onPressed: _busy ? null : () => _action('move', action: move),
              child: Text(moveLabel!),
            ),
          if ((destination && status == 'READY_FOR_COLLECTION') ||
              (origin && status == 'READY_FOR_RETURN'))
            FilledButton(
              onPressed: _busy ? null : () => _action('collect', code: true),
              child: const Text('Verify code and hand over parcel'),
            ),
          TextButton.icon(
            onPressed: _busy ? null : () => _action('support'),
            icon: const Icon(Icons.support_agent),
            label: const Text('Report a parcel problem'),
          ),
          const SizedBox(height: 16),
          const Text(
            'Custody history',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          for (final event in p['events'] as List)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.check_circle_outline),
              title: Text(parcelStatus((event as Map)['status'])),
              subtitle: Text('${event['note']}\n${event['createdAt']}'),
            ),
        ],
      ]),
    );
  }
}

class _ParcelInput extends StatefulWidget {
  const _ParcelInput({required this.code, required this.title});
  final bool code;
  final String title;
  @override
  State<_ParcelInput> createState() => _ParcelInputState();
}

class _ParcelInputState extends State<_ParcelInput> {
  final _controller = TextEditingController();
  final _form = GlobalKey<FormState>();
  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.title),
    scrollable: true,
    content: Form(
      key: _form,
      child: TextFormField(
        controller: _controller,
        autofocus: true,
        maxLength: widget.code ? 6 : 500,
        maxLines: widget.code ? 1 : 3,
        obscureText: widget.code,
        enableSuggestions: !widget.code,
        autocorrect: !widget.code,
        keyboardType: widget.code
            ? TextInputType.number
            : TextInputType.multiline,
        decoration: InputDecoration(
          labelText: widget.code
              ? 'Six-digit collection code'
              : 'Details (10+ characters)',
        ),
        validator: (v) => widget.code
            ? (RegExp(r'^\d{6}$').hasMatch(v ?? '')
                  ? null
                  : 'Enter the six-digit code')
            : ((v ?? '').trim().length >= 10
                  ? null
                  : 'Enter at least 10 characters'),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () {
          if (_form.currentState!.validate())
            Navigator.pop(context, _controller.text.trim());
        },
        child: Text(widget.code ? 'Confirm handover' : 'Confirm'),
      ),
    ],
  );
}

class ParcelAgentPage extends StatefulWidget {
  const ParcelAgentPage({
    super.key,
    required this.api,
    required this.state,
    required this.city,
  });
  final OneCallApi api;
  final String state, city;
  @override
  State<ParcelAgentPage> createState() => _ParcelAgentPageState();
}

class _ParcelAgentPageState extends State<ParcelAgentPage> {
  Map? _data;
  String? _error;
  bool _busy = false;
  final _form = GlobalKey<FormState>();
  final _shop = TextEditingController(), _address = TextEditingController();
  late final _city = TextEditingController(text: widget.city);
  late String _state = widget.state;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _shop.dispose();
    _address.dispose();
    _city.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await widget.api.request('GET', '/parcels/agent') as Map;
      if (mounted) setState(() => _data = data);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _apply() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.request(
        'POST',
        '/parcels/agent/apply',
        body: {
          'shopName': _shop.text.trim(),
          'address': _address.text.trim(),
          'state': _state,
          'city': _city.text.trim(),
        },
      );
      if (mounted) await _load();
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final agent = _data?['agent'] as Map?;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Parcel agent workspace'),
        actions: [
          IconButton(
            tooltip: 'Refresh agent status',
            onPressed: _busy ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Form(
        key: _form,
        child: _pageBody([
          const Text(
            'Operate a OneCall parcel shop',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const Text(
            'Operations must review your identity, physical shop, handling arrangements and route partners before approval. Applying does not make you an approved agent. Online payments and wallet earnings are not active.',
          ),
          if (_busy) const LinearProgressIndicator(),
          if (_error != null) ErrorNotice(_error!, onRetry: _load),
          if (_data != null && agent == null) ...[
            TextFormField(
              controller: _shop,
              maxLength: 120,
              decoration: const InputDecoration(
                labelText: 'Shop or business name',
              ),
              validator: _required,
            ),
            TextFormField(
              controller: _address,
              maxLength: 300,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Physical shop address and landmark',
              ),
              validator: _required,
            ),
            _stateField(_state, (v) => setState(() => _state = v)),
            TextFormField(
              controller: _city,
              maxLength: 60,
              decoration: const InputDecoration(labelText: 'City or town'),
              validator: (v) =>
                  (v ?? '').trim().length < 2 ? 'Enter your city' : null,
            ),
            BusyButton(
              label: 'Apply for shop approval',
              busy: _busy,
              onPressed: _apply,
            ),
          ],
          if (agent != null) ...[
            const SizedBox(height: 18),
            Text(
              '${agent['shopName']} · ${parcelStatus(agent['status'])}',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            Text('${agent['address']}\n${agent['city']}, ${agent['state']}'),
            if (agent['status'] != 'APPROVED')
              const Text(
                'Operations review is required. Contact Support for corrections or review updates.',
              ),
            if (agent['status'] == 'APPROVED') ...[
              FilledButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) =>
                        ParcelListPage(api: widget.api, agentOnly: true),
                  ),
                ),
                child: const Text('Open assigned parcel jobs'),
              ),
              OutlinedButton(
                onPressed: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => ParcelRouteProposalPage(
                        api: widget.api,
                        agentId: agent['id'] as String,
                      ),
                    ),
                  );
                  if (mounted) await _load();
                },
                child: const Text('Propose a route'),
              ),
            ],
            const SizedBox(height: 16),
            const Text(
              'Your routes',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            for (final r in _data!['routes'] as List)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(
                  '${(r as Map)['destinationAgent']['shopName']} · ${parcelStatus(r['status'])}',
                ),
                subtitle: Text(
                  '${parcelMoney(r['priceKobo'])} · ${r['maxWeightGrams']} g · ${r['estimatedHours']} hours',
                ),
              ),
          ],
        ]),
      ),
    );
  }
}

class ParcelRouteProposalPage extends StatefulWidget {
  const ParcelRouteProposalPage({
    super.key,
    required this.api,
    required this.agentId,
  });
  final OneCallApi api;
  final String agentId;
  @override
  State<ParcelRouteProposalPage> createState() =>
      _ParcelRouteProposalPageState();
}

class _ParcelRouteProposalPageState extends State<ParcelRouteProposalPage> {
  final _form = GlobalKey<FormState>();
  final _price = TextEditingController(),
      _weight = TextEditingController(),
      _hours = TextEditingController(),
      _fee = TextEditingController(text: '0');
  List<Map>? _shops;
  String _destinationState = 'Kaduna';
  String? _destination, _error;
  bool _home = false, _busy = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_price, _weight, _hours, _fee]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
      _destination = null;
      _shops = null;
    });
    try {
      final data =
          await widget.api.request(
                'GET',
                '/parcels/shops?state=${Uri.encodeQueryComponent(_destinationState)}',
              )
              as List;
      if (mounted)
        setState(
          () => _shops = data
              .cast<Map>()
              .where((s) => s['id'] != widget.agentId)
              .toList(),
        );
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  int? _integer(String value, int min, int max) {
    final n = int.tryParse(value.trim());
    return n != null && n >= min && n <= max ? n : null;
  }

  Future<void> _send() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.request(
        'POST',
        '/parcels/agent/routes',
        body: {
          'destinationAgentId': _destination,
          'priceKobo': int.parse(_price.text.trim()) * 100,
          'maxWeightGrams': int.parse(_weight.text.trim()),
          'estimatedHours': int.parse(_hours.text.trim()),
          'homePickup': _home,
          'homePickupFeeKobo': _home ? int.parse(_fee.text.trim()) * 100 : 0,
        },
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Propose a parcel route')),
    body: Form(
      key: _form,
      child: _pageBody([
        const Text(
          'Agree custody and transport arrangements with the destination shop first. Operations must activate the route before customers can book.',
        ),
        _stateField(
          _destinationState,
          (v) => setState(() => _destinationState = v),
        ),
        OutlinedButton(
          onPressed: _busy ? null : _load,
          child: const Text('Find destination shops'),
        ),
        if (_busy) const LinearProgressIndicator(),
        if (_shops != null)
          DropdownButtonFormField<String>(
            key: ValueKey(_shops),
            initialValue: _destination,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Approved destination shop',
            ),
            items: _shops!
                .map(
                  (s) => DropdownMenuItem(
                    value: s['id'] as String,
                    child: Text(
                      _shop(s),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                )
                .toList(),
            onChanged: _busy ? null : (v) => setState(() => _destination = v),
            validator: (v) =>
                v == null ? 'Choose an approved destination' : null,
          ),
        if (_shops?.isEmpty == true)
          const Text('No approved destination shops in this state yet.'),
        TextFormField(
          controller: _price,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Route price in whole naira',
          ),
          validator: (v) => _integer(v ?? '', 1, 1000000) == null
              ? 'Enter 1–1,000,000 naira'
              : null,
        ),
        TextFormField(
          controller: _weight,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Maximum parcel weight in grams',
          ),
          validator: (v) => _integer(v ?? '', 100, 50000) == null
              ? 'Enter 100–50,000 grams'
              : null,
        ),
        TextFormField(
          controller: _hours,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Estimated transit hours after dispatch',
          ),
          validator: (v) =>
              _integer(v ?? '', 1, 336) == null ? 'Enter 1–336 hours' : null,
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Offer home pickup'),
          value: _home,
          onChanged: _busy ? null : (v) => setState(() => _home = v),
        ),
        if (_home)
          TextFormField(
            controller: _fee,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Home pickup fee in whole naira',
            ),
            validator: (v) => _integer(v ?? '', 0, 100000) == null
                ? 'Enter 0–100,000 naira'
                : null,
          ),
        if (_error != null) ErrorNotice(_error!),
        BusyButton(
          label: 'Submit route for review',
          busy: _busy,
          onPressed: _shops == null ? null : _send,
        ),
      ]),
    ),
  );
}

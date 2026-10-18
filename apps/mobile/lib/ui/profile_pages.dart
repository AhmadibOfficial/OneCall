import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/api.dart';
import '../core/models.dart';
import 'brand.dart';
import 'common.dart';
import 'finance_pages.dart';
import 'location_picker.dart';
import 'order_pages.dart';
import 'resource_widgets.dart';
import 'verification_page.dart';
import 'legal_page.dart';
import 'design_widgets.dart';
import 'social_sign_in.dart';
import 'privacy_requests.dart';
import 'appearance_page.dart';

class ProfilePanel extends StatelessWidget {
  const ProfilePanel({
    super.key,
    required this.api,
    required this.state,
    required this.city,
  });
  final OneCallApi api;
  final String state, city;
  void _open(BuildContext context, Widget child) =>
      Navigator.push(context, MaterialPageRoute<void>(builder: (_) => child));

  @override
  Widget build(BuildContext context) {
    final user = api.user!;
    Widget tile(IconData icon, String title, String subtitle, Widget page) =>
        ListTile(
          leading: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFEAF2FF),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: navy, size: 22),
          ),
          title: Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          subtitle: Text(subtitle),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => _open(context, page),
        );
    LegalPage legal({String? documentId}) => LegalPage(
      documentId: documentId,
      onRequestSupport: (subject) =>
          _open(context, SupportFormPage(api: api, initialSubject: subject)),
    );
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 840),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 30,
                          backgroundColor: navy,
                          child: Text(
                            user.firstName.isEmpty
                                ? 'O'
                                : user.firstName.substring(0, 1).toUpperCase(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 26,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${user.firstName} ${user.lastName}'.trim(),
                                style: const TextStyle(
                                  fontSize: 23,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              Text(user.email),
                              Text(user.phone),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          user.canBook
                              ? Icons.check_circle_outline
                              : Icons.shield_outlined,
                          size: 20,
                          color: teal,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            user.canBook
                                ? 'Email & phone verified'
                                : 'Contact verification needed',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    SelectableText(
                      'OneCall ID: ${user.uid}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF68768A),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            OneCallSection(
              title: 'Your details',
              children: [
                tile(
                  Icons.text_fields,
                  'Appearance & accessibility',
                  'Text size and page motion',
                  const AppearancePage(),
                ),
                tile(
                  Icons.privacy_tip_outlined,
                  'Privacy requests & account data',
                  'Track requests and access your account snapshot',
                  PrivacyRequestsPage(api: api),
                ),
                tile(
                  Icons.link_outlined,
                  'Linked sign-in accounts',
                  'Connect Google or Apple to this account',
                  LinkedSignInPage(api: api),
                ),
                tile(
                  Icons.person_outline,
                  'Personal Information',
                  'Update your name and account details',
                  ProfileEditPage(api: api),
                ),
                tile(
                  Icons.verified_user_outlined,
                  user.canBook ? 'Account verified' : 'Verify email and phone',
                  'Verify your contact details; this is not a face or identity scan',
                  VerificationPage(api: api),
                ),
                tile(
                  Icons.location_on_outlined,
                  'Saved Addresses',
                  '$city, $state',
                  AddressesPage(api: api, state: state, city: city),
                ),
                tile(
                  Icons.favorite_border,
                  'Favorites',
                  'Your saved services',
                  FavoriteServicesPage(api: api, state: state, city: city),
                ),
              ],
            ),
            OneCallSection(
              title: 'Work & support',
              children: [
                tile(
                  Icons.work_outline,
                  'Provider Workspace',
                  'Apply, review quotes and manage your assigned jobs',
                  PrivateFeaturePage(
                    title: 'Provider Workspace',
                    api: api,
                    child: ProviderPage(api: api, state: state, city: city),
                  ),
                ),
                tile(
                  Icons.support_agent,
                  'Support',
                  'Booking questions, complaints and account help',
                  SupportPage(api: api),
                ),
                tile(
                  Icons.share_outlined,
                  'Invite a friend',
                  'Share OneCall; referral rewards are not active',
                  InvitePage(uid: user.uid),
                ),
              ],
            ),
            OneCallSection(
              title: 'Information',
              children: [
                tile(
                  Icons.description_outlined,
                  'Legal & privacy',
                  'Privacy notice, terms and consumer rights',
                  legal(),
                ),
                tile(
                  Icons.credit_card_outlined,
                  'Payment availability',
                  'Online payments are not offered in this pilot',
                  legal(documentId: 'payments'),
                ),
                tile(
                  Icons.settings_outlined,
                  'Settings & Information',
                  'Safety, notifications and service information',
                  InformationPage(city: city, state: state),
                ),
              ],
            ),
            OneCallSection(
              title: 'Account',
              children: [
                ListTile(
                  leading: const Icon(Icons.logout, color: Colors.red),
                  title: const Text(
                    'Logout',
                    style: TextStyle(
                      color: Colors.red,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle: const Text('Sign out of this device'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () async {
                    try {
                      await api.logout();
                    } catch (e) {
                      if (context.mounted) notice(context, errorMessage(e));
                    }
                  },
                ),
                tile(
                  Icons.manage_accounts_outlined,
                  'Request account deletion',
                  'Submit a request; identity verification and manual handling apply',
                  legal(documentId: 'account-deletion'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class PrivateFeaturePage extends StatelessWidget {
  const PrivateFeaturePage({
    super.key,
    required this.title,
    required this.api,
    required this.child,
  });
  final String title;
  final OneCallApi api;
  final Widget child;
  @override
  Widget build(BuildContext context) => api.user?.canBook == true
      ? child
      : Scaffold(
          appBar: AppBar(title: Text(title)),
          body: PrivateGate(api: api, verified: true, child: child),
        );
}

class ProfileEditPage extends StatefulWidget {
  const ProfileEditPage({super.key, required this.api});
  final OneCallApi api;
  @override
  State<ProfileEditPage> createState() => _ProfileEditPageState();
}

class _ProfileEditPageState extends State<ProfileEditPage> {
  final _form = GlobalKey<FormState>();
  late final _first = TextEditingController(text: widget.api.user?.firstName),
      _last = TextEditingController(text: widget.api.user?.lastName);
  bool _busy = false;
  String? _error;
  Future<void> _save() async {
    if (!_form.currentState!.validate()) {
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.api.request(
        'PATCH',
        '/profile',
        body: {'firstName': _first.text.trim(), 'lastName': _last.text.trim()},
      );
      await widget.api.reloadUser();
      if (mounted) {
        notice(context, 'Profile updated.');
        Navigator.pop(context);
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

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Personal Information')),
    body: Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          TextFormField(
            controller: _first,
            maxLength: 80,
            decoration: const InputDecoration(labelText: 'First name'),
            validator: (v) =>
                (v ?? '').trim().isEmpty ? 'Enter your first name' : null,
          ),
          TextFormField(
            controller: _last,
            maxLength: 80,
            decoration: const InputDecoration(labelText: 'Last name'),
            validator: (v) =>
                (v ?? '').trim().isEmpty ? 'Enter your last name' : null,
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.email_outlined),
            title: Text(widget.api.user?.email ?? ''),
            subtitle: const Text('Verified account email'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.phone_outlined),
            title: Text(widget.api.user?.phone ?? ''),
            subtitle: const Text('Account phone number'),
          ),
          if (_error != null) ErrorNotice(_error!),
          BusyButton(label: 'Save changes', busy: _busy, onPressed: _save),
        ],
      ),
    ),
  );
}

class AddressesPage extends StatefulWidget {
  const AddressesPage({
    super.key,
    required this.api,
    required this.state,
    required this.city,
  });
  final OneCallApi api;
  final String state, city;
  @override
  State<AddressesPage> createState() => _AddressesPageState();
}

class _AddressesPageState extends State<AddressesPage> {
  int _version = 0;
  Future<void> _edit([Map<String, dynamic>? address]) async {
    await Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => AddressEditPage(
          api: widget.api,
          state: widget.state,
          city: widget.city,
          address: address,
        ),
      ),
    );
    if (mounted) {
      setState(() => _version++);
    }
  }

  Future<void> _delete(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete saved address?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (!mounted || confirmed != true) {
      return;
    }
    try {
      await widget.api.request('DELETE', '/addresses/$id');
      if (mounted) {
        setState(() => _version++);
      }
    } catch (e) {
      if (mounted) {
        notice(context, errorMessage(e));
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Saved Addresses')),
    floatingActionButton: FloatingActionButton(
      onPressed: _edit,
      child: const Icon(Icons.add),
    ),
    body: ResourceList(
      key: ValueKey(_version),
      load: () async => await widget.api.request('GET', '/addresses') as List,
      emptyText: 'Save your home, office or another service address.',
      itemBuilder: (context, v, reload) {
        final address = Map<String, dynamic>.from(v as Map);
        return Card(
          child: ListTile(
            leading: Icon(
              address['isDefault'] == true
                  ? Icons.home
                  : Icons.location_on_outlined,
              color: teal,
            ),
            title: Text(address['label'] as String),
            subtitle: Text(
              '${address['addressLine1']}\n${address['city']}, ${address['state']}',
            ),
            isThreeLine: true,
            onTap: () => _edit(address),
            trailing: IconButton(
              tooltip: 'Delete address',
              onPressed: () => _delete(address['id'] as String),
              icon: const Icon(Icons.delete_outline),
            ),
          ),
        );
      },
    ),
  );
}

class AddressEditPage extends StatefulWidget {
  const AddressEditPage({
    super.key,
    required this.api,
    required this.state,
    required this.city,
    this.address,
  });
  final OneCallApi api;
  final String state, city;
  final Map<String, dynamic>? address;
  @override
  State<AddressEditPage> createState() => _AddressEditPageState();
}

class _AddressEditPageState extends State<AddressEditPage> {
  final _form = GlobalKey<FormState>();
  late final _label = TextEditingController(
        text: widget.address?['label'] as String? ?? '',
      ),
      _line = TextEditingController(
        text: widget.address?['addressLine1'] as String? ?? '',
      ),
      _landmark = TextEditingController(
        text: widget.address?['landmark'] as String? ?? '',
      );
  late String _state = widget.address?['state'] as String? ?? widget.state,
      _city = widget.address?['city'] as String? ?? widget.city;
  late bool _default = widget.address?['isDefault'] == true;
  bool _busy = false;
  String? _error;
  Future<void> _save() async {
    if (!_form.currentState!.validate()) {
      return;
    }
    setState(() => _busy = true);
    try {
      final id = widget.address?['id'] as String?;
      await widget.api.request(
        id == null ? 'POST' : 'PUT',
        id == null ? '/addresses' : '/addresses/$id',
        body: {
          'label': _label.text.trim(),
          'addressLine1': _line.text.trim(),
          'landmark': _landmark.text.trim(),
          'state': _state,
          'city': _city,
          'isDefault': _default,
        },
      );
      if (mounted) {
        Navigator.pop(context);
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

  @override
  void dispose() {
    _label.dispose();
    _line.dispose();
    _landmark.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(widget.address == null ? 'Add address' : 'Edit address'),
    ),
    body: Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          TextFormField(
            controller: _label,
            maxLength: 60,
            decoration: const InputDecoration(
              labelText: 'Label',
              hintText: 'Home or Office',
            ),
            validator: (v) => (v ?? '').trim().isEmpty ? 'Enter a label' : null,
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.location_on),
            title: Text('$_city, $_state'),
            trailing: const Icon(Icons.chevron_right),
            onTap: _busy
                ? null
                : () async {
                    final value = await chooseLocation(context, _state, _city);
                    if (mounted && value != null) {
                      setState(() {
                        _state = value.state;
                        _city = value.city;
                      });
                    }
                  },
          ),
          TextFormField(
            controller: _line,
            maxLength: 300,
            minLines: 2,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Street address'),
            validator: (v) =>
                (v ?? '').trim().length < 5 ? 'Enter your address' : null,
          ),
          TextFormField(
            controller: _landmark,
            maxLength: 120,
            decoration: const InputDecoration(labelText: 'Nearby landmark'),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Default address'),
            value: _default,
            onChanged: _busy ? null : (v) => setState(() => _default = v),
          ),
          if (_error != null) ErrorNotice(_error!),
          BusyButton(label: 'Save address', busy: _busy, onPressed: _save),
        ],
      ),
    ),
  );
}

class FavoriteServicesPage extends StatelessWidget {
  const FavoriteServicesPage({
    super.key,
    required this.api,
    required this.state,
    required this.city,
  });
  final OneCallApi api;
  final String state, city;
  Future<List<dynamic>> _load() async {
    final services = await api.servicesForLocation(state, city);
    final items = await api.request('GET', '/favorites') as List;
    final names = items.map((v) => (v as Map)['serviceName']).toSet();
    return services.where((s) => names.contains(s.name)).toList();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Favorites')),
    body: ResourceList(
      load: _load,
      emptyText: 'Tap the heart beside a service to save it.',
      itemBuilder: (context, v, reload) {
        final s = v as PilotService;
        return Card(
          child: ListTile(
            leading: ServiceGlyph(s.icon),
            title: Text(s.name),
            subtitle: Text(s.description),
            onTap: () async {
              if (api.user?.canBook != true) {
                await Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => VerificationPage(api: api),
                  ),
                );
                return;
              }
              if (context.mounted) {
                await Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => RequestPage(
                      api: api,
                      service: s,
                      state: state,
                      city: city,
                    ),
                  ),
                );
              }
            },
            trailing: IconButton(
              tooltip: 'Remove favorite',
              icon: const Icon(Icons.favorite, color: teal),
              onPressed: () async {
                try {
                  await api.request(
                    'DELETE',
                    '/favorites',
                    body: {'serviceName': s.name},
                  );
                  reload();
                } catch (e) {
                  if (context.mounted) {
                    notice(context, errorMessage(e));
                  }
                }
              },
            ),
          ),
        );
      },
    ),
  );
}

class PaymentMethodsPage extends StatelessWidget {
  const PaymentMethodsPage({super.key, required this.api});
  final OneCallApi api;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Payment Methods')),
    body: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        const Card(
          child: ListTile(
            leading: Icon(Icons.credit_card, color: teal),
            title: Text('Online payments unavailable'),
            subtitle: Text(
              'Online checkout, wallet funding and protected payment holds are not offered in this pilot. Read Payment availability in Legal & privacy before agreeing a payment arrangement.',
            ),
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.account_balance_wallet, color: teal),
            title: const Text('OneCall Wallet'),
            subtitle: const Text('View balance and payment transactions'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute<void>(builder: (_) => WalletPage(api: api)),
            ),
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.receipt_long),
            title: const Text('Payment checkouts'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute<void>(builder: (_) => CheckoutsPage(api: api)),
            ),
          ),
        ),
      ],
    ),
  );
}

class ProviderPage extends StatefulWidget {
  const ProviderPage({
    super.key,
    required this.api,
    required this.state,
    required this.city,
  });
  final OneCallApi api;
  final String state, city;
  @override
  State<ProviderPage> createState() => _ProviderPageState();
}

class _ProviderPageState extends State<ProviderPage> {
  late Future<dynamic> _profile = widget.api.request('GET', '/provider/me');
  void _reload() =>
      setState(() => _profile = widget.api.request('GET', '/provider/me'));
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Provider Workspace'),
      actions: [
        IconButton(
          onPressed: _reload,
          icon: const Icon(Icons.refresh),
          tooltip: 'Refresh approval',
        ),
      ],
    ),
    body: FutureBuilder<dynamic>(
      future: _profile,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Padding(
            padding: const EdgeInsets.all(24),
            child: ErrorNotice(errorMessage(snapshot.error!), onRetry: _reload),
          );
        }
        final provider = (snapshot.data as Map)['provider'] as Map?;
        if (provider == null || provider['approved'] != true) {
          return ListView(
            padding: const EdgeInsets.all(24),
            children: [
              const Icon(Icons.work_outline, size: 70, color: teal),
              const SizedBox(height: 22),
              Text(
                provider == null
                    ? 'Offer your services'
                    : 'Application awaiting approval',
                style: const TextStyle(
                  fontSize: 26,
                  color: navy,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Choose the services and area you can cover. Operations must approve your account before you can accept customer jobs.',
              ),
              if (provider != null) ...[
                const SizedBox(height: 20),
                Text(provider['displayName'] as String? ?? ''),
                ...((provider['coverage'] as List?) ?? []).map((v) {
                  final c = v as Map;
                  return ListTile(
                    title: Text(c['serviceName'] as String),
                    subtitle: Text('${c['cityKey']}, ${c['state']}'),
                  );
                }),
              ],
              const SizedBox(height: 22),
              BusyButton(
                label: provider == null
                    ? 'Apply as a provider'
                    : 'Update application',
                busy: false,
                onPressed: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => ProviderApplyPage(
                        api: widget.api,
                        state: widget.state,
                        city: widget.city,
                      ),
                    ),
                  );
                  if (mounted) {
                    _reload();
                  }
                },
              ),
            ],
          );
        }
        return DefaultTabController(
          length: 2,
          child: Column(
            children: [
              Container(
                color: const Color(0xFFEAF2FF),
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                child: Text(
                  provider['displayName'] as String? ?? 'Approved provider',
                  style: const TextStyle(
                    color: navy,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const TabBar(
                tabs: [
                  Tab(text: 'Available jobs'),
                  Tab(text: 'My jobs'),
                ],
              ),
              Expanded(
                child: TabBarView(
                  children: [
                    ResourceList(
                      load: () async =>
                          (await widget.api.request('GET', '/orders/available')
                                  as List)
                              .map(
                                (v) => ServiceOrder.fromJson(
                                  Map<String, dynamic>.from(v as Map),
                                ),
                              )
                              .toList(),
                      emptyText:
                          'No requests match your approved services and coverage yet.',
                      itemBuilder: (context, v, reload) {
                        final o = v as ServiceOrder;
                        return Card(
                          child: ListTile(
                            title: Text(o.serviceName),
                            subtitle: Text('${o.city}, ${o.state}'),
                            trailing: FilledButton(
                              onPressed: () => _accept(o, reload),
                              child: const Text('Accept job'),
                            ),
                          ),
                        );
                      },
                    ),
                    BookingsPanel(api: widget.api, providerView: true),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
  final Set<String> _accepting = {};
  Future<void> _accept(ServiceOrder order, VoidCallback reload) async {
    if (_accepting.contains(order.id)) {
      return;
    }
    _accepting.add(order.id);
    try {
      final result = ServiceOrder.fromJson(
        Map<String, dynamic>.from(
          await widget.api.request(
                'POST',
                '/orders/${order.id}/accept',
                body: {},
              )
              as Map,
        ),
      );
      reload();
      if (mounted) {
        await Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => OrderDetailsPage(
              api: widget.api,
              initialOrder: result,
              providerView: true,
            ),
          ),
        );
      }
      reload();
    } catch (e) {
      if (mounted) {
        notice(context, errorMessage(e));
      }
    } finally {
      _accepting.remove(order.id);
    }
  }
}

class ProviderApplyPage extends StatefulWidget {
  const ProviderApplyPage({
    super.key,
    required this.api,
    required this.state,
    required this.city,
  });
  final OneCallApi api;
  final String state, city;
  @override
  State<ProviderApplyPage> createState() => _ProviderApplyPageState();
}

class _ProviderApplyPageState extends State<ProviderApplyPage> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController(), _vehicle = TextEditingController();
  late String _state = widget.state, _city = widget.city;
  late Future<List<PilotService>> _services = widget.api.servicesForLocation(
    _state,
    _city,
  );
  final Set<String> _selected = {};
  bool _busy = false;
  String? _error;
  Future<void> _submit() async {
    if (!_form.currentState!.validate()) {
      return;
    }
    if (_selected.isEmpty) {
      setState(() => _error = 'Choose at least one service.');
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.api.request(
        'POST',
        '/provider/apply',
        body: {
          'displayName': _name.text.trim(),
          'vehicleDescription': _vehicle.text.trim(),
          'state': _state,
          'city': _city,
          'serviceNames': _selected.toList(),
        },
      );
      if (mounted) {
        Navigator.pop(context);
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

  @override
  void dispose() {
    _name.dispose();
    _vehicle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Provider application')),
    body: Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(22),
        children: [
          TextFormField(
            controller: _name,
            maxLength: 120,
            decoration: const InputDecoration(
              labelText: 'Business or provider name',
            ),
            validator: (v) =>
                (v ?? '').trim().isEmpty ? 'Enter your provider name' : null,
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.location_on),
            title: Text('$_city, $_state'),
            subtitle: const Text('Area you can cover'),
            onTap: _busy
                ? null
                : () async {
                    final region = await chooseLocation(context, _state, _city);
                    if (mounted && region != null) {
                      setState(() {
                        _state = region.state;
                        _city = region.city;
                        _services = widget.api.servicesForLocation(
                          _state,
                          _city,
                        );
                      });
                    }
                  },
          ),
          TextFormField(
            controller: _vehicle,
            maxLength: 160,
            decoration: const InputDecoration(
              labelText: 'Vehicle description, if applicable',
            ),
          ),
          const Text(
            'Services you offer',
            style: TextStyle(
              fontSize: 20,
              color: navy,
              fontWeight: FontWeight.bold,
            ),
          ),
          FutureBuilder<List<PilotService>>(
            future: _services,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return ErrorNotice(
                  errorMessage(snapshot.error!),
                  onRetry: () => setState(
                    () => _services = widget.api.servicesForLocation(
                      _state,
                      _city,
                    ),
                  ),
                );
              }
              if (!snapshot.hasData) {
                return const LinearProgressIndicator();
              }
              return Column(
                children: snapshot.data!
                    .map(
                      (s) => CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(s.name),
                        value: _selected.contains(s.name),
                        onChanged: _busy
                            ? null
                            : (v) => setState(() {
                                if (v == true) {
                                  _selected.add(s.name);
                                } else {
                                  _selected.remove(s.name);
                                }
                              }),
                      ),
                    )
                    .toList(),
              );
            },
          ),
          const Text(
            'You can accept requests only after operations approves your account and coverage.',
          ),
          TextButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute<void>(
                builder: (_) => const LegalPage(documentId: 'providers'),
              ),
            ),
            child: const Text('Read OneCall provider rules'),
          ),
          if (_error != null) ErrorNotice(_error!),
          const SizedBox(height: 20),
          BusyButton(
            label: 'Submit application',
            busy: _busy,
            onPressed: _submit,
          ),
        ],
      ),
    ),
  );
}

class SupportPage extends StatefulWidget {
  const SupportPage({super.key, required this.api});
  final OneCallApi api;
  @override
  State<SupportPage> createState() => _SupportPageState();
}

class _SupportPageState extends State<SupportPage> {
  int _version = 0;
  Future<void> _new() async {
    await Navigator.push(
      context,
      MaterialPageRoute<void>(builder: (_) => SupportFormPage(api: widget.api)),
    );
    if (mounted) {
      setState(() => _version++);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Support')),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: _new,
      icon: const Icon(Icons.add),
      label: const Text('New request'),
    ),
    body: ResourceList(
      key: ValueKey(_version),
      load: () async => await widget.api.request('GET', '/support') as List,
      emptyText:
          'Ask for help with a booking, payment or your account. Your support request and any response will appear here.',
      itemBuilder: (context, v, reload) {
        final t = v as Map;
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t['subject'] as String,
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.bold,
                    color: navy,
                  ),
                ),
                const SizedBox(height: 8),
                Text(t['message'] as String),
                const Divider(),
                Text('Status: ${t['status']}'),
                if (t['response'] != null)
                  Text('Support response: ${t['response']}'),
                const SizedBox(height: 8),
                SelectableText(
                  'Ticket ID: ${t['id']}',
                  style: const TextStyle(fontSize: 11),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

class SupportFormPage extends StatefulWidget {
  const SupportFormPage({
    super.key,
    required this.api,
    this.initialSubject = '',
  });
  final OneCallApi api;
  final String initialSubject;
  @override
  State<SupportFormPage> createState() => _SupportFormPageState();
}

class _SupportFormPageState extends State<SupportFormPage> {
  final _form = GlobalKey<FormState>();
  late final _subject = TextEditingController(text: widget.initialSubject);
  final _message = TextEditingController();
  bool _busy = false;
  String? _error;
  Future<void> _send() async {
    if (!_form.currentState!.validate()) {
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.api.request(
        'POST',
        '/support',
        body: {
          'subject': _subject.text.trim(),
          'message': _message.text.trim(),
        },
      );
      if (mounted) {
        notice(context, 'Support request submitted.');
        Navigator.pop(context);
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

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Contact Support')),
    body: Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text(
            'Include your request or checkout ID. Do not include passwords, verification codes or card details.',
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _subject,
            maxLength: 120,
            decoration: const InputDecoration(labelText: 'Subject'),
            validator: (v) =>
                (v ?? '').trim().isEmpty ? 'Enter a subject' : null,
          ),
          TextFormField(
            controller: _message,
            maxLength: 2000,
            minLines: 5,
            maxLines: 10,
            decoration: const InputDecoration(labelText: 'How can we help?'),
            validator: (v) =>
                (v ?? '').trim().isEmpty ? 'Enter your message' : null,
          ),
          if (_error != null) ErrorNotice(_error!),
          BusyButton(label: 'Submit request', busy: _busy, onPressed: _send),
        ],
      ),
    ),
  );
}

class InvitePage extends StatelessWidget {
  const InvitePage({super.key, required this.uid});
  final String uid;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Invite a friend')),
    body: ListView(
      padding: const EdgeInsets.all(28),
      children: [
        const OneCallLogo(),
        const SizedBox(height: 25),
        const Text(
          'ONE CALL. EVERY SERVICE.',
          textAlign: TextAlign.center,
          style: TextStyle(color: navy, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 20),
        const Text(
          'Invite your friends to use OneCall. A referral rewards programme has not launched yet.',
        ),
        const SizedBox(height: 20),
        OutlinedButton.icon(
          onPressed: () async {
            const appUrl = String.fromEnvironment('ONECALL_PUBLIC_URL');
            await Clipboard.setData(
              ClipboardData(
                text:
                    'Try OneCall for local services across Nigeria.${appUrl.startsWith('https://') ? '\n$appUrl' : ''}\nInvited by OneCall user $uid',
              ),
            );
            if (context.mounted) {
              notice(context, 'Invitation copied.');
            }
          },
          icon: const Icon(Icons.copy),
          label: const Text('Copy invitation'),
        ),
      ],
    ),
  );
}

class InformationPage extends StatelessWidget {
  const InformationPage({super.key, required this.city, required this.state});
  final String city, state;
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: oneCallMist,
    appBar: AppBar(title: const Text('Settings & Information')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const OneCallLogo(size: 72),
        const SizedBox(height: 26),
        Text(
          'Selected location: $city, $state',
          style: const TextStyle(color: Color(0xFF68768A)),
        ),
        const SizedBox(height: 20),
        _item(
          context,
          Icons.info_outline,
          'About OneCall',
          'OneCall connects customers with approved service providers. Choose your state and town, request a service, agree a provider quote and follow the booking. Availability depends on approved providers covering your area.',
        ),
        _item(
          context,
          Icons.shield_outlined,
          'Safety',
          'Check the provider identity shown on your booking. Keep booking discussions in the app. Never share passwords or verification codes. Report any concern through Support. OneCall service bookings are not an emergency response service.',
        ),
        _item(
          context,
          Icons.notifications_outlined,
          'Notifications',
          'Booking, quote, chat, payment and support updates appear in your in-app notifications. Open the Notifications tab to read them.',
        ),
        _item(
          context,
          Icons.privacy_tip_outlined,
          'Data & Location',
          'OneCall uses account, booking, address, chat and support records to arrange services. Optional provider location sharing is visible to the assigned customer while the job is in progress. Sharing stops when the provider leaves the tracking screen or backgrounds the app; the latest submitted coordinate is removed when the booking completes or is cancelled. Online payments are not offered in this pilot. See the privacy notice for data requests and retention details.',
        ),
        _policy(context, 'Terms of Service', 'terms'),
        _policy(context, 'Privacy Policy', 'privacy'),
        _policy(
          context,
          'Account deletion & data requests',
          'account-deletion',
        ),
        _policy(context, 'Payment availability', 'payments'),
        _policy(context, 'Consumer protection', 'consumer'),
        _policy(context, 'Cookies & device storage', 'storage'),
        _policy(context, 'Provider rules', 'providers'),
      ],
    ),
  );
  Widget _item(
    BuildContext context,
    IconData icon,
    String title,
    String body,
  ) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(icon, color: navy),
    title: Text(title, style: const TextStyle(color: navy)),
    trailing: const Icon(Icons.chevron_right, color: Color(0xFF68768A)),
    onTap: () => Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => Scaffold(
          appBar: AppBar(title: Text(title)),
          body: ListView(
            padding: const EdgeInsets.all(26),
            children: [
              Text(body, style: const TextStyle(fontSize: 17, height: 1.7)),
            ],
          ),
        ),
      ),
    ),
  );
  Widget _policy(BuildContext context, String title, String documentId) =>
      ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.description_outlined, color: navy),
        title: Text(title, style: const TextStyle(color: navy)),
        trailing: const Icon(Icons.chevron_right, color: Color(0xFF68768A)),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => LegalPage(documentId: documentId),
          ),
        ),
      );
}

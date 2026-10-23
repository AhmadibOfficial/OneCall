import 'dart:math';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/models.dart';
import 'common.dart';
import 'resource_widgets.dart';

String clientKey(String prefix) {
  final r = Random.secure();
  return '$prefix.${List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
}

Future<String?> amountDialog(BuildContext context, String title) async {
  final controller = TextEditingController();
  final form = GlobalKey<FormState>();
  final value = await showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Form(
        key: form,
        child: TextFormField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          autofocus: true,
          maxLength: 10,
          decoration: const InputDecoration(
            labelText: 'Amount in NGN',
            prefixText: '₦ ',
          ),
          validator: (v) =>
              RegExp(r'^[1-9]\d{0,6}(?:\.\d{1,2})?$').hasMatch((v ?? '').trim())
              ? null
              : 'Enter a positive amount, up to two decimal places',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            if (form.currentState!.validate()) {
              Navigator.pop(context, controller.text.trim());
            }
          },
          child: const Text('Continue'),
        ),
      ],
    ),
  );
  // The dialog route keeps its field alive during the closing animation.
  Future<void>.delayed(const Duration(seconds: 1), controller.dispose);
  return value;
}

class CheckoutPage extends StatefulWidget {
  const CheckoutPage({super.key, required this.api, required this.intent});
  final OneCallApi api;
  final Map<String, dynamic> intent;
  @override
  State<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends State<CheckoutPage> {
  late Map<String, dynamic> _intent = widget.intent;
  bool _busy = false;
  String? _error;
  Future<void> _open() async {
    final url = Uri.tryParse(_intent['checkoutUrl'] as String? ?? '');
    if (url == null ||
        url.scheme != 'https' ||
        url.host != 'checkout.paystack.com' ||
        url.userInfo.isNotEmpty ||
        (url.hasPort && url.port != 443)) {
      notice(
        context,
        'Checkout is awaiting provider confirmation. Use Check payment status, or contact support with the checkout ID.',
      );
      return;
    }
    await openExternal(context, url);
  }

  Future<void> _verify() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = Map<String, dynamic>.from(
        await widget.api.request(
              'POST',
              '/checkouts/${_intent['id']}/verify',
              body: {},
            )
            as Map,
      );
      if (mounted) {
        setState(() => _intent = result);
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
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Secure checkout')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        if (_intent['paymentMode'] == 'test')
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text('Test payment · No real money is collected.'),
            ),
          ),
        Icon(
          _intent['status'] == 'SUCCEEDED'
              ? Icons.check_circle
              : Icons.lock_outline,
          color: teal,
          size: 64,
        ),
        const SizedBox(height: 20),
        Text(
          '₦${_intent['amount']}',
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 35,
            color: navy,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 18),
        Text(
          _intent['status'] == 'SUCCEEDED'
              ? 'Payment confirmed'
              : 'Payment is awaiting confirmation',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        SelectableText(
          'Checkout ID: ${_intent['id']}',
          style: const TextStyle(fontSize: 12),
        ),
        if (_error != null) ErrorNotice(_error!),
        const SizedBox(height: 24),
        if (_intent['status'] != 'SUCCEEDED') ...[
          BusyButton(
            label: 'Open Paystack checkout',
            busy: _busy,
            onPressed: _open,
          ),
          const SizedBox(height: 14),
          OutlinedButton(
            onPressed: _busy ? null : _verify,
            child: const Text('Check payment status'),
          ),
          const SizedBox(height: 16),
          const Text(
            'Complete payment in the secure checkout window, then return here to check the result. OneCall confirms payment with the payment provider.',
            style: TextStyle(color: Colors.black54),
          ),
        ] else
          BusyButton(
            label: 'Done',
            busy: false,
            onPressed: () => Navigator.pop(context),
          ),
      ],
    ),
  );
}

class PaymentPage extends StatefulWidget {
  const PaymentPage({super.key, required this.api, required this.order});
  final OneCallApi api;
  final ServiceOrder order;
  @override
  State<PaymentPage> createState() => _PaymentPageState();
}

class _PaymentPageState extends State<PaymentPage> {
  Map<String, dynamic>? _wallet;
  String _method = 'paystack';
  bool _busy = false;
  String? _error;
  final _checkoutKey = clientKey('booking'), _walletKey = clientKey('wallet');
  bool get _canPay => _method == 'paystack'
      ? (_wallet?['checkoutEnabled'] == true)
      : (_wallet?['walletPaymentEnabled'] == true);
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final value = Map<String, dynamic>.from(
        await widget.api.request('GET', '/wallet') as Map,
      );
      if (mounted) {
        setState(() {
          _wallet = value;
          _error = null;
          if (value['checkoutEnabled'] != true) {
            _method = 'wallet';
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = errorMessage(e));
      }
    }
  }

  Future<void> _pay() async {
    if (_busy || !_canPay) {
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_method == 'wallet') {
        await widget.api.request(
          'POST',
          '/orders/${widget.order.id}/pay-wallet',
          body: {'idempotencyKey': _walletKey},
        );
        if (mounted) {
          notice(context, 'Payment successful.');
          Navigator.pop(context);
        }
      } else {
        final result = Map<String, dynamic>.from(
          await widget.api.request(
                'POST',
                '/checkouts',
                body: {
                  'orderId': widget.order.id,
                  'idempotencyKey': _checkoutKey,
                },
              )
              as Map,
        );
        if (mounted) {
          await Navigator.push(
            context,
            MaterialPageRoute<void>(
              builder: (_) => CheckoutPage(api: widget.api, intent: result),
            ),
          );
        }
        if (mounted) {
          Navigator.pop(context);
        }
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
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Payment Methods')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(
          'Pay ₦${widget.order.amount ?? '0.00'}',
          style: const TextStyle(
            fontSize: 28,
            color: navy,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(widget.order.serviceName),
        if (_wallet?['paymentMode'] == 'test')
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text('Test payments only. No real money is collected.'),
          ),
        const SizedBox(height: 24),
        if (_wallet == null && _error == null) const LinearProgressIndicator(),
        if (_wallet != null) ...[
          Card(
            child: ListTile(
              leading: const Icon(Icons.credit_card, color: teal),
              title: const Text('Secure Paystack checkout'),
              subtitle: Text(
                _wallet!['checkoutEnabled'] == true
                    ? 'Available methods are shown by the payment provider.'
                    : 'Online payments are not configured yet.',
              ),
              onTap: _wallet!['checkoutEnabled'] == true && !_busy
                  ? () => setState(() => _method = 'paystack')
                  : null,
              trailing: Icon(
                _method == 'paystack'
                    ? Icons.radio_button_checked
                    : Icons.radio_button_off,
                color: teal,
              ),
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.account_balance_wallet, color: teal),
              title: const Text('OneCall Wallet'),
              subtitle: Text(
                _wallet!['walletPaymentEnabled'] == true
                    ? 'Balance: ₦${_wallet!['balance']}'
                    : 'Wallet payments are unavailable.',
              ),
              onTap: _busy || _wallet!['walletPaymentEnabled'] != true
                  ? null
                  : () => setState(() => _method = 'wallet'),
              trailing: Icon(
                _method == 'wallet'
                    ? Icons.radio_button_checked
                    : Icons.radio_button_off,
                color: teal,
              ),
            ),
          ),
          const SizedBox(height: 20),
          BusyButton(
            label: _wallet!['paymentMode'] == 'test'
                ? 'Continue to test checkout'
                : 'Pay now',
            busy: _busy,
            onPressed: _canPay ? _pay : null,
          ),
          if (!_canPay)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'Online payments are unavailable. You can still view this booking and contact Support.',
              ),
            ),
          TextButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute<void>(
                builder: (_) => CheckoutsPage(api: widget.api),
              ),
            ),
            child: const Text('View existing checkouts'),
          ),
        ],
        if (_error != null) ErrorNotice(_error!, onRetry: _load),
        const SizedBox(height: 16),
        const Text(
          'The amount comes from your accepted quote. Your card details are entered directly with the payment provider.',
          style: TextStyle(color: Colors.black54),
        ),
      ],
    ),
  );
}

class WalletPage extends StatefulWidget {
  const WalletPage({super.key, required this.api});
  final OneCallApi api;
  @override
  State<WalletPage> createState() => _WalletPageState();
}

class _WalletPageState extends State<WalletPage> {
  Map<String, dynamic>? _wallet;
  String? _error, _fundingKey;
  String? _fundingAmount;
  bool _busy = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final data = Map<String, dynamic>.from(
        await widget.api.request('GET', '/wallet') as Map,
      );
      if (mounted) {
        setState(() {
          _wallet = data;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = errorMessage(e));
      }
    }
  }

  Future<void> _fund() async {
    final amount =
        _fundingAmount ?? await amountDialog(context, 'Fund your wallet');
    if (!mounted || amount == null) {
      return;
    }
    _fundingKey ??= clientKey('funding');
    _fundingAmount = amount;
    setState(() => _busy = true);
    try {
      final value = Map<String, dynamic>.from(
        await widget.api.request(
              'POST',
              '/checkouts',
              body: {'amount': amount, 'idempotencyKey': _fundingKey},
            )
            as Map,
      );
      _fundingKey = null;
      _fundingAmount = null;
      if (mounted) {
        await Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => CheckoutPage(api: widget.api, intent: value),
          ),
        );
      }
      await _load();
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
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Wallet')),
    body: RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(22),
        children: [
          if (_wallet == null && _error == null)
            const Center(child: CircularProgressIndicator()),
          if (_error != null) ErrorNotice(_error!, onRetry: _load),
          if (_wallet != null) ...[
            if (_wallet!['paymentMode'] == 'test')
              const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: Text(
                  'Test wallet · This balance is for testing, not real money.',
                ),
              ),
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [teal, navy]),
                borderRadius: BorderRadius.circular(15),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Available Balance',
                    style: TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    '₦${_wallet!['balance']}',
                    style: const TextStyle(
                      fontSize: 36,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 18),
                  FilledButton(
                    onPressed: _wallet!['fundingEnabled'] == true && !_busy
                        ? _fund
                        : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: navy,
                    ),
                    child: Text(_busy ? 'Please wait…' : 'Fund Wallet'),
                  ),
                ],
              ),
            ),
            if (_wallet!['fundingEnabled'] != true)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  'Wallet funding is not enabled yet. Any existing balance and transactions appear below.',
                ),
              ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.receipt_long),
              title: const Text('Payment checkouts'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => CheckoutsPage(api: widget.api),
                ),
              ),
            ),
            const Divider(),
            const Text(
              'Recent Transactions',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: navy,
              ),
            ),
            if ((_wallet!['transactions'] as List).isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 30),
                child: Text('No wallet transactions yet.'),
              ),
            ...(_wallet!['transactions'] as List).map((v) {
              final tx = v as Map;
              final debit = tx['amount'].toString().startsWith('-');
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  debit ? Icons.arrow_upward : Icons.arrow_downward,
                  color: debit ? Colors.orange : Colors.green,
                ),
                title: Text(tx['description'] as String),
                subtitle: Text(
                  DateTime.parse(
                    tx['createdAt'] as String,
                  ).toLocal().toString().split('.').first,
                ),
                trailing: Text('₦${tx['amount']}'),
              );
            }),
          ],
        ],
      ),
    ),
  );
}

class CheckoutsPage extends StatelessWidget {
  const CheckoutsPage({super.key, required this.api});
  final OneCallApi api;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Payment checkouts')),
    body: ResourceList(
      load: () async => await api.request('GET', '/checkouts') as List,
      emptyText: 'Your secure checkout history will appear here.',
      itemBuilder: (context, item, reload) {
        final c = Map<String, dynamic>.from(item as Map);
        return Card(
          child: ListTile(
            leading: const Icon(Icons.receipt_long, color: teal),
            title: Text('₦${c['amount']}'),
            subtitle: Text(c['status'].toString()),
            trailing: const Icon(Icons.chevron_right),
            onTap: () async {
              await Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => CheckoutPage(api: api, intent: c),
                ),
              );
              reload();
            },
          ),
        );
      },
    ),
  );
}

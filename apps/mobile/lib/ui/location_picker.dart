import 'package:flutter/material.dart';
import 'common.dart';

const nigeriaStates = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
];

class RegionSelection {
  const RegionSelection(this.state, this.city);
  final String state, city;
}

Future<RegionSelection?> chooseLocation(
  BuildContext context,
  String state,
  String city,
) => showModalBottomSheet<RegionSelection>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => LocationPicker(initialState: state, initialCity: city),
);

class LocationPicker extends StatefulWidget {
  const LocationPicker({
    super.key,
    required this.initialState,
    required this.initialCity,
  });
  final String initialState, initialCity;
  @override
  State<LocationPicker> createState() => _LocationPickerState();
}

class _LocationPickerState extends State<LocationPicker> {
  final _form = GlobalKey<FormState>();
  late String _state = widget.initialState;
  late final TextEditingController _city = TextEditingController(
    text: widget.initialCity,
  );
  @override
  void dispose() {
    _city.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      24,
      24,
      24,
      MediaQuery.viewInsetsOf(context).bottom + 24,
    ),
    child: SingleChildScrollView(
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Choose your location',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: navy,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Services across Nigeria. Choose the state and town for this request.',
            ),
            const SizedBox(height: 20),
            DropdownButtonFormField<String>(
              initialValue: _state,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'State / FCT'),
              items: nigeriaStates
                  .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                  .toList(),
              onChanged: (s) {
                if (s != null) {
                  setState(() {
                    _state = s;
                    _city.clear();
                  });
                }
              },
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _city,
              maxLength: 60,
              decoration: const InputDecoration(
                labelText: 'City or town',
                counterText: '',
              ),
              validator: (s) => s == null || s.trim().isEmpty
                  ? 'Enter your city or town'
                  : null,
            ),
            const SizedBox(height: 20),
            BusyButton(
              label: 'Use this location',
              busy: false,
              onPressed: () {
                if (_form.currentState!.validate()) {
                  Navigator.pop(
                    context,
                    RegionSelection(_state, _city.text.trim()),
                  );
                }
              },
            ),
          ],
        ),
      ),
    ),
  );
}

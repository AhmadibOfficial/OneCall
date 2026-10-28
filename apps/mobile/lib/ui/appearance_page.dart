import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'resource_widgets.dart';

class AppearancePreferences extends ChangeNotifier {
  static final instance = AppearancePreferences();
  double textSize = 1;
  bool reducedMotion = false;
  ThemeMode themeMode = ThemeMode.system;
  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final mode = prefs.getString('onecall.appearance.themeMode');
      themeMode = ThemeMode.values.firstWhere(
        (v) => v.name == mode,
        orElse: () => ThemeMode.system,
      );
      final saved = prefs.getDouble('onecall.appearance.textSize');
      textSize = [1.0, 1.15, 1.3].contains(saved) ? saved! : 1;
      reducedMotion =
          prefs.getBool('onecall.appearance.reducedMotion') ?? false;
    } catch (_) {
      // A stale or unavailable preference store must not prevent app startup.
      textSize = 1;
      reducedMotion = false;
      themeMode = ThemeMode.system;
    }
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('onecall.appearance.themeMode', value.name);
    themeMode = value;
    notifyListeners();
  }

  Future<void> setTextSize(double value) async {
    if (![1.0, 1.15, 1.3].contains(value)) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble('onecall.appearance.textSize', value);
    textSize = value;
    notifyListeners();
  }

  Future<void> setReducedMotion(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onecall.appearance.reducedMotion', value);
    reducedMotion = value;
    notifyListeners();
  }
}

class OneCallTextScaler extends TextScaler {
  const OneCallTextScaler(this.system, this.factor);
  final TextScaler system;
  final double factor;
  @override
  double scale(double fontSize) => system.scale(fontSize) * factor;
  @override
  double get textScaleFactor => scale(14) / 14;
}

class ReducedTransitions extends PageTransitionsBuilder {
  const ReducedTransitions();
  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) => child;
}

class AppearancePage extends StatelessWidget {
  const AppearancePage({super.key});
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: AppearancePreferences.instance,
    builder: (context, _) => Scaffold(
      appBar: AppBar(title: const Text('Appearance & accessibility')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text(
            'Theme',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
          ),
          for (final option in [
            (ThemeMode.system, 'System default'),
            (ThemeMode.light, 'Light'),
            (ThemeMode.dark, 'Dark'),
          ])
            ListTile(
              key: ValueKey('theme-${option.$1.name}'),
              title: Text(option.$2),
              leading: Icon(
                AppearancePreferences.instance.themeMode == option.$1
                    ? Icons.radio_button_checked
                    : Icons.radio_button_off,
              ),
              onTap: () async {
                try {
                  await AppearancePreferences.instance.setThemeMode(option.$1);
                } catch (_) {
                  if (context.mounted) {
                    notice(
                      context,
                      'Could not save theme preference. Try again.',
                    );
                  }
                }
              },
            ),
          const SizedBox(height: 24),
          const Text(
            'Text size',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
          ),
          const Text(
            'Your device accessibility scaling is preserved. This preference adds extra size throughout OneCall.',
          ),
          for (final option in [
            (1.0, 'Follow device'),
            (1.15, 'Larger'),
            (1.3, 'Largest'),
          ])
            ListTile(
              title: Text(option.$2),
              leading: Icon(
                AppearancePreferences.instance.textSize == option.$1
                    ? Icons.radio_button_checked
                    : Icons.radio_button_off,
              ),
              onTap: () async {
                try {
                  await AppearancePreferences.instance.setTextSize(option.$1);
                } catch (e) {
                  if (context.mounted) {
                    notice(
                      context,
                      'Could not save appearance preference. Try again.',
                    );
                  }
                }
              },
            ),
          SwitchListTile(
            title: const Text('Reduce page motion'),
            subtitle: const Text(
              'Removes OneCall page transitions. Loading indicators and external sign-in screens keep their own behaviour.',
            ),
            value: AppearancePreferences.instance.reducedMotion,
            onChanged: (value) async {
              try {
                await AppearancePreferences.instance.setReducedMotion(value);
              } catch (e) {
                if (context.mounted) {
                  notice(
                    context,
                    'Could not save appearance preference. Try again.',
                  );
                }
              }
            },
          ),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Text(
                'OneCall — everything you need, one call away.\nLive text-size preview.',
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

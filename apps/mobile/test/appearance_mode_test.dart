import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:onecall/main.dart';
import 'package:onecall/ui/appearance_page.dart';
import 'package:onecall/ui/home_page.dart';
import 'widget_test.dart' show FakeApi;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets(
    'theme choices persist and system mode follows device brightness',
    (tester) async {
      final api = FakeApi();
      addTearDown(api.dispose);
      final preferences = AppearancePreferences.instance;
      await preferences.load();
      await api.login('test@example.com', 'TestPassword123!');
      await tester.pumpWidget(OneCallApp(api: api));
      await tester.pumpAndSettle();
      expect(preferences.themeMode, ThemeMode.system);
      await preferences.setThemeMode(ThemeMode.dark);
      await tester.pumpAndSettle();
      expect(
        Theme.of(tester.element(find.byType(HomePage))).brightness,
        Brightness.dark,
      );
      await preferences.setThemeMode(ThemeMode.light);
      await tester.pumpAndSettle();
      expect(
        Theme.of(tester.element(find.byType(HomePage))).brightness,
        Brightness.light,
      );
      await preferences.setThemeMode(ThemeMode.system);
      tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
      addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
      await tester.pumpAndSettle();
      expect(
        Theme.of(tester.element(find.byType(HomePage))).brightness,
        Brightness.dark,
      );
      final restored = AppearancePreferences();
      await restored.load();
      expect(restored.themeMode, ThemeMode.system);
      restored.dispose();
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets('appearance offers all three theme choices', (tester) async {
    await AppearancePreferences.instance.load();
    await tester.pumpWidget(const MaterialApp(home: AppearancePage()));
    await tester.tap(find.byKey(const ValueKey('theme-dark')));
    await tester.pumpAndSettle();
    expect(AppearancePreferences.instance.themeMode, ThemeMode.dark);
    expect(find.text('Light'), findsOneWidget);
    expect(find.text('System default'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}

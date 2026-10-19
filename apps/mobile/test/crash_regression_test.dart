import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:onecall/ui/appearance_page.dart';
import 'package:onecall/ui/input_dialogs.dart';

void main() {
  test(
    'corrupted appearance values fall back without failing startup',
    () async {
      SharedPreferences.setMockInitialValues({
        'onecall.appearance.textSize': 'stale-value',
        'onecall.appearance.reducedMotion': 'not-a-bool',
      });
      final preferences = AppearancePreferences();
      await preferences.load();
      expect(preferences.textSize, 1);
      expect(preferences.reducedMotion, isFalse);
      preferences.dispose();
    },
  );

  testWidgets('password dialog remains safe through the closing animation', (
    tester,
  ) async {
    String? proof;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                proof = await confirmPassword(
                  context,
                  title: 'Confirm identity',
                  action: 'Confirm',
                );
              },
              child: const Text('Open'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), 'Password123!');
    await tester.tap(find.text('Confirm'));
    await tester.pump();
    expect(tester.takeException(), isNull);
    await tester.pumpAndSettle();
    expect(proof, 'Password123!');
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'privacy draft validates input and closes without disposing an active controller',
    (tester) async {
      PrivacyRequestDraft? draft;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () async {
                  draft = await composePrivacyRequest(context);
                },
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Send request'));
      await tester.pumpAndSettle();
      expect(find.text('Add a short explanation.'), findsOneWidget);
      expect(draft, isNull);
      await tester.enterText(
        find.byType(TextFormField),
        'Please provide my account records.',
      );
      await tester.tap(find.text('Send request'));
      await tester.pump();
      expect(tester.takeException(), isNull);
      await tester.pumpAndSettle();
      expect(draft?.kind, 'ACCESS');
      expect(draft?.message, 'Please provide my account records.');
      expect(tester.takeException(), isNull);
    },
  );
}

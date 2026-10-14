import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'core/api.dart';
import 'ui/welcome_page.dart';
import 'ui/brand.dart';
import 'ui/home_page.dart';
import 'ui/common.dart';
import 'ui/app_theme.dart';
import 'ui/appearance_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const OneCallApp());
}

class OneCallApp extends StatefulWidget {
  const OneCallApp({super.key, this.api});
  final OneCallApi? api;
  @override
  State<OneCallApp> createState() => _OneCallAppState();
}

class _OneCallAppState extends State<OneCallApp> {
  final _navigator = GlobalKey<NavigatorState>();
  late OneCallApi _api;
  String? _configurationError;
  bool _guest = false;
  @override
  void initState() {
    super.initState();
    unawaited(AppearancePreferences.instance.load());
    try {
      final defaultUrl =
          !kIsWeb && defaultTargetPlatform == TargetPlatform.android
          ? 'http://10.0.2.2:3000/api/v1'
          : 'http://localhost:3000/api/v1';
      _api =
          widget.api ??
          OneCallClient(
            baseUrl: const String.fromEnvironment('ONECALL_API_URL').isEmpty
                ? defaultUrl
                : const String.fromEnvironment('ONECALL_API_URL'),
          );
      _api.addListener(_sessionChanged);
      unawaited(_api.restore());
    } catch (_) {
      _configurationError =
          'Configure ONECALL_API_URL with your OneCall HTTPS backend address before running this build.';
    }
  }

  void _sessionChanged() {
    if (_api.user == null) {
      if (mounted) {
        setState(() => _guest = false);
      }
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _navigator.currentState?.popUntil((route) => route.isFirst);
        }
      });
    }
  }

  @override
  void dispose() {
    if (_configurationError == null) {
      _api.removeListener(_sessionChanged);
      if (widget.api == null) {
        _api.dispose();
      }
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: AppearancePreferences.instance,
    builder: (context, _) => MaterialApp(
      title: 'OneCall · Nigeria',
      debugShowCheckedModeBanner: false,
      navigatorKey: _navigator,
      theme: AppearancePreferences.instance.reducedMotion
          ? oneCallTheme().copyWith(
              pageTransitionsTheme: const PageTransitionsTheme(
                builders: {
                  TargetPlatform.android: ReducedTransitions(),
                  TargetPlatform.iOS: ReducedTransitions(),
                  TargetPlatform.linux: ReducedTransitions(),
                  TargetPlatform.macOS: ReducedTransitions(),
                  TargetPlatform.windows: ReducedTransitions(),
                  TargetPlatform.fuchsia: ReducedTransitions(),
                },
              ),
            )
          : oneCallTheme(),
      themeAnimationDuration: AppearancePreferences.instance.reducedMotion
          ? Duration.zero
          : const Duration(milliseconds: 200),
      builder: (context, child) {
        final data = MediaQuery.of(context);
        return MediaQuery(
          data: data.copyWith(
            textScaler: OneCallTextScaler(
              data.textScaler,
              AppearancePreferences.instance.textSize,
            ),
            disableAnimations:
                data.disableAnimations ||
                AppearancePreferences.instance.reducedMotion,
          ),
          child: OneCallViewport(child: child ?? const SizedBox.shrink()),
        );
      },
      home: _configurationError != null
          ? Scaffold(
              body: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(_configurationError!),
                ),
              ),
            )
          : AnimatedBuilder(
              animation: _api,
              builder: (context, _) {
                if (_api.restoring) {
                  return const Scaffold(
                    backgroundColor: navy,
                    body: Center(child: AppLoading(splash: true)),
                  );
                }
                if (_api.user == null && !_guest) {
                  return WelcomePage(
                    key: const ValueKey('signed-out'),
                    api: _api,
                    onGuest: () => setState(() => _guest = true),
                  );
                }
                return HomePage(
                  key: ValueKey(_api.user?.uid ?? 'guest'),
                  api: _api,
                );
              },
            ),
    ),
  );
}

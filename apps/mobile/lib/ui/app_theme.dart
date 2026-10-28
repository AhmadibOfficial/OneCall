import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'common.dart';

// One theme owns the appearance of customer, provider and account screens.
ThemeData oneCallTheme({Brightness brightness = Brightness.light}) {
  final dark = brightness == Brightness.dark;
  final surface = dark ? const Color(0xFF182231) : Colors.white;
  final foreground = dark ? const Color(0xFFE5ECF7) : navy;
  final muted = dark ? const Color(0xFFB3C0D3) : const Color(0xFF536581);
  final borderColor = dark ? const Color(0xFF38465B) : const Color(0xFFDCE5F1);
  const rounded = BorderRadius.all(Radius.circular(18));
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: ColorScheme.fromSeed(
      seedColor: navy,
      brightness: brightness,
      primary: dark ? const Color(0xFF9BC7FF) : navy,
      secondary: teal,
      surface: surface,
    ),
    scaffoldBackgroundColor: dark
        ? const Color(0xFF101722)
        : const Color(0xFFF5F7FB),
    canvasColor: surface,
    dividerColor: borderColor,
    textTheme: TextTheme(
      bodyLarge: TextStyle(fontSize: 16, height: 1.5, color: foreground),
      bodyMedium: TextStyle(fontSize: 14, height: 1.5, color: foreground),
      bodySmall: TextStyle(fontSize: 12, height: 1.4, color: muted),
      titleMedium: TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.w600,
        color: foreground,
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: navy,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      systemOverlayStyle: SystemUiOverlayStyle(
        statusBarColor: navy,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
        systemNavigationBarColor: Colors.white,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      titleTextStyle: TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.w700,
        color: Colors.white,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? const Color(0xFF202D40) : const Color(0xFFF8FAFE),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      prefixIconColor: foreground,
      suffixIconColor: foreground,
      labelStyle: TextStyle(color: muted),
      floatingLabelStyle: TextStyle(color: foreground),
      hintStyle: TextStyle(color: muted, fontSize: 14),
      border: OutlineInputBorder(
        borderRadius: rounded,
        borderSide: BorderSide(color: borderColor),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: rounded,
        borderSide: BorderSide(color: borderColor),
      ),
      focusedBorder: const OutlineInputBorder(
        borderRadius: rounded,
        borderSide: BorderSide(color: teal, width: 1.5),
      ),
    ),
    cardTheme: CardThemeData(
      color: surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: const EdgeInsets.symmetric(vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: rounded,
        side: BorderSide(color: borderColor),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: const Color(0xFF075ECB),
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 54),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        shape: const RoundedRectangleBorder(borderRadius: rounded),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: foreground,
        minimumSize: const Size(0, 48),
        side: BorderSide(color: borderColor),
        shape: const RoundedRectangleBorder(borderRadius: rounded),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: dark
            ? const Color(0xFF9BC7FF)
            : const Color(0xFF075ECB),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: navy,
      contentTextStyle: TextStyle(color: Colors.white),
      actionTextColor: Color(0xFFADD3FF),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: rounded),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: teal),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: dark ? const Color(0xFF2A466A) : const Color(0xFFE8F2FF),
      height: 72,
    ),
    listTileTheme: ListTileThemeData(
      iconColor: foreground,
      textColor: foreground,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    ),
    iconTheme: IconThemeData(color: foreground),
    tooltipTheme: const TooltipThemeData(
      waitDuration: Duration(milliseconds: 400),
    ),
  );
}

class OneCallViewport extends StatelessWidget {
  const OneCallViewport({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
    value: SystemUiOverlayStyle(
      statusBarColor: navy,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
      systemNavigationBarColor: Theme.of(context).colorScheme.surface,
      systemNavigationBarIconBrightness:
          Theme.of(context).brightness == Brightness.dark
          ? Brightness.light
          : Brightness.dark,
    ),
    child: ColoredBox(
      color: Theme.of(context).scaffoldBackgroundColor,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1360),
          child: SizedBox.expand(child: child),
        ),
      ),
    ),
  );
}

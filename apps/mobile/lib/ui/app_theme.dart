import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'common.dart';

// One theme owns the appearance of customer, provider and account screens.
ThemeData oneCallTheme() {
  const borderColor = Color(0xFFDCE5F1);
  const rounded = BorderRadius.all(Radius.circular(22));
  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: navy,
      brightness: Brightness.light,
      primary: navy,
      secondary: teal,
      surface: Colors.white,
    ),
    scaffoldBackgroundColor: const Color(0xFFF0F3F7),
    canvasColor: Colors.white,
    dividerColor: borderColor,
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
    inputDecorationTheme: const InputDecorationTheme(
      filled: true,
      fillColor: Color(0xFFF8FAFE),
      contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      prefixIconColor: navy,
      suffixIconColor: navy,
      labelStyle: TextStyle(color: Color(0xFF536581)),
      floatingLabelStyle: TextStyle(color: navy),
      hintStyle: TextStyle(color: Color(0xFF71809A), fontSize: 14),
      border: OutlineInputBorder(
        borderRadius: rounded,
        borderSide: BorderSide(color: borderColor),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: rounded,
        borderSide: BorderSide(color: borderColor),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: rounded,
        borderSide: BorderSide(color: teal, width: 1.5),
      ),
    ),
    cardTheme: const CardThemeData(
      color: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.symmetric(vertical: 6),
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
        shape: const StadiumBorder(),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: navy,
        minimumSize: const Size(0, 48),
        side: const BorderSide(color: borderColor),
        shape: const RoundedRectangleBorder(borderRadius: rounded),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: teal),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: navy,
      contentTextStyle: TextStyle(color: Colors.white),
      actionTextColor: Color(0xFFADD3FF),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: rounded),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: teal),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: Color(0xFFE8F2FF),
      height: 72,
    ),
    listTileTheme: const ListTileThemeData(
      iconColor: navy,
      textColor: navy,
      contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    ),
    iconTheme: const IconThemeData(color: navy),
  );
}

class OneCallViewport extends StatelessWidget {
  const OneCallViewport({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
    value: const SystemUiOverlayStyle(
      statusBarColor: navy,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
      systemNavigationBarColor: Colors.white,
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
    child: ColoredBox(
      color: const Color(0xFFF1F5FC),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: SizedBox.expand(child: child),
        ),
      ),
    ),
  );
}

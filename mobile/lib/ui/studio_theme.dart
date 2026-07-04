import 'package:flutter/material.dart';

abstract final class StudioSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
}

abstract final class StudioRadii {
  static const double control = 8;
  static const double panel = 8;
}

abstract final class StudioTheme {
  static const _brand = Color(0xFF7548F5);
  static const _cyan = Color(0xFF08AFC7);

  static ThemeData light() => _build(Brightness.light);

  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final base = ColorScheme.fromSeed(
      seedColor: _brand,
      brightness: brightness,
    );
    final scheme = base.copyWith(
      primary: dark ? const Color(0xFF9D82F0) : _brand,
      onPrimary: dark ? const Color(0xFF151128) : Colors.white,
      primaryContainer: dark ? const Color(0xFF2A2350) : base.primaryContainer,
      onPrimaryContainer:
          dark ? const Color(0xFFE9E2FF) : base.onPrimaryContainer,
      secondary: dark ? const Color(0xFF3EC2D2) : _cyan,
      onSecondary: dark ? const Color(0xFF071E24) : Colors.white,
      secondaryContainer:
          dark ? const Color(0xFF123840) : base.secondaryContainer,
      onSecondaryContainer:
          dark ? const Color(0xFFC9F7FF) : base.onSecondaryContainer,
      surface: dark ? const Color(0xFF111120) : const Color(0xFFFCFBFF),
      onSurface: dark ? const Color(0xFFE8E3F6) : base.onSurface,
      onSurfaceVariant: dark ? const Color(0xFFB8B0CF) : base.onSurfaceVariant,
      surfaceContainerLow:
          dark ? const Color(0xFF0C0D19) : base.surfaceContainerLow,
      surfaceContainer:
          dark ? const Color(0xFF18172A) : const Color(0xFFF4F0FB),
      surfaceContainerHigh:
          dark ? const Color(0xFF201E34) : const Color(0xFFEDE7F7),
      surfaceContainerHighest:
          dark ? const Color(0xFF28253D) : base.surfaceContainerHighest,
      outline: dark ? const Color(0xFF514A66) : const Color(0xFFD6CDE6),
      outlineVariant: dark ? const Color(0xFF312C44) : base.outlineVariant,
      shadow: dark ? Colors.black : base.shadow,
      scrim: Colors.black,
      surfaceTint: dark ? const Color(0xFF7B61D1) : base.surfaceTint,
    );
    const controlShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.all(Radius.circular(StudioRadii.control)),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor:
          dark ? const Color(0xFF090B16) : const Color(0xFFF8F6FC),
      visualDensity: VisualDensity.standard,
      cardTheme: CardTheme(
        elevation: 0,
        margin: EdgeInsets.zero,
        color: scheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(StudioRadii.panel),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(StudioRadii.control),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(StudioRadii.control),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(StudioRadii.control),
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(shape: controlShape),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(shape: controlShape),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(shape: controlShape),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        elevation: 0,
        backgroundColor: dark ? const Color(0xFF0D0E1B) : scheme.surface,
        indicatorColor:
            dark ? const Color(0xFF2B2450) : scheme.primaryContainer,
        labelTextStyle: WidgetStatePropertyAll(
          TextStyle(fontSize: 12, color: scheme.onSurface),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: dark ? const Color(0xFF0D0E1B) : scheme.surface,
        indicatorColor:
            dark ? const Color(0xFF2B2450) : scheme.primaryContainer,
        selectedIconTheme: IconThemeData(color: scheme.onPrimaryContainer),
        selectedLabelTextStyle: TextStyle(
          color: scheme.primary,
          fontWeight: FontWeight.w700,
        ),
      ),
      dividerTheme:
          DividerThemeData(color: scheme.outlineVariant, thickness: 1),
    );
  }
}

import 'package:flutter/material.dart';

abstract final class StudioSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
}

abstract final class AppMotion {
  static const Duration fast = Duration(milliseconds: 120);
  static const Duration standard = Duration(milliseconds: 180);
  static const Duration slow = Duration(milliseconds: 240);
  static const Curve easeOut = Curves.easeOutCubic;
  static const Curve easeInOut = Curves.easeInOutCubic;
}

abstract final class StudioRadii {
  static const double control = 8;
  static const double panel = 12;
  static const double dialog = 16;
  static const double sheet = 20;
  static const double pill = 999;
}

abstract final class StudioTheme {
  static const _brand = Color(0xFF7047D8);
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
    // ThemeData.cardTheme changed from CardTheme to CardThemeData in newer
    // Flutter releases. Deriving it from ThemeData keeps this source compatible
    // with both the CI-pinned Flutter 3.24 SDK and newer local SDKs.
    final foundation = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
    );
    final textTheme = foundation.textTheme.copyWith(
      headlineSmall: foundation.textTheme.headlineSmall
          ?.copyWith(fontWeight: FontWeight.w700),
      titleLarge: foundation.textTheme.titleLarge
          ?.copyWith(fontWeight: FontWeight.w700),
      titleMedium: foundation.textTheme.titleMedium
          ?.copyWith(fontWeight: FontWeight.w600),
      bodyLarge: foundation.textTheme.bodyLarge?.copyWith(height: 1.35),
      bodyMedium: foundation.textTheme.bodyMedium?.copyWith(height: 1.35),
      labelLarge: foundation.textTheme.labelLarge
          ?.copyWith(fontWeight: FontWeight.w700),
    );
    final cardTheme = foundation.cardTheme.copyWith(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: scheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(StudioRadii.panel),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor:
          dark ? const Color(0xFF090B16) : const Color(0xFFF8F6FC),
      visualDensity: VisualDensity.standard,
      textTheme: textTheme,
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: _StudioPageTransitionsBuilder(),
          TargetPlatform.iOS: _StudioPageTransitionsBuilder(),
          TargetPlatform.windows: _StudioPageTransitionsBuilder(),
          TargetPlatform.macOS: _StudioPageTransitionsBuilder(),
          TargetPlatform.linux: _StudioPageTransitionsBuilder(),
        },
      ),
      cardTheme: cardTheme,
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: StudioSpacing.lg,
          vertical: StudioSpacing.lg,
        ),
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
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        elevation: 0,
        backgroundColor: scheme.inverseSurface,
        contentTextStyle:
            textTheme.bodyMedium?.copyWith(color: scheme.onInverseSurface),
        actionTextColor: dark ? const Color(0xFFCFC2FF) : scheme.primary,
        insetPadding: const EdgeInsets.all(StudioSpacing.lg),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(
            Radius.circular(StudioRadii.control),
          ),
        ),
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

class _StudioPageTransitionsBuilder extends PageTransitionsBuilder {
  const _StudioPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    final curved = CurvedAnimation(
      parent: animation,
      curve: AppMotion.easeOut,
      reverseCurve: AppMotion.easeInOut,
    );
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0.025, 0),
          end: Offset.zero,
        ).animate(curved),
        child: child,
      ),
    );
  }
}

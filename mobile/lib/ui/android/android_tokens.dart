import 'package:flutter/material.dart';

@immutable
class LangbaiAndroidTokens extends ThemeExtension<LangbaiAndroidTokens> {
  final Color canvas;
  final Color card;
  final Color inset;
  final Color dock;
  final Color outline;
  final Color textPrimary;
  final Color textSecondary;

  const LangbaiAndroidTokens({
    required this.canvas,
    required this.card,
    required this.inset,
    required this.dock,
    required this.outline,
    required this.textPrimary,
    required this.textSecondary,
  });

  static const light = LangbaiAndroidTokens(
    canvas: Color(0xFFF2F5FA),
    card: Colors.white,
    inset: Color(0xFFEEF1F6),
    dock: Color(0xFFE9EDF3),
    outline: Color(0xFFD9DEE6),
    textPrimary: Color(0xFF1A1C20),
    textSecondary: Color(0xFF5A6170),
  );
  static const dark = LangbaiAndroidTokens(
    canvas: Color(0xFF0F1217),
    card: Color(0xFF191D24),
    inset: Color(0xFF222731),
    dock: Color(0xFF151920),
    outline: Color(0xFF2C323C),
    textPrimary: Color(0xFFE3E6EC),
    textSecondary: Color(0xFFA9B0BC),
  );

  static LangbaiAndroidTokens of(BuildContext context) =>
      Theme.of(context).extension<LangbaiAndroidTokens>() ??
      (Theme.of(context).brightness == Brightness.dark ? dark : light);

  @override
  LangbaiAndroidTokens copyWith(
          {Color? canvas,
          Color? card,
          Color? inset,
          Color? dock,
          Color? outline,
          Color? textPrimary,
          Color? textSecondary}) =>
      LangbaiAndroidTokens(
          canvas: canvas ?? this.canvas,
          card: card ?? this.card,
          inset: inset ?? this.inset,
          dock: dock ?? this.dock,
          outline: outline ?? this.outline,
          textPrimary: textPrimary ?? this.textPrimary,
          textSecondary: textSecondary ?? this.textSecondary);

  @override
  LangbaiAndroidTokens lerp(covariant LangbaiAndroidTokens? other, double t) {
    if (other == null) return this;
    return LangbaiAndroidTokens(
        canvas: Color.lerp(canvas, other.canvas, t)!,
        card: Color.lerp(card, other.card, t)!,
        inset: Color.lerp(inset, other.inset, t)!,
        dock: Color.lerp(dock, other.dock, t)!,
        outline: Color.lerp(outline, other.outline, t)!,
        textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
        textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!);
  }
}

/// Retains Langbai's primary color and the user's font/text-scale preferences.
ThemeData androidStudioTheme(ThemeData base) {
  final t = base.brightness == Brightness.dark
      ? LangbaiAndroidTokens.dark
      : LangbaiAndroidTokens.light;
  final scheme = base.colorScheme.copyWith(
      surface: t.card,
      onSurface: t.textPrimary,
      onSurfaceVariant: t.textSecondary,
      outlineVariant: t.outline,
      surfaceContainer: t.inset,
      surfaceContainerLow: t.canvas,
      surfaceContainerHigh: t.dock);
  return base.copyWith(
    extensions: [
      ...base.extensions.values.where((e) => e is! LangbaiAndroidTokens),
      t
    ],
    colorScheme: scheme,
    scaffoldBackgroundColor: t.canvas,
    cardColor: t.card,
    appBarTheme: base.appBarTheme.copyWith(
        backgroundColor: t.canvas,
        foregroundColor: t.textPrimary,
        surfaceTintColor: Colors.transparent,
        elevation: 0),
    cardTheme: CardTheme(
        color: t.card,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
    navigationBarTheme: base.navigationBarTheme.copyWith(
        backgroundColor: t.dock,
        surfaceTintColor: Colors.transparent,
        indicatorColor: scheme.primaryContainer,
        labelTextStyle: WidgetStateProperty.all(
            const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
    dividerTheme: base.dividerTheme.copyWith(color: t.outline, thickness: 1),
    inputDecorationTheme: base.inputDecorationTheme.copyWith(
        filled: true,
        fillColor: t.card,
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: t.outline))),
  );
}

EdgeInsets androidPagePadding(BuildContext context, {double bottom = 16}) =>
    EdgeInsets.fromLTRB(MediaQuery.sizeOf(context).width < 360 ? 12 : 16, 12,
        MediaQuery.sizeOf(context).width < 360 ? 12 : 16, bottom);

class AndroidSectionCard extends StatelessWidget {
  final String title;
  final IconData? icon;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;
  const AndroidSectionCard(
      {super.key,
      required this.title,
      this.icon,
      this.subtitle,
      this.trailing,
      required this.child});

  @override
  Widget build(BuildContext context) {
    final t = LangbaiAndroidTokens.of(context);
    return Card(
        color: t.card,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    if (icon != null) ...[
                      Icon(icon, size: 22),
                      const SizedBox(width: 10)
                    ],
                    Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text(title,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w700)),
                          if (subtitle != null)
                            Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text(subtitle!,
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodySmall
                                        ?.copyWith(color: t.textSecondary))),
                        ])),
                    if (trailing != null) Flexible(child: trailing!),
                  ]),
                  const SizedBox(height: 12),
                  child,
                ])));
  }
}

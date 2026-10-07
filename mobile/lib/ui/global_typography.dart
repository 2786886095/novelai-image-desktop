import 'package:flutter/material.dart';
/// Preserve the OS accessibility scaler, including non-linear scaling.
class StudioTextScaler extends TextScaler {
  final TextScaler system;
  final double factor;
  const StudioTextScaler(this.system,this.factor);
  @override double scale(double fontSize)=>system.scale(fontSize)*factor;
  @override double get textScaleFactor=>system.scale(14)/14*factor;
  @override bool operator ==(Object other)=>other is StudioTextScaler&&other.system==system&&other.factor==factor;
  @override int get hashCode=>Object.hash(system,factor);
}
class UiTypographyScope extends InheritedWidget {
  final String? family;
  const UiTypographyScope({super.key,required this.family,required super.child});
  static String codeFamily(BuildContext context)=>context.dependOnInheritedWidgetOfExactType<UiTypographyScope>()?.family??'monospace';
  @override bool updateShouldNotify(UiTypographyScope oldWidget)=>family!=oldWidget.family;
}
ThemeData withUiFont(ThemeData theme,String? family)=>family==null?theme:theme.copyWith(
  textTheme:theme.textTheme.apply(fontFamily:family),primaryTextTheme:theme.primaryTextTheme.apply(fontFamily:family),
  tooltipTheme:theme.tooltipTheme.copyWith(textStyle:theme.tooltipTheme.textStyle?.copyWith(fontFamily:family)),
);

/// AppBar clamps its inherited MediaQuery. Capture the app scaler outside it so
/// global sizing also reaches titles, without scaling Material icon glyphs.
Widget studioAppBarTitle(BuildContext context,Widget child)=>MediaQuery(
  data:MediaQuery.of(context),child:DefaultTextStyle.merge(maxLines:2,overflow:TextOverflow.ellipsis,child:child));
double studioRoleFactor(double factor,double growth)=>1+(factor-1)*growth;
ThemeData withUiTextLayout(ThemeData theme,TextScaler scaler){
  final factor=scaler is StudioTextScaler?scaler.factor:1.0;
  if(factor==1){final title=scaler.scale(theme.textTheme.titleLarge?.fontSize??22);return title<=30?theme:theme.copyWith(appBarTheme:theme.appBarTheme.copyWith(toolbarHeight:title*2+16));}
  TextStyle? role(TextStyle? style,double growth,[double fallback=14])=>style?.copyWith(fontSize:
    (style.fontSize??fallback)*studioRoleFactor(factor,growth)/factor);
  final t=theme.textTheme;
  final text=t.copyWith(
    displayLarge:role(t.displayLarge,.55,57),displayMedium:role(t.displayMedium,.55,45),displaySmall:role(t.displaySmall,.55,36),
    headlineLarge:role(t.headlineLarge,.55,32),headlineMedium:role(t.headlineMedium,.55,28),headlineSmall:role(t.headlineSmall,.55,24),
    titleLarge:role(t.titleLarge,.55,22),titleMedium:role(t.titleMedium,.55,16),titleSmall:role(t.titleSmall,.55,14),
    labelLarge:role(t.labelLarge,.45,14),labelMedium:role(t.labelMedium,.45,12),labelSmall:role(t.labelSmall,.45,11));
  final title=scaler.scale(text.titleLarge?.fontSize??22);
  return theme.copyWith(textTheme:text,
    appBarTheme:theme.appBarTheme.copyWith(titleTextStyle:role(theme.appBarTheme.titleTextStyle??t.titleLarge,.55,22),toolbarHeight:title<=30?theme.appBarTheme.toolbarHeight:title*2+16),
    filledButtonTheme:FilledButtonThemeData(style:theme.filledButtonTheme.style?.copyWith(textStyle:WidgetStatePropertyAll(text.labelLarge))),
    elevatedButtonTheme:ElevatedButtonThemeData(style:(theme.elevatedButtonTheme.style??const ButtonStyle()).copyWith(textStyle:WidgetStatePropertyAll(text.labelLarge))),
    outlinedButtonTheme:OutlinedButtonThemeData(style:(theme.outlinedButtonTheme.style??const ButtonStyle()).copyWith(textStyle:WidgetStatePropertyAll(text.labelLarge))),
    textButtonTheme:TextButtonThemeData(style:(theme.textButtonTheme.style??const ButtonStyle()).copyWith(textStyle:WidgetStatePropertyAll(text.labelLarge))),
    navigationBarTheme:theme.navigationBarTheme.copyWith(labelTextStyle:WidgetStatePropertyAll(text.labelMedium)),
    navigationRailTheme:theme.navigationRailTheme.copyWith(selectedLabelTextStyle:text.labelLarge,unselectedLabelTextStyle:text.labelLarge));
}

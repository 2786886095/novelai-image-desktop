import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

double _contrast(Color a, Color b) {
  final lighter = a.computeLuminance() > b.computeLuminance() ? a : b;
  final darker = identical(lighter, a) ? b : a;
  return (lighter.computeLuminance() + 0.05) /
      (darker.computeLuminance() + 0.05);
}

void main() {
  test('dark theme stays low-glare while keeping readable contrast', () {
    final scheme = StudioTheme.dark().colorScheme;

    expect(scheme.surface.computeLuminance(), lessThan(0.012));
    expect(scheme.surfaceContainer.computeLuminance(), lessThan(0.020));
    expect(scheme.surfaceContainerHigh.computeLuminance(), lessThan(0.030));

    expect(scheme.onSurface.red, lessThan(245));
    expect(scheme.onSurface.green, lessThan(245));
    expect(scheme.onSurface.blue, lessThan(250));

    expect(
        _contrast(scheme.onSurface, scheme.surface), greaterThanOrEqualTo(10));
    expect(_contrast(scheme.onSurfaceVariant, scheme.surfaceContainer),
        greaterThanOrEqualTo(6));
    expect(_contrast(scheme.primary, scheme.surface), greaterThanOrEqualTo(5));
  });

  test('mobile visual tokens match the desktop brand and motion contract', () {
    final theme = StudioTheme.light();

    expect(theme.colorScheme.primary, const Color(0xFF7047D8));
    expect(AppMotion.standard, const Duration(milliseconds: 180));
    expect(AppMotion.easeOut, Curves.easeOutCubic);
    expect(StudioRadii.pill, 999);
    expect(theme.textTheme.titleLarge?.fontWeight, FontWeight.w700);
    expect(theme.textTheme.bodyMedium?.height, 1.35);
    expect(theme.snackBarTheme.behavior, SnackBarBehavior.floating);
    expect(theme.snackBarTheme.shape, isA<RoundedRectangleBorder>());
    expect(
        theme.pageTransitionsTheme.builders.keys,
        containsAll(<TargetPlatform>[
          TargetPlatform.android,
          TargetPlatform.iOS,
          TargetPlatform.windows,
          TargetPlatform.macOS,
          TargetPlatform.linux,
        ]));
  });

  test('mobile polish guardrails remain wired to real interaction paths', () {
    final tools = File('lib/screens/tools_hub_screen.dart').readAsStringSync();
    final comic = File('lib/screens/comic_screen.dart').readAsStringSync();
    final aitag =
        File('lib/screens/aitag_gallery_screen.dart').readAsStringSync();
    final online =
        File('lib/screens/online_gallery_screen.dart').readAsStringSync();
    final theme = File('lib/ui/studio_theme.dart').readAsStringSync();
    final shell = File('lib/ui/studio_shell.dart').readAsStringSync();

    expect(tools, contains('Navigator.of(context).push<void>'));
    expect(tools, isNot(contains('_ActiveTool')));
    expect(comic, isNot(matches(RegExp(r'\bHero\s*\('))));
    expect(aitag, contains('RefreshIndicator('));
    expect(
        'RefreshIndicator('.allMatches(online).length, greaterThanOrEqualTo(2));
    expect(theme, contains('class AppMotion'));
    expect(shell, contains('AppMotion.standard'));

    final mobileSources = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((file) => file.path.endsWith('.dart'))
        .map((file) => file.readAsStringSync())
        .join('\n');
    expect(mobileSources,
        isNot(matches(RegExp(r'BorderRadius\.circular\((?:99|999)\)'))));
    expect('StudioRadii.pill'.allMatches(mobileSources).length,
        greaterThanOrEqualTo(8));
    expect('StudioSpacing.'.allMatches(mobileSources).length, greaterThan(10));
  });
}

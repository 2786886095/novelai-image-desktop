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
}

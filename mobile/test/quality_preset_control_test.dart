import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/quality_preset_control.dart';

void main() {
  testWidgets('quality preset control is Chinese-first and interactive on V5',
      (tester) async {
    var value = 'standard';
    var transparent = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => QualityPresetControl(
              language: 'zh-CN',
              model: 'nai-diffusion-5-full',
              value: value,
              transparentBackground: transparent,
              onChanged: (next) => setState(() => value = next),
              onTransparentChanged: (next) =>
                  setState(() => transparent = next),
            ),
          ),
        ),
      ),
    );

    expect(
      find.textContaining('质量词', findRichText: true),
      findsOneWidget,
    );
    expect(find.text('标准'), findsOneWidget);
    expect(find.text('轻量'), findsOneWidget);
    expect(find.text('关闭'), findsOneWidget);
    expect(find.text('Standard'), findsNothing);

    await tester.tap(find.text('轻量'));
    await tester.pumpAndSettle();
    expect(value, 'light');
    expect(find.textContaining('追加到正面提示词末尾'), findsOneWidget);

    await tester.tap(find.text('透明背景'));
    await tester.pumpAndSettle();
    expect(transparent, isTrue);
  });

  testWidgets('Light and transparent background are unavailable before V5',
      (tester) async {
    var value = 'light';

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) => QualityPresetControl(
              language: 'zh-CN',
              model: 'nai-diffusion-4-5-full',
              value: value,
              transparentBackground: false,
              onChanged: (next) => setState(() => value = next),
              onTransparentChanged: (_) {},
            ),
          ),
        ),
      ),
    );

    expect(find.text('透明背景'), findsNothing);
    await tester.tap(find.text('轻量'));
    await tester.pumpAndSettle();
    expect(value, 'light');

    await tester.tap(find.text('关闭'));
    await tester.pumpAndSettle();
    expect(value, 'none');
  });
}

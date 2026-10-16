import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/prompt_skill_selector.dart';
import 'package:novelai_mobile/ui/global_typography.dart';
import 'package:novelai_mobile/ui/studio_dropdown.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

Future<void> pumpSelector(WidgetTester tester, Size size, double appScale,
    String model, String edition, String language,
    {void Function(String, String)? changed}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  await tester.pumpWidget(MaterialApp(
      theme: withUiFont(
          StudioTheme.light().copyWith(
              platform: size.width == 390
                  ? TargetPlatform.iOS
                  : TargetPlatform.android),
          'serif'),
      builder: (context, child) => UiTypographyScope(
          family: 'serif',
          child: MediaQuery(
              data: MediaQuery.of(context).copyWith(
                  textScaler: StudioTextScaler(
                      TextScaler.linear(appScale == 1 ? 1 : 1.3), appScale)),
              child: child!)),
      home: Scaffold(
          body: SingleChildScrollView(
              child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: PromptSkillSelector(
                      model: model,
                      edition: edition,
                      language: language,
                      onChanged: changed ?? (_, __) {}))))));
  await tester.pump();
}

void main() {
  for (final target in [
    ('tiny', const Size(320, 640), 1.0),
    ('compact serif enlarged', const Size(360, 800), 2.0),
    ('iOS serif enlarged', const Size(390, 844), 2.0)
  ]) {
    for (final selection in [
      ('v5', '2.0.0'),
      ('v5', '1.0.0'),
      ('v4.5', '1.0.0')
    ]) {
      for (final language in ['zh-CN', 'en-US']) {
        testWidgets(
            'skill selector fits ${target.$1} ${selection.$1}/${selection.$2} $language',
            (tester) async {
          addTearDown(tester.view.reset);
          await pumpSelector(tester, target.$2, target.$3, selection.$1,
              selection.$2, language);
          expect(tester.takeException(), isNull);
          final controls = tester
              .widgetList<StudioDropdownButton<String>>(
                  find.byType(StudioDropdownButton<String>))
              .toList();
          expect(controls, hasLength(2));
          expect(controls.every((c) => c.isExpanded), isTrue);
          expect(controls.first.value, selection.$1);
          expect(controls.last.value, selection.$2);
          expect(
              find.text(
                  selection.$1 == 'v5' ? 'NovelAI V5 Full' : 'NovelAI V4.5'),
              findsOneWidget);
          expect(
              find.text(selection.$2 == '2.0.0' ? '2.0.0 · V5 Full' : '1.0.0'),
              findsOneWidget);
          for (final control
              in find.byType(StudioDropdownButton<String>).evaluate()) {
            final box = control.findRenderObject() as RenderBox;
            expect(box.size.width, lessThanOrEqualTo(target.$2.width - 64));
            expect(box.size.height, greaterThanOrEqualTo(24));
          }
        });
      }
    }
  }
  testWidgets(
      'tiny enlarged selector stays usable and V4.5 cannot select incompatible edition',
      (tester) async {
    addTearDown(tester.view.reset);
    var model = 'v5', edition = '2.0.0';
    final changes = <String>[];
    Future<void> mount() async =>
        pumpSelector(tester, const Size(320, 640), 2, model, edition, 'en-US',
            changed: (m, e) {
          model = m;
          edition = e;
          changes.add('$m/$e');
        });
    await mount();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('NovelAI V5 Full'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('NovelAI V4.5'));
    await tester.tap(find.text('NovelAI V4.5'));
    await tester.pumpAndSettle();
    expect(changes, ['v4.5/1.0.0']);
    await mount();
    expect(tester.takeException(), isNull);
    final editionControl =
        find.byKey(const ValueKey('prompt-skill-edition-v4.5-1.0.0'));
    await tester.ensureVisible(editionControl);
    await tester.tap(editionControl);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('2.0.0 · V5 Full'));
    await tester.tap(find.text('2.0.0 · V5 Full'));
    await tester.pump();
    expect(changes, ['v4.5/1.0.0']);
    expect(edition, '1.0.0');
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}

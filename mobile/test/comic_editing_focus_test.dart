import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/comic/comic_controller.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

class _NoDiskController extends ComicController {
  _NoDiskController(super.app);
  @override
  void changed([String? key, String detail = '']) => notifyListeners();
}

void main() {
  final cases = <(String, List<String>, Object Function(ComicProject))>[
    ('comic.projectName', ['Q', 'QA', 'QACOMIC'], (p) => p.title),
    ('comic.globalStyle', ['n', 'night'], (p) => p.globalStylePrompt),
    ('comic.globalNegative', ['l', 'lowres'], (p) => p.globalNegativePrompt),
    ('comic.steps', ['3', '36'], (p) => p.globalParams.steps),
    ('comic.cfg', ['5', '5.', '5.5'], (p) => p.globalParams.cfgScale),
    ('comic.seed', ['2', '20'], (p) => p.globalParams.seed),
  ];
  for (final entry in cases) {
    testWidgets('comic editing keeps focus/caret through ${entry.$1} echoes',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(360, 800);
      addTearDown(tester.view.reset);
      final app = AppState();
      final controller = _NoDiskController(app)
        ..project = ComicProject.empty(GenerateParams())
        ..step = ComicStep.global
        ..loaded = true;
      addTearDown(app.dispose);
      addTearDown(controller.dispose);
      await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
        value: app,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: ComicScreen(controller: controller),
        ),
      ));
      final label = mobileUiTextFor(app.settings.language, entry.$1);
      final field = find.byWidgetPredicate(
          (w) => w is TextField && w.decoration?.labelText == label);
      for (var i = 0; i < 12 && field.hitTestable().evaluate().isEmpty; i++) {
        await tester.dragFrom(const Offset(345, 650), const Offset(0, -300));
        await tester.pumpAndSettle();
      }
      expect(field.hitTestable(), findsOneWidget);
      await tester.tap(field);
      await tester.pump();
      final editable =
          find.descendant(of: field, matching: find.byType(EditableText));
      final state = tester.state<EditableTextState>(editable);
      expect(tester.widget<EditableText>(editable).focusNode.hasFocus, isTrue);
      for (final text in entry.$2) {
        tester.testTextInput.updateEditingValue(TextEditingValue(
          text: text,
          selection: TextSelection.collapsed(offset: text.length),
          composing: TextRange(start: 0, end: text.length),
        ));
        await tester.pump();
        final current = tester.widget<EditableText>(editable);
        expect(current.focusNode.hasFocus, isTrue,
            reason: 'Parent notification must not replace the focused editor');
        expect(identical(tester.state(editable), state), isTrue);
        expect(current.controller.text, text);
        expect(current.controller.selection.baseOffset, text.length);
        expect(current.controller.value.composing,
            TextRange(start: 0, end: text.length));
      }
      final expected = switch (entry.$1) {
        'comic.steps' => 36,
        'comic.cfg' => 5.5,
        'comic.seed' => 20,
        _ => entry.$2.last,
      };
      expect(entry.$3(controller.project), expected);
      if (entry.$1 == 'comic.projectName') {
        controller.project.title = 'external-project-title';
        controller.changed();
        await tester.pump();
        expect(tester.widget<EditableText>(editable).controller.text,
            'external-project-title');
        expect(identical(tester.state(editable), state), isTrue);
      }
      await tester.pumpWidget(const SizedBox.shrink());
      expect(tester.takeException(), isNull);
      debugPrint('COMIC_EDIT_FOCUS: ${entry.$1}; self-echo preserves '
          'focus/state/caret/composition; final=$expected; no network');
    });
  }
}

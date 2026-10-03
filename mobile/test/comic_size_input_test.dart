import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/comic/comic_controller.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

class _SizeInputController extends ComicController {
  _SizeInputController(super.app);
  final inputs = <String>[];
  @override
  void changed([String? key, String detail = '']) => notifyListeners();
  @override
  void importPanelSizes(String source) {
    inputs.add(source);
    super.importPanelSizes(source);
  }
}

void main() {
  for (final size in [const Size(360, 800), const Size(1024, 768)]) {
    testWidgets(
        'comic sizes react immediately and reject partial imports $size',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(tester.view.reset);
      final app = AppState();
      final controller = _SizeInputController(app)
        ..project = ComicProject(
          id: 'qa-size-input',
          sizeMode: ComicSizeMode.perPanel,
          globalParams: GenerateParams(),
          panels: [
            ComicPanel(id: 'first', index: 1, title: 'first', prompt: 'city'),
            ComicPanel(
                id: 'second', index: 2, title: 'second', prompt: 'forest'),
          ],
        )
        ..step = ComicStep.global
        ..loaded = true;
      addTearDown(app.dispose);
      addTearDown(controller.dispose);
      final globalBefore = controller.project.globalParams.toJson();
      await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
        value: app,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: ComicScreen(controller: controller),
        ),
      ));
      final input = find.byWidgetPredicate(
          (w) => w is TextField && w.decoration?.labelText == '逐分镜尺寸（一行一个）');
      final button = find.ancestor(
        of: find.text('导入并匹配尺寸'),
        matching: find.byWidgetPredicate((w) => w is FilledButton),
      );
      bool enabled() => tester.widget<FilledButton>(button).onPressed != null;
      expect(enabled(), false);
      await tester.ensureVisible(input);
      await tester.enterText(input, '   ');
      await tester.pump();
      expect(enabled(), false);
      const valid = '832x1216\n1216x832';
      await tester.enterText(input, valid);
      await tester.pump();
      expect(enabled(), true,
          reason:
              'Manual typing must enable size import without template or parent notification');
      await tester.enterText(input, '');
      await tester.pump();
      expect(enabled(), false);
      await tester.enterText(input, valid);
      await tester.pump();
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(controller.inputs, [valid]);
      List<(int?, int?)> dimensions() => controller.project.panels
          .map((p) => (p.imageWidth, p.imageHeight))
          .toList();
      expect(dimensions(), [(832, 1216), (1216, 832)]);
      await tester.enterText(input, '1024x1024');
      await tester.pump();
      await tester.ensureVisible(button);
      await tester.pumpAndSettle();
      expect(button.hitTestable(), findsOneWidget);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(dimensions(), [(832, 1216), (1216, 832)],
          reason: 'Wrong line count must not partially replace a panel size');
      const recovered = '1024x1024\n832x1216';
      await tester.enterText(input, recovered);
      await tester.pump();
      await tester.ensureVisible(button);
      await tester.pumpAndSettle();
      expect(button.hitTestable(), findsOneWidget);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(dimensions(), [(1024, 1024), (832, 1216)]);
      expect(controller.project.globalParams.toJson(), globalBefore);
      expect(controller.project.panels.map((p) => p.id), ['first', 'second']);
      expect(
          controller.project.panels.map((p) => p.prompt), ['city', 'forest']);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      debugPrint('COMIC_SIZE_INPUT: empty/whitespace disabled; typing enabled; '
          'clear disabled; one-click valid2; invalid1 atomic; valid retry2; '
          'global/IDs/prompts unchanged; viewport=$size; no network');
    });
  }
}

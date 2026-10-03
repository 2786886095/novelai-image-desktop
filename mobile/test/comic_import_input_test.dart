import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/comic/comic_controller.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

class _CaptureImportController extends ComicController {
  _CaptureImportController(super.app);
  final imported = <String>[];

  @override
  Future<void> importText(String source, {String fileName = ''}) async {
    imported.add(source);
  }
}

void main() {
  for (final size in [const Size(360, 800), const Size(1024, 768)]) {
    testWidgets('comic import reflects input without parent notification $size',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(tester.view.reset);
      final app = AppState();
      final controller = _CaptureImportController(app)
        ..project = ComicProject(
          id: 'qa-comic-import',
          title: 'QA comic import',
          globalParams: GenerateParams(),
          panels: [],
        )
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
      final input = find.byType(TextField);
      final button = find.ancestor(
        of: find.text('导入文本'),
        matching: find.byWidgetPredicate((w) => w is FilledButton),
      );
      bool enabled() => tester.widget<FilledButton>(button).onPressed != null;
      expect(enabled(), isFalse);
      await tester.enterText(input, '   ');
      await tester.pump();
      expect(enabled(), isFalse);
      await tester.enterText(input, 'masterpiece,landscape,night');
      await tester.pump();
      expect(enabled(), isTrue,
          reason: 'Typing must enable import without unrelated state changes');
      await tester.enterText(input, '');
      await tester.pump();
      expect(enabled(), isFalse);
      await tester.enterText(input, 'masterpiece,landscape,night');
      await tester.pump();
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(controller.imported, ['masterpiece,landscape,night']);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      debugPrint('COMIC_IMPORT: empty/whitespace blocked; typing enabled; '
          'clear blocked; retype and one click handed off exact input; '
          'viewport=$size; no network');
    });
  }
}

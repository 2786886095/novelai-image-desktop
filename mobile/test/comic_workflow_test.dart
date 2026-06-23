import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/comic/comic_controller.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

ComicProject _project() {
  final params = GenerateParams();
  return ComicProject(
    id: 'project-1',
    title: '测试漫画',
    rawScript: '第一幕。第二幕。',
    globalPrompt: '连续故事',
    globalCharacterSetting: '主角保持黑色短发和白衬衫',
    globalParams: params,
    panels: List.generate(
      3,
      (index) => ComicPanel(
        id: 'panel-$index',
        index: index + 1,
        cnPrompt: '第 ${index + 1} 格中文描述',
        enPrompt: 'panel ${index + 1} prompt',
        params: params.copy(),
        status: ComicPanelStatus.converted,
      ),
    ),
  );
}

void main() {
  test('trusted restore keeps output paths while imported JSON clears them',
      () {
    final source = _project();
    source
      ..historyGroupId = 'group-1'
      ..panels.first.outputPath = r'C:\trusted\panel.png';
    final json = source.toJson();
    final trusted = ComicProject.fromJson(
      json,
      GenerateParams(),
      trustOutputs: true,
    );
    final imported = ComicProject.fromJson(json, GenerateParams());
    expect(trusted.historyGroupId, 'group-1');
    expect(trusted.panels.first.outputPath, r'C:\trusted\panel.png');
    expect(imported.historyGroupId, isNull);
    expect(imported.panels.first.outputPath, isEmpty);
  });

  test('comic project JSON preserves panel parameters and reference switches',
      () {
    final source = _project();
    source.panels.first
      ..overrideParams = true
      ..params = (GenerateParams()
        ..width = 1472
        ..height = 1472
        ..steps = 36);
    source.references.add(ComicReference(
      id: 'ref-1',
      name: 'hero.png',
      base64: 'YWJj',
      kind: 'character',
      useForGeneration: false,
    ));
    final restored = ComicProject.fromJson(source.toJson(), GenerateParams());
    expect(restored.panels.first.params.width, 1472);
    expect(restored.panels.first.params.steps, 36);
    expect(restored.references.single.useForGeneration, isFalse);
  });

  for (final viewport in <(String, Size)>[
    ('phone', const Size(360, 800)),
    ('tablet', const Size(1280, 800)),
  ]) {
    testWidgets('four comic steps fit the ${viewport.$1} viewport',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = viewport.$2;
      addTearDown(tester.view.reset);
      final app = AppState();
      final controller = ComicController(app)
        ..project = _project()
        ..activePanelId = 'panel-0'
        ..loaded = true;
      addTearDown(app.dispose);
      addTearDown(controller.dispose);

      for (final step in ComicStep.values) {
        controller.step = step;
        await tester.pumpWidget(
          ChangeNotifierProvider.value(
            value: app,
            child: MaterialApp(
              theme: StudioTheme.light(),
              home: ComicScreen(controller: controller),
            ),
          ),
        );
        await tester.pump();
        expect(
          tester.takeException(),
          isNull,
          reason: '${viewport.$1} ${step.name}',
        );
      }
    });
  }
}

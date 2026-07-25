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
    title: 'Test comic',
    globalStylePrompt: 'masterpiece, best quality',
    globalNegativePrompt: 'lowres',
    initialGenerationCount: 3,
    globalParams: params,
    panels: List.generate(
      3,
      (index) => ComicPanel(
        id: 'panel-$index',
        index: index + 1,
        title: 'Panel ${index + 1}',
        prompt: 'panel ${index + 1} prompt',
        params: params.copy(),
      ),
    ),
  );
}

void main() {
  test('trusted restore keeps candidates while imported JSON clears them', () {
    final source = _project();
    source.historyGroupId = 'group-1';
    source.panels.first
      ..candidates.add(ComicCandidate(
        id: 'candidate-1',
        historyItemId: 'history-1',
        outputPath: r'C:\trusted\panel.png',
        createdAt: '2026-07-22T00:00:00Z',
      ))
      ..selectedCandidateId = 'candidate-1';
    final json = source.toJson();
    final trusted = ComicProject.fromJson(
      json,
      GenerateParams(),
      trustOutputs: true,
    );
    final imported = ComicProject.fromJson(json, GenerateParams());
    expect(trusted.historyGroupId, 'group-1');
    expect(trusted.panels.first.selectedCandidate?.outputPath,
        r'C:\trusted\panel.png');
    expect(imported.historyGroupId, isNull);
    expect(imported.panels.first.candidates, isEmpty);
  });

  test('v2 project preserves global and per-panel generation settings', () {
    final source = _project();
    source.panels.first
      ..overrideParams = true
      ..params = (GenerateParams()
        ..width = 1472
        ..height = 1472
        ..steps = 36);
    final restored = ComicProject.fromJson(source.toJson(), GenerateParams());
    expect(restored.initialGenerationCount, 3);
    expect(restored.globalNegativePrompt, 'lowres');
    expect(restored.panels.first.params.width, 1472);
    expect(restored.panels.first.params.steps, 36);
  });

  test('old comic project schema is rejected', () {
    expect(
      () => ComicProject.fromJson(
        {'schemaVersion': 1, 'panels': []},
        GenerateParams(),
      ),
      throwsFormatException,
    );
  });

  test('local precise references survive trusted restore but not export', () {
    final source = _project();
    source.preciseReferences.add(ComicReferenceAsset(
      id: 'reference-1',
      name: 'hero.png',
      filePath: '/project/references/hero.png',
      strength: .8,
    ));
    source.panels.first.preciseReferences.add(ComicPanelReference(
      referenceId: 'reference-1',
      type: 'character&style',
      strength: .6,
      fidelity: .5,
    ));
    final trusted = ComicProject.fromJson(
      source.toJson(),
      GenerateParams(),
      trustOutputs: true,
    );
    final portable = source.toJson(includeLocalReferences: false);
    expect(trusted.preciseReferences, hasLength(1));
    expect(trusted.panels.first.preciseReferences.single.strength, .6);
    expect(portable['preciseReferences'], isEmpty);
    expect((portable['panels'] as List).first['preciseReferences'], isEmpty);
  });

  test('tag imports support text, titled JSON, and quoted CSV', () {
    expect(parseComicImport('one\ntwo').map((item) => item.$2), ['one', 'two']);
    expect(
      parseComicImport(
        '[{"title":"Opening","prompt":"1girl"}]',
        fileName: 'panels.json',
      ).single,
      ('Opening', '1girl'),
    );
    expect(
      parseComicImport(
        'title,prompt\n"Panel, One","1girl, smile"',
        fileName: 'panels.csv',
      ).single,
      ('Panel, One', '1girl, smile'),
    );
  });

  test('per-panel size import is strict and overrides global dimensions', () {
    final sizes = parseComicSizeImport(
      '832×1216\n1216x832\n1024×1024',
      3,
    );
    expect(sizes.map((size) => '${size.width}x${size.height}'),
        ['832x1216', '1216x832', '1024x1024']);
    expect(comicSizeTemplate(2, sizes.first), '832×1216\n832×1216');
    expect(
      () => parseComicSizeImport('832×1216', 2),
      throwsA(isA<ComicSizeImportException>()),
    );
    expect(
      () => parseComicSizeImport('832×1216\n\n1024×1024', 3),
      throwsA(isA<ComicSizeImportException>()),
    );
    expect(
      () => parseComicSizeImport('800×1200', 1),
      throwsA(isA<ComicSizeImportException>()),
    );

    final app = AppState();
    final controller = ComicController(app)
      ..project = _project()
      ..loaded = true;
    addTearDown(app.dispose);
    addTearDown(controller.dispose);
    controller.project
      ..sizeMode = ComicSizeMode.perPanel
      ..panels.first.imageWidth = 832
      ..panels.first.imageHeight = 1216;
    final params = controller.paramsFor(controller.project.panels.first);
    expect((params.width, params.height), (832, 1216));
  });

  for (final viewport in <(String, Size)>[
    ('phone portrait', const Size(360, 800)),
    ('phone landscape', const Size(800, 360)),
    ('tablet landscape', const Size(1280, 800)),
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
        expect(tester.takeException(), isNull,
            reason: '${viewport.$1} ${step.name}');
      }
    });
  }
}

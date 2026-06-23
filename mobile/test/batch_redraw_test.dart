import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novelai_mobile/batch/batch_redraw_controller.dart';
import 'package:novelai_mobile/batch/batch_redraw_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/batch_redraw_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

BatchRedrawProject _project() {
  final png = base64Encode(img.encodePng(img.Image(width: 2, height: 2)));
  final params = GenerateParams();
  return BatchRedrawProject(
    groupName: '批量测试',
    globalParams: params,
    items: List.generate(
      3,
      (index) => BatchRedrawItem(
        id: 'item-$index',
        name: 'input-$index.png',
        base64: png,
        width: 2,
        height: 2,
        prompt: 'prompt $index',
        params: params.copy(),
      ),
    ),
  );
}

void main() {
  test('batch JSON keeps trusted outputs and strips imported paths', () {
    final source = _project();
    source
      ..historyGroupId = 'group-1'
      ..items.first.outputPath = r'C:\trusted\result.png';
    final trusted = BatchRedrawProject.fromJson(
      source.toJson(),
      GenerateParams(),
      trustOutputs: true,
    );
    final imported =
        BatchRedrawProject.fromJson(source.toJson(), GenerateParams());
    expect(trusted.items.first.outputPath, r'C:\trusted\result.png');
    expect(imported.items.first.outputPath, isEmpty);
    expect(imported.historyGroupId, isNull);
  });

  test('batch project JSON preserves independent reference settings', () {
    final project = BatchRedrawProject.empty(GenerateParams())
      ..vibeImages.add(const VibeTransferItem(
        base64: 'YWJj',
        infoExtracted: 0.4,
        strength: 0.6,
      ))
      ..preciseReferences.add(const PreciseReferenceItem(
        base64: 'ZGVm',
        type: 'character',
        strength: 0.8,
        fidelity: 0.7,
        informationExtracted: 0.3,
        width: 1024,
        height: 1536,
      ));

    final restored = BatchRedrawProject.fromJson(
      project.toJson(),
      GenerateParams(),
    );
    expect(restored.vibeImages.single.infoExtracted, 0.4);
    expect(restored.preciseReferences.single.type, 'character');
    expect(restored.preciseReferences.single.informationExtracted, 0.3);
    expect(restored.preciseReferences.single.width, 1024);
  });

  for (final viewport in <(String, Size)>[
    ('phone', const Size(360, 800)),
    ('tablet', const Size(1280, 800)),
  ]) {
    testWidgets('batch redraw steps fit the ${viewport.$1} viewport',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = viewport.$2;
      addTearDown(tester.view.reset);
      final app = AppState();
      final controller = BatchRedrawController(app)
        ..project = _project()
        ..loaded = true;
      addTearDown(app.dispose);
      addTearDown(controller.dispose);
      for (final step in BatchRedrawStep.values) {
        controller.step = step;
        await tester.pumpWidget(
          ChangeNotifierProvider.value(
            value: app,
            child: MaterialApp(
              theme: StudioTheme.light(),
              home: BatchRedrawScreen(controller: controller),
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

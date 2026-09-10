import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/scene_bindings_editor.dart';

void main() {
  for (final width in [390.0, 768.0]) {
    for (final brightness in [Brightness.light, Brightness.dark]) {
      testWidgets('bound editor $width $brightness fits and displays ownership',
          (tester) async {
        tester.view.physicalSize = Size(width, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final fixture = jsonDecode(
                File('../shared/tavern-scene-fixtures.json').readAsStringSync())
            as Map;
        final key = GlobalKey();
        await tester.pumpWidget(RepaintBoundary(
            key: key,
            child: MaterialApp(
                theme: ThemeData(brightness: brightness, useMaterial3: true),
                home: SceneBindingsEditor(
                    scene: Map<String, dynamic>.from(fixture['scene']),
                    language: 'zh-CN'))));
        await tester.pumpAndSettle();
        await tester.tap(find.text('红发男子'));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('A 的外套'));
        await tester.tap(find.text('A 的外套'));
        await tester.pumpAndSettle();
        expect(find.text('穿戴者'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.runAsync(() async {
          final boundary =
              key.currentContext!.findRenderObject() as RenderRepaintBoundary;
          final image = await boundary.toImage(pixelRatio: 1);
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          image.dispose();
          final out = Directory('../../mobile-ui')..createSync(recursive: true);
          File('${out.path}/${width.toInt()}-${brightness.name}.png')
              .writeAsBytesSync(bytes!.buffer.asUint8List());
        });
      });
    }
  }
}

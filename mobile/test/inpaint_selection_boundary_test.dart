import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/inpaint/inpaint_mask.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/inpaint_mask_editor.dart';

void main() {
  test('non-grid bounds survive copy, larger selections and crossing erasers',
      () async {
    const box = Rect.fromLTRB(9, 7, 29, 31);
    for (final shape in InpaintBrushShape.values) {
      final stroke = InpaintStroke(
          brushCells: 30, shape: shape, points: [const Offset(.5, .5)]);
      // A previous globally inverted mask is committed as real ink inside the box.
      final old = restrictInpaintStrokes([], box, inverted: true);
      final ink = restrictInpaintStrokes([stroke], box, inverted: false);
      for (final input in [old, ink]) {
        final strokes = restrictInpaintStrokes(
            copyInpaintStrokes(input), const Rect.fromLTWH(0, 0, 40, 40),
            inverted: false);
        strokes.add(InpaintStroke(
            brushCells: 30,
            erase: true,
            shape: shape,
            clip: const Rect.fromLTWH(5, 6, 11, 32),
            points: [const Offset(.5, .5)]));
        final png =
            await renderInpaintMask(strokes: strokes, width: 40, height: 40);
        final codec = await ui.instantiateImageCodec(png);
        final image = (await codec.getNextFrame()).image;
        final bytes =
            (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
        for (var y = 0; y < 40; y++) {
          for (var x = 0; x < 40; x++) {
            expect(bytes.getUint8((y * 40 + x) * 4),
                x >= 16 && x < 29 && y >= 7 && y < 31 ? 255 : 0,
                reason: '$shape at ($x,$y)');
          }
        }
        image.dispose();
        codec.dispose();
      }
    }
  });
  testWidgets(
      'committed box trims old and crossing strokes in the exported PNG',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    InpaintMaskEditResult? result;
    await tester.pumpWidget(MaterialApp(
        home: Builder(
            builder: (context) => TextButton(
                onPressed: () async {
                  result = await Navigator.push<InpaintMaskEditResult>(
                      context,
                      MaterialPageRoute(
                          builder: (_) => InpaintMaskEditor(
                                image: const WorkingImage(
                                    filePath: 'test.png',
                                    width: 512,
                                    height: 512),
                                imageProvider: const AssetImage(
                                    'assets/icon/app_icon.png'),
                                language: 'zh-CN',
                                initialStrokes: [
                                  InpaintStroke(brushCells: 8, points: [
                                    const Offset(.12, .12),
                                    const Offset(.88, .88)
                                  ])
                                ],
                              )));
                },
                child: const Text('open')))));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    final rect = tester
        .getRect(find.byKey(const ValueKey('inpaint-mask-preview-boundary')));
    Offset at(double x, double y) =>
        rect.topLeft + Offset(rect.width * x, rect.height * y);
    final selector = find.byKey(const ValueKey('select-inpaint-region'));
    await tester.tap(selector);
    await tester.pump();
    final box = await tester.startGesture(at(.27, .24));
    await box.moveTo(at(.73, .76));
    await box.up();
    await tester.pump();
    if (tester.widget<IconButton>(selector).isSelected == true) {
      await tester.tap(selector);
      await tester.pump();
    }
    final pen = await tester.startGesture(at(.08, .50));
    await pen.moveTo(at(.92, .50));
    await pen.up();
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('inpaint-mask-done')));
    await tester.pumpAndSettle();
    final r = result!.region!;
    final counts = await tester.runAsync(() async {
      final png = await renderInpaintMask(
          strokes: copyInpaintStrokes(result!.strokes),
          width: 512,
          height: 512,
          inverted: result!.inverted);
      final codec = await ui.instantiateImageCodec(png);
      final image = (await codec.getNextFrame()).image;
      final pixels =
          (await image.toByteData(format: ui.ImageByteFormat.rawRgba))!;
      var inside = 0, outside = 0;
      for (var y = 0; y < 512; y++) {
        for (var x = 0; x < 512; x++) {
          if (pixels.getUint8((y * 512 + x) * 4) == 0) continue;
          if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) {
            inside++;
          } else {
            outside++;
          }
        }
      }
      image.dispose();
      codec.dispose();
      return (inside, outside);
    });
    debugPrint('mask: inside=${counts!.$1}, outside=${counts.$2}');
    expect(counts.$1, greaterThan(0));
    expect(counts.$2, 0);
  });
}

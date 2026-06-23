import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/inpaint/inpaint_mask.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('normalizes only points inside the visible image canvas', () {
    expect(
      normalizeCanvasPoint(const Offset(50, 100), const Size(100, 200)),
      const Offset(0.5, 0.5),
    );
    expect(
      normalizeCanvasPoint(const Offset(-1, 20), const Size(100, 200)),
      isNull,
    );
    expect(
      normalizeCanvasPoint(const Offset(20, 201), const Size(100, 200)),
      isNull,
    );
  });

  test('exports a binary PNG at the exact original dimensions', () async {
    final bytes = await renderInpaintMask(
      width: 96,
      height: 160,
      strokes: [
        InpaintStroke(
          brushFraction: 0.2,
          points: [const Offset(0.5, 0.4), const Offset(0.5, 0.6)],
        ),
      ],
    );
    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    expect(frame.image.width, 96);
    expect(frame.image.height, 160);

    final rgba =
        await frame.image.toByteData(format: ui.ImageByteFormat.rawRgba);
    expect(rgba, isNotNull);
    final pixels = rgba!.buffer.asUint8List();
    int redAt(int x, int y) => pixels[(y * 96 + x) * 4];
    expect(redAt(0, 0), 0);
    expect(redAt(48, 80), 255);

    frame.image.dispose();
    codec.dispose();
  });
}

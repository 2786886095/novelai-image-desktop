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
    // Exact cell-boundary behavior is covered by the quantization test below;
    // this just confirms the stroke itself renders as white.
    expect(redAt(48, 80), 255);

    frame.image.dispose();
    codec.dispose();
  });

  test('quantizes the free-hand stroke to whole 64px latent cells', () async {
    // NovelAI inpainting works on a 64px latent grid, so a tiny stroke must
    // expand to cover its entire cell — mirrors desktop's buildLatentMaskCells.
    final bytes = await renderInpaintMask(
      width: 128,
      height: 128,
      strokes: [
        InpaintStroke(
          brushFraction: 0.05,
          points: [const Offset(0.75, 0.75)], // pixel (96, 96): a single dot
        ),
      ],
    );
    final codec = await ui.instantiateImageCodec(bytes);
    final frame = await codec.getNextFrame();
    final rgba =
        await frame.image.toByteData(format: ui.ImageByteFormat.rawRgba);
    final pixels = rgba!.buffer.asUint8List();
    int redAt(int x, int y) => pixels[(y * 128 + x) * 4];

    // Bottom-right cell (x/y 64-127) is the one the dot falls in: the whole
    // cell must be white, including its far corner where the raw dot never
    // reached.
    expect(redAt(96, 96), 255);
    expect(redAt(64, 64), 255);
    expect(redAt(127, 127), 255);

    // Every other cell must stay fully black.
    expect(redAt(0, 0), 0);
    expect(redAt(63, 63), 0);
    expect(redAt(63, 64), 0);
    expect(redAt(64, 63), 0);

    frame.image.dispose();
    codec.dispose();
  });
}

import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/inpaint/inpaint_mask.dart';

Future<({ui.Codec codec, ui.Image image, Uint8List pixels})> _decode(
    Uint8List bytes) async {
  final codec = await ui.instantiateImageCodec(bytes);
  final frame = await codec.getNextFrame();
  final rgba = await frame.image.toByteData(format: ui.ImageByteFormat.rawRgba);
  return (codec: codec, image: frame.image, pixels: rgba!.buffer.asUint8List());
}

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

  test('matches official 8px mask grid and direct-entry limits', () {
    expect(inpaintMaskGridSize, 8);
    expect(inpaintBrushSliderMin, 4);
    expect(inpaintBrushSliderMax, 50);
    expect(normalizeInpaintBrushCells(1, InpaintBrushShape.square), 1);
    expect(normalizeInpaintBrushCells(1, InpaintBrushShape.round), 2);
    expect(normalizeInpaintBrushCells(3, InpaintBrushShape.round), 4);
    expect(normalizeInpaintBrushCells(999, InpaintBrushShape.square), 500);
  });

  test('coalesces pointer samples that remain in one source mask cell', () {
    const sourceSize = Size(512, 512);
    expect(
      inpaintPointsShareGridCell(
        const Offset(0.1000, 0.1000),
        const Offset(0.1010, 0.1010),
        sourceSize,
      ),
      isTrue,
    );
    expect(
      inpaintPointsShareGridCell(
        const Offset(0.1000, 0.1000),
        const Offset(0.1300, 0.1300),
        sourceSize,
      ),
      isFalse,
    );
  });

  test('exports a binary PNG at the exact original dimensions', () async {
    final bytes = await renderInpaintMask(
      width: 96,
      height: 160,
      strokes: [
        InpaintStroke(
          brushCells: 4,
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
    expect(redAt(48, 80), 255);
    for (var index = 0; index < pixels.length; index += 4) {
      expect(pixels[index], anyOf(0, 255));
    }

    frame.image.dispose();
    codec.dispose();
  });

  test('keeps a small round stroke pixel-accurate without 64px expansion',
      () async {
    final bytes = await renderInpaintMask(
      width: 128,
      height: 128,
      strokes: [
        InpaintStroke(
          brushCells: 2,
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

    expect(redAt(96, 96), 255);
    expect(redAt(64, 64), 0);
    expect(redAt(127, 127), 0);
    expect(redAt(0, 0), 0);

    frame.image.dispose();
    codec.dispose();
  });

  test('eraser removes painted mask areas at source resolution', () async {
    final bytes = await renderInpaintMask(
      width: 128,
      height: 128,
      strokes: [
        InpaintStroke(
          brushCells: 6,
          points: [const Offset(0.25, 0.25)],
        ),
        InpaintStroke(
          brushCells: 6,
          erase: true,
          points: [const Offset(0.25, 0.25)],
        ),
      ],
    );
    final decoded = await _decode(bytes);
    int redAt(int x, int y) => decoded.pixels[(y * 128 + x) * 4];
    expect(redAt(32, 32), 0);
    expect(redAt(0, 0), 0);
    decoded.image.dispose();
    decoded.codec.dispose();
  });

  test('inverted export flips selected and unselected pixels', () async {
    final bytes = await renderInpaintMask(
      width: 128,
      height: 128,
      inverted: true,
      strokes: [
        InpaintStroke(
          brushCells: 2,
          points: [const Offset(0.75, 0.75)],
        ),
      ],
    );
    final decoded = await _decode(bytes);
    int redAt(int x, int y) => decoded.pixels[(y * 128 + x) * 4];
    expect(redAt(96, 96), 0);
    expect(redAt(0, 0), 255);
    expect(redAt(63, 64), 255);
    decoded.image.dispose();
    decoded.codec.dispose();
  });

  test('square brush remains continuous while drawing diagonally', () async {
    final bytes = await renderInpaintMask(
      width: 128,
      height: 128,
      strokes: [
        InpaintStroke(
          brushCells: 1,
          shape: InpaintBrushShape.square,
          points: const [Offset(0.125, 0.125), Offset(0.875, 0.875)],
        ),
      ],
    );
    final decoded = await _decode(bytes);
    int redAt(int x, int y) => decoded.pixels[(y * 128 + x) * 4];
    for (var coordinate = 16; coordinate <= 112; coordinate++) {
      expect(redAt(coordinate, coordinate), 255,
          reason: 'diagonal gap at $coordinate');
    }
    expect(redAt(64, 72), 0);
    decoded.image.dispose();
    decoded.codec.dispose();
  });

  test('round and square tips preserve their distinct geometry', () async {
    Future<int> cornerFor(InpaintBrushShape shape) async {
      final bytes = await renderInpaintMask(
        width: 128,
        height: 128,
        strokes: [
          InpaintStroke(
            brushCells: 4,
            shape: shape,
            points: const [Offset(0.5, 0.5)],
          ),
        ],
      );
      final decoded = await _decode(bytes);
      final value = decoded.pixels[(49 * 128 + 49) * 4];
      decoded.image.dispose();
      decoded.codec.dispose();
      return value;
    }

    expect(await cornerFor(InpaintBrushShape.round), 0);
    expect(await cornerFor(InpaintBrushShape.square), 255);
  });
}

import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

enum InpaintBrushShape { round, square }

const double inpaintMaskGridSize = 8;
const int inpaintBrushSliderMin = 4;
const int inpaintBrushSliderMax = 50;
const int inpaintBrushDirectMax = 500;

int normalizeInpaintBrushCells(num value, InpaintBrushShape shape) {
  final rounded = value.isFinite ? value.round() : inpaintBrushSliderMin;
  if (shape == InpaintBrushShape.round) {
    return (2 * (rounded / 2).round()).clamp(2, inpaintBrushDirectMax).toInt();
  }
  return rounded.clamp(1, inpaintBrushDirectMax).toInt();
}

class InpaintStroke {
  final int brushCells;
  final bool erase;
  final InpaintBrushShape shape;
  final List<Offset> points;

  InpaintStroke({
    required this.brushCells,
    this.erase = false,
    this.shape = InpaintBrushShape.round,
    List<Offset>? points,
  }) : points = points ?? <Offset>[];

  InpaintStroke copy() => InpaintStroke(
        brushCells: brushCells,
        erase: erase,
        shape: shape,
        points: List<Offset>.from(points),
      );
}

List<InpaintStroke> copyInpaintStrokes(Iterable<InpaintStroke> strokes) =>
    strokes.map((stroke) => stroke.copy()).toList(growable: true);

Offset? normalizeCanvasPoint(Offset point, Size canvasSize) {
  if (canvasSize.isEmpty ||
      point.dx < 0 ||
      point.dy < 0 ||
      point.dx > canvasSize.width ||
      point.dy > canvasSize.height) {
    return null;
  }
  return Offset(point.dx / canvasSize.width, point.dy / canvasSize.height);
}

/// Returns the source-mask grid cell used by the pixel-accurate inpaint brush.
///
/// Pointer devices can report many positions while the finger is still inside
/// the same 8 x 8 source-image cell. Keeping all of those points does not alter
/// the exported mask, but it makes every later preview increasingly expensive.
(int, int) inpaintGridCellForNormalizedPoint(
  Offset point,
  Size size, {
  double gridSize = inpaintMaskGridSize,
}) =>
    (
      (point.dx * size.width / gridSize).round(),
      (point.dy * size.height / gridSize).round(),
    );

bool inpaintPointsShareGridCell(
  Offset first,
  Offset second,
  Size size, {
  double gridSize = inpaintMaskGridSize,
}) =>
    inpaintGridCellForNormalizedPoint(
      first,
      size,
      gridSize: gridSize,
    ) ==
    inpaintGridCellForNormalizedPoint(
      second,
      size,
      gridSize: gridSize,
    );

Iterable<Offset> inpaintGridBrushSamples(
  InpaintStroke stroke,
  Size size,
  double gridSize,
) sync* {
  if (stroke.points.isEmpty) return;
  Offset toGridPoint(Offset point) => Offset(
        point.dx * size.width / gridSize,
        point.dy * size.height / gridSize,
      );

  var from = toGridPoint(stroke.points.first);
  yield from;
  for (var index = 1; index < stroke.points.length; index++) {
    final to = toGridPoint(stroke.points[index]);
    var x = from.dx.round();
    var y = from.dy.round();
    final targetX = to.dx.round();
    final targetY = to.dy.round();
    final deltaX = (targetX - x).abs();
    final deltaY = (targetY - y).abs();
    final stepX = x < targetX ? 1 : -1;
    final stepY = y < targetY ? 1 : -1;
    var error = deltaX - deltaY;
    while (x != targetX || y != targetY) {
      final doubled = error * 2;
      if (doubled > -deltaY) {
        error -= deltaY;
        x += stepX;
      }
      if (doubled < deltaX) {
        error += deltaX;
        y += stepY;
      }
      yield Offset(x.toDouble(), y.toDouble());
    }
    from = to;
  }
}

final Map<int, List<(int, int)>> _roundBrushCellCache = {};

List<(int, int)> _roundBrushCells(int radius) =>
    _roundBrushCellCache.putIfAbsent(radius, () {
      final cells = <(int, int)>[];
      for (var deltaY = -radius; deltaY <= radius; deltaY++) {
        for (var deltaX = -radius; deltaX <= radius; deltaX++) {
          final x = deltaX.abs().toDouble();
          final y = deltaY.abs().toDouble();
          final outer = Offset(x + 0.5, y + 0.5).distance;
          final inner = Offset(x - 0.5, y - 0.5).distance;
          if (math.min(outer, inner) <= radius) {
            cells.add((deltaX, deltaY));
          }
        }
      }
      return cells;
    });

void paintInpaintStroke(
  Canvas canvas,
  Size size,
  InpaintStroke stroke, {
  required Color color,
  BlendMode blendMode = BlendMode.srcOver,
  double gridSize = inpaintMaskGridSize,
}) {
  if (stroke.points.isEmpty) return;
  final paint = Paint()
    ..color = color
    ..blendMode = blendMode
    ..isAntiAlias = false
    ..style = PaintingStyle.fill;
  final cells = normalizeInpaintBrushCells(stroke.brushCells, stroke.shape);
  final samples = inpaintGridBrushSamples(stroke, size, gridSize);
  // Submit rectangles to Skia in bounded paths instead of issuing one canvas
  // draw call per source pixel. This is especially important for a large round
  // brush, whose footprint can contain thousands of 8 x 8 cells.
  const maxRectsPerPath = 4096;
  var path = Path();
  var rectCount = 0;
  void flushPath() {
    if (rectCount == 0) return;
    canvas.drawPath(path, paint);
    path = Path();
    rectCount = 0;
  }

  void addRect(Rect rect) {
    path.addRect(rect);
    rectCount++;
    if (rectCount >= maxRectsPerPath) flushPath();
  }

  if (stroke.shape == InpaintBrushShape.square) {
    for (final point in samples) {
      final left = (point.dx - cells / 2).round();
      final top = (point.dy - cells / 2).round();
      addRect(
        Rect.fromLTWH(
          left * gridSize,
          top * gridSize,
          cells * gridSize,
          cells * gridSize,
        ),
      );
    }
    flushPath();
    return;
  }

  final radius = (cells / 2).round();
  final roundCells = _roundBrushCells(radius);
  for (final point in samples) {
    final centerX = point.dx.floor();
    final centerY = point.dy.floor();
    for (final cell in roundCells) {
      addRect(
        Rect.fromLTWH(
          (centerX + cell.$1) * gridSize,
          (centerY + cell.$2) * gridSize,
          gridSize,
          gridSize,
        ),
      );
    }
  }
  flushPath();
}

Future<Uint8List> renderInpaintMask({
  required List<InpaintStroke> strokes,
  required int width,
  required int height,
  bool inverted = false,
}) async {
  if (width <= 0 || height <= 0) {
    throw ArgumentError('Mask dimensions must be positive.');
  }

  final size = Size(width.toDouble(), height.toDouble());
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawRect(
    Offset.zero & size,
    Paint()..color = inverted ? Colors.white : Colors.black,
  );

  for (final stroke in strokes) {
    final rawColor = stroke.erase ? Colors.black : Colors.white;
    final color = inverted
        ? (rawColor == Colors.white ? Colors.black : Colors.white)
        : rawColor;
    paintInpaintStroke(canvas, size, stroke, color: color);
  }

  final image = await recorder.endRecording().toImage(width, height);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  if (data == null) throw StateError('Unable to encode the inpaint mask.');
  return data.buffer.asUint8List();
}

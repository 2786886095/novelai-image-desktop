import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

class InpaintStroke {
  final double brushFraction;
  final List<Offset> points;

  InpaintStroke({required this.brushFraction, List<Offset>? points})
      : points = points ?? <Offset>[];
}

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

// Editing stays pixel-precise, but NovelAI inpainting works on a 64px latent
// grid. Expand touched cells only in the exported mask; this preserves the
// free round brush feel while giving the API a clean, aligned mask — mirrors
// desktop's InpaintCanvas.tsx exportMask/buildLatentMaskCells.
const _maskCellSize = 64;

class _LatentMaskCells {
  final Uint8List cellOn;
  final int cols;
  final int rows;
  final bool any;
  _LatentMaskCells(this.cellOn, this.cols, this.rows, this.any);
}

Future<_LatentMaskCells> _buildLatentMaskCells(
  ByteData rgba,
  int width,
  int height,
  int cellSize,
) async {
  final bytes = rgba.buffer.asUint8List();
  final cols = (width / cellSize).ceil();
  final rows = (height / cellSize).ceil();
  final cellOn = Uint8List(cols * rows);
  var any = false;
  for (var y = 0; y < height; y++) {
    final rowBase = y * width;
    final cellRow = (y ~/ cellSize) * cols;
    for (var x = 0; x < width; x++) {
      final index = (rowBase + x) * 4;
      if (bytes[index] + bytes[index + 1] + bytes[index + 2] > 32) {
        cellOn[cellRow + (x ~/ cellSize)] = 1;
        any = true;
      }
    }
  }
  return _LatentMaskCells(cellOn, cols, rows, any);
}

Future<Uint8List> renderInpaintMask({
  required List<InpaintStroke> strokes,
  required int width,
  required int height,
}) async {
  if (width <= 0 || height <= 0) {
    throw ArgumentError('Mask dimensions must be positive.');
  }

  final size = Size(width.toDouble(), height.toDouble());
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawRect(Offset.zero & size, Paint()..color = Colors.black);

  for (final stroke in strokes) {
    if (stroke.points.isEmpty) continue;
    final strokeWidth = (stroke.brushFraction * size.shortestSide)
        .clamp(1.0, size.shortestSide);
    final paint = Paint()
      ..color = Colors.white
      ..isAntiAlias = false
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    final points = stroke.points
        .map((point) => Offset(point.dx * size.width, point.dy * size.height))
        .toList(growable: false);
    if (points.length == 1) {
      canvas.drawCircle(
        points.first,
        strokeWidth / 2,
        Paint()
          ..color = Colors.white
          ..isAntiAlias = false,
      );
      continue;
    }
    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (final point in points.skip(1)) {
      path.lineTo(point.dx, point.dy);
    }
    canvas.drawPath(path, paint);
  }

  final rawImage = await recorder.endRecording().toImage(width, height);
  final rawData = await rawImage.toByteData(format: ui.ImageByteFormat.rawRgba);
  rawImage.dispose();
  if (rawData == null) throw StateError('Unable to read the inpaint mask raster.');
  final cells =
      await _buildLatentMaskCells(rawData, width, height, _maskCellSize);

  final cellRecorder = ui.PictureRecorder();
  final cellCanvas = Canvas(cellRecorder);
  cellCanvas.drawRect(Offset.zero & size, Paint()..color = Colors.black);
  if (cells.any) {
    final cellPaint = Paint()..color = Colors.white;
    for (var row = 0; row < cells.rows; row++) {
      for (var col = 0; col < cells.cols; col++) {
        if (cells.cellOn[row * cells.cols + col] == 0) continue;
        cellCanvas.drawRect(
          Rect.fromLTWH(
            (col * _maskCellSize).toDouble(),
            (row * _maskCellSize).toDouble(),
            _maskCellSize.toDouble(),
            _maskCellSize.toDouble(),
          ),
          cellPaint,
        );
      }
    }
  }
  final image = await cellRecorder.endRecording().toImage(width, height);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  if (data == null) throw StateError('Unable to encode the inpaint mask.');
  return data.buffer.asUint8List();
}

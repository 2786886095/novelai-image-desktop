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

  final picture = recorder.endRecording();
  final image = await picture.toImage(width, height);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  if (data == null) throw StateError('Unable to encode the inpaint mask.');
  return data.buffer.asUint8List();
}

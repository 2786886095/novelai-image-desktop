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
  // Immutable source-pixel bounds, also retained when a selection is removed.
  final Rect? clip;
  final bool solid;

  InpaintStroke({
    required this.brushCells,
    this.erase = false,
    this.shape = InpaintBrushShape.round,
    this.clip,
    this.solid = false,
    List<Offset>? points,
  }) : points = points ?? <Offset>[];

  InpaintStroke copy() => InpaintStroke(
        brushCells: brushCells,
        erase: erase,
        shape: shape,
        clip: clip,
        solid: solid,
        points: List<Offset>.from(points),
      );
}

List<InpaintStroke> copyInpaintStrokes(Iterable<InpaintStroke> strokes) =>
    strokes.map((stroke) => stroke.copy()).toList(growable: true);

/// Restrict every operation, not only its sampled centres. Intersections make
/// reselecting a larger box destructive rather than revealing previous ink.
List<InpaintStroke> restrictInpaintStrokes(
    List<InpaintStroke> strokes, Rect box,
    {required bool inverted}) {
  final result = <InpaintStroke>[
    if (inverted) InpaintStroke(brushCells: 1, clip: box, solid: true),
  ];
  for (final s in strokes) {
    final clip = s.clip?.intersect(box) ?? box;
    if (!clip.isEmpty) {
      result.add(InpaintStroke(
          brushCells: s.brushCells,
          erase: inverted != s.erase,
          shape: s.shape,
          points: s.points,
          solid: s.solid,
          clip: clip));
    }
  }
  return result;
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

/// Compact source-grid representation of an inpaint mask.
///
/// NovelAI inpaint masks operate on the source image's 8 x 8 pixel grid. A
/// raster therefore needs only a few tens of thousands of bytes for the common
/// 1216 x 832 canvas, no matter how many pointer events or separate strokes the
/// user draws. Keeping the current result instead of replaying all historical
/// strokes is what makes long mobile drawing sessions stay responsive.
class InpaintMaskRaster {
  final int sourceWidth;
  final int sourceHeight;
  final int columns;
  final int rows;
  final Uint8List _cells;
  // Only cells split by a non-grid-aligned box need per-pixel coverage.
  final _edges = <int, Uint8List>{};

  InpaintMaskRaster({
    required this.sourceWidth,
    required this.sourceHeight,
  })  : assert(sourceWidth > 0),
        assert(sourceHeight > 0),
        columns = math.max(1, (sourceWidth / inpaintMaskGridSize).ceil()),
        rows = math.max(1, (sourceHeight / inpaintMaskGridSize).ceil()),
        _cells = Uint8List(
          math.max(1, (sourceWidth / inpaintMaskGridSize).ceil()) *
              math.max(1, (sourceHeight / inpaintMaskGridSize).ceil()),
        );

  Size get sourceSize => Size(sourceWidth.toDouble(), sourceHeight.toDouble());

  bool get hasSelection =>
      _edges.isNotEmpty || _cells.any((value) => value != 0);

  bool selectedAt(int column, int row) =>
      column >= 0 &&
      row >= 0 &&
      column < columns &&
      row < rows &&
      (_cells[row * columns + column] != 0 ||
          _edges.containsKey(row * columns + column));

  bool clear() {
    if (!hasSelection) return false;
    _edges.clear();
    _cells.fillRange(0, _cells.length, 0);
    return true;
  }

  void rebuild(Iterable<InpaintStroke> strokes) {
    _edges.clear();
    _cells.fillRange(0, _cells.length, 0);
    for (final stroke in strokes) {
      applyStroke(stroke);
    }
  }

  bool applySegment(
    InpaintStroke stroke,
    Offset from,
    Offset to,
  ) =>
      applyStroke(InpaintStroke(
        brushCells: stroke.brushCells,
        erase: stroke.erase,
        shape: stroke.shape,
        clip: stroke.clip,
        points: [from, to],
      ));

  bool applyStroke(InpaintStroke stroke) {
    if (!stroke.solid && stroke.points.isEmpty) return false;
    final selected = !stroke.erase;
    final value = selected ? 255 : 0;
    final brushCells =
        normalizeInpaintBrushCells(stroke.brushCells, stroke.shape);
    var changed = false;

    void setCell(int column, int row) {
      if (column < 0 || row < 0 || column >= columns || row >= rows) return;
      final index = row * columns + column;
      final clip = stroke.clip;
      if (clip != null) {
        final x = column * 8, y = row * 8;
        final l = math.max(x, clip.left.toInt()),
            t = math.max(y, clip.top.toInt());
        final r = math.min(x + 8, clip.right.toInt()),
            b = math.min(y + 8, clip.bottom.toInt());
        if (l >= r || t >= b) return;
        if (l != x || t != y || r != x + 8 || b != y + 8) {
          if (!_edges.containsKey(index) && _cells[index] == value) return;
          final rows = _edges.putIfAbsent(
              index, () => Uint8List(8)..fillRange(0, 8, _cells[index]));
          final bits = ((1 << (r - l)) - 1) << (l - x);
          for (int i = t - y; i < b - y; i++) {
            final next = selected ? rows[i] | bits : rows[i] & ~bits;
            if (rows[i] != next) {
              changed = true;
              rows[i] = next;
            }
          }
          if (rows.every((v) => v == 0) || rows.every((v) => v == 255)) {
            _cells[index] = rows.first;
            _edges.remove(index);
          }
          return;
        }
      }
      if (_edges.remove(index) != null) changed = true;
      if (_cells[index] == value) return;
      _cells[index] = value;
      changed = true;
    }

    if (stroke.solid) {
      final clip = stroke.clip!;
      for (int row = math.max(0, clip.top.toInt() ~/ 8);
          row < math.min(rows, (clip.bottom / 8).ceil());
          row++) {
        for (int col = math.max(0, clip.left.toInt() ~/ 8);
            col < math.min(columns, (clip.right / 8).ceil());
            col++) {
          setCell(col, row);
        }
      }
      return changed;
    }
    final samples =
        inpaintGridBrushSamples(stroke, sourceSize, inpaintMaskGridSize);
    if (stroke.shape == InpaintBrushShape.square) {
      for (final point in samples) {
        final left = (point.dx - brushCells / 2).round();
        final top = (point.dy - brushCells / 2).round();
        for (var row = top; row < top + brushCells; row++) {
          for (var column = left; column < left + brushCells; column++) {
            setCell(column, row);
          }
        }
      }
      return changed;
    }

    final radius = (brushCells / 2).round();
    final footprint = _roundBrushCells(radius);
    for (final point in samples) {
      final centerX = point.dx.floor();
      final centerY = point.dy.floor();
      for (final cell in footprint) {
        setCell(centerX + cell.$1, centerY + cell.$2);
      }
    }
    return changed;
  }

  /// Paints only the final selected cells, combining adjacent cells into one
  /// horizontal run. Runtime depends on source-grid size, not stroke history.
  void paintSelection(
    Canvas canvas,
    Size targetSize, {
    required bool inverted,
    required Color color,
  }) {
    if (targetSize.isEmpty || color.alpha == 0) return;
    final path = Path();
    for (var row = 0; row < rows; row++) {
      var column = 0;
      while (column < columns) {
        final edge = _edges[row * columns + column];
        if (edge != null) {
          final x = column * 8, y = row * 8;
          for (var dy = 0; dy < 8 && y + dy < sourceHeight; dy++) {
            final bits = inverted ? 255 ^ edge[dy] : edge[dy];
            for (var dx = 0; dx < 8 && x + dx < sourceWidth; dx++) {
              if ((bits & (1 << dx)) == 0) continue;
              path.addRect(Rect.fromLTRB(
                  (x + dx) * targetSize.width / sourceWidth,
                  (y + dy) * targetSize.height / sourceHeight,
                  (x + dx + 1) * targetSize.width / sourceWidth,
                  (y + dy + 1) * targetSize.height / sourceHeight));
            }
          }
          column++;
          continue;
        }
        final rawSelected = _cells[row * columns + column] != 0;
        final visible = inverted ? !rawSelected : rawSelected;
        if (!visible) {
          column++;
          continue;
        }
        final start = column;
        column++;
        while (column < columns) {
          if (_edges.containsKey(row * columns + column)) break;
          final nextRaw = _cells[row * columns + column] != 0;
          if ((inverted ? !nextRaw : nextRaw) == false) break;
          column++;
        }
        final sourceLeft = start * inpaintMaskGridSize;
        final sourceRight = math.min(
          sourceWidth.toDouble(),
          column * inpaintMaskGridSize,
        );
        final sourceTop = row * inpaintMaskGridSize;
        final sourceBottom = math.min(
          sourceHeight.toDouble(),
          (row + 1) * inpaintMaskGridSize,
        );
        path.addRect(Rect.fromLTRB(
          sourceLeft * targetSize.width / sourceWidth,
          sourceTop * targetSize.height / sourceHeight,
          sourceRight * targetSize.width / sourceWidth,
          sourceBottom * targetSize.height / sourceHeight,
        ));
      }
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..isAntiAlias = false
        ..style = PaintingStyle.fill,
    );
  }
}

void paintInpaintStroke(
  Canvas canvas,
  Size size,
  InpaintStroke stroke, {
  required Color color,
  BlendMode blendMode = BlendMode.srcOver,
  double gridSize = inpaintMaskGridSize,
}) {
  final clip = stroke.clip;
  if (clip == null) {
    _paintGridStroke(canvas, size, stroke, color, blendMode, gridSize);
    return;
  }
  final scale = gridSize / inpaintMaskGridSize;
  final rect = Rect.fromLTRB(clip.left * scale, clip.top * scale,
      clip.right * scale, clip.bottom * scale);
  canvas.save();
  canvas.clipRect(rect, doAntiAlias: false);
  if (stroke.solid) {
    canvas.drawRect(
        rect,
        Paint()
          ..color = color
          ..blendMode = blendMode
          ..isAntiAlias = false);
  } else {
    _paintGridStroke(canvas, size, stroke, color, blendMode, gridSize);
  }
  canvas.restore();
}

void _paintGridStroke(Canvas canvas, Size size, InpaintStroke stroke,
    Color color, BlendMode blendMode, double gridSize) {
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
  final raster = InpaintMaskRaster(
    sourceWidth: width,
    sourceHeight: height,
  )..rebuild(strokes);
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawRect(
    Offset.zero & size,
    Paint()..color = Colors.black,
  );
  raster.paintSelection(
    canvas,
    size,
    inverted: inverted,
    color: Colors.white,
  );

  final image = await recorder.endRecording().toImage(width, height);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  if (data == null) throw StateError('Unable to encode the inpaint mask.');
  return data.buffer.asUint8List();
}

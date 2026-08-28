import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../i18n/app_locales.dart';
import '../inpaint/inpaint_mask.dart';
import '../models/nai_models.dart';

class InpaintMaskEditResult {
  final List<InpaintStroke> strokes;
  final bool inverted;
  final double brush;
  final double imageOpacity;
  final double maskOpacity;
  final InpaintBrushShape brushShape;

  const InpaintMaskEditResult({
    required this.strokes,
    required this.inverted,
    required this.brush,
    required this.imageOpacity,
    required this.maskOpacity,
    required this.brushShape,
  });
}

class InpaintMaskEditor extends StatefulWidget {
  final WorkingImage image;
  final Object? language;
  final List<InpaintStroke> initialStrokes;
  final bool initialInverted;
  final double initialBrush;
  final double initialImageOpacity;
  final double initialMaskOpacity;
  final InpaintBrushShape initialBrushShape;
  final ImageProvider<Object>? imageProvider;

  const InpaintMaskEditor({
    super.key,
    required this.image,
    required this.language,
    this.initialStrokes = const [],
    this.initialInverted = false,
    this.initialBrush = 4,
    this.initialImageOpacity = 1,
    this.initialMaskOpacity = 0.72,
    this.initialBrushShape = InpaintBrushShape.round,
    this.imageProvider,
  });

  @override
  State<InpaintMaskEditor> createState() => _InpaintMaskEditorState();
}

class _InpaintMaskEditorState extends State<InpaintMaskEditor> {
  late final List<InpaintStroke> _strokes;
  final List<InpaintStroke> _redo = [];
  final Map<int, Offset> _pointers = {};
  late bool _inverted;
  late double _brush;
  late double _imageOpacity;
  late double _maskOpacity;
  late InpaintBrushShape _brushShape;
  late final TextEditingController _brushController;
  double _scale = 1;
  Offset _offset = Offset.zero;
  Size _canvasSize = Size.zero;
  int? _drawPointer;
  Offset? _drawStart;
  int? _activeStroke;
  bool _transformedThisGesture = false;
  double _lastPinchDistance = 0;
  Offset _lastPinchCenter = Offset.zero;
  Offset? _cursor;
  bool _erase = false;

  String t(String key) => mobileUiTextFor(widget.language, key);

  @override
  void initState() {
    super.initState();
    _strokes = copyInpaintStrokes(widget.initialStrokes);
    _inverted = widget.initialInverted;
    _brushShape = widget.initialBrushShape;
    _brush =
        normalizeInpaintBrushCells(widget.initialBrush, _brushShape).toDouble();
    _brushController = TextEditingController(text: _brush.round().toString());
    _imageOpacity = widget.initialImageOpacity.clamp(0.15, 1).toDouble();
    _maskOpacity = widget.initialMaskOpacity.clamp(0.15, 1).toDouble();
  }

  double get _sourceShortest =>
      math.max(1, math.min(widget.image.width, widget.image.height)).toDouble();

  @override
  void dispose() {
    _brushController.dispose();
    super.dispose();
  }

  void _setBrush(double value) {
    final next = normalizeInpaintBrushCells(value, _brushShape).toDouble();
    setState(() => _brush = next);
    final text = next.round().toString();
    if (_brushController.text != text) {
      _brushController.value = TextEditingValue(
        text: text,
        selection: TextSelection.collapsed(offset: text.length),
      );
    }
  }

  void _commitBrushText() {
    final parsed = double.tryParse(_brushController.text);
    _setBrush(parsed ?? _brush);
  }

  void _setBrushShape(InpaintBrushShape shape) {
    _brushShape = shape;
    _setBrush(_brush);
  }

  Offset? _toNormalized(Offset localPoint) {
    if (_canvasSize.isEmpty || _scale <= 0) return null;
    final point = (localPoint - _offset) / _scale;
    return normalizeCanvasPoint(point, _canvasSize);
  }

  void _beginStroke(Offset localPoint) {
    final normalized = _toNormalized(localPoint);
    if (normalized == null) return;
    _redo.clear();
    _strokes.add(InpaintStroke(
      brushCells: _brush.round(),
      erase: _erase,
      shape: _brushShape,
      points: [normalized],
    ));
    _activeStroke = _strokes.length - 1;
    _cursor = normalized;
  }

  void _appendStroke(Offset localPoint) {
    final index = _activeStroke;
    if (index == null || index >= _strokes.length) return;
    final normalized = _toNormalized(localPoint);
    if (normalized == null) return;
    _strokes[index].points.add(normalized);
    _cursor = normalized;
  }

  void _cancelActiveStroke() {
    final index = _activeStroke;
    if (index != null && index < _strokes.length) _strokes.removeAt(index);
    _activeStroke = null;
    _drawPointer = null;
    _drawStart = null;
  }

  void _pointerDown(PointerDownEvent event) {
    setState(() {
      _pointers[event.pointer] = event.localPosition;
      if (_pointers.length == 1 && !_transformedThisGesture) {
        _drawPointer = event.pointer;
        _drawStart = event.localPosition;
        _cursor = _toNormalized(event.localPosition);
      } else if (_pointers.length == 2) {
        _cancelActiveStroke();
        _transformedThisGesture = true;
        _setPinchBaseline();
      }
    });
  }

  void _pointerMove(PointerMoveEvent event) {
    if (!_pointers.containsKey(event.pointer)) return;
    setState(() {
      _pointers[event.pointer] = event.localPosition;
      if (_pointers.length >= 2) {
        _transformedThisGesture = true;
        _updateTransform();
        return;
      }
      if (_transformedThisGesture || _drawPointer != event.pointer) return;
      _activeStroke ??= () {
        _beginStroke(_drawStart ?? event.localPosition);
        return _activeStroke;
      }();
      _appendStroke(event.localPosition);
    });
  }

  void _pointerUp(PointerEvent event) {
    setState(() {
      final wasDrawing = _drawPointer == event.pointer;
      if (wasDrawing && !_transformedThisGesture && _activeStroke == null) {
        _beginStroke(_drawStart ?? event.localPosition);
      }
      _pointers.remove(event.pointer);
      _activeStroke = null;
      _drawPointer = null;
      _drawStart = null;
      if (_pointers.length < 2) _lastPinchDistance = 0;
      if (_pointers.isEmpty) {
        _transformedThisGesture = false;
        _cursor = null;
      }
    });
  }

  void _setPinchBaseline() {
    final points = _pointers.values.take(2).toList(growable: false);
    if (points.length < 2) return;
    _lastPinchDistance = (points[0] - points[1]).distance;
    _lastPinchCenter = Offset(
      (points[0].dx + points[1].dx) / 2,
      (points[0].dy + points[1].dy) / 2,
    );
  }

  void _updateTransform() {
    final points = _pointers.values.take(2).toList(growable: false);
    if (points.length < 2) return;
    final distance = (points[0] - points[1]).distance;
    final center = Offset(
      (points[0].dx + points[1].dx) / 2,
      (points[0].dy + points[1].dy) / 2,
    );
    if (_lastPinchDistance <= 0) {
      _lastPinchDistance = distance;
      _lastPinchCenter = center;
      return;
    }
    final nextScale =
        (_scale * distance / _lastPinchDistance).clamp(1.0, 8.0).toDouble();
    final sceneAtCenter = (_lastPinchCenter - _offset) / _scale;
    final nextOffset = center - sceneAtCenter * nextScale;
    _scale = nextScale;
    _offset = _clampOffset(nextOffset, nextScale);
    _lastPinchDistance = distance;
    _lastPinchCenter = center;
  }

  Offset _clampOffset(Offset value, double nextScale) => Offset(
        value.dx.clamp(_canvasSize.width * (1 - nextScale), 0.0).toDouble(),
        value.dy.clamp(_canvasSize.height * (1 - nextScale), 0.0).toDouble(),
      );

  void _undo() {
    if (_strokes.isEmpty) return;
    setState(() => _redo.add(_strokes.removeLast()));
  }

  void _redoStroke() {
    if (_redo.isEmpty) return;
    setState(() => _strokes.add(_redo.removeLast()));
  }

  void _clear() {
    if (_strokes.isEmpty && !_inverted) return;
    setState(() {
      _strokes.clear();
      _redo.clear();
      _inverted = false;
    });
  }

  void _resetView() => setState(() {
        _scale = 1;
        _offset = Offset.zero;
      });

  void _finish() {
    Navigator.pop(
      context,
      InpaintMaskEditResult(
        strokes: copyInpaintStrokes(_strokes),
        inverted: _inverted,
        brush: _brush,
        imageOpacity: _imageOpacity,
        maskOpacity: _maskOpacity,
        brushShape: _brushShape,
      ),
    );
  }

  Widget _canvas() => LayoutBuilder(
        builder: (context, constraints) {
          final fitted = applyBoxFit(
            BoxFit.contain,
            Size(
              math.max(1, widget.image.width).toDouble(),
              math.max(1, widget.image.height).toDouble(),
            ),
            constraints.biggest,
          ).destination;
          _canvasSize = fitted;
          return Center(
            child: SizedBox(
              key: const ValueKey('inpaint-mask-canvas'),
              width: fitted.width,
              height: fitted.height,
              child: ClipRect(
                child: Listener(
                  behavior: HitTestBehavior.opaque,
                  onPointerDown: _pointerDown,
                  onPointerMove: _pointerMove,
                  onPointerUp: _pointerUp,
                  onPointerCancel: _pointerUp,
                  child: Transform(
                    alignment: Alignment.topLeft,
                    transform: Matrix4.identity()
                      ..translate(_offset.dx, _offset.dy)
                      ..scale(_scale),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        ColoredBox(
                          color: Colors.black,
                          child: Opacity(
                            opacity: _imageOpacity,
                            child: Image(
                              image: widget.imageProvider ??
                                  FileImage(File(widget.image.filePath)),
                              fit: BoxFit.fill,
                              filterQuality: FilterQuality.medium,
                              gaplessPlayback: true,
                            ),
                          ),
                        ),
                        IgnorePointer(
                          child: CustomPaint(
                            painter: InpaintMaskPainter(
                              strokes: _strokes,
                              inverted: _inverted,
                              opacity: _maskOpacity,
                              cursor: _cursor,
                              brushCells: _brush.round(),
                              maskGridFraction:
                                  inpaintMaskGridSize / _sourceShortest,
                              eraseCursor: _erase,
                              brushShape: _brushShape,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      );

  Widget _modeBar() => Row(
        children: [
          Expanded(
            child: SegmentedButton<bool>(
              key: const ValueKey('inpaint-mask-mode'),
              showSelectedIcon: false,
              segments: [
                ButtonSegment(
                  value: false,
                  icon: const Icon(Icons.brush_outlined),
                  label: Text(t('tools.maskDraw')),
                ),
                ButtonSegment(
                  value: true,
                  icon: const Icon(Icons.auto_fix_off_outlined),
                  label: Text(t('tools.maskErase')),
                ),
              ],
              selected: {_erase},
              onSelectionChanged: (value) =>
                  setState(() => _erase = value.first),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.outlined(
            tooltip: t('tools.undoStroke'),
            onPressed: _strokes.isEmpty ? null : _undo,
            icon: const Icon(Icons.undo),
          ),
          const SizedBox(width: 8),
          IconButton.outlined(
            tooltip: t('tools.redoStroke'),
            onPressed: _redo.isEmpty ? null : _redoStroke,
            icon: const Icon(Icons.redo),
          ),
          const SizedBox(width: 8),
          IconButton.outlined(
            tooltip: t('tools.resetZoom'),
            onPressed:
                _scale == 1 && _offset == Offset.zero ? null : _resetView,
            icon: const Icon(Icons.fit_screen),
          ),
        ],
      );

  Widget _shapeBar() => LayoutBuilder(
        builder: (context, constraints) {
          final selector = SegmentedButton<InpaintBrushShape>(
            key: const ValueKey('inpaint-brush-shape'),
            showSelectedIcon: false,
            segments: [
              ButtonSegment(
                value: InpaintBrushShape.round,
                icon: const Icon(Icons.circle_outlined),
                label: Text(t('tools.roundBrush')),
              ),
              ButtonSegment(
                value: InpaintBrushShape.square,
                icon: const Icon(Icons.crop_square),
                label: Text(t('tools.squareBrush')),
              ),
            ],
            selected: {_brushShape},
            onSelectionChanged: (value) => _setBrushShape(value.first),
          );
          final label = Text(
            t('tools.brushShape'),
            style: Theme.of(context).textTheme.labelLarge,
          );
          if (constraints.maxWidth < 420) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                label,
                const SizedBox(height: 6),
                selector,
              ],
            );
          }
          return Row(
            children: [
              label,
              const SizedBox(width: 12),
              Expanded(child: selector),
            ],
          );
        },
      );

  Widget _slider({
    required String label,
    required double value,
    required double min,
    required double max,
    required ValueChanged<double> onChanged,
    int? divisions,
    String? display,
  }) =>
      Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label),
              Text(display ?? '${(value * 100).round()}%')
            ],
          ),
          Slider(
            value: value,
            min: min,
            max: max,
            divisions: divisions,
            onChanged: onChanged,
          ),
        ],
      );

  Widget _controls(bool landscape) {
    final brushSlider = KeyedSubtree(
      key: const ValueKey('inpaint-brush-size'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(child: Text(t('tools.brushSize'))),
              SizedBox(
                width: 78,
                height: 38,
                child: TextField(
                  key: const ValueKey('inpaint-brush-size-input'),
                  controller: _brushController,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  textAlign: TextAlign.end,
                  decoration: InputDecoration(
                    isDense: true,
                    suffixText: t('tools.gridUnit'),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 9,
                    ),
                  ),
                  onSubmitted: (_) => _commitBrushText(),
                  onTapOutside: (_) {
                    _commitBrushText();
                    FocusManager.instance.primaryFocus?.unfocus();
                  },
                ),
              ),
            ],
          ),
          Slider(
            value: _brush
                .clamp(inpaintBrushSliderMin, inpaintBrushSliderMax)
                .toDouble(),
            min: inpaintBrushSliderMin.toDouble(),
            max: inpaintBrushSliderMax.toDouble(),
            divisions: inpaintBrushSliderMax - inpaintBrushSliderMin,
            onChanged: _setBrush,
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              t('tools.precisionMaskHint'),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ),
        ],
      ),
    );
    final opacitySliders = [
      _slider(
        label: t('tools.imageOpacity'),
        value: _imageOpacity,
        min: 0.15,
        max: 1,
        divisions: 17,
        onChanged: (value) => setState(() => _imageOpacity = value),
      ),
      _slider(
        label: t('tools.maskOpacity'),
        value: _maskOpacity,
        min: 0.15,
        max: 1,
        divisions: 17,
        onChanged: (value) => setState(() => _maskOpacity = value),
      ),
    ];
    return Material(
      elevation: landscape ? 0 : 8,
      color: Theme.of(context).colorScheme.surface,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _modeBar(),
              const SizedBox(height: 8),
              _shapeBar(),
              const SizedBox(height: 8),
              // Brush size is a primary drawing control. Keeping it outside
              // the adjustments expansion avoids making it look as if the
              // option disappeared on portrait phones.
              brushSlider,
              if (landscape)
                ...opacitySliders
              else
                ExpansionTile(
                  key: const ValueKey('inpaint-mask-adjustments'),
                  tilePadding: EdgeInsets.zero,
                  childrenPadding: EdgeInsets.zero,
                  title: Text(t('tools.maskAdjustments')),
                  subtitle: Text(
                    mobileUiFormatFor(
                        widget.language, 'tools.maskStrokeCount', {
                      'count': _strokes.length,
                    }),
                  ),
                  children: opacitySliders,
                ),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => setState(() => _inverted = !_inverted),
                      icon: const Icon(Icons.invert_colors),
                      label: Text(
                        _inverted
                            ? t('tools.maskInverted')
                            : t('tools.invertMask'),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _strokes.isEmpty && !_inverted ? null : _clear,
                      icon: const Icon(Icons.delete_outline),
                      label: Text(t('tools.clearMask')),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final landscape = size.width > size.height;
    Widget canvasRegion() => ColoredBox(
          color: const Color(0xFF101120),
          child: Stack(
            children: [
              Positioned.fill(child: _canvas()),
              Positioned(
                left: 12,
                top: 12,
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: Theme.of(context)
                          .colorScheme
                          .surface
                          .withOpacity(0.88),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      child: Text(t('tools.maskGestureHint')),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
    return Scaffold(
      appBar: AppBar(
        leading: TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(t('common.cancel')),
        ),
        leadingWidth: 80,
        title: Text(t('tools.maskEditorTitle')),
        actions: [
          TextButton.icon(
            key: const ValueKey('inpaint-mask-done'),
            onPressed: _finish,
            icon: const Icon(Icons.check),
            label: Text(t('tools.maskDone')),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: landscape
          ? Row(
              children: [
                Expanded(child: canvasRegion()),
                SizedBox(
                  width: math.min(400, size.width * 0.5),
                  child: SingleChildScrollView(child: _controls(true)),
                ),
              ],
            )
          : Column(
              children: [
                Expanded(child: canvasRegion()),
                ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: size.height * 0.48),
                  child: SingleChildScrollView(
                    key: const ValueKey('inpaint-mask-controls-scroll'),
                    child: _controls(false),
                  ),
                ),
              ],
            ),
    );
  }
}

class InpaintMaskPainter extends CustomPainter {
  final List<InpaintStroke> strokes;
  final bool inverted;
  final double opacity;
  final Offset? cursor;
  final int brushCells;
  final double maskGridFraction;
  final bool eraseCursor;
  final InpaintBrushShape brushShape;

  InpaintMaskPainter({
    required this.strokes,
    required this.inverted,
    required this.opacity,
    this.cursor,
    this.brushCells = 0,
    this.maskGridFraction = 0,
    this.eraseCursor = false,
    this.brushShape = InpaintBrushShape.round,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final selected = Colors.white.withOpacity(opacity);
    // Paint the selection on an isolated transparent layer. Deselecting
    // strokes use BlendMode.clear, so the eraser really removes the visible
    // mask instead of covering it with a dark brush-shaped patch.
    canvas.saveLayer(Offset.zero & size, Paint());
    if (inverted) {
      canvas.drawRect(Offset.zero & size, Paint()..color = selected);
    }
    for (final stroke in strokes) {
      if (stroke.points.isEmpty) continue;
      final rawSelected = !stroke.erase;
      final visiblySelected = inverted ? !rawSelected : rawSelected;
      paintInpaintStroke(
        canvas,
        size,
        stroke,
        color: visiblySelected ? selected : Colors.transparent,
        blendMode: visiblySelected ? BlendMode.srcOver : BlendMode.clear,
        gridSize: maskGridFraction * size.shortestSide,
      );
    }
    canvas.restore();
    final pointer = cursor;
    if (pointer != null && brushCells > 0 && maskGridFraction > 0) {
      final center = Offset(pointer.dx * size.width, pointer.dy * size.height);
      final footprintCells = brushShape == InpaintBrushShape.round
          ? 2 * (brushCells / 2).round() + 1
          : brushCells;
      final cursorSize = footprintCells * maskGridFraction * size.shortestSide;
      final paint = Paint()
        ..color = eraseCursor ? Colors.orangeAccent : Colors.cyanAccent
        ..style = PaintingStyle.stroke
        ..strokeWidth = math.max(1.5, 2 / math.max(1, size.shortestSide / 300));
      if (brushShape == InpaintBrushShape.square) {
        canvas.drawRect(
          Rect.fromCenter(
            center: center,
            width: cursorSize,
            height: cursorSize,
          ),
          paint,
        );
      } else {
        canvas.drawCircle(center, cursorSize / 2, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant InpaintMaskPainter oldDelegate) => true;
}

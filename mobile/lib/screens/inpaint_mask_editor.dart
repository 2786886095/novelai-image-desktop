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
  final Color maskColor;
  final InpaintBrushShape brushShape;

  const InpaintMaskEditResult({
    required this.strokes,
    required this.inverted,
    required this.brush,
    required this.imageOpacity,
    required this.maskOpacity,
    required this.maskColor,
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
  final Color initialMaskColor;
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
    this.initialMaskColor = Colors.white,
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
  late final _InpaintMaskRasterPreview _preview;
  final _cursorController = _InpaintCursorController();
  late bool _inverted;
  late double _brush;
  late double _imageOpacity;
  late double _maskOpacity;
  late Color _maskColor;
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
  bool _erase = false;
  bool _showMask = true;

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
    _maskColor = widget.initialMaskColor;
    _preview = _InpaintMaskRasterPreview(
      InpaintMaskRaster(
        sourceWidth: math.max(1, widget.image.width),
        sourceHeight: math.max(1, widget.image.height),
      ),
    )..rebuild(_strokes, inverted: _inverted, notify: false);
    _syncCursorStyle();
  }

  double get _sourceShortest =>
      math.max(1, math.min(widget.image.width, widget.image.height)).toDouble();

  Size get _sourceSize => Size(
        math.max(1, widget.image.width).toDouble(),
        math.max(1, widget.image.height).toDouble(),
      );

  @override
  void dispose() {
    _brushController.dispose();
    _preview.dispose();
    _cursorController.dispose();
    super.dispose();
  }

  void _syncCursorStyle() => _cursorController.updateStyle(
        brushCells: _brush.round(),
        maskGridFraction: inpaintMaskGridSize / _sourceShortest,
        erase: _erase,
        shape: _brushShape,
      );

  void _refreshPreview({bool notify = true}) {
    _preview.rebuild(
      _strokes,
      inverted: _inverted,
      notify: notify,
    );
  }

  void _setBrush(double value) {
    final next = normalizeInpaintBrushCells(value, _brushShape).toDouble();
    setState(() => _brush = next);
    _syncCursorStyle();
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
    _cursorController.updatePoint(normalized);
    _preview.applyStroke(_strokes.last);
  }

  bool _appendStroke(Offset localPoint) {
    final index = _activeStroke;
    if (index == null || index >= _strokes.length) return false;
    final normalized = _toNormalized(localPoint);
    if (normalized == null) return false;
    _cursorController.updatePoint(normalized);
    final stroke = _strokes[index];
    final previous = stroke.points.last;
    if (inpaintPointsShareGridCell(previous, normalized, _sourceSize)) {
      return false;
    }
    stroke.points.add(normalized);
    _preview.applySegment(stroke, previous, normalized);
    return true;
  }

  void _cancelActiveStroke() {
    final index = _activeStroke;
    if (index != null && index < _strokes.length) _strokes.removeAt(index);
    _refreshPreview();
    _cursorController.updatePoint(null);
    _activeStroke = null;
    _drawPointer = null;
    _drawStart = null;
  }

  void _pointerDown(PointerDownEvent event) {
    _pointers[event.pointer] = event.localPosition;
    if (_pointers.length == 1 && !_transformedThisGesture) {
      _drawPointer = event.pointer;
      _drawStart = event.localPosition;
      _cursorController.updatePoint(_toNormalized(event.localPosition));
    } else if (_pointers.length == 2) {
      _cancelActiveStroke();
      _transformedThisGesture = true;
      _setPinchBaseline();
      setState(() {});
    }
  }

  void _pointerMove(PointerMoveEvent event) {
    if (!_pointers.containsKey(event.pointer)) return;
    _pointers[event.pointer] = event.localPosition;
    if (_pointers.length >= 2) {
      _transformedThisGesture = true;
      setState(_updateTransform);
      return;
    }
    if (_transformedThisGesture || _drawPointer != event.pointer) return;
    if (_activeStroke == null) {
      _beginStroke(_drawStart ?? event.localPosition);
    }
    _appendStroke(event.localPosition);
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
        _cursorController.updatePoint(null);
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
    _refreshPreview();
  }

  void _redoStroke() {
    if (_redo.isEmpty) return;
    setState(() => _strokes.add(_redo.removeLast()));
    _refreshPreview();
  }

  void _clear() {
    if (_strokes.isEmpty && !_inverted) return;
    setState(() {
      _strokes.clear();
      _redo.clear();
      _inverted = false;
    });
    _refreshPreview();
  }

  void _toggleInverted() {
    setState(() => _inverted = !_inverted);
    _refreshPreview();
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
        maskColor: _maskColor,
        brushShape: _brushShape,
      ),
    );
  }

  Widget _canvas() => LayoutBuilder(
        builder: (context, constraints) {
          final fitted = applyBoxFit(
            BoxFit.contain,
            _sourceSize,
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
                        const ColoredBox(color: Colors.black),
                        RepaintBoundary(
                          child: Opacity(
                            opacity: _imageOpacity,
                            child: Image(
                              key: const ValueKey('inpaint-mask-source-image'),
                              image: widget.imageProvider ??
                                  FileImage(File(widget.image.filePath)),
                              fit: BoxFit.fill,
                              filterQuality: FilterQuality.medium,
                              gaplessPlayback: true,
                            ),
                          ),
                        ),
                        if (_showMask)
                          IgnorePointer(
                            child: Opacity(
                              opacity: _maskOpacity,
                              child: RepaintBoundary(
                                key: const ValueKey(
                                  'inpaint-mask-preview-boundary',
                                ),
                                child: CustomPaint(
                                  painter: _InpaintMaskPreviewPainter(
                                    _preview,
                                    _maskColor,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        IgnorePointer(
                          child: RepaintBoundary(
                            child: CustomPaint(
                              painter: _InpaintCursorPainter(_cursorController),
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
              onSelectionChanged: (value) {
                setState(() => _erase = value.first);
                _syncCursorStyle();
              },
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
            children: [
              Expanded(child: Text(label)),
              const SizedBox(width: 8),
              Text(display ?? '${(value * 100).round()}%'),
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
    final imageOpacitySlider = _slider(
      label: t('tools.imageOpacity'),
      value: _imageOpacity,
      min: 0.15,
      max: 1,
      divisions: 17,
      onChanged: (value) => setState(() => _imageOpacity = value),
    );
    final maskOpacitySlider = KeyedSubtree(
      key: const ValueKey('inpaint-mask-opacity'),
      child: _slider(
        label: t('tools.maskOpacity'),
        value: _maskOpacity,
        min: 0.15,
        max: 1,
        divisions: 17,
        onChanged: (value) => setState(() => _maskOpacity = value),
      ),
    );
    const palette = <Color>[
      Colors.white,
      Color(0xFF7C3AED),
      Color(0xFF06B6D4),
      Color(0xFF22C55E),
      Color(0xFFF59E0B),
      Color(0xFFEF4444),
      Color(0xFFEC4899),
    ];
    final maskColorPicker = Column(
      key: const ValueKey('inpaint-mask-color'),
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(t('tools.maskColor')),
        const SizedBox(height: 7),
        Wrap(
          spacing: 9,
          runSpacing: 8,
          children: palette.map((color) {
            final selected = color.value == _maskColor.value;
            return Semantics(
              button: true,
              selected: selected,
              label:
                  '${t('tools.maskColor')} #${color.value.toRadixString(16).substring(2).toUpperCase()}',
              child: InkWell(
                key: ValueKey(
                  'inpaint-mask-color-${color.value.toRadixString(16)}',
                ),
                onTap: () => setState(() => _maskColor = color),
                borderRadius: BorderRadius.circular(11),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 120),
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(11),
                    border: Border.all(
                      color: selected
                          ? Theme.of(context).colorScheme.primary
                          : Theme.of(context).colorScheme.outlineVariant,
                      width: selected ? 3 : 1,
                    ),
                    boxShadow: selected
                        ? [
                            BoxShadow(
                                color: Theme.of(context)
                                    .colorScheme
                                    .primary
                                    .withOpacity(.24),
                                blurRadius: 8)
                          ]
                        : null,
                  ),
                  child: selected
                      ? Icon(
                          Icons.check,
                          size: 20,
                          color: color.computeLuminance() > .55
                              ? Colors.black
                              : Colors.white,
                        )
                      : null,
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
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
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  t('tools.maskGestureHint'),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
              ),
              const SizedBox(height: 8),
              _shapeBar(),
              const SizedBox(height: 8),
              // Brush size is a primary drawing control. Keeping it outside
              // the adjustments expansion avoids making it look as if the
              // option disappeared on portrait phones.
              brushSlider,
              maskOpacitySlider,
              maskColorPicker,
              const SizedBox(height: 8),
              if (landscape)
                imageOpacitySlider
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
                  children: [imageOpacitySlider],
                ),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _toggleInverted,
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
          child: _canvas(),
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
          IconButton(
            key: const ValueKey('inpaint-mask-visibility-toggle'),
            tooltip: t(_showMask ? 'tools.hideMask' : 'tools.showMask'),
            onPressed: () => setState(() => _showMask = !_showMask),
            icon: Icon(
              _showMask
                  ? Icons.visibility_outlined
                  : Icons.visibility_off_outlined,
            ),
          ),
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

/// One compact current-state raster powers the full-screen preview.
///
/// The previous retained-picture implementation still had to draw every old
/// picture after a few strokes. This representation updates only affected 8 x
/// 8 source cells and paints one merged path per frame, so cost stays bounded
/// by image grid size rather than by how much the user has drawn.
class _InpaintMaskRasterPreview extends ChangeNotifier {
  final InpaintMaskRaster raster;
  bool inverted = false;

  _InpaintMaskRasterPreview(this.raster);

  void rebuild(
    List<InpaintStroke> strokes, {
    required bool inverted,
    bool notify = true,
  }) {
    raster.rebuild(strokes);
    this.inverted = inverted;
    if (notify) notifyListeners();
  }

  void applyStroke(InpaintStroke stroke) {
    if (raster.applyStroke(stroke)) notifyListeners();
  }

  void applySegment(InpaintStroke stroke, Offset from, Offset to) {
    if (raster.applySegment(stroke, from, to)) notifyListeners();
  }
}

class _InpaintCursorController extends ChangeNotifier {
  Offset? point;
  int brushCells = 0;
  double maskGridFraction = 0;
  bool erase = false;
  InpaintBrushShape shape = InpaintBrushShape.round;

  void updatePoint(Offset? value) {
    if (point == value) return;
    point = value;
    notifyListeners();
  }

  void updateStyle({
    required int brushCells,
    required double maskGridFraction,
    required bool erase,
    required InpaintBrushShape shape,
  }) {
    if (this.brushCells == brushCells &&
        this.maskGridFraction == maskGridFraction &&
        this.erase == erase &&
        this.shape == shape) {
      return;
    }
    this.brushCells = brushCells;
    this.maskGridFraction = maskGridFraction;
    this.erase = erase;
    this.shape = shape;
    if (point != null) notifyListeners();
  }
}

class _InpaintMaskPreviewPainter extends CustomPainter {
  final _InpaintMaskRasterPreview preview;
  final Color color;

  _InpaintMaskPreviewPainter(this.preview, this.color)
      : super(repaint: preview);

  @override
  void paint(Canvas canvas, Size size) {
    preview.raster.paintSelection(
      canvas,
      size,
      inverted: preview.inverted,
      color: color,
    );
  }

  @override
  bool shouldRepaint(covariant _InpaintMaskPreviewPainter oldDelegate) =>
      oldDelegate.preview != preview || oldDelegate.color != color;
}

class _InpaintCursorPainter extends CustomPainter {
  final _InpaintCursorController cursor;

  _InpaintCursorPainter(this.cursor) : super(repaint: cursor);

  @override
  void paint(Canvas canvas, Size size) {
    final point = cursor.point;
    if (point == null ||
        cursor.brushCells <= 0 ||
        cursor.maskGridFraction <= 0) {
      return;
    }
    final center = Offset(point.dx * size.width, point.dy * size.height);
    final footprintCells = cursor.shape == InpaintBrushShape.round
        ? 2 * (cursor.brushCells / 2).round() + 1
        : cursor.brushCells;
    final cursorSize =
        footprintCells * cursor.maskGridFraction * size.shortestSide;
    final paint = Paint()
      ..color = cursor.erase ? Colors.orangeAccent : Colors.cyanAccent
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(
        1.5,
        2 / math.max(1, size.shortestSide / 300),
      );
    if (cursor.shape == InpaintBrushShape.square) {
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

  @override
  bool shouldRepaint(covariant _InpaintCursorPainter oldDelegate) =>
      oldDelegate.cursor != cursor;
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

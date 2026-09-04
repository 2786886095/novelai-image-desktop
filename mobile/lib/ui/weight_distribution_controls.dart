import 'package:flutter/material.dart';

import '../artist/weight_distribution.dart';

class _DeferredNumberField extends StatefulWidget {
  final double value;
  final double min;
  final double max;
  final ValueChanged<double> onCommit;

  const _DeferredNumberField({
    required this.value,
    required this.min,
    required this.max,
    required this.onCommit,
  });

  @override
  State<_DeferredNumberField> createState() => _DeferredNumberFieldState();
}

class _DeferredNumberFieldState extends State<_DeferredNumberField> {
  late final TextEditingController _controller;
  late final FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.value.toStringAsFixed(1));
    _focusNode = FocusNode()..addListener(_handleFocus);
  }

  @override
  void didUpdateWidget(covariant _DeferredNumberField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_focusNode.hasFocus && widget.value != oldWidget.value) {
      _controller.text = widget.value.toStringAsFixed(1);
    }
  }

  void _handleFocus() {
    if (!_focusNode.hasFocus) _commit();
  }

  void _commit() {
    final parsed = double.tryParse(_controller.text.trim());
    final next =
        (parsed ?? widget.value).clamp(widget.min, widget.max).toDouble();
    final rounded = (next * 10).round() / 10;
    _controller.text = rounded.toStringAsFixed(1);
    widget.onCommit(rounded);
  }

  @override
  void dispose() {
    _focusNode
      ..removeListener(_handleFocus)
      ..dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextFormField(
        controller: _controller,
        focusNode: _focusNode,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: const InputDecoration(
          isDense: true,
          border: OutlineInputBorder(),
        ),
        onFieldSubmitted: (_) => _focusNode.unfocus(),
        onTapOutside: (_) => _focusNode.unfocus(),
      );
}

class WeightDistributionControls extends StatelessWidget {
  final WeightControlMode mode;
  final double lower;
  final double upper;
  final WeightDistributionConfig config;
  final ValueChanged<WeightControlMode> onModeChanged;
  final ValueChanged<WeightDistributionConfig> onChanged;

  const WeightDistributionControls({
    super.key,
    required this.mode,
    required this.lower,
    required this.upper,
    required this.config,
    required this.onModeChanged,
    required this.onChanged,
  });

  Widget _label(BuildContext context, String title, String help) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(title),
          const SizedBox(width: 4),
          Tooltip(
            message: help,
            triggerMode: TooltipTriggerMode.tap,
            child: Icon(Icons.help_outline,
                size: 17,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
        ],
      );

  Widget _control(
    BuildContext context, {
    required String title,
    required String help,
    required double value,
    required double min,
    required double max,
    required ValueChanged<double> onChanged,
  }) {
    final safe = value.clamp(min, max).toDouble();
    return LayoutBuilder(builder: (context, constraints) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: _label(context, title, help)),
              SizedBox(
                width: 82,
                child: _DeferredNumberField(
                  value: safe,
                  min: min,
                  max: max,
                  onCommit: onChanged,
                ),
              ),
            ],
          ),
          Slider(
            value: safe,
            min: min,
            max: max,
            divisions: ((max - min) * 10).round().clamp(1, 100),
            onChanged: onChanged,
          ),
        ],
      );
    });
  }

  Widget _preview(BuildContext context, WeightDistributionConfig normalized) {
    final bins = buildWeightDistributionPreview(lower, upper, normalized);
    return Semantics(
      label: '权重概率预览，柱越高表示附近权重越容易出现',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerLowest,
          border:
              Border.all(color: Theme.of(context).colorScheme.outlineVariant),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _label(context, '权重概率预览', '按当前参数精确计算，不使用随机模拟。柱越高，附近权重越容易出现。'),
            const SizedBox(height: 8),
            SizedBox(
              height: 152,
              child: CustomPaint(
                painter: _WeightDistributionPreviewPainter(
                  bins: bins,
                  lower: lower,
                  upper: upper,
                  mode: normalized.mode,
                  color: Theme.of(context).colorScheme.primary,
                  axisColor: Theme.of(context).colorScheme.outlineVariant,
                  labelColor: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                size: Size.infinite,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final normalized = normalizeWeightDistribution(config, lower, upper);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('权重控制', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<WeightControlMode>(
                segments: const [
                  ButtonSegment(
                      value: WeightControlMode.novice, label: Text('新手版')),
                  ButtonSegment(
                      value: WeightControlMode.advanced, label: Text('进阶版')),
                ],
                selected: {mode},
                onSelectionChanged: (value) => onModeChanged(value.first),
              ),
            ),
            if (mode == WeightControlMode.advanced) ...[
              const SizedBox(height: 12),
              _control(
                context,
                title: '众数',
                help: '权重最集中、最常出现的位置。',
                value: normalized.mode,
                min: lower,
                max: upper,
                onChanged: (value) => onChanged(WeightDistributionConfig(
                  mode: value,
                  leftDispersion: normalized.leftDispersion,
                  rightDispersion: normalized.rightDispersion,
                  softBalance: normalized.softBalance,
                )),
              ),
              _control(
                context,
                title: '左侧离散',
                help: '控制众数左侧权重的分散程度；0 更集中，1 更分散。',
                value: normalized.leftDispersion,
                min: 0,
                max: 1,
                onChanged: (value) => onChanged(WeightDistributionConfig(
                  mode: normalized.mode,
                  leftDispersion: value,
                  rightDispersion: normalized.rightDispersion,
                  softBalance: normalized.softBalance,
                )),
              ),
              _control(
                context,
                title: '右侧离散',
                help: '控制众数右侧权重的分散程度；0 更集中，1 更分散。',
                value: normalized.rightDispersion,
                min: 0,
                max: 1,
                onChanged: (value) => onChanged(WeightDistributionConfig(
                  mode: normalized.mode,
                  leftDispersion: normalized.leftDispersion,
                  rightDispersion: value,
                  softBalance: normalized.softBalance,
                )),
              ),
              _control(
                context,
                title: '软平衡强度',
                help: '整串同向平移，使平均权重靠近众数。0 不修正，1 尽量对齐；触及上下界时除外。',
                value: normalized.softBalance,
                min: 0,
                max: 1,
                onChanged: (value) => onChanged(WeightDistributionConfig(
                  mode: normalized.mode,
                  leftDispersion: normalized.leftDispersion,
                  rightDispersion: normalized.rightDispersion,
                  softBalance: value,
                )),
              ),
              const SizedBox(height: 4),
              _preview(context, normalized),
            ],
          ],
        ),
      ),
    );
  }
}

class _WeightDistributionPreviewPainter extends CustomPainter {
  final List<double> bins;
  final double lower;
  final double upper;
  final double mode;
  final Color color;
  final Color axisColor;
  final Color labelColor;

  const _WeightDistributionPreviewPainter({
    required this.bins,
    required this.lower,
    required this.upper,
    required this.mode,
    required this.color,
    required this.axisColor,
    required this.labelColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    const chartLeft = 42.0;
    const chartRightPadding = 8.0;
    const chartTop = 8.0;
    const chartBottomPadding = 34.0;
    final chartRight = size.width - chartRightPadding;
    final chartBottom = size.height - chartBottomPadding;
    final chartWidth = chartRight - chartLeft;
    final chartHeight = chartBottom - chartTop;
    final highest =
        bins.fold<double>(0, (value, item) => item > value ? item : value);
    final barWidth = chartWidth / bins.length;
    final barPaint = Paint()..color = color.withOpacity(.52);
    _drawAxes(canvas, chartLeft, chartRight, chartTop, chartBottom);
    final curvePoints = <Offset>[];
    for (var index = 0; index < bins.length; index++) {
      final height = highest <= 0
          ? 1.0
          : (bins[index] / highest * chartHeight).clamp(1.0, chartHeight);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(chartLeft + index * barWidth + 1, chartBottom - height,
              (barWidth - 2).clamp(1, barWidth), height),
          const Radius.circular(2),
        ),
        barPaint,
      );
      curvePoints.add(Offset(
        chartLeft + (index + .5) * barWidth,
        chartBottom - (highest <= 0 ? 0 : bins[index] / highest * chartHeight),
      ));
    }
    _drawCurve(canvas, curvePoints);
    final span = upper - lower;
    final modeX = span <= 0
        ? chartLeft + chartWidth / 2
        : chartLeft + ((mode - lower) / span).clamp(0, 1) * chartWidth;
    final modePaint = Paint()
      ..color = color
      ..strokeWidth = 2;
    canvas.drawLine(
        Offset(modeX, chartTop - 1), Offset(modeX, chartBottom + 3), modePaint);

    final style =
        TextStyle(color: labelColor, fontSize: 10, fontWeight: FontWeight.w600);
    void label(String text, double x, TextAlign align) {
      final painter = TextPainter(
          text: TextSpan(text: text, style: style),
          textDirection: TextDirection.ltr,
          textAlign: align)
        ..layout();
      final dx = align == TextAlign.left
          ? x
          : align == TextAlign.right
              ? x - painter.width
              : x - painter.width / 2;
      painter.paint(canvas,
          Offset(dx.clamp(0, size.width - painter.width), chartBottom + 6));
    }

    label(lower.toStringAsFixed(1), chartLeft, TextAlign.left);
    label(mode.toStringAsFixed(1), modeX, TextAlign.center);
    label(upper.toStringAsFixed(1), chartRight, TextAlign.right);

    final axisTitle = TextPainter(
      text: TextSpan(text: '权重', style: style),
      textDirection: TextDirection.ltr,
    )..layout();
    axisTitle.paint(
        canvas,
        Offset(
            chartLeft + (chartWidth - axisTitle.width) / 2, size.height - 12));
  }

  void _drawAxes(
      Canvas canvas, double left, double right, double top, double bottom) {
    final gridPaint = Paint()
      ..color = axisColor.withOpacity(.7)
      ..strokeWidth = 1;
    final axisPaint = Paint()
      ..color = labelColor.withOpacity(.7)
      ..strokeWidth = 1.2;
    final style = TextStyle(color: labelColor, fontSize: 9);
    for (final ratio in const [0.0, .25, .5, .75, 1.0]) {
      final y = bottom - ratio * (bottom - top);
      canvas.drawLine(Offset(left, y), Offset(right, y), gridPaint);
      final label = TextPainter(
        text: TextSpan(text: ratio.toStringAsFixed(2), style: style),
        textDirection: TextDirection.ltr,
      )..layout();
      label.paint(canvas, Offset(left - label.width - 6, y - label.height / 2));
    }
    canvas.drawLine(Offset(left, top), Offset(left, bottom), axisPaint);
    canvas.drawLine(Offset(left, bottom), Offset(right, bottom), axisPaint);
  }

  void _drawCurve(Canvas canvas, List<Offset> points) {
    if (points.isEmpty) return;
    final path = Path()..moveTo(points.first.dx, points.first.dy);
    for (var index = 1; index < points.length; index++) {
      final previous = points[index - 1];
      final current = points[index];
      final middleX = (previous.dx + current.dx) / 2;
      path.cubicTo(
          middleX, previous.dy, middleX, current.dy, current.dx, current.dy);
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..strokeWidth = 2.2
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke,
    );
  }

  @override
  bool shouldRepaint(covariant _WeightDistributionPreviewPainter oldDelegate) =>
      oldDelegate.bins != bins ||
      oldDelegate.lower != lower ||
      oldDelegate.upper != upper ||
      oldDelegate.mode != mode ||
      oldDelegate.color != color ||
      oldDelegate.axisColor != axisColor;
}

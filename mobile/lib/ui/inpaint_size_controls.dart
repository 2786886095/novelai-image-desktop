import 'package:flutter/material.dart';
import '../inpaint/inpaint_size.dart';
import 'resolution_picker.dart';

class InpaintSizeControls extends StatefulWidget {
  final String mode, language;
  final InpaintSize custom;
  final InpaintSize? source;
  final ValueChanged<String> onMode;
  final ValueChanged<InpaintSize> onSize;
  const InpaintSizeControls({super.key, required this.mode, required this.language, required this.custom,
    required this.source, required this.onMode, required this.onSize});
  @override
  State<InpaintSizeControls> createState() => _InpaintSizeControlsState();
}

class _InpaintSizeControlsState extends State<InpaintSizeControls> {
  late final TextEditingController width = TextEditingController(text: '${widget.custom.width}');
  late final TextEditingController height = TextEditingController(text: '${widget.custom.height}');
  @override
  void didUpdateWidget(covariant InpaintSizeControls old) {
    super.didUpdateWidget(old);
    for (final entry in [(width, widget.custom.width), (height, widget.custom.height)]) {
      if ((int.tryParse(entry.$1.text) ?? 0) != entry.$2) entry.$1.text = entry.$2 == 0 ? '' : '${entry.$2}';
    }
  }
  @override
  void dispose() { width.dispose(); height.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    final text = inpaintSizeText(widget.language);
    InpaintSize? output;
    String error = '';
    if (widget.source != null) {
      try { output = resolveInpaintSize(widget.mode, widget.custom, widget.source!, widget.language); }
      on FormatException catch (e) { error = e.message; }
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(text['title']!, style: Theme.of(context).textTheme.titleSmall),
      const SizedBox(height: 8),
      SizedBox(width: double.infinity, child: SegmentedButton<String>(segments: [
        ButtonSegment(value: 'original', label: Text(text['original']!)),
        ButtonSegment(value: 'custom', label: Text(text['custom']!)),
      ], selected: {widget.mode}, onSelectionChanged: (value) => widget.onMode(value.first))),
      if (widget.mode == 'custom') ...[
        const SizedBox(height: 8),
        ResolutionPicker(size: widget.custom, language: widget.language, onChange: widget.onSize, maxDimension: 1600, child: Row(children: [
          Expanded(child: TextField(key: const ValueKey('inpaint-width'), controller: width,
            decoration: InputDecoration(labelText: text['width']), keyboardType: TextInputType.number,
            onChanged: (v) => widget.onSize((width: int.tryParse(v) ?? 0, height: widget.custom.height)))),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('×')),
          Expanded(child: TextField(key: const ValueKey('inpaint-height'), controller: height,
            decoration: InputDecoration(labelText: text['height']), keyboardType: TextInputType.number,
            onChanged: (v) => widget.onSize((width: widget.custom.width, height: int.tryParse(v) ?? 0)))),
        ])),
      ],
      const SizedBox(height: 6),
      Text(widget.source == null ? text['missing']! : '${text['output']}: ${output == null ? '—' : '${output.width}×${output.height}'}'),
      Text(text['rule']!, style: Theme.of(context).textTheme.bodySmall),
      if (error.isNotEmpty) Text(error, style: TextStyle(color: Theme.of(context).colorScheme.error)),
    ]);
  }
}

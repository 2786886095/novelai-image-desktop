import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n/runtime_text.dart';
import '../state/app_state.dart';

Future<void> showGalleryImagePreview(BuildContext context,
    {required List<Widget> images,
    int initialIndex = 0,
    List<String>? captions,
    Widget Function(BuildContext, int)? actionsBuilder}) async {
  if (images.isEmpty) return;
  await showDialog<void>(
      context: context,
      barrierColor: Colors.black,
      builder: (_) => _FullscreenImageViewer(
          images: images,
          initialIndex: initialIndex,
          language: context.read<AppState>().settings.language,
          captions: captions,
          actionsBuilder: actionsBuilder));
}

class ZoomableImage extends StatefulWidget {
  final Widget image;
  final Color? backgroundColor;
  final List<Widget>? gallery;
  final int initialIndex;

  const ZoomableImage({
    super.key,
    required this.image,
    this.backgroundColor,
    this.gallery,
    this.initialIndex = 0,
  });

  @override
  State<ZoomableImage> createState() => _ZoomableImageState();
}

class _ZoomableImageState extends State<ZoomableImage> {
  final controller = TransformationController();
  double scale = 1;

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  void _syncScale() {
    final next = controller.value.getMaxScaleOnAxis();
    if ((next - scale).abs() > 0.005) setState(() => scale = next);
  }

  void _reset() {
    controller.value = Matrix4.identity();
    setState(() => scale = 1);
  }

  void _openFullscreen() {
    final language = context.read<AppState>().settings.language;
    showDialog<void>(
      context: context,
      barrierColor: Colors.black,
      builder: (_) => _FullscreenImageViewer(
          images: (widget.gallery?.isNotEmpty == true
              ? widget.gallery!
              : [widget.image]),
          initialIndex: widget.initialIndex,
          language: language),
    );
  }

  @override
  Widget build(BuildContext context) {
    final language = context.watch<AppState>().settings.language;
    String t(String key) => runtimeTextFor(language, key);
    return Column(
      children: [
        SizedBox(
          height: 36,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text('${(scale * 100).round()}%'),
              IconButton(
                tooltip: t('ui.fullscreen'),
                visualDensity: VisualDensity.compact,
                onPressed: _openFullscreen,
                icon: const Icon(Icons.fullscreen, size: 20),
              ),
              IconButton(
                tooltip: t('ui.resetZoom'),
                visualDensity: VisualDensity.compact,
                onPressed: scale == 1 ? null : _reset,
                icon: const Icon(Icons.fit_screen, size: 19),
              ),
            ],
          ),
        ),
        Expanded(
          child: ColoredBox(
            color: widget.backgroundColor ?? Colors.transparent,
            child: LayoutBuilder(
              builder: (context, constraints) => GestureDetector(
                // Double-tap opens the full-screen viewer; pinch still zooms
                // here in place.
                onDoubleTap: _openFullscreen,
                child: InteractiveViewer(
                  transformationController: controller,
                  minScale: 1,
                  maxScale: 8,
                  panEnabled: scale > 1.001,
                  scaleEnabled: true,
                  trackpadScrollCausesScale: true,
                  onInteractionUpdate: (_) => _syncScale(),
                  onInteractionEnd: (_) => _syncScale(),
                  child: SizedBox(
                    width: constraints.maxWidth,
                    height: constraints.maxHeight,
                    child: widget.image,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Full-screen image viewer (lightbox): black backdrop, pinch / pan to zoom,
/// and a close button.
class _FullscreenImageViewer extends StatefulWidget {
  final List<Widget> images;
  final int initialIndex;
  final Object? language;
  final List<String>? captions;
  final Widget Function(BuildContext, int)? actionsBuilder;
  const _FullscreenImageViewer(
      {required this.images,
      required this.initialIndex,
      required this.language,
      this.captions,
      this.actionsBuilder});
  @override
  State<_FullscreenImageViewer> createState() => _FullscreenImageViewerState();
}

class _FullscreenImageViewerState extends State<_FullscreenImageViewer> {
  late int index;
  final controller = TransformationController();
  @override
  void initState() {
    super.initState();
    index = widget.initialIndex.clamp(0, widget.images.length - 1);
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  void move(int delta) {
    final next = index + delta;
    if (next < 0 || next >= widget.images.length) return;
    setState(() {
      index = next;
      controller.value = Matrix4.identity();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: Focus(
            autofocus: true,
            onKeyEvent: (_, event) {
              if (event is! KeyDownEvent) return KeyEventResult.ignored;
              if (event.logicalKey == LogicalKeyboardKey.arrowRight ||
                  event.logicalKey == LogicalKeyboardKey.arrowDown) {
                move(1);
                return KeyEventResult.handled;
              }
              if (event.logicalKey == LogicalKeyboardKey.arrowLeft ||
                  event.logicalKey == LogicalKeyboardKey.arrowUp) {
                move(-1);
                return KeyEventResult.handled;
              }
              return KeyEventResult.ignored;
            },
            child: Stack(fit: StackFit.expand, children: [
              InteractiveViewer(
                  transformationController: controller,
                  minScale: 1,
                  maxScale: 10,
                  child: Center(child: widget.images[index])),
              if (widget.captions != null && index < widget.captions!.length)
                Positioned(
                    top: 8,
                    left: 16,
                    right: widget.actionsBuilder == null ? 64 : 120,
                    child: SafeArea(
                        child: Text(widget.captions![index],
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white)))),
              Positioned(
                  top: 8,
                  right: 8,
                  child: SafeArea(
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                    if (widget.actionsBuilder != null)
                      widget.actionsBuilder!(context, index),
                    IconButton.filledTonal(
                        tooltip:
                            runtimeTextFor(widget.language, 'common.close'),
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close))
                  ]))),
              if (widget.images.length > 1)
                Positioned(
                    left: 8,
                    right: 8,
                    bottom: 8,
                    child: SafeArea(
                        child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                          IconButton.filledTonal(
                              tooltip: const {
                                    'zh-CN': '上一张',
                                    'zh-TW': '上一張',
                                    'ja-JP': '前へ',
                                    'ko-KR': '이전'
                                  }[widget.language] ??
                                  'Previous',
                              onPressed: index > 0 ? () => move(-1) : null,
                              icon: const Icon(Icons.chevron_left)),
                          Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 12),
                              child: Text(
                                  '${index + 1} / ${widget.images.length}',
                                  style: const TextStyle(color: Colors.white))),
                          IconButton.filledTonal(
                              tooltip: const {
                                    'zh-CN': '下一张',
                                    'zh-TW': '下一張',
                                    'ja-JP': '次へ',
                                    'ko-KR': '다음'
                                  }[widget.language] ??
                                  'Next',
                              onPressed: index + 1 < widget.images.length
                                  ? () => move(1)
                                  : null,
                              icon: const Icon(Icons.chevron_right)),
                        ]))),
            ])));
  }
}

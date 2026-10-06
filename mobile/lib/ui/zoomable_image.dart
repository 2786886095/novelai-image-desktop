import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n/runtime_text.dart';
import '../i18n/app_locales.dart';
import '../state/app_state.dart';
import '../services/image_clipboard.dart';
import '../i18n/image_actions_text.dart';

Future<void> showGalleryImagePreview(BuildContext context,
    {required List<Widget> images,
    int initialIndex = 0,
    List<String>? captions,
    List<String>? imagePaths,
    ValueChanged<int>? onIndexChanged,
    Widget Function(BuildContext, int)? actionsBuilder,
    Widget Function(BuildContext, int)? footerBuilder}) async {
  if (images.isEmpty) return;
  await showDialog<void>(
      context: context,
      barrierColor: Colors.black,
      builder: (_) => _FullscreenImageViewer(
          images: images,
          initialIndex: initialIndex,
          language: context.read<AppState>().settings.language,
          captions: captions,
          imagePaths: imagePaths,
          onIndexChanged: onIndexChanged,
          actionsBuilder: actionsBuilder,
          footerBuilder: footerBuilder));
}

bool paintedImageContains(GlobalKey imageKey, Offset global) {
  final root = imageKey.currentContext?.findRenderObject();
  if (root == null) return false;
  bool foundImage = false, inside = false;
  void visit(RenderObject node) {
    if (node is RenderImage && node.image != null) {
      foundImage = true;
      final source =
          Size(node.image!.width / node.scale, node.image!.height / node.scale);
      final fitted =
          applyBoxFit(node.fit ?? BoxFit.scaleDown, source, node.size);
      final alignment = node.alignment.resolve(node.textDirection);
      final rect =
          alignment.inscribe(fitted.destination, Offset.zero & node.size);
      inside = inside || rect.contains(node.globalToLocal(global));
    }
    node.visitChildren(visit);
  }

  visit(root);
  if (foundImage) return inside;
  return root is RenderBox &&
      (Offset.zero & root.size).contains(root.globalToLocal(global));
}

Future<void> _copyImage(BuildContext context, String path) async {
  final state = context.read<AppState>();
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    final copied = await ImageClipboard.copy(path,
        withOriginalMetadata: state.settings.copyImageMetadata);
    messenger?.showSnackBar(SnackBar(
        content: Text(imageActionsText(
            state.settings.language, copied ? 'copied' : 'unsupported'))));
  } catch (error) {
    messenger?.showSnackBar(SnackBar(content: Text('$error')));
  }
}

class ZoomableImage extends StatefulWidget {
  final Widget image;
  final Color? backgroundColor;
  final List<Widget>? gallery;
  final int initialIndex;
  final List<String>? imagePaths;
  final ValueChanged<int>? onIndexChanged;

  const ZoomableImage({
    super.key,
    required this.image,
    this.backgroundColor,
    this.gallery,
    this.initialIndex = 0,
    this.imagePaths,
    this.onIndexChanged,
  });

  @override
  State<ZoomableImage> createState() => _ZoomableImageState();
}

class _ZoomableImageState extends State<ZoomableImage> {
  final controller = TransformationController();
  double scale = 1;
  final imageKey = GlobalKey();
  Offset? doubleTapPosition;
  late int index;
  List<Widget> get images =>
      widget.gallery?.isNotEmpty == true ? widget.gallery! : [widget.image];
  @override
  void initState() {
    super.initState();
    index = widget.initialIndex.clamp(0, images.length - 1);
  }

  @override
  void didUpdateWidget(ZoomableImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialIndex != widget.initialIndex ||
        oldWidget.imagePaths?.elementAtOrNull(oldWidget.initialIndex) !=
            widget.imagePaths?.elementAtOrNull(widget.initialIndex)) {
      index = widget.initialIndex.clamp(0, images.length - 1);
      controller.value = Matrix4.identity();
      scale = 1;
    } else {
      index = index.clamp(0, images.length - 1);
    }
  }

  void move(int next) {
    if (next < 0 || next >= images.length) return;
    setState(() {
      index = next;
      controller.value = Matrix4.identity();
      scale = 1;
    });
    widget.onIndexChanged?.call(next);
  }

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
          images: images,
          initialIndex: index,
          imagePaths: widget.imagePaths,
          onIndexChanged: move,
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
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (images.length > 1) ...[
                  IconButton(
                      key: const ValueKey('preview-previous'),
                      onPressed: index > 0 ? () => move(index - 1) : null,
                      icon: const Icon(Icons.chevron_left, size: 20)),
                  Text('${index + 1}/${images.length}'),
                  IconButton(
                      key: const ValueKey('preview-next'),
                      onPressed: index + 1 < images.length
                          ? () => move(index + 1)
                          : null,
                      icon: const Icon(Icons.chevron_right, size: 20)),
                ],
                if (widget.imagePaths != null &&
                    index < widget.imagePaths!.length)
                  IconButton(
                      tooltip: imageActionsText(language, 'copy'),
                      visualDensity: VisualDensity.compact,
                      onPressed: () =>
                          _copyImage(context, widget.imagePaths![index]),
                      icon: const Icon(Icons.copy, size: 19)),
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
        ),
        Expanded(
          child: ColoredBox(
            color: widget.backgroundColor ?? Colors.transparent,
            child: LayoutBuilder(
              builder: (context, constraints) => GestureDetector(
                // Double-tap opens the full-screen viewer; pinch still zooms
                // here in place.
                onDoubleTapDown: (details) =>
                    doubleTapPosition = details.globalPosition,
                onDoubleTap: () {
                  if (doubleTapPosition != null &&
                      paintedImageContains(imageKey, doubleTapPosition!)) {
                    _openFullscreen();
                  }
                },
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
                    key: imageKey,
                    width: constraints.maxWidth,
                    height: constraints.maxHeight,
                    child: images[index],
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
  final List<String>? imagePaths;
  final ValueChanged<int>? onIndexChanged;
  final Widget Function(BuildContext, int)? actionsBuilder;
  final Widget Function(BuildContext, int)? footerBuilder;
  const _FullscreenImageViewer(
      {required this.images,
      required this.initialIndex,
      required this.language,
      this.captions,
      this.imagePaths,
      this.onIndexChanged,
      this.actionsBuilder,
      this.footerBuilder});
  @override
  State<_FullscreenImageViewer> createState() => _FullscreenImageViewerState();
}

class _FullscreenImageViewerState extends State<_FullscreenImageViewer> {
  late int index;
  final controller = TransformationController();
  final imageKey = GlobalKey();

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
    widget.onIndexChanged?.call(index);
  }

  @override
  Widget build(BuildContext context) {
    return Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: Focus(
            autofocus: true,
            onKeyEvent: (_, event) {
              if (event is! KeyDownEvent) return KeyEventResult.ignored;
              if (event.logicalKey == LogicalKeyboardKey.escape) {
                Navigator.pop(context);
                return KeyEventResult.handled;
              }
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
              GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTapUp: (details) {
                    if (!paintedImageContains(
                        imageKey, details.globalPosition)) {
                      Navigator.pop(context);
                    }
                  },
                  child: InteractiveViewer(
                      transformationController: controller,
                      minScale: 1,
                      maxScale: 10,
                      child: Center(
                          child: SizedBox(
                              key: imageKey, child: widget.images[index])))),
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
                    if (widget.imagePaths != null &&
                        index < widget.imagePaths!.length)
                      IconButton.filledTonal(
                          tooltip: imageActionsText(widget.language, 'copy'),
                          icon: const Icon(Icons.copy),
                          onPressed: () =>
                              _copyImage(context, widget.imagePaths![index])),
                    if (widget.actionsBuilder != null)
                      widget.actionsBuilder!(context, index),
                    IconButton.filledTonal(
                        tooltip:
                            mobileUiTextFor(widget.language, 'common.close'),
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close))
                  ]))),
              if (widget.footerBuilder != null)
                Positioned(
                    left: 16,
                    right: 16,
                    bottom: 72,
                    child: SafeArea(
                        child: Center(
                            child: widget.footerBuilder!(context, index)))),
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

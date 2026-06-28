import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n/runtime_text.dart';
import '../state/app_state.dart';

class ZoomableImage extends StatefulWidget {
  final Widget image;
  final Color? backgroundColor;

  const ZoomableImage({
    super.key,
    required this.image,
    this.backgroundColor,
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
      builder: (_) =>
          _FullscreenImageViewer(image: widget.image, language: language),
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
class _FullscreenImageViewer extends StatelessWidget {
  final Widget image;
  final Object? language;
  const _FullscreenImageViewer({required this.image, required this.language});

  @override
  Widget build(BuildContext context) {
    return Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: Stack(
        fit: StackFit.expand,
        children: [
          InteractiveViewer(
            minScale: 1,
            maxScale: 10,
            child: Center(child: image),
          ),
          Positioned(
            top: 8,
            right: 8,
            child: SafeArea(
              child: IconButton.filledTonal(
                tooltip: runtimeTextFor(language, 'common.close'),
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

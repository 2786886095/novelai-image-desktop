import 'package:flutter/material.dart';

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
    showDialog<void>(
      context: context,
      barrierColor: Colors.black,
      builder: (_) => _FullscreenImageViewer(image: widget.image),
    );
  }

  @override
  Widget build(BuildContext context) => Column(
        children: [
          SizedBox(
            height: 36,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Text('${(scale * 100).round()}%'),
                IconButton(
                  tooltip: '放大查看（全屏）',
                  visualDensity: VisualDensity.compact,
                  onPressed: _openFullscreen,
                  icon: const Icon(Icons.fullscreen, size: 20),
                ),
                IconButton(
                  tooltip: '复位缩放',
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

/// Full-screen image viewer (lightbox): black backdrop, pinch / pan to zoom,
/// and a close button.
class _FullscreenImageViewer extends StatelessWidget {
  final Widget image;
  const _FullscreenImageViewer({required this.image});

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
                tooltip: '关闭',
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

import 'package:flutter/material.dart';

/// Metadata is only a loading placeholder: the decoded image is authoritative.
class GalleryImageAspect extends StatefulWidget {
  final ImageProvider provider;
  final double fallback;
  final bool enabled;
  final Widget Function(BuildContext, double) builder;
  const GalleryImageAspect(
      {super.key,
      required this.provider,
      required this.builder,
      this.fallback = 4 / 3,
      this.enabled = true});
  @override
  State<GalleryImageAspect> createState() => _GalleryImageAspectState();
}

class _GalleryImageAspectState extends State<GalleryImageAspect> {
  ImageStream? _stream;
  ImageStreamListener? _listener;
  double? _ratio;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolve();
  }

  @override
  void didUpdateWidget(GalleryImageAspect oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.provider != oldWidget.provider ||
        widget.enabled != oldWidget.enabled) {
      _ratio = null;
      _resolve();
    }
  }

  void _resolve() {
    if (!widget.enabled) {
      _detach();
      return;
    }
    final next =
        widget.provider.resolve(createLocalImageConfiguration(context));
    if (next.key == _stream?.key) return;
    _detach();
    _stream = next;
    _listener = ImageStreamListener((info, synchronous) {
      final ratio = info.image.width / info.image.height;
      if (mounted && ratio.isFinite && ratio > 0 && ratio != _ratio) {
        if (synchronous) {
          _ratio = ratio;
        } else {
          setState(() => _ratio = ratio);
        }
      }
      info.dispose();
    }, onError: (Object error, StackTrace? stack) {});
    next.addListener(_listener!);
  }

  void _detach() {
    if (_stream != null && _listener != null) {
      _stream!.removeListener(_listener!);
    }
    _stream = null;
    _listener = null;
  }

  @override
  void dispose() {
    _detach();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      widget.builder(context, _ratio ?? widget.fallback);
}

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import 'image_file_access.dart';

class _ImageAccessEpoch extends ValueNotifier<int> with WidgetsBindingObserver {
  _ImageAccessEpoch() : super(0) { WidgetsBinding.instance.addObserver(this); }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) value++;
  }
}
_ImageAccessEpoch? _epoch;
_ImageAccessEpoch get _accessEpoch => _epoch ??= _ImageAccessEpoch();

/// The original provider URL is the identity. No sandbox materialization path
/// is substituted into history. Every new epoch reads through NSFileCoordinator.
class CoordinatedImageProvider extends ImageProvider<CoordinatedImageProvider> {
  final String path;
  final double scale;
  final int epoch;
  final ImageFileReader reader;
  CoordinatedImageProvider(this.path, {this.scale = 1, this.epoch = 0, ImageFileReader? reader})
      : reader = reader ?? ImageFiles.reader;
  @override
  Future<CoordinatedImageProvider> obtainKey(ImageConfiguration configuration) => SynchronousFuture(this);
  @override
  ImageStreamCompleter loadImage(CoordinatedImageProvider key, ImageDecoderCallback decode) =>
      MultiFrameImageStreamCompleter(codec: _load(decode), scale: scale,
        informationCollector: () => [ErrorDescription('Coordinated image read failed; original history was retained')]);
  Future<ui.Codec> _load(ImageDecoderCallback decode) async {
    try {
      final bytes = await reader.read(path);
      return await decode(await ui.ImmutableBuffer.fromUint8List(bytes));
    } catch (_) {
      // Failed entries must be retryable after a real permission/network fix.
      PaintingBinding.instance.imageCache.evict(this);
      rethrow;
    }
  }
  @override
  bool operator ==(Object other) => other is CoordinatedImageProvider &&
      other.path == path && other.scale == scale && other.epoch == epoch && identical(other.reader, reader);
  @override
  int get hashCode => Object.hash(path, scale, epoch, identityHashCode(reader));
}

ImageProvider<Object> imageFileProvider(File file, {double scale = 1}) => Platform.isIOS
    ? CoordinatedImageProvider(file.path, scale: scale, epoch: _accessEpoch.value)
    : FileImage(file, scale: scale);

/// A drop-in file widget: original FileImage semantics outside iOS; coordinated
/// bytes on iOS. Resume changes the cache key and disables gapless stale pixels.
Widget imageFile(File file, {Key? key, double scale = 1, double? width, double? height,
    BoxFit? fit, int? cacheWidth, int? cacheHeight, FilterQuality filterQuality = FilterQuality.medium,
    bool gaplessPlayback = false, ImageErrorWidgetBuilder? errorBuilder}) {
  if (!Platform.isIOS) {
    return Image.file(file, key: key, scale: scale, width: width, height: height, fit: fit,
      cacheWidth: cacheWidth, cacheHeight: cacheHeight, filterQuality: filterQuality,
      gaplessPlayback: gaplessPlayback, errorBuilder: errorBuilder);
  }
  return CoordinatedFileImage(file.path, key: key, scale: scale,
    width: width, height: height, fit: fit, cacheWidth: cacheWidth, cacheHeight: cacheHeight,
    filterQuality: filterQuality, errorBuilder: errorBuilder);
}

class CoordinatedFileImage extends StatelessWidget {
  final String path;
  final double scale;
  final double? width, height;
  final BoxFit? fit;
  final int? cacheWidth, cacheHeight;
  final FilterQuality filterQuality;
  final ImageErrorWidgetBuilder? errorBuilder;
  final ImageFileReader? reader;
  const CoordinatedFileImage(this.path, {super.key, this.scale = 1,
    this.width, this.height, this.fit, this.cacheWidth, this.cacheHeight,
    this.filterQuality = FilterQuality.medium, this.errorBuilder, this.reader});
  @override
  Widget build(BuildContext context) => ValueListenableBuilder<int>(valueListenable: _accessEpoch,
    builder: (context, epoch, _) => Image(
      key: ValueKey((path, epoch)),
      image: ResizeImage.resizeIfNeeded(cacheWidth, cacheHeight,
        CoordinatedImageProvider(path, scale: scale, epoch: epoch, reader: reader)),
      width: width, height: height, fit: fit, filterQuality: filterQuality,
      gaplessPlayback: false,
      errorBuilder: (context, error, stack) => imageAccessErrorWidget(context, error, stack,
        child: errorBuilder?.call(context, error, stack))));
}

Widget imageAccessErrorWidget(BuildContext context, Object error, StackTrace? stack, {Widget? child}) {
  final message = switch (Localizations.maybeLocaleOf(context)?.languageCode) {
    'zh' => '图片暂不可用，请联网或重新选择输出目录；原路径与历史记录已保留。',
    'ja' => '画像を読み込めません。接続または出力フォルダーを再選択してください。履歴は保持されています。',
    'ko' => '이미지를 읽을 수 없습니다. 연결하거나 출력 폴더를 다시 선택하세요. 기록은 보존됩니다.',
    _ => 'Image unavailable. Reconnect or reselect its output folder. Original path and history are retained.'
  };
  return Tooltip(message: message, child: Semantics(label: message,
    child: child ?? const Center(child: Icon(Icons.broken_image_outlined))));

}

/// Explicit export error stays visible; failed access never becomes a stale
/// cached image share. This does not assert the recipient saved the image.
Future<void> shareImageFile(BuildContext context, String path, {String? text}) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  try { await Share.shareXFiles([await ImageFiles.forSharing(path)], text: text); }
  catch (error) { messenger?.showSnackBar(SnackBar(content: Text('$error'))); }
}

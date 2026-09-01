import 'dart:async';
import 'dart:io';

import 'package:flutter/painting.dart';

typedef CompletedImagePreloader = Future<void> Function(String filePath);

/// Warms Flutter's exact [FileImage] cache entry before state switches from a
/// live generation frame (or loading overlay) to the completed file.
///
/// This is deliberately best-effort: the image has already been generated and
/// saved, so a decoder/cache timeout must never turn a successful generation
/// into a failed one.
Future<void> preloadCompletedFileImage(String filePath) async {
  final file = File(filePath);
  if (!await file.exists()) return;

  final provider = FileImage(file);
  final stream = provider.resolve(ImageConfiguration.empty);
  final ready = Completer<void>();
  late final ImageStreamListener listener;
  listener = ImageStreamListener(
    (_, __) {
      if (!ready.isCompleted) ready.complete();
    },
    onError: (_, __) {
      if (!ready.isCompleted) ready.complete();
    },
  );
  stream.addListener(listener);
  try {
    await ready.future.timeout(const Duration(seconds: 4));
  } on TimeoutException {
    // Keep the saved result and let Image.file perform its normal retry path.
  } finally {
    stream.removeListener(listener);
  }
}

import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

const maxGalleryImageBytes = 64 * 1024 * 1024;

String? galleryImageExtension(List<int> bytes) {
  if (bytes.length < 12) return null;
  String ascii(int start, int end) =>
      String.fromCharCodes(bytes.sublist(start, end));
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.indexed.every((entry) => bytes[entry.$1] == entry.$2)) return 'png';
  if (bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255) return 'jpg';
  if (['GIF87a', 'GIF89a'].contains(ascii(0, 6))) return 'gif';
  if (ascii(0, 4) == 'RIFF' && ascii(8, 12) == 'WEBP') return 'webp';
  if (ascii(4, 8) == 'ftyp' && ['avif', 'avis'].contains(ascii(8, 12))) {
    return 'avif';
  }
  return null;
}

String validateGalleryImage(List<int> bytes, [String contentType = '']) {
  if (bytes.length > maxGalleryImageBytes) {
    throw const FormatException('IMAGE_TOO_LARGE');
  }
  final type = contentType.split(';').first.trim().toLowerCase();
  final extension = galleryImageExtension(bytes);
  if (extension == null ||
      (type.isNotEmpty &&
          !type.startsWith('image/') &&
          type != 'application/octet-stream' &&
          type != 'binary/octet-stream')) {
    throw const FormatException('INVALID_IMAGE_RESPONSE');
  }
  return extension;
}

class GalleryDownloadCancelled implements Exception {}

class GalleryDownloadCancellation {
  bool cancelled = false;
  final Set<void Function()> _handlers = {};
  void check() {
    if (cancelled) throw GalleryDownloadCancelled();
  }

  void Function() attach(void Function() handler) {
    check();
    _handlers.add(handler);
    return () => _handlers.remove(handler);
  }

  void cancel() {
    if (cancelled) return;
    cancelled = true;
    for (final handler in _handlers.toList()) {
      handler();
    }
    _handlers.clear();
  }
}

// Stream the download so the size limit is enforced before allocating the body.
Future<({Uint8List bytes, String extension})> fetchGalleryImage(
  http.Client client,
  String url,
  Map<String, String> headers, {
  GalleryDownloadCancellation? cancellation,
}) async {
  cancellation?.check();
  final detach = cancellation?.attach(client.close);
  try {
    final uri = Uri.tryParse(url);
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
      throw const FormatException('INVALID_IMAGE_URL');
    }
    final request = http.Request('GET', uri)..headers.addAll(headers);
    final response =
        await client.send(request).timeout(const Duration(seconds: 30));
    cancellation?.check();
    if (response.statusCode < 200 || response.statusCode >= 300) {
      await response.stream.listen((_) {}).cancel();
      throw HttpException('HTTP_${response.statusCode}');
    }
    if ((response.contentLength ?? 0) > maxGalleryImageBytes) {
      await response.stream.listen((_) {}).cancel();
      throw const FormatException('IMAGE_TOO_LARGE');
    }
    final builder = BytesBuilder(copy: false);
    final chunks = StreamIterator(response.stream);
    final deadline = DateTime.now().add(const Duration(minutes: 2));
    try {
      while (true) {
        cancellation?.check();
        final remaining = deadline.difference(DateTime.now());
        if (remaining <= Duration.zero) throw TimeoutException('TIMEOUT');
        if (!await chunks.moveNext().timeout(
            remaining < const Duration(seconds: 30)
                ? remaining
                : const Duration(seconds: 30))) break;
        cancellation?.check();
        final chunk = chunks.current;
        if (builder.length + chunk.length > maxGalleryImageBytes) {
          throw const FormatException('IMAGE_TOO_LARGE');
        }
        builder.add(chunk);
      }
    } finally {
      await chunks.cancel();
    }
    cancellation?.check();
    final bytes = builder.takeBytes();
    return (
      bytes: bytes,
      extension:
          validateGalleryImage(bytes, response.headers['content-type'] ?? '')
    );
  } finally {
    detach?.call();
  }
}

class GalleryDownloadResult {
  bool cancelled = false;
  final List<File> savedFiles = [];
  final List<({String id, String reason})> failures = [];
}

Future<GalleryDownloadResult> downloadGalleryBatch<T>({
  required List<T> images,
  required String Function(T) id,
  required Future<({Uint8List bytes, String extension})> Function(T) fetch,
  required Future<File> Function(T, int, Uint8List, String) save,
  GalleryDownloadCancellation? cancellation,
}) async {
  final result = GalleryDownloadResult();
  for (final entry in images.indexed) {
    try {
      cancellation?.check();
      final image = await fetch(entry.$2);
      cancellation?.check();
      result.savedFiles
          .add(await save(entry.$2, entry.$1, image.bytes, image.extension));
    } catch (error) {
      if (cancellation?.cancelled == true ||
          error is GalleryDownloadCancelled) {
        result.cancelled = true;
        break;
      }
      final reason = error is FormatException
          ? error.message
          : error is HttpException
              ? error.message
              : error is TimeoutException
                  ? 'TIMEOUT'
                  : error is FileSystemException
                      ? 'FILE_WRITE_FAILED'
                      : 'DOWNLOAD_FAILED';
      result.failures.add((id: id(entry.$2), reason: reason));
    }
  }
  if (cancellation?.cancelled == true) result.cancelled = true;
  return result;
}

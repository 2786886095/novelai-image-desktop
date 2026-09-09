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

// Stream the download so the size limit is enforced before allocating the body.
Future<({Uint8List bytes, String extension})> fetchGalleryImage(
  http.Client client,
  String url,
  Map<String, String> headers,
) async {
  final uri = Uri.tryParse(url);
  if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
    throw const FormatException('INVALID_IMAGE_URL');
  }
  final request = http.Request('GET', uri)..headers.addAll(headers);
  final response =
      await client.send(request).timeout(const Duration(seconds: 30));
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
      final remaining = deadline.difference(DateTime.now());
      if (remaining <= Duration.zero) throw TimeoutException('TIMEOUT');
      if (!await chunks.moveNext().timeout(
          remaining < const Duration(seconds: 30)
              ? remaining
              : const Duration(seconds: 30))) break;
      final chunk = chunks.current;
      if (builder.length + chunk.length > maxGalleryImageBytes) {
        throw const FormatException('IMAGE_TOO_LARGE');
      }
      builder.add(chunk);
    }
  } finally {
    await chunks.cancel();
  }
  final bytes = builder.takeBytes();
  return (
    bytes: bytes,
    extension:
        validateGalleryImage(bytes, response.headers['content-type'] ?? '')
  );
}

class GalleryDownloadResult {
  final List<File> savedFiles = [];
  final List<({String id, String reason})> failures = [];
}

Future<GalleryDownloadResult> downloadGalleryBatch<T>({
  required List<T> images,
  required String Function(T) id,
  required Future<({Uint8List bytes, String extension})> Function(T) fetch,
  required Future<File> Function(T, int, Uint8List, String) save,
}) async {
  final result = GalleryDownloadResult();
  for (final entry in images.indexed) {
    try {
      final image = await fetch(entry.$2);
      result.savedFiles
          .add(await save(entry.$2, entry.$1, image.bytes, image.extension));
    } catch (error) {
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
  return result;
}

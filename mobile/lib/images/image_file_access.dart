import 'dart:io';

import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../services/ios_output_folder.dart';

/// An unavailable provider is not a deleted image. Callers must preserve its
/// history and original path so reauthorizing the folder can recover it.
class ImageAccessException extends FileSystemException {
  final String code;
  const ImageAccessException(this.code, String message, String path)
      : super(message, path);
  bool get confirmedMissing => code == 'image_missing';
}

enum ImageAvailability { available, missing, unavailable }

typedef CoordinatedImageRead = Future<Uint8List> Function(String path, int maxBytes);

/// One image-byte boundary for preview, metadata, reverse and export. Injection
/// is for host contract tests only; production always uses the native bridge on
/// iOS. In particular there is NO catch-and-read-File/cache fallback on iOS.
class ImageFileReader {
  final bool coordinated;
  final CoordinatedImageRead? nativeRead;
  const ImageFileReader({required this.coordinated, this.nativeRead});

  Future<Uint8List> read(String path, {int maxBytes = 64 * 1024 * 1024}) async {
    if (path.isEmpty || maxBytes <= 0 || maxBytes > (coordinated ? 64 : 256) * 1024 * 1024) {
      throw ImageAccessException('image_invalid', 'Invalid image input', path);
    }
    try {
      final Uint8List bytes;
      if (coordinated) {
        bytes = await (nativeRead ?? ((p, limit) => IosOutputFolder.read(p, maxBytes: limit)))(path, maxBytes);
      } else {
        final file = File(path);
        final size = await file.length();
        if (size <= 0 || size > maxBytes) {
          throw ImageAccessException('image_size', 'Image exceeds the supported size', path);
        }
        bytes = await file.readAsBytes();
      }
      if (bytes.isEmpty || bytes.length > maxBytes) {
        throw ImageAccessException('image_size', 'Image exceeds the supported size', path);
      }
      return bytes;
    } on PlatformException catch (e) {
      throw ImageAccessException(
        e.code == 'output_image_missing' ? 'image_missing' : 'image_unavailable',
        'Image unavailable. Its output folder may be offline, moved or require re-selection. The original path and history were retained.', path);
    } on MissingPluginException {
      throw ImageAccessException('image_unavailable', 'The native image reader is unavailable', path);
    } on FileSystemException catch (e) {
      if (e is ImageAccessException) rethrow;
      throw ImageAccessException(
        !coordinated && [2, 3].contains(e.osError?.errorCode) ? 'image_missing' : 'image_unavailable',
        'Image unavailable; the original path and history were retained', path);
    }
  }

  Future<ImageAvailability> probe(String path) async {
    try {
      if (coordinated) {
        if (nativeRead != null) {
          // Host dependency injection observes the same error distinction. A
          // production probe uses native coordinated attributes, not full bytes.
          await read(path);
        } else { await IosOutputFolder.probe(path); }
      } else {
        final handle = await File(path).open();
        await handle.close();
      }
      return ImageAvailability.available;
    } on ImageAccessException catch (e) {
      return e.confirmedMissing ? ImageAvailability.missing : ImageAvailability.unavailable;
    } on PlatformException catch (e) {
      return e.code == 'output_image_missing' ? ImageAvailability.missing : ImageAvailability.unavailable;
    } on FileSystemException catch (e) {
      return !coordinated && [2,3].contains(e.osError?.errorCode) ? ImageAvailability.missing : ImageAvailability.unavailable;
    } catch (_) { return ImageAvailability.unavailable; }
  }

}

abstract final class ImageFiles {
  static final reader = ImageFileReader(coordinated: Platform.isIOS);
  static Future<Uint8List> read(String path, {int maxBytes = 64 * 1024 * 1024}) =>
      reader.read(path, maxBytes: maxBytes);
  // Explicit user export only. Share's native plugin must not perform its own
  // uncoordinated read of a provider path. History/source are never rebound to
  // the temporary data file that the share plugin may create for this action.
  static Future<XFile> forSharing(String path, {ImageFileReader? access}) async {
    if (!Platform.isIOS && access == null) return XFile(path);
    final bytes = await (access ?? reader).read(path);
    final name = path.split(RegExp(r'[/\\]')).last;
    final lower = name.toLowerCase();
    final mime = lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg'
        : lower.endsWith('.webp') ? 'image/webp' : lower.endsWith('.gif') ? 'image/gif'
        : lower.endsWith('.avif') ? 'image/avif' : lower.endsWith('.bmp') ? 'image/bmp' : 'image/png';
    return _NamedImageShareFile(bytes, name, mime);
  }
  static Future<bool> confirmedMissing(String path) async =>
      await reader.probe(path) == ImageAvailability.missing;

  /// A synchronous existence check cannot materialize an external provider.
  /// On iOS keep the tile so the coordinated image/error UI can explain a
  /// revoked/offline grant, rather than hiding it or deleting its history.
  // Display metadata is deliberately not used for validation or API budgets;
  // every action performs a fresh bounded read. Provider stat is asynchronous.
  static int displaySize(String path) {
    if (Platform.isIOS) return 0;
    try { return File(path).lengthSync(); } catch (_) { return 0; }
  }
  static bool keepVisible(String path) => Platform.isIOS || File(path).existsSync();
}

// cross_file IO ignores XFile.fromData's name argument. Keep an empty path so
// share_plus writes these verified bytes, while retaining the user's basename.
class _NamedImageShareFile extends XFile {
  final String _name;
  _NamedImageShareFile(super.bytes, this._name, String mime)
      : super.fromData(mimeType: mime);
  @override
  String get name => _name;
}

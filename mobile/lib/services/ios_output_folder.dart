import 'dart:io';
import 'package:flutter/services.dart';

// The native bridge presents a real UIDocumentPicker and owns its persisted
// bookmarks. No caller can grant access by supplying a directory string.
class IosOutputFolder {
  static const _channel = MethodChannel('langbai.novelai/output_folder');
  static bool isFolderPath(String value) =>
      value.startsWith('/') &&
      value.length > 1 &&
      !value
          .substring(1)
          .split('/')
          .any((s) => s.isEmpty || s == '.' || s == '..') &&
      !RegExp(r'[\x00-\x1f]').hasMatch(value);

  static bool isWithin(String root, String file) =>
      isFolderPath(root) &&
      file.startsWith('$root/') &&
      !RegExp(r'[\x00-\x1f]').hasMatch(file) &&
      !file
          .substring(root.length + 1)
          .split('/')
          .any((s) => s.isEmpty || s == '.' || s == '..');

  static String selectedPath(Object? value) {
    if (value is! Map ||
        value['available'] != true ||
        value['bookmarkSaved'] != true ||
        value['path'] is! String ||
        !isFolderPath(value['path'] as String)) {
      throw const FormatException(
          'The native folder did not provide a saved access grant');
    }
    return value['path'] as String;
  }

  static Future<String?> choose() async {
    if (!Platform.isIOS) throw UnsupportedError('iOS folder bridge required');
    final value = await _channel.invokeMethod<Object?>('pick');
    return value == null ? null : selectedPath(value);
  }

  static Future<List<Map<String, dynamic>>> status() async {
    if (!Platform.isIOS) throw UnsupportedError('iOS folder bridge required');
    final rows = await _channel.invokeListMethod<Object?>('status') ?? const [];
    return rows.map((r) => Map<String, dynamic>.from(r as Map)).toList();
  }

  static Future<File> write(
      {required String root,
      required List<String> folders,
      required String stem,
      required Uint8List bytes}) async {
    if (!Platform.isIOS) throw UnsupportedError('iOS folder bridge required');
    final value = await _channel.invokeMapMethod<String, dynamic>('write',
        {'root': root, 'folders': folders, 'stem': stem, 'bytes': bytes});
    final file = value?['path'];
    if (value?['root'] != root ||
        value?['coordinated'] != true ||
        file is! String ||
        !isWithin(root, file)) {
      throw const FormatException(
          'Native output did not stay in the selected folder');
    }
    return File(file);
  }

  static Future<bool> probe(String path) async {
    if (!Platform.isIOS) throw UnsupportedError('iOS folder bridge required');
    final value = await _channel.invokeMapMethod<String, dynamic>('probe', {'path': path});
    if (value?['coordinated'] != true || value?['available'] != true) {
      throw const FormatException('Native image access could not be confirmed');
    }
    return true;
  }

  static Future<Uint8List> read(String path, {int maxBytes = 64 * 1024 * 1024}) async {
    if (!Platform.isIOS) throw UnsupportedError('iOS folder bridge required');
    final bytes =
        await _channel.invokeMethod<Uint8List>('read', {'path': path, 'maxBytes': maxBytes});
    if (bytes == null) {
      throw const FormatException('Native output is unavailable');
    }
    return bytes;
  }
  // Called only by Storage's iOS mutation adapter. There is no File fallback.
  static Future<Map<String, dynamic>?> mutate(String method,
      Map<String, dynamic> arguments) async {
    if (!Platform.isIOS) throw UnsupportedError('iOS folder bridge required');
    if (!['describe', 'copyForRename', 'deleteFile'].contains(method)) {
      throw ArgumentError.value(method);
    }
    return _channel.invokeMapMethod<String, dynamic>(method, arguments);
  }

}

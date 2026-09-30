import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;

import '../models/nai_models.dart';
import 'unified_storage.dart';

const localFavoritesKey = 'local_favorites_v1';

class LocalFavorite {
  final String id, sourceId, prefix, name, extension, fileName, sha256;
  final int bytes;
  const LocalFavorite(
      {required this.id,
      required this.sourceId,
      required this.prefix,
      required this.name,
      required this.extension,
      required this.fileName,
      required this.sha256,
      required this.bytes});

  factory LocalFavorite.fromJson(Map<String, dynamic> raw) {
    String field(String key) => raw[key] is String ? raw[key] as String : '';
    final item = LocalFavorite(
        id: field('id'),
        sourceId: field('sourceId'),
        prefix: field('prefix'),
        name: field('name'),
        extension: field('extension'),
        fileName: field('fileName'),
        sha256: field('sha256'),
        bytes: raw['bytes'] is int ? raw['bytes'] as int : -1);
    if (item.id.isEmpty ||
        item.sourceId.isEmpty ||
        !RegExp(r'^\d{8}_\d+x\d+_\d{2,}$').hasMatch(item.prefix) ||
        !{'.png', '.jpg', '.jpeg', '.webp'}.contains(item.extension) ||
        item.name.length > 100 ||
        RegExp(r'[/\\:*?"<>|\r\n]').hasMatch(item.name) ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(item.sha256) ||
        item.bytes < 0 ||
        item.fileName !=
            '${item.prefix}${item.name.isEmpty ? '' : '_${item.name}'}${item.extension}' ||
        p.basename(item.fileName) != item.fileName) {
      throw const FormatException('Invalid local favorite index');
    }
    return item;
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'sourceId': sourceId,
        'prefix': prefix,
        'name': name,
        'extension': extension,
        'fileName': fileName,
        'sha256': sha256,
        'bytes': bytes
      };
  LocalFavorite renamed(String suffix) => LocalFavorite(
      id: id,
      sourceId: sourceId,
      prefix: prefix,
      name: suffix,
      extension: extension,
      fileName: '$prefix${suffix.isEmpty ? '' : '_$suffix'}$extension',
      sha256: sha256,
      bytes: bytes);
}

class LocalFavoriteLibrary {
  final String directory;
  final List<LocalFavorite> items;
  const LocalFavoriteLibrary(this.directory, this.items);
}

/// Copies the original encoded image, never a thumbnail or re-encoded bitmap.
/// The index uses UnifiedPreferences so Android storage migration and backup
/// carry it with the other user data; default images live under images/.
class MobileLocalFavorites extends ChangeNotifier {
  static final instance = MobileLocalFavorites();
  final Directory? rootOverride;
  Future<void> _tail = Future.value();
  MobileLocalFavorites({this.rootOverride});

  Future<T> _serial<T>(Future<T> Function() operation) {
    final task = _tail.then((_) => operation());
    _tail = task.then<void>((_) {}, onError: (Object _) {});
    return task;
  }

  Future<Directory> _root() => rootOverride == null
      ? UnifiedStorage.documents()
      : Future.value(rootOverride!);
  Future<Directory> _defaultDirectory() async =>
      Directory(p.join((await _root()).path, 'images', 'favorites'));

  Future<LocalFavoriteLibrary> _read() async {
    final prefs = await UnifiedStorage.preferences();
    final raw = prefs.getString(localFavoritesKey);
    final defaultDirectory = await _defaultDirectory();
    if (raw == null) {
      return LocalFavoriteLibrary(defaultDirectory.path, const []);
    }
    final value = jsonDecode(raw);
    if (value is! Map ||
        value['version'] != 1 ||
        value['directory'] is! String ||
        value['items'] is! List) {
      throw const FormatException('Invalid local favorite index');
    }
    final custom = value['directory'] as String;
    if (custom.isNotEmpty && !p.isAbsolute(custom)) {
      throw const FormatException('Invalid local favorite directory');
    }
    final items = (value['items'] as List)
        .map((entry) =>
            LocalFavorite.fromJson(Map<String, dynamic>.from(entry as Map)))
        .toList();
    if (items.map((e) => e.id).toSet().length != items.length ||
        items.map((e) => e.fileName).toSet().length != items.length) {
      throw const FormatException('Duplicate local favorite');
    }
    return LocalFavoriteLibrary(
        custom.isEmpty ? defaultDirectory.path : custom, items);
  }

  Future<void> _write(LocalFavoriteLibrary data) async {
    final defaultDirectory = await _defaultDirectory();
    final custom =
        p.normalize(data.directory) == p.normalize(defaultDirectory.path)
            ? ''
            : data.directory;
    final prefs = await UnifiedStorage.preferences();
    if (!await prefs.setString(
        localFavoritesKey,
        jsonEncode({
          'version': 1,
          'directory': custom,
          'items': data.items.map((e) => e.toJson()).toList(),
        }))) throw const FileSystemException('Failed to save local favorites');
    notifyListeners();
  }

  Future<String> _safeDirectory(String directory) async {
    if (!p.isAbsolute(directory)) {
      throw const FormatException('Directory must be absolute');
    }
    await Directory(directory).create(recursive: true);
    final type = await FileSystemEntity.type(directory, followLinks: false);
    if (type != FileSystemEntityType.directory) {
      throw FileSystemException(
          'Linked favorites directory is not allowed', directory);
    }
    return Directory(directory).resolveSymbolicLinks();
  }

  Future<LocalFavoriteLibrary> list() => _serial(_read);

  Future<LocalFavorite> add(HistoryItem history) => _serial(() async {
        final source = File(history.filePath);
        if (await FileSystemEntity.type(source.path, followLinks: false) !=
            FileSystemEntityType.file) {
          throw FileSystemException('Original image unavailable', source.path);
        }
        final extension = p.extension(source.path).toLowerCase();
        if (!{'.png', '.jpg', '.jpeg', '.webp'}.contains(extension)) {
          throw const FormatException('Unsupported original image format');
        }
        if (history.width <= 0 || history.height <= 0) {
          throw const FormatException('Image resolution missing');
        }
        final data = await _read();
        final directory = await _safeDirectory(data.directory);
        final bytes = await source.readAsBytes();
        final hash = sha256.convert(bytes).toString();
        for (final saved in data.items) {
          if (saved.sourceId == history.id && saved.sha256 == hash) {
            return saved;
          }
        }
        final date = history.date.replaceAll(RegExp(r'[^0-9]'), '');
        if (date.length != 8) throw const FormatException('Invalid image date');
        final base = '${date}_${history.width}x${history.height}';
        var sequence = 1;
        late String prefix;
        late File destination;
        while (true) {
          prefix = '${base}_${sequence.toString().padLeft(2, '0')}';
          destination = File(p.join(directory, '$prefix$extension'));
          if (!data.items.any((e) => e.prefix == prefix) &&
              !await destination.exists()) {
            try {
              await destination.create(exclusive: true);
              break;
            } on FileSystemException {
              // Another writer claimed this name.
            }
          }
          sequence++;
        }
        try {
          await destination.writeAsBytes(bytes, flush: true);
          final copied = await destination.readAsBytes();
          if (sha256.convert(copied).toString() != hash) {
            throw const FileSystemException(
                'Favorite copy integrity check failed');
          }
          final favorite = LocalFavorite(
              id: '${DateTime.now().microsecondsSinceEpoch}-$sequence',
              sourceId: history.id,
              prefix: prefix,
              name: '',
              extension: extension,
              fileName: '$prefix$extension',
              sha256: hash,
              bytes: bytes.length);
          await _write(
              LocalFavoriteLibrary(directory, [...data.items, favorite]));
          return favorite;
        } catch (_) {
          await destination.delete().catchError((Object _) => destination);
          rethrow;
        }
      });

  Future<LocalFavorite> rename(String id, String suffix) => _serial(() async {
        final name = suffix.trim();
        if (name.length > 100 || RegExp(r'[/\\:*?"<>|\r\n]').hasMatch(name)) {
          throw const FormatException('Invalid favorite name');
        }
        final data = await _read();
        final index = data.items.indexWhere((e) => e.id == id);
        if (index < 0) throw StateError('Favorite not found');
        final old = data.items[index], next = old.renamed(name);
        if (next.fileName == old.fileName) return old;
        final directory = await _safeDirectory(data.directory);
        final source = File(p.join(directory, old.fileName));
        final target = File(p.join(directory, next.fileName));
        if (await target.exists()) {
          throw const FileSystemException('Favorite name already exists');
        }
        if (await FileSystemEntity.type(source.path, followLinks: false) !=
            FileSystemEntityType.file) {
          throw FileSystemException('Favorite image unavailable', source.path);
        }
        final bytes = await source.readAsBytes();
        if (sha256.convert(bytes).toString() != old.sha256) {
          throw const FileSystemException('Favorite image changed on disk');
        }
        await target.create(exclusive: true);
        try {
          await target.writeAsBytes(bytes, flush: true);
          final items = [...data.items]..[index] = next;
          await _write(LocalFavoriteLibrary(directory, items));
        } catch (_) {
          await target.delete().catchError((Object _) => target);
          rethrow;
        }
        // The index now points at the verified new copy. Failure to clean up the
        // old copy must not roll back the committed index or delete its target.
        await source.delete().catchError((Object _) => source);
        return next;
      });

  Future<void> remove(String id) => _serial(() async {
        final data = await _read();
        if (!data.items.any((e) => e.id == id)) {
          throw StateError('Favorite not found');
        }
        await _write(LocalFavoriteLibrary(
            data.directory, data.items.where((e) => e.id != id).toList()));
        // Removing a bookmark never deletes the original or the copied image.
      });

  Future<void> setDirectory(String next) => _serial(() async {
        final data = await _read();
        final source = await _safeDirectory(data.directory);
        final destination = await _safeDirectory(next);
        if (p.normalize(source) == p.normalize(destination)) return;
        final copied = <File>[];
        try {
          for (final item in data.items) {
            final old = File(p.join(source, item.fileName));
            final target = File(p.join(destination, item.fileName));
            if (await FileSystemEntity.type(old.path, followLinks: false) !=
                    FileSystemEntityType.file ||
                await target.exists()) {
              throw FileSystemException(
                  'Missing or conflicting favorite image', target.path);
            }
            final bytes = await old.readAsBytes();
            if (sha256.convert(bytes).toString() != item.sha256) {
              throw FileSystemException(
                  'Favorite image changed on disk', old.path);
            }
            await target.create(exclusive: true);
            copied.add(target);
            await target.writeAsBytes(bytes, flush: true);
          }
          await _write(LocalFavoriteLibrary(destination, data.items));
        } catch (_) {
          for (final file in copied) {
            await file.delete().catchError((Object _) => file);
          }
          rethrow;
        }
      });

  Future<File> file(LocalFavorite item) async {
    final data = await _read();
    if (!data.items.any((e) => e.id == item.id)) {
      throw StateError('Favorite not found');
    }
    return File(p.join(data.directory, item.fileName));
  }
}

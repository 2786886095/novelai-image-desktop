import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:path_provider/path_provider.dart';

/// Native workspaces remain passive on Android/iOS. They never enter prefs,
/// plugin loading, or process configuration, including during a round trip.
class PortableProjects {
  static const prefix = 'portable-projects/';
  static final _name = RegExp(r'^(agent|detective)-([a-f0-9]{64})\.zip$');
  static bool _selected(String kind, Set<String> selected) => kind == 'agent'
      ? selected.contains('tavernAgent')
      : selected.contains('styleLab');

  static void validate(String name, List<int> bytes) {
    final match = _name.firstMatch(name);
    if (match == null ||
        bytes.length > 1034 * 1024 * 1024 ||
        sha256.convert(bytes).toString() != match.group(2)) {
      throw const FormatException('Portable capsule integrity mismatch');
    }
    final zip = ZipDecoder().decodeBytes(bytes);
    final manifest = zip.findFile('manifest.json');
    if (manifest == null || manifest.size > 8 * 1024 * 1024) {
      throw const FormatException('Invalid portable manifest');
    }
    final json = jsonDecode(utf8.decode(manifest.content as List<int>));
    if (json is! Map ||
        json['version'] != 1 ||
        json['kind'] != match.group(1) ||
        json['files'] is! List ||
        (json['files'] as List).length > 20000) {
      throw const FormatException('Unsupported portable capsule');
    }
    final seen = <String>{};
    var total = 0;
    for (final entry in json['files']) {
      final path = entry['name'];
      final size = entry['bytes'];
      if (path is! String ||
          path.isEmpty ||
          path.length > 512 ||
          path.contains(RegExp(r'[\\:\x00-\x1f<>"|?*]')) ||
          path.split('/').any((p) =>
              p.isEmpty ||
              p == '.' ||
              p == '..' ||
              RegExp(r'[. ]$').hasMatch(p) ||
              RegExp(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)',
                      caseSensitive: false)
                  .hasMatch(p)) ||
          !seen.add(path.toLowerCase()) ||
          size is! int ||
          size < 0 ||
          size > 256 * 1024 * 1024 ||
          (total += size) > 1024 * 1024 * 1024) {
        throw const FormatException('Invalid portable path or size');
      }
      final file = zip.findFile('files/$path');
      if (file == null ||
          file.size != size ||
          sha256.convert(file.content as List<int>).toString() !=
              entry['hash']) {
        throw const FormatException('Portable file integrity mismatch');
      }
    }
    for (final name in seen) {
      final parts = name.split('/');
      for (var i = 1; i < parts.length; i++) {
        if (seen.contains(parts.take(i).join('/'))) {
          throw const FormatException('Portable path conflict');
        }
      }
    }
  }

  static Map<String, List<int>> inspect(Archive archive, Set<String> selected) {
    final result = <String, List<int>>{};
    for (final file in archive.files) {
      if (!file.isFile || !file.name.startsWith(prefix)) continue;
      final name = file.name.substring(prefix.length),
          match = _name.firstMatch(file.name.substring(prefix.length));
      if (match == null) throw const FormatException('Invalid portable entry');
      if (!_selected(match.group(1)!, selected)) continue;
      if (file.size > 1034 * 1024 * 1024) {
        throw const FormatException('Capsule too large');
      }
      final bytes = List<int>.from(file.content as List);
      validate(name, bytes);
      result[name] = bytes;
    }
    return result;
  }

  static Future<Directory> _directory() async => Directory(
      '${(await getApplicationDocumentsDirectory()).path}/portable-project-capsules');
  static Future<void> restore(Map<String, List<int>> capsules) async {
    if (capsules.isEmpty) return;
    final dir = await _directory();
    await dir.create(recursive: true);
    for (final entry in capsules.entries) {
      validate(entry.key, entry.value);
      final file = File('${dir.path}/${entry.key}');
      if (await file.exists()) {
        validate(entry.key, await file.readAsBytes());
        continue;
      }
      final temp = File('${file.path}.part');
      await temp.writeAsBytes(entry.value, flush: true);
      await temp.rename(file.path);
    }
  }

  static Future<void> export(Archive archive, Set<String> selected) async {
    final dir = await _directory();
    if (!await dir.exists()) return;
    await for (final item in dir.list(followLinks: false)) {
      if (item is! File) continue;
      final name = item.uri.pathSegments.last,
          match = _name.firstMatch(item.uri.pathSegments.last);
      if (match == null || !_selected(match.group(1)!, selected)) continue;
      if (await item.length() > 1034 * 1024 * 1024) {
        throw const FormatException('Capsule too large');
      }
      final bytes = await item.readAsBytes();
      validate(name, bytes);
      archive.addFile(ArchiveFile('$prefix$name', bytes.length, bytes));
    }
  }
}

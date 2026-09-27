import 'unified_storage.dart';
import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;

/// Imported desktop capsules remain passive. Android's own native Agent home
/// is exported using the same verified capsule format while the engine is locked.
class PortableProjects {
  static const _native = MethodChannel('langbai.novelai/local_agent');
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
      '${(await UnifiedStorage.documents()).path}/portable-project-capsules');
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
    if(Platform.isAndroid && selected.contains('tavernAgent')) {
      Map<String,dynamic>? lock;
      try {
        final state=await _native.invokeMapMethod<String,dynamic>('status');
        if(state?['supported']==true) {
          lock=await _native.invokeMapMethod<String,dynamic>('lockData');
          if(lock?['home'] is String) {
            final bytes=await packNativeHome(Directory(lock!['home'] as String));
            if(bytes!=null){final name='agent-${sha256.convert(bytes)}.zip';archive.addFile(ArchiveFile('$prefix$name',bytes.length,bytes));}
          }
        }
      } on MissingPluginException { /* Existing mobile builds have no native home. */ }
      finally {if(lock!=null)await _native.invokeMethod('unlockData',{'token':lock['token']});}
    }
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

  /// No executable runtime files are included. Mirrors the desktop contract,
  /// including explicit omitted-link records and cross-platform path validation.
  static Future<List<int>?> packNativeHome(Directory home) async {
    if(!await home.exists())return null;
    if(await FileSystemEntity.type(home.path,followLinks:false)!=FileSystemEntityType.directory)throw const FormatException('Linked Agent home');
    final archive=Archive(),files=<Map<String,dynamic>>[],omitted=<String>[];
    var total=0;
    await for(final entry in home.list(recursive:true,followLinks:false)) {
      final name=p.relative(entry.path,from:home.path).replaceAll('\\','/');
      if(entry is Link){omitted.add(name);continue;}
      if(entry is! File || RegExp(r'(^|/)(\.cache|logs|tmp)(/|$)|(^|/)(.*\.lock|.*\.pid)$',caseSensitive:false).hasMatch(name))continue;
      final stat=await entry.stat();
      if(stat.size>256*1024*1024 || (total+=stat.size)>1024*1024*1024 || files.length>=20000)throw const FormatException('Agent backup exceeds portable limits');
      final bytes=await entry.readAsBytes(),after=await entry.stat();
      if(after.size!=stat.size || after.modified!=stat.modified)throw const FormatException('Agent home changed during backup');
      files.add({'name':name,'hash':sha256.convert(bytes).toString(),'bytes':bytes.length});
      archive.addFile(ArchiveFile('files/$name',bytes.length,bytes));
    }
    if(files.isEmpty)return null;
    final manifest=utf8.encode(jsonEncode({'version':1,'kind':'agent','files':files,'omitted':omitted}));
    archive.addFile(ArchiveFile('manifest.json',manifest.length,manifest));
    final bytes=ZipEncoder().encode(archive)!;
    validate('agent-${sha256.convert(bytes)}.zip',bytes);
    return bytes;
  }
}

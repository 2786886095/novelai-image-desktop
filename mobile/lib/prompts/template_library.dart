import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

const mobileTemplateSlots = <String>[
  'image.reverse.tags',
  'image.reverse.natural',
  'image.reverse.mixed',
  'image.convert.tags',
  'image.convert.natural',
  'image.convert.mixed',
  'comic.jp-page',
  'comic.single-panel',
];
const mobileTemplateMaxBytes = 256 * 1024;
const mobileTemplateImportMaxBytes = 8 * 1024 * 1024;
const mobileTemplateImportMaxRecords = 32;
String mobileTemplateDigest(String body) =>
    sha256.convert(utf8.encode(body)).toString();

String _slot(Object? value) {
  if (value is! String || !mobileTemplateSlots.contains(value)) {
    throw const FormatException('Invalid template slot.');
  }
  return value;
}

String mobileTemplateName(Object? value) {
  if (value is! String) {
    throw const FormatException('A template name is required.');
  }
  final name = value.trim();
  if (name.isEmpty ||
      name.runes.length > 60 ||
      RegExp(r'[\x00\r\n]').hasMatch(name)) {
    throw const FormatException(
        'Template names require 1–60 characters without line breaks.');
  }
  return name;
}

String mobileTemplateBody(Object? value) {
  if (value is! String) {
    throw const FormatException('Template body must be text.');
  }
  final body =
      value.replaceFirst(RegExp(r'^\uFEFF'), '').replaceAll('\r\n', '\n');
  if (body.trim().isEmpty ||
      body.contains('\x00') ||
      utf8.encode(body).length > mobileTemplateMaxBytes) {
    throw const FormatException(
        'Template body must be nonempty UTF-8 text up to 256 KiB, without NUL.');
  }
  return body;
}

class MobileBuiltinTemplate {
  final String id, slot, name, body, sha256, sourceFile;
  final String? sourceVersion, skillVersion;
  const MobileBuiltinTemplate(
      {required this.id,
      required this.slot,
      required this.name,
      required this.body,
      required this.sha256,
      required this.sourceFile,
      this.sourceVersion,
      this.skillVersion});
  factory MobileBuiltinTemplate.fromJson(Map value) {
    final body = value['body'];
    if (body is! String ||
        body.trim().isEmpty ||
        mobileTemplateDigest(body) != value['sha256']) {
      throw const FormatException('Built-in template integrity mismatch.');
    }
    final id = value['id'];
    if (id is! String || id.isEmpty) {
      throw const FormatException('Missing built-in ID.');
    }
    return MobileBuiltinTemplate(
        id: id,
        slot: _slot(value['slot']),
        name: value['title'] as String,
        body: body,
        sha256: value['sha256'] as String,
        sourceFile: value['sourceFile'] as String,
        sourceVersion: value['sourceVersion']?.toString(),
        skillVersion: value['skillVersion']?.toString() ??
            (value['task'] != null ? '3.0.0' : null));
  }
}

class MobileCustomTemplate {
  final String id, slot, name, body, sha256, createdAt, updatedAt;
  final int rev;
  final Map<String, dynamic> origin;
  const MobileCustomTemplate(
      {required this.id,
      required this.slot,
      required this.name,
      required this.body,
      required this.sha256,
      required this.origin,
      required this.createdAt,
      required this.updatedAt,
      required this.rev});
  factory MobileCustomTemplate.fromJson(Map value) {
    final body = mobileTemplateBody(value['body']);
    if (body != value['body'] ||
        mobileTemplateDigest(body) != value['sha256']) {
      throw const FormatException('Custom template integrity mismatch.');
    }
    final id = value['id'];
    if (id is! String || !RegExp(r'^[a-zA-Z0-9-]{1,100}$').hasMatch(id)) {
      throw const FormatException('Invalid custom template ID.');
    }
    if (value['createdAt'] is! String ||
        value['updatedAt'] is! String ||
        value['rev'] is! int ||
        value['rev'] < 1) {
      throw const FormatException('Invalid template record metadata.');
    }
    return MobileCustomTemplate(
        id: id,
        slot: _slot(value['slot']),
        name: mobileTemplateName(value['name']),
        body: body,
        sha256: value['sha256'] as String,
        origin: Map<String, dynamic>.from(
            value['origin'] is Map ? value['origin'] : const {'kind': 'blank'}),
        createdAt: value['createdAt'],
        updatedAt: value['updatedAt'],
        rev: value['rev']);
  }
  Map<String, dynamic> toJson() => {
        'id': id,
        'slot': slot,
        'name': name,
        'body': body,
        'sha256': sha256,
        'origin': origin,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        'rev': rev
      };
}

class ResolvedMobileTemplate {
  final String slot, id, name, body, sha256, revision, source;
  final String? sourceVersion;
  const ResolvedMobileTemplate(
      {required this.slot,
      required this.id,
      required this.name,
      required this.body,
      required this.sha256,
      required this.revision,
      required this.source,
      this.sourceVersion});
}

class MobileTemplateImportEntry {
  final String slot, name, body;
  final Map<String, dynamic> origin;
  const MobileTemplateImportEntry(
      {required this.slot,
      required this.name,
      required this.body,
      this.origin = const {'kind': 'blank'}});
}

class MobileTemplateImportPreview {
  final List<MobileTemplateImportEntry> entries;
  final List<String> warnings;
  const MobileTemplateImportPreview(this.entries, this.warnings);
}

/// Pure data parsing: imported IDs, paths, scripts and selections are ignored.
MobileTemplateImportPreview parseMobileTemplateImport(
    String text, String fileName, String defaultSlot) {
  _slot(defaultSlot);
  if (utf8.encode(text).length > mobileTemplateImportMaxBytes) {
    throw const FormatException('Template import exceeds 8 MiB.');
  }
  final file = fileName.replaceAll('\\', '/').split('/').last;
  final ext = file.split('.').last.toLowerCase();
  if (!['txt', 'md', 'json'].contains(ext)) {
    throw const FormatException('Choose TXT, MD or JSON.');
  }
  final defaultName =
      file.replaceFirst(RegExp(r'\.(txt|md|json)$', caseSensitive: false), '');
  final Object? decoded = ext == 'json'
      ? jsonDecode(text.replaceFirst(RegExp(r'^\uFEFF'), ''))
      : {'name': defaultName, 'slot': defaultSlot, 'body': text};
  final List rows = decoded is List
      ? decoded
      : decoded is Map && decoded['templates'] is List
          ? decoded['templates']
          : [decoded];
  if (rows.isEmpty || rows.length > mobileTemplateImportMaxRecords) {
    throw const FormatException('Import 1–32 templates at a time.');
  }
  final entries = <MobileTemplateImportEntry>[];
  final warnings = <String>[];
  for (var i = 0; i < rows.length; i++) {
    final row = rows[i];
    if (row is! Map) {
      throw FormatException('Template ${i + 1} must be an object.');
    }
    final String slot;
    if (row.containsKey('slot')) {
      slot = _slot(row['slot']);
    } else if (row.containsKey('comicFormat')) {
      slot = _slot('comic.${row['comicFormat']}');
    } else if (row.containsKey('task') || row.containsKey('mode')) {
      slot = _slot('image.${row['task']}.${row['mode']}');
    } else {
      slot = defaultSlot;
    }
    final name = mobileTemplateName(row['name'] ??
        (rows.length == 1 ? defaultName : '$defaultName ${i + 1}'));
    final body = mobileTemplateBody(row['body']);
    entries.add(
        MobileTemplateImportEntry(slot: slot, name: name, body: body, origin: {
      'kind': 'import',
      'fileName': file.substring(0, min(file.length, 180)),
      'format': ext
    }));
    if (slot.startsWith('image.') && !body.contains('{{input}}')) {
      warnings.add(
          '$name: no {{input}} placeholder; user content is still sent as a separate message.');
    }
    if (slot.startsWith('image.reverse.') && !body.contains('{{image}}')) {
      warnings.add(
          '$name: no {{image}} placeholder; the actual image is still attached.');
    }
  }
  return MobileTemplateImportPreview(
      List.unmodifiable(entries), List.unmodifiable(warnings));
}

/// Application-owned file, separate from legacy v1/v2 settings. Corrupt bytes are
/// retained verbatim and both mutation and runtime resolution fail closed.
class MobileTemplateLibrary extends ChangeNotifier {
  final Future<Directory> Function() directoryProvider;
  final AssetBundle bundle;
  final List<MobileBuiltinTemplate>? builtinFixture;
  MobileTemplateLibrary(
      {Future<Directory> Function()? directoryProvider,
      AssetBundle? bundle,
      this.builtinFixture})
      : directoryProvider =
            directoryProvider ?? getApplicationDocumentsDirectory,
        bundle = bundle ?? rootBundle;
  List<MobileBuiltinTemplate> _builtins = [];
  List<MobileCustomTemplate> _custom = [];
  Map<String, Map<String, String>> _selection = {};
  String revision = 'unloaded';
  int _storeRevision = 0;
  bool loaded = false, readOnly = false;
  String? error;
  Future<void> _tail = Future<void>.value();
  List<MobileBuiltinTemplate> get builtins => List.unmodifiable(_builtins);
  List<MobileCustomTemplate> get custom => List.unmodifiable(_custom);
  static const fileName = 'prompt-template-library.json';
  Future<File> get file async =>
      File(p.join((await directoryProvider()).path, fileName));

  static Future<List<MobileBuiltinTemplate>> loadBuiltins(
      {AssetBundle? bundle}) async {
    final assets = bundle ?? rootBundle;
    final result = <MobileBuiltinTemplate>[];
    for (final path in [
      'assets/prompt-skill-catalog-v3.json',
      'assets/comic-template-catalog.json'
    ]) {
      final decoded = jsonDecode(await assets.loadString(path));
      if (decoded is! Map || decoded['templates'] is! List) {
        throw const FormatException('Missing template catalog.');
      }
      result.addAll((decoded['templates'] as List)
          .map((v) => MobileBuiltinTemplate.fromJson(v as Map)));
    }
    if (result.length != 8 ||
        result.map((v) => v.slot).toSet().length != 8 ||
        !result.every((v) => mobileTemplateSlots.contains(v.slot))) {
      throw const FormatException(
          'Exactly eight independent built-in templates are required.');
    }
    return result;
  }

  Future<void> load() async {
    try {
      _builtins = builtinFixture ?? await loadBuiltins(bundle: bundle);
      final f = await file;
      if (!await f.exists()) {
        if (loaded && revision != 'unloaded' && revision != 'missing') {
          throw StateError(
              'Previously loaded template library is missing; no built-in fallback was applied.');
        }
        _custom = [];
        _selection = {};
        revision = 'missing';
        _storeRevision = 0;
      } else {
        final bytes = await f.readAsBytes();
        revision = sha256.convert(bytes).toString();
        final raw = utf8.decode(bytes, allowMalformed: false);
        final parsed = _decode(raw);
        _custom = parsed.$1;
        _selection = parsed.$2;
        _storeRevision = (jsonDecode(raw) as Map)['revision'] as int;
      }
      error = null;
      readOnly = false;
    } catch (e) {
      // No repair write, deletion, renamed file or fallback from a broken selection.
      error =
          'Template library could not be read; no repair or fallback was applied. $e';
      readOnly = true;
    } finally {
      loaded = true;
      notifyListeners();
    }
  }

  (List<MobileCustomTemplate>, Map<String, Map<String, String>>) _decode(
      String raw) {
    if (utf8.encode(raw).length > 16 * 1024 * 1024) {
      throw const FormatException('Template library exceeds 16 MiB.');
    }
    final obj = jsonDecode(raw);
    if (obj is! Map ||
        obj['schema'] != 'langbai.template-library/1' ||
        obj['revision'] is! int ||
        obj['revision'] < 0 ||
        obj['quarantine'] is! List ||
        (obj['quarantine'] as List).isNotEmpty ||
        obj['custom'] is! List ||
        obj['selection'] is! Map) {
      throw const FormatException('Invalid template library schema.');
    }
    final rows = (obj['custom'] as List)
        .map((v) => MobileCustomTemplate.fromJson(v as Map))
        .toList();
    if (rows.length > 128 ||
        rows.map((v) => v.id).toSet().length != rows.length) {
      throw const FormatException('Duplicate or excessive template records.');
    }
    final selected = <String, Map<String, String>>{};
    for (final entry in (obj['selection'] as Map).entries) {
      final slot = _slot(entry.key), value = entry.value;
      if (value is! Map ||
          value['id'] is! String ||
          !['builtin', 'custom'].contains(value['kind'])) {
        throw const FormatException('Invalid template selection.');
      }
      final id = value['id'] as String, kind = value['kind'] as String;
      if (kind == 'custom' && !rows.any((v) => v.id == id && v.slot == slot) ||
          kind == 'builtin' &&
              !_builtins.any((v) => v.id == id && v.slot == slot)) {
        throw const FormatException(
            'Selected template is missing; no fallback was applied.');
      }
      selected[slot] = {'kind': kind, 'id': id};
    }
    return (rows, selected);
  }

  ResolvedMobileTemplate resolve(String slot) {
    _slot(slot);
    if (!loaded || readOnly) {
      throw StateError(error ?? 'Template library has not loaded.');
    }
    final ref = _selection[slot];
    if (ref?['kind'] == 'custom') {
      final matches =
          _custom.where((v) => v.id == ref!['id'] && v.slot == slot).toList();
      if (matches.length != 1) {
        throw StateError(
            'Selected custom template is unavailable; no fallback.');
      }
      final v = matches.single;
      if (mobileTemplateDigest(v.body) != v.sha256) {
        throw StateError('Selected custom template integrity mismatch.');
      }
      return ResolvedMobileTemplate(
          slot: slot,
          id: v.id,
          name: v.name,
          body: v.body,
          sha256: v.sha256,
          revision: revision,
          source: 'custom');
    }
    final matches = _builtins.where((v) => v.slot == slot).toList();
    if (matches.length != 1) throw StateError('Built-in template missing.');
    final v = matches.single;
    return ResolvedMobileTemplate(
        slot: slot,
        id: v.id,
        name: v.name,
        body: v.body,
        sha256: v.sha256,
        revision: revision,
        source: 'builtin',
        sourceVersion: v.sourceVersion);
  }

  String _newId() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }

  String _uniqueName(String desired, List<MobileCustomTemplate> rows) {
    if (!rows.any((r) => r.name == desired)) return desired;
    for (var i = 2;; i++) {
      final suffix = ' ($i)', runes = desired.runes.toList();
      final name =
          String.fromCharCodes(runes.take(60 - suffix.length)) + suffix;
      if (!rows.any((r) => r.name == name)) return name;
    }
  }

  Future<T> _serial<T>(Future<T> Function() action) {
    final result = Completer<T>();
    _tail = _tail.then((_) async {
      try {
        result.complete(await action());
      } catch (e, st) {
        result.completeError(e, st);
      }
    });
    return result.future;
  }

  static final Map<String, Future<void>> _writers = {};
  Future<T> _fileSerial<T>(File target, Future<T> Function() task) {
    final key = target.absolute.path, result = Completer<T>();
    final previous = _writers[key] ?? Future<void>.value();
    final pending = previous.then((_) async {
      try {
        result.complete(await task());
      } catch (e, st) {
        result.completeError(e, st);
      }
    });
    _writers[key] = pending;
    pending.whenComplete(() {
      if (identical(_writers[key], pending)) _writers.remove(key);
    });
    return result.future;
  }

  Future<T> _mutate<T>(
          String? expectedRevision,
          T Function(
                  List<MobileCustomTemplate>, Map<String, Map<String, String>>)
              action) =>
      _serial(() async {
        if (!loaded || readOnly) {
          throw StateError(error ?? 'Template library has not loaded.');
        }
        final expected = expectedRevision ?? revision;
        if (expected != revision) {
          throw StateError('Template library changed. Reload before saving.');
        }
        final f = await file;
        return _fileSerial(f, () async {
          Future<String> currentDigest() async => await f.exists()
              ? sha256.convert(await f.readAsBytes()).toString()
              : 'missing';
          if (await currentDigest() != expected) {
            throw StateError(
                'Template library changed on disk. Reload before saving.');
          }
          final rows = [..._custom],
              selections = _selection
                  .map((k, v) => MapEntry(k, Map<String, String>.from(v)));
          final result = action(rows, selections);
          if (rows.length > 128) {
            throw const FormatException(
                'The library supports at most 128 custom templates.');
          }
          final text = jsonEncode({
            'schema': 'langbai.template-library/1',
            'revision': _storeRevision + 1,
            'custom': rows.map((r) => r.toJson()).toList(),
            'selection': selections,
            'quarantine': []
          });
          if (utf8.encode(text).length > 16 * 1024 * 1024) {
            throw const FormatException('Template library exceeds 16 MiB.');
          }
          await f.parent.create(recursive: true);
          final temp = File('${f.path}.${_newId()}.tmp');
          try {
            await temp.writeAsString(text, flush: true);
            if (await currentDigest() != expected) {
              throw StateError(
                  'Template library changed before commit. Reload before saving.');
            }
            await temp.rename(f.path);
          } finally {
            if (await temp.exists()) await temp.delete();
          }
          _custom = rows;
          _selection = selections;
          _storeRevision++;
          revision = mobileTemplateDigest(text);
          notifyListeners();
          return result;
        });
      });

  Future<String> create(
      {required String slot,
      required String name,
      required String body,
      String? fromBuiltinId,
      bool activate = false,
      String? expectedRevision}) async {
    final entry = MobileTemplateImportEntry(
        slot: _slot(slot),
        name: mobileTemplateName(name),
        body: mobileTemplateBody(body),
        origin: fromBuiltinId == null
            ? const {'kind': 'blank'}
            : {
                'kind': 'fork',
                'builtinId': fromBuiltinId,
                'builtinSha256': _builtins
                    .firstWhere((v) => v.id == fromBuiltinId && v.slot == slot)
                    .sha256
              });
    return (await importEntries([entry],
            activate: activate, expectedRevision: expectedRevision))
        .single;
  }

  Future<List<String>> importEntries(List<MobileTemplateImportEntry> entries,
      {bool activate = false, String? expectedRevision}) async {
    if (entries.isEmpty || entries.length > mobileTemplateImportMaxRecords) {
      throw const FormatException('Import 1–32 templates at a time.');
    }
    // Validate the entire batch before scheduling any commit.
    final safe = entries
        .map((v) => MobileTemplateImportEntry(
            slot: _slot(v.slot),
            name: mobileTemplateName(v.name),
            body: mobileTemplateBody(v.body),
            origin: v.origin))
        .toList();
    return _mutate(expectedRevision, (rows, selections) {
      final ids = <String>[];
      final now = DateTime.now().toUtc().toIso8601String();
      for (final e in safe) {
        final id = _newId();
        ids.add(id);
        rows.add(MobileCustomTemplate(
            id: id,
            slot: e.slot,
            name: _uniqueName(e.name, rows),
            body: e.body,
            sha256: mobileTemplateDigest(e.body),
            origin: e.origin,
            createdAt: now,
            updatedAt: now,
            rev: 1));
        if (activate) selections[e.slot] = {'kind': 'custom', 'id': id};
      }
      return ids;
    });
  }

  Future<void> update(
      {required String id,
      required String name,
      required String body,
      String? expectedRevision}) async {
    final safeName = mobileTemplateName(name),
        safeBody = mobileTemplateBody(body);
    await _mutate(expectedRevision, (rows, selections) {
      final i = rows.indexWhere((r) => r.id == id);
      if (i < 0) throw StateError('Custom template not found.');
      final r = rows[i];
      rows[i] = MobileCustomTemplate(
          id: id,
          slot: r.slot,
          name: safeName,
          body: safeBody,
          sha256: mobileTemplateDigest(safeBody),
          origin: r.origin,
          createdAt: r.createdAt,
          updatedAt: DateTime.now().toUtc().toIso8601String(),
          rev: r.rev + 1);
    });
  }

  Future<void> select(String slot,
      {required String id,
      required String source,
      String? expectedRevision}) async {
    _slot(slot);
    if (!['builtin', 'custom'].contains(source)) {
      throw const FormatException('Invalid selection source.');
    }
    await _mutate(expectedRevision, (rows, selections) {
      if (source == 'custom'
          ? !rows.any((r) => r.id == id && r.slot == slot)
          : !_builtins.any((r) => r.id == id && r.slot == slot)) {
        throw StateError('Template not found.');
      }
      selections[slot] = {'kind': source, 'id': id};
    });
  }

  Future<void> reset(String slot, {String? expectedRevision}) async {
    _slot(slot);
    await _mutate(expectedRevision, (_, selections) {
      selections.remove(slot);
    });
  }

  Future<void> remove(String id, {String? expectedRevision}) async {
    await _mutate(expectedRevision, (rows, selections) {
      if (!rows.any((v) => v.id == id)) {
        throw StateError('Custom template not found.');
      }
      rows.removeWhere((v) => v.id == id);
      selections.removeWhere((_, v) => v['kind'] == 'custom' && v['id'] == id);
    });
  }

  String exportCustomJson() {
    if (!loaded || readOnly) {
      throw StateError(error ?? 'Template library has not loaded.');
    }
    return const JsonEncoder.withIndent('  ').convert({
      'schema': 'langbai.prompt-template-export/1',
      'templates': _custom
          .map((v) => {'slot': v.slot, 'name': v.name, 'body': v.body})
          .toList()
    });
  }

  /// Backup uses the exact original bytes, including corrupt bytes for recovery.
  Future<List<int>?> backupRaw() async {
    final f = await file;
    return await f.exists() ? f.readAsBytes() : null;
  }

  void validateBackupRaw(List<int> bytes) {
    _decode(utf8.decode(bytes, allowMalformed: false));
  }

  /// Restore as an atomic merge, never silently overwrite existing records.
  Future<int> restoreRaw(List<int> bytes, {bool merge = true}) async {
    final parsed = _decode(utf8.decode(bytes, allowMalformed: false));
    if (!merge) {
      throw const FormatException(
          'Overwriting the template library is not supported; import a merged copy.');
    }
    return _mutate(null, (rows, selections) {
      final countBefore = rows.length;
      final ids = <String, String>{};
      final now = DateTime.now().toUtc().toIso8601String();
      for (final entry in parsed.$1) {
        // Exact records are reused so repeated restoration is idempotent.
        final matches = rows.where((r) =>
            r.slot == entry.slot &&
            r.sha256 == entry.sha256 &&
            (r.id == entry.id ||
                r.origin['restoredFromId'] == entry.id ||
                r.name == entry.name));
        if (matches.isNotEmpty) {
          ids[entry.id] = matches.first.id;
          continue;
        }
        final id = _newId();
        ids[entry.id] = id;
        rows.add(MobileCustomTemplate(
            id: id,
            slot: entry.slot,
            name: _uniqueName(entry.name, rows),
            body: entry.body,
            sha256: entry.sha256,
            origin: {...entry.origin, 'restoredFromId': entry.id},
            createdAt: now,
            updatedAt: now,
            rev: 1));
      }
      for (final selected in parsed.$2.entries) {
        if (selections.containsKey(selected.key)) continue;
        final old = selected.value;
        selections[selected.key] = old['kind'] == 'custom'
            ? {'kind': 'custom', 'id': ids[old['id']]!}
            : Map<String, String>.from(old);
      }
      return rows.length - countBefore;
    });
  }
}

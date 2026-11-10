import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;

/// A selected value cannot be safely converted into a normal backup. Never
/// substitute null or expose its raw key/value in a user-visible error.
class LegacyBackupValueUnavailable implements Exception {
  const LegacyBackupValueUnavailable(this.scope);
  final String scope;
}

class LegacyBackupSnapshotUnavailable implements Exception {
  const LegacyBackupSnapshotUnavailable();
}

class LegacyBackupPreferences {
  static const _channel = MethodChannel('langbai.novelai/storage');
  static const _list = 'VGhpcyBpcyB0aGUgcHJlZml4IGZvciBhIGxpc3Qu';
  static const _bigInt = 'VGhpcyBpcyB0aGUgcHJlZml4IGZvciBCaWdJbnRlZ2Vy';
  static const _double = 'VGhpcyBpcyB0aGUgcHJlZml4IGZvciBEb3VibGUu';
  static const maxValueBytes = 16 * 1024 * 1024;
  final Directory root;
  final Map<String, (String, String)> _records;
  const LegacyBackupPreferences._(this.root, this._records);

  static Future<LegacyBackupPreferences> open(Directory root) async {
    final index = File(p.join(root.path, 'index.tsv'));
    if (await index.length() > 2 * 1024 * 1024) {
      throw const FormatException('Legacy backup index is too large.');
    }
    final records = <String, (String, String)>{};
    for (final row in const LineSplitter().convert(await index.readAsString())) {
      final fields = row.split('\t');
      if (fields.length != 3 || fields.first.isEmpty ||
          records.containsKey(fields.first) || records.length >= 4096) {
        throw const FormatException('Invalid legacy backup index.');
      }
      records[fields.first] = (fields[1], fields[2]);
    }
    if (records.isEmpty) throw const FormatException('Legacy backup index is empty.');
    return LegacyBackupPreferences._(root, records);
  }

  static Future<T> withNativeSnapshot<T>(
      Future<T> Function(LegacyBackupPreferences) use) async {
    String? path;
    try {
      path = await _channel.invokeMethod<String>('prepareBackupPreferenceSnapshot');
    } on PlatformException catch (error) {
      if (error.code.startsWith('backup_snapshot_')) {
        throw const LegacyBackupSnapshotUnavailable();
      }
      rethrow;
    }
    if (path == null || !RegExp(r'^backup-prefs-[a-f0-9-]{36}$').hasMatch(p.basename(path))) {
      throw const FormatException('Legacy backup snapshot was not created.');
    }
    final root = Directory(path);
    try {
      return await use(await open(root));
    } finally {
      // Only native-created, app-private temporary directories are eligible.
      await _channel.invokeMethod<bool>('discardBackupPreferenceSnapshot', p.basename(path));
    }
  }

  Set<String> getKeys() => _records.keys.toSet();

  static String scopeFor(String key) => switch (key) {
    'app_settings' => 'settings',
    'gen_params' => 'settings',
    'history_index_v2' || 'history_groups' => 'history',
    'reference_preset_library_v1' => 'references',
    'agent_workspace_v1' => 'agent',
    'texttool_convert_history_v1' || 'texttool_reverse_history_v1' => 'text',
    _ when key.startsWith('artist_lab_') || key.startsWith('v5_artist_') => 'artists',
    _ => 'workspace',
  };

  // Inspect the bound size before reading. Workspace export must not aggregate
  // many individually valid values into an unbounded in-memory map.
  int byteCost(String key) {
    final record = _records[key];
    if (record == null) return 0;
    if (record.$1 == 'string') return _stringFile(key, record.$2).lengthSync();
    if (record.$1 == 'oversized' || record.$1 == 'unsupported') {
      throw LegacyBackupValueUnavailable(scopeFor(key));
    }
    return record.$2.length;
  }

  File _stringFile(String key, String name) {
    if (!RegExp(r'^value-[0-9]{1,4}$').hasMatch(name)) {
      throw const FormatException('Invalid temporary preference file.');
    }
    final file = File(p.join(root.path, name));
    if (file.lengthSync() > maxValueBytes) {
      throw LegacyBackupValueUnavailable(scopeFor(key));
    }
    return file;
  }

  Object? get(String key) {
    final record = _records[key];
    if (record == null) return null;
    final (type, value) = record;
    try {
      switch (type) {
        case 'string':
          final text = _stringFile(key, value).readAsStringSync();
          if (text.startsWith('$_list!')) {
            return List<String>.from(jsonDecode(text.substring(_list.length + 1)) as List);
          }
          // Old Java serialized lists are deliberately not deserialized.
          if (text.startsWith(_list)) break;
          if (text.startsWith(_bigInt)) return int.parse(text.substring(_bigInt.length), radix: 36);
          if (text.startsWith(_double)) return double.parse(text.substring(_double.length));
          return text;
        case 'boolean':
          if (value == 'true' || value == 'false') return value == 'true';
          break;
        case 'int':
        case 'long':
          return int.parse(value);
        case 'float':
          return double.parse(value);
      }
    } on FormatException {
      // Do not leak the source value from a parsing exception.
    } on TypeError {
      // Do not silently drop malformed list entries.
    }
    throw LegacyBackupValueUnavailable(scopeFor(key));
  }
}

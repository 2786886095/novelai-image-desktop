import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/nai_models.dart';

/// Local persistence: token + last-used params + history index in
/// SharedPreferences, image files in the app documents dir, and a copy saved to
/// the system gallery. Mirrors electron/ipc/store.ts + storage.ts.
class Storage {
  static const _kToken = 'nai_token';
  static const _kParams = 'gen_params';
  static const _kHistory = 'history_index';

  Future<SharedPreferences> get _prefs => SharedPreferences.getInstance();

  Future<String?> getToken() async => (await _prefs).getString(_kToken);

  Future<void> setToken(String token) async =>
      (await _prefs).setString(_kToken, token);

  Future<void> clearToken() async => (await _prefs).remove(_kToken);

  Future<GenerateParams> getParams() async {
    final raw = (await _prefs).getString(_kParams);
    if (raw == null) return GenerateParams();
    try {
      return GenerateParams.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return GenerateParams();
    }
  }

  Future<void> setParams(GenerateParams p) async =>
      (await _prefs).setString(_kParams, jsonEncode(p.toJson()));

  Future<List<HistoryItem>> getHistory() async {
    final raw = (await _prefs).getString(_kHistory);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list
          .map((e) => HistoryItem.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _writeHistory(List<HistoryItem> items) async {
    final raw = jsonEncode(items.map((e) => e.toJson()).toList());
    await (await _prefs).setString(_kHistory, raw);
  }

  /// Save PNG bytes to the app documents dir, push a copy to the gallery, and
  /// prepend a history entry. Returns the created item.
  Future<HistoryItem> saveImage(Uint8List bytes, GenerateParams p, int seed) async {
    final dir = await getApplicationDocumentsDirectory();
    final imagesDir = Directory('${dir.path}/images');
    if (!imagesDir.existsSync()) imagesDir.createSync(recursive: true);

    final now = DateTime.now();
    final stamp =
        '${now.year}-${_pad(now.month)}-${_pad(now.day)}';
    final id = '${now.millisecondsSinceEpoch}';
    final filePath = '${imagesDir.path}/nai_$id.png';
    await File(filePath).writeAsBytes(bytes, flush: true);

    // NOTE: images are saved to the app documents dir and browsable in the
    // in-app gallery. Exporting a copy to the system Photos app is deferred to a
    // later phase (the gal plugin is incompatible with the current Gradle
    // config; will revisit via a platform channel or a compatible plugin).

    final item = HistoryItem(
      id: id,
      filePath: filePath,
      date: stamp,
      createdAt: now.toIso8601String(),
      seed: seed,
      model: p.model,
      width: p.width,
      height: p.height,
      prompt: p.positivePrompt,
    );

    final history = await getHistory();
    history.insert(0, item);
    await _writeHistory(history);
    return item;
  }

  Future<void> deleteHistory(String id) async {
    final history = await getHistory();
    final item = history.where((e) => e.id == id).firstOrNull;
    if (item != null) {
      try {
        final f = File(item.filePath);
        if (f.existsSync()) f.deleteSync();
      } catch (_) {}
    }
    history.removeWhere((e) => e.id == id);
    await _writeHistory(history);
  }

  String _pad(int n) => n.toString().padLeft(2, '0');
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/nai_models.dart';

class Storage {
  static const _kParams = 'gen_params';
  static const _kHistory = 'history_index_v2';
  static const _kGroups = 'history_groups';
  static const _kSettings = 'app_settings';
  static const _kToken = 'nai_token';
  static const _kVisionKey = 'vision_api_key';
  static const _kConvertKey = 'convert_api_key';
  static const _kTagKey = 'tag_server_key';

  final _secure = const FlutterSecureStorage();
  Future<SharedPreferences> get _prefs => SharedPreferences.getInstance();

  Future<String?> getToken() => _secure.read(key: _kToken);
  Future<void> setToken(String token) => _secure.write(key: _kToken, value: token);
  Future<void> clearToken() => _secure.delete(key: _kToken);

  Future<String?> getVisionKey() => _secure.read(key: _kVisionKey);
  Future<void> setVisionKey(String value) => _secure.write(key: _kVisionKey, value: value);
  Future<String?> getConvertKey() => _secure.read(key: _kConvertKey);
  Future<void> setConvertKey(String value) => _secure.write(key: _kConvertKey, value: value);
  Future<String?> getTagKey() => _secure.read(key: _kTagKey);
  Future<void> setTagKey(String value) => _secure.write(key: _kTagKey, value: value);

  Future<AppSettings> getSettings() async {
    final raw = (await _prefs).getString(_kSettings);
    if (raw == null) return AppSettings();
    try {
      return AppSettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return AppSettings();
    }
  }

  Future<void> setSettings(AppSettings settings) async =>
      (await _prefs).setString(_kSettings, jsonEncode(settings.toJson()));

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
      return list.map((e) => HistoryItem.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> writeHistory(List<HistoryItem> items) async {
    final raw = jsonEncode(items.map((e) => e.toJson()).toList());
    await (await _prefs).setString(_kHistory, raw);
  }

  Future<List<HistoryGroup>> getGroups() async {
    final raw = (await _prefs).getString(_kGroups);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => HistoryGroup.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> writeGroups(List<HistoryGroup> groups) async {
    final raw = jsonEncode(groups.map((e) => e.toJson()).toList());
    await (await _prefs).setString(_kGroups, raw);
  }

  Future<Directory> imagesDir() async {
    final dir = await getApplicationDocumentsDirectory();
    final imagesDir = Directory('${dir.path}/images');
    if (!imagesDir.existsSync()) imagesDir.createSync(recursive: true);
    return imagesDir;
  }

  Future<HistoryItem> saveImage(
    Uint8List bytes,
    GenerateParams p,
    int seed, {
    String feature = 't2i',
    String? model,
    int? width,
    int? height,
    String? groupId,
  }) async {
    final images = await imagesDir();
    final now = DateTime.now();
    final date = '${now.year}-${_pad(now.month)}-${_pad(now.day)}';
    final id = '${now.microsecondsSinceEpoch}';
    final filePath = '${images.path}/$feature-$id.png';
    await File(filePath).writeAsBytes(bytes, flush: true);

    final item = HistoryItem(
      id: id,
      filePath: filePath,
      date: date,
      createdAt: now.toIso8601String(),
      seed: seed,
      model: model ?? p.model,
      width: width ?? p.width,
      height: height ?? p.height,
      prompt: p.positivePrompt,
      feature: feature,
      groupId: groupId,
      params: p.toJson(),
    );

    final history = await getHistory();
    history.insert(0, item);
    await writeHistory(history);
    return item;
  }

  Future<void> deleteHistory(String id) async {
    final history = await getHistory();
    final item = history.where((e) => e.id == id).firstOrNull;
    if (item != null) {
      try {
        final f = File(item.filePath);
        if (f.existsSync()) await f.delete();
      } catch (_) {}
    }
    history.removeWhere((e) => e.id == id);
    await writeHistory(history);
  }

  Future<void> clearAllSecrets() async {
    await _secure.deleteAll();
  }

  String _pad(int n) => n.toString().padLeft(2, '0');
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

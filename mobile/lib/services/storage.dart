import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:gal/gal.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../history/history_archive.dart';
import '../images/png_metadata.dart';
import '../comic/comic_models.dart';
import '../batch/batch_redraw_models.dart';
import '../models/nai_models.dart';

class Storage {
  static const _kParams = 'gen_params';
  static const _kHistory = 'history_index_v2';
  static const _kGroups = 'history_groups';
  static const _kSettings = 'app_settings';
  static const _kComicProject = 'comic_project_v1';
  static const _kBatchRedrawProject = 'batch_redraw_project_v1';
  static const _kNetworkOnboarding = 'network_onboarding_seen';
  static const _kToken = 'nai_token';
  static const _kVisionKey = 'vision_api_key';
  static const _kConvertKey = 'convert_api_key';
  static const _kTagKey = 'tag_server_key';

  final _secure = const FlutterSecureStorage();
  int _saveSequence = 0;
  Future<SharedPreferences> get _prefs => SharedPreferences.getInstance();

  Future<String?> getToken() => _secure.read(key: _kToken);
  Future<void> setToken(String token) =>
      _secure.write(key: _kToken, value: token);
  Future<void> clearToken() => _secure.delete(key: _kToken);

  Future<String?> getVisionKey() => _secure.read(key: _kVisionKey);
  Future<void> setVisionKey(String value) =>
      _secure.write(key: _kVisionKey, value: value);
  Future<String?> getConvertKey() => _secure.read(key: _kConvertKey);
  Future<void> setConvertKey(String value) =>
      _secure.write(key: _kConvertKey, value: value);
  Future<String?> getTagKey() => _secure.read(key: _kTagKey);
  Future<void> setTagKey(String value) =>
      _secure.write(key: _kTagKey, value: value);
  Future<String?> getBaiduSecret() => _secure.read(key: 'baidu_secret');
  Future<void> setBaiduSecret(String value) =>
      _secure.write(key: 'baidu_secret', value: value);

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

  Future<bool> hasSeenNetworkOnboarding() async =>
      (await _prefs).getBool(_kNetworkOnboarding) ?? false;

  Future<void> markNetworkOnboardingSeen() async =>
      (await _prefs).setBool(_kNetworkOnboarding, true);

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

  Future<ComicProject> getComicProject(GenerateParams fallbackParams) async {
    final raw = (await _prefs).getString(_kComicProject);
    if (raw == null) return ComicProject.empty(fallbackParams);
    try {
      return ComicProject.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
        fallbackParams,
        trustOutputs: true,
      );
    } catch (_) {
      return ComicProject.empty(fallbackParams);
    }
  }

  Future<void> setComicProject(ComicProject project) async =>
      (await _prefs).setString(_kComicProject, jsonEncode(project.toJson()));

  Future<BatchRedrawProject> getBatchRedrawProject(
      GenerateParams fallbackParams) async {
    final raw = (await _prefs).getString(_kBatchRedrawProject);
    if (raw == null) return BatchRedrawProject.empty(fallbackParams);
    try {
      return BatchRedrawProject.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
        fallbackParams,
        trustOutputs: true,
      );
    } catch (_) {
      return BatchRedrawProject.empty(fallbackParams);
    }
  }

  Future<void> setBatchRedrawProject(BatchRedrawProject project) async =>
      (await _prefs)
          .setString(_kBatchRedrawProject, jsonEncode(project.toJson()));

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

  Future<void> writeHistory(List<HistoryItem> items) async {
    final raw = jsonEncode(items.map((e) => e.toJson()).toList());
    await (await _prefs).setString(_kHistory, raw);
  }

  Future<List<HistoryGroup>> getGroups() async {
    final raw = (await _prefs).getString(_kGroups);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list
          .map((e) => HistoryGroup.fromJson(e as Map<String, dynamic>))
          .toList();
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
    final settings = await getSettings();
    final sequence = ++_saveSequence;
    final baseName = _renderImageName(
      settings.imageNameTemplate,
      p,
      now,
      date,
      sequence,
      seed,
      model ?? p.model,
      feature,
    );
    final filePath = await _uniqueFilePath(images, baseName, 'png');
    final output = settings.keepImageMetadata ? bytes : stripPngMetadata(bytes);
    await File(filePath).writeAsBytes(output, flush: true);
    if (settings.saveToGallery) {
      try {
        await Gal.putImage(filePath, album: 'Langbai NovelAI Studio');
      } catch (_) {
        // The app-private original and history entry remain available even when
        // gallery permission is denied or a device gallery is unavailable.
      }
    }

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

  Future<HistoryItem> renameHistoryFile(
    HistoryItem item,
    String requestedName,
  ) async {
    final source = File(item.filePath);
    if (!source.existsSync()) throw StateError('本地图片不存在，无法重命名');

    final sourceName = source.uri.pathSegments.last;
    final dot = sourceName.lastIndexOf('.');
    final extension = dot >= 0 ? sourceName.substring(dot) : '.png';
    final stem = safeFileStem(requestedName);
    final directory = source.parent;
    var target = File('${directory.path}/$stem$extension');
    var suffix = 2;
    while (target.path.toLowerCase() != source.path.toLowerCase() &&
        target.existsSync()) {
      target = File('${directory.path}/$stem-$suffix$extension');
      suffix++;
    }

    final renamed = target.path.toLowerCase() == source.path.toLowerCase()
        ? source
        : await source.rename(target.path);
    return HistoryItem.fromJson({...item.toJson(), 'filePath': renamed.path});
  }

  Future<String> exportHistoryZip(
    List<HistoryItem> items,
    List<HistoryGroup> groups, {
    String archiveName = 'Langbai-NovelAI-Studio',
  }) async {
    if (items.isEmpty) throw StateError('当前筛选没有可导出的图片');
    final bytes = await buildHistoryArchive(
      items,
      groups,
      (path) => File(path).readAsBytes(),
    );
    final temp = await getTemporaryDirectory();
    final stamp = DateTime.now().millisecondsSinceEpoch;
    final file = File('${temp.path}/${safeFileStem(archiveName)}-$stamp.zip');
    await file.writeAsBytes(bytes, flush: true);
    return file.path;
  }

  Future<void> clearAllSecrets() async {
    await _secure.deleteAll();
  }

  String _pad(int n) => n.toString().padLeft(2, '0');

  String _safeFilePrefix(String value) {
    final sanitized = value
        .trim()
        .replaceAll(RegExp(r'[<>:"/\\|?*\x00-\x1f]'), '_')
        .replaceAll(RegExp(r'\s+'), ' ')
        .replaceAll(RegExp(r'[. ]+$'), '');
    if (sanitized.length <= 80) return sanitized;
    return sanitized.substring(0, 80).trimRight();
  }

  String _renderImageName(
    String template,
    GenerateParams params,
    DateTime now,
    String date,
    int sequence,
    int seed,
    String model,
    String feature,
  ) {
    final time = '${_pad(now.hour)}${_pad(now.minute)}${_pad(now.second)}';
    final custom = _safeFilePrefix(params.fileNamePrefix);
    final tokens = <String, String>{
      'date': date,
      'time': time,
      'seq': sequence.toString().padLeft(2, '0'),
      'seed': '$seed',
      'model': _safeFilePrefix(model),
      'type': _safeFilePrefix(feature),
      'name': custom,
      'ts': '${now.millisecondsSinceEpoch}',
    };
    final pattern =
        template.trim().isEmpty ? '{date}_{seq}_{model}' : template.trim();
    var name = pattern.replaceAllMapped(
      RegExp(r'\{(\w+)\}'),
      (match) => tokens[match.group(1)] ?? '',
    );
    if (custom.isNotEmpty && !pattern.contains('{name}')) {
      name = '${custom}_$name';
    }
    name = _safeFilePrefix(name.replaceAll(' ', '_'));
    return name.isEmpty ? '${now.millisecondsSinceEpoch}-$sequence' : name;
  }

  Future<String> _uniqueFilePath(
    Directory directory,
    String baseName,
    String extension,
  ) async {
    var path = '${directory.path}/$baseName.$extension';
    var suffix = 1;
    while (await File(path).exists()) {
      path = '${directory.path}/$baseName-${suffix++}.$extension';
    }
    return path;
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

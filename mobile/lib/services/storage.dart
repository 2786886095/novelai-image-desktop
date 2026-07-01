import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:gal/gal.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../batch/batch_redraw_models.dart';
import '../comic/comic_models.dart';
import '../history/history_archive.dart';
import '../i18n/runtime_text.dart';
import '../images/png_metadata.dart';
import '../models/nai_models.dart';
import '../prompts/prompt_mode.dart';

// Run history JSON (de)serialisation on a background isolate once the payload is
// large, so a big library never janks the UI thread at boot or on a save. Small
// payloads stay inline — spawning an isolate isn't worth it.
const int _kIsolateJsonThreshold = 64 * 1024;
List<dynamic> _decodeJsonList(String raw) => jsonDecode(raw) as List<dynamic>;
String _encodeJsonList(List<dynamic> data) => jsonEncode(data);

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
  static const _kConvertHistory = 'texttool_convert_history_v1';
  static const _kReverseHistory = 'texttool_reverse_history_v1';

  final _secure = const FlutterSecureStorage();
  int _saveSequence = 0;
  // In-memory mirror of the history index. saveImage/deleteHistory previously
  // re-decoded the whole list from prefs on every call (and re-encoded it),
  // which is O(N) per save → O(M·N) during a batch. The cache keeps reads free;
  // only writeHistory touches disk. All persists go through writeHistory, so the
  // cache never drifts.
  List<HistoryItem>? _historyCache;
  List<TextToolHistoryItem>? _convertHistoryCache;
  List<TextToolHistoryItem>? _reverseHistoryCache;
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
    if (_historyCache != null) return List.of(_historyCache!);
    final raw = (await _prefs).getString(_kHistory);
    if (raw == null) {
      _historyCache = [];
      return [];
    }
    try {
      // Parse off the UI isolate for large libraries so boot doesn't jank.
      final list = raw.length > _kIsolateJsonThreshold
          ? await compute(_decodeJsonList, raw)
          : _decodeJsonList(raw);
      final items = list
          .map((e) => HistoryItem.fromJson(e as Map<String, dynamic>))
          .toList();
      _historyCache = items;
      return List.of(items);
    } catch (_) {
      _historyCache = [];
      return [];
    }
  }

  Future<void> writeHistory(List<HistoryItem> items) async {
    _historyCache = List.of(items);
    final data = items.map((e) => e.toJson()).toList();
    // Encode off the UI isolate when the list is large enough to matter.
    final raw = items.length > 200
        ? await compute(_encodeJsonList, data)
        : _encodeJsonList(data);
    await (await _prefs).setString(_kHistory, raw);
  }

  Future<List<TextToolHistoryItem>> getConvertHistory() =>
      _getTextToolHistory(_kConvertHistory, () => _convertHistoryCache,
          (v) => _convertHistoryCache = v);

  Future<void> setConvertHistory(List<TextToolHistoryItem> items) =>
      _setTextToolHistory(_kConvertHistory, items, (v) => _convertHistoryCache = v);

  Future<List<TextToolHistoryItem>> getReverseHistory() =>
      _getTextToolHistory(_kReverseHistory, () => _reverseHistoryCache,
          (v) => _reverseHistoryCache = v);

  Future<void> setReverseHistory(List<TextToolHistoryItem> items) =>
      _setTextToolHistory(_kReverseHistory, items, (v) => _reverseHistoryCache = v);

  Future<List<TextToolHistoryItem>> _getTextToolHistory(
    String key,
    List<TextToolHistoryItem>? Function() readCache,
    void Function(List<TextToolHistoryItem>) writeCache,
  ) async {
    final cached = readCache();
    if (cached != null) return List.of(cached);
    final raw = (await _prefs).getString(key);
    if (raw == null) {
      writeCache([]);
      return [];
    }
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      final items = list
          .map((e) => TextToolHistoryItem.fromJson(e as Map<String, dynamic>))
          .toList();
      writeCache(items);
      return List.of(items);
    } catch (_) {
      writeCache([]);
      return [];
    }
  }

  Future<void> _setTextToolHistory(
    String key,
    List<TextToolHistoryItem> items,
    void Function(List<TextToolHistoryItem>) writeCache,
  ) async {
    writeCache(List.of(items));
    final data = items.map((e) => e.toJson()).toList();
    await (await _prefs).setString(key, jsonEncode(data));
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

  // Filesystem-safe folder name for a history group (mirrors the desktop
  // sanitizeGroupFolderName). Falls back to a stable label when empty.
  static String sanitizeFolderName(String name) {
    final cleaned = name
        .trim()
        .replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1f]'), '_')
        .replaceAll(RegExp(r'\.+$'), '')
        .trim();
    return cleaned.isEmpty ? 'Untitled group' : cleaned;
  }

  // Resolve where a generated image is written: <base>/<date>/<group>/, where
  // base is the user's custom path (if set and writable) or app documents.
  // Mirrors the desktop layout (outputDir/<date>/<folderName>). Falls through to
  // the next base when a target can't be created (e.g. a custom path that is no
  // longer accessible on Android 11+), so a save can never fail outright.
  Future<Directory> _imageSaveDir(
    AppSettings settings,
    String date,
    String? groupId,
  ) async {
    String? groupFolder;
    if (groupId != null && groupId.isNotEmpty) {
      final groups = await getGroups();
      final group = groups.where((g) => g.id == groupId).firstOrNull;
      if (group != null && group.name.trim().isNotEmpty) {
        groupFolder = sanitizeFolderName(group.name);
      }
    }
    final defaultBase = (await imagesDir()).path;
    final custom = settings.imageOutputDir.trim();
    for (final base in <String>[if (custom.isNotEmpty) custom, defaultBase]) {
      final dir = Directory(
        [base, date, if (groupFolder != null) groupFolder].join('/'),
      );
      try {
        if (!dir.existsSync()) dir.createSync(recursive: true);
        return dir;
      } catch (_) {
        // Try the next base (a custom path may be unwritable without all-files
        // access on Android 11+).
      }
    }
    final fallback = Directory(defaultBase);
    if (!fallback.existsSync()) fallback.createSync(recursive: true);
    return fallback;
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
    // Save into <base>/<date>/<group>/ (custom path or app documents).
    final images = await _imageSaveDir(settings, date, groupId);
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
    if (!source.existsSync()) {
      throw StateError('Local image does not exist and cannot be renamed');
    }

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
    Object? language,
  }) async {
    if (items.isEmpty) {
      throw StateError(runtimeTextFor(language, 'history.noExportImages'));
    }
    final bytes = await buildHistoryArchive(
      items,
      groups,
      (path) => File(path).readAsBytes(),
      language,
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

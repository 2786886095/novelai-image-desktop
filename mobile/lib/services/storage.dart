import 'works_batch.dart';
import 'openai_image_edit.dart';
import 'unified_storage.dart';
import 'openai_images.dart';
import 'compatible_image_backup.dart';
import 'dart:convert';
import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:archive/archive.dart';
import 'package:gal/gal.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path_util;

import '../agent/agent_models.dart';
import '../batch/batch_redraw_models.dart';
import '../comic/comic_models.dart';
import '../history/history_archive.dart';
import '../i18n/runtime_text.dart';
import '../images/png_metadata.dart';
import '../models/nai_models.dart';
import '../prompts/prompt_mode.dart';
import '../references/reference_presets.dart';

// Run history JSON (de)serialisation on a background isolate once the payload is
// large, so a big library never janks the UI thread at boot or on a save. Small
// payloads stay inline — spawning an isolate isn't worth it.
const int _kIsolateJsonThreshold = 64 * 1024;
List<dynamic> _decodeJsonList(String raw) => jsonDecode(raw) as List<dynamic>;
String _encodeJsonList(List<dynamic> data) => jsonEncode(data);

class SavedImageHistoryException implements Exception {
  final HistoryItem item;
  SavedImageHistoryException(this.item);
  @override
  String toString() => 'Image saved but history could not be persisted';
}

class Storage {
  // All instances share one settings transaction queue. Secure-key writes and
  // preference commits cannot interleave with UI, Agent or backup writes.
  static Future<void>? _historyTail;
  static final Object _historyZone=Object();
  Future<T> historyTransaction<T>(Future<T> Function() work) {
    if(Zone.current[_historyZone]==true)return work();
    final previous=_historyTail,done=Completer<void>();_historyTail=done.future;
    return (() async {if(previous!=null)await previous;try{return await runZoned(work,zoneValues:{_historyZone:true});}
      finally {if(identical(_historyTail,done.future))_historyTail=null;done.complete();}})();
  }
  Future<List<HistoryItem>> mutateHistory(List<HistoryItem> Function(List<HistoryItem>) change) => historyTransaction(() async {
    final next=change(List.of(await getHistory()));await writeHistory(next);return next;
  });
  Future<WorksBatchFiles> worksFiles() async {
    final settings=await getSettings();return WorksBatchFiles([await imagesDir(),
      if(settings.imageOutputDir.trim().isNotEmpty)Directory(settings.imageOutputDir.trim())]);
  }
  Future<List<HistoryItem>> moveHistoryItems(Set<String> ids,String? group) => historyTransaction(() async {
    if(group!=null && group.isNotEmpty && !(await getGroups()).any((g)=>g.id==group))throw StateError('Group no longer exists');
    return mutateHistory((rows)=>rows.map((h)=>ids.contains(h.id)?HistoryItem.fromJson({...h.toJson(),'groupId':group}):h).toList());
  });
  Future<WorksBatchResult> deleteHistoryItems(Set<String> ids) => historyTransaction(() async {
    final rows=await getHistory();final result=await (await worksFiles()).delete(rows,ids);
    await writeHistory(rows.where((h)=>!result.removedIds.contains(h.id)).toList());return result;
  });
  Future<Set<String>> reconcileMissingHistory() => historyTransaction(() async {
    final files=await worksFiles(),rows=await getHistory(),ids=<String>{};
    for(final h in rows){if(await files.conclusivelyMissing(h.filePath))ids.add(h.id);}
    if(ids.isNotEmpty)await writeHistory(rows.where((h)=>!ids.contains(h.id)).toList());return ids;
  });

  static Future<void>? _settingsTail;
  static final Object _settingsZone = Object(), _imageCommitZone = Object();
  Future<T> _settingsTransaction<T>(Future<T> Function() work) {
    if (Zone.current[_settingsZone] == true) return work();
    final previous = _settingsTail, done = Completer<void>();
    _settingsTail = done.future;
    return (() async {
      if (previous != null) await previous;
      try {
        return await runZoned(work, zoneValues: {_settingsZone: true});
      } finally {
        if (identical(_settingsTail, done.future)) _settingsTail = null;
        done.complete();
      }
    })();
  }

  void resetDataCaches() {
    _historyCache = null;
    _convertHistoryCache = null;
    _reverseHistoryCache = null;
  }

  static const _kParams = 'gen_params';
  static const _kHistory = 'history_index_v2';
  static const _kGroups = 'history_groups';
  static const _kSettings = 'app_settings';
  static const _kComicProject = 'comic_project_v2';
  static const _kBatchRedrawProject = 'batch_redraw_project_v1';
  static const _kNetworkOnboarding = 'network_onboarding_seen';
  static const _kToken = 'nai_token';
  static const _kVisionKey = 'vision_api_key';
  static const _kConvertKey = 'convert_api_key';
  static const _kTagKey = 'tag_server_key';
  static const _kAgentApiKey = 'agent_api_key';
  static const _kAgentWorkspace = 'agent_workspace_v1';
  static const _kAgentAlwaysAllowedTools = 'agent_always_allowed_tools_v1';
  static const _kConvertHistory = 'texttool_convert_history_v1';
  static const _kReverseHistory = 'texttool_reverse_history_v1';
  static const _kAitagCompatibleParams = 'aitag_compatible_params_v1';
  static const _kReferencePresetLibrary = 'reference_preset_library_v1';

  final _secure = const FlutterSecureStorage();
  int _saveSequence = 0;
  // In-memory mirror of the history index. saveImage/deleteHistory previously
  // re-decoded the whole list from prefs on every call (and re-encoded it),
  // which is O(N) per save → O(M·N) during a batch. The cache keeps reads free;
  // only writeHistory touches disk. All persists go through writeHistory, so the
  // cache never drifts.
  static int _historyRevision = 0;
  int _cacheRevision = -1;
  List<HistoryItem>? _historyCache;
  List<TextToolHistoryItem>? _convertHistoryCache;
  List<TextToolHistoryItem>? _reverseHistoryCache;
  ({File file, String name})? _metadataInspectorSession;
  Future<UnifiedPreferences> get _prefs => UnifiedStorage.preferences();

  /// Sensitive backup hooks. Plain legacy Storage does not silently import a vault.
  Future<Map<String, dynamic>?> exportNovelAiAccountsBackup() async => null;
  Future<Future<void> Function()> prepareNovelAiAccountsRestore(
      Object? value) async {
    throw const FormatException(
        'NovelAI account storage is required to restore this backup');
  }

  Future<String?> getToken() => _secure.read(key: _kToken);
  Future<void> setToken(String token) =>
      _secure.write(key: _kToken, value: token);
  Future<void> clearToken() => _secure.delete(key: _kToken);

  // Versioned secrets bind an immutable credential to one configuration snapshot.
  // Older snapshots can finish while a newer endpoint/key is being saved.
  Future<String?> getCompatibleImageKey(String id) async {
    if (!RegExp(r'^[0-9]+-[a-z0-9]+$').hasMatch(id)) return null;
    return _secure.read(key: 'compatible_image_key_$id');
  }

  Future<void> saveCompatibleConfiguration(AppSettings next, String apiKey,
      {String? expectedCredentialId}) {
    final requested = AppSettings.fromJson(
        jsonDecode(jsonEncode(next.toJson())) as Map<String, dynamic>);
    return _settingsTransaction(() async {
      final c = requested.compatibleImage;
      final config = CompatibleImageConfig(
          baseUrl: c['baseUrl'] as String,
          model: c['model'] as String,
          apiKey: apiKey,
          responseFormat: c['responseFormat'] as String? ?? 'auto');
      compatibleImageEndpoint(config.baseUrl);
      compatibleImageBody(config,
          prompt: 'configuration validation',
          size: c['size'] as String,
          n: 1,
          extensions: Map<String, Object?>.from(c['extensions'] as Map? ?? {}));
      if (apiKey.trim().isEmpty ||
          RegExp(r'[\r\n\x00]').hasMatch(apiKey) ||
          apiKey.length > 8192) {
        throw const FormatException('Invalid image key');
      }
      final before = await readCompatibleApiState();
      if (expectedCredentialId != null &&
          before['binding'] != expectedCredentialId) {
        throw StateError('图片服务配置已变化，请重新读取后保存');
      }
      final saved = await writeCompatibleApiState(
          before,
          {
            'enabled': requested.imageProvider == 'openai-images',
            'baseUrl': config.baseUrl.trim(),
            'model': config.model.trim(),
            'size': c['size'],
            'responseFormat': config.responseFormat,
            'extensions':
                Map<String, Object?>.from(c['extensions'] as Map? ?? {})
          },
          apiKey.trim());
      next.compatibleImage = saved.compatibleImage;
      next.imageProvider = saved.imageProvider;
    });
  }

  Future<Map<String, dynamic>> readCompatibleApiState() =>
      _settingsTransaction(() async {
        final settings = await getSettings(), c = settings.compatibleImage;
        final id = c['credentialId'] as String? ?? '';
        return {
          'config': {
            'enabled': settings.imageProvider == 'openai-images',
            'baseUrl': c['baseUrl'] ?? '',
            'model': c['model'] ?? '',
            'size': c['size'] ?? '1024x1024',
            'responseFormat': c['responseFormat'] ?? 'auto',
            'extensions':
                jsonDecode(jsonEncode(c['extensions'] ?? <String, dynamic>{}))
          },
          'secret': await getCompatibleImageKey(id) ?? '',
          'binding': id
        };
      });

  Future<AppSettings> writeCompatibleApiState(Map<String, dynamic> before,
          Map<String, dynamic> config, String secret) =>
      _writeCompatibleApiState(before, config, secret);

  /// Backup overwrite is explicit and restores a cleared-key state without enabling generation.
  Future<void> restoreCompatibleImageBackup(AppSettings next,
      Map<String, dynamic> api, Map<String, dynamic> before) async {
    final profile = readImageSettingsBackup(api);
    if (profile == null) {
      throw const FormatException('Missing image backup profile');
    }
    final config = Map<String, dynamic>.from(profile['compatibleImage'] as Map)
      ..['enabled'] = profile['imageProvider'] == 'openai-images';
    final saved = await _writeCompatibleApiState(
        before, config, profile['imageApiKey'] as String,
        restoredSettings: next);
    next.compatibleImage = saved.compatibleImage;
    next.imageProvider = saved.imageProvider;
  }

  Future<AppSettings> _writeCompatibleApiState(
      Map<String, dynamic> before, Map<String, dynamic> config, String secret,
      {AppSettings? restoredSettings}) {
    // Freeze caller-owned maps before queuing: later UI edits cannot mutate the transaction.
    final restored = restoredSettings == null
        ? null
        : AppSettings.fromJson(jsonDecode(jsonEncode(restoredSettings.toJson()))
            as Map<String, dynamic>);
    final expected = jsonEncode(before);
    final desired =
        Map<String, dynamic>.from(jsonDecode(jsonEncode(config)) as Map);
    return _settingsTransaction(() async {
      final current = await readCompatibleApiState();
      if (jsonEncode(current) != expected) throw StateError('图片服务配置已变化，请重新读取');
      if (secret.length > 8192 || RegExp(r'[\r\n\x00]').hasMatch(secret)) {
        throw StateError('图片密钥格式无效');
      }
      final enabled = desired['enabled'] == true;
      final unchanged = desired.keys.where((k) => k != 'enabled').every(
          (k) => jsonEncode(desired[k]) == jsonEncode(current['config'][k]));
      if (restored == null &&
          (!unchanged || enabled && current['config']['enabled'] != true)) {
        final c = CompatibleImageConfig(
            baseUrl: desired['baseUrl'] as String,
            model: desired['model'] as String,
            apiKey: secret,
            responseFormat: desired['responseFormat'] as String);
        compatibleImageEndpoint(c.baseUrl);
        compatibleImageBody(c,
            prompt: 'configuration validation',
            size: desired['size'] as String,
            n: 1,
            extensions:
                Map<String, Object?>.from(desired['extensions'] as Map));
      }
      if (restored == null &&
          enabled &&
          current['config']['enabled'] != true &&
          secret.trim().isEmpty) throw StateError('请先通过私密输入保存独立图片密钥');
      final latest = await getSettings();
      final next = AppSettings.fromJson((restored ?? latest).toJson())
        ..imageProvider = enabled ? 'openai-images' : 'novelai';
      final id =
          '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32).toRadixString(36)}';
      // Whitelist projection: keys are never copied into preferences or ordinary backups.
      next.compatibleImage = {
        for (final k in [
          'baseUrl',
          'model',
          'size',
          'responseFormat',
          'extensions'
        ])
          k: desired[k],
        'credentialId': id
      };
      if (secret.isNotEmpty) {
        await _secure.write(key: 'compatible_image_key_$id', value: secret);
      }
      try {
        await runZoned(() => setSettings(next),
            zoneValues: {_imageCommitZone: true});
      } catch (_) {
        // A platform write can report an error after updating its pointer. Do not
        // delete the key still referenced by that pointer (or an unreadable one).
        try {
          if ((await getSettings()).compatibleImage['credentialId'] != id) {
            await _secure.delete(key: 'compatible_image_key_$id');
          }
        } catch (_) {
          /* Keep the version when persistence outcome is uncertain. */
        }
        rethrow;
      }
      // Explicit credential clearing also removes obsolete versions. Requests
      // that already read a key own that snapshot; no request is redirected.
      if (secret.isEmpty) {
        final keys = await _secure.readAll();
        for (final name in keys.keys
            .where((k) =>
                RegExp(r'^compatible_image_key_[0-9]+-[a-z0-9]+$').hasMatch(k))
            .toList()) {
          await _secure.delete(key: name);
        }
      }
      return next;
    });
  }

  Future<String?> getOpenAIEditKey(String id) => id.isEmpty ? Future.value(null)
      : _secure.read(key: 'openai_edit_key_$id');

  Future<Map<String,dynamic>> saveOpenAIEditConfiguration(Map<String,dynamic> config,
      String secret, {required String expectedId}) => _settingsTransaction(() async {
    final current=await getSettings();
    if((current.openAIEdit['credentialId'] ?? '')!=expectedId) throw StateError('Edit configuration changed');
    imageEditEndpoint(OpenAIEditConfig.fromJson(config).baseUrl);
    if(secret.trim().isEmpty || secret.length>8192 || RegExp(r'[\r\n\x00]').hasMatch(secret)) throw const FormatException('Invalid edit key');
    final id='${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1<<32)}';
    final next={...OpenAIEditConfig.fromJson(config).toJson(),'credentialId':id};
    await _secure.write(key:'openai_edit_key_$id',value:secret.trim());
    try {
      current.openAIEdit=next;
      if(!await (await _prefs).setString(_kSettings,jsonEncode(current.toJson()))) throw StateError('Edit settings not saved');
    } catch (_) {await _secure.delete(key:'openai_edit_key_$id');rethrow;}
    // A failed cleanup cannot turn a successfully committed configuration into a retry.
    if(expectedId.isNotEmpty) {try {await _secure.delete(key:'openai_edit_key_$expectedId');} catch (_) {}}
    return next;
  });

  Future<String?> getVisionKey() => _secure.read(key: _kVisionKey);
  Future<void> setVisionKey(String value) =>
      _secure.write(key: _kVisionKey, value: value);
  Future<String?> getConvertKey() => _secure.read(key: _kConvertKey);
  Future<void> setConvertKey(String value) =>
      _secure.write(key: _kConvertKey, value: value);
  Future<String?> getTagKey() => _secure.read(key: _kTagKey);
  Future<void> setTagKey(String value) =>
      _secure.write(key: _kTagKey, value: value);
  Future<String?> getAgentApiKey() => _secure.read(key: _kAgentApiKey);
  Future<void> setAgentApiKey(String value) => value.trim().isEmpty
      ? _secure.delete(key: _kAgentApiKey)
      : _secure.write(key: _kAgentApiKey, value: value.trim());
  Future<String?> getBaiduSecret() => _secure.read(key: 'baidu_secret');
  Future<void> setBaiduSecret(String value) =>
      _secure.write(key: 'baidu_secret', value: value);

  Future<AppSettings> getSettings() async {
    final raw = (await _prefs).getString(_kSettings);
    if (raw == null) return AppSettings();
    try {
      return AppSettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      if (UnifiedStorage.active != null) rethrow;
      return AppSettings();
    }
  }

  Future<void> setSettings(AppSettings settings) {
    final snapshot = AppSettings.fromJson(
        jsonDecode(jsonEncode(settings.toJson())) as Map<String, dynamic>);
    final imageCommit = Zone.current[_imageCommitZone] == true;
    return _settingsTransaction(() async {
      final current = await getSettings();
      // An unrelated settings save queued with an old image revision must not
      // resurrect an old key/endpoint or undo an Agent provider change.
      if (!imageCommit &&
          (current.compatibleImage['credentialId'] as String? ?? '')
              .isNotEmpty &&
          current.compatibleImage['credentialId'] !=
              snapshot.compatibleImage['credentialId']) {
        snapshot.compatibleImage = current.compatibleImage;
        snapshot.imageProvider = current.imageProvider;
      }
      if (current.openAIEdit['credentialId'] != snapshot.openAIEdit['credentialId']) {
        snapshot.openAIEdit=current.openAIEdit;
      }
      if (!await (await _prefs)
          .setString(_kSettings, jsonEncode(snapshot.toJson()))) {
        throw StateError('Settings could not be saved.');
      }
      settings.compatibleImage = snapshot.compatibleImage;
      settings.imageProvider = snapshot.imageProvider;
      settings.openAIEdit = snapshot.openAIEdit;
    });
  }

  Future<AgentWorkspace> getAgentWorkspace() async {
    final raw = (await _prefs).getString(_kAgentWorkspace);
    if (raw == null || raw.trim().isEmpty) return AgentWorkspace();
    try {
      return AgentWorkspace.fromJson(
        Map<String, dynamic>.from(jsonDecode(raw) as Map),
      );
    } catch (_) {
      if (UnifiedStorage.active != null) rethrow;
      return AgentWorkspace();
    }
  }

  Future<AgentWorkspace> getAgentWorkspaceStrict() async {
    final raw = (await _prefs).getString(_kAgentWorkspace);
    if (raw == null || raw.trim().isEmpty) return AgentWorkspace();
    try {
      return AgentWorkspace.fromJson(
          Map<String, dynamic>.from(jsonDecode(raw) as Map));
    } catch (_) {
      throw StateError('本机酒馆资料格式错误，请在软件内检查备份；未用空资料替代。');
    }
  }

  Future<void> setAgentWorkspace(AgentWorkspace workspace) async {
    workspace.updatedAt = agentNow();
    final saved = await (await _prefs)
        .setString(_kAgentWorkspace, jsonEncode(workspace.toJson()));
    if (!saved) throw StateError('Agent workspace could not be saved.');
  }

  Future<Set<String>> getAgentAlwaysAllowedTools() async =>
      ((await _prefs).getStringList(_kAgentAlwaysAllowedTools) ?? const [])
          .where((item) => item.trim().isNotEmpty)
          .toSet();

  Future<void> setAgentAlwaysAllowedTools(Set<String> tools) async =>
      (await _prefs).setStringList(
        _kAgentAlwaysAllowedTools,
        tools.toList()..sort(),
      );

  Future<Directory> agentWorkspaceDirectory() async {
    final documents = await UnifiedStorage.documents();
    final directory = Directory(
      '${documents.path}${Platform.pathSeparator}LangbaiWorkspace',
    );
    if (!directory.existsSync()) directory.createSync(recursive: true);
    return directory;
  }

  Future<Directory> agentAttachmentsDirectory([String? conversationId]) async {
    final root = await agentWorkspaceDirectory();
    final directory = Directory([
      root.path,
      'attachments',
      if (conversationId != null && conversationId.trim().isNotEmpty)
        conversationId.trim(),
    ].join(Platform.pathSeparator));
    if (!directory.existsSync()) directory.createSync(recursive: true);
    return directory;
  }

  Future<({File file, String name})> saveMetadataInspectorImage(
    Uint8List bytes,
    String originalName,
  ) async {
    // Metadata inspection is deliberately session-scoped. Keep a temporary
    // copy so switching pages preserves the current report, but never write a
    // path/name into SharedPreferences (a full app restart must reset it).
    final root = await getTemporaryDirectory();
    final directory =
        Directory('${root.path}${Platform.pathSeparator}metadata-inspector');
    if (!directory.existsSync()) directory.createSync(recursive: true);
    final extensionMatch =
        RegExp(r'\.([a-zA-Z0-9]{2,5})$').firstMatch(originalName);
    final extension = (extensionMatch?.group(1) ?? 'png').toLowerCase();
    final safeExtension =
        const {'png', 'jpg', 'jpeg', 'webp'}.contains(extension)
            ? extension
            : 'png';
    final file = File(
        '${directory.path}${Platform.pathSeparator}last-image.$safeExtension');
    for (final entity in directory.listSync()) {
      if (entity is File && entity.path != file.path) {
        try {
          entity.deleteSync();
        } catch (_) {}
      }
    }
    await file.writeAsBytes(bytes, flush: true);
    final snapshot = (file: file, name: originalName);
    _metadataInspectorSession = snapshot;
    return snapshot;
  }

  Future<({File file, String name})?> getMetadataInspectorImage() async {
    final snapshot = _metadataInspectorSession;
    if (snapshot == null) return null;
    final file = snapshot.file;
    if (!file.existsSync()) {
      _metadataInspectorSession = null;
      return null;
    }
    return snapshot;
  }

  Future<Directory> _stylePromptPreviewRoot() async {
    final root = await UnifiedStorage.documents();
    final directory =
        Directory('${root.path}${Platform.pathSeparator}style-prompt-previews');
    if (!directory.existsSync()) directory.createSync(recursive: true);
    return directory;
  }

  String _safeStylePresetId(String value) {
    final safe = value.trim().replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    return safe.isEmpty ? 'style' : safe.substring(0, min(96, safe.length));
  }

  Future<StylePromptPreviewImage?> copyStylePromptPreviewImage({
    required String presetId,
    required String sourcePath,
    required String sourceName,
  }) async {
    final source = File(sourcePath);
    if (!source.existsSync()) return null;
    final lower = sourceName.toLowerCase();
    final extension = lower.endsWith('.jpeg')
        ? '.jpeg'
        : lower.endsWith('.jpg')
            ? '.jpg'
            : lower.endsWith('.webp')
                ? '.webp'
                : lower.endsWith('.png')
                    ? '.png'
                    : '';
    if (extension.isEmpty) return null;
    final root = await _stylePromptPreviewRoot();
    final directory = Directory(
        '${root.path}${Platform.pathSeparator}${_safeStylePresetId(presetId)}');
    if (!directory.existsSync()) directory.createSync(recursive: true);
    final id =
        '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 20)}';
    final destination =
        File('${directory.path}${Platform.pathSeparator}$id$extension');
    await source.copy(destination.path);
    return StylePromptPreviewImage(
      id: id,
      name: sourceName,
      filePath: destination.path,
      createdAt: DateTime.now().toIso8601String(),
    );
  }

  Future<void> deleteStylePromptPreviewImage(
      String presetId, StylePromptPreviewImage image) async {
    final root = (await _stylePromptPreviewRoot()).absolute.path;
    final presetRoot = Directory(
            '$root${Platform.pathSeparator}${_safeStylePresetId(presetId)}')
        .absolute
        .path;
    final candidate = File(image.filePath).absolute.path;
    if (!candidate.startsWith('$presetRoot${Platform.pathSeparator}')) return;
    try {
      final file = File(candidate);
      if (file.existsSync()) await file.delete();
    } catch (_) {}
  }

  Future<void> deleteStylePromptPreviewImages(String presetId) async {
    final root = await _stylePromptPreviewRoot();
    final directory = Directory(
        '${root.path}${Platform.pathSeparator}${_safeStylePresetId(presetId)}');
    try {
      if (directory.existsSync()) await directory.delete(recursive: true);
    } catch (_) {}
  }

  Future<Directory> _referencePresetRoot() async {
    final root = await UnifiedStorage.documents();
    final directory =
        Directory('${root.path}${Platform.pathSeparator}reference-presets');
    if (!directory.existsSync()) directory.createSync(recursive: true);
    return directory;
  }

  String _safeReferencePresetId(String value) {
    final safe = value.trim().replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
    return safe.isEmpty ? 'reference' : safe.substring(0, min(96, safe.length));
  }

  String _referenceImageExtension(String sourcePath) {
    final lower = sourcePath.toLowerCase();
    if (lower.endsWith('.jpeg')) return '.jpeg';
    if (lower.endsWith('.jpg')) return '.jpg';
    if (lower.endsWith('.webp')) return '.webp';
    return '.png';
  }

  Future<ReferencePresetLibrary> getReferencePresetLibrary() async {
    final raw = (await _prefs).getString(_kReferencePresetLibrary);
    if (raw == null || raw.isEmpty) return const ReferencePresetLibrary();
    try {
      final library = ReferencePresetLibrary.fromJson(
          jsonDecode(raw) as Map<String, dynamic>);
      final valid = library.presets
          .where((preset) => File(preset.filePath).existsSync())
          .toList();
      if (valid.length != library.presets.length) {
        final repaired =
            ReferencePresetLibrary(groups: library.groups, presets: valid);
        await setReferencePresetLibrary(repaired);
        return repaired;
      }
      return library;
    } catch (_) {
      return const ReferencePresetLibrary();
    }
  }

  Future<void> setReferencePresetLibrary(ReferencePresetLibrary library) =>
      _saveVerifiedString(
          _kReferencePresetLibrary, jsonEncode(library.toJson()), '参考图预设保存失败');

  Future<String> persistReferencePresetImage({
    required String presetId,
    required List<int> bytes,
    String sourcePath = '',
  }) async {
    final root = await _referencePresetRoot();
    final extension = _referenceImageExtension(sourcePath);
    final file = File(
        '${root.path}${Platform.pathSeparator}${_safeReferencePresetId(presetId)}$extension');
    try {
      await file.writeAsBytes(bytes, flush: true);
      return file.path;
    } catch (_) {
      try {
        if (await file.exists()) await file.delete();
      } catch (_) {}
      rethrow;
    }
  }

  Future<void> deleteReferencePresetImage(ReferencePreset preset) async {
    final root = (await _referencePresetRoot()).absolute.path;
    final candidate = File(preset.filePath).absolute.path;
    if (!candidate.startsWith('$root${Platform.pathSeparator}')) return;
    try {
      final file = File(candidate);
      if (file.existsSync()) await file.delete();
    } catch (_) {}
  }

  Future<File> exportReferencePresetArchive({
    required List<ReferencePreset> presets,
    required List<String> groups,
    String label = 'reference-presets',
  }) async {
    final archive = Archive();
    final manifestPresets = <Map<String, dynamic>>[];
    for (var index = 0; index < presets.length; index++) {
      final preset = presets[index];
      final source = File(preset.filePath);
      if (!source.existsSync()) continue;
      final bytes = await source.readAsBytes();
      final asset =
          'images/${index + 1}${_referenceImageExtension(source.path)}';
      archive.addFile(ArchiveFile(asset, bytes.length, bytes));
      manifestPresets.add({...preset.toJson(), 'filePath': '', 'asset': asset});
    }
    final manifest = utf8.encode(jsonEncode({
      'format': 'langbai-reference-presets',
      'version': 1,
      'groups': groups,
      'presets': manifestPresets,
    }));
    archive.addFile(ArchiveFile('manifest.json', manifest.length, manifest));
    final encoded = ZipEncoder().encode(archive);
    if (encoded == null) throw StateError('Unable to encode preset archive.');
    final temp = await getTemporaryDirectory();
    final safeLabel = sanitizeFolderName(label)
        .replaceAll(RegExp(r'\s+'), '-')
        .replaceAll(RegExp(r'[^a-zA-Z0-9_\-\u4e00-\u9fff]'), '_');
    final file = File(
        '${temp.path}${Platform.pathSeparator}${safeLabel.isEmpty ? 'reference-presets' : safeLabel}-${DateTime.now().millisecondsSinceEpoch}.nairp');
    await file.writeAsBytes(encoded, flush: true);
    return file;
  }

  Future<ReferencePresetImport> importReferencePresetArchive(
      String filePath) async {
    final bytes = await File(filePath).readAsBytes();
    final archive = ZipDecoder().decodeBytes(bytes, verify: true);
    final manifestFile = archive.findFile('manifest.json');
    if (manifestFile == null || !manifestFile.isFile) {
      throw const FormatException('Missing preset manifest.');
    }
    final manifest =
        jsonDecode(utf8.decode(List<int>.from(manifestFile.content as List)))
            as Map<String, dynamic>;
    if (manifest['format'] != 'langbai-reference-presets' ||
        (manifest['version'] as num?)?.toInt() != 1) {
      throw const FormatException('Unsupported preset archive.');
    }
    final groups = (manifest['groups'] as List<dynamic>? ?? const [])
        .map((value) => value.toString().trim())
        .where((value) => value.isNotEmpty)
        .toSet()
        .toList();
    final imported = <ReferencePreset>[];
    try {
      for (final raw in manifest['presets'] as List<dynamic>? ?? const []) {
        if (raw is! Map) continue;
        final json = Map<String, dynamic>.from(raw);
        final asset = json['asset']?.toString() ?? '';
        if (!asset.startsWith('images/') || asset.contains('..')) continue;
        final imageFile = archive.findFile(asset);
        if (imageFile == null || !imageFile.isFile) continue;
        final original = ReferencePreset.fromJson(json);
        if (original.name.isEmpty) continue;
        final id =
            '${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 30)}';
        final storedPath = await persistReferencePresetImage(
          presetId: id,
          bytes: List<int>.from(imageFile.content as List),
          sourcePath: asset,
        );
        imported.add(original.copyWith(id: id, filePath: storedPath));
      }
    } catch (_) {
      for (final preset in imported) {
        try {
          await deleteReferencePresetImage(preset);
        } catch (_) {}
      }
      rethrow;
    }
    return ReferencePresetImport(groups: groups, presets: imported);
  }

  Future<Set<String>?> getAitagCompatibleParams() async {
    final values = (await _prefs).getStringList(_kAitagCompatibleParams);
    return values?.toSet();
  }

  Future<void> setAitagCompatibleParams(Set<String> values) async =>
      (await _prefs).setStringList(_kAitagCompatibleParams, values.toList());

  Future<bool> hasSeenNetworkOnboarding() async =>
      (await _prefs).getBool(_kNetworkOnboarding) ?? false;

  Future<void> markNetworkOnboardingSeen() async =>
      (await _prefs).setBool(_kNetworkOnboarding, true);

  /// Read before normalizing old params: missing differs from intentionally empty.
  /// Legacy locks are only a migration fallback, not a second live text source.
  Future<({String? stylePrompt, String? negativePrompt})> getRetainedPrompts(
      AppSettings settings) async {
    Map<String, dynamic> raw = {};
    try {
      final stored = (await _prefs).getString(_kParams);
      if (stored != null) raw = jsonDecode(stored) as Map<String, dynamic>;
    } on FormatException {
      // Recover the legacy text when the old params JSON is damaged.
    } on TypeError {
      // A non-object legacy value contains no usable prompt fields.
    }
    return (
      stylePrompt: raw['stylePrompt'] is String
          ? raw['stylePrompt'] as String
          : settings.lockStylePrompt
              ? settings.savedStylePrompt
              : null,
      negativePrompt: raw['negativePrompt'] is String
          ? raw['negativePrompt'] as String
          : settings.lockNegativePrompt
              ? settings.savedNegativePrompt
              : null,
    );
  }

  Future<GenerateParams> getParams() async {
    final raw = (await _prefs).getString(_kParams);
    Map<String, dynamic> decoded = {};
    try {
      if (raw != null) decoded = jsonDecode(raw) as Map<String, dynamic>;
    } on FormatException {
      // Keep legacy prompt recovery available for damaged parameter JSON.
    } on TypeError {
      // Non-object values have no generation fields.
    }
    final repaired = GenerateParams.fromJson(decoded);
    if (decoded['stylePrompt'] is! String ||
        decoded['negativePrompt'] is! String) {
      final retained = await getRetainedPrompts(await getSettings());
      repaired.stylePrompt = retained.stylePrompt ?? repaired.stylePrompt;
      repaired.negativePrompt =
          retained.negativePrompt ?? repaired.negativePrompt;
    }
    if (raw == null || jsonEncode(decoded) != jsonEncode(repaired.toJson())) {
      await setParams(repaired);
    }
    return repaired;
  }

  Future<void> setParams(GenerateParams p) async {
    if (!await (await _prefs)
        .setString(_kParams, jsonEncode(p.normalized().toJson()))) {
      throw StateError('Generation parameters could not be saved.');
    }
  }

  Future<List<CharCaptionItem>> getCharacterPrompts() async {
    final raw = (await _prefs).getString('character_prompts_v1');
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw);
      if (list is! List) return [];
      return list
          .whereType<Map>()
          .take(32)
          .map((v) => CharCaptionItem.fromJson(Map<String, dynamic>.from(v)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> setCharacterPrompts(List<CharCaptionItem> captions) {
    // Snapshot before awaiting preferences so rapid edits cannot mutate an in-flight write.
    final value = jsonEncode(captions.map((c) => c.toJson()).toList());
    return _prefs.then((prefs) async {
      await prefs.setString('character_prompts_v1', value);
    });
  }

  Future<ComicProject> getComicProject(GenerateParams fallbackParams) async {
    final prefs = await _prefs;
    await prefs.private.reload();
    final raw = prefs.getString(_kComicProject);
    if (raw == null) return ComicProject.empty(fallbackParams);
    // Preserve malformed original data instead of replacing it with an empty project.
    return ComicProject.fromJson(
        jsonDecode(raw) as Map<String, dynamic>, fallbackParams,
        trustOutputs: true);
  }

  Future<void> _saveVerifiedString(
      String key, String value, String error) async {
    final prefs = await _prefs;
    try {
      if (!await prefs.setString(key, value)) throw StateError(error);
      await prefs.private.reload();
      if (prefs.getString(key) != value) throw StateError('$error：回读不一致');
    } catch (_) {
      await prefs.private.reload();
      rethrow;
    }
  }

  Future<void> setComicProject(ComicProject project) {
    final value = jsonEncode(project.toJson());
    return _saveVerifiedString(_kComicProject, value, '漫画工程保存失败');
  }

  Future<void> setComicBackup(ComicProject project) {
    final value = jsonEncode(project.toJson());
    return _saveVerifiedString(
        'comic_project_agent_backup_v1', value, '漫画工程备份失败');
  }

  Future<Map<String, dynamic>?> getComicRun() async {
    final raw = (await _prefs).getString('comic_run_v1');
    return raw == null
        ? null
        : Map<String, dynamic>.from(jsonDecode(raw) as Map);
  }

  Future<void> setComicRun(Map<String, dynamic> run) {
    final value = jsonEncode(run);
    return _prefs.then((prefs) async {
      if (!await prefs.setString('comic_run_v1', value)) {
        throw StateError('漫画任务记录保存失败');
      }
    });
  }

  Future<BatchRedrawProject> getBatchRedrawProject(
      GenerateParams fallbackParams) async {
    final raw = (await _prefs).getString(_kBatchRedrawProject);
    if (raw == null) return BatchRedrawProject.empty(fallbackParams);
    return BatchRedrawProject.fromJson(
      jsonDecode(raw) as Map<String, dynamic>,
      fallbackParams,
      trustOutputs: true,
    );
  }

  Future<void> setBatchRedrawProject(BatchRedrawProject project) =>
      _saveVerifiedString(
          _kBatchRedrawProject, jsonEncode(project.toJson()), '批量工程保存失败');

  Future<Map<String, dynamic>?> getBatchRun() async {
    final raw = (await _prefs).getString('batch_run_v1');
    return raw == null
        ? null
        : Map<String, dynamic>.from(jsonDecode(raw) as Map);
  }

  Future<void> setBatchRun(Map<String, dynamic> run) =>
      _saveVerifiedString('batch_run_v1', jsonEncode(run), '批量任务记录保存失败');

  Future<List<HistoryItem>> getHistory() async {
    if (_cacheRevision != _historyRevision) _historyCache = null;
    _cacheRevision = _historyRevision;
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

  Future<void> writeHistory(List<HistoryItem> items) => historyTransaction(()=>_writeHistory(items));
  Future<void> _writeHistory(List<HistoryItem> items) async {
    final committed = List<HistoryItem>.of(items);
    final data = committed.map((e) => e.toJson()).toList();
    // Encode off the UI isolate when the list is large enough to matter.
    final raw = items.length > 200
        ? await compute(_encodeJsonList, data)
        : _encodeJsonList(data);
    if (!await (await _prefs).setString(_kHistory, raw)) {
      throw StateError('History could not be saved');
    }
    _cacheRevision = ++_historyRevision;
    _historyCache = committed;
  }

  Future<List<TextToolHistoryItem>> getConvertHistory() => _getTextToolHistory(
      _kConvertHistory,
      () => _convertHistoryCache,
      (v) => _convertHistoryCache = v);

  Future<void> setConvertHistory(List<TextToolHistoryItem> items) =>
      _setTextToolHistory(
          _kConvertHistory, items, (v) => _convertHistoryCache = v);

  Future<List<TextToolHistoryItem>> getReverseHistory() => _getTextToolHistory(
      _kReverseHistory,
      () => _reverseHistoryCache,
      (v) => _reverseHistoryCache = v);

  Future<void> setReverseHistory(List<TextToolHistoryItem> items) =>
      _setTextToolHistory(
          _kReverseHistory, items, (v) => _reverseHistoryCache = v);

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
    final dir = await UnifiedStorage.documents();
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

    try {
      await mutateHistory((rows)=>rows..insert(0,item));
    } catch (_) {
      // The image is already durable; callers must retain it even if indexing fails.
      throw SavedImageHistoryException(item);
    }
    return item;
  }

  Future<HistoryItem> saveCompatibleImage(
      Uint8List bytes, Map<String, Object> request, AppSettings snapshot,
      {String? groupId, String feature = 'openai-images'}) async {
    final now = DateTime.now();
    final date = '${now.year}-${_pad(now.month)}-${_pad(now.day)}';
    final id =
        '${now.microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}';
    final dir = await _imageSaveDir(snapshot, date, groupId);
    final filePath = await _uniqueFilePath(dir, 'compatible-$date-$id', 'png');
    await File(filePath).writeAsBytes(bytes, flush: true);
    final header =
        bytes.buffer.asByteData(bytes.offsetInBytes, bytes.lengthInBytes);
    final item = HistoryItem(
        id: id,
        filePath: filePath,
        date: date,
        createdAt: now.toIso8601String(),
        seed: -1,
        model: request['model'] as String,
        width: header.getUint32(16),
        height: header.getUint32(20),
        prompt: request['prompt'] as String,
        feature: feature,
        groupId: groupId,
        params: {
          'generationProvider': 'openai-images',
          'compatibleRequest': request
        });
    try {
      await mutateHistory((rows)=>rows..insert(0,item));
    } catch (_) {
      throw SavedImageHistoryException(item);
    }
    if (snapshot.saveToGallery) {
      try {
        await Gal.putImage(filePath, album: 'Langbai NovelAI Studio');
      } catch (_) {/* App-private copy remains. */}
    }
    return item;
  }

  Future<HistoryItem> saveArtistLabTemporaryImage(
    Uint8List bytes,
    GenerateParams params,
    int seed,
  ) async {
    final now = DateTime.now();
    final date = '${now.year}-${_pad(now.month)}-${_pad(now.day)}';
    final root = await getTemporaryDirectory();
    final dir = Directory(
        '${root.path}${Platform.pathSeparator}langbai-novelai-studio${Platform.pathSeparator}artist-lab-random');
    if (!dir.existsSync()) dir.createSync(recursive: true);
    final id = 'artist-lab-temp-${now.microsecondsSinceEpoch}';
    final file = File('${dir.path}${Platform.pathSeparator}$id.png');
    final settings = await getSettings();
    final output = settings.keepImageMetadata ? bytes : stripPngMetadata(bytes);
    await file.writeAsBytes(output, flush: true);
    return HistoryItem(
      id: id,
      filePath: file.path,
      date: date,
      createdAt: now.toIso8601String(),
      seed: seed,
      model: params.model,
      width: params.width,
      height: params.height,
      prompt: params.positivePrompt,
      feature: 'artist-lab-temp',
      params: params.toJson(),
    );
  }

  Future<void> deleteArtistLabTemporaryImage(String filePath) async {
    final root = await getTemporaryDirectory();
    final parent = Directory(
            '${root.path}${Platform.pathSeparator}langbai-novelai-studio${Platform.pathSeparator}artist-lab-random')
        .absolute
        .path;
    final candidate = File(filePath).absolute.path;
    if (!candidate.startsWith('$parent${Platform.pathSeparator}')) return;
    try {
      final file = File(candidate);
      if (file.existsSync()) await file.delete();
    } catch (_) {}
  }

  Future<void> deleteHistory(String id) async {
    final result = await deleteHistoryItems({id});
    if (result.failedIds.isNotEmpty) {
      throw const FileSystemException('Image could not be removed; record retained');
    }
  }

  /// Deletes trusted generated outputs and their history entries in one write.
  /// Batch project imports strip output paths, so callers only pass paths that
  /// were persisted by this installation after a successful generation.
  Future<void> deleteHistoryFiles(Iterable<String> filePaths) async {
    final targets = filePaths.where((path) => path.isNotEmpty).toSet();
    if (targets.isEmpty) return;
    // Reject directories and links before deleting anything. A failed deletion
    // must not silently remove its history entry or be reported as successful.
    for (final path in targets) {
      final type = await FileSystemEntity.type(path, followLinks: false);
      if (type != FileSystemEntityType.file &&
          type != FileSystemEntityType.notFound) {
        throw FileSystemException('Expected a regular image file', path);
      }
    }
    final history = await getHistory();
    for (final path in targets) {
      final file = File(path);
      if (await file.exists()) await file.delete();
    }
    history.removeWhere((item) => targets.contains(item.filePath));
    await writeHistory(history);
  }

  Future<HistoryItem> renameHistoryFile(
    HistoryItem item,
    String requestedName,
  ) async {
    final source = File(item.filePath);
    if (await FileSystemEntity.type(source.path, followLinks: false) !=
        FileSystemEntityType.file) {
      throw StateError('图片已移动或不是普通文件');
    }
    final sourceName = source.uri.pathSegments.last;
    final dot = sourceName.lastIndexOf('.');
    final extension = dot >= 0 ? sourceName.substring(dot) : '.png';
    final stem = safeFileStem(requestedName);
    final directory = source.parent;
    var target = File(path_util.join(directory.path, '$stem$extension'));
    bool samePath(String a, String b) =>
        Platform.isWindows ? a.toLowerCase() == b.toLowerCase() : a == b;
    if (samePath(target.path, source.path)) return item;
    var suffix = 2;
    while (true) {
      try {
        await target.create(exclusive: true);
        break;
      } on FileSystemException {
        if (await FileSystemEntity.type(target.path, followLinks: false) ==
            FileSystemEntityType.notFound) rethrow;
        target =
            File(path_util.join(directory.path, '$stem-${suffix++}$extension'));
      }
    }
    try {
      await target.writeAsBytes(await source.readAsBytes(), flush: true);
    } catch (_) {
      try {
        await target.delete();
      } catch (_) {}
      rethrow;
    }
    // The caller commits the history index before cleaning up the old path.
    // This also keeps other history rows that share the source image usable.
    return HistoryItem.fromJson({...item.toJson(), 'filePath': target.path});
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
    final exportDirectory =
        await Directory('${temp.path}/studio-history-export-').createTemp();
    final file =
        File('${exportDirectory.path}/${safeFileStem(archiveName)}.zip');
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

  Future<File> saveOnlineGalleryImage(
    List<int> bytes, {
    required String source,
    required String itemId,
    required String title,
    required String imageId,
    required String extension,
  }) async {
    final settings = await getSettings();
    final defaultBase = (await imagesDir()).path;
    final custom = settings.onlineGalleryDownloadDir.trim();
    final safeSource =
        sanitizeFolderName(source.trim().isEmpty ? 'gallery' : source);
    final safeFolder =
        sanitizeFolderName('${title.trim().isEmpty ? 'work' : title}-$itemId');
    Directory? output;
    for (final base in <String>[if (custom.isNotEmpty) custom, defaultBase]) {
      try {
        final candidate = Directory([
          base,
          'Online Gallery',
          safeSource,
          safeFolder
        ].join(Platform.pathSeparator));
        if (!candidate.existsSync()) candidate.createSync(recursive: true);
        output = candidate;
        break;
      } catch (_) {
        // A revoked custom Android folder falls back to app-managed storage.
      }
    }
    output ??= Directory(defaultBase)..createSync(recursive: true);
    final normalizedExtension = RegExp(r'^(png|jpe?g|webp|gif|avif)$',
                caseSensitive: false)
            .hasMatch(extension)
        ? (extension.toLowerCase() == 'jpeg' ? 'jpg' : extension.toLowerCase())
        : 'jpg';
    final baseName = _safeFilePrefix(imageId.trim().isEmpty
        ? DateTime.now().microsecondsSinceEpoch.toString()
        : imageId);
    final filePath =
        await _uniqueFilePath(output, baseName, normalizedExtension);
    final file = File(filePath);
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

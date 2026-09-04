import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../agent/agent_merge.dart';
import '../agent/agent_models.dart';
import '../models/nai_models.dart';
import '../prompts/positive_prompt_presets.dart';
import '../prompts/prompt_mode.dart';
import '../references/reference_presets.dart';
import 'storage.dart';

// ZipEncoder is synchronous. Running it on Flutter's UI isolate made a due
// backup freeze scrolling and touch input for large libraries. Keep the
// callback top-level so compute() can run it in a background isolate.
List<int>? _encodeBackupArchive(Archive archive) =>
    ZipEncoder().encode(archive);

/// Canonical categories shared with the Electron archive implementation.
enum DataBackupCategory {
  configuration('configuration'),
  apiCredentials('apiCredentials'),
  artistLibrary('artistLibrary'),
  textHistory('textHistory'),
  referencePresets('referencePresets'),
  imageHistory('imageHistory'),
  promptPresets('promptPresets'),
  agentWorkspace('agentWorkspace'),
  workspaceData('workspaceData');

  final String id;
  const DataBackupCategory(this.id);

  static DataBackupCategory? parse(Object? value) {
    for (final category in values) {
      if (category.id == value) return category;
    }
    return null;
  }
}

class DataBackupCategorySummary {
  final DataBackupCategory category;
  final int items;
  final int bytes;

  const DataBackupCategorySummary({
    required this.category,
    required this.items,
    required this.bytes,
  });

  Map<String, dynamic> toJson() => {
        'category': category.id,
        'items': items,
        'bytes': bytes,
      };
}

class DataBackupInspection {
  final String path;
  final DateTime createdAt;
  final String sourcePlatform;
  final String sourceVersion;
  final List<DataBackupCategorySummary> categories;

  const DataBackupInspection({
    required this.path,
    required this.createdAt,
    required this.sourcePlatform,
    required this.sourceVersion,
    required this.categories,
  });
}

class DataBackupImportReport {
  final int imported;
  final int skipped;
  final int renamed;
  final String rescueBackupPath;

  const DataBackupImportReport({
    required this.imported,
    required this.skipped,
    required this.renamed,
    required this.rescueBackupPath,
  });
}

class DataBackupStatus {
  final String directory;
  final bool usingFallbackDirectory;
  final int count;
  final int totalBytes;
  final DateTime? latest;
  final bool due;

  const DataBackupStatus({
    required this.directory,
    required this.usingFallbackDirectory,
    required this.count,
    required this.totalBytes,
    required this.latest,
    required this.due,
  });
}

class _Counters {
  int imported = 0;
  int skipped = 0;
  int renamed = 0;
}

class _ArchiveBundle {
  final Archive archive;
  final Map<String, dynamic> manifest;
  const _ArchiveBundle(this.archive, this.manifest);
}

/// Cross-device, non-destructive data archive service.
///
/// The archive intentionally contains both canonical category payloads and a
/// mobile-only typed preference layer. Electron can consume the canonical
/// files; Android/iOS use those same files plus mobile-state.json to preserve
/// tool projects that have no desktop equivalent yet.
class DataBackupService {
  static const format = 'langbai-novelai-studio-backup';
  static const formatVersion = 1;
  static const _maxJsonBytes = 128 * 1024 * 1024;
  static const _maxAssetBytes = 256 * 1024 * 1024;
  static const _artistPreferenceKeys = <String, String>{
    'random': 'artist_lab_random_v1_favorites',
    'v5-repair': 'v5_artist_repair_v1_favorites',
    'artist-string-draw': 'v5_artist_draw_v1_favorites',
  };
  static const _canonicalPreferenceKeys = <String>{
    'gen_params',
    'history_index_v2',
    'history_groups',
    'app_settings',
    'texttool_convert_history_v1',
    'texttool_reverse_history_v1',
    'reference_preset_library_v1',
    'agent_workspace_v1',
    'agent_always_allowed_tools_v1',
  };
  static const _apiSettingKeys = <String>{
    'apiBaseUrl',
    'imageBaseUrl',
    'allowCustomEndpoint',
    'visionApiUrl',
    'visionApiModel',
    'convertApiUrl',
    'convertApiModel',
    'agentApiProtocol',
    'agentApiBaseUrl',
    'agentApiModel',
    'agentProviderName',
    'agentContextWindow',
    'agentMaxOutputTokens',
    'agentAutoCompact',
    'agentAutoCompactThreshold',
    'agentVisionEnabled',
    'tagServerEnabled',
    'tagServerUrl',
    'tagServerType',
    'tagServerTool',
    'mcpForCapsule',
    'mcpForReverse',
    'mcpForConvert',
    'translateProvider',
    'baiduAppId',
  };
  static const _promptSettingKeys = <String>{
    'promptShortcuts',
    'stylePromptPresets',
    'stylePromptPresetGroups',
    'positivePromptPresets',
  };

  final Storage storage;
  final Random _random = Random.secure();

  DataBackupService(this.storage);

  String _id() =>
      '${DateTime.now().microsecondsSinceEpoch}-${_random.nextInt(1 << 30)}';

  Future<Directory> _defaultBackupDirectory() async {
    final documents = await getApplicationDocumentsDirectory();
    final directory =
        Directory('${documents.path}${Platform.pathSeparator}backups');
    if (!await directory.exists()) await directory.create(recursive: true);
    return directory.absolute;
  }

  Future<Directory> backupDirectory({AppSettings? settings}) async {
    final current = settings ?? await storage.getSettings();
    final configured = current.backupDir.trim();
    if (configured.isNotEmpty) {
      try {
        final directory = Directory(configured);
        if (!await directory.exists()) await directory.create(recursive: true);
        return directory.absolute;
      } catch (_) {
        // Never lose an automatic or import-rescue backup merely because a
        // removable/custom folder is temporarily unavailable.
      }
    }
    return _defaultBackupDirectory();
  }

  Future<String?> chooseBackupDirectory({String? dialogTitle}) async {
    final settings = await storage.getSettings();
    final configured = settings.backupDir.trim();
    final selected = await FilePicker.platform.getDirectoryPath(
      dialogTitle: dialogTitle,
      initialDirectory: Platform.isAndroid || Platform.isIOS
          ? null
          : (configured.isEmpty ? null : configured),
    );
    if (selected == null) return null;
    return Directory(selected.trim()).absolute.path;
  }

  String _stamp() =>
      DateTime.now().toUtc().toIso8601String().replaceAll(RegExp(r'[:.]'), '-');

  String _basename(String value) =>
      value
          .replaceAll('\\', '/')
          .split('/')
          .where((part) => part.isNotEmpty)
          .lastOrNull ??
      'image.png';

  String _extension(String value) {
    final base = _basename(value);
    final index = base.lastIndexOf('.');
    if (index <= 0 || base.length - index > 9) return '.png';
    final extension = base.substring(index).toLowerCase();
    return RegExp(r'^\.[a-z0-9]{1,8}$').hasMatch(extension)
        ? extension
        : '.png';
  }

  String _safeName(String value, {String fallback = 'image.png'}) {
    var source = _basename(value)
        .replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1f]'), '-')
        .replaceFirst(RegExp(r'^\.+'), '')
        .trim();
    if (source.isEmpty) source = fallback;
    if (source.length > 150) {
      final extension = _extension(source);
      source = '${source.substring(0, 140)}$extension';
    }
    return source;
  }

  String _safeFolder(String value, {String fallback = 'Imported'}) {
    final result = value
        .replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1f]'), '-')
        .replaceFirst(RegExp(r'^\.+'), '')
        .trim();
    if (result.isEmpty) return fallback;
    return result.substring(0, min(80, result.length));
  }

  Uint8List _entryBytes(ArchiveFile file) =>
      Uint8List.fromList(List<int>.from(file.content as List));

  int _addJson(Archive archive, String name, Object? value) {
    final bytes = utf8.encode(jsonEncode(value));
    archive.addFile(ArchiveFile(name, bytes.length, bytes));
    return bytes.length;
  }

  Future<Map<String, dynamic>?> _addAsset(
    Archive archive,
    Map<String, Map<String, dynamic>> assets,
    String? filePath, {
    required bool includeAssets,
  }) async {
    if (!includeAssets || filePath == null || filePath.isEmpty) return null;
    final file = File(filePath);
    if (!file.existsSync()) return null;
    final size = await file.length();
    if (size <= 0 || size > _maxAssetBytes) return null;
    final bytes = await file.readAsBytes();
    final digest = sha256.convert(bytes).toString();
    final previous = assets[digest];
    if (previous != null) return Map<String, dynamic>.from(previous);
    final assetPath = 'assets/$digest${_extension(file.path)}';
    final reference = <String, dynamic>{
      'asset': assetPath,
      'sha256': digest,
      'bytes': bytes.length,
      'originalName': _safeName(file.path),
    };
    final archiveFile = ArchiveFile(assetPath, bytes.length, bytes)
      // Generated images are already PNG/JPEG/WebP-compressed. Re-deflating
      // them is expensive and normally saves almost nothing.
      ..compress = false;
    archive.addFile(archiveFile);
    assets[digest] = reference;
    return Map<String, dynamic>.from(reference);
  }

  Future<Map<String, dynamic>> _portableHistory(
    HistoryItem item,
    Archive archive,
    Map<String, Map<String, dynamic>> assets, {
    required bool includeAssets,
  }) async {
    final result = Map<String, dynamic>.from(item.toJson());
    result['filePath'] = '';
    // Electron calls this field actualSeed. Keep both names for older mobile
    // archives and forward compatibility.
    result['actualSeed'] = item.seed;
    result['asset'] = await _addAsset(
      archive,
      assets,
      item.filePath,
      includeAssets: includeAssets,
    );
    return result;
  }

  Future<Map<String, dynamic>> _portableFavorite(
    Map<String, dynamic> favorite,
    Archive archive,
    Map<String, Map<String, dynamic>> assets, {
    required bool includeAssets,
  }) async {
    final cloned = jsonDecode(jsonEncode(favorite)) as Map<String, dynamic>;
    final recipeValue = cloned['recipe'];
    if (recipeValue is Map) {
      final recipe = Map<String, dynamic>.from(recipeValue);
      // Artist cards are nested on mobile but flattened on Electron. Export a
      // canonical flattened record while retaining the nested recipe so older
      // mobile builds can still read the same archive losslessly.
      for (final key in const [
        'id',
        'pairId',
        'variant',
        'prompt',
        'basePrompt',
        'artistPrompt',
        'mutations',
        'franchiseStyles',
      ]) {
        if (recipe.containsKey(key)) cloned[key] = recipe[key];
      }
      cloned['artists'] = _canonicalArtists(recipe);
      cloned['auxiliary'] = recipe['auxiliary'] is List
          ? List<dynamic>.from(recipe['auxiliary'] as List)
          : const <dynamic>[];
      if (cloned['seed'] != null) cloned['generationSeed'] = cloned['seed'];
    }
    final image = cloned['image'];
    if (image is Map) {
      try {
        cloned['image'] = await _portableHistory(
          HistoryItem.fromJson(Map<String, dynamic>.from(image)),
          archive,
          assets,
          includeAssets: includeAssets,
        );
      } catch (_) {
        cloned['image'] = null;
      }
    }
    return cloned;
  }

  Future<Map<String, dynamic>> _portableAgentAttachment(
    AgentAttachment attachment,
    Archive archive,
    Map<String, Map<String, dynamic>> assets, {
    required bool includeAssets,
  }) async {
    final json = Map<String, dynamic>.from(attachment.toJson());
    json['filePath'] = '';
    json.remove('fileUrl');
    json['asset'] = await _addAsset(
      archive,
      assets,
      attachment.filePath,
      includeAssets: includeAssets,
    );
    return json;
  }

  Future<Map<String, dynamic>> _portableAgentWorkspace(
    AgentWorkspace workspace,
    Archive archive,
    Map<String, Map<String, dynamic>> assets, {
    required bool includeAssets,
  }) async {
    final json = Map<String, dynamic>.from(workspace.toJson());
    final conversations = <Map<String, dynamic>>[];
    for (final conversation in workspace.conversations) {
      final portable = Map<String, dynamic>.from(conversation.toJson())
        ..remove('runtimeSessionId')
        ..['status'] = 'idle';
      portable['draftAttachments'] = [
        for (final attachment in conversation.draftAttachments)
          await _portableAgentAttachment(
            attachment,
            archive,
            assets,
            includeAssets: includeAssets,
          ),
      ];
      final messages = <Map<String, dynamic>>[];
      for (final message in conversation.messages) {
        final messageJson = Map<String, dynamic>.from(message.toJson())
          ..remove('runtimeMessageId');
        messageJson['attachments'] = [
          for (final attachment in message.attachments)
            await _portableAgentAttachment(
              attachment,
              archive,
              assets,
              includeAssets: includeAssets,
            ),
        ];
        final toolJson = <Map<String, dynamic>>[];
        for (final tool in message.tools) {
          final value = Map<String, dynamic>.from(tool.toJson());
          value['generatedImages'] = [
            for (final attachment in tool.generatedImages)
              await _portableAgentAttachment(
                attachment,
                archive,
                assets,
                includeAssets: includeAssets,
              ),
          ];
          toolJson.add(value);
        }
        messageJson['tools'] = toolJson;
        messages.add(messageJson);
      }
      portable['messages'] = messages;
      conversations.add(portable);
    }
    json['conversations'] = conversations;
    return json;
  }

  int _agentAssetBytes(Object? value) {
    final hashes = <String>{};
    var bytes = 0;
    void visit(Object? node) {
      if (node is List) {
        for (final item in node) {
          visit(item);
        }
        return;
      }
      if (node is! Map) return;
      final map = Map<String, dynamic>.from(node);
      final asset = map['asset'];
      if (asset is Map) {
        final reference = Map<String, dynamic>.from(asset);
        final hash = reference['sha256']?.toString() ?? '';
        if (hash.isNotEmpty && hashes.add(hash)) {
          bytes += (reference['bytes'] as num?)?.round() ?? 0;
        }
      }
      for (final child in map.values) {
        visit(child);
      }
    }

    visit(value);
    return bytes;
  }

  List<Map<String, dynamic>> _canonicalArtists(Map<String, dynamic> recipe) {
    final weights = <String, double>{};
    final artistPrompt = recipe['artistPrompt']?.toString() ??
        recipe['prompt']?.toString() ??
        '';
    final weighted = RegExp(
      r'(-?\d+(?:\.\d+)?)\s*::\s*artist\s*:\s*([^,]+?)\s*::',
      caseSensitive: false,
    );
    for (final match in weighted.allMatches(artistPrompt)) {
      final name = match.group(2)?.trim() ?? '';
      final weight = double.tryParse(match.group(1) ?? '');
      if (name.isNotEmpty && weight != null) {
        weights[name.toLowerCase().replaceAll(' ', '_')] = weight;
      }
    }
    return (recipe['artists'] as List? ?? const [])
        .map((value) {
          if (value is Map) {
            final artist = Map<String, dynamic>.from(value);
            final name = artist['name']?.toString().trim() ?? '';
            if (name.isEmpty) return null;
            return <String, dynamic>{
              'name': name,
              'weight': (artist['weight'] as num?)?.toDouble() ??
                  weights[name.toLowerCase().replaceAll(' ', '_')] ??
                  1.0,
            };
          }
          final name = value.toString().trim();
          if (name.isEmpty) return null;
          return <String, dynamic>{
            'name': name,
            'weight': weights[name.toLowerCase().replaceAll(' ', '_')] ?? 1.0,
          };
        })
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  Future<File> createBackup(
    Set<DataBackupCategory> requested, {
    bool includeAssets = true,
    String prefix = 'manual',
    bool internal = false,
  }) async {
    final selected = DataBackupCategory.values
        .where(requested.contains)
        .toList(growable: false);
    if (selected.isEmpty) throw ArgumentError('Select at least one category.');
    final archive = Archive();
    final summaries = <DataBackupCategorySummary>[];
    final assets = <String, Map<String, dynamic>>{};
    final settings = await storage.getSettings();
    final settingsJson = settings.toJson();

    if (requested.contains(DataBackupCategory.configuration)) {
      final configuration = Map<String, dynamic>.from(settingsJson)
        ..removeWhere((key, _) =>
            _apiSettingKeys.contains(key) || _promptSettingKeys.contains(key));
      final params = await storage.getParams();
      final bytes = _addJson(
              archive, 'data/configuration.json', configuration) +
          _addJson(archive, 'data/generation-params.json', params.toJson()) +
          _addJson(archive, 'data/mobile-configuration.json', {
            'settings': configuration,
            'params': params.toJson(),
          });
      summaries.add(DataBackupCategorySummary(
        category: DataBackupCategory.configuration,
        items: configuration.length + 1,
        bytes: bytes,
      ));
    }

    if (requested.contains(DataBackupCategory.apiCredentials)) {
      final apiSettings = <String, dynamic>{
        for (final key in _apiSettingKeys)
          if (settingsJson.containsKey(key)) key: settingsJson[key],
        'visionApiKey': await storage.getVisionKey() ?? '',
        'convertApiKey': await storage.getConvertKey() ?? '',
        'agentApiKey': await storage.getAgentApiKey() ?? '',
        'tagServerApiKey': await storage.getTagKey() ?? '',
        'baiduSecret': await storage.getBaiduSecret() ?? '',
      };
      final payload = {
        'token': await storage.getToken() ?? '',
        'account': null,
        'settings': apiSettings,
      };
      final bytes = _addJson(archive, 'data/api-credentials.json', payload);
      summaries.add(DataBackupCategorySummary(
        category: DataBackupCategory.apiCredentials,
        items: apiSettings.length + 1,
        bytes: bytes,
      ));
    }

    if (requested.contains(DataBackupCategory.imageHistory)) {
      final history = await storage.getHistory();
      final items = <Map<String, dynamic>>[];
      var assetBytes = 0;
      for (final item in history) {
        final portable = await _portableHistory(
          item,
          archive,
          assets,
          includeAssets: includeAssets,
        );
        assetBytes +=
            ((portable['asset'] as Map?)?['bytes'] as num?)?.toInt() ?? 0;
        items.add(portable);
      }
      final bytes = _addJson(archive, 'data/image-history.json', {
        'groups':
            (await storage.getGroups()).map((group) => group.toJson()).toList(),
        'items': items,
      });
      summaries.add(DataBackupCategorySummary(
        category: DataBackupCategory.imageHistory,
        items: items.length,
        bytes: bytes + assetBytes,
      ));
    }

    if (requested.contains(DataBackupCategory.textHistory)) {
      final convert = await storage.getConvertHistory();
      final reverse = <Map<String, dynamic>>[];
      var assetBytes = 0;
      for (final item in await storage.getReverseHistory()) {
        final json = Map<String, dynamic>.from(item.toJson());
        json['sourceImagePath'] = item.sourceImagePath == null ? null : '';
        json['sourceAsset'] = await _addAsset(
          archive,
          assets,
          item.sourceImagePath,
          includeAssets: includeAssets,
        );
        assetBytes +=
            ((json['sourceAsset'] as Map?)?['bytes'] as num?)?.toInt() ?? 0;
        reverse.add(json);
      }
      final bytes = _addJson(archive, 'data/text-history.json', {
        'convert': convert.map((item) => item.toJson()).toList(),
        'reverse': reverse,
      });
      summaries.add(DataBackupCategorySummary(
        category: DataBackupCategory.textHistory,
        items: convert.length + reverse.length,
        bytes: bytes + assetBytes,
      ));
    }

    if (requested.contains(DataBackupCategory.artistLibrary)) {
      final prefs = await SharedPreferences.getInstance();
      final collections = <String, List<Map<String, dynamic>>>{};
      var total = 0;
      var assetBytes = 0;
      for (final entry in _artistPreferenceKeys.entries) {
        final values = <Map<String, dynamic>>[];
        try {
          final decoded =
              jsonDecode(prefs.getString(entry.value) ?? '[]') as List;
          for (final item in decoded.whereType<Map>()) {
            final favorite = await _portableFavorite(
              Map<String, dynamic>.from(item),
              archive,
              assets,
              includeAssets: includeAssets,
            );
            assetBytes += (((favorite['image'] as Map?)?['asset']
                        as Map?)?['bytes'] as num?)
                    ?.toInt() ??
                0;
            values.add(favorite);
          }
        } catch (_) {}
        collections[entry.key] = values;
        total += values.length;
      }
      final bytes = _addJson(archive, 'data/artist-library.json', {
        'version': 1,
        'updatedAt': DateTime.now().toUtc().toIso8601String(),
        'collections': collections,
      });
      summaries.add(DataBackupCategorySummary(
        category: DataBackupCategory.artistLibrary,
        items: total,
        bytes: bytes + assetBytes,
      ));
    }

    if (requested.contains(DataBackupCategory.referencePresets)) {
      final library = await storage.getReferencePresetLibrary();
      final presets = <Map<String, dynamic>>[];
      var assetBytes = 0;
      for (final preset in library.presets) {
        final json = Map<String, dynamic>.from(preset.toJson());
        json['filePath'] = '';
        json['asset'] = await _addAsset(
          archive,
          assets,
          preset.filePath,
          includeAssets: includeAssets,
        );
        assetBytes += ((json['asset'] as Map?)?['bytes'] as num?)?.toInt() ?? 0;
        presets.add(json);
      }
      final bytes = _addJson(archive, 'data/reference-presets.json', {
        'groups': library.groups,
        'presets': presets,
      });
      summaries.add(DataBackupCategorySummary(
        category: DataBackupCategory.referencePresets,
        items: presets.length,
        bytes: bytes + assetBytes,
      ));
    }

    if (requested.contains(DataBackupCategory.promptPresets)) {
      final styles = <Map<String, dynamic>>[];
      final positivePrompts = <Map<String, dynamic>>[];
      var assetBytes = 0;
      for (final preset in settings.stylePromptPresets) {
        final json = Map<String, dynamic>.from(preset.toJson());
        final previews = <Map<String, dynamic>>[];
        for (final preview in preset.previewImages) {
          final previewJson = Map<String, dynamic>.from(preview.toJson());
          previewJson['filePath'] = '';
          previewJson['asset'] = await _addAsset(
            archive,
            assets,
            preview.filePath,
            includeAssets: includeAssets,
          );
          assetBytes +=
              ((previewJson['asset'] as Map?)?['bytes'] as num?)?.toInt() ?? 0;
          previews.add(previewJson);
        }
        json['previewImages'] = previews;
        styles.add(json);
      }
      for (final preset in settings.positivePromptPresets) {
        final json = Map<String, dynamic>.from(preset.toJson());
        final previews = <Map<String, dynamic>>[];
        for (final preview in preset.previewImages) {
          final previewJson = Map<String, dynamic>.from(preview.toJson());
          previewJson['filePath'] = '';
          previewJson['asset'] = await _addAsset(
            archive,
            assets,
            preview.filePath,
            includeAssets: includeAssets,
          );
          assetBytes +=
              ((previewJson['asset'] as Map?)?['bytes'] as num?)?.toInt() ?? 0;
          previews.add(previewJson);
        }
        json['previewImages'] = previews;
        positivePrompts.add(json);
      }
      final payload = {
        // Desktop calls the same record PromptTemplate.
        'promptTemplates': settings.promptShortcuts
            .map((template) => template.toJson())
            .toList(),
        'stylePromptPresetGroups': settings.stylePromptPresetGroups,
        'stylePromptPresets': styles,
        'positivePromptPresets': positivePrompts,
      };
      final bytes = _addJson(archive, 'data/prompt-presets.json', payload);
      summaries.add(DataBackupCategorySummary(
        category: DataBackupCategory.promptPresets,
        items: settings.promptShortcuts.length +
            styles.length +
            positivePrompts.length,
        bytes: bytes + assetBytes,
      ));
    }

    if (requested.contains(DataBackupCategory.agentWorkspace)) {
      final workspace = await storage.getAgentWorkspace();
      final portable = await _portableAgentWorkspace(
        workspace,
        archive,
        assets,
        includeAssets: includeAssets,
      );
      final bytes = _addJson(archive, 'data/agent-workspace.json', portable);
      final itemCount = workspace.conversations.length +
          workspace.characters.length +
          workspace.personas.length +
          workspace.lorebooks.length +
          workspace.samplerPresets.length +
          workspace.conversations.fold<int>(
            0,
            (sum, item) => sum + item.messages.length,
          );
      summaries.add(DataBackupCategorySummary(
        category: DataBackupCategory.agentWorkspace,
        items: itemCount,
        bytes: bytes + _agentAssetBytes(portable),
      ));
    }

    if (requested.contains(DataBackupCategory.workspaceData)) {
      final prefs = await SharedPreferences.getInstance();
      final mobileState = <String, dynamic>{};
      final portableRenderer = <String, String>{};
      for (final key in prefs.getKeys()) {
        if (_canonicalPreferenceKeys.contains(key) ||
            _artistPreferenceKeys.values.contains(key)) {
          continue;
        }
        final value = prefs.get(key);
        if (value is String ||
            value is bool ||
            value is int ||
            value is double ||
            value is List<String>) {
          mobileState[key] = value;
        }
        if (key.startsWith('langbai.') && value != null) {
          portableRenderer[key] = value is String ? value : jsonEncode(value);
        }
      }
      final bytes = _addJson(archive, 'data/mobile-state.json', mobileState) +
          _addJson(archive, 'data/workspace.json', portableRenderer);
      summaries.add(DataBackupCategorySummary(
        category: DataBackupCategory.workspaceData,
        items: mobileState.length,
        bytes: bytes,
      ));
    }

    final manifest = {
      'format': format,
      'version': formatVersion,
      'createdAt': DateTime.now().toUtc().toIso8601String(),
      'source': {
        'platform': Platform.operatingSystem,
        'appVersion': appVersion
      },
      'categories': summaries.map((summary) => summary.toJson()).toList(),
    };
    _addJson(archive, 'manifest.json', manifest);
    final encoded = await compute(
      _encodeBackupArchive,
      archive,
      debugLabel: 'data-backup-zip',
    );
    if (encoded == null) throw StateError('Unable to encode backup archive.');
    final directory = internal
        ? await backupDirectory(settings: settings)
        : await getTemporaryDirectory();
    final file = File(
        '${directory.path}${Platform.pathSeparator}$prefix-${_stamp()}.naisbackup');
    final temporary = File('${file.path}.tmp');
    await temporary.writeAsBytes(encoded, flush: true);
    if (file.existsSync()) await file.delete();
    await temporary.rename(file.path);
    return file;
  }

  Future<void> shareBackup(File file) => Share.shareXFiles(
        [
          XFile(
            file.path,
            mimeType: 'application/x-naisbackup',
            name: _basename(file.path),
          )
        ],
        text: 'Langbai NovelAI Studio data backup',
      );

  /// Opens the native Save As flow. Mobile file pickers write [bytes]
  /// directly to the selected document URI; desktop pickers only return a
  /// path, so the service completes the write atomically there.
  Future<String?> saveBackupFile(File file, {String? dialogTitle}) async {
    final bytes = await file.readAsBytes();
    final selected = await FilePicker.platform.saveFile(
      dialogTitle: dialogTitle,
      fileName: _basename(file.path),
      type: FileType.custom,
      allowedExtensions: const ['naisbackup'],
      bytes: Platform.isAndroid || Platform.isIOS ? bytes : null,
    );
    if (selected == null) return null;
    if (Platform.isAndroid || Platform.isIOS) return selected;

    final target = File(selected);
    final temporary = File('$selected.tmp');
    await temporary.writeAsBytes(bytes, flush: true);
    if (await target.exists()) await target.delete();
    await temporary.rename(target.path);
    return target.path;
  }

  Future<String?> pickBackupFile() async {
    // Several Android document providers hide unknown custom extensions when a
    // MIME-constrained picker is used. Let mobile users select any document and
    // validate its manifest in [_loadArchive] instead; desktop keeps the useful
    // extension filter.
    final mobile = Platform.isAndroid || Platform.isIOS;
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: false,
      type: mobile ? FileType.any : FileType.custom,
      allowedExtensions: mobile ? null : const ['naisbackup', 'zip'],
    );
    return result?.files.single.path;
  }

  Future<_ArchiveBundle> _loadArchive(String filePath) async {
    final file = File(filePath);
    if (!file.existsSync() || await file.length() <= 0) {
      throw const FormatException('Backup file is empty.');
    }
    final archive =
        ZipDecoder().decodeBytes(await file.readAsBytes(), verify: true);
    final manifestFile = archive.findFile('manifest.json');
    if (manifestFile == null || !manifestFile.isFile) {
      throw const FormatException('Missing backup manifest.');
    }
    final manifestBytes = _entryBytes(manifestFile);
    if (manifestBytes.length > _maxJsonBytes) {
      throw const FormatException('Backup manifest is too large.');
    }
    final manifest = Map<String, dynamic>.from(
        jsonDecode(utf8.decode(manifestBytes)) as Map);
    if (manifest['format'] != format ||
        (manifest['version'] as num?)?.toInt() != formatVersion) {
      throw const FormatException('Unsupported backup format or version.');
    }
    return _ArchiveBundle(archive, manifest);
  }

  dynamic _readJson(_ArchiveBundle bundle, String name, [dynamic fallback]) {
    final file = bundle.archive.findFile(name);
    if (file == null || !file.isFile) return fallback;
    final bytes = _entryBytes(file);
    if (bytes.length > _maxJsonBytes) {
      throw FormatException('$name is too large.');
    }
    return jsonDecode(utf8.decode(bytes));
  }

  Future<DataBackupInspection> inspect(String filePath) async {
    final bundle = await _loadArchive(filePath);
    final source = bundle.manifest['source'] is Map
        ? Map<String, dynamic>.from(bundle.manifest['source'] as Map)
        : const <String, dynamic>{};
    final summaries = <DataBackupCategorySummary>[];
    for (final raw in bundle.manifest['categories'] as List? ?? const []) {
      if (raw is! Map) continue;
      final json = Map<String, dynamic>.from(raw);
      final category = DataBackupCategory.parse(json['category']);
      if (category == null) continue;
      summaries.add(DataBackupCategorySummary(
        category: category,
        items: (json['items'] as num?)?.toInt() ?? 0,
        bytes: (json['bytes'] as num?)?.toInt() ?? 0,
      ));
    }
    return DataBackupInspection(
      path: filePath,
      createdAt:
          DateTime.tryParse(bundle.manifest['createdAt']?.toString() ?? '') ??
              DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
      sourcePlatform: source['platform']?.toString() ?? 'unknown',
      sourceVersion: source['appVersion']?.toString() ?? 'unknown',
      categories: summaries,
    );
  }

  Map<String, dynamic>? _assetReference(Object? raw) {
    if (raw is! Map) return null;
    final value = Map<String, dynamic>.from(raw);
    final asset = value['asset']?.toString() ?? '';
    final hash = value['sha256']?.toString() ?? '';
    final bytes = (value['bytes'] as num?)?.toInt() ?? 0;
    if (!RegExp(r'^assets/[a-f0-9]{64}\.[a-z0-9]{1,8}$').hasMatch(asset) ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(hash) ||
        bytes <= 0 ||
        bytes > _maxAssetBytes) {
      return null;
    }
    return value;
  }

  Uint8List? _assetBytes(_ArchiveBundle bundle, Object? raw) {
    final reference = _assetReference(raw);
    if (reference == null) return null;
    final file = bundle.archive.findFile(reference['asset'].toString());
    if (file == null || !file.isFile) return null;
    final bytes = _entryBytes(file);
    if (bytes.isEmpty ||
        bytes.length > _maxAssetBytes ||
        sha256.convert(bytes).toString() != reference['sha256']) {
      throw const FormatException('Backup asset checksum failed.');
    }
    return bytes;
  }

  Future<Map<String, HistoryItem>> _historyHashes(
      Iterable<HistoryItem> items) async {
    final result = <String, HistoryItem>{};
    for (final item in items) {
      try {
        final file = File(item.filePath);
        if (!file.existsSync()) continue;
        final digest = sha256.convert(await file.readAsBytes()).toString();
        result.putIfAbsent(digest, () => item);
      } catch (_) {}
    }
    return result;
  }

  Future<File> _uniqueFile(Directory directory, String requested) async {
    if (!directory.existsSync()) directory.createSync(recursive: true);
    final safe = _safeName(requested);
    final extension = _extension(safe);
    final stem = safe.substring(0, safe.length - extension.length);
    var file = File('${directory.path}${Platform.pathSeparator}$safe');
    var index = 1;
    while (file.existsSync()) {
      file = File(
          '${directory.path}${Platform.pathSeparator}$stem (${index++})$extension');
    }
    return file;
  }

  String _dateFolder(Object? value) {
    final date = value?.toString() ?? '';
    return RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date)
        ? date
        : DateTime.now().toIso8601String().substring(0, 10);
  }

  String _uniqueLabel(
      Set<String> existing, Object? requested, _Counters counters) {
    final base = (requested?.toString().trim().isNotEmpty ?? false)
        ? requested.toString().trim()
        : 'Imported';
    var candidate = base;
    var index = 1;
    while (existing.contains(candidate.toLowerCase())) {
      candidate = '$base (${index++})';
    }
    if (candidate != base) counters.renamed++;
    existing.add(candidate.toLowerCase());
    return candidate;
  }

  Future<HistoryItem?> _restoreHistoryItem(
    _ArchiveBundle bundle,
    Map<String, dynamic> raw,
    List<HistoryItem> history,
    List<HistoryGroup> groups,
    Map<String, String> groupIds,
    Map<String, HistoryItem> hashes,
    Set<String> ids,
    _Counters counters,
  ) async {
    final reference = _assetReference(raw['asset']);
    final bytes = _assetBytes(bundle, reference);
    if (reference == null || bytes == null) {
      counters.skipped++;
      return null;
    }
    final digest = reference['sha256'].toString();
    final duplicate = hashes[digest];
    if (duplicate != null) {
      counters.skipped++;
      return duplicate;
    }
    final groupId = groupIds[raw['groupId']?.toString() ?? ''];
    final group = groups.where((group) => group.id == groupId).firstOrNull;
    final root = await storage.imagesDir();
    final directory = Directory([
      root.path,
      _dateFolder(raw['date']),
      if (group != null) _safeFolder(group.name),
    ].join(Platform.pathSeparator));
    final destination = await _uniqueFile(
      directory,
      reference['originalName']?.toString() ?? 'image.png',
    );
    if (_basename(destination.path) !=
        _safeName(reference['originalName']?.toString() ?? 'image.png')) {
      counters.renamed++;
    }
    await destination.writeAsBytes(bytes, flush: true);
    var id = raw['id']?.toString() ?? '';
    if (id.isEmpty || ids.contains(id)) id = _id();
    ids.add(id);
    final params = raw['params'] is Map
        ? Map<String, dynamic>.from(raw['params'] as Map)
        : <String, dynamic>{};
    final item = HistoryItem(
      id: id,
      filePath: destination.path,
      date: _dateFolder(raw['date']),
      createdAt: raw['createdAt']?.toString() ??
          DateTime.now().toUtc().toIso8601String(),
      seed: (raw['seed'] as num?)?.toInt() ??
          (raw['actualSeed'] as num?)?.toInt() ??
          0,
      model: raw['model']?.toString() ?? params['model']?.toString() ?? '',
      width: (raw['width'] as num?)?.toInt() ?? 0,
      height: (raw['height'] as num?)?.toInt() ?? 0,
      prompt: raw['prompt']?.toString() ??
          params['positivePrompt']?.toString() ??
          '',
      feature: raw['feature']?.toString() ?? 't2i',
      groupId: groupId,
      params: params,
    );
    history.add(item);
    hashes[digest] = item;
    counters.imported++;
    return item;
  }

  Future<void> _restoreTextHistory(
    _ArchiveBundle bundle,
    Map<String, dynamic> payload,
    _Counters counters,
  ) async {
    Future<void> merge(
        List<TextToolHistoryItem> current,
        Iterable<dynamic> incoming,
        Future<void> Function(List<TextToolHistoryItem>) persist,
        {bool reverse = false}) async {
      final identities = current
          .map((item) =>
              '${item.createdAt}\u241f${item.mode.value}\u241f${item.input}\u241f${item.result}')
          .toSet();
      final ids = current.map((item) => item.id).toSet();
      final documents = await getApplicationDocumentsDirectory();
      final sourceDirectory = Directory(
          '${documents.path}${Platform.pathSeparator}imported-sources');
      for (final value in incoming) {
        if (value is! Map) continue;
        final raw = Map<String, dynamic>.from(value);
        if (reverse && raw['sourceAsset'] != null) {
          final reference = _assetReference(raw['sourceAsset']);
          final bytes = _assetBytes(bundle, reference);
          if (reference != null && bytes != null) {
            final target = await _uniqueFile(sourceDirectory,
                reference['originalName']?.toString() ?? 'source.png');
            await target.writeAsBytes(bytes, flush: true);
            raw['sourceImagePath'] = target.path;
          }
        }
        raw.remove('sourceAsset');
        if ((raw['id']?.toString() ?? '').isEmpty ||
            ids.contains(raw['id'].toString())) {
          raw['id'] = _id();
        }
        try {
          final item = TextToolHistoryItem.fromJson(raw);
          final identity =
              '${item.createdAt}\u241f${item.mode.value}\u241f${item.input}\u241f${item.result}';
          if (!identities.add(identity)) {
            counters.skipped++;
            continue;
          }
          ids.add(item.id);
          current.add(item);
          counters.imported++;
        } catch (_) {
          counters.skipped++;
        }
      }
      current.sort((left, right) => right.createdAt.compareTo(left.createdAt));
      await persist(current);
    }

    await merge(
      await storage.getConvertHistory(),
      payload['convert'] as List? ?? const [],
      storage.setConvertHistory,
    );
    await merge(
      await storage.getReverseHistory(),
      payload['reverse'] as List? ?? const [],
      storage.setReverseHistory,
      reverse: true,
    );
  }

  Future<void> _restoreReferencePresets(
    _ArchiveBundle bundle,
    Map<String, dynamic> payload,
    _Counters counters,
  ) async {
    final library = await storage.getReferencePresetLibrary();
    final presets = List<ReferencePreset>.from(library.presets);
    final names = presets.map((preset) => preset.name.toLowerCase()).toSet();
    final hashes = <String>{};
    for (final preset in presets) {
      try {
        hashes.add(sha256
            .convert(await File(preset.filePath).readAsBytes())
            .toString());
      } catch (_) {}
    }
    for (final value in payload['presets'] as List? ?? const []) {
      if (value is! Map) continue;
      final raw = Map<String, dynamic>.from(value);
      final reference = _assetReference(raw['asset']);
      final bytes = _assetBytes(bundle, reference);
      if (reference == null ||
          bytes == null ||
          hashes.contains(reference['sha256'])) {
        counters.skipped++;
        continue;
      }
      final id = _id();
      final name = _uniqueLabel(names, raw['name'], counters);
      final filePath = await storage.persistReferencePresetImage(
        presetId: id,
        bytes: bytes,
        sourcePath: reference['originalName']?.toString() ?? 'image.png',
      );
      raw
        ..['id'] = id
        ..['name'] = name
        ..['filePath'] = filePath;
      presets.add(ReferencePreset.fromJson(raw));
      hashes.add(reference['sha256'].toString());
      counters.imported++;
    }
    final incomingGroups = (payload['groups'] as List? ?? const [])
        .map((value) => value.toString().trim())
        .where((value) => value.isNotEmpty);
    await storage.setReferencePresetLibrary(ReferencePresetLibrary(
      groups: {...library.groups, ...incomingGroups}.toList(),
      presets: presets,
    ));
  }

  Future<List<StylePromptPreviewImage>> _restoreStylePreviews(
    _ArchiveBundle bundle,
    String presetId,
    List<StylePromptPreviewImage> current,
    Iterable<dynamic> incoming,
    _Counters counters,
  ) async {
    final previews = List<StylePromptPreviewImage>.from(current);
    final hashes = <String>{};
    for (final preview in previews) {
      try {
        hashes.add(sha256
            .convert(await File(preview.filePath).readAsBytes())
            .toString());
      } catch (_) {}
    }
    final documents = await getApplicationDocumentsDirectory();
    final directory = Directory([
      documents.path,
      'style-prompt-previews',
      _safeFolder(presetId, fallback: 'preset'),
    ].join(Platform.pathSeparator));
    for (final value in incoming) {
      if (previews.length >= 3 || value is! Map) break;
      final raw = Map<String, dynamic>.from(value);
      final reference = _assetReference(raw['asset']);
      final bytes = _assetBytes(bundle, reference);
      if (reference == null ||
          bytes == null ||
          hashes.contains(reference['sha256'])) {
        counters.skipped++;
        continue;
      }
      final id = _id();
      final file = await _uniqueFile(directory,
          '$id${_extension(reference['originalName']?.toString() ?? '')}');
      await file.writeAsBytes(bytes, flush: true);
      previews.add(StylePromptPreviewImage(
        id: id,
        name: _safeName(
            raw['name']?.toString() ?? reference['originalName'].toString()),
        filePath: file.path,
        createdAt: raw['createdAt']?.toString() ??
            DateTime.now().toUtc().toIso8601String(),
      ));
      hashes.add(reference['sha256'].toString());
      counters.imported++;
    }
    return previews;
  }

  Future<AppSettings> _restorePromptPresets(
    _ArchiveBundle bundle,
    Map<String, dynamic> payload,
    AppSettings settings,
    _Counters counters,
  ) async {
    final prompts = List<PromptShortcutTemplate>.from(settings.promptShortcuts);
    final promptIds = prompts.map((item) => item.id).toSet();
    final promptNames = prompts.map((item) => item.name.toLowerCase()).toSet();
    final promptIdentity = prompts
        .map((item) =>
            '${item.name}\u241f${item.prefix}\u241f${item.suffix}\u241f${item.negativePrompt}')
        .toSet();
    for (final value in payload['promptTemplates'] as List? ?? const []) {
      if (value is! Map) continue;
      final raw = Map<String, dynamic>.from(value);
      final identity =
          '${raw['name']}\u241f${raw['prefix']}\u241f${raw['suffix']}\u241f${raw['negativePrompt']}';
      final sourceId = raw['id']?.toString() ?? '';
      final existingBySourceId = sourceId.isEmpty
          ? null
          : prompts
              .where((item) =>
                  item.id == sourceId &&
                  item.prefix == (raw['prefix']?.toString() ?? '') &&
                  item.suffix == (raw['suffix']?.toString() ?? '') &&
                  item.negativePrompt ==
                      (raw['negativePrompt']?.toString() ?? ''))
              .firstOrNull;
      if (!promptIdentity.add(identity) || existingBySourceId != null) {
        counters.skipped++;
        continue;
      }
      raw['name'] = _uniqueLabel(promptNames, raw['name'], counters);
      if ((raw['id']?.toString() ?? '').isEmpty ||
          promptIds.contains(raw['id'])) {
        raw['id'] = _id();
      }
      promptIds.add(raw['id'].toString());
      prompts.add(PromptShortcutTemplate.fromJson(raw));
      counters.imported++;
    }

    final styles = List<StylePromptPreset>.from(settings.stylePromptPresets);
    final styleIds = styles.map((item) => item.id).toSet();
    final styleNames = styles.map((item) => item.name.toLowerCase()).toSet();
    for (final value in payload['stylePromptPresets'] as List? ?? const []) {
      if (value is! Map) continue;
      final raw = Map<String, dynamic>.from(value);
      final name = raw['name']?.toString() ?? '';
      final prompt = raw['prompt']?.toString() ?? '';
      final incomingPreviews = raw['previewImages'] as List? ?? const [];
      if (name.isEmpty || prompt.isEmpty) continue;
      var index = styles.indexWhere((item) =>
          item.prompt == prompt &&
          (item.name == name ||
              ((raw['id']?.toString() ?? '').isNotEmpty &&
                  item.id == raw['id']?.toString())));
      if (index < 0) {
        raw['name'] = _uniqueLabel(styleNames, name, counters);
        if ((raw['id']?.toString() ?? '').isEmpty ||
            styleIds.contains(raw['id'])) {
          raw['id'] = _id();
        }
        styleIds.add(raw['id'].toString());
        raw['previewImages'] = const [];
        styles.add(StylePromptPreset.fromJson(raw));
        index = styles.length - 1;
        counters.imported++;
      }
      styles[index].previewImages = await _restoreStylePreviews(
        bundle,
        styles[index].id,
        styles[index].previewImages,
        incomingPreviews,
        counters,
      );
    }
    settings.promptShortcuts = prompts;
    settings.stylePromptPresets = styles;
    settings.stylePromptPresetGroups = {
      'Default',
      ...settings.stylePromptPresetGroups,
      ...(payload['stylePromptPresetGroups'] as List? ?? const [])
          .map((value) => value.toString().trim())
          .where((value) => value.isNotEmpty),
      ...styles.map((style) => style.group),
    }.toList();

    final positivePrompts =
        List<PositivePromptPreset>.from(settings.positivePromptPresets);
    final positiveIds = positivePrompts.map((item) => item.id).toSet();
    final positiveNames =
        positivePrompts.map((item) => item.name.toLowerCase()).toSet();
    for (final value in payload['positivePromptPresets'] as List? ?? const []) {
      if (value is! Map) continue;
      final raw = Map<String, dynamic>.from(value);
      final name = raw['name']?.toString() ?? '';
      final prompt = raw['prompt']?.toString() ?? '';
      final incomingPreviews = raw['previewImages'] as List? ?? const [];
      if (name.isEmpty || prompt.trim().isEmpty) continue;
      var index = positivePrompts.indexWhere((item) =>
          item.prompt == prompt &&
          (item.name == name ||
              ((raw['id']?.toString() ?? '').isNotEmpty &&
                  item.id == raw['id']?.toString())));
      if (index < 0) {
        raw['name'] = _uniqueLabel(positiveNames, name, counters);
        if ((raw['id']?.toString() ?? '').isEmpty ||
            positiveIds.contains(raw['id'])) {
          raw['id'] = _id();
        }
        positiveIds.add(raw['id'].toString());
        raw['previewImages'] = const [];
        positivePrompts.add(PositivePromptPreset.fromJson(raw));
        index = positivePrompts.length - 1;
        counters.imported++;
      }
      positivePrompts[index].previewImages = await _restoreStylePreviews(
        bundle,
        positivePromptPresetStorageId(positivePrompts[index].id),
        positivePrompts[index].previewImages,
        incomingPreviews,
        counters,
      );
    }
    settings.positivePromptPresets = positivePrompts;
    return settings;
  }

  String _favoriteIdentity(Map<String, dynamic> value) {
    final recipe = value['recipe'];
    if (recipe is Map && (recipe['id']?.toString() ?? '').isNotEmpty) {
      return 'recipe:${recipe['id']}';
    }
    final direct = value['id']?.toString() ?? '';
    if (direct.isNotEmpty) return 'recipe:$direct';
    return 'json:${jsonEncode(value)}';
  }

  Map<String, dynamic> _mobileFavorite(Map<String, dynamic> portable) {
    final favorite = jsonDecode(jsonEncode(portable)) as Map<String, dynamic>;
    final nested = favorite['recipe'];
    final recipe =
        nested is Map ? Map<String, dynamic>.from(nested) : <String, dynamic>{};

    String readRecipeText(String key, [String fallback = '']) {
      final nestedValue = recipe[key]?.toString() ?? '';
      if (nestedValue.isNotEmpty) return nestedValue;
      final directValue = favorite[key]?.toString() ?? '';
      return directValue.isNotEmpty ? directValue : fallback;
    }

    final prompt = readRecipeText('prompt');
    final basePrompt = readRecipeText('basePrompt', prompt);
    final artists =
        (recipe['artists'] as List? ?? favorite['artists'] as List? ?? const [])
            .map((value) => value is Map
                ? value['name']?.toString().trim() ?? ''
                : value.toString().trim())
            .where((value) => value.isNotEmpty)
            .toList();
    var artistPrompt = readRecipeText('artistPrompt');
    if (artistPrompt.isEmpty) {
      final source = favorite['artists'] as List? ?? const [];
      artistPrompt = source
          .map((value) {
            if (value is! Map) return value.toString().trim();
            final name = value['name']?.toString().trim() ?? '';
            final weight = (value['weight'] as num?)?.toDouble() ?? 1.0;
            if (name.isEmpty) return '';
            final formatted = weight == weight.roundToDouble()
                ? weight.toInt().toString()
                : weight
                    .toStringAsFixed(2)
                    .replaceFirst(RegExp(r'0+$'), '')
                    .replaceFirst(RegExp(r'\.$'), '');
            return '$formatted::artist:$name ::';
          })
          .where((value) => value.isNotEmpty)
          .join(', ');
    }

    favorite['recipe'] = {
      'id': readRecipeText('id'),
      'prompt': prompt,
      'basePrompt': basePrompt,
      'artistPrompt': artistPrompt.isEmpty ? basePrompt : artistPrompt,
      'pairId': readRecipeText('pairId', readRecipeText('id')),
      'variant': readRecipeText(
        'variant',
        (favorite['mutations'] as List? ?? const []).isEmpty
            ? 'plain'
            : 'mutated',
      ),
      'artists': artists,
      'mutations': recipe['mutations'] as List? ??
          favorite['mutations'] as List? ??
          const [],
      'franchiseStyles': recipe['franchiseStyles'] as List? ??
          favorite['franchiseStyles'] as List? ??
          const [],
    };
    favorite['seed'] ??= favorite['generationSeed'];
    favorite['status'] = favorite['status']?.toString().isNotEmpty == true
        ? favorite['status']
        : 'done';
    favorite['liked'] = true;
    return favorite;
  }

  Future<void> _restoreArtistLibrary(
    _ArchiveBundle bundle,
    Map<String, dynamic> payload,
    List<HistoryItem> history,
    List<HistoryGroup> groups,
    Map<String, String> groupIds,
    Map<String, HistoryItem> hashes,
    Set<String> historyIds,
    _Counters counters,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    final collections = payload['collections'] is Map
        ? Map<String, dynamic>.from(payload['collections'] as Map)
        : const <String, dynamic>{};
    for (final entry in _artistPreferenceKeys.entries) {
      final current = <Map<String, dynamic>>[];
      try {
        current.addAll(
            (jsonDecode(prefs.getString(entry.value) ?? '[]') as List)
                .whereType<Map>()
                .map((item) => Map<String, dynamic>.from(item)));
      } catch (_) {}
      final identities = current.map(_favoriteIdentity).toSet();
      for (final value in collections[entry.key] as List? ?? const []) {
        if (value is! Map) continue;
        final portable = Map<String, dynamic>.from(value);
        final identity = _favoriteIdentity(portable);
        // Check identity before restoring the referenced image. Otherwise an
        // already-present favorite could leave an orphan history entry behind.
        if (identities.contains(identity)) {
          counters.skipped++;
          continue;
        }
        final favorite = _mobileFavorite(portable);
        final image = favorite['image'];
        if (image is Map) {
          final restored = await _restoreHistoryItem(
            bundle,
            Map<String, dynamic>.from(image),
            history,
            groups,
            groupIds,
            hashes,
            historyIds,
            counters,
          );
          favorite['image'] = restored?.toJson();
        }
        identities.add(_favoriteIdentity(favorite));
        current.add(favorite);
        counters.imported++;
      }
      await prefs.setString(entry.value, jsonEncode(current));
    }
  }

  Future<void> _restoreWorkspace(
      Map<String, dynamic> payload, _Counters counters) async {
    final prefs = await SharedPreferences.getInstance();
    for (final entry in payload.entries) {
      final key = entry.key;
      if (key.isEmpty ||
          _canonicalPreferenceKeys.contains(key) ||
          _artistPreferenceKeys.values.contains(key) ||
          prefs.containsKey(key)) {
        counters.skipped++;
        continue;
      }
      final value = entry.value;
      if (value is String) {
        await prefs.setString(key, value);
      } else if (value is bool) {
        await prefs.setBool(key, value);
      } else if (value is int) {
        await prefs.setInt(key, value);
      } else if (value is double) {
        await prefs.setDouble(key, value);
      } else if (value is List && value.every((item) => item is String)) {
        await prefs.setStringList(key, value.cast<String>());
      } else {
        counters.skipped++;
        continue;
      }
      counters.imported++;
    }
  }

  Future<Map<String, dynamic>?> _restoreAgentAttachment(
    _ArchiveBundle bundle,
    Map<String, dynamic> raw,
    Directory directory,
    Map<String, String> restored,
  ) async {
    final reference = _assetReference(raw['asset']);
    final bytes = _assetBytes(bundle, reference);
    if (reference == null || bytes == null) return null;
    final hash = reference['sha256'].toString();
    var filePath = restored[hash];
    if (filePath == null) {
      final requested = reference['originalName']?.toString() ??
          raw['name']?.toString() ??
          'attachment';
      var extension = _extension(requested).toLowerCase();
      if (!RegExp(r'^\.[a-z0-9]{1,8}$').hasMatch(extension)) extension = '.bin';
      final file =
          File('${directory.path}${Platform.pathSeparator}$hash$extension');
      if (!file.existsSync()) await file.writeAsBytes(bytes, flush: true);
      filePath = file.path;
      restored[hash] = filePath;
    }
    final json = Map<String, dynamic>.from(raw)
      ..remove('asset')
      ..remove('fileUrl')
      ..['filePath'] = filePath
      ..['size'] = bytes.length;
    return json;
  }

  Future<AgentMergeResult> _restoreAgentWorkspace(
    _ArchiveBundle bundle,
    Map<String, dynamic> payload,
  ) async {
    final directory = Directory(
      '${(await storage.agentAttachmentsDirectory()).path}${Platform.pathSeparator}restored',
    );
    if (!directory.existsSync()) directory.createSync(recursive: true);
    final restored = <String, String>{};
    final conversations = <Map<String, dynamic>>[];
    for (final value in payload['conversations'] as List? ?? const []) {
      if (value is! Map) continue;
      final conversation = Map<String, dynamic>.from(value)
        ..remove('runtimeSessionId')
        ..['status'] = 'idle';
      final drafts = <Map<String, dynamic>>[];
      for (final attachment
          in conversation['draftAttachments'] as List? ?? const []) {
        if (attachment is! Map) continue;
        final item = await _restoreAgentAttachment(
          bundle,
          Map<String, dynamic>.from(attachment),
          directory,
          restored,
        );
        if (item != null) drafts.add(item);
      }
      conversation['draftAttachments'] = drafts;
      final messages = <Map<String, dynamic>>[];
      for (final messageValue
          in conversation['messages'] as List? ?? const []) {
        if (messageValue is! Map) continue;
        final message = Map<String, dynamic>.from(messageValue)
          ..remove('runtimeMessageId');
        final attachments = <Map<String, dynamic>>[];
        for (final attachment in message['attachments'] as List? ?? const []) {
          if (attachment is! Map) continue;
          final item = await _restoreAgentAttachment(
            bundle,
            Map<String, dynamic>.from(attachment),
            directory,
            restored,
          );
          if (item != null) attachments.add(item);
        }
        message['attachments'] = attachments;
        final tools = <Map<String, dynamic>>[];
        for (final toolValue in message['tools'] as List? ?? const []) {
          if (toolValue is! Map) continue;
          final tool = Map<String, dynamic>.from(toolValue);
          final generated = <Map<String, dynamic>>[];
          for (final attachment
              in tool['generatedImages'] as List? ?? const []) {
            if (attachment is! Map) continue;
            final item = await _restoreAgentAttachment(
              bundle,
              Map<String, dynamic>.from(attachment),
              directory,
              restored,
            );
            if (item != null) generated.add(item);
          }
          tool['generatedImages'] = generated;
          tools.add(tool);
        }
        message['tools'] = tools;
        messages.add(message);
      }
      conversation['messages'] = messages;
      conversations.add(conversation);
    }
    payload['conversations'] = conversations;
    final incoming = AgentWorkspace.fromJson(payload);
    final result = mergeAgentWorkspaces(
      await storage.getAgentWorkspace(),
      incoming,
    );
    await storage.setAgentWorkspace(result.workspace);
    return result;
  }

  Future<DataBackupImportReport> importBackup(
    String filePath,
    Set<DataBackupCategory> requested, {
    required bool confirmConfigurationOverwrite,
  }) async {
    if (requested.isEmpty) throw ArgumentError('Select at least one category.');
    if ((requested.contains(DataBackupCategory.configuration) ||
            requested.contains(DataBackupCategory.apiCredentials)) &&
        !confirmConfigurationOverwrite) {
      throw StateError(
          'Configuration overwrite requires a second confirmation.');
    }
    final bundle = await _loadArchive(filePath);
    // No write is permitted until a complete rescue archive reaches disk.
    final rescue = await createBackup(
      DataBackupCategory.values.toSet(),
      includeAssets: true,
      prefix: 'before-import',
      internal: true,
    );
    final counters = _Counters();
    var settings = await storage.getSettings();

    if (requested.contains(DataBackupCategory.configuration)) {
      final canonical = _readJson(bundle, 'data/configuration.json');
      if (canonical is! Map) {
        throw const FormatException(
            'Backup has no valid configuration payload.');
      }
      final current = settings.toJson();
      final incoming = Map<String, dynamic>.from(canonical);
      // Configuration is the only overwrite category, but device-specific
      // output paths, API values, and merge-only preset libraries stay intact.
      incoming['imageOutputDir'] = current['imageOutputDir'];
      incoming['backupDir'] = current['backupDir'];
      for (final key in _apiSettingKeys) {
        incoming[key] = current[key];
      }
      for (final key in _promptSettingKeys) {
        incoming[key] = current[key];
      }
      settings = AppSettings.fromJson(incoming);
      dynamic incomingParams = _readJson(bundle, 'data/generation-params.json');
      if (incomingParams is! Map) {
        final mobile = _readJson(bundle, 'data/mobile-configuration.json');
        incomingParams = mobile is Map ? mobile['params'] : null;
      }
      if (incomingParams is Map) {
        await storage.setParams(
            GenerateParams.fromJson(Map<String, dynamic>.from(incomingParams)));
      }
      counters.imported += incoming.length;
    }

    final groups = await storage.getGroups();
    final groupIds = <String, String>{};
    final historyPayload =
        _readJson(bundle, 'data/image-history.json', const {});
    if (requested.contains(DataBackupCategory.imageHistory) &&
        historyPayload is Map) {
      final names = {
        for (final group in groups) group.name.toLowerCase(): group
      };
      final ids = groups.map((group) => group.id).toSet();
      for (final value in historyPayload['groups'] as List? ?? const []) {
        if (value is! Map) continue;
        final raw = Map<String, dynamic>.from(value);
        final sourceId = raw['id']?.toString() ?? '';
        final name = raw['name']?.toString().trim() ?? '';
        if (name.isEmpty) continue;
        final existing = names[name.toLowerCase()];
        if (existing != null) {
          groupIds[sourceId] = existing.id;
          continue;
        }
        var id = sourceId;
        if (id.isEmpty || ids.contains(id)) id = _id();
        final group = HistoryGroup(
          id: id,
          name: name,
          createdAt: raw['createdAt']?.toString() ??
              DateTime.now().toUtc().toIso8601String(),
        );
        groups.add(group);
        names[name.toLowerCase()] = group;
        ids.add(id);
        groupIds[sourceId] = id;
      }
      await storage.writeGroups(groups);
    }

    final history = await storage.getHistory();
    final historyHashes = await _historyHashes(history);
    final historyIds = history.map((item) => item.id).toSet();
    if (requested.contains(DataBackupCategory.imageHistory) &&
        historyPayload is Map) {
      for (final value in historyPayload['items'] as List? ?? const []) {
        if (value is Map) {
          await _restoreHistoryItem(
            bundle,
            Map<String, dynamic>.from(value),
            history,
            groups,
            groupIds,
            historyHashes,
            historyIds,
            counters,
          );
        }
      }
    }

    if (requested.contains(DataBackupCategory.textHistory)) {
      final payload = _readJson(bundle, 'data/text-history.json', const {});
      if (payload is Map) {
        await _restoreTextHistory(
            bundle, Map<String, dynamic>.from(payload), counters);
      }
    }

    if (requested.contains(DataBackupCategory.artistLibrary)) {
      final payload = _readJson(bundle, 'data/artist-library.json', const {});
      if (payload is Map) {
        await _restoreArtistLibrary(
          bundle,
          Map<String, dynamic>.from(payload),
          history,
          groups,
          groupIds,
          historyHashes,
          historyIds,
          counters,
        );
      }
    }

    if (requested.contains(DataBackupCategory.referencePresets)) {
      final payload =
          _readJson(bundle, 'data/reference-presets.json', const {});
      if (payload is Map) {
        await _restoreReferencePresets(
            bundle, Map<String, dynamic>.from(payload), counters);
      }
    }

    if (requested.contains(DataBackupCategory.promptPresets)) {
      final payload = _readJson(bundle, 'data/prompt-presets.json', const {});
      if (payload is Map) {
        settings = await _restorePromptPresets(
            bundle, Map<String, dynamic>.from(payload), settings, counters);
      }
    }

    if (requested.contains(DataBackupCategory.apiCredentials)) {
      final payload = _readJson(bundle, 'data/api-credentials.json');
      if (payload is! Map) {
        throw const FormatException('Backup has no valid API payload.');
      }
      final json = Map<String, dynamic>.from(payload);
      final api = json['settings'] is Map
          ? Map<String, dynamic>.from(json['settings'] as Map)
          : <String, dynamic>{};
      final merged = settings.toJson();
      for (final key in _apiSettingKeys) {
        if (api.containsKey(key)) merged[key] = api[key];
      }
      settings = AppSettings.fromJson(merged);
      if (json['token'] is String) {
        await storage.setToken(json['token'] as String);
      }
      if (api['visionApiKey'] is String) {
        await storage.setVisionKey(api['visionApiKey'] as String);
      }
      if (api['convertApiKey'] is String) {
        await storage.setConvertKey(api['convertApiKey'] as String);
      }
      if (api['agentApiKey'] is String) {
        await storage.setAgentApiKey(api['agentApiKey'] as String);
      }
      if (api['tagServerApiKey'] is String) {
        await storage.setTagKey(api['tagServerApiKey'] as String);
      }
      if (api['baiduSecret'] is String) {
        await storage.setBaiduSecret(api['baiduSecret'] as String);
      }
      counters.imported += api.length + 1;
    }

    await storage.setSettings(settings);
    history.sort((left, right) => right.createdAt.compareTo(left.createdAt));
    await storage.writeHistory(history);

    if (requested.contains(DataBackupCategory.workspaceData)) {
      final mobile = _readJson(bundle, 'data/mobile-state.json');
      if (mobile is Map) {
        await _restoreWorkspace(Map<String, dynamic>.from(mobile), counters);
      } else {
        // Desktop archives only have renderer workspace strings. They remain
        // namespaced and non-destructive on mobile.
        final renderer = _readJson(bundle, 'data/workspace.json', const {});
        if (renderer is Map) {
          await _restoreWorkspace(
              Map<String, dynamic>.from(renderer), counters);
        }
      }
    }

    if (requested.contains(DataBackupCategory.agentWorkspace)) {
      final payload = _readJson(bundle, 'data/agent-workspace.json');
      if (payload is Map) {
        final result = await _restoreAgentWorkspace(
          bundle,
          Map<String, dynamic>.from(payload),
        );
        counters
          ..imported += result.imported
          ..skipped += result.skipped
          ..renamed += result.renamed;
      }
    }

    return DataBackupImportReport(
      imported: counters.imported,
      skipped: counters.skipped,
      renamed: counters.renamed,
      rescueBackupPath: rescue.path,
    );
  }

  Future<List<File>> _automaticFiles([Directory? root]) async {
    final directory = root ?? await backupDirectory();
    final files = <File>[];
    await for (final entity in directory.list()) {
      if (entity is File &&
          _basename(entity.path).startsWith('auto-') &&
          entity.path.endsWith('.naisbackup')) {
        files.add(entity);
      }
    }
    files.sort((left, right) =>
        right.lastModifiedSync().compareTo(left.lastModifiedSync()));
    return files;
  }

  Future<DataBackupStatus> status() async {
    final settings = await storage.getSettings();
    final directory = await backupDirectory(settings: settings);
    final files = await _automaticFiles(directory);
    final configured = settings.backupDir.trim();
    final usingFallbackDirectory = configured.isNotEmpty &&
        Directory(configured).absolute.path != directory.absolute.path;
    final latest = files.isEmpty ? null : files.first.lastModifiedSync();
    final due = latest == null ||
        DateTime.now().difference(latest).inMinutes >=
            settings.autoBackupIntervalHours * 60;
    var bytes = 0;
    for (final file in files) {
      try {
        bytes += await file.length();
      } catch (_) {}
    }
    return DataBackupStatus(
      directory: directory.path,
      usingFallbackDirectory: usingFallbackDirectory,
      count: files.length,
      totalBytes: bytes,
      latest: latest,
      due: due,
    );
  }

  Future<File?> runAutomaticBackup({bool force = false}) async {
    final settings = await storage.getSettings();
    if (!settings.autoBackupEnabled && !force) return null;
    final current = await status();
    if (!force && !current.due) return null;
    final file = await createBackup(
      DataBackupCategory.values.toSet(),
      includeAssets: settings.autoBackupIncludeImages,
      prefix: 'auto',
      internal: true,
    );
    final files = await _automaticFiles();
    final keep = settings.autoBackupRetentionCount.clamp(1, 100).toInt();
    for (final obsolete in files.skip(keep)) {
      try {
        await obsolete.delete();
      } catch (_) {}
    }
    return file;
  }
}

extension<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;
    return iterator.moveNext() ? iterator.current : null;
  }

  T? get lastOrNull {
    if (isEmpty) return null;
    return last;
  }
}

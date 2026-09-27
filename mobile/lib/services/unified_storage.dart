import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'storage_permission.dart';

/// User data only. Credentials, native executables and editable plugin code
/// remain in app-private storage. The private pointer commits last.
class UnifiedStorage {
  static const channel = MethodChannel('langbai.novelai/storage');
  static const agentChannel = MethodChannel('langbai.novelai/local_agent');
  static Directory? active;
  static String? candidate;
  static Future<void>? _loading;
  static bool migrating = false;
  static const dataKeys = {
    'agent_workspace_v1': 'data/conversations-and-characters.json',
    'gen_params': 'data/generation-parameters.json',
    'history_index_v2': 'data/image-history.json',
    'history_groups': 'data/image-groups.json',
    'reference_preset_library_v1': 'data/reference-presets.json',
    'character_prompts_v1': 'data/character-prompts.json',
    'comic_project_v2': 'data/comic-project.json',
    'batch_redraw_project_v1': 'data/batch-redraw-project.json',
    'texttool_convert_history_v1': 'data/conversion-history.json',
    'texttool_reverse_history_v1': 'data/reverse-history.json',
  };
  static const presetKeys = [
    'stylePromptPresets',
    'stylePromptPresetGroups',
    'positivePromptPresets',
    'characterPromptPresets',
    'promptChunks',
    'promptShortcuts',
    'reversePromptTemplates',
    'reversePromptTemplatesV45',
    'convertPromptTemplatesV45',
    'comicAnalyzePromptTemplates',
    'convertPromptTemplates',
    'reverseConvertPromptPresets'
  ];
  static const folders = [
    'images',
    'LangbaiWorkspace',
    'style-prompt-previews',
    'reference-presets',
    'backups',
    'imported-sources',
    'comic-projects',
    'portable-project-capsules'
  ];
  static const agentFolders = [
    'roleplay',
    'sessions',
    'mindspace-session-memory'
  ];

  static Future<void> initialize() => !Platform.isAndroid
      ? Future.value()
      : _loading ??= _load().catchError((Object error, StackTrace stack) {
          _loading = null;
          Error.throwWithStackTrace(error, stack);
        });
  static Future<void> _load() async {
    if (!Platform.isAndroid) return;
    final info =
        await channel.invokeMapMethod<String, dynamic>('unifiedStorageInfo');
    candidate = info?['target'] as String?;
    final path = info?['activeRoot'] as String?;
    if (path != null && path.isNotEmpty) {
      if (!await StoragePermission.hasAllFilesAccess()) {
        throw FileSystemException('统一目录的存储授权已撤回，请重新授权；未切回旧资料。', path);
      }
      final root = Directory(path);
      if (!File(p.join(path, 'storage-manifest.json')).existsSync()) {
        throw FileSystemException('统一目录缺失，未创建空资料替代。', path);
      }
      active = root;
    }
  }

  static Future<Directory> documents() async {
    await initialize();
    return active ?? await getApplicationDocumentsDirectory();
  }

  static Future<UnifiedPreferences> preferences() async {
    await initialize();
    return UnifiedPreferences(await SharedPreferences.getInstance());
  }

  static Future<Map<String, dynamic>> migrate(
      {void Function(String)? progress}) async {
    if (migrating) throw StateError('正在迁移');
    if (!Platform.isAndroid) throw StateError('此迁移入口仅用于 Android');
    if (!await StoragePermission.hasAllFilesAccess()) {
      throw StateError('请先授予存储访问权限，然后点击迁移');
    }
    migrating = true;
    Map<String, dynamic>? lock;
    try {
      lock = await agentChannel.invokeMapMethod<String, dynamic>('lockData');
      final info = (await channel
          .invokeMapMethod<String, dynamic>('unifiedStorageInfo'))!;
      if ((info['activeRoot'] as String?)?.isNotEmpty == true) {
        _loading = null;
        await initialize();
        return {'root': active!.path, 'alreadyActive': true};
      }
      final prefs = await SharedPreferences.getInstance();
      final snapshot = {for (final key in prefs.getKeys()) key: prefs.get(key)};
      final docs = await getApplicationDocumentsDirectory();
      final target = Directory(info['target'] as String);
      final agent = Directory(info['agentRoot'] as String);
      await UnifiedPreferences.flushWrites();
      final available = info['availableBytes'] as int?;
      if (available != null) {
        final required = await estimateCopyBytes(docs, agent);
        if (available < required + 16 * 1024 * 1024) {
          throw FileSystemException(
              '可用空间不足；复制需要约 ${((required + 16 * 1024 * 1024) / 1048576).ceil()} MiB，原数据未移动。',
              target.path);
        }
      }
      final result = await migrateFiles(
          documents: docs,
          target: target,
          agentRoot: agent,
          preferences: snapshot,
          progress: progress);
      // Fail before activation if app data changed while copying. Old files and
      // the verified copy both remain; a retry can never silently overwrite it.
      if (jsonEncode(snapshot) !=
          jsonEncode({for (final k in prefs.getKeys()) k: prefs.get(k)})) {
        throw StateError('迁移期间资料发生变化，尚未切换目录。已保留副本，请先核对目标目录再迁移。');
      }
      final privateBackup = File(p.join(docs.path,
          'storage-migration-${DateTime.now().millisecondsSinceEpoch}.json'));
      await privateBackup.writeAsString(jsonEncode(snapshot), flush: true);
      await channel
          .invokeMethod('activateUnifiedStorage', {'root': target.path});
      active = target;
      candidate = target.path;
      _loading = Future.value();
      return {...result, 'privateBackup': privateBackup.path};
    } finally {
      try {
        if (lock != null) {
          await agentChannel
              .invokeMethod('unlockData', {'token': lock['token']});
        }
      } finally {
        migrating = false;
      }
    }
  }

  static Future<int> estimateCopyBytes(
      Directory documents, Directory agentRoot) async {
    var total = 0;
    final roots = [
      for (final folder in folders) Directory(p.join(documents.path, folder)),
      for (final folder in agentFolders)
        Directory(p.join(agentRoot.path, 'user-home', folder)),
      for (final folder in ['backups', 'workspace', 'downloads'])
        Directory(p.join(agentRoot.path, folder)),
    ];
    for (final root in roots) {
      if (!await root.exists()) continue;
      await for (final entry
          in root.list(recursive: true, followLinks: false)) {
        if (entry is File) total += await entry.length();
      }
    }
    return total;
  }

  static Future<void> rollback() async {
    final lock =
        await agentChannel.invokeMapMethod<String, dynamic>('lockData');
    try {
      await channel.invokeMethod('deactivateUnifiedStorage');
      active = null;
      _loading = null;
      await initialize();
    } finally {
      if (lock != null) {
        await agentChannel.invokeMethod('unlockData', {'token': lock['token']});
      }
    }
  }

  /// Pure filesystem transaction, exercised on temporary directories in tests.
  /// Existing destination contents are never merged or overwritten implicitly.
  static Future<Map<String, dynamic>> migrateFiles(
      {required Directory documents,
      required Directory target,
      required Directory agentRoot,
      required Map<String, dynamic> preferences,
      void Function(String)? progress}) async {
    if (p.isWithin(documents.path, target.path) ||
        p.equals(documents.path, target.path)) throw StateError('目标目录与原目录重叠');
    if (await target.exists()) {
      throw FileSystemException('目标目录已存在；保留其内容，请先核对，未覆盖。', target.path);
    }
    final stage = Directory(
        '${target.path}.migrating-${DateTime.now().microsecondsSinceEpoch}');
    await stage.create(recursive: true);
    final records = <Map<String, dynamic>>[];
    final sources = <String, String>{};
    final replacements = <String, String>{};
    Future<void> copyTree(Directory from, String relative) async {
      if (!await from.exists()) return;
      if (await FileSystemEntity.type(from.path, followLinks: false) ==
          FileSystemEntityType.link) {
        throw FileSystemException('数据根目录包含符号链接', from.path);
      }
      replacements[from.absolute.path] = p.join(target.path, relative);
      await for (final entry
          in from.list(recursive: true, followLinks: false)) {
        final type =
            await FileSystemEntity.type(entry.path, followLinks: false);
        if (type == FileSystemEntityType.link) {
          throw FileSystemException('数据目录包含符号链接，未跟随迁移。', entry.path);
        }
        if (type != FileSystemEntityType.file) continue;
        final name = p.join(relative, p.relative(entry.path, from: from.path));
        final destination = File(p.join(stage.path, name));
        await destination.parent.create(recursive: true);
        progress?.call('复制 $name');
        final before =
            (await sha256.bind(File(entry.path).openRead()).first).toString();
        await File(entry.path).copy(destination.path);
        final after =
            (await sha256.bind(destination.openRead()).first).toString();
        final still =
            (await sha256.bind(File(entry.path).openRead()).first).toString();
        if (before != after || before != still) {
          throw FileSystemException('源文件变化或校验失败；未切换目录。', entry.path);
        }
        sources[entry.path] = before;
        records.add({
          'path': name,
          'sha256': after,
          'bytes': await destination.length()
        });
      }
    }

    for (final folder in folders) {
      await copyTree(Directory(p.join(documents.path, folder)), folder);
    }
    for (final folder in agentFolders) {
      await copyTree(Directory(p.join(agentRoot.path, 'user-home', folder)),
          p.join('TavernAgent', 'data', folder));
    }
    await copyTree(
        Directory(p.join(agentRoot.path, 'backups')), 'backups/agent');
    await copyTree(Directory(p.join(agentRoot.path, 'workspace')),
        'TavernAgent/workspace');
    await copyTree(Directory(p.join(agentRoot.path, 'downloads')),
        'models/agent-downloads');
    dynamic rebase(dynamic value) {
      if (value is String) {
        for (final entry in replacements.entries) {
          if (value == entry.key || p.isWithin(entry.key, value)) {
            return p.join(entry.value, p.relative(value, from: entry.key));
          }
        }
        return value;
      }
      if (value is List) return value.map(rebase).toList();
      if (value is Map) return value.map((k, v) => MapEntry(k, rebase(v)));
      return value;
    }

    Future<void> writeJson(String name, dynamic value) async {
      final file = File(p.join(stage.path, name));
      await file.parent.create(recursive: true);
      await file.writeAsString(jsonEncode(rebase(value)), flush: true);
      records.add({
        'path': name,
        'sha256': (await sha256.bind(file.openRead()).first).toString(),
        'bytes': await file.length()
      });
    }

    for (final entry in dataKeys.entries) {
      final raw = preferences[entry.key];
      if (raw is String) await writeJson(entry.value, jsonDecode(raw));
    }
    final settings =
        jsonDecode(preferences['app_settings'] as String? ?? '{}') as Map;
    await writeJson('presets/prompt-presets.json', {
      for (final key in presetKeys)
        if (settings.containsKey(key)) key: settings[key]
    });
    for (final dir in [
      'images',
      'models',
      'backups',
      'presets',
      'data',
      'TavernAgent/workspace',
      ...agentFolders.map((s) => 'TavernAgent/data/$s')
    ]) {
      await Directory(p.join(stage.path, dir)).create(recursive: true);
    }
    // A second complete verification catches interruptions before the pointer
    // is committed. Never remove sources, including on failure.
    for (final entry in records) {
      if ((await sha256
                  .bind(File(p.join(stage.path, entry['path'] as String))
                      .openRead())
                  .first)
              .toString() !=
          entry['sha256']) throw StateError('迁移校验失败');
    }
    for (final entry in sources.entries) {
      if ((await sha256.bind(File(entry.key).openRead()).first).toString() !=
          entry.value) {
        throw FileSystemException('迁移期间源文件发生变化，原目录继续使用。', entry.key);
      }
    }
    final manifest = {
      'format': 1,
      'source': documents.path,
      'createdAt': DateTime.now().toUtc().toIso8601String(),
      'files': records,
      'oldDataRetained': true
    };
    await File(p.join(stage.path, 'storage-manifest.json'))
        .writeAsString(jsonEncode(manifest), flush: true);
    await File(p.join(stage.path, 'README.txt')).writeAsString(
        'Langbai Studio 用户数据目录\nimages：图片；presets：提示词预设；data：对话、角色、历史与参数；models：下载的模型/运行包；backups：备份；TavernAgent/data：新版酒馆对话与角色库。\n密钥、插件代码与可执行运行环境仍在应用私有目录。\n旧资料未删除。设置→数据与存储可查看迁移状态。完整恢复请使用 .naisbackup 或酒馆备份入口，勿在程序运行中手工覆盖文件。\n',
        flush: true);
    await stage.rename(target.path);
    return {
      'root': target.path,
      'files': records.length,
      'bytes': records.fold<int>(0, (n, e) => n + (e['bytes'] as int)),
      'oldDataRetained': true
    };
  }
}

class UnifiedPreferences {
  final SharedPreferences private;
  UnifiedPreferences(this.private);
  File? _file(String key) => UnifiedStorage.active == null ||
          !UnifiedStorage.dataKeys.containsKey(key)
      ? null
      : File(
          p.join(UnifiedStorage.active!.path, UnifiedStorage.dataKeys[key]!));
  String? getString(String key) {
    final file = _file(key);
    if (file != null) {
      if (file.existsSync()) return file.readAsStringSync();
      final manifest = jsonDecode(
          File(p.join(UnifiedStorage.active!.path, 'storage-manifest.json'))
              .readAsStringSync()) as Map;
      if ((manifest['files'] as List)
          .any((e) => e['path'] == UnifiedStorage.dataKeys[key])) {
        throw FileSystemException('已迁移的资料文件缺失，未用空资料替代。', file.path);
      }
      return null;
    }
    final raw = private.getString(key);
    if (key != 'app_settings' || UnifiedStorage.active == null) return raw;
    final presets = File(
        p.join(UnifiedStorage.active!.path, 'presets/prompt-presets.json'));
    final base = jsonDecode(raw ?? '{}') as Map<String, dynamic>;
    for (final key in UnifiedStorage.presetKeys) {
      base.remove(key);
    }
    base.addAll(Map<String, dynamic>.from(
        jsonDecode(presets.readAsStringSync()) as Map));
    return jsonEncode(base);
  }

  Future<bool> setString(String key, String value) async {
    if (UnifiedStorage.migrating) throw StateError('数据迁移期间暂停写入');
    final file = _file(key);
    if (file != null) {
      await atomicJson(file, value);
      return true;
    }
    if (key == 'app_settings' && UnifiedStorage.active != null) {
      final settings = jsonDecode(value) as Map;
      await atomicJson(
          File(p.join(
              UnifiedStorage.active!.path, 'presets/prompt-presets.json')),
          jsonEncode({
            for (final k in UnifiedStorage.presetKeys)
              if (settings.containsKey(k)) k: settings[k]
          }));
      final old = jsonDecode(private.getString(key) ?? '{}') as Map;
      for (final k in UnifiedStorage.presetKeys) {
        settings.remove(k);
        if (old.containsKey(k)) settings[k] = old[k];
      }
      return private.setString(key, jsonEncode(settings));
    }
    return private.setString(key, value);
  }

  static final Map<String, Future<void>> _writes = {};
  static Future<void> flushWrites() async {
    await Future.wait(_writes.values.toList());
  }

  static Future<void> atomicJson(File file, String value) {
    final previous = _writes[file.path] ?? Future<void>.value();
    final next = previous
        .catchError((Object _) {})
        .then((_) => _atomicJson(file, value));
    _writes[file.path] = next;
    return next.whenComplete(() {
      if (identical(_writes[file.path], next)) _writes.remove(file.path);
    });
  }

  static Future<void> _atomicJson(File file, String value) async {
    jsonDecode(value);
    await file.parent.create(recursive: true);
    final temp =
        File('${file.path}.${DateTime.now().microsecondsSinceEpoch}.tmp');
    await temp.writeAsString(value, flush: true);
    await temp.rename(file.path);
  }

  List<String>? getStringList(String key) => private.getStringList(key);
  Future<bool> setStringList(String key, List<String> value) =>
      private.setStringList(key, value);
  bool? getBool(String key) => private.getBool(key);
  Future<bool> setBool(String key, bool value) => private.setBool(key, value);
  Future<bool> remove(String key) => private.remove(key);
}

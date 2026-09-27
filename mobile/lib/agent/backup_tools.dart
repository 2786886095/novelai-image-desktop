import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path/path.dart' as p;
import '../services/data_backup_service.dart';
import '../state/app_state.dart';

/// Handles are local and session-bound. Archive bodies and credentials never enter tool results.
class AgentBackupTools {
  final AppState app;
  final DataBackupService service;
  final Future<void> Function()? refresh;
  final _catalog = <String, String>{};
  final _checks = <String, Map<String, dynamic>>{};
  AgentBackupTools(this.app, {DataBackupService? service, this.refresh})
      : service = service ?? DataBackupService(app.storage);
  String _hash(Object value) =>
      sha256.convert(utf8.encode(jsonEncode(value))).toString();
  Future<String> _digest(String file) async =>
      (await sha256.bind(File(file).openRead()).first).toString();
  Future<String> _revision() async {
    if (app.busy || app.generationQueueRunning) {
      throw StateError('请先结束生成任务，再备份或恢复');
    }
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys().toList()..sort();
    return _hash([
      app.params.toJson(),
      app.settings.toJson(),

      {for (final key in keys) key: prefs.get(key)},
      app.history.map((x) => x.toJson()).toList(),
      app.groups.map((x) => x.toJson()).toList(),
      app.referencePresets.map((x) => x.toJson()).toList(),
      app.convertHistory.map((x) => x.toJson()).toList(),
      app.reverseHistory.map((x) => x.toJson()).toList()
    ]);
  }

  Map<String, dynamic> _validate(Map<String, dynamic> args) {
    final action = args['action'];
    final allowed = switch (action) {
      'list' => ['action', 'offset', 'limit'],
      'create' => ['action', 'categories'],
      'inspect' => ['action', 'backupId', 'categories'],
      'restore' => ['action', 'inspectionId'],
      _ => throw StateError('备份操作应为 list/create/inspect/restore')
    };
    for (final key in args.keys) {
      if (!allowed.contains(key)) throw StateError('未知备份参数：$key');
    }
    for (final key in action == 'inspect'
        ? ['backupId']
        : action == 'restore'
            ? ['inspectionId']
            : <String>[]) {
      if (args[key] is! String || args[key].isEmpty || args[key].length > 100) {
        throw StateError('请先读取有效的备份编号');
      }
    }
    final categories = args['categories'];
    if (categories != null &&
        (categories is! List ||
            categories.isEmpty ||
            categories.length > DataBackupCategory.values.length ||
            categories.any((x) => DataBackupCategory.parse(x) == null) ||
            categories.toSet().length != categories.length)) {
      throw StateError('备份分类无效');
    }
    final offset = args['offset'] ?? 0, limit = args['limit'] ?? 20;
    if (offset is! int ||
        offset < 0 ||
        offset > 1000000 ||
        limit is! int ||
        limit < 1 ||
        limit > 50) throw StateError('备份分页参数无效');
    return args;
  }

  Future<String> _resolve(String id) async {
    final file = _catalog[id];
    if (file == null) throw StateError('备份编号已过期，请先列出备份');
    final root = await (await service.backupDirectory()).resolveSymbolicLinks();
    if (await FileSystemEntity.type(file, followLinks: false) !=
            FileSystemEntityType.file ||
        p.dirname(await File(file).resolveSymbolicLinks()) != root) {
      throw StateError('备份位置已改变，请重新列出备份');
    }
    return file;
  }

  Map<String, dynamic> approvalSummary(
      Map<String, dynamic> args, String session) {
    _validate(args);
    if (args['action'] == 'restore') {
      final check = _checks[args['inspectionId']];
      if (check == null ||
          check['session'] != session ||
          DateTime.now().millisecondsSinceEpoch > check['expires']) {
        throw StateError('恢复检查已过期或不属于当前会话');
      }
      return {
        'action': 'restore',
        '备份': p.basename(check['file']),
        'categories': check['categories'],
        '说明': '先保存恢复前备份。所选配置覆盖，已有素材合并保留。'
      };
    }
    return {...args, '说明': '备份保存在本机；选择 API 凭据分类时文件会包含密钥，不上传。'};
  }

  Future<Map<String, dynamic>> execute(
      Map<String, dynamic> input, String session) async {
    final args = _validate(input), action = args['action'];
    if (action == 'list') {
      final directory = await service.backupDirectory(),
          items = <Map<String, dynamic>>[];
      await for (final file in directory.list(followLinks: false)) {
        if (file is! File || !file.path.endsWith('.naisbackup')) continue;
        final stat = await file.stat(), id = _hash(file.path);
        _catalog[id] = file.path;
        items.add({
          'id': id,
          'name': p.basename(file.path),
          'bytes': stat.size,
          'modifiedAt': stat.modified.toUtc().toIso8601String()
        });
      }
      items.sort(
          (a, b) => (b['modifiedAt'] as String).compareTo(a['modifiedAt']));
      final offset = args['offset'] ?? 0, limit = args['limit'] ?? 20;
      return {
        'directory': directory.path,
        'items': items.skip(offset).take(limit).toList(),
        'total': items.length,
        'nextOffset': offset + limit < items.length ? offset + limit : null,
        'categories': DataBackupCategory.values.map((x) => x.id).toList(),
        'restoreInstructions': '选择备份编号检查内容，再在 Agent 内确认恢复。'
      };
    }
    if (action == 'create') {
      await _revision();
      final selected = (args['categories'] as List? ??
              DataBackupCategory.values
                  .where((x) => x != DataBackupCategory.apiCredentials)
                  .map((x) => x.id)
                  .toList())
          .map((x) => DataBackupCategory.parse(x)!)
          .toSet();
      final file = await service.createBackup(selected, internal: true),
          info = await service.inspect(file.path);
      return {
        'created': true,
        'path': file.path,
        'bytes': await file.length(),
        'categories': info.categories.map((x) => x.toJson()).toList(),
        'restoreInstructions': '在 Agent 中列出备份并检查恢复，或在软件「备份与恢复」中选择此文件。'
      };
    }
    if (action == 'inspect') {
      final file = await _resolve(args['backupId']),
          digest = await _digest(file),
          info = await service.inspect(file);
      final available = info.categories.map((x) => x.category.id).toList(),
          categories = List<String>.from(args['categories'] ??
              available.where((x) => x != 'apiCredentials'));
      if (categories.isEmpty || categories.any((x) => !available.contains(x))) {
        throw StateError('所选分类不在此备份中');
      }
      final revision = await _revision();
      if (await _digest(file) != digest) throw StateError('检查期间备份已变化');
      _checks.removeWhere(
          (_, v) => v['expires'] < DateTime.now().millisecondsSinceEpoch);
      if (_checks.length >= 50) throw StateError('待恢复检查过多，请稍后重试');
      final id = List.generate(
          24,
          (_) => Random.secure()
              .nextInt(256)
              .toRadixString(16)
              .padLeft(2, '0')).join();
      _checks[id] = {
        'file': file,
        'backupId': args['backupId'],
        'digest': digest,
        'revision': revision,
        'categories': categories,
        'expires': DateTime.now().millisecondsSinceEpoch + 600000,
        'session': session
      };
      return {
        'inspectionId': id,
        'name': p.basename(file),
        'createdAt': info.createdAt.toIso8601String(),
        'sourcePlatform': info.sourcePlatform,
        'categories': categories,
        'availableCategories': info.categories.map((x) => x.toJson()).toList(),
        'expiresInSeconds': 600,
        'conflictPolicy': '已有素材合并保留，冲突重命名；所选配置覆盖；设备路径保留；现有酒馆工作区不覆盖。',
        'next': '调用 restore 并传 inspectionId，在 Agent 内确认。'
      };
    }
    approvalSummary(args, session);
    final check = _checks[args['inspectionId']]!;
    final file = await _resolve(check['backupId']);
    if (await _revision() != check['revision'] ||
        await _digest(file) != check['digest']) {
      throw StateError('确认期间资料或备份已变化；请重新检查，尚未恢复');
    }
    _checks.remove(args['inspectionId']);
    final result = await service.importBackup(
        file,
        (check['categories'] as List)
            .map((x) => DataBackupCategory.parse(x)!)
            .toSet(),
        confirmConfigurationOverwrite: true);
    var refreshed = false;
    try {
      await (refresh?.call() ?? app.load());
      refreshed = true;
    } catch (_) {/* durable restore remains successful */}
    return {
      'restored': true,
      'imported': result.imported,
      'skipped': result.skipped,
      'renamed': result.renamed,
      'rescueBackupPath': result.rescueBackupPath,
      'retainedNativeArchives': result.retainedNativeArchives,
      'refreshed': refreshed,
      if (!refreshed) 'notice': '资料已恢复，但界面刷新未完成；重新打开软件查看，不要重复恢复。',
      'restoreInstructions': '如需撤销，在「备份与恢复」中选择 rescueBackupPath 指向的恢复前备份。'
    };
  }
}

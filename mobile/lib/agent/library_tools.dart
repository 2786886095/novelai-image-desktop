import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../models/nai_models.dart';
import '../services/data_backup_service.dart';
import '../state/app_state.dart';
import 'agent_models.dart';
import 'library_fields.dart';
import 'studio_data_service.dart';

class AgentLibraryTools {
  final AppState app;
  final DataBackupService backup;
  AgentLibraryTools(this.app, {DataBackupService? backup})
      : backup = backup ?? DataBackupService(app.storage);
  String _key(String c) =>
      c == 'styles' ? 'stylePromptPresets' : 'positivePromptPresets';
  bool _settings(String c) => c == 'styles' || c == 'positivePresets';
  Future<Map<String, dynamic>> _read(String c) async {
    if (_settings(c)) {
      return {'rows': app.settings.toJson()[_key(c)]};
    }
    final workspace = (await app.storage.getAgentWorkspaceStrict()).toJson();
    return {'rows': workspace[c], 'workspace': workspace};
  }

  Future<Map<String, dynamic>> materialSource(Map<String, dynamic> args) async {
    final c = args['collection'], id = args['id'];
    if (args.keys.any((k) => !['collection', 'id'].contains(k)) ||
        !['characters', 'personas', 'lorebooks', 'samplerPresets']
            .contains(c) ||
        id is! String ||
        id.isEmpty ||
        id.length > 200) {
      throw StateError('本机资料参数无效');
    }
    final snapshot = await _read(c as String);
    final rows = (snapshot['rows'] as List).where((row) => row['id'] == id);
    if (rows.isEmpty) throw StateError('本机资料不存在');
    dynamic pick(dynamic value, Map rule) {
      if (rule['type'] == 'object') {
        return {
          for (final key in (rule['fields'] as Map).keys)
            if (value is Map && value.containsKey(key))
              key: pick(value[key], rule['fields'][key])
        };
      }
      if (rule['type'] == 'array' && value is List) {
        return value.map((v) => pick(v, rule['items'])).toList();
      }
      return value;
    }

    final item =
        pick(rows.first, {'type': 'object', 'fields': libraryFields[c]});
    _value(item, {'type': 'object', 'fields': libraryFields[c]}, '资料');
    if (utf8.encode(jsonEncode(item)).length > 2000000) {
      throw StateError('单项资料超过传输上限，请拆分世界书后重试');
    }
    return {'collection': c, 'id': id, 'item': item};
  }

  dynamic _stable(dynamic x) {
    if (x is List) {
      return x.map(_stable).toList();
    }
    if (x is Map) {
      return {
        for (final key in x.keys)
          if (!['createdAt', 'updatedAt'].contains(key)) key: _stable(x[key])
      };
    }
    return x;
  }

  String _revision(Map<String, dynamic> data) =>
      sha256.convert(utf8.encode(jsonEncode(_stable(data)))).toString();
  void _value(dynamic value, Map rule, String field) {
    switch (rule['type']) {
      case 'string':
        if (value is! String ||
            value.length > (rule['max'] ?? 30000) ||
            (rule['values'] != null &&
                !(rule['values'] as List).contains(value))) {
          throw StateError('$field 文本或选项无效');
        }
        break;
      case 'boolean':
        if (value is! bool) {
          throw StateError('$field 必须为开关值');
        }
        break;
      case 'number':
        if (value is! num ||
            !value.isFinite ||
            value < (rule['min'] ?? double.negativeInfinity) ||
            value > (rule['max'] ?? double.infinity) ||
            (rule['integer'] == true && value != value.roundToDouble())) {
          throw StateError('$field 数值超出范围');
        }
        break;
      case 'array':
        if (value is! List || value.length > (rule['max'] ?? 200)) {
          throw StateError('$field 列表过长');
        }
        for (final item in value) {
          _value(item, rule['items'], field);
        }
        break;
      case 'object':
        if (value is! Map) {
          throw StateError('$field 应为对象');
        }
        for (final key in value.keys) {
          if (!(rule['fields'] as Map).containsKey(key)) {
            throw StateError('$field 未开放字段：$key');
          }
          _value(value[key], rule['fields'][key], '$field.$key');
        }
        break;
    }
  }

  void _validate(Map<String, dynamic> args) {
    final c = args['collection'], a = args['action'];
    if (!libraryFields.containsKey(c)) {
      throw StateError('资料分类无效');
    }
    if (!['read', 'create', 'update', 'delete'].contains(a)) {
      throw StateError('资料操作无效');
    }
    final allowed = a == 'read'
        ? ['action', 'collection', 'id', 'offset', 'limit']
        : [
            'action',
            'collection',
            'expectedRevision',
            if (a != 'create') 'id',
            if (a != 'delete') 'patch'
          ];
    for (final key in args.keys) {
      if (!allowed.contains(key)) {
        throw StateError('未知资料参数：$key');
      }
    }
    if (args['id'] != null &&
        (args['id'] is! String ||
            args['id'].isEmpty ||
            args['id'].length > 200)) {
      throw StateError('资料 ID 无效');
    }
    if (['update', 'delete'].contains(a) && args['id'] == null) {
      throw StateError('请选择资料 ID');
    }
    if (a != 'read' &&
        (args['expectedRevision'] is! String ||
            args['expectedRevision'].isEmpty)) {
      throw StateError('请先读取资料并传入 expectedRevision');
    }
    final offset = args['offset'] ?? 0, limit = args['limit'] ?? 20;
    if (offset is! int ||
        offset < 0 ||
        offset > 1000000 ||
        limit is! int ||
        limit < 1 ||
        limit > 50) {
      throw StateError('分页参数无效');
    }
    if (['create', 'update'].contains(a)) {
      final patch = args['patch'];
      _value(patch, {'type': 'object', 'fields': libraryFields[c]}, '资料');
      if ((patch as Map).isEmpty || jsonEncode(patch).length > 95000) {
        throw StateError('修改内容为空或过大');
      }
      if (patch.containsKey('name') &&
          (patch['name'] as String).trim().isEmpty) {
        throw StateError('名称不能为空');
      }
      if (a == 'create' &&
          (patch['name'] == null ||
              (['styles', 'positivePresets'].contains(c) &&
                  patch['prompt'] is! String))) {
        throw StateError('新建资料需要名称；提示词预设还需要 prompt');
      }
    }
  }

  Map<String, dynamic> _merge(
          Map<String, dynamic> base, Map<String, dynamic> patch) =>
      {
        ...base,
        for (final key in patch.keys)
          key: patch[key] is Map
              ? _merge(Map<String, dynamic>.from(base[key] ?? {}),
                  Map<String, dynamic>.from(patch[key]))
              : patch[key]
      };
  void _check(Map actual, Map patch) {
    for (final key in patch.keys) {
      final value = patch[key];
      if (value is List && value.every((x) => x is Map)) {
        final got = actual[key];
        if (got is! List || got.length != value.length) {
          throw StateError('列表字段 $key 回读不符');
        }
        for (var i = 0; i < value.length; i++) {
          _check(got[i] as Map, value[i] as Map);
        }
      } else if (value is Map) {
        _check(actual[key] as Map? ?? {}, value);
      } else if (value is num && actual[key] is num
          ? actual[key] != value
          : jsonEncode(actual[key]) != jsonEncode(value)) {
        throw StateError('字段 $key 与软件资料格式不兼容，请按读取结果修改');
      }
    }
  }

  Map<String, dynamic> _normalize(String c, Map<String, dynamic> row) =>
      switch (c) {
        'characters' => TavernCharacter.fromJson(row).toJson(),
        'personas' => TavernPersona.fromJson(row).toJson(),
        'lorebooks' => TavernLorebook.fromJson(row).toJson(),
        'samplerPresets' => TavernSamplerPreset.fromJson(row).toJson(),
        'styles' => StylePromptPreset.fromJson(row).toJson(),
        _ => PositivePromptPreset.fromJson(row).toJson()
      };
  Future<Map<String, dynamic>> approvalSummary(
      Map<String, dynamic> args) async {
    _validate(args);
    final before = await _read(args['collection']);
    if (_revision(before) != args['expectedRevision']) {
      throw StateError('资料已变化，请重新读取');
    }
    final row = (before['rows'] as List)
        .where((x) => x['id'] == args['id'])
        .firstOrNull;
    return {
      '名称': row?['name'],
      'action': args['action'],
      'collection': args['collection'],
      'id': args['id'],
      '修改': args['patch'],
      '说明': '执行前创建可恢复备份；不自动生成，不删除图片文件。'
    };
  }

  Future<Map<String, dynamic>> execute(Map<String, dynamic> args) async {
    _validate(args);
    final c = args['collection'] as String,
        a = args['action'] as String,
        before = await _read(c);
    final rows = List<Map<String, dynamic>>.from(
        (before['rows'] as List).map((x) => Map<String, dynamic>.from(x)));
    if (a == 'read') {
      final selected = args['id'] == null
          ? rows
          : rows.where((x) => x['id'] == args['id']).toList();
      if (args['id'] != null && selected.isEmpty) {
        throw StateError('资料不存在');
      }
      final offset = args['offset'] ?? 0, limit = args['limit'] ?? 20;
      return {
        'collection': c,
        'revision': _revision(before),
        'items': StudioDataService.project(
            selected.skip(offset).take(limit).toList()),
        'total': selected.length,
        'nextOffset': offset + limit < selected.length ? offset + limit : null,
        'editableFields': libraryFields[c],
        'notes': '修改本机保存的资料；不自动生成、不覆盖预览图。内置资料请先另存副本；删除已绑定的资料前需解除会话绑定。'
      };
    }
    if (args['expectedRevision'] != _revision(before)) {
      throw StateError('资料已变化，请重新读取');
    }
    final old = rows.where((x) => x['id'] == args['id']).firstOrNull;
    if (args['id'] != null && old == null) {
      throw StateError('资料不存在');
    }
    if (old != null &&
        ((old['id'] as String).startsWith('builtin-') ||
            old['source'] == 'builtin')) {
      throw StateError('内置资料保持完整；请新建自定义副本再修改');
    }
    if (a == 'delete' && before['workspace'] != null) {
      final w = before['workspace'] as Map;
      final owners = [
        ...(w['conversations'] as List),
        ...(w['characters'] as List),
        ...(w['personas'] as List)
      ];
      if (owners.any((row) =>
              [
                'activeCharacterId',
                'personaId',
                'samplerPresetId',
                'lorebookId'
              ].any((k) => row[k] == args['id']) ||
              ['characterIds', 'lorebookIds'].any((k) =>
                  row[k] is List && (row[k] as List).contains(args['id']))) ||
          w['selectedCharacterId'] == args['id'] ||
          w['selectedPersonaId'] == args['id']) {
        throw StateError('此资料仍被会话或角色绑定；请先解除绑定，避免对话失效');
      }
    }
    final id = args['id'] ?? agentId(),
        now = agentNow(),
        patch = Map<String, dynamic>.from(args['patch'] ?? {});
    var row =
        _merge(old ?? {'id': id, 'createdAt': now, 'group': 'Default'}, patch);
    row['updatedAt'] = now;
    if (a != 'delete') {
      row = _normalize(c, row);
      _check(row, patch);
    }
    final file = await backup.createBackup({
      _settings(c)
          ? DataBackupCategory.promptPresets
          : DataBackupCategory.agentWorkspace
    }, internal: true);
    if (_revision(await _read(c)) != args['expectedRevision']) {
      throw StateError('备份期间资料已变化；修改未执行');
    }
    final next = a == 'create'
        ? [...rows, row]
        : a == 'delete'
            ? rows.where((x) => x['id'] != id).toList()
            : rows.map((x) => x['id'] == id ? row : x).toList();
    if (_settings(c)) {
      final settings =
          AppSettings.fromJson({...app.settings.toJson(), _key(c): next});
      await app.storage.setSettings(settings);
      final persisted = await app.storage.getSettings();
      if (jsonEncode(persisted.toJson()[_key(c)]) !=
          jsonEncode(settings.toJson()[_key(c)])) {
        throw StateError('保存后回读冲突，请查看资料，不要重复执行');
      }
      app.settings = settings;
      app.markChanged();
    } else {
      await app.storage.setAgentWorkspace(AgentWorkspace.fromJson(
          {...Map<String, dynamic>.from(before['workspace']), c: next}));
    }
    final after = await _read(c),
        saved = (after['rows'] as List).where((x) => x['id'] == id).firstOrNull;
    if (a == 'delete' ? saved != null : saved == null) {
      throw StateError('写入后回读不符，请查看资料，不要重复执行');
    }
    if (saved != null) {
      _check(saved as Map, patch);
    }
    return {
      'executed': true,
      'collection': c,
      'action': a,
      'id': id,
      'revision': _revision(after),
      'item': StudioDataService.project(saved),
      'backupPath': file.path,
      'restoreInstructions': '如需恢复，在 Agent 备份列表中检查此备份，再确认恢复。'
    };
  }
}

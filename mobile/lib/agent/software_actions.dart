import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../state/app_state.dart';
import 'software_action_catalog.dart';
import 'workflow_catalog.dart';
import 'studio_data_service.dart';

class SoftwareActions {
  final AppState app;
  SoftwareActions(this.app);
  Map<String, dynamic> _snapshot(String action) {
    if (action.startsWith('history.')) {
      return {
        'groups': app.groups.map((x) => x.toJson()).toList(),
        'items': app.history.map((x) => x.toJson()).toList()
      };
    }
    if (action.startsWith('references.')) {
      return {
        'groups': app.referencePresetGroups,
        'presets': app.referencePresets.map((x) => x.toJson()).toList()
      };
    }
    return {
      'items': (action.startsWith('text.convert.')
              ? app.convertHistory
              : app.reverseHistory)
          .map((x) => x.toJson())
          .toList()
    };
  }

  String _revision(Map<String, dynamic> value) =>
      sha256.convert(utf8.encode(jsonEncode(value))).toString();
  Future<Map<String, dynamic>> execute(
      String tool, Map<String, dynamic> args) async {
    if (tool == 'langbai_software_capabilities') {
      return {
        'platform': 'android',
        'actions': softwareActionCatalog,
        'workflows': softwareWorkflows,
        'coverage':
            'workflows 按用户操作列出已接通流程；actions 是本入口可执行的明细操作。未列出的功能不代表已接通。'
      };
    }
    final action = args['action'];
    final spec = softwareActionCatalog[action];
    if (spec is! Map) throw StateError('软件操作未接通；请查询真实功能清单');
    final fields = List<String>.from(spec['fields'] ?? []),
        allowed = {
          'action',
          'expectedRevision',
          'offset',
          'limit',
          ...List<String>.from(spec['fields'] ?? [])
        };
    for (final key in args.keys) {
      if (!allowed.contains(key)) throw StateError('未知操作参数：$key');
    }
    for (final key in fields) {
      final value = args[key];
      if (value is! String ||
          (key != 'group' && value.trim().isEmpty) ||
          value.length > 200) throw StateError('参数无效：$key');
    }
    final offset = args['offset'] ?? 0, limit = args['limit'] ?? 20;
    if (offset is! int ||
        offset < 0 ||
        offset > 1000000 ||
        limit is! int ||
        limit < 1 ||
        limit > 50) throw StateError('分页参数无效');
    final before = _snapshot(action as String);
    if (spec['effect'] != 'read') {
      if (args['expectedRevision'] != _revision(before)) {
        throw StateError('资料已变化，请重新读取并传入 expectedRevision');
      }
      final id = args['id'] as String? ?? '',
          name = args['name'] as String? ?? '',
          group = args['group'] as String? ?? '';
      if (action.startsWith('history.groups.') &&
          id.isNotEmpty &&
          !app.groups.any((x) => x.id == id)) throw StateError('历史分组不存在');
      if (action.startsWith('history.items.') &&
          id.isNotEmpty &&
          !app.history.any((x) => x.id == id)) throw StateError('历史图片不存在');
      if (action.startsWith('references.') &&
          id.isNotEmpty &&
          !app.referencePresets.any((x) => x.id == id)) {
        throw StateError('参考图预设不存在');
      }
      if (action.startsWith('text.') &&
          id.isNotEmpty &&
          !(List<Map<String, dynamic>>.from(before['items'] as List))
              .any((x) => x['id'] == id)) throw StateError('历史项不存在');
      if (action == 'references.groups.delete' &&
          !app.referencePresetGroups.contains(name)) {
        throw StateError('参考图分组不存在');
      }
      String? error;
      switch (action) {
        case 'history.groups.create':
          if (!app.groups
              .any((x) => x.name.toLowerCase() == name.trim().toLowerCase())) {
            await app.createGroup(name);
          }
          break;
        case 'history.groups.rename':
          await app.renameGroup(id, name);
          break;
        case 'history.groups.delete':
          await app.deleteGroup(id);
          break;
        case 'history.items.move':
          if (group.isNotEmpty && !app.groups.any((x) => x.id == group)) {
            throw StateError('目标历史分组不存在');
          }
          await app.moveHistory(id, group.isEmpty ? null : group);
          break;
        case 'references.delete':
          await app.deleteReferencePreset(id);
          break;
        case 'references.move':
          error = await app.moveReferencePresetToGroup(id, group);
          break;
        case 'references.groups.create':
          error = await app.addReferencePresetGroup(name);
          break;
        case 'references.groups.delete':
          await app.deleteReferencePresetGroup(name);
          break;
        case 'text.convert.delete':
          await app.deleteConvertHistoryItem(id);
          break;
        case 'text.reverse.delete':
          await app.deleteReverseHistoryItem(id);
          break;
        case 'text.convert.clear':
          await app.clearConvertHistory();
          break;
        case 'text.reverse.clear':
          await app.clearReverseHistory();
          break;
      }
      if (error != null && error.isNotEmpty) throw StateError(error);
    }
    final current = _snapshot(action),
        rows = List<dynamic>.from((action.startsWith('history.groups.') ||
                action.startsWith('references.groups.'))
            ? current['groups']
            : current['items'] ?? current['presets']);
    if (spec['effect'] != 'read') {
      final id = args['id'],
          name = (args['name'] as String? ?? '').trim(),
          group = (args['group'] as String? ?? '').trim();
      var passed = true;
      if (action == 'history.groups.create') {
        passed = app.groups.any((x) => x.name == name);
      } else if (action == 'history.groups.rename') {
        passed = app.groups.any((x) => x.id == id && x.name == name);
      } else if (action == 'history.groups.delete') {
        passed = !app.groups.any((x) => x.id == id) &&
            !app.history.any((x) => x.groupId == id);
      } else if (action == 'references.groups.create') {
        passed = app.referencePresetGroups.contains(name);
      } else if (action == 'references.groups.delete') {
        passed = !app.referencePresetGroups.contains(name) &&
            !app.referencePresets.any((x) => x.group == name);
      } else if (action.endsWith('.delete')) {
        passed = !rows.any((x) => x['id'] == id);
      } else if (action.endsWith('.clear')) {
        passed = rows.isEmpty;
      } else if (action.endsWith('.move')) {
        passed = rows.any((x) =>
            x['id'] == id &&
            (x[action.startsWith('references.') ? 'group' : 'groupId'] ?? '') ==
                group);
      }
      if (!passed) throw StateError('操作后的回读未符合预期；请查看当前资料，不要自动重试');
    }
    return {
      'action': action,
      'revision': _revision(current),
      'executed': spec['effect'] != 'read',
      'readback':
          StudioDataService.project(rows.skip(offset).take(limit).toList()),
      'total': rows.length,
      'offset': offset,
      'nextOffset': offset + limit < rows.length ? offset + limit : null
    };
  }
}

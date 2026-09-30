import 'dart:convert';
import '../batch/batch_redraw_models.dart';
import '../batch/batch_redraw_controller.dart';
import '../models/nai_models.dart';
import '../state/app_state.dart';
import 'studio_data_service.dart';

const batchActionCatalog = <String, Map<String, dynamic>>{
  'batch.project.read': {'title': '读取软件批量重绘工程', 'effect': 'read', 'fields': []},
  'batch.project.update': {
    'title': '修改批量全局参数，不生成',
    'effect': 'write',
    'fields': ['patch']
  },
  'batch.items.update': {
    'title': '修改批量图片提示词与参数，不生成',
    'effect': 'write',
    'fields': ['id', 'patch']
  },
  'batch.candidates.select': {
    'title': '选择已有批量候选图',
    'effect': 'write',
    'fields': ['id', 'candidateId']
  },
};

class BatchActions {
  final AppState app;
  BatchActions(this.app);
  bool handles(String action) => batchActionCatalog.containsKey(action);
  Map<String, dynamic> _object(Object? value) {
    if (value is! Map) throw StateError('字段必须为对象');
    return Map<String, dynamic>.from(value);
  }

  String _text(Object? value, [int max = 30000]) {
    if (value is! String || value.length > max) throw StateError('文本无效或过长');
    return value;
  }

  void _params(Map<String, dynamic> target, Object? raw) {
    final rules = StudioDataService(app).schema['params'] as Map;
    for (final entry in _object(raw).entries) {
      final r = rules[entry.key], v = entry.value;
      if (r is! Map) throw StateError('未开放的批量参数：${entry.key}');
      if (r['enum'] is List && !(r['enum'] as List).contains(v) ||
          r['type'] == 'boolean' && v is! bool ||
          r['type'] == 'string' &&
              (v is! String || v.length > (r['max'] ?? 30000))) {
        throw StateError('批量参数类型或选项错误');
      }
      if (r['type'] == 'number' &&
          (v is! num ||
              !v.isFinite ||
              v < r['min'] ||
              v > r['max'] ||
              r['step'] != null &&
                  (v / r['step'] - (v / r['step']).round()).abs() > 1e-8)) {
        throw StateError('批量参数超出范围或步长');
      }
      target[entry.key] = v;
    }
  }

  Map<String, dynamic> _read(
      BatchRedrawController c, Map<String, dynamic> args) {
    final data = c.project.toJson(), items = data.remove('items') as List;
    final offset = args['offset'] as int? ?? 0,
        limit = args['limit'] as int? ?? 20;
    return {
      'revision': c.revision,
      'busy': c.queueRunning || c.busy || c.editing,
      'persistenceError': c.persistenceError,
      'project': StudioDataService.project(data),
      'items':
          StudioDataService.project(items.skip(offset).take(limit).toList()),
      'total': items.length,
      'offset': offset,
      'nextOffset': offset + limit < items.length ? offset + limit : null
    };
  }

  Future<Map<String, dynamic>> execute(Map<String, dynamic> args) async {
    final action = args['action'], spec = batchActionCatalog[action];
    if (spec == null) throw StateError('未接通的批量操作');
    if (jsonEncode(args).length > 250000) throw StateError('批量操作输入过大');
    final fields = List<String>.from(spec['fields']);
    if (args.keys.any((k) => ![
          'action',
          'expectedRevision',
          'offset',
          'limit',
          ...fields
        ].contains(k))) throw StateError('未知批量操作参数');
    for (final key in fields) {
      if (key == 'patch') {
        _object(args[key]);
      } else if (_text(args[key], 200).trim().isEmpty) {
        throw StateError('字段不可为空');
      }
    }
    final offset = args['offset'] ?? 0, limit = args['limit'] ?? 20;
    if (offset is! int ||
        offset < 0 ||
        offset > 1000000 ||
        limit is! int ||
        limit < 1 ||
        limit > 50) throw StateError('分页无效');
    final c = app.batchRedraw;
    await c.load();
    if (c.loadError != null) throw StateError(c.loadError!);
    if (action == 'batch.project.read') return _read(c, args);
    final expected = args['expectedRevision'];
    if (expected is! String || expected.isEmpty) {
      throw StateError('请先读取批量工程并传入expectedRevision');
    }
    c.assertRevision(expected);
    final p = BatchRedrawProject.fromJson(
        jsonDecode(jsonEncode(c.project.toJson())), c.project.globalParams,
        trustOutputs: true);
    if (action == 'batch.project.update') {
      for (final e in _object(args['patch']).entries) {
        switch (e.key) {
          case 'groupName':
            p.groupName = _text(e.value, 200);
            break;
          case 'globalStyle':
            p.globalStyle = _text(e.value);
            break;
          case 'globalNegative':
            p.globalNegative = _text(e.value);
            break;
          case 'sizeBulk':
            p.sizeBulk = _text(e.value);
            break;
          case 'sizeMode':
            if (!['custom', 'adaptive', 'perImage'].contains(e.value)) {
              throw StateError('尺寸模式无效');
            }
            p.sizeMode = e.value;
            break;
          case 'globalStrength':
            p.globalStrength = _strength(e.value);
            break;
          case 'candidateCount':
            if (e.value is! int || e.value < 1 || e.value > 8) {
              throw StateError('候选数须为1–8');
            }
            p.candidateCount = e.value;
            break;
          case 'globalParams':
            final params = p.globalParams.toJson();
            _params(params, e.value);
            p.globalParams = GenerateParams.fromJson(params);
            break;
          default:
            throw StateError('未开放的批量全局字段：${e.key}');
        }
      }
    } else {
      final item = p.items.where((x) => x.id == args['id']).firstOrNull;
      if (item == null) throw StateError('批量图片ID不存在');
      if (action == 'batch.candidates.select') {
        if (!item.selectCandidate(args['candidateId'])) {
          throw StateError('图片没有此候选图');
        }
      } else {
        for (final e in _object(args['patch']).entries) {
          switch (e.key) {
            case 'name':
              item.name = _text(e.value, 200);
              break;
            case 'prompt':
              item.prompt = _text(e.value);
              break;
            case 'strength':
              item.strength = e.value == null ? null : _strength(e.value);
              break;
            case 'overrideParams':
              if (e.value is! bool) throw StateError('overrideParams须为布尔值');
              item.overrideParams = e.value;
              break;
            case 'params':
              final params = item.params.toJson();
              _params(params, e.value);
              item.params = GenerateParams.fromJson(params);
              break;
            default:
              throw StateError('未开放的批量图片字段：${e.key}');
          }
        }
      }
    }
    await c.commitProject(expected, p);
    return {..._read(c, args), 'saved': true};
  }

  double _strength(Object? v) {
    if (v is! num || !v.isFinite || v < 0 || v > 1) throw StateError('强度须为0–1');
    return v.toDouble();
  }
}

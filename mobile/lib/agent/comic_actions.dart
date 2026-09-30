import '../comic/comic_project_transfer.dart';
import 'dart:convert';
import '../comic/comic_controller.dart';
import '../comic/comic_models.dart';
import '../models/nai_models.dart';
import '../state/app_state.dart';
import 'agent_models.dart';
import 'comic_assets.dart';
import 'studio_data_service.dart';

const comicActionCatalog = <String, Map<String, dynamic>>{
  'comic.project.read': {
    'title': '读取软件当前漫画工程与分镜',
    'effect': 'read',
    'fields': []
  },
  'comic.project.update': {
    'title': '修改漫画全局设置，不生成图片',
    'effect': 'write',
    'fields': ['patch']
  },
  'comic.project.new': {
    'title': '新建漫画工程，备份原工程并保留图片',
    'effect': 'confirm',
    'fields': []
  },
  'comic.project.import': {
    'title': '导入工程JSON，备份当前工程，不信任外部路径或候选图',
    'effect': 'confirm',
    'fields': ['project']
  },
  'comic.project.export': {
    'title': '导出便携JSON，不包含本地路径或图片',
    'effect': 'read',
    'fields': []
  },
  'comic.panels.append': {
    'title': '追加分镜提示词（每行一格、JSON或CSV）',
    'effect': 'write',
    'fields': ['text']
  },
  'comic.panels.replace': {
    'title': '替换分镜，备份原工程并保留图片',
    'effect': 'confirm',
    'fields': ['text']
  },
  'comic.panels.update': {
    'title':
        '修改指定分镜；patch支持title/prompt/imageSize/paramsOverride{enabled,params}',
    'effect': 'write',
    'fields': ['id', 'patch']
  },
  'comic.panels.reorder': {
    'title': '按完整分镜ID列表重排',
    'effect': 'write',
    'fields': ['order']
  },
  'comic.panels.remove': {
    'title': '移除分镜记录，备份工程且保留原图',
    'effect': 'confirm',
    'fields': ['id']
  },
  'comic.panels.sizes': {
    'title': '按软件尺寸模板更新逐格尺寸',
    'effect': 'write',
    'fields': ['text']
  },
  'comic.candidates.select': {
    'title': '选择本分镜已有候选图，不重新生成',
    'effect': 'write',
    'fields': ['id', 'candidateId']
  },
  'comic.references.import': {
    'title': '从登记的history/reference/attachment图片ID导入参考；不接受任意文件路径',
    'effect': 'write',
    'fields': ['source', 'sourceId']
  },
  'comic.references.update': {
    'title': '修改参考类型、强度与分镜范围',
    'effect': 'write',
    'fields': ['id', 'patch']
  },
  'comic.references.panel': {
    'title': '设置逐格参考覆盖（包含启用/禁用）',
    'effect': 'write',
    'fields': ['id', 'referenceId', 'patch']
  },
  'comic.references.panel.reset': {
    'title': '清除逐格参考覆盖，恢复全局规则',
    'effect': 'write',
    'fields': ['id', 'referenceId']
  },
  'comic.references.remove': {
    'title': '移除漫画参考记录，备份工程且保留原图',
    'effect': 'confirm',
    'fields': ['id']
  },
  'comic.images.export': {
    'title': '导出选中主图ZIP并打开分享；任一选中图缺失则整体停止',
    'effect': 'read',
    'fields': []
  },
};

class ComicActions {
  final AppState app;
  final ComicAssets assets;
  ComicActions(this.app, {ComicAssets? assets})
      : assets = assets ?? ComicAssets();
  bool handles(String action) => comicActionCatalog.containsKey(action);
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
      if (r is! Map) throw StateError('未开放的漫画参数：${entry.key}');
      if (r['enum'] is List && !(r['enum'] as List).contains(v) ||
          r['type'] == 'boolean' && v is! bool ||
          r['type'] == 'string' &&
              (v is! String || v.length > (r['max'] ?? 30000))) {
        throw StateError('漫画参数类型或选项错误');
      }
      if (r['type'] == 'number' &&
          (v is! num ||
              !v.isFinite ||
              v < r['min'] ||
              v > r['max'] ||
              r['step'] != null &&
                  (v / r['step'] - (v / r['step']).round()).abs() > 1e-8)) {
        throw StateError('漫画参数超出范围或步长');
      }
      target[entry.key] = v;
    }
  }

  ComicPanel _panel(ComicProject p, Object? id) {
    final found = p.panels.where((x) => x.id == id);
    if (found.isEmpty) throw StateError('分镜ID不存在');
    return found.first;
  }

  ComicReferenceAsset _reference(ComicProject p, Object? id) {
    final found = p.preciseReferences.where((x) => x.id == id);
    if (found.isEmpty) throw StateError('漫画参考ID不存在');
    return found.first;
  }

  void _referencePatch(Map<String, dynamic> target, Object? raw, ComicProject p,
      {bool panel = false}) {
    for (final entry in _object(raw).entries) {
      final k = entry.key, v = entry.value;
      if (k == 'type') {
        if (!['character', 'style', 'character&style'].contains(v)) {
          throw StateError('参考类型无效');
        }
      } else if (['strength', 'fidelity', 'informationExtracted'].contains(k)) {
        if (v is! num || !v.isFinite || v < 0 || v > 1) {
          throw StateError('参考强度须为0–1');
        }
      } else if (panel && k == 'enabled') {
        if (v is! bool) throw StateError('enabled须为布尔值');
      } else if (!panel && k == 'scope') {
        if (!['all', 'include', 'exclude'].contains(v)) {
          throw StateError('参考范围无效');
        }
      } else if (!panel && k == 'scopePanelIds') {
        if (v is! List ||
            v.toSet().length != v.length ||
            v.any((id) => !p.panels.any((x) => x.id == id))) {
          throw StateError('参考范围须为无重复有效分镜ID');
        }
      } else {
        throw StateError('未开放的漫画参考字段：$k');
      }
      target[k] = v;
    }
  }

  Map<String, dynamic> portable(ComicProject p) => portableComicProject(p);

  Map<String, dynamic> _read(ComicController c, Map<String, dynamic> args) {
    final data = c.project.toJson(),
        panels = data.remove('panels') as List,
        offset = args['offset'] as int? ?? 0,
        limit = args['limit'] as int? ?? 20;
    return {
      'revision': c.revision,
      'busy': c.queueRunning || c.editing,
      'persistenceError': c.persistenceError,
      'project': StudioDataService.project(data),
      'panels':
          StudioDataService.project(panels.skip(offset).take(limit).toList()),
      'total': panels.length,
      'offset': offset,
      'nextOffset': offset + limit < panels.length ? offset + limit : null
    };
  }

  Future<Map<String, dynamic>> execute(Map<String, dynamic> args,
      {List<AgentAttachment> attachments = const []}) async {
    final action = args['action'], spec = comicActionCatalog[action];
    if (spec == null) throw StateError('未接通的漫画操作');
    if (jsonEncode(args).length > 250000) throw StateError('漫画操作输入过大，请拆分');
    final fields = List<String>.from(spec['fields']);
    if (args.keys.any((k) => ![
          'action',
          'expectedRevision',
          'offset',
          'limit',
          ...fields
        ].contains(k))) throw StateError('未知漫画操作参数');
    for (final key in fields) {
      final value = args[key];
      if (key == 'patch' || key == 'project') {
        _object(value);
      } else if (key == 'order') {
        if (value is! List || value.any((x) => x is! String)) {
          throw StateError('order须为ID数组');
        }
      } else if (_text(value, key == 'text' ? 200000 : 200).trim().isEmpty) {
        throw StateError('参数不可为空：$key');
      }
    }
    final offset = args['offset'] ?? 0, limit = args['limit'] ?? 20;
    if (offset is! int ||
        offset < 0 ||
        offset > 1000000 ||
        limit is! int ||
        limit < 1 ||
        limit > 50) throw StateError('分页参数无效');
    final c = app.comic;
    await c.load();
    if (c.loadError != null) throw StateError(c.loadError!);
    if (action == 'comic.project.read') return _read(c, args);
    if (action == 'comic.project.export') {
      return {'json': jsonEncode(portable(c.project)), 'revision': c.revision};
    }
    final expected = args['expectedRevision'];
    if (expected is! String || expected.isEmpty) {
      throw StateError('请先读取漫画工程并传入expectedRevision');
    }
    c.assertRevision(expected);
    var p = ComicProject.fromJson(c.project.toJson(), c.project.globalParams,
        trustOutputs: true);
    if (action == 'comic.images.export') {
      return assets.exportSelected(
          p, portable(p), () => c.assertRevision(expected));
    }
    if (action == 'comic.references.import') {
      if (p.preciseReferences.length >= 5) throw StateError('最多5张漫画参考图');
      final asset = await assets.importReference(app, args['source'] as String,
          args['sourceId'] as String, attachments);
      try {
        c.assertRevision(expected);
        p.preciseReferences.add(asset);
        await c.commitProject(expected, p);
      } catch (_) {
        await assets.removeImported(asset);
        rethrow;
      }
      return {..._read(c, args), 'executed': true, 'referenceId': asset.id};
    }
    switch (action) {
      case 'comic.project.new':
        p = ComicProject.empty(app.params);
        break;
      case 'comic.project.import':
        final raw = _object(args['project']);
        if (raw['panels'] is List) {
          raw['panels'] = (raw['panels'] as List).map((v) {
            final row = _object(v), override = row['paramsOverride'];
            if (override is Map) {
              row['paramsOverride'] = override['enabled'] == true;
              row['params'] = override['params'];
            }
            return row;
          }).toList();
        }
        p = ComicProject.fromJson(raw, app.params, trustOutputs: false);
        p.id = comicId();
        for (final panel in p.panels) {
          panel.id = comicId();
        }
        break;
      case 'comic.project.update':
        for (final e in _object(args['patch']).entries) {
          switch (e.key) {
            case 'title':
              p.title = _text(e.value, 200);
              break;
            case 'globalStylePrompt':
              p.globalStylePrompt = _text(e.value);
              break;
            case 'globalNegativePrompt':
              p.globalNegativePrompt = _text(e.value);
              break;
            case 'initialGenerationCount':
              if (e.value is! int || e.value < 1 || e.value > 10) {
                throw StateError('每格初始候选数须为1–10');
              }
              p.initialGenerationCount = e.value;
              break;
            case 'sizeMode':
              if (!['uniform', 'perPanel'].contains(e.value)) {
                throw StateError('尺寸模式无效');
              }
              p.sizeMode = ComicSizeMode.values.byName(e.value);
              break;
            case 'globalParams':
              final params = p.globalParams.toJson();
              _params(params, e.value);
              p.globalParams = GenerateParams.fromJson(params);
              break;
            default:
              throw StateError('未开放的漫画全局字段：${e.key}');
          }
        }
        break;
      case 'comic.panels.append':
      case 'comic.panels.replace':
        final text = args['text'] as String;
        final parsed = parseComicImport(text,
            fileName: text.trimLeft().startsWith('[') ||
                    text.trimLeft().startsWith('{')
                ? 'panels.json'
                : text.split('\n').first.toLowerCase().contains('prompt') &&
                        text.split('\n').first.contains(',')
                    ? 'panels.csv'
                    : 'panels.txt');
        if (parsed.isEmpty) throw StateError('没有有效分镜');
        if (action == 'comic.panels.replace') {
          p.panels = [];
          for (final ref in p.preciseReferences) {
            ref.scopePanelIds = [];
          }
        }
        for (final row in parsed) {
          p.panels.add(ComicPanel(
              id: comicId(),
              index: p.panels.length + 1,
              title: row.$1,
              prompt: row.$2,
              params: p.globalParams.copy()));
        }
        break;
      case 'comic.panels.reorder':
        final order = List<String>.from(args['order']);
        if (order.length != p.panels.length ||
            order.toSet().length != order.length ||
            order.any((id) => !p.panels.any((x) => x.id == id))) {
          throw StateError('重排须提供全部分镜ID且无重复');
        }
        p.panels = order.map((id) => _panel(p, id)).toList();
        break;
      case 'comic.panels.sizes':
        final sizes = parseComicSizeImport(args['text'], p.panels.length);
        for (var i = 0; i < p.panels.length; i++) {
          p.panels[i]
            ..imageWidth = sizes[i].width
            ..imageHeight = sizes[i].height;
        }
        p.sizeMode = ComicSizeMode.perPanel;
        break;
      case 'comic.panels.update':
        final panel = _panel(p, args['id']);
        for (final e in _object(args['patch']).entries) {
          if (e.key == 'title') {
            panel.title = _text(e.value, 200);
          } else if (e.key == 'prompt') {
            panel.prompt = _text(e.value);
          } else if (e.key == 'imageSize') {
            if (e.value == null) {
              panel
                ..imageWidth = null
                ..imageHeight = null;
            } else {
              final size = _object(e.value);
              if (size.keys.any((k) => !['width', 'height'].contains(k)) ||
                  !comicSizePresets.any((x) =>
                      x.width == size['width'] && x.height == size['height'])) {
                throw StateError('分镜尺寸不在软件预设中');
              }
              panel
                ..imageWidth = size['width']
                ..imageHeight = size['height'];
            }
          } else if (e.key == 'paramsOverride') {
            final over = _object(e.value);
            if (over.keys.any((k) => !['enabled', 'params'].contains(k)) ||
                over['enabled'] is! bool) throw StateError('分镜参数覆盖无效');
            final params = panel.params.toJson();
            _params(params, over['params']);
            panel
              ..overrideParams = over['enabled']
              ..params = GenerateParams.fromJson(params);
          } else {
            throw StateError('未开放的分镜字段：${e.key}');
          }
        }
        break;
      case 'comic.panels.remove':
        _panel(p, args['id']);
        p.panels.removeWhere((x) => x.id == args['id']);
        for (final ref in p.preciseReferences) {
          ref.scopePanelIds.remove(args['id']);
        }
        break;
      case 'comic.candidates.select':
        final panel = _panel(p, args['id']);
        if (!panel.candidates.any((x) => x.id == args['candidateId'])) {
          throw StateError('该分镜没有此候选图');
        }
        panel.selectedCandidateId = args['candidateId'];
        break;
      case 'comic.references.remove':
        p = withoutComicReference(p, args['id'] as String);
        break;
      case 'comic.references.update':
        final ref = _reference(p, args['id']), data = ref.toJson();
        _referencePatch(data, args['patch'], p);
        p.preciseReferences[p.preciseReferences.indexOf(ref)] =
            ComicReferenceAsset.fromJson(data);
        break;
      case 'comic.references.panel':
      case 'comic.references.panel.reset':
        final panel = _panel(p, args['id']),
            ref = _reference(p, args['referenceId']);
        final prior = panel.preciseReferences
            .where((x) => x.referenceId == ref.id)
            .firstOrNull;
        final data = prior?.toJson() ??
            {
              'referenceId': ref.id,
              'enabled': true,
              'type': ref.type,
              'strength': ref.strength,
              'fidelity': ref.fidelity,
              'informationExtracted': ref.informationExtracted
            };
        if (action == 'comic.references.panel') {
          _referencePatch(data, args['patch'], p, panel: true);
        }
        panel.preciseReferences.removeWhere((x) => x.referenceId == ref.id);
        if (action == 'comic.references.panel') {
          panel.preciseReferences.add(ComicPanelReference.fromJson(data));
        }
        break;
    }
    for (var i = 0; i < p.panels.length; i++) {
      p.panels[i].index = i + 1;
    }
    await c.commitProject(expected, p, backup: spec['effect'] == 'confirm');
    return {..._read(c, args), 'executed': true, 'filesRetained': true};
  }
}

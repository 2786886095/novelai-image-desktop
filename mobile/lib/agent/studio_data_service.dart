import 'dart:convert';
import 'dart:math';
import 'dart:io';
import 'agent_models.dart';
import '../models/nai_models.dart';
import '../state/app_state.dart';

/// Live app state, not a second settings store. Only scalar allowlisted fields
/// can be written; the loopback bridge obtains approval before calling mutate.
class StudioDataService {
  final AppState app;
  StudioDataService(this.app);
  final String _instance =
      '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}';
  int _sequence = 0;
  String _fingerprint = '';
  static const collections = [
    'styles',
    'styleGroups',
    'positivePresets',
    'characterPresets',
    'promptChunks',
    'references',
    'history',
    'historyGroups',
    'characters',
    'personas',
    'lorebooks',
    'samplerPresets',
    'memories',
    'conversations'
  ];
  static const tools = {
    'langbai_read_studio_state',
    'langbai_list_studio_data',
    'langbai_update_studio_config',
    'langbai_save_style_preset',
    'langbai_import_studio_data'
  };
  static Map<String, dynamic> number(num min, num max, [num? step]) => {
        'type': 'number',
        'min': min,
        'max': max,
        if (step != null) 'step': step
      };
  static Map<String, dynamic> choice(List<dynamic> values) =>
      {'type': 'enum', 'enum': values};
  static const text = {'type': 'string', 'max': 30000};
  static const boolean = {'type': 'boolean'};
  Map<String, dynamic> get schema {
    final settings = <String, dynamic>{
      'language': choice(['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']),
      'theme': choice(['light', 'dark', 'system']),
      for (final k in [
        'reduceMotion',
        'autoComplete',
        'keepImageMetadata',
        'saveToGallery',
        'streamPreviewEnabled',
        'lockStylePrompt',
        'lockNegativePrompt',
        'persistGenerateParams',
        'persistI2IParams',
        'persistInpaintParams',
        'persistUpscaleParams',
        'persistDirectorParams',
        'agentAutoCompact',
        'agentVisionEnabled',
        'reverseConvertDshEnabled'
      ])
        k: boolean,
      for (final k in [
        'savedStylePrompt',
        'savedNegativePrompt',
        'visionApiModel',
        'convertApiModel',
        'agentApiModel',
        'agentProviderName'
      ])
        k: text,
      'agentContextWindow': number(8192, 2000000, 1),
      'agentMaxOutputTokens': number(512, 131072, 1),
      'historyRetentionDays': number(0, 3650, 1),
      'aitagCacheRetentionDays': number(0, 3650, 1),
      'reverseConvertDshMode': choice(['focused', 'strict']),
      'reversePromptTemplateVersion': choice(['v4.5', 'v5']),
      'convertPromptTemplateVersion': choice(['v4.5', 'v5']),
    };
    settings.removeWhere((k, v) => !app.settings.toJson().containsKey(k));
    return {
      'params': {
        'model': choice(naiModels.map((x) => x.value).toList()),
        for (final k in ['stylePrompt', 'positivePrompt', 'negativePrompt'])
          k: text,
        'width': number(64, 4096, 64),
        'height': number(64, 4096, 64),
        'steps': number(1, 50, 1),
        'cfgScale': number(0, 10),
        'cfgRescale': number(0, 1),
        'sampler': choice(naiSamplers.map((x) => x.value).toList()),
        'noiseSchedule': choice(naiNoiseSchedules.map((x) => x.value).toList()),
        'seed': number(0, 4294967295, 1),
        'seedMode': choice(['fixed', 'random']),
        'ucPreset': choice([0, 1, 2, 3]),
        'qualityPreset': choice(['standard', 'light', 'none']),
        for (final k in [
          'qualityToggle',
          'transparentBackground',
          'smea',
          'smeaDyn',
          'variety'
        ])
          k: boolean,
        'fileNamePrefix': {'type': 'string', 'max': 100},
      },
      'workbench': {
        'batchCount': number(1, 999, 1),
        'batchIntervalSeconds': number(0, 3600, 1),
        'inpaintModel': choice(naiInpaintModels.map((x) => x.value).toList()),
        'inpaintStrength': number(0, 1),
        'inpaintNoise': number(0, 0.99),
        'inpaintPositivePrompt': text,
        'upscaleScale': choice([2, 4, 0]),
        'directorTool': choice(directorTools.map((x) => x.value).toList())
      },
      'i2iParams': {
        'strength': number(0, 1),
        'noise': number(0, 0.99),
        'extraNoiseSeed': {
          ...number(0, 2147483647, 1),
        }
      },
      'augmentOptions': {
        'defry': number(0, 5, 1),
        'colorizePrompt': text,
        'emotion': choice(emotionOptions.map((x) => x.value).toList()),
        'emotionLevel': number(0, 5, 1)
      },
      'settings': settings,
    };
  }

  Map<String, dynamic> get generation => {
        'params': app.params.toJson(),
        'batchCount': app.batchCount,
        'batchIntervalSeconds': app.batchIntervalSeconds,
        'i2iParams': {
          'strength': app.i2i.strength,
          'noise': app.i2i.noise,
          'extraNoiseSeed': app.i2i.extraNoiseSeed
        },
        'inpaintModel': app.inpaintModel,
        'inpaintStrength': app.inpaintStrength,
        'inpaintNoise': app.inpaintNoise,
        'inpaintPositivePrompt': app.inpaintPositivePrompt,
        'upscaleScale': app.upscaleScale,
        'directorTool': app.directorTool,
        'augmentOptions': {
          'defry': app.augmentOptions.defry,
          'colorizePrompt': app.augmentOptions.colorizePrompt,
          'emotion': app.augmentOptions.emotion,
          'emotionLevel': app.augmentOptions.emotionLevel
        },
      };
  String get revision {
    final next = jsonEncode([generation, app.settings.toJson()]);
    if (next != _fingerprint) {
      _fingerprint = next;
      _sequence++;
    }
    return '$_instance:$_sequence';
  }

  static dynamic project(dynamic value, [String key = '', int depth = 0]) {
    if (RegExp(
            r'apikey|secret|password|authorization|cookie|credential|^token$|^accessToken$|^refreshToken$',
            caseSensitive: false)
        .hasMatch(key)) return {'configured': value != null && value != ''};
    if (RegExp(
            r'base64|encodings|inpaintMask|imageData|previewData|avatarData|backgroundData',
            caseSensitive: false)
        .hasMatch(key)) return {'present': value != null && value != ''};
    if (depth > 12) return {'omitted': 'depth limit'};
    if (value is String) {
      if (value.startsWith('data:') || value.startsWith('blob:')) {
        return {'present': true, 'omitted': 'image body'};
      }
      if (key.toLowerCase().endsWith('url') && value.isNotEmpty) {
        final uri = Uri.tryParse(value);
        return uri?.hasScheme == true
            ? uri!.replace(userInfo: '', query: '', fragment: '').toString()
            : {'configured': true};
      }
      return value.length > 30000
          ? {'text': value.substring(0, 30000), 'truncated': true}
          : value;
    }
    if (value is List) {
      final items =
          value.take(50).map((v) => project(v, '', depth + 1)).toList();
      return value.length > 50
          ? {'items': items, 'total': value.length, 'truncated': true}
          : items;
    }
    if (value is Map) {
      return {
        for (final e in value.entries)
          if (!['__proto__', 'constructor', 'prototype'].contains(e.key))
            '${e.key}': project(e.value, '${e.key}', depth + 1)
      };
    }
    return value;
  }

  Future<Map<String, dynamic>> read(Map<String, dynamic> args) async {
    final settings = app.settings.toJson();
    for (final key in [
      'stylePromptPresets',
      'positivePromptPresets',
      'characterPromptPresets',
      'promptChunks'
    ]) {
      final v = settings[key];
      if (v is List) {
        settings[key] = {'source': 'list_studio_data', 'count': v.length};
      }
    }
    final sections = {
      'generation': generation,
      'settings': settings,
      'runtime': {
        'platform': 'android',
        'busy': app.busy,
        'queueRunning': app.generationQueueRunning
      },
      'references': {
        'vibeCount': app.extras.vibeImages.length,
        'preciseReferenceCount': app.extras.preciseReferences.length
      },
      'textTools': {
        'reverseMode': app.reverseMode.name,
        'convertMode': app.convertMode.name,
        'convertInput': app.convertInput,
        'convertResult': app.convertResult
      }
    };
    final section = args['section'] ?? 'all';
    if (section != 'all' && !sections.containsKey(section)) {
      throw StateError('未知 section');
    }
    return {
      'revision': revision,
      'capturedAt': DateTime.now().toUtc().toIso8601String(),
      'source': 'Android 本机实时状态；不含尚未保存的设置草稿',
      ...Map<String, dynamic>.from(project(
          section == 'all' ? sections : {'$section': sections[section]})),
      'writableSchema': schema,
      'collections': collections
    };
  }

  Future<Map<String, dynamic>> list(Map<String, dynamic> args) async {
    final collection = args['collection'];
    if (!collections.contains(collection)) throw StateError('未知数据集合');
    final offset = args['offset'] ?? 0, limit = args['limit'] ?? 20;
    if (offset is! int ||
        offset < 0 ||
        limit is! int ||
        limit < 1 ||
        limit > 50) throw StateError('offset 为非负整数，limit 为 1–50');
    final settings = app.settings.toJson();
    final rows = <dynamic>[];
    const settingsKeys = {
      'styles': 'stylePromptPresets',
      'styleGroups': 'stylePromptPresetGroups',
      'positivePresets': 'positivePromptPresets',
      'characterPresets': 'characterPromptPresets',
      'promptChunks': 'promptChunks'
    };
    if (settingsKeys.containsKey(collection)) {
      rows.addAll(settings[settingsKeys[collection]] as List? ?? []);
    } else if (collection == 'references') {
      rows.addAll(app.referencePresets.map((v) => v.toJson()));
    } else if (collection == 'history') {
      rows.addAll(app.history.map((v) => v.toJson()));
    } else if (collection == 'historyGroups') {
      rows.addAll(app.groups.map((v) => v.toJson()));
    } else {
      final workspace = await app.storage.getAgentWorkspaceStrict();
      rows.addAll(workspace.toJson()[collection] as List? ?? []);
    }
    final query = (args['query'] ?? '').toString().toLowerCase();
    final filtered = rows
        .map((x) => project(x))
        .where(
            (x) => query.isEmpty || jsonEncode(x).toLowerCase().contains(query))
        .toList();
    final items = <dynamic>[];
    var bytes = 0;
    for (final row in filtered.skip(offset).take(limit)) {
      final size = jsonEncode(row).length;
      if (items.isNotEmpty && bytes + size > 150000) break;
      items.add(row);
      bytes += size;
    }
    return {
      'collection': collection,
      'source': 'Studio 本机已保存资料',
      'total': filtered.length,
      'offset': offset,
      'items': items,
      'nextOffset':
          offset + items.length < filtered.length ? offset + items.length : null
    };
  }

  Future<Map<String, dynamic>> mutate(Map<String, dynamic> args) async {
    if (args['expectedRevision'] != revision) {
      throw StateError('配置已变化，请刷新后重新提交');
    }
    final target = args['target'], patch = args['patch'];
    if (patch is! Map || patch.length != 1 || !schema.containsKey(target)) {
      throw StateError('每次只能修改一个已开放字段');
    }
    final key = patch.keys.single, value = patch[key];
    final rule = (schema[target] as Map)[key];
    if (rule is! Map) throw StateError('字段未开放修改');
    if (rule['enum'] is List && !(rule['enum'] as List).contains(value)) {
      throw StateError('字段选项错误');
    }
    if (rule['type'] == 'boolean' && value is! bool ||
        rule['type'] == 'string' &&
            (value is! String || value.length > (rule['max'] ?? 30000))) {
      throw StateError('字段类型错误');
    }
    if (rule['type'] == 'number' &&
        (value is! num ||
            !value.isFinite ||
            value < rule['min'] ||
            value > rule['max'] ||
            (rule['step'] != null &&
                (value / rule['step'] - (value / rule['step']).round()).abs() >
                    1e-8))) throw StateError('字段超出范围或步长');
    if (app.busy || app.generationQueueRunning) throw StateError('请等待当前图片任务完成');
    if (target == 'settings') {
      final previous = app.settings,
          next = AppSettings.fromJson({...previous.toJson(), '$key': value});
      if (next.agentMaxOutputTokens > next.agentContextWindow) {
        throw StateError('输出上限不能大于上下文窗口');
      }
      if (next.toJson()[key] != value) throw StateError('参数组合不兼容');
      app.settings = next;
      try {
        await app.storage.setSettings(next);
      } catch (e) {
        if (identical(app.settings, next)) app.settings = previous;
        rethrow;
      }
    } else if (target == 'params') {
      if (key == 'stylePrompt' && app.settings.lockStylePrompt ||
          key == 'negativePrompt' && app.settings.lockNegativePrompt) {
        throw StateError('提示词已锁定，请先解除锁定');
      }
      final raw = {...app.params.toJson(), '$key': value};
      if (key == 'qualityToggle') {
        raw['qualityPreset'] = value == true ? 'standard' : 'none';
      }
      final next = GenerateParams.fromJson(raw);
      if (next.toJson()[key] != value) throw StateError('参数组合不兼容或尺寸超出限制');
      final previous = app.params;
      app.params = next;
      try {
        await app.storage.setParams(next);
      } catch (e) {
        if (identical(app.params, next)) app.params = previous;
        rethrow;
      }
    } else if (target == 'workbench') {
      switch (key) {
        case 'batchCount':
          app.batchCount = (value as num).toInt();
          break;
        case 'batchIntervalSeconds':
          app.batchIntervalSeconds = (value as num).toInt();
          app.settings.batchIntervalSeconds = app.batchIntervalSeconds;
          break;
        case 'inpaintModel':
          app.inpaintModel = value as String;
          break;
        case 'inpaintStrength':
          app.inpaintStrength = (value as num).toDouble();
          break;
        case 'inpaintNoise':
          app.inpaintNoise = (value as num).toDouble();
          break;
        case 'inpaintPositivePrompt':
          app.inpaintPositivePrompt = value as String;
          break;
        case 'upscaleScale':
          app.upscaleScale = (value as num).toInt();
          break;
        case 'directorTool':
          app.directorTool = value as String;
          break;
      }
      await app.persistToolState();
    } else if (target == 'i2iParams') {
      switch (key) {
        case 'strength':
          app.i2i.strength = (value as num).toDouble();
          break;
        case 'noise':
          app.i2i.noise = (value as num).toDouble();
          break;
        case 'extraNoiseSeed':
          app.i2i.extraNoiseSeed = (value as num).toInt();
          break;
      }
      await app.persistToolState();
    } else if (target == 'augmentOptions') {
      switch (key) {
        case 'defry':
          app.augmentOptions.defry = (value as num).toDouble();
          break;
        case 'colorizePrompt':
          app.augmentOptions.colorizePrompt = value as String;
          break;
        case 'emotion':
          app.augmentOptions.emotion = value as String;
          break;
        case 'emotionLevel':
          app.augmentOptions.emotionLevel = (value as num).toDouble();
          break;
      }
      await app.persistToolState();
    }
    app.markChanged();
    final current = target == 'settings'
        ? app.settings.toJson()
        : target == 'workbench'
            ? generation
            : generation[target] as Map;
    if (current[key] != value) throw StateError('保存后状态发生变化，请刷新核对');
    return {
      'persisted': rule['persistence'] != 'session',
      'scope': rule['persistence'] == 'session' ? 'current-session' : 'saved',
      'revision': revision,
      'readback': project(current[key], '$key')
    };
  }

  Future<Map<String, dynamic>> saveStyle(Map<String, dynamic> args) async {
    if (args['expectedRevision'] != revision) {
      throw StateError('配置已变化，请刷新后重新提交');
    }
    final name = args['name'],
        prompt = args['prompt'],
        id = args['id'],
        group = args['group'] ?? 'Default',
        rating = args['rating'] ?? 0;
    if (name is! String ||
        name.trim().isEmpty ||
        name.length > 200 ||
        prompt is! String ||
        prompt.trim().isEmpty ||
        prompt.length > 30000 ||
        group is! String ||
        rating is! num ||
        rating < 0 ||
        rating > 5) throw StateError('风格字段不合法');
    if (group != 'Default' &&
        !app.settings.stylePromptPresetGroups.contains(group)) {
      throw StateError('请选择已有分类');
    }
    final rows = app.settings.stylePromptPresets;
    final index = rows.indexWhere((x) => x.id == id);
    if (id != null && index < 0) throw StateError('风格不存在');
    final raw = {
      if (index >= 0) ...rows[index].toJson(),
      'id': id ?? 'studio-${DateTime.now().microsecondsSinceEpoch}',
      'name': name.trim(),
      'prompt': prompt.trim(),
      'group': group,
      'rating': rating,
      'createdAt':
          index >= 0 ? rows[index].createdAt : DateTime.now().toIso8601String()
    };
    final preset = StylePromptPreset.fromJson(raw);
    await app.setSettings((s) {
      if (index >= 0) {
        s.stylePromptPresets[index] = preset;
      } else {
        s.stylePromptPresets.add(preset);
      }
    });
    return {
      'persisted': true,
      'revision': revision,
      'readback': project(preset.toJson())
    };
  }

  static const importCollections = [
    'characters',
    'personas',
    'lorebooks',
    'samplerPresets',
    'styles',
    'positivePresets'
  ];
  Future<Map<String, dynamic>> importData(Map<String, dynamic> args) async {
    final collection = args['collection'], items = args['items'];
    if (!importCollections.contains(collection) ||
        items is! List ||
        items.isEmpty ||
        items.length > 50 ||
        jsonEncode(args).length > 95000) {
      throw StateError('请选择 1–50 项文本资料；大文件请使用完整备份');
    }
    dynamic clean(dynamic value, [String key = '', int depth = 0]) {
      if (depth > 12) throw StateError('资料层级过深');
      if (RegExp(
              r'path$|avatar|backgroundData|previewImages|apikey|secret|password|^token$|^accessToken$|^refreshToken$|cookie|credential|^__proto__$|^constructor$|^prototype$',
              caseSensitive: false)
          .hasMatch(key)) return null;
      if (value is Map) {
        if (value.containsKey('truncated') || value.containsKey('omitted')) {
          throw StateError('预览已截断，请使用完整备份');
        }
        final out = <String, dynamic>{};
        for (final e in value.entries) {
          final v = clean(e.value, '${e.key}', depth + 1);
          if (v != null) out['${e.key}'] = v;
        }
        return out;
      }
      if (value is List) {
        return value.map((v) => clean(v, '', depth + 1)).toList();
      }
      return value;
    }

    final rows = <Map<String, dynamic>>[];
    for (final item in items) {
      if (item is! Map) throw StateError('资料格式错误');
      final row = Map<String, dynamic>.from(clean(item));
      final name = row['name'];
      if (name is! String || name.trim().isEmpty || name.length > 200) {
        throw StateError('资料名称不能为空或过长');
      }
      if (['styles', 'positivePresets'].contains(collection) &&
          row['prompt'] is! String) throw StateError('提示词预设缺少 prompt');
      row.remove('lorebookId');
      row.remove('source');
      row.addAll(
          {'id': agentId(), 'createdAt': agentNow(), 'updatedAt': agentNow()});
      rows.add(row);
    }
    final directory = Directory(
        '${(await app.storage.agentWorkspaceDirectory()).path}/library-import-backups');
    await directory.create(recursive: true);
    final backup = File(
        '${directory.path}/${DateTime.now().millisecondsSinceEpoch}-${agentId()}.json');
    if (collection == 'styles' || collection == 'positivePresets') {
      final key = collection == 'styles'
          ? 'stylePromptPresets'
          : 'positivePromptPresets';
      await backup.writeAsString(
          jsonEncode(
              {'collection': collection, 'items': app.settings.toJson()[key]}),
          flush: true);
      final previous = app.settings;
      final next = AppSettings.fromJson({
        ...previous.toJson(),
        key: [
          ...(previous.toJson()[key] as List),
          ...rows.map((x) => {...x, 'group': 'Default', 'previewImages': []})
        ]
      });
      await app.storage.setSettings(next);
      app.settings = next;
      app.markChanged();
    } else {
      final workspace = await app.storage.getAgentWorkspaceStrict();
      await backup.writeAsString(jsonEncode(workspace.toJson()), flush: true);
      // Re-read after filesystem I/O, so a concurrent app edit is not replaced.
      final fresh = (await app.storage.getAgentWorkspaceStrict()).toJson();
      await app.storage.setAgentWorkspace(AgentWorkspace.fromJson({
        ...fresh,
        '$collection': [...(fresh[collection] as List), ...rows]
      }));
    }
    return {
      'imported': rows.length,
      'collection': collection,
      'mode': 'append-new-identities',
      'backupPath': backup.path
    };
  }

  Future<Map<String, dynamic>> execute(
          String tool, Map<String, dynamic> args) =>
      switch (tool) {
        'langbai_read_studio_state' => read(args),
        'langbai_list_studio_data' => list(args),
        'langbai_import_studio_data' => importData(args),
        'langbai_update_studio_config' => mutate(args),
        'langbai_save_style_preset' => saveStyle(args),
        _ => throw StateError('Unknown Studio data operation'),
      };
}

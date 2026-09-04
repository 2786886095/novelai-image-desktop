import 'dart:convert';
import 'dart:io';

import '../artist/artist_recipe.dart';
import '../images/png_metadata.dart';
import '../models/nai_models.dart';
import '../references/reference_presets.dart';
import '../services/artist_tag_service.dart';
import '../services/online_gallery_service.dart';
import '../state/app_state.dart';
import 'agent_models.dart';

const agentReadTools = <String>{
  'langbai_get_generation_state',
  'langbai_search_tags',
  'langbai_search_artist_styles',
  'langbai_search_online_gallery',
  'langbai_list_prompt_presets',
  'langbai_list_reference_presets',
  'langbai_read_image_metadata',
  'langbai_list_history',
  'langbai_memory_list',
};

const agentMutatingTools = <String>{
  'langbai_generate_image',
  'langbai_redraw_image',
  'langbai_inpaint_image',
  'langbai_upscale_image',
  'langbai_director',
  'langbai_reverse_prompt',
  'langbai_convert_prompt',
  'langbai_save_prompt_preset',
  'langbai_apply_prompt',
  'langbai_memory_upsert',
  'langbai_memory_delete',
};

String agentToolTitle(String name) => switch (name) {
      'langbai_get_generation_state' => '读取当前生图状态',
      'langbai_search_tags' => '检索 Danbooru Tag',
      'langbai_search_artist_styles' => '检索画师与画风',
      'langbai_search_online_gallery' => '搜索在线画廊',
      'langbai_list_prompt_presets' => '读取提示词预设',
      'langbai_list_reference_presets' => '读取参考图预设',
      'langbai_read_image_metadata' => '读取图片内嵌参数',
      'langbai_list_history' => '读取历史图片',
      'langbai_generate_image' => '生成图片',
      'langbai_redraw_image' => '图生图重绘',
      'langbai_inpaint_image' => '局部重绘',
      'langbai_upscale_image' => '云端超分',
      'langbai_director' => 'Director 后期',
      'langbai_reverse_prompt' => 'AI 反推提示词',
      'langbai_convert_prompt' => '转换提示词',
      'langbai_save_prompt_preset' => '保存正面提示词预设',
      'langbai_apply_prompt' => '替换生成页提示词',
      'langbai_memory_list' => '读取记忆',
      'langbai_memory_upsert' => '保存记忆',
      'langbai_memory_delete' => '删除记忆',
      _ => name,
    };

Map<String, dynamic> _function(
  String name,
  String description,
  Map<String, dynamic> properties, {
  List<String> required = const [],
}) =>
    {
      'type': 'function',
      'function': {
        'name': name,
        'description': description,
        'parameters': {
          'type': 'object',
          'properties': properties,
          'required': required,
          'additionalProperties': false,
        },
      },
    };

Map<String, dynamic> _string([String? description, List<String>? values]) => {
      'type': 'string',
      if (description != null) 'description': description,
      if (values != null) 'enum': values,
    };

Map<String, dynamic> _number(String description, num minimum, num maximum) => {
      'type': 'number',
      'description': description,
      'minimum': minimum,
      'maximum': maximum,
    };

Map<String, dynamic> _integer(String description, int minimum, int maximum) => {
      'type': 'integer',
      'description': description,
      'minimum': minimum,
      'maximum': maximum,
    };

Map<String, dynamic> _generationProperties() => {
      'positivePrompt': _string('正面提示词'),
      'negativePrompt': _string('负面提示词'),
      'stylePrompt': _string('风格提示词'),
      'model': _string('NovelAI 模型 ID；省略则保留当前模型'),
      'modelMode': _string('模型模式', ['anime', 'furry']),
      'width': _integer('宽度，64 的倍数', 64, 2048),
      'height': _integer('高度，64 的倍数', 64, 2048),
      'steps': _integer('采样步数', 1, 50),
      'cfgScale': _number('提示词引导', 0, 10),
      'cfgRescale': _number('CFG Rescale', 0, 1),
      'sampler': _string('NovelAI 采样器 ID'),
      'noiseSchedule': _string('噪声计划', ['native', 'karras', 'exponential']),
      'seed': _integer('无符号 32 位种子', 0, 4294967295),
      'seedMode': _string('种子模式', ['fixed', 'random']),
      'ucPreset': _integer('负面预设', 0, 3),
      'qualityPreset': _string('质量预设', ['standard', 'light', 'none']),
      'transparentBackground': {'type': 'boolean'},
      'smea': {'type': 'boolean'},
      'smeaDyn': {'type': 'boolean'},
      'variety': {'type': 'boolean'},
      'fileNamePrefix': _string('输出文件名前缀'),
      'historyGroupId': _string('历史分组 ID'),
      'characterPrompts': {
        'type': 'array',
        'description': 'V4/V4.5/V5 多角色提示词',
        'maxItems': 32,
        'items': {
          'type': 'object',
          'additionalProperties': false,
          'properties': {
            'prompt': _string('角色正面提示词'),
            'negativePrompt': _string('角色负面提示词'),
            'useCoords': {'type': 'boolean'},
            'x': _number('横向位置', 0, 1),
            'y': _number('纵向位置', 0, 1),
          },
          'required': ['prompt'],
        },
      },
      'vibeReferences': {
        'type': 'array',
        'description': '由对话或历史 attachmentId 指定的 Vibe Transfer 参考图；V5 不支持',
        'maxItems': 16,
        'items': {
          'type': 'object',
          'additionalProperties': false,
          'properties': {
            'attachmentId': _string('图片 attachmentId'),
            'infoExtracted': _number('信息提取', 0, 1),
            'strength': _number('参考强度', 0, 1),
          },
          'required': ['attachmentId'],
        },
      },
      'preciseReferences': {
        'type': 'array',
        'description': '由 attachmentId 指定的 V4.5 精准参考图',
        'maxItems': 16,
        'items': {
          'type': 'object',
          'additionalProperties': false,
          'properties': {
            'attachmentId': _string('图片 attachmentId'),
            'type': _string('参考类型', ['character', 'style', 'character&style']),
            'strength': _number('参考强度', 0, 1),
            'fidelity': _number('保真度', 0, 1),
          },
          'required': ['attachmentId'],
        },
      },
    };

List<Map<String, dynamic>> agentToolSchemas() => [
      _function('langbai_get_generation_state', '读取当前模型、提示词、尺寸、锁定项与生成设置。', {}),
      _function(
        'langbai_search_tags',
        '按中文、英文、角色、动作、表情、构图或物体检索准确 Tag。',
        {
          'query': _string('要检索的概念'),
          'limit': _integer('返回数量', 1, 50),
        },
        required: ['query'],
      ),
      _function(
        'langbai_search_artist_styles',
        '检索 Danbooru 画师标签与热门度。',
        {
          'query': _string('画师名或片段'),
          'limit': _integer('返回数量', 1, 50),
        },
        required: ['query'],
      ),
      _function(
        'langbai_search_online_gallery',
        '搜索 Danbooru、Safebooru、Gelbooru 或法典图鉴。',
        {
          'query': _string('搜索词'),
          'source':
              _string('来源', ['danbooru', 'safebooru', 'gelbooru', 'quicktag']),
          'safeOnly': {'type': 'boolean'},
        },
        required: ['query'],
      ),
      _function(
        'langbai_list_prompt_presets',
        '搜索用户保存的正面提示词和风格提示词预设，优先复用而不是重新拼写。',
        {
          'query': _string('名称、分组或提示词片段'),
          'kind': _string('预设类型', ['all', 'positive', 'style']),
          'limit': _integer('返回数量', 1, 50),
        },
      ),
      _function(
        'langbai_list_reference_presets',
        '搜索已保存的 Vibe Transfer 与精准参考图，返回可直接用于生图的 attachmentId 和保存参数。',
        {
          'query': _string('预设、角色、游戏或分类'),
          'group': _string('精确分组名'),
          'kind': _string('参考类型', ['all', 'vibe', 'precise']),
          'limit': _integer('返回图片数量', 1, 100),
        },
      ),
      _function(
        'langbai_read_image_metadata',
        '读取图片中内嵌的 NovelAI、Stable Diffusion 或 ComfyUI 参数，避免凭画面猜测。',
        {'attachmentId': _string('图片 attachmentId')},
        required: ['attachmentId'],
      ),
      _function(
        'langbai_list_history',
        '列出本机最近生成图片，返回可供后续工具使用的 attachmentId。',
        {'limit': _integer('返回数量', 1, 50)},
      ),
      _function(
        'langbai_generate_image',
        '按当前设置及高级参数生成图片，支持多角色、Vibe Transfer 与精准参考图。会消耗 NovelAI 免费额度或 Anlas。',
        {
          ..._generationProperties(),
          'count': _integer('生成数量', 1, 8),
        },
        required: ['positivePrompt'],
      ),
      _function(
        'langbai_redraw_image',
        '使用对话附件或历史图片执行图生图重绘，并支持高级参数及当前模型允许的参考图。',
        {
          ..._generationProperties(),
          'attachmentId': _string('源图片 attachmentId'),
          'strength': _number('重绘强度', 0.01, 1),
          'noise': _number('噪声', 0, 0.99),
        },
        required: ['attachmentId', 'positivePrompt'],
      ),
      _function(
        'langbai_inpaint_image',
        '使用源图片和黑白遮罩附件执行局部重绘；白色区域会被重绘。',
        {
          'attachmentId': _string('源图片 attachmentId'),
          'maskAttachmentId': _string('遮罩 attachmentId'),
          'positivePrompt': _string('局部重绘正面提示词'),
          'strength': _number('重绘强度', 0.1, 1),
        },
        required: ['attachmentId', 'maskAttachmentId', 'positivePrompt'],
      ),
      _function(
        'langbai_upscale_image',
        '对附件或历史图片执行 NovelAI 云端超分。',
        {
          'attachmentId': _string('图片 attachmentId'),
          'scale': {
            'type': 'integer',
            'enum': [2, 4]
          },
        },
        required: ['attachmentId'],
      ),
      _function(
        'langbai_director',
        '对附件或历史图片执行 Director Tools 后期。',
        {
          'attachmentId': _string('图片 attachmentId'),
          'tool': _string('Director 工具', [
            'bg-removal',
            'lineart',
            'sketch',
            'colorize',
            'emotion',
            'declutter',
          ]),
          'prompt': _string('上色提示词'),
          'emotion': _string('表情'),
          'emotionLevel': _number('表情强度', 0, 5),
          'defry': _number('Defry', 0, 5),
        },
        required: ['attachmentId', 'tool'],
      ),
      _function(
        'langbai_reverse_prompt',
        '对图片附件执行 AI 反推，输出 NovelAI 提示词。使用用户配置的视觉 API。',
        {
          'attachmentId': _string('图片 attachmentId'),
          'mode': _string('输出形式', ['tags', 'natural', 'mixed']),
          'hint': _string('主体或目标提示'),
          'knownCharacter': {'type': 'boolean'},
        },
        required: ['attachmentId'],
      ),
      _function(
        'langbai_convert_prompt',
        '把中文或自然语言转换为 NovelAI 提示词。使用用户配置的文本 API。',
        {
          'text': _string('待转换文本'),
          'mode': _string('输出形式', ['tags', 'natural', 'mixed']),
          'knownCharacter': {'type': 'boolean'},
        },
        required: ['text'],
      ),
      _function(
        'langbai_save_prompt_preset',
        '把正面提示词保存为可跨场景调用的预设。',
        {'name': _string('可选名称'), 'prompt': _string('正面提示词')},
        required: ['prompt'],
      ),
      _function(
        'langbai_apply_prompt',
        '直接替换生成页当前正面提示词，可同时设置负面和风格提示词。',
        {
          'positivePrompt': _string('正面提示词'),
          'negativePrompt': _string('负面提示词'),
          'stylePrompt': _string('风格提示词'),
        },
        required: ['positivePrompt'],
      ),
      _function('langbai_memory_list', '读取用户批准的长期记忆。', {}),
      _function(
        'langbai_memory_upsert',
        '保存或更新长期创作偏好。禁止存储 API Key、Token 或一次性任务。',
        {
          'id': _string('更新时提供记忆 id'),
          'title': _string('标题'),
          'content': _string('内容'),
          'scope': _string('作用域', ['global', 'conversation']),
        },
        required: ['title', 'content', 'scope'],
      ),
      _function(
        'langbai_memory_delete',
        '删除指定长期记忆。',
        {'id': _string('记忆 id')},
        required: ['id'],
      ),
    ];

typedef AgentMemoryList = List<Map<String, dynamic>> Function();
typedef AgentMemoryUpsert = Future<Map<String, dynamic>> Function(
    Map<String, dynamic> input);
typedef AgentMemoryDelete = Future<bool> Function(String id);

const _agentTransientTools = <String>{
  'langbai_generate_image',
  'langbai_redraw_image',
  'langbai_inpaint_image',
  'langbai_upscale_image',
  'langbai_director',
  'langbai_reverse_prompt',
  'langbai_convert_prompt',
};

class _AgentAppSnapshot {
  final GenerateParams params;
  final GenerateExtras extras;
  final int batchCount;
  final String modelMode;
  final String generationGroupId;
  final I2IParams i2i;
  final WorkingImage? workbenchImage;
  final ImportedGenerateParams? workbenchImportedParams;
  final List<CharCaptionItem> workbenchCharacterCaptions;
  final String inpaintModel;
  final double inpaintStrength;
  final double inpaintNoise;
  final String inpaintPositivePrompt;
  final int upscaleScale;
  final String directorTool;
  final AugmentOptions augmentOptions;
  final ReversePromptMode reverseMode;
  final String reverseHint;
  final bool reverseKnownCharacter;
  final ReversePromptMode convertMode;
  final String convertInput;
  final bool convertKnownCharacter;
  final String savedStylePrompt;
  final String savedNegativePrompt;

  _AgentAppSnapshot._({
    required this.params,
    required this.extras,
    required this.batchCount,
    required this.modelMode,
    required this.generationGroupId,
    required this.i2i,
    required this.workbenchImage,
    required this.workbenchImportedParams,
    required this.workbenchCharacterCaptions,
    required this.inpaintModel,
    required this.inpaintStrength,
    required this.inpaintNoise,
    required this.inpaintPositivePrompt,
    required this.upscaleScale,
    required this.directorTool,
    required this.augmentOptions,
    required this.reverseMode,
    required this.reverseHint,
    required this.reverseKnownCharacter,
    required this.convertMode,
    required this.convertInput,
    required this.convertKnownCharacter,
    required this.savedStylePrompt,
    required this.savedNegativePrompt,
  });

  factory _AgentAppSnapshot.capture(AppState app) => _AgentAppSnapshot._(
        params: app.params.copy(),
        extras: app.extras.copy(),
        batchCount: app.batchCount,
        modelMode: app.settings.modelMode,
        generationGroupId: app.generationGroupId,
        i2i: I2IParams(
          strength: app.i2i.strength,
          noise: app.i2i.noise,
          extraNoiseSeed: app.i2i.extraNoiseSeed,
        ),
        workbenchImage: app.workbenchImage,
        workbenchImportedParams: app.workbenchImportedParams,
        workbenchCharacterCaptions:
            List<CharCaptionItem>.from(app.workbenchCharacterCaptions),
        inpaintModel: app.inpaintModel,
        inpaintStrength: app.inpaintStrength,
        inpaintNoise: app.inpaintNoise,
        inpaintPositivePrompt: app.inpaintPositivePrompt,
        upscaleScale: app.upscaleScale,
        directorTool: app.directorTool,
        augmentOptions: AugmentOptions(
          defry: app.augmentOptions.defry,
          colorizePrompt: app.augmentOptions.colorizePrompt,
          emotion: app.augmentOptions.emotion,
          emotionLevel: app.augmentOptions.emotionLevel,
        ),
        reverseMode: app.reverseMode,
        reverseHint: app.reverseHint,
        reverseKnownCharacter: app.reverseKnownCharacter,
        convertMode: app.convertMode,
        convertInput: app.convertInput,
        convertKnownCharacter: app.convertKnownCharacter,
        savedStylePrompt: app.settings.savedStylePrompt,
        savedNegativePrompt: app.settings.savedNegativePrompt,
      );

  Future<void> restore(AppState app) async {
    app
      ..params = params
      ..extras = extras.copy()
      ..batchCount = batchCount
      ..generationGroupId = generationGroupId
      ..i2i = i2i
      ..workbenchImage = workbenchImage
      ..workbenchImportedParams = workbenchImportedParams
      ..workbenchCharacterCaptions = workbenchCharacterCaptions
      ..inpaintModel = inpaintModel
      ..inpaintStrength = inpaintStrength
      ..inpaintNoise = inpaintNoise
      ..inpaintPositivePrompt = inpaintPositivePrompt
      ..upscaleScale = upscaleScale
      ..directorTool = directorTool
      ..augmentOptions = augmentOptions
      ..reverseMode = reverseMode
      ..reverseHint = reverseHint
      ..reverseKnownCharacter = reverseKnownCharacter
      ..convertMode = convertMode
      ..convertInput = convertInput
      ..convertKnownCharacter = convertKnownCharacter;
    app.settings
      ..modelMode = modelMode
      ..savedStylePrompt = savedStylePrompt
      ..savedNegativePrompt = savedNegativePrompt;
    await app.storage.setParams(params);
    await app.persistToolState();
    app.markChanged();
  }
}

class AgentToolExecutor {
  final AppState app;
  final AgentMemoryList listMemories;
  final AgentMemoryUpsert upsertMemory;
  final AgentMemoryDelete deleteMemory;

  AgentToolExecutor({
    required this.app,
    required this.listMemories,
    required this.upsertMemory,
    required this.deleteMemory,
  });

  String _text(Object? value, [int maxLength = 100000]) {
    final text = value?.toString().trim() ?? '';
    return text.length <= maxLength ? text : text.substring(0, maxLength);
  }

  int _int(Object? value, int fallback, int minimum, int maximum) {
    final parsed = value is num ? value.round() : int.tryParse('$value');
    return (parsed ?? fallback).clamp(minimum, maximum).toInt();
  }

  double _double(
      Object? value, double fallback, double minimum, double maximum) {
    final parsed = value is num ? value.toDouble() : double.tryParse('$value');
    final safe = parsed?.isFinite == true ? parsed! : fallback;
    return safe.clamp(minimum, maximum).toDouble();
  }

  String _json(Object? value) =>
      const JsonEncoder.withIndent('  ').convert(value);

  AgentAttachment _historyAttachment(HistoryItem item) {
    var size = 0;
    try {
      size = File(item.filePath).lengthSync();
    } catch (_) {}
    return AgentAttachment(
      id: item.id,
      name: item.filePath.split(RegExp(r'[/\\]')).last,
      mime: 'image/png',
      size: size,
      kind: 'image',
      filePath: item.filePath,
      width: item.width,
      height: item.height,
      createdAt: item.createdAt,
    );
  }

  String _imageMime(String filePath) {
    final lower = filePath.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/png';
  }

  AgentAttachment _referencePresetAttachment(ReferencePreset preset) {
    var size = 0;
    try {
      size = File(preset.filePath).lengthSync();
    } catch (_) {}
    return AgentAttachment(
      id: 'reference-preset:${preset.id}',
      name: preset.filePath.split(RegExp(r'[/\\]')).last,
      mime: _imageMime(preset.filePath),
      size: size,
      kind: 'image',
      filePath: preset.filePath,
      width: preset.width > 0 ? preset.width : null,
      height: preset.height > 0 ? preset.height : null,
      createdAt: preset.createdAt,
    );
  }

  AgentAttachment _findAttachment(String id, List<AgentAttachment> available) {
    final direct = available.where((item) => item.id == id).firstOrNull;
    if (direct != null && File(direct.filePath).existsSync()) return direct;
    final history = app.history.where((item) => item.id == id).firstOrNull;
    if (history != null && File(history.filePath).existsSync()) {
      return _historyAttachment(history);
    }
    if (id.startsWith('reference-preset:')) {
      final presetId = id.substring('reference-preset:'.length);
      final preset =
          app.referencePresets.where((item) => item.id == presetId).firstOrNull;
      if (preset != null && File(preset.filePath).existsSync()) {
        return _referencePresetAttachment(preset);
      }
    }
    throw StateError('找不到 attachmentId=$id 对应的本机图片。');
  }

  List<Map<String, dynamic>> _recordList(Object? value, int maximum) {
    if (value is! List) return const [];
    return value
        .take(maximum)
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Future<String> _attachmentBase64(
      Object? value, List<AgentAttachment> available) async {
    final id = _text(value, 200);
    if (id.isEmpty) throw StateError('参考图缺少 attachmentId。');
    final attachment = _findAttachment(id, available);
    if (attachment.kind != 'image' && !attachment.mime.startsWith('image/')) {
      throw StateError('attachmentId=$id 不是图片附件。');
    }
    final file = File(attachment.filePath);
    final length = await file.length();
    if (length > 48 * 1024 * 1024) {
      throw StateError('attachmentId=$id 超过 48 MB。');
    }
    return base64Encode(await file.readAsBytes());
  }

  Future<void> _applyGenerationInput(
    Map<String, dynamic> args,
    List<AgentAttachment> available,
  ) async {
    app.setParam((params) {
      params.positivePrompt = _text(args['positivePrompt']);
      if (args['negativePrompt'] is String) {
        params.negativePrompt = _text(args['negativePrompt']);
      }
      if (args['stylePrompt'] is String) {
        params.stylePrompt = _text(args['stylePrompt']);
      }
      final model = _text(args['model'], 100);
      if (model.isNotEmpty && naiModels.any((item) => item.value == model)) {
        params.model = model;
      }
      if (args.containsKey('width')) {
        params.width =
            (_int(args['width'], params.width, 64, 2048) / 64).round() * 64;
      }
      if (args.containsKey('height')) {
        params.height =
            (_int(args['height'], params.height, 64, 2048) / 64).round() * 64;
      }
      params.steps = _int(args['steps'], params.steps, 1, 50);
      params.cfgScale = _double(args['cfgScale'], params.cfgScale, 0, 10);
      params.cfgRescale = _double(args['cfgRescale'], params.cfgRescale, 0, 1);
      final sampler = _text(args['sampler'], 100);
      if (sampler.isNotEmpty &&
          naiSamplers.any((item) => item.value == sampler)) {
        params.sampler = sampler;
      }
      final schedule = _text(args['noiseSchedule'], 100);
      if (schedule.isNotEmpty &&
          naiNoiseSchedules.any((item) => item.value == schedule)) {
        params.noiseSchedule = schedule;
      }
      if (args.containsKey('seed')) {
        params.seed = _int(args['seed'], params.seed, 0, 0xffffffff);
        params.seedMode = args['seedMode'] == 'random'
            ? 'random'
            : args['seedMode'] == 'fixed'
                ? 'fixed'
                : params.seed > 0
                    ? 'fixed'
                    : 'random';
      } else if (args['seedMode'] == 'fixed' || args['seedMode'] == 'random') {
        params.seedMode = args['seedMode'].toString();
      }
      if (args.containsKey('ucPreset')) {
        params.ucPreset = _int(args['ucPreset'], params.ucPreset, 0, 3);
      }
      if (const {'standard', 'light', 'none'}.contains(args['qualityPreset'])) {
        params.qualityPreset = args['qualityPreset'].toString();
      }
      if (args['transparentBackground'] is bool) {
        params.transparentBackground = args['transparentBackground'] == true;
      }
      if (args['smea'] is bool) params.smea = args['smea'] == true;
      if (args['smeaDyn'] is bool) params.smeaDyn = args['smeaDyn'] == true;
      if (args['variety'] is bool) params.variety = args['variety'] == true;
      if (args['fileNamePrefix'] is String) {
        params.fileNamePrefix = _text(args['fileNamePrefix'], 80);
      }
      if (app.settings.lockStylePrompt) {
        params.stylePrompt = app.settings.savedStylePrompt;
      }
      if (app.settings.lockNegativePrompt) {
        params.negativePrompt = app.settings.savedNegativePrompt;
      }
    });

    if (args['modelMode'] == 'anime' || args['modelMode'] == 'furry') {
      app.settings.modelMode = args['modelMode'].toString();
    }
    if (args['historyGroupId'] is String) {
      app.generationGroupId = _text(args['historyGroupId'], 100);
    }

    if (args.containsKey('characterPrompts')) {
      if (!app.params.isV4Plus) {
        throw StateError('${app.params.model} 不支持角色提示词。');
      }
      app.extras.charCaptions =
          _recordList(args['characterPrompts'], app.params.maxCharacterPrompts)
              .map((item) {
        final prompt = _text(item['prompt']);
        if (prompt.isEmpty) throw StateError('角色提示词不能为空。');
        return CharCaptionItem(
          prompt: prompt,
          negativePrompt: _text(item['negativePrompt']),
          useCoords: item['useCoords'] == true,
          x: _double(item['x'], 0.5, 0, 1),
          y: _double(item['y'], 0.5, 0, 1),
        );
      }).toList();
    }

    if (args.containsKey('vibeReferences')) {
      if (!app.params.supportsVibeTransfer) {
        throw StateError('${app.params.model} 不支持 Vibe Transfer。');
      }
      final items = <VibeTransferItem>[];
      for (final item in _recordList(args['vibeReferences'], 16)) {
        items.add(VibeTransferItem(
          base64: await _attachmentBase64(item['attachmentId'], available),
          infoExtracted: _double(item['infoExtracted'], 1, 0, 1),
          strength: _double(item['strength'], 1, 0, 1),
          sourcePath:
              _findAttachment(_text(item['attachmentId']), available).filePath,
        ));
      }
      app.extras.vibeImages = items;
    }

    if (args.containsKey('preciseReferences')) {
      if (!app.params.supportsPreciseReference) {
        throw StateError('${app.params.model} 不支持精准参考图。');
      }
      final items = <PreciseReferenceItem>[];
      for (final item in _recordList(args['preciseReferences'], 16)) {
        final attachment =
            _findAttachment(_text(item['attachmentId']), available);
        final type = const {'character', 'style', 'character&style'}
                .contains(item['type'])
            ? item['type'].toString()
            : 'character';
        items.add(PreciseReferenceItem(
          base64: await _attachmentBase64(item['attachmentId'], available),
          type: type,
          strength: _double(item['strength'], 1, 0, 1),
          fidelity: _double(item['fidelity'], 1, 0, 1),
          sourcePath: attachment.filePath,
          width: attachment.width ?? 0,
          height: attachment.height ?? 0,
        ));
      }
      app.extras.preciseReferences = items;
    }
  }

  Future<List<AgentAttachment>> _collectNewImages(
    Set<String> before,
    Future<void> Function() operation,
  ) async {
    if (app.busy) throw StateError('另一个图像任务正在运行，请稍后重试。');
    await operation();
    final items =
        app.history.where((item) => !before.contains(item.id)).toList();
    if (items.isEmpty) {
      throw StateError(
          app.displayStatus.trim().isEmpty ? '工具没有返回图片。' : app.displayStatus);
    }
    return items.map(_historyAttachment).toList();
  }

  ReversePromptMode _mode(Object? value) => switch (value) {
        'tags' => ReversePromptMode.tags,
        'mixed' => ReversePromptMode.mixed,
        _ => ReversePromptMode.natural,
      };

  Future<AgentToolResult> execute(
    String tool,
    Map<String, dynamic> args,
    List<AgentAttachment> available,
  ) async {
    final title = agentToolTitle(tool);
    final snapshot = _agentTransientTools.contains(tool)
        ? _AgentAppSnapshot.capture(app)
        : null;
    try {
      switch (tool) {
        case 'langbai_get_generation_state':
          return AgentToolResult(
            ok: true,
            title: title,
            output: _json({
              'params': app.params.toJson(),
              'modelMode': app.settings.modelMode,
              'generationGroupId': app.generationGroupId,
              'lockedStylePrompt': app.settings.lockStylePrompt
                  ? app.settings.savedStylePrompt
                  : '',
              'lockedNegativePrompt': app.settings.lockNegativePrompt
                  ? app.settings.savedNegativePrompt
                  : '',
              'streamPreviewEnabled': app.settings.streamPreviewEnabled,
              'references': {
                'vibeCount': app.extras.vibeImages.length,
                'preciseReferenceCount': app.extras.preciseReferences.length,
                'characterPrompts': app.extras.charCaptions
                    .map((item) => item.toJson())
                    .toList(),
              },
              'referenceCapabilities': {
                'maxCharacterPrompts': app.params.maxCharacterPrompts,
                'vibeTransfer': app.params.supportsVibeTransfer,
                'preciseReference': app.params.supportsPreciseReference,
                'attachmentIdsRequiredForAgentReferences': true,
              },
            }),
          );
        case 'langbai_search_tags':
          final query = _text(args['query'], 300);
          final limit = _int(args['limit'], 20, 1, 50);
          final results = await app.suggestTags(query);
          return AgentToolResult(
            ok: true,
            title: title,
            output: _json(results
                .take(limit)
                .map((item) => {
                      'tag': item.tag,
                      'count': item.count,
                      'description': item.description,
                    })
                .toList()),
          );
        case 'langbai_search_artist_styles':
          final query = canonicalArtistTagName(_text(args['query'], 300));
          final limit = _int(args['limit'], 20, 1, 50);
          final pool =
              await ArtistTagService().popular(app.settings, limit: 1000);
          final matches = pool
              .where((item) => query.isEmpty || item.name.contains(query))
              .take(limit)
              .map((item) => {
                    'tag': 'artist:${item.name}',
                    'name': item.name,
                    'postCount': item.postCount,
                  })
              .toList();
          return AgentToolResult(
              ok: true, title: title, output: _json(matches));
        case 'langbai_search_online_gallery':
          final source = switch (args['source']) {
            'safebooru' => OnlineGallerySource.safebooru,
            'gelbooru' => OnlineGallerySource.gelbooru,
            'quicktag' => OnlineGallerySource.quicktag,
            _ => OnlineGallerySource.danbooru,
          };
          final service = OnlineGalleryService();
          try {
            final page = await service.search(
              source: source,
              query: _text(args['query'], 300),
              safeOnly: args['safeOnly'] != false,
            );
            return AgentToolResult(
              ok: true,
              title: title,
              output: _json(page.items
                  .take(20)
                  .map((item) => {
                        'id': item.id,
                        'title': item.title,
                        'author': item.author,
                        'prompt': item.prompt,
                        'tags': {
                          'artists': item.tags.artists,
                          'characters': item.tags.characters,
                          'copyrights': item.tags.copyrights,
                          'general': item.tags.general.take(40).toList(),
                        },
                        'sourceUrl': item.sourceUrl,
                      })
                  .toList()),
            );
          } finally {
            service.close();
          }
        case 'langbai_list_prompt_presets':
          final query = _text(args['query'], 300).toLowerCase();
          final kind = const {'all', 'positive', 'style'}.contains(args['kind'])
              ? args['kind'].toString()
              : 'all';
          final limit = _int(args['limit'], 20, 1, 50);
          final presets = <Map<String, dynamic>>[];
          if (kind == 'all' || kind == 'positive') {
            presets.addAll(app.settings.positivePromptPresets.map((preset) => {
                  'id': preset.id,
                  'kind': 'positive',
                  'name': preset.name,
                  'prompt': _text(preset.prompt, 20000),
                  'promptTruncated': preset.prompt.length > 20000,
                  'previewImageCount': preset.previewImages.length,
                  'createdAt': preset.createdAt,
                }));
          }
          if (kind == 'all' || kind == 'style') {
            presets.addAll(app.settings.stylePromptPresets.map((preset) => {
                  'id': preset.id,
                  'kind': 'style',
                  'name': preset.name,
                  'group': preset.group,
                  'prompt': _text(preset.prompt, 20000),
                  'promptTruncated': preset.prompt.length > 20000,
                  'previewImageCount': preset.previewImages.length,
                  'createdAt': preset.createdAt,
                }));
          }
          final promptMatches = presets.where((preset) {
            if (query.isEmpty) return true;
            return [
              preset['name'],
              preset['group'],
              preset['prompt'],
            ].whereType<Object>().join(' ').toLowerCase().contains(query);
          }).toList();
          return AgentToolResult(
            ok: true,
            title: title,
            output: _json({
              'total': promptMatches.length,
              'items': promptMatches.take(limit).toList(),
            }),
          );
        case 'langbai_list_reference_presets':
          final query = _text(args['query'], 300).toLowerCase();
          final group = _text(args['group'], 160);
          final kind = const {'all', 'vibe', 'precise'}.contains(args['kind'])
              ? args['kind'].toString()
              : 'all';
          final limit = _int(args['limit'], 24, 1, 100);
          final matches = app.referencePresets.where((preset) {
            if (!File(preset.filePath).existsSync()) return false;
            if (kind != 'all' && preset.kind.jsonValue != kind) return false;
            if (group.isNotEmpty && preset.group != group) return false;
            return query.isEmpty || preset.localizedSearchText.contains(query);
          }).toList();
          final selected = matches.take(limit).toList();
          final images = selected.map(_referencePresetAttachment).toList();
          return AgentToolResult(
            ok: true,
            title: title,
            output: _json({
              'total': matches.length,
              'groups': app.referencePresetGroups,
              'items': [
                for (var index = 0; index < selected.length; index++)
                  {
                    'attachmentId': images[index].id,
                    'presetId': selected[index].id,
                    'name':
                        selected[index].localizedName(app.settings.language),
                    'originalName': selected[index].name,
                    'group': selected[index].group,
                    'kind': selected[index].kind.jsonValue,
                    'width': selected[index].width,
                    'height': selected[index].height,
                    if (selected[index].kind == ReferencePresetKind.vibe)
                      'vibeReference': {
                        'infoExtracted': selected[index].infoExtracted,
                        'strength': selected[index].strength,
                      }
                    else
                      'preciseReference': {
                        'type': selected[index].preciseType,
                        'strength': selected[index].strength,
                        'fidelity': selected[index].fidelity,
                      },
                    'sourceGame': selected[index]
                        .localizedGameName(app.settings.language),
                    'sourceCategory': selected[index].sourceCategory,
                  },
              ],
            }),
            generatedImages: images,
          );
        case 'langbai_read_image_metadata':
          final attachment =
              _findAttachment(_text(args['attachmentId'], 200), available);
          final file = File(attachment.filePath);
          if (file.lengthSync() > 48 * 1024 * 1024) {
            throw StateError('图片超过 48 MB，无法读取内嵌参数。');
          }
          final report = inspectImageMetadata(
              parseImageTextMetadata(await file.readAsBytes()));
          return AgentToolResult(
            ok: true,
            title: title,
            output: _json({
              'attachmentId': attachment.id,
              'found': report.kind != ImageMetadataKind.unknown ||
                  !report.imported.isEmpty ||
                  report.characterCaptions.isNotEmpty,
              'kind': report.kind.name,
              'software': report.software,
              'parameters': report.imported.compatibleValuesByKey,
              'characterPrompts': report.characterCaptions
                  .map((item) => item.toJson())
                  .toList(),
              'fields': report.entries
                  .take(100)
                  .map((entry) => {
                        'key': entry.key,
                        'value': _text(entry.value, 4000),
                        'group': entry.group,
                      })
                  .toList(),
              'fieldsTruncated': report.entries.length > 100,
              'warnings': report.warnings,
            }),
          );
        case 'langbai_list_history':
          final limit = _int(args['limit'], 12, 1, 50);
          final items = app.history
              .where((item) =>
                  item.filePath.isNotEmpty && File(item.filePath).existsSync())
              .take(limit)
              .toList();
          return AgentToolResult(
            ok: true,
            title: title,
            output: _json(items
                .map((item) => {
                      'attachmentId': item.id,
                      'name': item.filePath.split(RegExp(r'[/\\]')).last,
                      'model': item.model,
                      'size': '${item.width}x${item.height}',
                      'prompt': item.prompt,
                      'createdAt': item.createdAt,
                    })
                .toList()),
            generatedImages: items.map(_historyAttachment).toList(),
          );
        case 'langbai_generate_image':
          final before = app.history.map((item) => item.id).toSet();
          await _applyGenerationInput(args, available);
          app.setBatchCount(_int(args['count'], 1, 1, 8));
          final images = await _collectNewImages(before, app.generate);
          return AgentToolResult(
            ok: true,
            title: title,
            output: _json({
              'saved': images.length,
              'images': images
                  .map((item) => {
                        'attachmentId': item.id,
                        'name': item.name,
                        'width': item.width,
                        'height': item.height,
                      })
                  .toList(),
              'status': app.displayStatus,
              'anlasSpent': app.lastAnlasSpent,
            }),
            generatedImages: images,
          );
        case 'langbai_redraw_image':
          final source =
              _findAttachment(_text(args['attachmentId']), available);
          final before = app.history.map((item) => item.id).toSet();
          await app.setWorkbenchPath(source.filePath);
          await _applyGenerationInput(args, available);
          app.i2i
            ..strength = _double(args['strength'], 0.7, 0.01, 1)
            ..noise = _double(args['noise'], 0, 0, 0.99);
          final images = await _collectNewImages(before, app.generateI2I);
          return AgentToolResult(
            ok: true,
            title: title,
            output:
                _json({'saved': images.length, 'status': app.displayStatus}),
            generatedImages: images,
          );
        case 'langbai_inpaint_image':
          final source =
              _findAttachment(_text(args['attachmentId']), available);
          final mask =
              _findAttachment(_text(args['maskAttachmentId']), available);
          final before = app.history.map((item) => item.id).toSet();
          await app.setWorkbenchPath(source.filePath);
          app.inpaintPositivePrompt = _text(args['positivePrompt']);
          app.inpaintStrength = _double(args['strength'], 1, 0.1, 1);
          final maskBytes = await File(mask.filePath).readAsBytes();
          final images =
              await _collectNewImages(before, () => app.inpaint(maskBytes));
          return AgentToolResult(
            ok: true,
            title: title,
            output:
                _json({'saved': images.length, 'status': app.displayStatus}),
            generatedImages: images,
          );
        case 'langbai_upscale_image':
          final source =
              _findAttachment(_text(args['attachmentId']), available);
          final before = app.history.map((item) => item.id).toSet();
          await app.setWorkbenchPath(source.filePath);
          app.upscaleScale = _int(args['scale'], 2, 2, 4) == 4 ? 4 : 2;
          final images = await _collectNewImages(before, app.upscale);
          return AgentToolResult(
            ok: true,
            title: title,
            output:
                _json({'saved': images.length, 'status': app.displayStatus}),
            generatedImages: images,
          );
        case 'langbai_director':
          final source =
              _findAttachment(_text(args['attachmentId']), available);
          final before = app.history.map((item) => item.id).toSet();
          await app.setWorkbenchPath(source.filePath);
          app.directorTool = _text(args['tool'], 40);
          app.augmentOptions
            ..colorizePrompt = _text(args['prompt'])
            ..emotion = _text(args['emotion'], 40).ifEmpty('happy')
            ..emotionLevel = _double(args['emotionLevel'], 0, 0, 5)
            ..defry = _double(args['defry'], 0, 0, 5);
          final images = await _collectNewImages(before, app.augment);
          return AgentToolResult(
            ok: true,
            title: title,
            output:
                _json({'saved': images.length, 'status': app.displayStatus}),
            generatedImages: images,
          );
        case 'langbai_reverse_prompt':
          final source =
              _findAttachment(_text(args['attachmentId']), available);
          await app.setWorkbenchPath(source.filePath);
          app.reverseMode = _mode(args['mode']);
          app.reverseHint = _text(args['hint']);
          app.reverseKnownCharacter = args['knownCharacter'] == true;
          final before = app.reverseHistory.length;
          await app.reversePrompt();
          if (app.reverseHistory.length <= before ||
              app.reverseResult.trim().isEmpty) {
            throw StateError(app.displayStatus);
          }
          return AgentToolResult(
              ok: true, title: title, output: app.reverseResult);
        case 'langbai_convert_prompt':
          app.convertInput = _text(args['text']);
          app.convertMode = _mode(args['mode']);
          app.convertKnownCharacter = args['knownCharacter'] == true;
          final before = app.convertHistory.length;
          await app.convertPrompt();
          if (app.convertHistory.length <= before ||
              app.convertResult.trim().isEmpty) {
            throw StateError(app.displayStatus);
          }
          return AgentToolResult(
              ok: true, title: title, output: app.convertResult);
        case 'langbai_save_prompt_preset':
          final preset = await app.savePositivePromptPreset(
            prompt: _text(args['prompt']),
            name: _text(args['name'], 100),
          );
          return AgentToolResult(
              ok: true, title: title, output: _json(preset.toJson()));
        case 'langbai_apply_prompt':
          app.setParam((params) {
            params.positivePrompt = _text(args['positivePrompt']);
            if (args['negativePrompt'] is String) {
              params.negativePrompt = _text(args['negativePrompt']);
            }
            if (args['stylePrompt'] is String) {
              params.stylePrompt = _text(args['stylePrompt']);
            }
          });
          return AgentToolResult(
            ok: true,
            title: title,
            output: '已替换生成页当前提示词。',
          );
        case 'langbai_memory_list':
          return AgentToolResult(
              ok: true, title: title, output: _json(listMemories()));
        case 'langbai_memory_upsert':
          return AgentToolResult(
            ok: true,
            title: title,
            output: _json(await upsertMemory(args)),
          );
        case 'langbai_memory_delete':
          final deleted = await deleteMemory(_text(args['id'], 200));
          return AgentToolResult(
            ok: deleted,
            title: title,
            output: deleted ? '记忆已删除。' : '未找到该记忆。',
          );
        default:
          throw UnsupportedError('未知工具：$tool');
      }
    } catch (error) {
      return AgentToolResult(
        ok: false,
        title: title,
        output: error
            .toString()
            .replaceFirst('Bad state: ', '')
            .replaceFirst('Exception: ', ''),
      );
    } finally {
      if (snapshot != null) {
        // Desktop tools operate on isolated inputs. Mirror that behavior on
        // mobile so an Agent run cannot silently replace the user's current
        // prompt, workbench image, batch size, or tool selections. The
        // explicit langbai_apply_prompt tool intentionally remains durable.
        try {
          await snapshot.restore(app);
        } catch (_) {
          // In-memory state is restored before persistence. A storage failure
          // must not turn an otherwise successful paid operation into a false
          // generation failure.
        }
      }
    }
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;
    return iterator.moveNext() ? iterator.current : null;
  }
}

extension _IfEmpty on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}

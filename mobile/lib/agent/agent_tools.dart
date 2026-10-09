import 'image_provider.dart';
import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';

import '../artist/artist_recipe.dart';
import '../images/png_metadata.dart';
import '../models/nai_models.dart';
import '../prompts/prompt_templates.dart';
import '../references/reference_presets.dart';
import '../services/artist_tag_service.dart';
import '../services/online_gallery_service.dart';
import '../state/app_state.dart';
import 'agent_models.dart';
import 'studio_data_service.dart';
import 'software_actions.dart';
import 'backup_tools.dart';
import 'task_tools.dart';
import 'library_tools.dart';
import 'api_tools.dart';
import 'session_controls.dart';
import 'template_tools.dart';
import 'template_workflow.dart';
import 'template_generation.dart';
import 'file_actions.dart';
import 'web_search.dart';

const agentReadTools = <String>{
  'langbai_software_capabilities',
  'langbai_read_studio_state',
  'langbai_list_studio_data',
  'langbai_get_generation_state',
  'langbai_search_tags',
  'langbai_search_artist_styles',
  'langbai_search_online_gallery',
  'langbai_search_web',
  'studio_prompt_template',
  'langbai_list_prompt_presets',
  'langbai_list_reference_presets',
  'langbai_read_image_metadata',
  'langbai_list_history',
  'langbai_memory_list',
};

const agentMutatingTools = <String>{
  'langbai_templates',
  'langbai_api',
  'langbai_library',
  'langbai_tasks',
  'langbai_backup',
  'langbai_software_action',
  'langbai_import_studio_data',
  'langbai_update_studio_config',
  'langbai_save_style_preset',
  'langbai_generate_image',
  'langbai_redraw_image',
  'langbai_inpaint_image',
  'langbai_upscale_image',
  'langbai_director',
  'langbai_reverse_prompt',
  'langbai_convert_prompt',
  'langbai_edit_prompt',
  'langbai_save_prompt_preset',
  'langbai_apply_prompt',
  'langbai_memory_upsert',
  'langbai_memory_delete',
};

String agentToolTitle(String name) => switch (name) {
      'langbai_templates' => '软件共用提示词模板',
      'langbai_api' => 'API 配置与连接检查',
      'langbai_library' => '管理本机资料库',
      'langbai_tasks' => '软件生成队列',
      'langbai_backup' => '本机备份与恢复',
      'langbai_software_capabilities' => '查询软件操作清单',
      'langbai_software_action' => '执行软件操作',
      'langbai_read_studio_state' => '读取本机软件参数',
      'langbai_list_studio_data' => '读取本机资料',
      'langbai_update_studio_config' => '修改软件参数',
      'langbai_save_style_preset' => '保存风格预设',
      'langbai_import_studio_data' => '导入本机资料副本（保留已有资料）',
      'langbai_get_generation_state' => '读取当前生图状态',
      'langbai_search_tags' => '检索 Danbooru Tag',
      'langbai_search_artist_styles' => '检索画师与画风',
      'langbai_search_online_gallery' => '搜索在线画廊',
      'langbai_search_web' => '查询公开网页',
      'studio_prompt_template' => '读取软件提示词模板',
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
      'langbai_edit_prompt' => '优化或编辑提示词',
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
      'effort': _string('V5 Full Effort: medium=14 steps/Euler Ancestral, no custom UC or CFG Rescale; keep count unchanged', ['medium', 'high']),
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
      _function('studio_prompt_template',
          '只读：读取用户当前保存的提示词模板正文、来源与 revision。', {
        'kind': _string('用途', ['convert', 'reverse', 'optimize', 'assistant']),
        'mode': _string('输出模式', ['mixed', 'tags', 'natural']),
        'templateVersion': _string('版本', ['v5', 'v4.5']),
      }),
      _function(
          'langbai_templates',
          '读取、切换、导入编辑或恢复软件共用提示词模板。read 查看 body/revision；select 只切换模式；save 使用文本内容覆盖；restore 恢复内置模板。先读对应用途/版本/模式，修改传 expectedRevision；覆盖/恢复在 Agent 内确认且提前备份。不生成、不要求用户去软件再次确认。',
          {
            'action': _string('操作', ['read', 'select', 'save', 'restore']),
            'kind': _string('用途', ['convert', 'reverse', 'optimize', 'assistant']),
            'mode': _string('输出模式', ['mixed', 'tags', 'natural']),
            'templateVersion': _string('版本', ['v5', 'v4.5']),
            'body': _string('模板内容，不是文件路径'),
            'expectedRevision': _string('先读取模板的 revision')
          },
          required: [
            'action'
          ]),
      _function(
          'langbai_library',
          '本机角色卡、人设、世界书、采样/风格/正面预设的读取新建修改删除。先 read 查看中文字段说明和 revision，再传 expectedRevision。修改/删除在 Agent 内确认，执行前备份；不生图、不修改会话绑定。',
          {
            'action': _string('操作', ['read', 'create', 'update', 'delete']),
            'collection': _string('分类', [
              'characters',
              'personas',
              'lorebooks',
              'samplerPresets',
              'styles',
              'positivePresets'
            ]),
            'expectedRevision': _string('资料修订号'),
            'id': _string('资料 ID'),
            'patch': {'type': 'object', 'additionalProperties': true},
            'offset': _integer('起始位置', 0, 1000000),
            'limit': _integer('条数', 1, 50)
          },
          required: [
            'action',
            'collection'
          ]),
      _function(
          'langbai_api',
          '读取/配置各用途 API，密钥由软件代管。read 返回中文字段与 revision；configure 传 profile、expectedRevision、patch；credential 打开 Agent 私密输入（不要在聊天填写密钥）；clearCredential 清除凭据；test 只测试当前保存的服务地址，不生成。覆盖/删除只在 Agent 内确认。',
          {
            'action': _string('操作',
                ['read', 'configure', 'credential', 'clearCredential', 'test']),
            'profile': _string(
                'API 用途', ['novelai', 'reverse', 'convert', 'agent', 'tags']),
            'expectedRevision': _string('读取返回的 revision'),
            'patch': {'type': 'object'}
          },
          required: [
            'action'
          ]),
      _function(
          'langbai_tasks',
          '管理软件生成队列：先 list，传 expectedRevision 后 pause/resume/remove/clear；remove 传 id。cancel 无需修订号，立即请求取消，保留已生成图片。继续执行可能收费，在 Agent 内确认。',
          {
            'action': _string(
                '操作', ['list', 'pause', 'resume', 'cancel', 'remove', 'clear']),
            'expectedRevision': _string('任务列表修订号'),
            'id': _string('排队任务 ID')
          },
          required: [
            'action'
          ]),
      _function(
          'langbai_backup',
          '本机备份完整流程：list 列表→inspect 检查→restore 在 Agent 内确认后恢复；create 默认不含密钥。恢复前自动保存备份，返回保存路径和撤销方法。只用列表返回的 ID。',
          {
            'action': _string('操作', ['list', 'create', 'inspect', 'restore']),
            'backupId': _string('list 返回的 ID'),
            'inspectionId': _string('inspect 返回的 ID'),
            'categories': {
              'type': 'array',
              'items': {'type': 'string'}
            },
            'offset': _integer('起始位置', 0, 1000000),
            'limit': _integer('条数', 1, 50)
          },
          required: [
            'action'
          ]),
      _function('langbai_software_capabilities',
          '查询当前端实际已接通的操作、中文说明、字段与确认规则；不要猜测不存在的操作。', {}),
      _function(
          'langbai_software_action',
          '使用功能清单中的 action。修改前先读取同类资料取得 revision，传入 expectedRevision。收费、删除、覆盖、恢复、更新需在 Agent 内确认；禁止伪造 confirmed。',
          {
            'action': _string('功能清单中的准确操作 ID'),
            'mode': {
              'type': 'string',
              'enum': [
                'initial',
                'regenerate',
                'additional',
                'all',
                'pending',
                'failed'
              ],
              'description':
                  '漫画用initial/regenerate/additional；批量重绘用all/pending/failed/additional'
            },
            'itemIds': {
              'type': 'array',
              'items': {'type': 'string'},
              'description': '批量图片ID；空数组表示全部'
            },
            'panelIds': {
              'type': 'array',
              'items': {'type': 'string'},
              'description': '指定漫画分镜ID；空数组表示全部分镜'
            },
            'runId': _string('comic/batch.generation.status返回的当前会话拥有的任务ID'),
            'patch': {
              'type': 'object',
              'description': '漫画全局、逐格或参考图的字段更新；仅使用能力清单列出的字段'
            },
            'project': {
              'type': 'object',
              'description': '便携漫画工程JSON；本地路径和候选图片不从外部工程导入'
            },
            'text': _string('分镜文本、JSON、CSV，或尺寸模板'),
            'order': {
              'type': 'array',
              'items': {'type': 'string'},
              'description': '完整且无重复的分镜ID顺序'
            },
            'candidateId': _string('当前分镜中已登记的候选图片ID'),
            'referenceId': _string('漫画工程中已登记的参考图ID'),
            'source': {
              'type': 'string',
              'enum': ['history', 'reference', 'attachment']
            },
            'sourceId': _string('软件历史、参考图库或当前会话附件中的图片ID，不是文件路径'),
            'item': {
              'type': 'object',
              'description':
                  '在线收藏书签：使用画廊搜索所得 source/id/title/images[{url,thumb}] 及可选元数据；不下载原图。'
            },
            'expectedRevision': _string('最近读取返回的 revision'),
            'id': _string('资料 ID'),
            'name': _string('名称'),
            'group':
                _string('分组 ID 或名称；移动时空字符串取消分组；导出时空字符串为全部，__ungrouped 为未分组'),
            'offset': _integer('起始位置', 0, 1000000),
            'limit': _integer('读取条数', 1, 50)
          },
          required: [
            'action'
          ]),
      _function('langbai_get_generation_state',
          '读取当前图片服务、模型、尺寸与实际能力；兼容服务不应用原生风格锁和参考图。', {}),
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
      _function('langbai_search_web',
          '查询公开网页，返回搜索来源、标题、摘要和可核对的 URL；网页摘要不是已验证事实。', {
        'query': _string('网页搜索关键词，最多 800 字符'),
        'limit': _integer('最多返回来源数', 1, 8),
      }, required: ['query']),
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
        '按软件所选图片服务生成。先读 generation_state；openai-images 仅传 positivePrompt/count，模型、尺寸和扩展用软件配置，不应用原生锁或参考图、不回退原生。原生模式支持高级参数并消耗NovelAI额度；兼容服务按提供商计费。',
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
          'prompt': _string('上色提示词（旧字段）'),
          'colorizePrompt': _string('上色提示词'),
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
          'templateVersion': _string('模板版本', ['v5', 'v4.5']),
          'hint': _string('主体或目标提示'),
          'scope': _string('反推范围', ['full', 'character', 'object', 'scene']),
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
          'templateVersion': _string('模板版本', ['v5', 'v4.5']),
          'knownCharacter': {'type': 'boolean'},
        },
        required: ['text'],
      ),
      _function(
        'langbai_edit_prompt',
        '使用软件当前保存的转换模板及优化/自定义编辑模板调用文本服务；可能产生服务费用。只返回预览文本，不应用到生图参数，也不生成图片。',
        {
          'kind': _string('用途', ['optimize', 'custom']),
          'currentPrompt': _string('当前正面提示词'),
          'instruction': _string('自定义修改要求；custom 必填'),
          'mode': _string('模板模式', ['mixed', 'tags', 'natural']),
          'templateVersion': _string('模板版本', ['v5', 'v4.5']),
        },
        required: ['kind', 'currentPrompt'],
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
  final ReversePromptScope reverseScope;
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
    required this.reverseScope,
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
        reverseScope: app.reverseScope,
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
      ..reverseScope = reverseScope
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
  late final AgentWebSearch webSearch = AgentWebSearch(app.settings,
      currentSettings: () => app.settings);
  void cancelWebSearch() => webSearch.cancel();
  late final AgentFileActions fileActions = AgentFileActions(
      historyPaths: () => app.history.map((item) => item.filePath));
  late final AgentSessionControls sessions = AgentSessionControls(app);
  late final AgentTemplateTools templates = AgentTemplateTools(app);
  late final AgentTemplateWorkflow templateWorkflow =
      AgentTemplateWorkflow(app, templates: templates);
  late final AgentApiTools apiTools = AgentApiTools(app);
  late final AgentLibraryTools libraries = AgentLibraryTools(app);
  late final AgentTaskTools taskTools = AgentTaskTools(app);
  late final AgentBackupTools backups = AgentBackupTools(app);
  Future<Map<String, dynamic>> approvalSummary(
          String tool, Map<String, dynamic> args, String session) async =>
      tool == 'langbai_edit_prompt'
          ? _editPreview(args)
          : tool == 'langbai_software_action' &&
              softwareActions.resources
                  .handles(args['action']?.toString() ?? '')
          ? softwareActions.resources.approvalSummary(args)
          : tool == 'langbai_templates'
              ? templateWorkflow.approvalSummary(args)
              : tool == 'langbai_api'
                  ? apiTools.approvalSummary(args)
                  : tool == 'langbai_library'
                      ? libraries.approvalSummary(args)
                      : tool == 'langbai_backup'
                          ? backups.approvalSummary(args, session)
                          : args;
  late final StudioDataService studioData = StudioDataService(app);
  late final SoftwareActions softwareActions = SoftwareActions(app);
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

  ({String kind, String prompt, String instruction, ReversePromptMode mode,
    String version}) _editInput(Map<String, dynamic> args) {
    final kind = args['kind'];
    final prompt = args['currentPrompt'];
    final instruction = args['instruction'] ?? '';
    final modeValue = args['mode'] ?? app.settings.promptAssistantMode;
    final version = args['templateVersion'] ?? app.settings.convertPromptTemplateVersion;
    if (!['optimize', 'custom'].contains(kind) ||
        prompt is! String || prompt.trim().isEmpty || prompt.length > 24000 ||
        instruction is! String || instruction.length > 8000 ||
        (kind == 'custom' && instruction.trim().isEmpty) ||
        !['mixed', 'tags', 'natural'].contains(modeValue) ||
        !['v5', 'v4.5'].contains(version) ||
        args.keys.any((key) => !{'kind', 'currentPrompt', 'instruction',
          'mode', 'templateVersion'}.contains(key))) {
      throw StateError('提示词编辑参数无效；custom 需要修改要求。');
    }
    return (kind: kind as String, prompt: prompt.trim(),
      instruction: instruction.trim(),
      mode: ReversePromptMode.values.byName(modeValue as String),
      version: version as String);
  }

  Future<String> editPromptRevision(Map<String, dynamic> args) async {
    final input = _editInput(args);
    final settings = app.settings;
    final key = await app.storage.getConvertKey() ?? '';
    return sha256.convert(utf8.encode(jsonEncode([
      input.kind, input.prompt, input.instruction, input.mode.value,
      input.version, settings.convertApiUrl, settings.convertApiModel,
      settings.proxyMode, settings.proxyUrl, settings.proxyForAi,
      settings.convertPromptTemplates, settings.convertPromptTemplatesV45,
      settings.promptOptimizeTemplate, settings.promptAssistantTemplate,
      sha256.convert(utf8.encode(key)).toString(),
    ]))).toString();
  }

  Map<String, dynamic> _editPreview(Map<String, dynamic> args) {
    final input = _editInput(args);
    return {'kind': input.kind, 'currentPrompt': input.prompt,
      if (input.kind == 'custom') 'instruction': input.instruction,
      'mode': input.mode.value, 'templateVersion': input.version,
      'estimatedCost': null, 'estimateSource': 'provider-unknown',
      'warning': '文本服务可能收费；确认后只返回编辑结果，不生成图片。'};
  }

  Future<PreparedAgentImageOperation> prepareImageOperation(
      String tool, Map<String, dynamic> args, List<AgentAttachment> available,
      {String sessionId = 'legacy'}) async {
    final input = jsonDecode(jsonEncode(args)) as Map<String, dynamic>;
    final binding = AgentImageBinding(app.settings, app.generationGroupId);
    final template = tool == templateGenerationTool;
    final name = template ? 'langbai_generate_image' : tool;
    final generation = template ? templateGenerationArgs(input) : input;
    assertAgentImageTool(name, app.settings);
    if (app.settings.imageProvider == 'openai-images') {
      compatibleAgentInput(generation, app.settings, requirePrompt: !template);
      String? key;
      try {
        key = await app.storage.getCompatibleImageKey(
            app.settings.compatibleImage['credentialId'] as String? ?? '');
      } catch (_) {
        throw StateError('独立图片密钥读取未完成，请在软件设置中重新保存。');
      }
      if (key == null || key.trim().isEmpty) {
        throw StateError('请先在软件设置中填写独立图片 API Key。');
      }
    }
    binding.ensureCurrent(app.settings, app.generationGroupId);
    return PreparedAgentImageOperation(
        summary: {
          ...generation,
          if (app.settings.imageProvider == 'openai-images')
            'imageService':
                agentImageProviderState(app.settings)['imageService'],
          if (template) ...{
            'templateWorkflow': true,
            'description': input['text'] ?? '参考图反推生图'
          },
        },
        execute: () => execute(tool, input, List.of(available),
            sessionId: sessionId, imageBinding: binding));
  }

  Future<Map<String, dynamic>> _imageProviderState() async {
    final binding = AgentImageBinding(app.settings, app.generationGroupId);
    final result = agentImageProviderState(app.settings);
    if (app.settings.imageProvider == 'openai-images') {
      var configured = false;
      try {
        configured = (await app.storage.getCompatibleImageKey(
                    app.settings.compatibleImage['credentialId'] as String? ??
                        ''))
                ?.trim()
                .isNotEmpty ??
            false;
      } catch (_) {
        /* Show unavailable credentials, never raw platform errors. */
      }
      binding.ensureCurrent(app.settings, app.generationGroupId);
      (result['imageService'] as Map<String, dynamic>)['credentialConfigured'] =
          configured;
    }
    return result;
  }

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
      Map<String, dynamic> args, List<AgentAttachment> available,
      {bool applyStudioPromptLocks = true}) async {
    final retainedStyle = app.params.stylePrompt;
    final retainedNegative = app.params.negativePrompt;
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
      if (args['effort'] == 'medium' || args['effort'] == 'high') params.effort = args['effort'].toString();
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
      if (applyStudioPromptLocks) {
        params.stylePrompt = retainedStyle;
        params.negativePrompt = retainedNegative;
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
        'natural' => ReversePromptMode.natural,
        _ =>
          ReversePromptMode.values.byName(app.settings.agentPromptTemplateMode),
      };

  Future<AgentToolResult> execute(
      String tool, Map<String, dynamic> args, List<AgentAttachment> available,
      {bool applyStudioPromptLocks = true,
      String sessionId = 'legacy',
      AgentImageBinding? imageBinding}) async {
    if (tool == AgentFileActions.tool) return fileActions.execute(args);
    if (tool != templateGenerationTool) {
      return _executeTool(tool, args, available,
          applyStudioPromptLocks: applyStudioPromptLocks,
          sessionId: sessionId,
          imageBinding: imageBinding);
    }
    var began = false;
    try {
      final generation = templateGenerationArgs(args);
      imageBinding ??= AgentImageBinding(app.settings, app.generationGroupId);
      imageBinding.ensureCurrent(app.settings, app.generationGroupId);
      assertAgentImageTool('langbai_generate_image', app.settings);
      if (app.settings.imageProvider == 'openai-images') {
        compatibleAgentInput(generation, app.settings, requirePrompt: false);
      }
      sessions.begin(sessionId);
      began = true;
      String revision() => jsonEncode([
            app.params.toJson(),
            app.settings.lockStylePrompt,
            app.settings.savedStylePrompt,
            app.settings.lockNegativePrompt,
            app.settings.savedNegativePrompt,
            app.settings.agentPromptTemplateMode,
            app.settings.convertPromptTemplateVersion,
            app.settings.reversePromptTemplateVersion,
            app.settings.convertPromptTemplates,
            app.settings.convertPromptTemplatesV45,
            app.settings.reversePromptTemplates,
            app.settings.reversePromptTemplatesV45,
          ]);
      final initial = revision();
      final selected = await templates.execute('studio_prompt_template', {
        'kind': args['imageAttachmentId'] == null ? 'convert' : 'reverse',
        if (args['mode'] != null) 'mode': args['mode'],
        if (args['templateVersion'] != null)
          'templateVersion': args['templateVersion'],
      });
      return await runTemplateGeneration(
          args,
          (name, input) => _executeTool(name, input, available,
              applyStudioPromptLocks: applyStudioPromptLocks,
              sessionId: sessionId,
              inTemplateWorkflow: true,
              imageBinding: imageBinding), () {
        imageBinding!.ensureCurrent(app.settings, app.generationGroupId);
        sessions.ensureActive(sessionId);
        if (revision() != initial) throw StateError('模板或工作台参数已变化；未继续提交生图');
      }, template: {
        for (final key in ['mode', 'templateVersion']) key: selected[key],
        'bodySha256':
            sha256.convert(utf8.encode(selected['body'] as String)).toString()
      });
    } catch (error) {
      return AgentToolResult(ok: false, title: '模板生图未完成', output: '$error');
    } finally {
      if (began) sessions.end(sessionId);
    }
  }

  Future<AgentToolResult> _executeTool(
      String tool, Map<String, dynamic> args, List<AgentAttachment> available,
      {bool applyStudioPromptLocks = true,
      String sessionId = 'legacy',
      bool inTemplateWorkflow = false,
      AgentImageBinding? imageBinding}) async {
    final title = agentToolTitle(tool);
    bool began = false;
    Map<String, dynamic>? sessionState;
    final snapshot = _agentTransientTools.contains(tool) &&
            !(tool == 'langbai_generate_image' &&
                app.settings.imageProvider == 'openai-images')
        ? _AgentAppSnapshot.capture(app)
        : null;
    try {
      if (AgentSessionControls.tools.contains(tool)) {
        return AgentToolResult(
            ok: true,
            title: '当前会话生图设置',
            output: _json(await sessions.execute(tool, args, sessionId)));
      }
      if (tool == 'langbai_templates') {
        return AgentToolResult(
            ok: true,
            title: title,
            output: _json(await templateWorkflow.execute(args)));
      }
      if (AgentTemplateTools.tools.contains(tool)) {
        return AgentToolResult(
            ok: true,
            title: '软件共用模板',
            output: _json(await templates.execute(tool, args)));
      }
      if (AgentSessionControls.paid.contains(tool)) {
        imageBinding ??= AgentImageBinding(app.settings, app.generationGroupId);
        imageBinding.ensureCurrent(app.settings, app.generationGroupId);
        assertAgentImageTool(tool, app.settings);
        if (app.settings.imageProvider == 'openai-images') {
          compatibleAgentInput(args, app.settings);
        }
        if (inTemplateWorkflow) {
          sessions.ensureActive(sessionId);
        } else {
          sessions.begin(sessionId);
          began = true;
        }
        if (sessionId != 'legacy') {
          sessionState = await sessions.read(sessionId);
        }
        imageBinding.ensureCurrent(app.settings, app.generationGroupId);
        sessions.ensureActive(sessionId);
        if (tool != 'langbai_generate_image') app.setBatchCount(1);
      }
      if (tool == 'langbai_get_generation_state') {
        if (sessionId != 'legacy') {
          sessionState = await sessions.read(sessionId);
        }
      }
      if (tool == 'langbai_api' ||
          tool == 'studio_api_input' ||
          tool == 'studio_resolve_api_input') {
        return AgentToolResult(
            ok: true,
            title: 'API 配置',
            output: _json(await apiTools.execute(tool, args, sessionId)));
      }
      if (tool == 'studio_material_source') {
        return AgentToolResult(
            ok: true,
            title: '本机完整资料',
            output: _json(await libraries.materialSource(args)));
      }
      if (tool == 'langbai_library') {
        return AgentToolResult(
            ok: true,
            title: title,
            output: _json(await libraries.execute(args)));
      }
      if (tool == 'langbai_tasks') {
        return AgentToolResult(
            ok: true,
            title: title,
            output: _json(await taskTools.execute(args)));
      }
      if (tool == 'langbai_backup') {
        return AgentToolResult(
            ok: true,
            title: title,
            output: _json(await backups.execute(args, sessionId)));
      }
      if (tool == 'langbai_software_capabilities' ||
          tool == 'langbai_software_action') {
        return AgentToolResult(
            ok: true,
            title: '软件操作',
            output: _json(await softwareActions.execute(tool, args,
                attachments: available)));
      }
      if (StudioDataService.tools.contains(tool)) {
        return AgentToolResult(
            ok: true,
            title: title,
            output: _json(await studioData.execute(tool, args)));
      }
      switch (tool) {
        case 'langbai_search_web':
          return AgentToolResult(
              ok: true,
              title: title,
              output: _json(await webSearch.search(
                  _text(args['query'], 800),
                  limit: _int(args['limit'], 5, 1, 8))));
        case 'langbai_get_generation_state':
          return AgentToolResult(
            ok: true,
            title: title,
            output: _json({
              'params': {
                ...app.params.toJson(),
                if (sessionState?['style'] != null)
                  'stylePrompt': sessionState!['style']['prompt']
              },
              if (sessionState?['style'] != null &&
                  app.settings.imageProvider != 'openai-images')
                'sessionStyle': sessionState!['style'],
              'modelMode': app.settings.modelMode,
              'generationGroupId': app.generationGroupId,
              'lockedStylePrompt': sessionState?['style'] != null
                  ? sessionState!['style']['prompt']
                  : app.params.stylePrompt,
              'lockedNegativePrompt': app.params.negativePrompt,
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
              ...await _imageProviderState(),
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
          if (app.settings.imageProvider == 'openai-images') {
            final input = compatibleAgentInput(args, app.settings);
            final outcome = await app.generateCompatibleForAgent(
                prompt: input.prompt,
                count: input.count,
                ensureCurrent: () {
                  imageBinding!
                      .ensureCurrent(app.settings, app.generationGroupId);
                  sessions.ensureActive(sessionId);
                });
            final images = outcome.items.map(_historyAttachment).toList();
            return AgentToolResult(
                ok: outcome.ok,
                title: title,
                generatedImages: images,
                output: _json({
                  'imageProvider': 'openai-images',
                  'saved': images.length,
                  'images': images
                      .map((item) => {
                            'attachmentId': item.id,
                            'name': item.name,
                            'width': item.width,
                            'height': item.height
                          })
                      .toList(),
                  'status': outcome.message,
                  'retryable': false
                }));
          }
          final before = app.history.map((item) => item.id).toSet();
          await _applyGenerationInput(
            args,
            available,
            applyStudioPromptLocks: applyStudioPromptLocks,
          );
          if (sessionState?['style'] != null) {
            app.params.stylePrompt = sessionState!['style']['prompt'];
          }
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
          await _applyGenerationInput(
            args,
            available,
            applyStudioPromptLocks: applyStudioPromptLocks,
          );
          if (sessionState?['style'] != null) {
            app.params.stylePrompt = sessionState!['style']['prompt'];
          }
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
          if (sessionState?['style'] != null) {
            app.params.stylePrompt = sessionState!['style']['prompt'];
          }
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
            ..colorizePrompt = _text(args['colorizePrompt'] ?? args['prompt'])
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
          final scope = args['scope'] ?? 'full';
          if (!['full', 'character', 'object', 'scene'].contains(scope)) {
            throw StateError('反推范围无效');
          }
          app.reverseScope = ReversePromptScope.values.byName(scope);
          app.reverseHint = _text(args['hint']);
          app.reverseKnownCharacter = args['knownCharacter'] == true;
          final before = app.reverseHistory.length;
          await app.reversePrompt(
              templateVersion: args['templateVersion'] as String?);
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
          await app.convertPrompt(
              templateVersion: args['templateVersion'] as String?);
          if (app.convertHistory.length <= before ||
              app.convertResult.trim().isEmpty) {
            throw StateError(app.displayStatus);
          }
          return AgentToolResult(
              ok: true, title: title, output: app.convertResult);
        case 'langbai_edit_prompt':
          final input = _editInput(args);
          final settings = AppSettings.fromJson(app.settings.toJson())
            ..convertPromptTemplateVersion = input.version;
          final library = await PromptTemplateLibrary.load();
          final template = library.resolve('convert', input.mode,
              input.version == 'v4.5'
                  ? settings.convertPromptTemplatesV45
                  : settings.convertPromptTemplates,
              templateVersion: input.version);
          final result = await app.api.assistPrompt(
              settings: settings,
              apiKey: await app.storage.getConvertKey() ?? '',
              currentPrompt: input.prompt,
              instruction: input.instruction,
              kind: input.kind,
              mode: input.mode,
              templateVersion: input.version,
              conversionTemplate: template);
          return AgentToolResult(ok: result.ok, title: title,
              output: result.ok ? result.text : result.message);
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
      if (began) sessions.end(sessionId);
      if (snapshot != null &&
          (!AgentSessionControls.paid.contains(tool) ||
              began ||
              inTemplateWorkflow)) {
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

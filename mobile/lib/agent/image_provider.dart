import 'dart:convert';
import '../models/nai_models.dart';
import '../services/openai_images.dart';
import 'agent_models.dart';

/// This object exists only inside the host. Neither bridge JSON nor the model
/// can create or override an approved operation or its binding.
class PreparedAgentImageOperation {
  final Map<String, dynamic> summary;
  final Future<AgentToolResult> Function() execute;
  PreparedAgentImageOperation({required this.summary, required this.execute});
}

class AgentImageBinding {
  final String _revision;
  AgentImageBinding(AppSettings settings, String group)
      : _revision = _imageRevision(settings, group);
  void ensureCurrent(AppSettings settings, String group) {
    if (_revision != _imageRevision(settings, group)) {
      throw StateError('图片服务配置已变化，本次未提交生图；请重新读取当前服务后发起新任务。');
    }
  }
}

// credentialId is an immutable secure-storage version, not a key. Saving a
// different key creates a new ID, so a pending authorization cannot change key.
String _imageRevision(AppSettings s, String group) => jsonEncode([
      s.imageProvider,
      s.imageProvider == 'openai-images' ? s.compatibleImage : null,
      s.imageOutputDir,
      group,
      s.saveToGallery,
      s.proxyMode,
      s.proxyUrl,
      s.proxyForAi,
    ]);

const paidImageTools = {
  'langbai_generate_image',
  'langbai_redraw_image',
  'langbai_inpaint_image',
  'langbai_upscale_image',
  'langbai_director'
};
void assertAgentImageTool(String tool, AppSettings settings) {
  if (settings.imageProvider == 'openai-images' &&
      paidImageTools.contains(tool) &&
      tool != 'langbai_generate_image') {
    throw StateError('当前兼容图片服务仅接入文生图；此操作未执行，也没有切换到 NovelAI。');
  }
}

({String prompt, int count}) compatibleAgentInput(
    Map<String, dynamic> args, AppSettings settings,
    {bool requirePrompt = true}) {
  final c = settings.compatibleImage;
  if (args.keys
      .any((key) => !{'positivePrompt', 'count', 'model'}.contains(key))) {
    throw StateError(
        '兼容生图只接收 positivePrompt、count；模型、尺寸和网关扩展参数使用软件保存的配置，不自动应用原生参数。');
  }
  if (args['model'] != null && args['model'] != c['model']) {
    throw StateError('请求模型与软件所选兼容模型不同，请先在软件中切换配置。');
  }
  final count = args['count'] ?? 1, prompt = args['positivePrompt'];
  if (count is! int || count < 1 || count > 8) {
    throw StateError('单次 Agent 生成张数须为1–8。');
  }
  if (requirePrompt && (prompt is! String || prompt.trim().isEmpty)) {
    throw StateError('正面提示词不能为空。');
  }
  final config = CompatibleImageConfig(
      baseUrl: c['baseUrl'] as String? ?? '',
      model: c['model'] as String? ?? '',
      apiKey: '',
      responseFormat: c['responseFormat'] as String? ?? 'auto');
  compatibleImageEndpoint(config.baseUrl);
  compatibleImageBody(config,
      prompt: requirePrompt ? prompt as String : 'configuration validation',
      size: c['size'] as String? ?? 'auto',
      n: count,
      extensions: Map<String, Object?>.from(c['extensions'] as Map? ?? {}));
  return (prompt: prompt is String ? prompt : '', count: count);
}

Map<String, dynamic> agentImageProviderState(AppSettings settings) {
  if (settings.imageProvider != 'openai-images') {
    return {'imageProvider': 'novelai'};
  }
  final c = settings.compatibleImage;
  var endpoint = '';
  try {
    endpoint =
        compatibleImageEndpoint(c['baseUrl'] as String? ?? '').toString();
  } catch (_) {/* invalid saved configuration */}
  return {
    'imageProvider': 'openai-images',
    'params': {'model': c['model'] ?? '', 'size': c['size'] ?? 'auto'},
    'imageService': {
      'provider': 'openai-images',
      'endpoint': endpoint,
      'model': c['model'] ?? '',
      'size': c['size'] ?? 'auto',
      'responseFormat': c['responseFormat'] ?? 'auto',
      'credentialConfigured': (c['credentialId'] as String? ?? '').isNotEmpty,
      'extensions': c['extensions'] ?? {},
      'capabilities': ['text-to-image'],
      'instructions':
          '生图传 positivePrompt、count；模型、尺寸与网关扩展使用软件保存配置，模板转换仍遵循软件模板。原生风格锁/参考图/角色分段不自动应用，不重试或切回NovelAI；费用以所选服务商记录为准。',
    },
    'modelMode': 'compatible-text-to-image',
    'lockedStylePrompt': '',
    'lockedNegativePrompt': '',
    'streamPreviewEnabled': false,
    'references': {
      'vibeCount': 0,
      'preciseReferenceCount': 0,
      'characterPrompts': []
    },
    'referenceCapabilities': {
      'maxCharacterPrompts': 0,
      'vibeTransfer': false,
      'preciseReference': false,
      'attachmentIdsRequiredForAgentReferences': false
    },
  };
}

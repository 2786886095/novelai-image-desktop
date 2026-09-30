import 'dart:convert';
import 'agent_models.dart';

const templateGenerationTool = 'studio_generate_from_description';

Map<String, dynamic> templateGenerationArgs(Map<String, dynamic> input) {
  const allowed = {'text', 'imageAttachmentId', 'mode', 'templateVersion', 'generate'};
  if (input.keys.any((key) => !allowed.contains(key))) {
    throw StateError('未知模板生图参数');
  }
  final image = input['imageAttachmentId'], text = input['text'];
  if (image != null && (image is! String || image.trim().isEmpty)) {
    throw StateError('请选择有效参考图');
  }
  if (text != null && (text is! String || text.length > 16000)) {
    throw StateError('画面要求无效');
  }
  if (image == null && (text is! String || text.trim().isEmpty)) {
    throw StateError('需要完整画面要求');
  }
  if (input['mode'] != null && !['tags', 'natural', 'mixed'].contains(input['mode'])) {
    throw StateError('提示词模式无效');
  }
  if (input['templateVersion'] != null && !['v5', 'v4.5'].contains(input['templateVersion'])) {
    throw StateError('模板版本无效');
  }
  final generate = input['generate'] ?? <String, dynamic>{};
  if (generate is! Map<String, dynamic> || generate.keys.any((key) => !{
    'count', 'model', 'width', 'height', 'steps', 'cfgScale', 'seed', 'sampler', 'noiseSchedule'
  }.contains(key))) {
    throw StateError('生图参数无效或包含未知字段');
  }
  final count = generate['count'] ?? 1;
  if (count is! int || count < 1 || count > 8) {
    throw StateError('单次生成张数必须为1–8');
  }
  return Map<String, dynamic>.from(generate);
}

/// Called after the bridge authorizes the whole workflow once. Repairs remain
/// inside the existing converter; neither step re-enters bridge approval.
Future<AgentToolResult> runTemplateGeneration(
  Map<String, dynamic> input,
  Future<AgentToolResult> Function(String, Map<String, dynamic>) execute,
  void Function() ensureCurrent, {
  Map<String, dynamic>? template,
}) async {
  final generate = templateGenerationArgs(input);
  ensureCurrent();
  final image = input['imageAttachmentId'];
  final converted = await execute(image == null ? 'langbai_convert_prompt' : 'langbai_reverse_prompt', {
    if (image == null) 'text': input['text'],
    if (image != null) ...{'attachmentId': image, 'hint': input['text'] ?? '', 'scope': 'full'},
    if (input['mode'] != null) 'mode': input['mode'],
    if (input['templateVersion'] != null) 'templateVersion': input['templateVersion'],
  });
  if (!converted.ok || converted.output.trim().isEmpty) {
    return AgentToolResult(ok: false, title: '模板生图未完成', output: '${converted.output}\n本次任务结束，未执行生图；不要自动重试或重复确认。');
  }
  ensureCurrent();
  final generated = await execute('langbai_generate_image', {...generate, 'positivePrompt': converted.output});
  if (!generated.ok) return generated;
  return AgentToolResult(ok: true, title: generated.title, generatedImages: generated.generatedImages,
    output: jsonEncode({'positivePrompt': converted.output, 'template': template, 'generation': generated.output}));
}

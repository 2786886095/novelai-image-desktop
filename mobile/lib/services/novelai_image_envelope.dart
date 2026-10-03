import 'dart:convert';
import 'package:http/http.dart' as http;
import 'openai_images.dart';

const novelAiEnvelopeModels = {
  'nai-diffusion-5-full',
  'nai-diffusion-5-curated',
  'nai-diffusion-4-5-full',
  'nai-diffusion-4-5-curated',
  'nai-diffusion-4-full',
  'nai-diffusion-4-curated',
  'nai-diffusion-3',
  'nai-diffusion-furry-3',
  'nai-diffusion-5-full-inpainting',
  'nai-diffusion-5-curated-inpainting',
  'nai-diffusion-4-5-full-inpainting',
  'nai-diffusion-4-5-curated-inpainting',
  'nai-diffusion-4-full-inpainting',
  'nai-diffusion-4-curated-inpainting',
  'nai-diffusion-3-inpainting'
};
Future<void> verifyNovelAiImageEnvelope(
    http.Client client, Map<String, dynamic> settings, String key) async {
  final model = (settings['model'] as String? ?? '').trim();
  if (key.trim().isEmpty ||
      RegExp(r'[\r\n]').hasMatch(key) ||
      !novelAiEnvelopeModels.contains(model)) {throw StateError('仅支持 NovelAI 模型');}
  final config = CompatibleImageConfig(
      baseUrl: settings['baseUrl'] as String? ?? '',
      model: model,
      apiKey: key,
      responseFormat: settings['responseFormat'] as String? ?? 'auto');
  final endpoint = compatibleImageEndpoint(config.baseUrl);
  compatibleImageBody(config,
      prompt: 'readonly configuration check',
      size: settings['size'] as String? ?? 'auto',
      n: 1,
      extensions:
          Map<String, Object?>.from(settings['extensions'] as Map? ?? {}));
  final models = endpoint.replace(
      path: endpoint.path
          .replaceFirst(RegExp(r'/images/generations$'), '/models'));
  final request = http.Request('GET', models)
    ..followRedirects = false
    ..headers['Authorization'] = 'Bearer ${key.trim()}';
  final data = await (() async {
    final response=await client.send(request);
    if(response.statusCode!=200) throw StateError('只读验证未通过');
    final bytes=<int>[];
    await for(final chunk in response.stream) {
      bytes.addAll(chunk); if(bytes.length>2*1024*1024) throw StateError('只读验证响应过大');
    }
    return jsonDecode(utf8.decode(bytes));
  })().timeout(const Duration(seconds:15));
  if (data is! Map ||
      data['data'] is! List ||
      data['success']==false || data['error']!=null ||
      !(data['data'] as List).any((m) => m is Map && m['id'] == model)) {throw StateError('NovelAI 模型不可用');}
}

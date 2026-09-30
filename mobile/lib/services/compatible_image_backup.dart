import 'dart:convert';
import 'openai_images.dart';

Map<String, dynamic> exportImageSettings(Map<String, dynamic> api) {
  final c = api['compatibleImage'] as Map? ?? {};
  return {'imageProvider': api['imageProvider'] ?? 'novelai', 'imageApiKey': api['imageApiKey'] ?? '',
    'compatibleImage': {'baseUrl': c['baseUrl'] ?? '', 'model': c['model'] ?? '', 'size': c['size'] ?? '1024x1024',
      'responseFormat': c['responseFormat'] ?? 'auto', 'extensions': jsonDecode(jsonEncode(c['extensions'] ?? <String,dynamic>{}))}};
}
/// An old archive with no image fields preserves the current image service.
/// A supplied profile must include its independent key, even when explicitly empty.
Map<String, dynamic>? readImageSettingsBackup(Map<String, dynamic> api) {
  if (api['imageCredentialState'] == 'unavailable') throw const FormatException('备份源的图片密钥未解锁，请在源设备重新保存密钥后导出。');
  const keys = ['imageProvider', 'compatibleImage', 'imageApiKey'];
  if (!keys.any(api.containsKey)) return null;
  final key = api['imageApiKey'];
  if (!keys.every(api.containsKey) || !['novelai','openai-images'].contains(api['imageProvider']) ||
      key is! String || key.length > 8192 || RegExp(r'[\r\n\x00]').hasMatch(key) || api['compatibleImage'] is! Map) {
    throw const FormatException('备份的图片服务配置不完整或无效；接口、模型配置和独立密钥须一起恢复。');
  }
  final profile = exportImageSettings(api), c = profile['compatibleImage'] as Map;
  if (c['baseUrl'] is! String || c['model'] is! String || c['size'] is! String ||
      !['auto','b64_json','url'].contains(c['responseFormat']) || c['extensions'] is! Map) {
    throw const FormatException('备份的图片服务配置类型无效。');
  }
  final url = c['baseUrl'] as String, model = c['model'] as String;
  if (url.trim().isNotEmpty) compatibleImageEndpoint(url);
  if (profile['imageProvider'] == 'openai-images' && (url.trim().isEmpty || model.trim().isEmpty)) {
    throw const FormatException('备份缺少图片接口或模型。');
  }
  compatibleImageBody(CompatibleImageConfig(baseUrl: url, model: model.trim().isEmpty ? 'backup-validation' : model,
    apiKey: key, responseFormat: c['responseFormat'] as String), prompt: 'backup validation', size: c['size'] as String,
    n: 1, extensions: Map<String,Object?>.from(c['extensions'] as Map));
  return profile;
}

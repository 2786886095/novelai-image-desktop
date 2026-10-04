import '../models/nai_models.dart';

String agentProviderKey(AppSettings settings) =>
    '${settings.agentApiProtocol}|${settings.agentApiBaseUrl.trim().replaceAll(RegExp(r'/+$'), '')}';
String agentEffort(Object? value) =>
    const {'low', 'medium', 'high'}.contains(value) ? value.toString() : 'auto';
List<Map<String, dynamic>> normalizeSavedAgentModels(Object? value) {
  if (value is! List) return [];
  final entries = <String, Map<String, dynamic>>{};
  for (final raw in value.take(500)) {
    if (raw is! Map ||
        raw['id'] is! String ||
        (raw['id'] as String).trim().isEmpty ||
        raw['providerKey'] is! String ||
        !(raw['providerKey'] as String).contains('|')) continue;
    final context = (int.tryParse('${raw['contextWindow']}') ?? 128000)
        .clamp(8192, 2000000)
        .toInt();
    final p = <String, dynamic>{
      'providerKey': raw['providerKey'],
      'id': (raw['id'] as String).trim(),
      'displayName': raw['displayName'] ?? raw['id'],
      'contextWindow': context,
      'maxOutputTokens': (int.tryParse('${raw['maxOutputTokens']}') ?? 8192)
          .clamp(512, context)
          .toInt(),
      'reasoningEffort': agentEffort(raw['reasoningEffort']),
      if (raw['vision'] is bool) 'vision': raw['vision']
    };
    entries['${p['providerKey']}\u0000${p['id']}'] = p;
  }
  return entries.values.toList();
}

List<Map<String, dynamic>> selectedAgentModels(AppSettings settings) {
  final models = normalizeSavedAgentModels(settings.savedAgentModels)
      .where((p) => p['providerKey'] == agentProviderKey(settings))
      .toList();
  if (settings.agentApiModel.trim().isNotEmpty &&
      !models.any((p) => p['id'] == settings.agentApiModel.trim()))
    models.insert(0, {
      'providerKey': agentProviderKey(settings),
      'id': settings.agentApiModel.trim(),
      'displayName': settings.agentApiModel.trim(),
      'contextWindow': settings.agentContextWindow,
      'maxOutputTokens': settings.agentMaxOutputTokens,
      'reasoningEffort': agentEffort(settings.agentReasoningEffort),
      'vision': settings.agentVisionEnabled
    });
  return models;
}

void applyAgentModel(AppSettings settings, Map<String, dynamic> model) {
  settings.agentApiModel = model['id'] as String;
  settings.agentContextWindow = model['contextWindow'] as int;
  settings.agentMaxOutputTokens = model['maxOutputTokens'] as int;
  settings.agentReasoningEffort = agentEffort(model['reasoningEffort']);
  if (model['vision'] is bool)
    settings.agentVisionEnabled = model['vision'] as bool;
}

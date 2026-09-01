import '../models/nai_models.dart';

const positivePromptPresetImageLimit = 3;

String positivePromptPresetStorageId(String id) =>
    'positive-prompt-${id.trim()}';

String defaultPositivePromptPresetName(String prompt, [int fallbackIndex = 1]) {
  final compact = prompt.replaceAll(RegExp(r'\s+'), ' ').trim().replaceAll(
        RegExp(r'^[,，、;；]+|[,，、;；]+$'),
        '',
      );
  if (compact.isEmpty) return '正面提示词 ${fallbackIndex < 1 ? 1 : fallbackIndex}';
  final parts = compact
      .split(RegExp(r'[,，、;；]+'))
      .map((part) => part.trim())
      .where((part) => part.isNotEmpty)
      .toList();
  var candidate = parts.isEmpty ? compact : parts.first;
  for (final part in parts.skip(1)) {
    final next = '$candidate, $part';
    if (next.length > 28) break;
    candidate = next;
  }
  if (candidate.length > 28) candidate = candidate.substring(0, 28).trimRight();
  return candidate.isEmpty
      ? '正面提示词 ${fallbackIndex < 1 ? 1 : fallbackIndex}'
      : candidate;
}

String uniquePositivePromptPresetName(
  Iterable<PositivePromptPreset> presets,
  String requested, {
  String excludeId = '',
}) {
  final base = requested.trim().isEmpty ? '正面提示词' : requested.trim();
  final names = presets
      .where((preset) => preset.id != excludeId)
      .map((preset) => preset.name.trim().toLowerCase())
      .toSet();
  var candidate = base;
  var index = 1;
  while (names.contains(candidate.toLowerCase())) {
    candidate = '$base (${index++})';
  }
  return candidate;
}

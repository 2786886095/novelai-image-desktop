import 'dart:convert';

import '../models/nai_models.dart';

class PromptVariants {
  final String namePrompt;
  final String featurePrompt;

  const PromptVariants({this.namePrompt = '', this.featurePrompt = ''});

  bool get isComplete => namePrompt.isNotEmpty && featurePrompt.isNotEmpty;
}

class ParsedPromptResult {
  final String primary;
  final PromptVariants? variants;

  const ParsedPromptResult({required this.primary, this.variants});
}

String cleanPromptOutput(String raw) {
  var text = raw.trim();
  text = text
      .replaceFirst(
          RegExp(r'^```(?:text|txt|prompt|markdown)?\s*', caseSensitive: false),
          '')
      .replaceFirst(RegExp(r'\s*```$', caseSensitive: false), '');
  text = text.replaceFirst(
      RegExp(r'^(?:output|prompt|result|答案|输出|结果)\s*[:：]\s*',
          caseSensitive: false),
      '');
  text = text.replaceAll(RegExp(r'''^["'“”‘’]+|["'“”‘’]+$'''), '');
  text = text
      .replaceAll(r'\n', ' ')
      .replaceAll(RegExp(r'\r?\n+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .replaceAll(RegExp(r'\s*\|\s*'), ' | ')
      .replaceAll(RegExp(r'\s*,\s*'), ', ');
  return text.trim();
}

Map<String, dynamic>? _extractLooseJson(String raw) {
  final cleaned = raw
      .trim()
      .replaceFirst(RegExp(r'^```(?:json)?\s*', caseSensitive: false), '')
      .replaceFirst(RegExp(r'\s*```$', caseSensitive: false), '');
  Map<String, dynamic>? parse(String value) {
    try {
      final decoded = jsonDecode(value);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
    } catch (_) {
      return null;
    }
  }

  final direct = parse(cleaned);
  if (direct != null) return direct;
  final start = cleaned.indexOf('{');
  final end = cleaned.lastIndexOf('}');
  return start >= 0 && end > start
      ? parse(cleaned.substring(start, end + 1))
      : null;
}

String _firstString(Map<String, dynamic> source, List<String> keys) {
  for (final key in keys) {
    final value = source[key];
    if (value is String && value.trim().isNotEmpty) return value;
  }
  return '';
}

String _labeledValue(String text, RegExp label, RegExp stop) {
  final match = label.firstMatch(text);
  if (match == null) return '';
  final rest = text.substring(match.end);
  final stopMatch = stop.firstMatch(rest);
  return (stopMatch == null ? rest : rest.substring(0, stopMatch.start)).trim();
}

ParsedPromptResult parsePromptVariantResponse(String raw, bool knownCharacter) {
  if (!knownCharacter) {
    return ParsedPromptResult(primary: cleanPromptOutput(raw));
  }

  final json = _extractLooseJson(raw);
  if (json != null) {
    final namePrompt = cleanPromptOutput(_firstString(json, const [
      'namePrompt',
      'characterNamePrompt',
      'name_version',
      'character_name_version',
      'versionA',
    ]));
    final featurePrompt = cleanPromptOutput(_firstString(json, const [
      'featurePrompt',
      'featureTagPrompt',
      'feature_version',
      'tag_version',
      'versionB',
    ]));
    if (namePrompt.isNotEmpty || featurePrompt.isNotEmpty) {
      return ParsedPromptResult(
        primary: namePrompt.isNotEmpty ? namePrompt : featurePrompt,
        variants: PromptVariants(
          namePrompt: namePrompt,
          featurePrompt: featurePrompt,
        ),
      );
    }
  }

  final text = raw
      .trim()
      .replaceFirst(
          RegExp(r'^```(?:text|txt|prompt|markdown)?\s*', caseSensitive: false),
          '')
      .replaceFirst(RegExp(r'\s*```$', caseSensitive: false), '');
  final nameLabel = RegExp(
      r'(?:角色名版|角色名版本|namePrompt|name prompt|character name version|version a)\s*[:：-]\s*',
      caseSensitive: false);
  final featureLabel = RegExp(
      r'(?:特征版|特征版本|featurePrompt|feature prompt|feature tag version|version b)\s*[:：-]\s*',
      caseSensitive: false);
  final namePrompt =
      cleanPromptOutput(_labeledValue(text, nameLabel, featureLabel));
  final featurePrompt =
      cleanPromptOutput(_labeledValue(text, featureLabel, nameLabel));
  if (namePrompt.isNotEmpty || featurePrompt.isNotEmpty) {
    return ParsedPromptResult(
      primary: namePrompt.isNotEmpty ? namePrompt : featurePrompt,
      variants: PromptVariants(
        namePrompt: namePrompt,
        featurePrompt: featurePrompt,
      ),
    );
  }
  return ParsedPromptResult(primary: cleanPromptOutput(raw));
}

String knownCharacterRuntimeInstruction(
  ReversePromptMode mode,
  String source,
  bool knownCharacter,
) {
  final modeText = switch (mode) {
    ReversePromptMode.natural =>
      'Use concise English natural-language NovelAI prompts.',
    ReversePromptMode.mixed =>
      'Use concise mixed NovelAI prompts: mostly Danbooru tags with only short natural-language clauses when needed.',
    ReversePromptMode.tags =>
      'Use concise comma-separated Danbooru / NovelAI tags.',
  };
  if (knownCharacter) {
    return [
      'Known network/game/anime character mode is ON.',
      'Return strict JSON only, with exactly these string keys: namePrompt and featurePrompt.',
      'namePrompt: use the accurate character tag/name as the character identity. Do not repeat default hair, eyes, outfit, or accessories when the default character tag already covers them.',
      'featurePrompt: do not use the character name. Use only short visible identity features and outfit tags, for cases where the model library does not know the character.',
      'Only add outfit, feature, pose, action, or atmosphere details when the image/user request explicitly needs them.',
      'Keep both prompts short. Avoid long feature lists because they reduce image quality.',
      'For Furina, the minimal tag-style identity form should look like: 1girl, solo, furina (genshin impact).',
      modeText,
      source == 'reverse'
          ? 'If the reverse scope is character, do not describe the full scene unless it is needed to identify a visible special outfit or state.'
          : 'If the user only says a known character is doing something, do not invent extra default clothing or appearance tags.',
    ].join('\n');
  }
  return [
    'Known network/game/anime character mode is OFF.',
    'Do not rely on character name tags or copyrighted character names as the identity.',
    'Describe the subject with short visible appearance, outfit, pose, action, and atmosphere cues instead.',
    'Keep the prompt concise and avoid long feature or clothing lists.',
    modeText,
  ].join('\n');
}

String modeUserInstruction(ReversePromptMode mode, String source) {
  if (mode == ReversePromptMode.natural) {
    return [
      'Output mode: natural-language NovelAI V4.5 prompt.',
      'Return exactly one English prompt line.',
      'Do not output a comma-separated Danbooru tag list.',
      'For two or more original characters, use: base scene description | A boy/girl ... | A boy/girl ...',
      source == 'convert'
          ? "Convert the user's description into the final natural-language prompt."
          : 'Analyze the image and write the final natural-language prompt.',
    ].join('\n');
  }
  if (mode == ReversePromptMode.mixed) {
    return [
      'Output mode: mixed NovelAI V4.5 prompt.',
      'Return exactly one English prompt line.',
      'Use Danbooru tags plus short natural-language clauses only where they clarify composition or interaction.',
      'Do not return pure prose only.',
    ].join('\n');
  }
  return [
    'Output mode: Danbooru tag prompt.',
    'Return exactly one English prompt line.',
    'Use comma-separated Danbooru / NovelAI tags.',
    'Do not output a pure natural-language sentence.',
  ].join('\n');
}

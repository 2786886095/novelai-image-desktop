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
      'Do not output tags like `2boys, black hair, white shirt` as the final answer.',
      'For two or more original characters, use: base scene description | A boy/girl ... | A boy/girl ...',
      'Each character segment must be a complete English phrase or sentence with clear position and action.',
      source == 'convert'
          ? "Convert the user's description into the final natural-language prompt, following the examples in the system template."
          : 'Analyze the image and write the final natural-language prompt, following the examples in the system template.',
    ].join('\n');
  }
  if (mode == ReversePromptMode.mixed) {
    return [
      'Output mode: mixed NovelAI V4.5 prompt.',
      'Return exactly one English prompt line.',
      'Use Danbooru tags plus short natural-language clauses only where they clarify composition or interaction.',
      'Do not return pure prose only.',
      'Do not ignore the V4.5 multi-character `base | character 1 | character 2` format when multiple people are described.',
    ].join('\n');
  }
  return [
    'Output mode: Danbooru tag prompt.',
    'Return exactly one English prompt line.',
    'Use comma-separated Danbooru / NovelAI tags.',
    'Do not output a pure natural-language sentence.',
    'For multiple people, prefer V4.5 `base prompt | character prompt 1 | character prompt 2` with tag-style segments.',
  ].join('\n');
}

double _tagTokenRatio(String text) {
  final tokens = text
      .split(RegExp(r'[,|]'))
      .map((part) => part.trim())
      .where((part) => part.isNotEmpty)
      .toList();
  if (tokens.length < 5) return 0;
  final bannedWords = RegExp(
    r'\b(?:is|are|was|were|with|while|shown|view|beside|nearby|inside|outside|drawing|juggling)\b',
    caseSensitive: false,
  );
  final tagLike = tokens.where((token) {
    final words =
        token.split(RegExp(r'\s+')).where((word) => word.isNotEmpty).toList();
    if (words.length > 4) return false;
    if (RegExp(r'[.!?;:]').hasMatch(token)) return false;
    if (bannedWords.hasMatch(token)) return false;
    return true;
  }).length;
  return tagLike / tokens.length;
}

bool isLikelyTagListPrompt(String text) {
  final normalized = cleanPromptOutput(text);
  if (normalized.isEmpty) return false;

  final hasNaturalSentence = RegExp(
        r'\b(?:A|An|The|One|Two|Three|Four|Five|No)\s+\w+\s+(?:is|are|was|were|stands?|sits?|lies?|holds?|draws?|juggles?|wears?)\b',
        caseSensitive: false,
      ).hasMatch(normalized) ||
      RegExp(
        r'\b(?:shown from|full-body view|medium shot|close-up view|with desks|with chairs|with a|with an)\b',
        caseSensitive: false,
      ).hasMatch(normalized);
  if (hasNaturalSentence) return false;

  final startsWithTagCount = RegExp(
    r'^(?:\d+\s*(?:girls?|boys?|people|others?)|[1-6](?:girl|boy)|solo|no humans|background dataset)\b',
    caseSensitive: false,
  ).hasMatch(normalized);
  final commaCount = ','.allMatches(normalized).length;
  final pipeTagSegments = normalized
      .split('|')
      .map((part) => part.trim())
      .where((part) => part.isNotEmpty)
      .where(
        (part) => RegExp(
          r'^(?:girl|boy|other|[1-6](?:girl|boy)|solo|no humans|background dataset)\b',
          caseSensitive: false,
        ).hasMatch(part),
      )
      .length;

  return (startsWithTagCount && commaCount >= 3) ||
      _tagTokenRatio(normalized) >= 0.72 ||
      pipeTagSegments >= 2;
}

bool isLikelyNaturalLanguagePrompt(String text) {
  final normalized = cleanPromptOutput(text);
  if (normalized.isEmpty) return false;
  final sentenceSignals = RegExp(
        r'\b(?:A|An|The|One|Two|Three|Four|Five|No)\s+\w+\s+(?:is|are|was|were|stands?|sits?|lies?|holds?|draws?|juggles?|wears?|contains?|shows?|faces?)\b',
        caseSensitive: false,
      ).hasMatch(normalized) ||
      RegExp(
        r'\b(?:shown from|full-body view|medium shot|close-up view|with desks|with chairs|with a|with an|while facing|in the background)\b',
        caseSensitive: false,
      ).hasMatch(normalized);
  if (!sentenceSignals) return false;
  return _tagTokenRatio(normalized) < 0.55;
}

bool modeNeedsRepair(ReversePromptMode mode, String output) {
  final cleaned = cleanPromptOutput(output);
  if (cleaned.isEmpty) return false;
  if (mode == ReversePromptMode.natural) return isLikelyTagListPrompt(cleaned);
  if (mode == ReversePromptMode.tags) return isLikelyNaturalLanguagePrompt(cleaned);
  return isLikelyNaturalLanguagePrompt(cleaned) && !isLikelyTagListPrompt(cleaned);
}

String naturalRepairSystemPrompt() {
  return [
    'You rewrite failed NovelAI prompts into the requested natural-language prompt format.',
    'Return exactly one English prompt line, no explanation.',
    'Do not output a comma-separated Danbooru tag list.',
    'For two or more original characters, use: base scene description | A boy/girl ... | A boy/girl ...',
    'Match this style:',
    'Two boys are in a classroom with desks, chairs, a sketchbook, and colored balls, shown from the front in a full-body view | A boy with short black hair and a white shirt is sitting on the left at the desk and drawing in the sketchbook with a pencil | A boy with blue hair and a dark blue hoodie is standing on the right and juggling three colored balls',
  ].join('\n');
}

String modeRepairSystemPrompt(ReversePromptMode mode) {
  if (mode == ReversePromptMode.natural) return naturalRepairSystemPrompt();
  if (mode == ReversePromptMode.tags) {
    return [
      'You rewrite failed NovelAI prompts into Danbooru / NovelAI tag prompt format.',
      'Return exactly one English prompt line, no explanation.',
      'Use comma-separated tags. Do not output pure prose sentences.',
      'For two or more characters, use V4.5 pipe format: base tags | character tags 1 | character tags 2.',
      'Use tag-style character segments such as: boy, short black hair, white shirt, sitting, drawing.',
      'Match this style:',
      '2boys, classroom, desks, chairs, sketchbook, colored balls, full body, from front | boy, short black hair, white shirt, sitting, drawing, holding pencil | boy, blue hair, dark blue hoodie, standing, juggling balls',
    ].join('\n');
  }
  return [
    'You rewrite failed NovelAI prompts into mixed NovelAI V4.5 prompt format.',
    'Return exactly one English prompt line, no explanation.',
    'Use mostly Danbooru tags, plus short natural-language clauses only where they clarify composition or interaction.',
    'Do not output pure prose only.',
    'For two or more characters, use V4.5 pipe format: base tags and short scene clause | character tags 1 | character tags 2.',
    'Match this style:',
    '2boys, classroom, desks, chairs, sketchbook, colored balls, full body, from front, the black-haired boy sits on the left while the blue-haired boy stands on the right | boy, short black hair, white shirt, sitting, drawing, holding pencil | boy, blue hair, dark blue hoodie, standing, juggling balls',
  ].join('\n');
}

String buildModeRepairUserText(
  ReversePromptMode mode,
  String originalInput,
  String badOutput,
) {
  return [
    'Selected output mode:',
    mode.value,
    '',
    'Original user description or image-derived prompt:',
    originalInput.trim(),
    '',
    'Incorrect output:',
    cleanPromptOutput(badOutput),
    '',
    'Rewrite it so it strictly matches the selected mode and preserves visible objects, positions, roles, and actions.',
  ].join('\n');
}

import 'dart:convert';

import '../models/nai_models.dart';

class PromptVariants {
  final String namePrompt;
  final String featurePrompt;

  const PromptVariants({this.namePrompt = '', this.featurePrompt = ''});

  bool get isComplete => namePrompt.isNotEmpty && featurePrompt.isNotEmpty;

  Map<String, dynamic> toJson() => {
        'namePrompt': namePrompt,
        'featurePrompt': featurePrompt,
      };

  factory PromptVariants.fromJson(Map<String, dynamic> j) => PromptVariants(
        namePrompt: j['namePrompt'] ?? '',
        featurePrompt: j['featurePrompt'] ?? '',
      );
}

enum TextToolJobStatus { processing, done, failed }

/// In-flight/just-finished convert or reverse requests. Concurrent, not a
/// serial queue: each job fires its API call immediately on creation and is
/// updated in place when that call resolves. Not persisted across restarts.
class TextToolJob {
  final String id;
  final String label;
  final ReversePromptMode mode;
  final bool knownCharacter;
  TextToolJobStatus status;
  String? result;
  PromptVariants? variants;
  String? message;
  final DateTime addedAt;

  TextToolJob({
    required this.id,
    required this.label,
    required this.mode,
    required this.knownCharacter,
    required this.status,
    this.result,
    this.variants,
    this.message,
    required this.addedAt,
  });
}

/// Persisted record of a completed convert/reverse result.
class TextToolHistoryItem {
  final String id;
  final ReversePromptMode mode;
  final bool knownCharacter;
  final String input;
  /// Reverse only — used to drop the record once the source image is gone,
  /// same lazy-cleanup precedent as HistoryItem/dropMissingImage.
  final String? sourceImagePath;
  final String result;
  final PromptVariants? variants;
  final String createdAt;

  TextToolHistoryItem({
    required this.id,
    required this.mode,
    required this.knownCharacter,
    required this.input,
    this.sourceImagePath,
    required this.result,
    this.variants,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'mode': mode.value,
        'knownCharacter': knownCharacter,
        'input': input,
        'sourceImagePath': sourceImagePath,
        'result': result,
        'variants': variants?.toJson(),
        'createdAt': createdAt,
      };

  factory TextToolHistoryItem.fromJson(Map<String, dynamic> j) => TextToolHistoryItem(
        id: j['id'],
        mode: ReversePromptMode.values.firstWhere(
          (m) => m.value == j['mode'],
          orElse: () => ReversePromptMode.tags,
        ),
        knownCharacter: j['knownCharacter'] ?? false,
        input: j['input'] ?? '',
        sourceImagePath: j['sourceImagePath'],
        result: j['result'] ?? '',
        variants: (j['variants'] is Map)
            ? PromptVariants.fromJson(Map<String, dynamic>.from(j['variants']))
            : null,
        createdAt: j['createdAt'] ?? '',
      );
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
  // Kept in Chinese to match the main system template (synced from desktop's
  // CONVERT_SYSTEM_PROMPTS/REVERSE_SYSTEM_PROMPTS, both Chinese) — mixing
  // languages within one system prompt measurably hurt output quality (the
  // model treated an appended English block as a lower-priority afterthought
  // instead of an integral part of the template). See desktop's
  // src/prompt-mode.ts knownCharacterRuntimeInstruction for the same fix.
  final modeText = switch (mode) {
    ReversePromptMode.natural => '使用简洁的英文自然语言 NovelAI 提示词。',
    ReversePromptMode.mixed => '使用简洁的混合 NovelAI 提示词：以 Danbooru tag 为主，只在需要时加入简短的自然语言。',
    ReversePromptMode.tags => '使用简洁的英文逗号分隔 Danbooru / NovelAI tag。',
  };
  if (knownCharacter) {
    return [
      '已知网络/游戏/动漫角色模式已开启。',
      '只输出严格 JSON，必须且只能包含这两个字符串字段：namePrompt 和 featurePrompt。',
      'namePrompt 和 featurePrompt 都必须是完整的提示词，都要遵守上面系统模板里的全部格式、结构和权重规则（场景、构图、姿势、动作、互动、V4.5 多角色管道写法、source#/target#/mutual# 标签、权重语法）。两者必须用同样的详细程度描述同一个场景，区别只在于角色身份的表达方式，不能因为角色身份而减少场景内容。',
      'namePrompt：使用准确的角色 tag/名字作为角色身份。如果角色 tag 本身已经包含默认发色、瞳色、服装或配饰，不要重复写出，除非用户明确要求不同或特殊的外观/服装。',
      'featurePrompt：不要使用角色名字，改用简短的可见身份特征和服装 tag 作为身份，用于模型库不认识该角色的情况。除了身份表达方式之外，其余场景内容必须和 namePrompt 完全一致。',
      '以芙宁娜为例，如果没有特殊服装或状态要求，身份部分本身可以简短到：1girl, solo, furina (genshin impact)——但两个版本都必须把用户描述的其余场景内容完整写出来。',
      modeText,
      source == 'reverse'
          ? '如果反推范围是角色，除非需要识别可见的特殊服装或状态，否则不要描述整个场景。'
          : '不要凭空编造角色 tag 或用户描述之外的额外默认服装、外观细节。',
    ].join('\n');
  }
  return [
    '已知网络/游戏/动漫角色模式已关闭。',
    '不要依赖角色名字 tag 或受版权保护的角色名作为身份。',
    '改用简短的可见外观、服装、姿势、动作和氛围描述来代替。',
    '保持提示词简洁，避免堆砌大段外观或服装描述。',
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

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

class PromptCodexMatch {
  final String id;
  final String title;
  final String section;
  final String source;
  final String excerpt;
  final bool adult;
  final double score;

  const PromptCodexMatch({
    required this.id,
    required this.title,
    required this.section,
    required this.source,
    required this.excerpt,
    required this.adult,
    required this.score,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'section': section,
        'source': source,
        'excerpt': excerpt,
        'adult': adult,
        'score': score,
      };

  factory PromptCodexMatch.fromJson(Map<String, dynamic> json) =>
      PromptCodexMatch(
        id: json['id']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        section: json['section']?.toString() ?? '',
        source: json['source']?.toString() ?? '',
        excerpt: json['excerpt']?.toString() ?? '',
        adult: json['adult'] == true,
        score: (json['score'] as num?)?.toDouble() ?? 0,
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
  List<PromptCodexMatch> codexMatches;
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
    this.codexMatches = const [],
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
  final List<PromptCodexMatch> codexMatches;
  final String createdAt;

  TextToolHistoryItem({
    required this.id,
    required this.mode,
    required this.knownCharacter,
    required this.input,
    this.sourceImagePath,
    required this.result,
    this.variants,
    this.codexMatches = const [],
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
        'codexMatches': codexMatches.map((item) => item.toJson()).toList(),
        'createdAt': createdAt,
      };

  factory TextToolHistoryItem.fromJson(Map<String, dynamic> j) =>
      TextToolHistoryItem(
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
        codexMatches: (j['codexMatches'] as List? ?? const [])
            .whereType<Map>()
            .map((item) =>
                PromptCodexMatch.fromJson(Map<String, dynamic>.from(item)))
            .toList(growable: false),
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
  bool knownCharacter, [
  String templateVersion = 'v5',
]) {
  // Kept in Chinese to match the main system template (synced from desktop's
  // CONVERT_SYSTEM_PROMPTS/REVERSE_SYSTEM_PROMPTS, both Chinese) — mixing
  // languages within one system prompt measurably hurt output quality (the
  // model treated an appended English block as a lower-priority afterthought
  // instead of an integral part of the template). See desktop's
  // src/prompt-mode.ts knownCharacterRuntimeInstruction for the same fix.
  final versionLabel = templateVersion == 'v4.5' ? 'V4.5' : 'V5';
  final modeText = switch (mode) {
    ReversePromptMode.natural => '使用简洁的英文自然语言 NovelAI $versionLabel 提示词。',
    ReversePromptMode.mixed =>
      '使用 NovelAI $versionLabel 混合提示词：约 80% Danbooru tag + 20% 简短英文自然语言，两部分都不得省略。',
    ReversePromptMode.tags =>
      '使用简洁的英文逗号分隔 Danbooru / NovelAI $versionLabel tag。',
  };
  if (knownCharacter) {
    final identityRules = source == 'convert'
        ? [
            'namePrompt：先确认角色与作品，使用规范 Danbooru 角色 Tag；重名角色用作品名括号消歧。角色 Tag 已包含的默认外貌和默认服装不重复，只保留用户明确要求的变化、动作与场景。',
            'featurePrompt：删除全部角色名、作品名和版权 Tag；把每名已确认角色替换为足以辨认的高置信度标志性外貌、默认服装与配饰。若用户指定了换装或外观变化，以用户描述为准，不得再混入默认服装；无法确认的细节不要猜。',
          ]
        : [
            'namePrompt：只有能从图片或用户提示可靠确认时才使用规范角色 Tag；重名角色用作品名括号消歧。角色 Tag 已包含的默认外貌和默认服装不重复，只保留图片中可见的特殊服装、状态、动作与场景。',
            'featurePrompt：删除全部角色名、作品名和版权 Tag；只用图片中可见的外貌、服装与配饰识别每名角色，不调用不可见的角色设定补全画面。',
          ];
    return [
      '已知网络/游戏/动漫角色模式已开启。',
      '本段输出契约高于基础模板中的“只输出一行最终 prompt”：外层只返回 JSON，两个字段值各自仍必须是一行英文 Prompt。',
      '只输出严格 JSON，必须且只能包含这两个字符串字段：namePrompt 和 featurePrompt。',
      '两个字段必须描述同一完整画面，并分别遵守当前模式、NovelAI $versionLabel 多人分段、互动、权重、Text: 与个人法典规则；场景、动作、位置、构图、道具和文字必须一致，区别只能是角色身份写法。',
      ...identityRules,
      '多人时，namePrompt 与 featurePrompt 的角色段数量和顺序必须完全一致，并逐人完成角色 Tag ↔ 特征组替换。',
      modeText,
      source == 'reverse'
          ? '如果反推范围是角色，除非需要识别可见的特殊服装或状态，否则不要描述整个场景。'
          : '角色知识只用于确认规范角色 Tag 和生成特征版所需的高置信度标志性特征；不得借此新增用户未要求的动作、场景、表情或道具。',
    ].join('\n');
  }
  return [
    '已知网络/游戏/动漫角色模式已关闭。',
    '不要使用角色名；用最少必要的可见外貌、服装、位置和动作区分角色。',
    modeText,
  ].join('\n');
}

String modeUserInstruction(
  ReversePromptMode mode,
  String source, {
  bool knownCharacter = false,
  String templateVersion = 'v5',
}) {
  final versionLabel = templateVersion == 'v4.5' ? 'V4.5' : 'V5';
  final outputContract = knownCharacter
      ? [
          'Return strict JSON only, with exactly two string fields: `namePrompt` and `featurePrompt`; do not add Markdown or any third field.',
          'Each field must contain one complete English prompt line for the same image. Keep scene, action, position, composition, props, text, character count, and character order identical in both fields.',
          source == 'convert'
              ? 'In namePrompt use verified canonical character tags. In featurePrompt remove all character/copyright names and replace each character with high-confidence signature appearance, outfit, and accessories; explicit user changes override canonical defaults.'
              : 'In namePrompt use only reliably verified character tags. In featurePrompt remove all character/copyright names and replace each character only with appearance, outfit, and accessories visible in the image.',
        ]
      : ['Return exactly one English prompt line.'];
  if (mode == ReversePromptMode.natural) {
    return [
      'Output mode: natural-language NovelAI $versionLabel prompt.',
      ...outputContract,
      'Use concise English prose, not a comma-separated tag list. Dataset prefixes, numeric weights, and `text, <language> text, Text: ...` are the only syntax exceptions.',
      'For multiple characters use `base scene | A boy/girl ... | A boy/girl ...`; every segment must identify position and action without vague pronouns.',
      source == 'convert'
          ? "Convert only the user's stated content."
          : 'Describe only visible evidence in the requested scope.',
    ].join('\n');
  }
  if (mode == ReversePromptMode.mixed) {
    return [
      'Output mode: mixed NovelAI $versionLabel prompt.',
      ...outputContract,
      'Keep approximately 75–85% mature Danbooru/NovelAI tag units and 15–25% concise English natural-language relation phrases. Both parts are mandatory; even a short prompt needs at least one non-invented prose phrase.',
      'Use prose for tag-uncovered position, hand/side, target, depth, overlap, or text placement; never pad the ratio by inventing facts or fully restating existing tags.',
      'Discard retrieved candidates that are not exact matches. Use `base | character 1 | character 2` for multiple people and do not return pure prose.',
    ].join('\n');
  }
  return [
    'Output mode: Danbooru tag prompt for NovelAI $versionLabel.',
    ...outputContract,
    'Use exact mature Danbooru / NovelAI tags once, discard inexact retrieved candidates, and do not add synonym or prose repetitions.',
    'Use comma-separated tags and `base | character 1 | character 2` for multiple people; do not output prose.',
  ].join('\n');
}

String _normalizedTagToken(String value) => value
    .trim()
    .toLowerCase()
    .replaceFirst(RegExp(r'^[-+]?\d+(?:\.\d+)?::'), '')
    .replaceFirst(RegExp(r'::$'), '')
    .replaceAll(RegExp(r'[{}\[\]]'), '')
    .replaceAll('_', ' ')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

const _promptConflicts = <(String, String)>[
  ('close-up', 'full body'),
  ('close up', 'full body'),
  ('upper body', 'full body'),
  ('cowboy shot', 'upper body'),
  ('cowboy shot', 'full body'),
  ('from front', 'from behind'),
  ('from above', 'from below'),
  ('sitting', 'standing'),
];

const _matureTagDecompositions = <String, List<String>>{
  'dogeza': ['bowing', 'hands on floor', 'kneeling on floor'],
  'wariza': ['kneeling sit', 'kneeling sitting', 'sitting on feet'],
  'yokozuwari': ['legs to side', 'sideways sitting'],
  'cowboy shot': ['upper body', 'full body', 'medium shot'],
  'dutch angle': ['tilted angle', 'tilted composition'],
  'crossed arms': ['arms crossed'],
  'hands behind back': ['arms behind back'],
};

bool _looksLikeNaturalLanguage(String value) {
  final text = cleanPromptOutput(value);
  final sentence = RegExp(
    r'\b(?:A|An|The|One|Two|Three|Four|Five|No)\s+\w+\s+(?:is|are|was|were|stands?|sits?|lies?|holds?|draws?|juggles?|wears?|contains?|shows?|faces?)\b',
    caseSensitive: false,
  ).hasMatch(text);
  if (!sentence) return false;
  final chunks =
      text.split(RegExp(r'[,|]')).where((item) => item.trim().isNotEmpty);
  final shortTags = chunks.where((item) {
    final token = item.trim();
    return token.split(RegExp(r'\s+')).length <= 4 &&
        !RegExp(r'[.!?;:]').hasMatch(token);
  }).length;
  return shortTags < 5;
}

double _tagTokenRatio(String value) {
  final tokens = cleanPromptOutput(value)
      .split(RegExp(r'[,|]'))
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList(growable: false);
  if (tokens.length < 5) return 0;
  final tagLike = tokens.where((token) {
    final words = token.split(RegExp(r'\s+')).where((item) => item.isNotEmpty);
    if (words.length > 4 || RegExp(r'[.!?;:]').hasMatch(token)) return false;
    return !RegExp(
      r'\b(?:is|are|was|were|with|while|shown|view|beside|nearby|inside|outside|drawing|juggling)\b',
      caseSensitive: false,
    ).hasMatch(token);
  }).length;
  return tagLike / tokens.length;
}

bool _looksLikeTagList(String value) {
  final text = cleanPromptOutput(value);
  if (text.isEmpty) return false;
  final startsWithCount = RegExp(
    r'^(?:\d+\s*(?:girls?|boys?|people|others?)|[1-6](?:girl|boy)|solo|no humans|background dataset)\b',
    caseSensitive: false,
  ).hasMatch(text);
  final commas = ','.allMatches(text).length;
  return (startsWithCount && commas >= 3) || _tagTokenRatio(text) >= 0.72;
}

bool _hasMixedNaturalLanguage(String value) => RegExp(
      r'\b(?:on the left|on the right|in the middle|at the center|beside|next to|in front of|behind|toward|towards|with (?:his|her|their|its|both)|while|who |offering|receiving|reaching with|looking (?:at|toward)|partly hidden|overlapping)\b',
      caseSensitive: false,
    ).hasMatch(cleanPromptOutput(value));

List<String> promptRuleViolations(
  ReversePromptMode mode,
  String output, [
  List<String> matureTags = const [],
]) {
  if (mode == ReversePromptMode.natural) return const [];
  final cleaned = cleanPromptOutput(output);
  if (cleaned.isEmpty) return const [];
  final issues = <String>{};
  if (mode == ReversePromptMode.tags && _looksLikeNaturalLanguage(cleaned)) {
    issues.add('输出不是以逗号分隔的 Danbooru Tag 格式');
  } else if (mode == ReversePromptMode.mixed) {
    if (_looksLikeNaturalLanguage(cleaned) && !_looksLikeTagList(cleaned)) {
      issues.add('混合模式输出退化成了纯自然语言，缺少 Tag 主体');
    } else if (_looksLikeTagList(cleaned) &&
        !_hasMixedNaturalLanguage(cleaned)) {
      issues.add('混合模式缺少约 20% 的自然语言关系短语');
    }
  }
  final tokens = cleaned
      .split(RegExp(r'[|,]'))
      .map(_normalizedTagToken)
      .where((item) => item.isNotEmpty)
      .toList();
  final tokenSet = <String>{};
  for (final token in tokens) {
    if (!tokenSet.add(token)) issues.add('重复 Tag：$token');
  }
  for (final conflict in _promptConflicts) {
    if (tokenSet.contains(conflict.$1) && tokenSet.contains(conflict.$2)) {
      issues.add('互斥 Tag 同时出现：${conflict.$1} / ${conflict.$2}');
    }
  }
  final candidates = matureTags.map(_normalizedTagToken).toSet();
  for (final entry in _matureTagDecompositions.entries) {
    if (!candidates.contains(entry.key) || !tokenSet.contains(entry.key)) {
      continue;
    }
    for (final decomposition in entry.value) {
      if (tokenSet.contains(decomposition)) {
        issues.add('成熟 Tag ${entry.key} 已完整表达概念，不应再叠加 $decomposition');
      }
    }
  }
  return issues.toList(growable: false);
}

String promptRuleRepairSystemPrompt(
  ReversePromptMode mode,
  bool knownCharacter, [
  String templateVersion = 'v5',
]) =>
    [
      '你是 NovelAI ${templateVersion == 'v4.5' ? 'V4.5' : 'V5'} 提示词规则校验与定向修复器。不要重新创作画面，只修复明确列出的违规项。',
      knownCharacter
          ? '只输出严格 JSON，且只能包含 namePrompt 与 featurePrompt 两个字符串字段；两份提示词都必须完成相同检查。'
          : '只输出修复后的单行英文 Prompt，不要解释、标题或 Markdown。',
      mode == ReversePromptMode.tags
          ? '保持 Danbooru Tag 模式，以英文逗号分隔；多人继续使用 base | character 1 | character 2。'
          : '保持混合模式：约 75–85% Danbooru Tag + 15–25% 简短英文自然语言，两部分都不得省略；不得靠重复或编造凑比例。',
      '成熟整词优先：一个成熟 Tag 已完整表达动作、姿态或构图时，只保留该 Tag 一次，删除拆解词、近义词和重复自然语言；未覆盖的关键差异才允许最少量补充。',
      '候选成熟 Tag 不贴合原始输入时必须舍弃，不能硬套；不得新增原始输入或图片中没有的内容。',
    ].join('\n');

String buildPromptRuleRepairUserText({
  required ReversePromptMode mode,
  required String originalInput,
  required String draft,
  required List<String> violations,
  List<String> matureTags = const [],
}) =>
    [
      '输出模式：${mode.value}',
      '原始输入或反推范围：',
      originalInput.trim(),
      '待校验 Prompt：',
      draft.trim(),
      '程序检测到的违规项：',
      for (var index = 0; index < violations.length; index += 1)
        '${index + 1}. ${violations[index]}',
      matureTags.isNotEmpty
          ? '本地检索到的成熟 Tag 候选（仅精确贴合时使用）：${matureTags.join(', ')}'
          : '本次没有可靠成熟 Tag 候选，请采用最短基础组合。',
      '只修复上述问题并执行最终去重、互斥检查；保留其余正确内容。',
    ].join('\n\n');

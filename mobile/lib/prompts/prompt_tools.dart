import 'dart:math';

class WeightedPromptTag {
  final String core;
  final int level;

  const WeightedPromptTag(this.core, this.level);
}

class RelatedPromptTag {
  final String tag;
  final String description;

  const RelatedPromptTag(this.tag, this.description);
}

class PromptNormalizeOptions {
  final bool lowercase;
  final bool halfWidthPunct;
  final bool stripDecorative;
  final bool underscoreToSpace;
  final bool newlineToComma;
  final bool dedupe;
  final bool stripQualityPrefix;
  final bool stripNonAscii;
  final bool keepWildcards;

  const PromptNormalizeOptions({
    this.lowercase = true,
    this.halfWidthPunct = true,
    this.stripDecorative = true,
    this.underscoreToSpace = true,
    this.newlineToComma = true,
    this.dedupe = true,
    this.stripQualityPrefix = true,
    this.stripNonAscii = true,
    this.keepWildcards = true,
  });

  PromptNormalizeOptions copyWith({
    bool? lowercase,
    bool? halfWidthPunct,
    bool? stripDecorative,
    bool? underscoreToSpace,
    bool? newlineToComma,
    bool? dedupe,
    bool? stripQualityPrefix,
    bool? stripNonAscii,
    bool? keepWildcards,
  }) =>
      PromptNormalizeOptions(
        lowercase: lowercase ?? this.lowercase,
        halfWidthPunct: halfWidthPunct ?? this.halfWidthPunct,
        stripDecorative: stripDecorative ?? this.stripDecorative,
        underscoreToSpace: underscoreToSpace ?? this.underscoreToSpace,
        newlineToComma: newlineToComma ?? this.newlineToComma,
        dedupe: dedupe ?? this.dedupe,
        stripQualityPrefix: stripQualityPrefix ?? this.stripQualityPrefix,
        stripNonAscii: stripNonAscii ?? this.stripNonAscii,
        keepWildcards: keepWildcards ?? this.keepWildcards,
      );
}

const _qualityTags = {
  'masterpiece',
  'best quality',
  'high quality',
  'highest quality',
  'ultra quality',
  'very aesthetic',
  'aesthetic',
  'absurdres',
  'highres',
  'high resolution',
  'ultra-detailed',
  'ultra detailed',
  'extremely detailed',
  'detailed',
  '8k',
  '4k',
  'best aesthetic',
  'amazing quality',
  'very detailed',
  'official art',
};

final _wildcardPattern = RegExp(
  r'\{[^{}]*\|[^{}]*\}|\[[^\[\]]*\|[^\[\]]*\]|\$\{[^}]*\}|<[^>]+>',
);
final _expandableWildcard = RegExp(r'\{([^{}]*\|[^{}]*)\}');

bool hasPromptWildcards(String text) => _expandableWildcard.hasMatch(text);

String expandPromptWildcards(String text, {double Function()? random}) {
  if (text.isEmpty || !text.contains('{')) return text;
  final nextRandom = random ?? Random.secure().nextDouble;
  var result = text;
  var guard = 0;
  while (_expandableWildcard.hasMatch(result) && guard++ < 200) {
    result = result.replaceFirstMapped(_expandableWildcard, (match) {
      final options = match.group(1)!.split('|');
      final index = (nextRandom() * options.length).floor().clamp(
            0,
            options.length - 1,
          );
      return options[index].trim();
    });
  }
  return result;
}

String normalizePrompt(
  String input, {
  PromptNormalizeOptions options = const PromptNormalizeOptions(),
}) {
  if (input.trim().isEmpty) return '';
  var text = input;
  final wildcards = <String>[];
  if (options.keepWildcards) {
    text = text.replaceAllMapped(_wildcardPattern, (match) {
      wildcards.add(match.group(0)!);
      return ' @@wc${wildcards.length - 1}@@ ';
    });
  }
  if (options.newlineToComma) {
    text = text.replaceAll(RegExp(r'[\r\n]+'), ', ');
  }
  if (options.halfWidthPunct) {
    text = text
        .replaceAll(RegExp(r'[，、､]'), ',')
        .replaceAll(RegExp(r'[。．]'), '.')
        .replaceAll('；', ';')
        .replaceAll('：', ':')
        .replaceAll('（', '(')
        .replaceAll('）', ')')
        .replaceAll('！', '!')
        .replaceAll('？', '?')
        .replaceAll('　', ' ');
  }
  if (options.stripDecorative) {
    text = text.replaceAll(RegExp(r'[【】「」『』《》〈〉〔〕]'), ' ');
  }
  if (options.underscoreToSpace) text = text.replaceAll('_', ' ');
  if (options.lowercase) text = text.toLowerCase();

  final seen = <String>{};
  final tags = <String>[];
  for (var tag in text.split(',')) {
    if (options.stripNonAscii) {
      tag = tag.replaceAll(RegExp(r'[^\x20-\x7e]'), '').trim();
    }
    tag = tag.replaceAll(RegExp(r'\s+'), ' ');
    if (tag.isEmpty) continue;
    if (options.stripQualityPrefix) {
      final qualityKey = tag.toLowerCase();
      if (_qualityTags.contains(qualityKey) ||
          qualityKey.startsWith('artist:') ||
          qualityKey.startsWith('by ')) {
        continue;
      }
    }
    if (!options.dedupe || seen.add(tag.toLowerCase())) tags.add(tag);
  }

  var result = tags.join(', ');
  if (options.keepWildcards) {
    result = result.replaceAllMapped(
      RegExp(r'@@wc(\d+)@@'),
      (match) => wildcards[int.parse(match.group(1)!)],
    );
  }
  return result;
}

List<String> splitPromptTags(String prompt) => prompt
    .split(',')
    .map((tag) => tag.trim())
    .where((tag) => tag.isNotEmpty)
    .toList();

WeightedPromptTag parseWeightedTag(String raw) {
  var value = raw.trim();
  var level = 0;
  while (value.length >= 2) {
    if (value.startsWith('{') && value.endsWith('}')) {
      value = value.substring(1, value.length - 1).trim();
      level++;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      value = value.substring(1, value.length - 1).trim();
      level--;
    } else {
      break;
    }
  }
  return WeightedPromptTag(value, level);
}

String serializeWeightedTag(String core, int level) {
  final value = core.trim();
  if (value.isEmpty) return '';
  final safeLevel = level.clamp(-5, 5);
  if (safeLevel > 0) {
    return '${List.filled(safeLevel, '{').join()}$value${List.filled(safeLevel, '}').join()}';
  }
  if (safeLevel < 0) {
    return '${List.filled(-safeLevel, '[').join()}$value${List.filled(-safeLevel, ']').join()}';
  }
  return value;
}

String setTagLevel(String prompt, int index, int level) {
  final tags = splitPromptTags(prompt);
  if (index < 0 || index >= tags.length) return prompt;
  tags[index] = serializeWeightedTag(parseWeightedTag(tags[index]).core, level);
  return tags.join(', ');
}

double weightMultiplier(int level) => _pow(1.05, level);

double _pow(double base, int exponent) {
  var result = 1.0;
  if (exponent >= 0) {
    for (var i = 0; i < exponent; i++) {
      result *= base;
    }
  } else {
    for (var i = 0; i > exponent; i--) {
      result /= base;
    }
  }
  return result;
}

String _tagKey(String tag) => tag
    .trim()
    .toLowerCase()
    .replaceAll('_', ' ')
    .replaceAll(RegExp(r'[{}\[\]]'), '')
    .trim();

const _related = <String, List<RelatedPromptTag>>{
  'maid': [
    RelatedPromptTag('apron', '围裙'),
    RelatedPromptTag('maid headdress', '女仆头饰'),
    RelatedPromptTag('frills', '褶边'),
    RelatedPromptTag('white thighhighs', '白色过膝袜'),
  ],
  'cat ears': [
    RelatedPromptTag('cat tail', '猫尾'),
    RelatedPromptTag('animal ear fluff', '兽耳绒毛'),
    RelatedPromptTag('cat girl', '猫娘'),
    RelatedPromptTag('fang', '虎牙'),
  ],
  'school uniform': [
    RelatedPromptTag('serafuku', '水手服'),
    RelatedPromptTag('pleated skirt', '百褶裙'),
    RelatedPromptTag('classroom', '教室'),
    RelatedPromptTag('kneehighs', '及膝袜'),
  ],
  'kimono': [
    RelatedPromptTag('obi', '腰带'),
    RelatedPromptTag('floral print', '花纹'),
    RelatedPromptTag('hair flower', '发花'),
    RelatedPromptTag('wide sleeves', '宽袖'),
  ],
  'swimsuit': [
    RelatedPromptTag('bikini', '比基尼'),
    RelatedPromptTag('beach', '海滩'),
    RelatedPromptTag('ocean', '海洋'),
    RelatedPromptTag('wet', '湿身'),
  ],
  'armor': [
    RelatedPromptTag('sword', '剑'),
    RelatedPromptTag('knight', '骑士'),
    RelatedPromptTag('cape', '披风'),
    RelatedPromptTag('gauntlets', '护手'),
  ],
  'long hair': [
    RelatedPromptTag('floating hair', '飘发'),
    RelatedPromptTag('hair between eyes', '碎发'),
    RelatedPromptTag('very long hair', '超长发'),
    RelatedPromptTag('bangs', '刘海'),
  ],
  'twintails': [
    RelatedPromptTag('hair ribbon', '发带'),
    RelatedPromptTag('ribbon', '丝带'),
    RelatedPromptTag('bangs', '刘海'),
    RelatedPromptTag('hair bow', '蝴蝶结'),
  ],
  'smile': [
    RelatedPromptTag('blush', '脸红'),
    RelatedPromptTag('open mouth', '张嘴'),
    RelatedPromptTag('closed eyes', '闭眼'),
    RelatedPromptTag('happy', '开心'),
  ],
  'night': [
    RelatedPromptTag('night sky', '夜空'),
    RelatedPromptTag('star (sky)', '星星'),
    RelatedPromptTag('moon', '月亮'),
    RelatedPromptTag('city lights', '城市灯光'),
  ],
  'rain': [
    RelatedPromptTag('umbrella', '雨伞'),
    RelatedPromptTag('wet', '潮湿'),
    RelatedPromptTag('puddle', '水洼'),
    RelatedPromptTag('water drop', '水滴'),
  ],
  'sword': [
    RelatedPromptTag('holding sword', '持剑'),
    RelatedPromptTag('weapon', '武器'),
    RelatedPromptTag('armor', '盔甲'),
    RelatedPromptTag('serious', '严肃'),
  ],
  '1girl': [
    RelatedPromptTag('solo', '单人'),
    RelatedPromptTag('looking at viewer', '看向观众'),
    RelatedPromptTag('detailed eyes', '精细眼睛'),
    RelatedPromptTag('upper body', '上半身'),
  ],
};

List<RelatedPromptTag> relatedPromptTags(String prompt, {int limit = 8}) {
  final present = splitPromptTags(prompt).map(_tagKey).toList();
  final presentSet = present.toSet();
  final seen = <String>{};
  final output = <RelatedPromptTag>[];
  for (final anchor in present.reversed) {
    for (final item in _related[anchor] ?? const <RelatedPromptTag>[]) {
      final key = _tagKey(item.tag);
      if (presentSet.contains(key) || !seen.add(key)) continue;
      output.add(item);
      if (output.length >= limit) return output;
    }
  }
  return output;
}

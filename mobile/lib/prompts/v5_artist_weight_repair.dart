import 'dart:math';

import '../artist/artist_recipe.dart';
import '../artist/curated_artists.dart';

class V5ArtistWeightRepairResult {
  final String output;
  final int adjustedWeightedGroups;
  final int wrappedUnweightedArtists;
  final int totalAdjusted;
  final int artistTagCount;
  final int qualityTagCount;
  final int otherTagCount;

  const V5ArtistWeightRepairResult({
    required this.output,
    required this.adjustedWeightedGroups,
    required this.wrappedUnweightedArtists,
    required this.totalAdjusted,
    required this.artistTagCount,
    required this.qualityTagCount,
    required this.otherTagCount,
  });
}

/// Community migration reports for early NAI Diffusion V5 commonly suggest
/// starting at roughly one third to one half of a V4.5 prompt weight. NovelAI
/// does not publish an official conversion ratio.
const double minV5ArtistRepairMultiplier = 1 / 3;
const double maxV5ArtistRepairMultiplier = 1 / 2;
const double defaultV5ArtistDrawMin = .2;
const double defaultV5ArtistDrawMax = 1.2;

class _PromptTag {
  final String raw;
  final String value;
  final double weight;
  final String kind;
  final bool sourceWeighted;

  const _PromptTag({
    required this.raw,
    required this.value,
    required this.weight,
    required this.kind,
    required this.sourceWeighted,
  });

  _PromptTag copyWithWeight(double nextWeight) => _PromptTag(
        raw: raw,
        value: value,
        weight: nextWeight,
        kind: kind,
        sourceWeighted: sourceWeighted,
      );
}

final RegExp _qualityPattern = RegExp(
  r'^(?:masterpiece|best[_ ]quality|amazing[_ ]quality|very[_ ]aesthetic|extremely[_ ]detailed(?:[_ ]cg)?|ultra[-_ ]?detailed|high[_ ]quality|great[_ ]quality|good[_ ]quality|average[_ ]quality|low[_ ]quality|worst[_ ]quality|aesthetic|very[_ ]pleasing|no[_ ]text)$',
  caseSensitive: false,
);
final RegExp _yearPattern = RegExp(r'^year[_ ]?\d{4}$', caseSensitive: false);
final RegExp _negativePattern = RegExp(
  r'^(?:no\s+|negative\s+|avoid\s+)',
  caseSensitive: false,
);
final RegExp _stylePattern = RegExp(
  r'(?:style|realism|impasto|illustration|painting|lineart|lighting|shading|\bcg\b|photorealistic|monochrome|sketch|watercolor|brushstroke|anime coloring|game cg)',
  caseSensitive: false,
);
final RegExp _numericScopePattern = RegExp(
  r'([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*::([\s\S]*?)::',
);

final Set<String> _knownBareArtistTags = {
  ...kCuratedArtistTags.map((artist) => artist.name),
  'xiaoluo_xl',
};

String _formatWeight(double value) {
  final rounded = (value * 100).round() / 100;
  var fixed = (rounded == -0.0 ? 0.0 : rounded).toStringAsFixed(2);
  while (fixed.contains('.') && fixed.endsWith('0')) {
    fixed = fixed.substring(0, fixed.length - 1);
  }
  if (fixed.endsWith('.')) fixed = fixed.substring(0, fixed.length - 1);
  return fixed;
}

String _normalizeCompatibilityAscii(String input) {
  final buffer = StringBuffer();
  for (final rune in input.runes) {
    if (rune >= 0xff01 && rune <= 0xff5e) {
      buffer.writeCharCode(rune - 0xfee0);
    } else if (rune == 0x3000) {
      buffer.write(' ');
    } else {
      buffer.writeCharCode(rune);
    }
  }
  return buffer.toString();
}

String _normalizePromptSource(String input) =>
    _normalizeCompatibilityAscii(input)
        .replaceAll('\u00a0', ' ')
        .replaceAllMapped(
          RegExp(r'\\([_()[\]{}])'),
          (match) => match.group(1)!,
        )
        .replaceAll(RegExp(r'[，、；;\r\n]+'), ',');

String _cleanPromptValue(String raw) {
  var value = raw.trim();
  while (value.startsWith('::')) {
    value = value.substring(2).trimLeft();
  }
  while (value.endsWith('::')) {
    value = value.substring(0, value.length - 2).trimRight();
  }
  return value.trim();
}

String? _repairKnownBareArtistName(String raw) {
  final candidate = canonicalArtistTagName(raw);
  if (_knownBareArtistTags.contains(candidate)) return candidate;
  final opens = '('.allMatches(candidate).length;
  final closes = ')'.allMatches(candidate).length;
  final repaired = '$candidate)';
  if (opens == closes + 1 && _knownBareArtistTags.contains(repaired)) {
    return repaired;
  }
  return null;
}

({String value, String kind})? _classifyAndNormalizeValue(String raw) {
  final value = _cleanPromptValue(raw);
  if (value.isEmpty) return null;

  final explicitArtist = RegExp(
    r'^artist\s*:\s*([\s\S]+)$',
    caseSensitive: false,
  ).firstMatch(value);
  if (explicitArtist != null) {
    final rawName = explicitArtist.group(1)!.trim();
    final name =
        _repairKnownBareArtistName(rawName) ?? canonicalArtistTagName(rawName);
    return name.isEmpty ? null : (value: 'artist:$name', kind: 'artist');
  }

  final knownArtist = _repairKnownBareArtistName(value);
  if (knownArtist != null) {
    return (value: 'artist:$knownArtist', kind: 'artist');
  }

  final comparable = value.replaceAll('_', ' ').trim();
  if (_yearPattern.hasMatch(value)) return (value: value, kind: 'year');
  if (_qualityPattern.hasMatch(value)) return (value: value, kind: 'quality');
  if (_negativePattern.hasMatch(comparable)) {
    return (value: value, kind: 'negative');
  }
  if (_stylePattern.hasMatch(comparable)) return (value: value, kind: 'style');
  return (value: value, kind: 'other');
}

_PromptTag? _parseTerm(
  String raw,
  double? inheritedWeight,
  int legacyLevel,
) {
  var value = _cleanPromptValue(raw);
  if (value.isEmpty) return null;
  var baseWeight = inheritedWeight ?? 1.0;
  var sourceWeighted = inheritedWeight != null || legacyLevel != 0;

  final parenthesizedWeight = RegExp(
    r'^\(\s*([\s\S]+)\s*:\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\)$',
  ).firstMatch(value);
  if (parenthesizedWeight != null) {
    value = parenthesizedWeight.group(1)!.trim();
    baseWeight = double.parse(parenthesizedWeight.group(2)!);
    sourceWeighted = true;
  } else if (value.startsWith('(') && value.endsWith(')')) {
    value = value.substring(1, value.length - 1).trim();
  }

  final normalized = _classifyAndNormalizeValue(value);
  if (normalized == null) return null;
  final weight = baseWeight * pow(1.05, legacyLevel).toDouble();
  return _PromptTag(
    raw: raw,
    value: normalized.value,
    weight: weight.isFinite ? weight : 1,
    kind: normalized.kind,
    sourceWeighted: sourceWeighted,
  );
}

List<_PromptTag> _parseTermList(String source, double? inheritedWeight) {
  final output = <_PromptTag>[];
  final token = StringBuffer();
  var curly = 0;
  var square = 0;
  int? startingLevel;

  void flush() {
    final parsed = _parseTerm(
      token.toString(),
      inheritedWeight,
      startingLevel ?? 0,
    );
    if (parsed != null) output.add(parsed);
    token.clear();
    startingLevel = null;
  }

  for (final rune in source.runes) {
    final char = String.fromCharCode(rune);
    if (char == '{') {
      curly++;
      continue;
    }
    if (char == '}') {
      curly = max(0, curly - 1);
      continue;
    }
    if (char == '[') {
      square++;
      continue;
    }
    if (char == ']') {
      square = max(0, square - 1);
      continue;
    }
    if (char == ',') {
      flush();
      continue;
    }
    if (startingLevel == null && char.trim().isNotEmpty) {
      startingLevel = curly - square;
    }
    token.write(char);
  }
  flush();
  return output;
}

List<_PromptTag> _parsePromptTags(String input) {
  final source = _normalizePromptSource(input);
  final output = <_PromptTag>[];
  var cursor = 0;
  for (final match in _numericScopePattern.allMatches(source)) {
    output.addAll(_parseTermList(source.substring(cursor, match.start), null));
    final weight = double.tryParse(match.group(1)!) ?? 1;
    output.addAll(_parseTermList(match.group(2)!, weight));
    cursor = match.end;
  }
  output.addAll(_parseTermList(source.substring(cursor), null));
  return output;
}

String _formatPromptTags(Iterable<_PromptTag> tags) => tags
    .map((tag) => '${_formatWeight(tag.weight)}::${tag.value} ::')
    .join(', ');

V5ArtistWeightRepairResult _createRepairResult(List<_PromptTag> tags) {
  final artistTagCount = tags.where((tag) => tag.kind == 'artist').length;
  final qualityTagCount = tags.where((tag) => tag.kind == 'quality').length;
  return V5ArtistWeightRepairResult(
    output: _formatPromptTags(tags),
    adjustedWeightedGroups: tags.where((tag) => tag.sourceWeighted).length,
    wrappedUnweightedArtists:
        tags.where((tag) => tag.kind == 'artist' && !tag.sourceWeighted).length,
    totalAdjusted: tags.length,
    artistTagCount: artistTagCount,
    qualityTagCount: qualityTagCount,
    otherTagCount: tags.length - artistTagCount - qualityTagCount,
  );
}

double _normalizedRandomSample(double Function() random) {
  final value = random();
  return value.isFinite ? value.clamp(0, 1).toDouble() : .5;
}

double _randomRepairMultiplier(double Function() random) =>
    minV5ArtistRepairMultiplier +
    _normalizedRandomSample(random) *
        (maxV5ArtistRepairMultiplier - minV5ArtistRepairMultiplier);

List<_PromptTag> _migratePromptTags(
  List<_PromptTag> tags,
  double Function() random, {
  ({double min, double max})? bounds,
}) =>
    tags.map((tag) {
      var migrated = tag.weight * _randomRepairMultiplier(random);
      if (bounds != null) migrated = migrated.clamp(bounds.min, bounds.max);
      return tag.copyWithWeight((migrated * 100).round() / 100);
    }).toList();

ArtistRecipe _recipeFromTags(
  List<_PromptTag> tags,
  int index,
  String idPrefix,
) {
  final prompt = _formatPromptTags(tags);
  final artists = tags
      .where((tag) => tag.kind == 'artist')
      .map((tag) => canonicalArtistTagName(
            tag.value.replaceFirst(
              RegExp(r'^artist\s*:', caseSensitive: false),
              '',
            ),
          ))
      .where((name) => name.isNotEmpty)
      .toList();
  final id = '$idPrefix-${index + 1}-${DateTime.now().microsecondsSinceEpoch}';
  return ArtistRecipe(
    id,
    prompt,
    artists,
    basePrompt: prompt,
    artistPrompt: prompt,
    pairId: id,
    variant: 'plain',
  );
}

/// Normalizes every valid prompt tag into explicit NovelAI numerical syntax.
V5ArtistWeightRepairResult normalizeV45ArtistSyntax(String input) =>
    _createRepairResult(_parsePromptTags(input));

/// Applies an independent community-derived multiplier in [1/3, 1/2] to every
/// valid tag. Only artist classification controls whether artist: is added.
V5ArtistWeightRepairResult repairV45ArtistWeightsForV5(
  String input, {
  double Function()? random,
}) {
  final secureRandom = random == null ? Random.secure() : null;
  final randomValue = random ?? secureRandom!.nextDouble;
  final tags = _migratePromptTags(_parsePromptTags(input), randomValue);
  return _createRepairResult(tags);
}

/// Creates several independently repaired complete strings for visual A/B
/// generation. Every candidate uses the same parser and migration rule.
List<ArtistRecipe> repairV45ArtistCandidatesForV5({
  required String input,
  required int count,
  int? drawSeed,
}) {
  final sourceTags = _parsePromptTags(input);
  if (sourceTags.isEmpty || count < 1) return const [];
  final random = Random(drawSeed);
  return List.generate(
    count,
    (index) => _recipeFromTags(
      _migratePromptTags(sourceTags, random.nextDouble),
      index,
      'v5-repair',
    ),
  );
}

({double min, double max}) _drawBounds(double first, double second) {
  final safeFirst = first.isFinite ? first.clamp(.05, 10).toDouble() : .2;
  final safeSecond = second.isFinite ? second.clamp(.05, 10).toDouble() : 1.2;
  return safeFirst <= safeSecond
      ? (min: safeFirst, max: safeSecond)
      : (min: safeSecond, max: safeFirst);
}

int countV5PromptTags(String input) => _parsePromptTags(input).length;

/// Rerolls every valid tag independently and retains the complete tag set in
/// every candidate. This is a weight draw, not a subset draw.
List<ArtistRecipe> drawAllV5ArtistWeights({
  required String input,
  required int count,
  double minWeight = defaultV5ArtistDrawMin,
  double maxWeight = defaultV5ArtistDrawMax,
  int? drawSeed,
}) {
  final sourceTags = _parsePromptTags(input);
  if (sourceTags.isEmpty || count < 1) return const [];

  final bounds = _drawBounds(minWeight, maxWeight);
  final random = Random(drawSeed);
  return List.generate(count, (index) {
    final tags = _migratePromptTags(
      sourceTags,
      random.nextDouble,
      bounds: bounds,
    );
    return _recipeFromTags(tags, index, 'v5-weight-${drawSeed ?? 0}');
  });
}

import 'dart:math';

class ArtistTagRecord {
  final int id;
  final String name;
  final int postCount;
  final bool deprecated;
  const ArtistTagRecord(this.id, this.name, this.postCount,
      {this.deprecated = false});

  factory ArtistTagRecord.fromJson(Map<String, dynamic> json) =>
      ArtistTagRecord(
        (json['id'] as num?)?.toInt() ?? 0,
        json['name']?.toString() ?? '',
        (json['post_count'] as num?)?.toInt() ?? 0,
        deprecated: json['is_deprecated'] == true || json['deprecated'] == true,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'post_count': postCount,
        'is_deprecated': deprecated,
      };
}

class ArtistRecipe {
  final String id;
  final String prompt;
  final String basePrompt;
  final String artistPrompt;
  final String pairId;
  final String variant;
  final List<String> artists;
  final List<StyleMutationTerm> mutations;
  final List<StyleMutationTerm> franchiseStyles;
  const ArtistRecipe(
    this.id,
    this.prompt,
    this.artists, {
    this.mutations = const [],
    this.franchiseStyles = const [],
    String? basePrompt,
    String? artistPrompt,
    String? pairId,
    this.variant = 'mutated',
  })  : basePrompt = basePrompt ?? prompt,
        artistPrompt = artistPrompt ?? basePrompt ?? prompt,
        pairId = pairId ?? id;

  Map<String, dynamic> toJson() => {
        'id': id,
        'prompt': prompt,
        'basePrompt': basePrompt,
        'artistPrompt': artistPrompt,
        'pairId': pairId,
        'variant': variant,
        'artists': artists,
        'mutations': mutations.map((item) => item.toJson()).toList(),
        'franchiseStyles':
            franchiseStyles.map((item) => item.toJson()).toList(),
      };

  factory ArtistRecipe.fromJson(Map<String, dynamic> json) => ArtistRecipe(
        json['id']?.toString() ?? '',
        json['prompt']?.toString() ?? '',
        (json['artists'] as List? ?? const [])
            .map((item) => item.toString())
            .toList(),
        mutations: (json['mutations'] as List? ?? const [])
            .whereType<Map>()
            .map((item) =>
                StyleMutationTerm.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        franchiseStyles: (json['franchiseStyles'] as List? ?? const [])
            .whereType<Map>()
            .map((item) =>
                StyleMutationTerm.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        basePrompt: json['basePrompt']?.toString(),
        artistPrompt: json['artistPrompt']?.toString(),
        pairId: json['pairId']?.toString(),
        variant: json['variant']?.toString() ??
            ((json['mutations'] as List? ?? const []).isEmpty
                ? 'plain'
                : 'mutated'),
      );
}

class StyleMutationTerm {
  final String category;
  final String value;
  final double weight;
  const StyleMutationTerm(this.category, this.value, this.weight);

  Map<String, dynamic> toJson() =>
      {'category': category, 'value': value, 'weight': weight};

  factory StyleMutationTerm.fromJson(Map<String, dynamic> json) =>
      StyleMutationTerm(
        json['category']?.toString() ?? 'artStyle',
        json['value']?.toString() ?? '',
        (json['weight'] as num?)?.toDouble() ?? 1,
      );
}

const styleMutationLibrary = <String, List<String>>{
  'artStyle': [
    'anime coloring',
    'anime screencap',
    'art nouveau',
    'baroque',
    'concept art',
    'contemporary',
    'cubism',
    'expressionism',
    'fantasy art',
    'game cg',
    'impressionism',
    'minimalism',
    'modernism',
    'pop art',
    'realism',
    'retro artstyle',
    'romanticism',
    'semi-realistic',
    'surrealism',
    'ukiyo-e',
    'visual novel art',
    'western comics',
    'storybook illustration',
    'editorial illustration',
    'poster art',
  ],
  'medium': [
    'acrylic paint',
    'airbrush',
    'charcoal drawing',
    'colored pencil',
    'digital painting',
    'fine lineart',
    'gouache',
    'graphite',
    'impasto',
    'ink (medium)',
    'ink wash',
    'marker',
    'oil painting (medium)',
    'pastel',
    'pencil sketch',
    'rough sketch',
    'thick lineart',
    'thin lineart',
    'visible brushstrokes',
    'watercolor (medium)',
    'woodcut',
    'cel shading',
    'soft shading',
    'painterly',
    'textured brush',
    'dry brush',
    'wet-on-wet',
    'stippling',
  ],
  'color': [
    'analogous colors',
    'black and white',
    'bright colors',
    'chromatic aberration',
    'colorful',
    'complementary colors',
    'cool color palette',
    'cyan and magenta',
    'dark colors',
    'desaturated',
    'duotone',
    'earth tones',
    'gradient',
    'high contrast',
    'limited palette',
    'low contrast',
    'monochrome',
    'muted colors',
    'neon colors',
    'pastel colors',
    'sepia',
    'split-complementary colors',
    'vibrant colors',
    'warm color palette',
    'blue and orange',
    'gold and white',
    'iridescent colors',
    'rainbow gradient',
  ],
  'lighting': [
    'ambient lighting',
    'backlighting',
    'bioluminescence',
    'blue hour',
    'bounced light',
    'chiaroscuro',
    'cinematic lighting',
    'dappled sunlight',
    'dramatic lighting',
    'edge lighting',
    'fill light',
    'firelight',
    'global illumination',
    'glowing light',
    'god rays',
    'golden hour',
    'hard lighting',
    'key light',
    'lens flare',
    'moonlight',
    'neon lighting',
    'overcast lighting',
    'rim lighting',
    'soft lighting',
    'spotlight',
    'studio lighting',
    'sunlight',
    'underlighting',
    'volumetric lighting',
    'window light',
  ],
  'atmosphere': [
    'atmospheric perspective',
    'cinematic atmosphere',
    'cozy atmosphere',
    'dreamy',
    'dust particles',
    'ethereal',
    'floating particles',
    'foggy',
    'hazy',
    'magical atmosphere',
    'melancholic',
    'misty',
    'moody',
    'mysterious',
    'nostalgic',
    'ominous atmosphere',
    'peaceful',
    'romantic atmosphere',
    'serene',
    'soft focus',
    'sparkles',
    'surreal atmosphere',
    'tranquil',
    'vignette',
    'whimsical',
    'windy atmosphere',
    'glowing dust',
    'humid atmosphere',
    'smoky atmosphere',
    'rainy atmosphere',
  ],
};

const franchiseStyleTagLibrary = <String>[
  'touhou',
  'kantai_collection',
  'blue_archive',
  'pokemon',
  'fate_(series)',
  'genshin_impact',
  'fate/grand_order',
  'idolmaster',
  'umamusume',
  'arknights',
  'vocaloid',
  'honkai_(series)',
  'azur_lane',
  'honkai:_star_rail',
  'love_live!',
  'fire_emblem',
  'zenless_zone_zero',
  'final_fantasy',
  'mahou_shoujo_madoka_magica',
  "girls'_frontline",
  'girls_und_panzer',
  'gundam',
  'danganronpa_(series)',
  'precure',
  'kemono_friends',
  'bang_dream!',
  'wuthering_waves',
  'jojo_no_kimyou_na_bouken',
  'one_piece',
  'honkai_impact_3rd',
];

const randomCustomTagLibrary = <String, List<String>>{
  'render3d': [
    '3d',
    '3d render',
    'cgi',
    'octane render',
    'unreal engine',
    'ray tracing',
  ],
  'lighting': [
    'cinematic lighting',
    'volumetric lighting',
    'rim lighting',
    'dramatic lighting',
    'depth of field',
    'high contrast',
  ],
  'quality': [
    'masterpiece',
    'best quality',
    'amazing quality',
    'very aesthetic',
    'absurdres',
    'highres',
  ],
  'atmosphere': [
    'atmospheric perspective',
    'dramatic atmosphere',
    'moody atmosphere',
    'fog',
    'glowing particles',
    'light rays',
  ],
};

int _weightedIndex(
    List<ArtistTagRecord> pool, Random random, Set<String> favorites) {
  final weights = pool
      .map((artist) =>
          sqrt(max(1, artist.postCount)) *
          (favorites.contains(artist.name) ? 4 : 1))
      .toList();
  final total = weights.fold<double>(0, (sum, value) => sum + value);
  var cursor = random.nextDouble() * total;
  for (var index = 0; index < weights.length; index++) {
    cursor -= weights[index];
    if (cursor <= 0) return index;
  }
  return weights.length - 1;
}

({double min, double max}) _normalizedWeightBounds(
  double first,
  double second,
) {
  final double safeFirst = first.isFinite ? first.clamp(.1, 10).toDouble() : .1;
  final double safeSecond =
      second.isFinite ? second.clamp(.1, 10).toDouble() : 10.0;
  return safeFirst <= safeSecond
      ? (min: safeFirst, max: safeSecond)
      : (min: safeSecond, max: safeFirst);
}

double _randomWeight(
  Random random,
  ({double min, double max}) bounds,
) {
  if (bounds.min == bounds.max) return bounds.min;
  final value = bounds.min + random.nextDouble() * (bounds.max - bounds.min);
  return (value * 100).round() / 100;
}

String _number(double value) => value == value.roundToDouble()
    ? value.toInt().toString()
    : value.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '');

const _artistTagAliases = <String, String>{
  'channel_(_caststation)': 'channel_(caststation)',
  'machi_(7769)': 'machi_(machi0910)',
};

String _normalizeCompatibilityAscii(String value) => String.fromCharCodes(
      value.runes.map((codePoint) {
        if (codePoint == 0x3000) return 0x20;
        if (codePoint >= 0xff01 && codePoint <= 0xff5e) {
          return codePoint - 0xfee0;
        }
        return codePoint;
      }),
    );

String canonicalArtistTagName(String raw) {
  final normalized = _normalizeCompatibilityAscii(raw)
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'\s+'), '_');
  return _artistTagAliases[normalized] ?? normalized;
}

String artistPromptWithTrailingComma(String value) {
  final normalized = value.trim().replaceFirst(RegExp(r',+$'), '');
  return normalized.isEmpty ? '' : '$normalized,';
}

String artistRecipeCardTagsWithTrailingComma(ArtistRecipe recipe) {
  final normalized = recipe.prompt.trim().replaceFirst(RegExp(r',+$'), '');
  return normalized.isEmpty ? '' : '$normalized,';
}

String fullArtistRecipePrompt(ArtistRecipe recipe, String basePrompt) {
  final artists = recipe.artistPrompt.trim().replaceFirst(RegExp(r',+$'), '');
  var auxiliary = recipe.basePrompt.trim();
  if (artists.isNotEmpty && auxiliary.startsWith(artists)) {
    auxiliary = auxiliary.substring(artists.length).trim();
    auxiliary = auxiliary.replaceFirst(RegExp(r'^,+\s*'), '');
  }
  final franchiseStyles = recipe.franchiseStyles
      .map((item) => '${_number(item.weight)}::${item.value} ::')
      .join(', ');
  if (franchiseStyles.isNotEmpty && auxiliary.startsWith(franchiseStyles)) {
    auxiliary = auxiliary.substring(franchiseStyles.length).trim();
    auxiliary = auxiliary.replaceFirst(RegExp(r'^,+\s*'), '');
  }
  final mutations = recipe.mutations
      .map((item) => '${_number(item.weight)}::${item.value} ::')
      .join(', ');
  return [artists, franchiseStyles, mutations, auxiliary, basePrompt.trim()]
      .where((item) => item.isNotEmpty)
      .join(', ');
}

List<String> parseCustomTagPoolValues(String input) {
  final seen = <String>{};
  return input
      .replaceAll(RegExp(r'[\r\n；;、，]+'), ',')
      .split(',')
      .map((item) {
        var value = item.trim();
        final numeric = RegExp(
          r'^[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*::\s*([\s\S]*?)\s*::\s*$',
        ).firstMatch(value);
        if (numeric != null) value = numeric.group(1)!.trim();
        while (value.startsWith('::')) {
          value = value.substring(2).trimLeft();
        }
        while (value.endsWith('::')) {
          value = value.substring(0, value.length - 2).trimRight();
        }
        return value;
      })
      .where((item) => item.isNotEmpty)
      .where((item) => seen.add(item.toLowerCase()))
      .toList();
}

String toggleCustomTagInPool(String input, String tag) {
  final values = parseCustomTagPoolValues(input);
  final target = tag.trim().toLowerCase();
  final selected = values.any((value) => value.toLowerCase() == target);
  final next = selected
      ? values.where((value) => value.toLowerCase() != target).toList()
      : [...values, tag.trim()];
  return next.join(', ');
}

List<int> artistGenerationSeeds({
  required int groupCount,
  required int variantsPerGroup,
  required bool fixed,
  required int fixedSeed,
  required int entropySeed,
}) {
  if (groupCount < 1 || variantsPerGroup < 1) return const [];
  final normalizedFixed = fixedSeed.clamp(1, 0x7fffffff).toInt();
  if (fixed) {
    return List.filled(groupCount * variantsPerGroup, normalizedFixed);
  }
  final random = Random(entropySeed);
  final used = <int>{};
  final output = <int>[];
  for (var group = 0; group < groupCount; group++) {
    var seed = random.nextInt(0x7fffffff) + 1;
    while (!used.add(seed)) {
      seed = random.nextInt(0x7fffffff) + 1;
    }
    output.addAll(List.filled(variantsPerGroup, seed));
  }
  return output;
}

List<ArtistRecipe> randomizeArtistWeights({
  required String artistPrompt,
  required int count,
  double variationPercent = 20,
  required int drawSeed,
}) {
  final pattern = RegExp(
    r'^\s*(?:(\d+(?:\.\d+)?)\s*::\s*)?artist\s*:\s*(.*?)\s*(?:::)?\s*$',
    caseSensitive: false,
  );
  final source = artistPrompt
      .replaceAll('，', ',')
      .split(',')
      .map((token) => pattern.firstMatch(token.trim()))
      .whereType<RegExpMatch>()
      .map((match) => (
            canonicalArtistTagName(
              match.group(2)!.replaceFirst(RegExp(r'\s*::$'), ''),
            ),
            double.tryParse(match.group(1) ?? '') ?? 1.0,
          ))
      .where((entry) => entry.$1.isNotEmpty && entry.$2 > 0)
      .toList();
  if (source.isEmpty || count < 1) return const [];
  final random = Random(drawSeed);
  final ratio = variationPercent.clamp(0, 100) / 100;
  return List.generate(count, (index) {
    final tokens = source.map((entry) {
      final factor = 1 + (random.nextDouble() * 2 - 1) * ratio;
      final weight = (entry.$2 * factor).clamp(.1, 10).toDouble();
      return '${_number((weight * 100).round() / 100)}::artist:${entry.$1} ::';
    }).toList();
    final prompt = tokens.join(', ');
    return ArtistRecipe(
      'weight-$drawSeed-$index',
      prompt,
      source.map((entry) => entry.$1).toList(),
      basePrompt: prompt,
      artistPrompt: prompt,
      pairId: 'weight-$drawSeed-$index',
      variant: 'plain',
    );
  });
}

List<StyleMutationTerm> _drawMutations(
  Random random, [
  List<StyleMutationTerm> favoriteMutations = const [],
]) {
  final categories = styleMutationLibrary.keys.toList();
  final preferred = favoriteMutations
      .where((item) =>
          styleMutationLibrary.containsKey(item.category) &&
          item.value.trim().isNotEmpty &&
          item.weight.isFinite)
      .toList();
  final count = 2 + random.nextInt(5);
  final values = <String>{};
  final output = <StyleMutationTerm>[];
  while (output.length < count) {
    final availablePreferred =
        preferred.where((item) => !values.contains(item.value)).toList();
    final favorite = availablePreferred.isNotEmpty && random.nextDouble() < .6
        ? availablePreferred[random.nextInt(availablePreferred.length)]
        : null;
    final category =
        favorite?.category ?? categories[random.nextInt(categories.length)];
    final terms = styleMutationLibrary[category]!;
    final value = favorite?.value ?? terms[random.nextInt(terms.length)];
    if (!values.add(value)) continue;
    final weight = favorite?.weight.clamp(.3, 1.5).toDouble() ??
        (.3 + random.nextInt(13) / 10);
    output.add(StyleMutationTerm(category, value, weight));
  }
  return output;
}

List<ArtistRecipe> drawArtistRecipes({
  required List<ArtistTagRecord> pool,
  required int count,
  int minArtists = 3,
  int maxArtists = 7,
  required int drawSeed,
  double minArtistWeight = .2,
  double maxArtistWeight = 1.2,
  String auxiliary = '',
  String customTagPool = '',
  double minCustomTagWeight = .2,
  double maxCustomTagWeight = 1.2,
  bool mutateAuxiliary = false,
  bool includeFranchiseStyles = false,
  int minFranchiseStyles = 0,
  int maxFranchiseStyles = 2,
  double minFranchiseWeight = .15,
  double maxFranchiseWeight = .8,
  Set<String> favorites = const {},
  List<StyleMutationTerm> favoriteMutations = const [],
}) {
  if (pool.isEmpty || count < 1) return const [];
  final random = Random(drawSeed);
  final artistLimit = min(20, pool.length);
  final firstArtistCount = minArtists.clamp(1, artistLimit).toInt();
  final secondArtistCount = maxArtists.clamp(1, artistLimit).toInt();
  final lower = min(firstArtistCount, secondArtistCount);
  final upper = max(firstArtistCount, secondArtistCount);
  final artistWeightBounds =
      _normalizedWeightBounds(minArtistWeight, maxArtistWeight);
  final firstFranchiseCount = minFranchiseStyles.clamp(0, 20).toInt();
  final secondFranchiseCount = maxFranchiseStyles.clamp(0, 20).toInt();
  final franchiseLower = min(firstFranchiseCount, secondFranchiseCount);
  final franchiseUpper = max(firstFranchiseCount, secondFranchiseCount);
  final franchiseWeightBounds =
      _normalizedWeightBounds(minFranchiseWeight, maxFranchiseWeight);
  final availableCustomTags = parseCustomTagPoolValues(customTagPool);
  final customTagWeightBounds =
      _normalizedWeightBounds(minCustomTagWeight, maxCustomTagWeight);
  final output = <ArtistRecipe>[];
  final seen = <String>{};
  var attempts = 0;
  while (output.length < count && attempts++ < count * 100) {
    final length = lower + random.nextInt(upper - lower + 1);
    final available = [...pool];
    final selected = <ArtistTagRecord>[];
    while (selected.length < length && available.isNotEmpty) {
      final index = _weightedIndex(available, random, favorites);
      selected.add(available.removeAt(index));
    }
    final artistTokens = <String>[];
    for (final artist in selected) {
      artistTokens.add(
          '${_number(_randomWeight(random, artistWeightBounds))}::artist:${canonicalArtistTagName(artist.name)} ::');
    }
    final tokens = <String>[...artistTokens];
    final franchiseStyles = <StyleMutationTerm>[];
    if (includeFranchiseStyles) {
      final franchiseCount =
          franchiseLower + random.nextInt(franchiseUpper - franchiseLower + 1);
      final availableFranchises = [...franchiseStyleTagLibrary]
        ..shuffle(random);
      for (final value in availableFranchises.take(franchiseCount)) {
        franchiseStyles.add(StyleMutationTerm(
          'franchiseStyle',
          value,
          _randomWeight(random, franchiseWeightBounds),
        ));
      }
      tokens.addAll(franchiseStyles
          .map((item) => '${_number(item.weight)}::${item.value} ::'));
    }
    if (availableCustomTags.isNotEmpty) {
      tokens.addAll(availableCustomTags.map((value) =>
          '${_number(_randomWeight(random, customTagWeightBounds))}::$value ::'));
    }
    final auxiliaryTokens = auxiliary
        .split(RegExp(r'[,，]'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty);
    tokens.addAll(auxiliaryTokens);
    final basePrompt = tokens.join(', ');
    final mutations = mutateAuxiliary
        ? _drawMutations(random, favoriteMutations)
        : const <StyleMutationTerm>[];
    tokens.addAll(
        mutations.map((item) => '${_number(item.weight)}::${item.value} ::'));
    final prompt = tokens.join(', ');
    if (!seen.add(prompt)) continue;
    final id =
        '$drawSeed-${output.length}-${selected.map((item) => item.name).join('+')}';
    output.add(ArtistRecipe(
      id,
      prompt,
      selected.map((item) => item.name).toList(),
      mutations: mutations,
      franchiseStyles: franchiseStyles,
      basePrompt: basePrompt,
      artistPrompt: artistTokens.join(', '),
      pairId: id,
      variant: mutations.isEmpty ? 'plain' : 'mutated',
    ));
  }
  return output;
}

List<ArtistRecipe> expandArtistRecipeComparisons(
  List<ArtistRecipe> recipes,
  bool compareMutations,
) =>
    recipes.expand((recipe) {
      final plain = ArtistRecipe(
        '${recipe.id}-plain',
        recipe.basePrompt,
        recipe.artists,
        mutations: const [],
        franchiseStyles: recipe.franchiseStyles,
        basePrompt: recipe.basePrompt,
        artistPrompt: recipe.artistPrompt,
        pairId: recipe.id,
        variant: 'plain',
      );
      if (!compareMutations || recipe.mutations.isEmpty) {
        return <ArtistRecipe>[plain];
      }
      return <ArtistRecipe>[
        plain,
        ArtistRecipe(
          '${recipe.id}-mutated',
          recipe.prompt,
          recipe.artists,
          mutations: recipe.mutations,
          franchiseStyles: recipe.franchiseStyles,
          basePrompt: recipe.basePrompt,
          artistPrompt: recipe.artistPrompt,
          pairId: recipe.id,
          variant: 'mutated',
        ),
      ];
    }).toList();

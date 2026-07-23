import 'dart:math';

class ArtistTagRecord {
  final int id;
  final String name;
  final int postCount;
  const ArtistTagRecord(this.id, this.name, this.postCount);

  factory ArtistTagRecord.fromJson(Map<String, dynamic> json) =>
      ArtistTagRecord(
        (json['id'] as num?)?.toInt() ?? 0,
        json['name']?.toString() ?? '',
        (json['post_count'] as num?)?.toInt() ?? 0,
      );

  Map<String, dynamic> toJson() =>
      {'id': id, 'name': name, 'post_count': postCount};
}

class ArtistRecipe {
  final String id;
  final String prompt;
  final List<String> artists;
  final List<StyleMutationTerm> mutations;
  const ArtistRecipe(this.id, this.prompt, this.artists,
      [this.mutations = const []]);

  Map<String, dynamic> toJson() => {
        'id': id,
        'prompt': prompt,
        'artists': artists,
        'mutations': mutations.map((item) => item.toJson()).toList(),
      };

  factory ArtistRecipe.fromJson(Map<String, dynamic> json) => ArtistRecipe(
        json['id']?.toString() ?? '',
        json['prompt']?.toString() ?? '',
        (json['artists'] as List? ?? const [])
            .map((item) => item.toString())
            .toList(),
        (json['mutations'] as List? ?? const [])
            .whereType<Map>()
            .map((item) =>
                StyleMutationTerm.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
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
    'visual novel',
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
    'ink',
    'ink wash',
    'marker',
    'oil painting',
    'pastel',
    'pencil sketch',
    'rough sketch',
    'thick lineart',
    'thin lineart',
    'visible brushstrokes',
    'watercolor',
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

double _weight(int index, int length, Random random) {
  if (index == 0) {
    const values = [1.1, 1.2, 1.35, 1.5, 1.7, 2.0, 2.5, 3.0, 4.0];
    return values[random.nextInt(values.length)];
  }
  if (index >= length - max(1, (length * .25).round())) {
    const values = [.2, .3, .4, .5, .6];
    return values[random.nextInt(values.length)];
  }
  const values = [.65, .75, .85, .9, 1.0, 1.1, 1.2];
  return values[random.nextInt(values.length)];
}

String _number(double value) => value == value.roundToDouble()
    ? value.toInt().toString()
    : value.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '');

List<StyleMutationTerm> _drawMutations(Random random) {
  final categories = styleMutationLibrary.keys.toList();
  final count = 2 + random.nextInt(5);
  final values = <String>{};
  final output = <StyleMutationTerm>[];
  while (output.length < count) {
    final category = categories[random.nextInt(categories.length)];
    final terms = styleMutationLibrary[category]!;
    final value = terms[random.nextInt(terms.length)];
    if (!values.add(value)) continue;
    final weight = .3 + random.nextInt(13) / 10;
    output.add(StyleMutationTerm(category, value, weight));
  }
  return output;
}

List<ArtistRecipe> drawArtistRecipes({
  required List<ArtistTagRecord> pool,
  required int count,
  required int minArtists,
  required int maxArtists,
  required int drawSeed,
  String auxiliary = '',
  bool mutateAuxiliary = false,
  Set<String> favorites = const {},
}) {
  if (pool.isEmpty || count < 1) return const [];
  final random = Random(drawSeed);
  final lower = minArtists.clamp(1, 20).toInt();
  final upper = maxArtists.clamp(lower, min(20, pool.length)).toInt();
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
    final tokens = <String>[];
    for (var index = 0; index < selected.length; index++) {
      tokens.add(
          '${_number(_weight(index, selected.length, random))}::artist:${selected[index].name} ::');
    }
    final auxiliaryTokens = auxiliary
        .split(RegExp(r'[,，]'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty);
    tokens.addAll(auxiliaryTokens);
    final mutations =
        mutateAuxiliary ? _drawMutations(random) : const <StyleMutationTerm>[];
    tokens.addAll(
        mutations.map((item) => '${_number(item.weight)}::${item.value} ::'));
    final prompt = tokens.join(', ');
    if (!seen.add(prompt)) continue;
    output.add(ArtistRecipe(
      '$drawSeed-${output.length}-${selected.map((item) => item.name).join('+')}',
      prompt,
      selected.map((item) => item.name).toList(),
      mutations,
    ));
  }
  return output;
}

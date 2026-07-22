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
  const ArtistRecipe(this.id, this.prompt, this.artists);
}

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
  final lower = minArtists.clamp(1, 24).toInt();
  final upper = maxArtists.clamp(lower, min(24, pool.length)).toInt();
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
        .where((item) => item.isNotEmpty)
        .where((_) => !mutateAuxiliary || random.nextDouble() >= .12);
    tokens.addAll(auxiliaryTokens);
    final prompt = tokens.join(', ');
    if (!seen.add(prompt)) continue;
    output.add(ArtistRecipe(
      '$drawSeed-${output.length}-${selected.map((item) => item.name).join('+')}',
      prompt,
      selected.map((item) => item.name).toList(),
    ));
  }
  return output;
}

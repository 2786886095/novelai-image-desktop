import 'dart:math' as math;

String drawStyleTags(List<String> tags, List<String> pinned, int count,
    double min, double max, int seed) {
  var state = seed & 0xffffffff;
  if (state == 0) state = 0x6d2b79f5;
  double random() {
    state = (state ^ (state << 13)) & 0xffffffff;
    state = (state ^ (state >> 17)) & 0xffffffff;
    state = (state ^ (state << 5)) & 0xffffffff;
    return state / 4294967296;
  }

  final fixed = pinned.where(tags.contains).toSet().toList();
  final pool = tags.toSet().where((t) => !fixed.contains(t)).toList();
  final chosen = [...fixed];
  for (var i = 0; i < math.max(0, math.min(pool.length, count)); i++) {
    final at = i + (random() * (pool.length - i)).floor();
    final t = pool[i];
    pool[i] = pool[at];
    pool[at] = t;
    chosen.add(pool[i]);
  }
  final low = math.max(0.0, math.min(3.0, math.min(min, max)));
  final high = math.max(low, math.min(3.0, math.max(min, max)));
  return chosen.map((tag) {
    final weight = ((low + random() * (high - low)) * 100).round() / 100;
    return '${weight.toStringAsFixed(2).replaceFirst(RegExp(r'\.?0+$'), '')}::$tag::';
  }).join(', ');
}

String appendStylePrompt(String base, String addition) {
  if (addition.trim().isEmpty) return base;
  return base.trim().isEmpty
      ? addition
      : '$base${base.trimRight().endsWith(',') ? ' ' : ', '}$addition';
}

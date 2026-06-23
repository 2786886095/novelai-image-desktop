import 'dart:convert';

import 'package:flutter/services.dart';

class CapsuleTag {
  final String tag;
  final String label;

  const CapsuleTag({required this.tag, required this.label});

  factory CapsuleTag.fromJson(Map<String, dynamic> json) => CapsuleTag(
        tag: json['en']?.toString() ?? '',
        label: json['zh']?.toString() ?? '',
      );
}

class CapsuleSubgroup {
  final String name;
  final List<CapsuleTag> tags;

  const CapsuleSubgroup({required this.name, required this.tags});

  factory CapsuleSubgroup.fromJson(Map<String, dynamic> json) =>
      CapsuleSubgroup(
        name: json['name']?.toString() ?? '',
        tags: (json['tags'] as List? ?? const [])
            .whereType<Map>()
            .map((item) => CapsuleTag.fromJson(Map<String, dynamic>.from(item)))
            .where((item) => item.tag.isNotEmpty)
            .toList(growable: false),
      );
}

class CapsuleCategory {
  final String name;
  final List<CapsuleSubgroup> subgroups;

  const CapsuleCategory({required this.name, required this.subgroups});

  bool get isNegative => name == '反向提示词';

  factory CapsuleCategory.fromJson(Map<String, dynamic> json) =>
      CapsuleCategory(
        name: json['name']?.toString() ?? '',
        subgroups: (json['subgroups'] as List? ?? const [])
            .whereType<Map>()
            .map((item) =>
                CapsuleSubgroup.fromJson(Map<String, dynamic>.from(item)))
            .where((item) => item.tags.isNotEmpty)
            .toList(growable: false),
      );
}

Future<List<CapsuleCategory>> loadCapsuleTaxonomy() async {
  final source = await rootBundle.loadString('assets/capsule_taxonomy.json');
  final decoded = jsonDecode(source);
  if (decoded is! List) return const [];
  return decoded
      .whereType<Map>()
      .map((item) => CapsuleCategory.fromJson(Map<String, dynamic>.from(item)))
      .where((item) => item.subgroups.isNotEmpty)
      .toList(growable: false);
}

// Flattened, de-duplicated capsule tags, cached after the first load so tag
// autocomplete can search the bundled 4000+ entries without any download.
List<CapsuleTag>? _flatCapsuleCache;

Future<List<CapsuleTag>> _flatCapsuleTags() async {
  final cached = _flatCapsuleCache;
  if (cached != null) return cached;
  final categories = await loadCapsuleTaxonomy();
  final flat = <CapsuleTag>[];
  final seen = <String>{};
  for (final category in categories) {
    for (final subgroup in category.subgroups) {
      for (final tag in subgroup.tags) {
        if (tag.tag.isNotEmpty && seen.add(tag.tag.toLowerCase())) {
          flat.add(tag);
        }
      }
    }
  }
  _flatCapsuleCache = flat;
  return flat;
}

/// Searches the bundled capsule taxonomy by English tag or Chinese label.
/// Exact > prefix > contains; works for both Latin and CJK queries.
Future<List<CapsuleTag>> searchCapsuleTags(String query, {int limit = 12}) async {
  final raw = query.trim();
  if (raw.isEmpty) return const [];
  final flat = await _flatCapsuleTags();
  final cjk = RegExp(r'[㐀-鿿]').hasMatch(raw);
  final normalized = raw.toLowerCase().replaceAll('_', ' ');
  final scored = <({CapsuleTag tag, int score})>[];
  for (final tag in flat) {
    var score = 0;
    if (cjk) {
      final label = tag.label;
      if (label == raw) {
        score = 3;
      } else if (label.startsWith(raw)) {
        score = 2;
      } else if (label.contains(raw)) {
        score = 1;
      }
    } else {
      final name = tag.tag.toLowerCase().replaceAll('_', ' ');
      if (name == normalized) {
        score = 3;
      } else if (name.startsWith(normalized)) {
        score = 2;
      } else if (name.contains(normalized)) {
        score = 1;
      }
    }
    if (score > 0) scored.add((tag: tag, score: score));
  }
  scored.sort((a, b) => b.score.compareTo(a.score));
  return scored.take(limit).map((item) => item.tag).toList();
}

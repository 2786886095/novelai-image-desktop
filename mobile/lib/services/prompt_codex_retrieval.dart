import 'dart:convert';

import 'package:flutter/services.dart';

import '../prompts/prompt_mode.dart';
import 'prompt_codex_service.dart';

class PromptCodexEnhancement {
  final List<PromptCodexMatch> matches;
  final String context;

  const PromptCodexEnhancement({required this.matches, required this.context});
}

class PromptCodexTagCandidate {
  final String tag;
  final String description;
  final int count;
  final String source;

  const PromptCodexTagCandidate({
    required this.tag,
    this.description = '',
    this.count = 0,
    this.source = '本地 Danbooru 标签库',
  });
}

class _GuidanceEntry {
  final String id;
  final String title;
  final String category;
  final List<String> keywords;
  final String text;
  final bool adult;
  final List<String> modes;
  final String source;

  const _GuidanceEntry({
    required this.id,
    required this.title,
    required this.category,
    required this.keywords,
    required this.text,
    required this.adult,
    required this.modes,
    required this.source,
  });

  factory _GuidanceEntry.fromJson(Map<String, dynamic> json) => _GuidanceEntry(
        id: json['id']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        category: json['category']?.toString() ?? '',
        keywords: (json['keywords'] as List? ?? const [])
            .map((item) => item.toString())
            .toList(growable: false),
        text: json['text']?.toString() ?? '',
        adult: json['adult'] == true,
        modes: (json['modes'] as List? ?? const [])
            .map((item) => item.toString())
            .toList(growable: false),
        source: json['source']?.toString() ?? '',
      );
}

class PromptCodexRetrievalService {
  static const _guidanceAsset = 'assets/prompt_codex_guidance.json';
  Future<List<_GuidanceEntry>>? _guidanceFuture;
  Future<PromptCodexSnapshot?>? _codexFuture;

  static const _adultRelevance = [
    '成人',
    '性爱',
    '性交',
    '裸体',
    '裸露',
    '乳头',
    '阴部',
    '内裤',
    '内衣',
    '丝袜',
    '连裤袜',
    '破损连裤袜',
    '大腿袜',
    '半脱',
    '提裙',
    '诱惑',
    '淫荡',
    '高潮',
    '口交',
    '自慰',
    '后入',
    '骑乘',
    'nsfw',
    'nude',
    'naked',
    'nipples',
    'pussy',
    'panties',
    'underwear',
    'pantyhose',
    'thighhighs',
    'sex',
    'fellatio',
    'masturbation',
    'orgasm',
    'doggystyle',
    'cowgirl',
    'seductive',
    'lewd'
  ];
  static const _alwaysGuidance = {
    'core-output',
    'canonical-tag-priority',
    'conflict-check'
  };

  Future<List<_GuidanceEntry>> _guidance() => _guidanceFuture ??= rootBundle
      .loadString(_guidanceAsset)
      .then((raw) => Map<String, dynamic>.from(jsonDecode(raw) as Map))
      .then((json) => (json['entries'] as List? ?? const [])
          .whereType<Map>()
          .map((item) =>
              _GuidanceEntry.fromJson(Map<String, dynamic>.from(item)))
          .toList(growable: false))
      .catchError((_) => <_GuidanceEntry>[]);

  Future<PromptCodexSnapshot?> _codex() => _codexFuture ??= PromptCodexService()
      .load()
      .then<PromptCodexSnapshot?>((snapshot) => snapshot)
      .catchError((_) => null);

  String _normalize(String value) => value
      .toLowerCase()
      .replaceAll(RegExp(r'[_\-]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  Set<String> _queryTerms(String value) {
    final text = _normalize(value);
    final terms = <String>{};
    for (final match in RegExp(r'[a-z0-9#]{2,}').allMatches(text)) {
      terms.add(match.group(0)!);
    }
    for (final match in RegExp(r'[\u4e00-\u9fff]{2,}').allMatches(text)) {
      final run = match.group(0)!;
      if (run.length <= 6) terms.add(run);
      for (var size = 2; size <= 4 && size <= run.length; size += 1) {
        for (var index = 0; index + size <= run.length; index += 1) {
          terms.add(run.substring(index, index + size));
        }
      }
    }
    return terms.take(180).toSet();
  }

  bool _containsAny(String value, List<String> triggers) {
    final text = _normalize(value);
    return triggers.any((trigger) => text.contains(_normalize(trigger)));
  }

  double _score(String query, Set<String> terms, List<String> fields) {
    final normalizedFields = fields.map(_normalize).toList(growable: false);
    final joined = normalizedFields.join('\n');
    var score = 0.0;
    final normalizedQuery = _normalize(query);
    if (normalizedQuery.length >= 3 && joined.contains(normalizedQuery)) {
      score += 60;
    }
    for (final term in terms) {
      if (!joined.contains(term)) continue;
      final isChinese = RegExp(r'[\u4e00-\u9fff]').hasMatch(term);
      score += isChinese
          ? (term.length * 3).clamp(0, 12)
          : (term.length / 2).clamp(2, 8);
      if (normalizedFields.isNotEmpty && normalizedFields[0].contains(term)) {
        score += 4;
      }
      if (normalizedFields.length > 1 && normalizedFields[1].contains(term)) {
        score += 3;
      }
    }
    return score;
  }

  String _excerpt(String value, [int limit = 260]) {
    final cleaned = value.replaceAll(RegExp(r'\s+'), ' ').trim();
    return cleaned.length <= limit
        ? cleaned
        : '${cleaned.substring(0, limit - 1)}…';
  }

  Future<PromptCodexEnhancement> retrieve(
    String query, {
    required String mode,
    required bool allowAdult,
    List<PromptCodexTagCandidate> matureTags = const [],
    int guidanceLimit = 6,
    int codexLimit = 5,
  }) async {
    final terms = _queryTerms(query);
    final adultRelevant = allowAdult && _containsAny(query, _adultRelevance);
    final guidance = await _guidance();
    final snapshot = await _codex();
    final bookNames = {
      for (final book in snapshot?.books ?? const <PromptCodexBook>[])
        book.id: book.title
    };

    final guidanceMatches = guidance
        .where((entry) => entry.modes.contains(mode))
        .where((entry) => !entry.adult || adultRelevant)
        .map((entry) {
          final normalizedQuery = _normalize(query);
          final keywordScore = entry.keywords.fold<double>(
              0,
              (total, keyword) => normalizedQuery.contains(_normalize(keyword))
                  ? total + 24
                  : total);
          final score = _score(query, terms,
                  [entry.title, entry.category, ...entry.keywords]) +
              keywordScore +
              (_alwaysGuidance.contains(entry.id) ? 12 : 0);
          return MapEntry(entry, score);
        })
        .where(
            (item) => _alwaysGuidance.contains(item.key.id) || item.value >= 10)
        .toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    final codexMatches = (snapshot?.entries ?? const <PromptCodexEntry>[])
        .where((entry) => !entry.adult || adultRelevant)
        .where((entry) => entry.category != 'artist')
        .map((entry) => MapEntry(
            entry,
            _score(query, terms,
                [entry.title, entry.section, entry.category, entry.prompt])))
        .where((item) => item.value >= 18)
        .toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    final seenTags = <String>{};
    final matureMatches = matureTags
        .where((candidate) {
          final key = _normalize(candidate.tag);
          return key.isNotEmpty && seenTags.add(key);
        })
        .take(12)
        .map((candidate) => PromptCodexMatch(
              id: 'danbooru:${candidate.tag}',
              title: candidate.tag.replaceAll('_', ' '),
              section: 'mature-tag',
              source: candidate.source,
              excerpt: [
                if (candidate.description.trim().isNotEmpty)
                  candidate.description.trim(),
                if (candidate.count > 0) '使用量 ${candidate.count}',
              ].join(' · '),
              adult: false,
              score: 1000.0 - seenTags.length,
            ));
    final matches = <PromptCodexMatch>[
      ...matureMatches,
      ...guidanceMatches.take(guidanceLimit).map((item) => PromptCodexMatch(
            id: 'guidance:${item.key.id}',
            title: item.key.title,
            section: item.key.category,
            source: item.key.source,
            excerpt: item.key.text,
            adult: item.key.adult,
            score: item.value,
          )),
      ...codexMatches.take(codexLimit).map((item) => PromptCodexMatch(
            id: 'codex:${item.key.id}',
            title: item.key.title,
            section: item.key.section,
            source: bookNames[item.key.bookId] ?? 'NovelAI 个人法典',
            excerpt: _excerpt(item.key.prompt),
            adult: item.key.adult,
            score: item.value,
          )),
    ];
    final mature =
        matches.where((item) => item.section == 'mature-tag').toList();
    final references =
        matches.where((item) => item.section != 'mature-tag').toList();
    final context = matches.isEmpty
        ? ''
        : [
            '【最高优先级：成熟整词】先判断下列成熟 Tag 是否能完整概括动作、姿态或构图。能用一个成熟 Tag 准确表达时，只使用该 Tag 一次，禁止再叠加它的拆解词、近义词或自然语言复述。只有单 Tag 缺少关键差异时，才用最少必要 Tag 补足。候选不贴合时必须舍弃，禁止硬套。',
            if (mature.isNotEmpty) '本地 Danbooru 成熟 Tag 候选：',
            if (mature.isNotEmpty)
              for (var index = 0; index < mature.length; index += 1)
                '${index + 1}. ${mature[index].title}${mature[index].excerpt.isEmpty ? '' : ' — ${mature[index].excerpt}'}'
            else
              '本次未命中可靠的本地成熟 Tag；请使用最短、无同义重复的基础组合。',
            '以下是本地 NovelAI 提示词法典按当前内容检索出的参考。它们只用于校正结构、补充准确 Tag 与避免冲突；不要无条件复制，不要加入画面中不存在的内容：',
            for (var index = 0; index < references.length; index += 1)
              '${index + 1}. [${references[index].title}｜${references[index].source}] ${references[index].excerpt}',
          ].join('\n');
    return PromptCodexEnhancement(matches: matches, context: context);
  }
}

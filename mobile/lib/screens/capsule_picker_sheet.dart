import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../prompts/capsule_data.dart';
import '../prompts/prompt_tools.dart';
import '../tags/multilingual_tag_packs.dart';
import '../ui/studio_dropdown.dart';
import '../i18n/app_locales.dart';
import '../tags/capsule_camera_terms.dart';

class CapsulePickerSheet extends StatefulWidget {
  const CapsulePickerSheet(
      {super.key,
      required this.categories,
      required this.onPick,
      this.fieldTags});
  // Non-null only when the picker edits one field rather than routing
  // positive and negative categories to distinct workbench prompts.
  final Iterable<String>? fieldTags;
  final List<CapsuleCategory> categories;
  final void Function(String, bool) onPick;
  @override
  State<CapsulePickerSheet> createState() => _PickerState();
}

// Browse aliases share the original tag lists; global search still uses the unmodified corpus.
List<CapsuleCategory> capsuleBrowseDirectory(List<CapsuleCategory> source) {
  final clothes = source.where((c) => c.name == '服饰').firstOrNull;
  return source.map((cat) {
    if (cat.name != '人物') return cat;
    final all = [...cat.subgroups, ...?clothes?.subgroups];
    final byName = {for (final g in all.reversed) g.name: g};
    final names = <String>{
      '对象',
      '体型',
      '上衣',
      '下装',
      '眼睛',
      '配饰',
      ...all.map((g) => g.name)
    };
    return CapsuleCategory(name: cat.name, subgroups: [
      for (final n in names)
        if (byName[n] case final g?) g
    ]);
  }).toList();
}

const _directoryLabels = {
  'zh-CN': ['分类浏览', '大类', '小类', '角色', '饰品', '全部小类', '收起', '全库列表'],
  'zh-TW': ['分類瀏覽', '大類', '小類', '角色', '飾品', '全部小類', '收合', '全庫列表'],
  'en-US': [
    'Browse categories',
    'Category',
    'Subcategory',
    'Character',
    'Accessories',
    'All subcategories',
    'Show less',
    'All tags'
  ],
  'ja-JP': [
    '分類から選ぶ',
    '大分類',
    '小分類',
    'キャラクター',
    'アクセサリー',
    'すべての小分類',
    '閉じる',
    '全タグ一覧'
  ],
  'ko-KR': ['분류별 탐색', '대분류', '소분류', '캐릭터', '장신구', '모든 소분류', '접기', '전체 태그 목록']
};

typedef _Page = ({List<TagPackHit> rows, int total});

class _PickerState extends State<CapsulePickerSheet> {
  final field = TextEditingController();
  bool expanded = false, library = false, allGroups = false;
  List<CapsuleCategory>? _source;
  List<CapsuleCategory> _directory = [];
  List<CapsuleCategory> get directory {
    if (!identical(_source, widget.categories)) {
      _source = widget.categories;
      _directory = capsuleBrowseDirectory(widget.categories);
    }
    return _directory;
  }

  int libPage = 0;
  int ci = 0, si = 0, curPage = 0, searchPage = 0;
  String order = 'relevance', query = '', stamp = '';
  Future<_Page>? data;
  Timer? timer;
  String tagKey(String s) => s.trim().toLowerCase().replaceAll(' ', '_');
  late final chosen =
      (widget.fieldTags ?? const <String>[]).map(tagKey).toSet();
  Future<List<RelatedPromptTag>>? related;
  @override
  void dispose() {
    timer?.cancel();
    field.dispose();
    super.dispose();
  }

  List<String> copy(String lang) => switch (lang) {
        'zh-CN' => [
            '搜索全库',
            '推荐顺序',
            '按使用量',
            '按名称',
            '上一页',
            '下一页',
            '跳转页码',
            '相关推荐',
            '完成',
            '没有匹配的标签',
            '重试'
          ],
        'zh-TW' => [
            '搜尋全庫',
            '推薦順序',
            '依使用量',
            '依名稱',
            '上一頁',
            '下一頁',
            '跳至頁碼',
            '相關推薦',
            '完成',
            '沒有符合的標籤',
            '重試'
          ],
        'ja-JP' => [
            '辞書全体を検索',
            'おすすめ順',
            '使用数順',
            '名前順',
            '前へ',
            '次へ',
            'ページへ移動',
            '関連タグ',
            '完了',
            '一致するタグがありません',
            '再試行'
          ],
        'ko-KR' => [
            '전체 사전 검색',
            '추천순',
            '사용량순',
            '이름순',
            '이전',
            '다음',
            '페이지 이동',
            '관련 태그',
            '완료',
            '일치하는 태그 없음',
            '다시 시도'
          ],
        _ => [
            'Search dictionary',
            'Recommended',
            'Most used',
            'Name',
            'Previous',
            'Next',
            'Go to page',
            'Related tags',
            'Done',
            'No matching tags',
            'Retry'
          ]
      };
  void input(String value) {
    timer?.cancel();
    final next = value.trim();
    setState(() {
      query = next;
      searchPage = 0;
      data = null;
      stamp = '';
    });
    if (next.isNotEmpty) {
      timer = Timer(const Duration(milliseconds: 170), () {
        if (mounted) setState(() => timer = null);
      });
    }
  }

  Future<_Page> load(AppState app, String lang, String q, String sort, int pg,
      int cat, int sub) async {
    final pack = app.multilingualTags, group = directory[cat].subgroups[sub];
    final fold = MultilingualTagPacks.key(q);
    final topic = <String>{};
    if (library && q.isEmpty) {
      final full = await pack.capsulePage(q, page: pg, sort: sort);
      if (full != null) return full;
    }
    if (q.isNotEmpty) {
      for (final c in widget.categories) {
        final whole = [c.name, localizedCapsuleCategoryName(lang, c.name)]
            .any((v) => MultilingualTagPacks.key(v) == fold);
        for (final g in c.subgroups) {
          if (whole ||
              [g.name, localizedCapsuleSubgroupName(lang, g.name)]
                  .any((v) => MultilingualTagPacks.key(v) == fold)) {
            topic.addAll(g.tags.map((t) => t.tag));
          }
        }
        if (c.name == '画面构图' &&
            ['构图', '構圖', '構図', 'framing', 'composition', '구도'].contains(fold)) {
          topic.addAll(c.subgroups.expand((g) => g.tags).map((t) => t.tag));
          topic.addAll(capsuleCameraTerms);
        }
      }
      final found =
          await pack.capsulePage(q, page: pg, sort: sort, topic: topic);
      if (found != null) return found;
    }
    final source = q.isEmpty
        ? group.tags
        : widget.categories.expand((c) => c.subgroups).expand((g) => g.tags);
    final hits =
        q.isEmpty ? await pack.lookupExact(source.map((t) => t.tag)) : null;
    final labels = {
      for (final h in hits ?? <TagPackExactHit>[]) h.query: h.entry
    };
    final rows = <String, TagPackHit>{};
    for (final t in source) {
      final k = MultilingualTagPacks.key(t.tag), known = labels[k];
      final label = known?.description ??
          localizedTagLabel(lang, t.tag, sourceLabel: t.label);
      if (q.isEmpty ||
          k.contains(fold) ||
          MultilingualTagPacks.key(label).contains(fold) ||
          topic.contains(t.tag)) {
        rows.putIfAbsent(
            k,
            () => (
                  tag: t.tag,
                  description: label,
                  count: known?.count ?? 0,
                  category: 0
                ));
      }
    }
    if (q.isNotEmpty) {
      for (final hit in await app.suggestTags(q)) {
        rows[MultilingualTagPacks.key(hit.tag)] = (
          tag: hit.tag,
          description: hit.description ?? '',
          count: hit.count,
          category: 0
        );
      }
    }
    final list = rows.values.toList();
    int rank(TagPackHit h) {
      final terms = [
        MultilingualTagPacks.key(h.tag),
        MultilingualTagPacks.key(h.description)
      ];
      return terms.contains(fold)
          ? 0
          : terms.any((s) => s.startsWith(fold))
              ? 1
              : terms.any((s) => s.contains(fold))
                  ? 2
                  : 3;
    }

    if (sort != 'relevance' || q.isNotEmpty) {
      list.sort((a, b) {
        final r = sort == 'relevance' ? rank(a).compareTo(rank(b)) : 0;
        final n = sort == 'alpha' ? 0 : b.count.compareTo(a.count);
        return r != 0
            ? r
            : n != 0
                ? n
                : a.tag.compareTo(b.tag);
      });
    }
    return (
      total: list.length,
      rows: q.isEmpty && expanded ? list : list.skip(pg * 24).take(24).toList()
    );
  }

  Future<void> jump(
      int page, int pages, String label, void Function(int) change) async {
    String value = '${page + 1}';
    final next = await showDialog<int>(
        context: context,
        builder: (ctx) => AlertDialog(
                title: Text('$label (1–$pages)'),
                content: TextFormField(
                    initialValue: value,
                    autofocus: true,
                    keyboardType: TextInputType.number,
                    onChanged: (s) => value = s,
                    onFieldSubmitted: (s) =>
                        Navigator.pop(ctx, int.tryParse(s))),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(ctx, int.tryParse(value)),
                      child: Text(MaterialLocalizations.of(ctx).okButtonLabel))
                ]));
    if (mounted && next != null) change(next.clamp(1, pages) - 1);
  }

  Widget chips(List<Widget> items) => SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(children: [
        for (final item in items)
          Padding(padding: const EdgeInsets.only(right: 6), child: item)
      ]));
  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>(), lang = app.settings.language;
    final c = directory[ci], l = copy(lang);
    final nav = _directoryLabels[lang] ?? _directoryLabels['en-US']!;
    String catName(CapsuleCategory c) =>
        c.name == '人物' ? nav[3] : localizedCapsuleCategoryName(lang, c.name);
    String subName(CapsuleSubgroup g) =>
        g.name == '配饰' ? nav[4] : localizedCapsuleSubgroupName(lang, g.name);
    final quick = <int>{
      ...List.generate(c.subgroups.length.clamp(0, 6), (i) => i),
      si
    };
    void selectSub(int i) => setState(() {
          si = i;
          curPage = 0;
          expanded = false;
          allGroups = false;
        });
    final p = query.isEmpty ? (library ? libPage : curPage) : searchPage;
    void change(int v) => setState(() {
          if (query.isEmpty) {
            if (library) {
              libPage = v;
            } else {
              curPage = v;
            }
          } else {
            searchPage = v;
          }
        });
    void pick(String tag) {
      if (widget.fieldTags != null && chosen.contains(tagKey(tag))) return;
      widget.onPick(
          tag.replaceAll('_', ' '), c.isNegative && query.isEmpty && !library);
      setState(() {
        chosen.add(tagKey(tag));
        related = app.suggestRelatedPromptTags(chosen.join(', '));
      });
    }

    return ListenableBuilder(
        listenable: app.multilingualTags,
        builder: (context, _) {
          final key = [
            app.multilingualTags.active,
            lang,
            expanded,
            library,
            ci,
            si,
            query,
            order,
            p
          ].join('|');
          if (stamp != key &&
              !(query.isNotEmpty && (timer?.isActive ?? false))) {
            stamp = key;
            data = load(app, lang, query, order, p, ci, si);
          }
          return SafeArea(
              child: SizedBox(
                  height: MediaQuery.sizeOf(context).height * .84,
                  child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Column(children: [
                        Row(children: [
                          Expanded(
                              child: Text(
                                  generateScreenTextFor(lang)
                                      .inspirationCapsules,
                                  style:
                                      Theme.of(context).textTheme.titleMedium)),
                          TextButton(
                              onPressed: () => Navigator.pop(context),
                              child: Text(l[8]))
                        ]),
                        TextField(
                            controller: field,
                            decoration: InputDecoration(
                                labelText: l[0],
                                prefixIcon: const Icon(Icons.search),
                                suffixIcon: query.isEmpty
                                    ? null
                                    : IconButton(
                                        icon: const Icon(Icons.clear),
                                        onPressed: () {
                                          field.clear();
                                          input('');
                                        })),
                            onChanged: input),
                        Expanded(
                            child: ListView(
                                key: ValueKey(
                                    [ci, si, p, query.isEmpty].join('/')),
                                children: [
                              if (query.isEmpty &&
                                  app.multilingualTags.active != null)
                                Wrap(spacing: 6, children: [
                                  for (final mode in [false, true])
                                    ChoiceChip(
                                        label: Text(mode ? nav[7] : nav[0]),
                                        selected: library == mode,
                                        onSelected: (_) =>
                                            setState(() => library = mode))
                                ]),
                              if (query.isEmpty && !library) ...[
                                Row(children: [
                                  Text(nav[1]),
                                  const SizedBox(width: 12),
                                  Expanded(
                                      child: StudioDropdownButton<int>(
                                          key: const ValueKey(
                                              'capsule-main-category'),
                                          value: ci,
                                          isExpanded: true,
                                          items: [
                                            for (final (i, x)
                                                in directory.indexed)
                                              DropdownMenuItem(
                                                  value: i,
                                                  child: Text(catName(x),
                                                      overflow: TextOverflow
                                                          .ellipsis))
                                          ],
                                          onChanged: (i) {
                                            if (i != null)
                                              setState(() {
                                                ci = i;
                                                si = 0;
                                                curPage = 0;
                                                expanded = false;
                                                allGroups = false;
                                              });
                                          }))
                                ]),
                                Align(
                                    alignment: AlignmentDirectional.centerStart,
                                    child: Text(
                                        nav[2] +
                                            ' · ' +
                                            catName(c) +
                                            ' › ' +
                                            subName(c.subgroups[si]),
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleSmall)),
                                Wrap(spacing: 6, runSpacing: 2, children: [
                                  for (final (i, g) in c.subgroups.indexed)
                                    if (allGroups || quick.contains(i))
                                      ChoiceChip(
                                          key: ValueKey('capsule-subgroup:' +
                                              c.name +
                                              ':' +
                                              g.name),
                                          label: Text(subName(g)),
                                          selected: si == i,
                                          onSelected: (_) => selectSub(i))
                                ]),
                                if (c.subgroups.length > quick.length)
                                  Align(
                                      alignment:
                                          AlignmentDirectional.centerStart,
                                      child: TextButton(
                                          key: const ValueKey(
                                              'capsule-subgroups-more'),
                                          onPressed: () => setState(
                                              () => allGroups = !allGroups),
                                          child: Text(allGroups
                                              ? nav[6]
                                              : nav[5] +
                                                  ' (' +
                                                  c.subgroups.length
                                                      .toString() +
                                                  ')'))),
                              ],
                              Align(
                                  alignment: Alignment.centerRight,
                                  child: StudioDropdownButton<String>(
                                      value: order,
                                      items: [
                                        for (final (i, v) in [
                                          'relevance',
                                          'usage',
                                          'alpha'
                                        ].indexed)
                                          DropdownMenuItem(
                                              value: v, child: Text(l[i + 1]))
                                      ],
                                      onChanged: (v) {
                                        if (v != null) {
                                          setState(() {
                                            order = v;
                                            if (query.isEmpty) {
                                              curPage = 0;
                                            } else {
                                              searchPage = 0;
                                            }
                                          });
                                        }
                                      })),
                              FutureBuilder<_Page>(
                                  key: ValueKey('pager-$key'),
                                  future: data,
                                  builder: (context, s) {
                                    final pages =
                                        ((s.data?.total ?? 0) + 23) ~/ 24;
                                    if (pages <= 1 ||
                                        (!library &&
                                            query.isEmpty &&
                                            expanded)) {
                                      return const SizedBox.shrink();
                                    }
                                    return Row(
                                        mainAxisAlignment:
                                            MainAxisAlignment.center,
                                        children: [
                                          IconButton(
                                              tooltip: l[4],
                                              onPressed: p == 0
                                                  ? null
                                                  : () => change(p - 1),
                                              icon: const Icon(
                                                  Icons.chevron_left)),
                                          TextButton(
                                              onPressed: () =>
                                                  jump(p, pages, l[6], change),
                                              child: Text('${p + 1} / $pages')),
                                          IconButton(
                                              tooltip: l[5],
                                              onPressed: p + 1 >= pages
                                                  ? null
                                                  : () => change(p + 1),
                                              icon: const Icon(
                                                  Icons.chevron_right))
                                        ]);
                                  }),
                              FutureBuilder<_Page>(
                                  key: ValueKey(key),
                                  future: data,
                                  builder: (context, s) {
                                    if (s.hasError) {
                                      return TextButton(
                                          onPressed: () =>
                                              setState(() => stamp = ''),
                                          child: Text(l[10]));
                                    }
                                    if (!s.hasData) {
                                      return const LinearProgressIndicator();
                                    }
                                    final rows = s.requireData.rows,
                                        pages =
                                            (s.requireData.total + 23) ~/ 24;
                                    return Column(children: [
                                      if (query.isEmpty && !library)
                                        TextButton(
                                            onPressed: pages > 1
                                                ? () => setState(
                                                    () => expanded = !expanded)
                                                : null,
                                            child: Text(
                                                '${subName(c.subgroups[si])} · ${s.requireData.total}${pages > 1 ? (expanded ? ' ▴' : ' ▾') : ''}')),
                                      if (rows.isEmpty)
                                        Text(l[9])
                                      else
                                        Wrap(
                                            spacing: 6,
                                            runSpacing: 4,
                                            children: [
                                              for (final t in rows)
                                                ActionChip(
                                                    key: ValueKey(
                                                        'capsule-tag:${t.tag}'),
                                                    avatar: chosen.contains(
                                                            tagKey(t.tag))
                                                        ? const Icon(
                                                            Icons.check,
                                                            size: 16)
                                                        : null,
                                                    label: Text(t.description
                                                                .isEmpty ||
                                                            t.description ==
                                                                t.tag
                                                        ? t.tag
                                                        : '${t.description} · ${t.tag}'),
                                                    onPressed: () =>
                                                        pick(t.tag))
                                            ]),
                                    ]);
                                  }),
                              if (related != null)
                                FutureBuilder<List<RelatedPromptTag>>(
                                    future: related,
                                    builder: (context, s) {
                                      final items = (s.data ?? []).where((t) =>
                                          !chosen.contains(tagKey(t.tag)));
                                      return items.isEmpty
                                          ? const SizedBox.shrink()
                                          : Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                  Text(l[7]),
                                                  chips([
                                                    for (final t in items)
                                                      ActionChip(
                                                          label: Text(t
                                                                  .description
                                                                  .isEmpty
                                                              ? t.tag
                                                              : '${t.description} · ${t.tag}'),
                                                          onPressed: () =>
                                                              pick(t.tag))
                                                  ])
                                                ]);
                                    }),
                            ]))
                      ]))));
        });
  }
}

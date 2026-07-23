import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/prompt_codex_service.dart';
import '../state/app_state.dart';

class PromptCodexScreen extends StatefulWidget {
  final VoidCallback onBack;
  final PromptCodexService? service;
  const PromptCodexScreen({super.key, required this.onBack, this.service});

  @override
  State<PromptCodexScreen> createState() => _PromptCodexScreenState();
}

class _PromptCodexScreenState extends State<PromptCodexScreen> {
  late final PromptCodexService _service =
      widget.service ?? PromptCodexService();
  final _search = TextEditingController();
  PromptCodexSnapshot? _snapshot;
  String _book = 'regular';
  String _category = 'all';
  String _section = 'all';
  bool _updating = false;
  String _message = '';
  String _query = '';
  int _limit = 100;
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final snapshot = await _service.load();
      if (mounted) setState(() => _snapshot = snapshot);
    } catch (error) {
      if (mounted) setState(() => _message = '$error');
    }
  }

  Future<void> _update() async {
    setState(() {
      _updating = true;
      _message = '';
    });
    try {
      final snapshot = await _service.update();
      if (!mounted) return;
      setState(() {
        _snapshot = snapshot;
        _message = '${_text()['updated']} · ${snapshot.entries.length}';
      });
    } catch (error) {
      if (mounted) setState(() => _message = '$error');
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  String get _language => context.read<AppState>().settings.language;

  Map<String, String> _text() {
    switch (_language) {
      case 'zh-TW':
        return {
          'title': 'NovelAI 個人法典',
          'search': '搜尋名稱、章節或 Tag',
          'all': '全部',
          'category': '統一分類',
          'section': '原始章節',
          'update': '手動更新',
          'updating': '正在更新…',
          'updated': '已更新',
          'copy': '複製提示詞',
          'source': '開啟來源',
          'adult': '成人內容',
          'empty': '沒有相符項目',
          'more': '繼續顯示',
          'website': '造訪原網站',
          'introduction': '法典說明',
          'introductionHint': '作者、版本、使用方式與測試環境（不作為提示詞）',
        };
      case 'en-US':
        return {
          'title': 'NovelAI Personal Codex',
          'search': 'Search names, sections, or tags',
          'all': 'All',
          'category': 'Unified category',
          'section': 'Source section',
          'update': 'Update now',
          'updating': 'Updating…',
          'updated': 'Updated',
          'copy': 'Copy prompt',
          'source': 'Open source',
          'adult': 'Adult content',
          'empty': 'No matching entries',
          'more': 'Show more',
          'website': 'Visit original site',
          'introduction': 'About these codices',
          'introductionHint':
              'Author, version, usage, and test environment (not prompts)',
        };
      case 'ja-JP':
        return {
          'title': 'NovelAI 個人プロンプト法典',
          'search': '名称・章・Tag を検索',
          'all': 'すべて',
          'category': '統一分類',
          'section': '元の章',
          'update': '手動更新',
          'updating': '更新中…',
          'updated': '更新済み',
          'copy': 'プロンプトをコピー',
          'source': '出典を開く',
          'adult': '成人向け',
          'empty': '一致する項目がありません',
          'more': 'さらに表示',
          'website': '元サイトを開く',
          'introduction': '法典について',
          'introductionHint': '作者・版・使い方・テスト環境（プロンプトではありません）',
        };
      case 'ko-KR':
        return {
          'title': 'NovelAI 개인 프롬프트 법전',
          'search': '이름, 장 또는 태그 검색',
          'all': '전체',
          'category': '통합 분류',
          'section': '원본 장',
          'update': '수동 업데이트',
          'updating': '업데이트 중…',
          'updated': '업데이트됨',
          'copy': '프롬프트 복사',
          'source': '출처 열기',
          'adult': '성인 콘텐츠',
          'empty': '일치하는 항목이 없습니다',
          'more': '더 보기',
          'website': '원본 사이트 열기',
          'introduction': '법전 안내',
          'introductionHint': '작성자, 버전, 사용법 및 테스트 환경 (프롬프트 아님)',
        };
      default:
        return {
          'title': 'NovelAI 个人法典',
          'search': '搜索名称、章节或 Tag',
          'all': '全部',
          'category': '统一分类',
          'section': '原始章节',
          'update': '手动更新',
          'updating': '正在更新…',
          'updated': '已更新',
          'copy': '复制提示词',
          'source': '打开来源',
          'adult': '成人内容',
          'empty': '没有匹配条目',
          'more': '继续显示',
          'website': '访问原网站',
          'introduction': '法典说明',
          'introductionHint': '作者、版本、使用方式与测试环境（不作为提示词）',
        };
    }
  }

  Map<String, String> _categories() {
    final labels = <String, List<String>>{
      'all': ['全部', '全部', 'All', 'すべて', '전체'],
      'artist': ['画师', '畫師', 'Artists', '画家', '작가'],
      'style': ['画风 / 质感', '畫風 / 質感', 'Style / texture', '画風 / 質感', '화풍 / 질감'],
      'clothing': ['服饰', '服飾', 'Clothing', '衣装', '의상'],
      'lighting': [
        '光影 / 色彩',
        '光影 / 色彩',
        'Lighting / color',
        '光 / 色',
        '조명 / 색상'
      ],
      'scene': ['场景', '場景', 'Scenes', '背景', '장면'],
      'composition': [
        '构图 / 动作',
        '構圖 / 動作',
        'Composition / pose',
        '構図 / 動作',
        '구도 / 동작'
      ],
      'character': ['角色', '角色', 'Characters', 'キャラクター', '캐릭터'],
      'other': ['其他', '其他', 'Other', 'その他', '기타'],
      'adult-other': ['成人其他', '成人其他', 'Adult / other', '成人向けその他', '성인 / 기타'],
    };
    final index = switch (_language) {
      'zh-TW' => 1,
      'en-US' => 2,
      'ja-JP' => 3,
      'ko-KR' => 4,
      _ => 0,
    };
    return labels.map((key, value) => MapEntry(key, value[index]));
  }

  List<PromptCodexEntry> _filtered(PromptCodexSnapshot snapshot) {
    final words = _query
        .trim()
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .where((word) => word.isNotEmpty);
    return dedupePromptCodexEntries(snapshot.entries).where((entry) {
      if (isPromptCodexIntroductionEntry(entry)) return false;
      if (_book != 'all' && entry.bookId != _book) return false;
      if (_category != 'all' && entry.category != _category) return false;
      if (_section != 'all' && entry.section != _section) return false;
      final haystack =
          '${entry.title}\n${entry.section}\n${entry.prompt}'.toLowerCase();
      return words.every(haystack.contains);
    }).toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final text = _text();
    final snapshot = _snapshot;
    if (snapshot == null) {
      return Scaffold(
        appBar: AppBar(
          leading: BackButton(onPressed: widget.onBack),
          title: Text(text['title']!),
        ),
        body: Center(
          child: _message.isEmpty
              ? const CircularProgressIndicator()
              : Text(_message),
        ),
      );
    }
    final categories = _categories();
    final promptEntries = dedupePromptCodexEntries(snapshot.entries
        .where((entry) => !isPromptCodexIntroductionEntry(entry)));
    final introduction = snapshot.introduction.isNotEmpty
        ? snapshot.introduction
        : extractPromptCodexIntroduction(snapshot.entries);
    final sections = promptEntries
        .where((entry) => _book == 'all' || entry.bookId == _book)
        .map((entry) => entry.section)
        .toSet()
        .toList(growable: false);
    final filtered = _filtered(snapshot);
    final visible = filtered.take(_limit).toList(growable: false);

    return Scaffold(
      appBar: AppBar(
        leading: BackButton(onPressed: widget.onBack),
        title: Text(text['title']!),
        actions: [
          IconButton(
            tooltip: text['source'],
            onPressed: () => launchUrl(Uri.parse(snapshot.sourceSite),
                mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.open_in_new),
          ),
          IconButton(
            tooltip: _updating ? text['updating'] : text['update'],
            onPressed: _updating ? null : _update,
            icon: _updating
                ? const SizedBox.square(
                    dimension: 20, child: CircularProgressIndicator())
                : const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Column(
              children: [
                Card(
                  margin: EdgeInsets.zero,
                  clipBehavior: Clip.antiAlias,
                  child: ExpansionTile(
                    key: const PageStorageKey<String>(
                        'prompt-codex-introduction'),
                    initiallyExpanded: false,
                    title: Text(text['introduction']!),
                    subtitle: Text(text['introductionHint']!),
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            for (final item in introduction) ...[
                              Text(item.title,
                                  style:
                                      Theme.of(context).textTheme.titleSmall),
                              const SizedBox(height: 4),
                              SelectableText(item.content),
                              const SizedBox(height: 12),
                            ],
                            Align(
                              alignment: Alignment.centerRight,
                              child: OutlinedButton.icon(
                                onPressed: () => launchUrl(
                                    Uri.parse(snapshot.sourceSite),
                                    mode: LaunchMode.externalApplication),
                                icon: const Icon(Icons.open_in_new),
                                label: Text(text['website']!),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _search,
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search),
                    hintText: text['search'],
                    border: const OutlineInputBorder(),
                  ),
                  onChanged: (value) {
                    _searchDebounce?.cancel();
                    _searchDebounce =
                        Timer(const Duration(milliseconds: 180), () {
                      if (!mounted) return;
                      setState(() {
                        _query = value;
                        _limit = 100;
                      });
                    });
                  },
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 42,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      ChoiceChip(
                        label: Text(text['all']!),
                        selected: _book == 'all',
                        onSelected: (_) => setState(() {
                          _book = 'all';
                          _category = 'all';
                          _section = 'all';
                          _limit = 100;
                        }),
                      ),
                      const SizedBox(width: 8),
                      for (final book in snapshot.books) ...[
                        ChoiceChip(
                          label: Text(
                            book.adult
                                ? '${book.title} · ${text['adult']}'
                                : book.title,
                          ),
                          selected: _book == book.id,
                          onSelected: (_) => setState(() {
                            _book = book.id;
                            _category = 'all';
                            _section = 'all';
                            _limit = 100;
                          }),
                        ),
                        const SizedBox(width: 8),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                LayoutBuilder(builder: (context, constraints) {
                  final compact = constraints.maxWidth < 620;
                  final controls = [
                    DropdownButtonFormField<String>(
                      value: _category,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: text['category']),
                      items: categories.entries
                          .map((item) => DropdownMenuItem(
                              value: item.key, child: Text(item.value)))
                          .toList(),
                      onChanged: (value) => setState(() {
                        _category = value ?? 'all';
                        _limit = 100;
                      }),
                    ),
                    DropdownButtonFormField<String>(
                      value: sections.contains(_section) ? _section : 'all',
                      isExpanded: true,
                      decoration: InputDecoration(labelText: text['section']),
                      items: [
                        DropdownMenuItem(
                            value: 'all', child: Text(text['all']!)),
                        ...sections.map((value) => DropdownMenuItem(
                            value: value,
                            child:
                                Text(value, overflow: TextOverflow.ellipsis))),
                      ],
                      onChanged: (value) => setState(() {
                        _section = value ?? 'all';
                        _limit = 100;
                      }),
                    ),
                  ];
                  if (compact) {
                    return Column(children: [
                      controls[0],
                      const SizedBox(height: 8),
                      controls[1],
                    ]);
                  }
                  return Row(children: [
                    Expanded(child: controls[0]),
                    const SizedBox(width: 10),
                    Expanded(child: controls[1]),
                  ]);
                }),
                if (_message.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(_message,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.primary)),
                  ),
              ],
            ),
          ),
          Expanded(
            child: visible.isEmpty
                ? Center(child: Text(text['empty']!))
                : ListView.builder(
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    itemCount: visible.length +
                        (visible.length < filtered.length ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == visible.length) {
                        return Padding(
                          padding: const EdgeInsets.all(12),
                          child: OutlinedButton(
                            onPressed: () => setState(() => _limit += 100),
                            child: Text(
                                '${text['more']} · ${visible.length}/${filtered.length}'),
                          ),
                        );
                      }
                      final entry = visible[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text(entry.section,
                                  style:
                                      Theme.of(context).textTheme.labelMedium),
                              const SizedBox(height: 3),
                              Text(entry.title,
                                  style:
                                      Theme.of(context).textTheme.titleMedium),
                              const SizedBox(height: 10),
                              SelectableText(entry.prompt),
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                alignment: WrapAlignment.end,
                                children: [
                                  TextButton.icon(
                                    onPressed: () => launchUrl(
                                        Uri.parse(entry.sourceUrl),
                                        mode: LaunchMode.externalApplication),
                                    icon: const Icon(Icons.open_in_new),
                                    label: Text(text['source']!),
                                  ),
                                  FilledButton.tonalIcon(
                                    onPressed: () async {
                                      await Clipboard.setData(
                                          ClipboardData(text: entry.prompt));
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(context)
                                          ..clearSnackBars()
                                          ..showSnackBar(SnackBar(
                                              content: Text(text['copy']!)));
                                      }
                                    },
                                    icon: const Icon(Icons.copy),
                                    label: Text(text['copy']!),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

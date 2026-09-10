import '../widgets/image_save_feedback.dart';
import '../services/gallery_download.dart';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../i18n/app_locales.dart';
import '../images/png_metadata.dart';
import '../services/aitag_service.dart';
import '../services/aitag_error.dart';
import '../services/online_gallery_download_location.dart';
import '../state/app_state.dart';
import 'metadata_inspector_screen.dart';

class _Text {
  final String title,
      subtitle,
      back,
      source,
      query,
      prompt,
      search,
      refresh,
      newest,
      monthly,
      timeRange,
      allTime,
      fullYear,
      quarter,
      currentMonth,
      older,
      loading,
      failed,
      retry,
      empty,
      total,
      previous,
      next,
      page,
      images,
      views,
      bookmarks,
      detailBack,
      workId,
      author,
      created,
      aiType,
      model,
      metadata,
      promptText,
      noMetadata,
      copy,
      copied,
      image,
      use,
      compatible,
      compatibleSettings,
      selectedCompatible,
      selectAll,
      clearAll,
      noSelected,
      preview,
      downloadCurrent,
      downloadSeries,
      downloading,
      downloaded,
      notice;
  const _Text({
    required this.title,
    required this.subtitle,
    required this.back,
    required this.source,
    required this.query,
    required this.prompt,
    required this.search,
    required this.refresh,
    required this.newest,
    required this.monthly,
    required this.timeRange,
    required this.allTime,
    required this.fullYear,
    required this.quarter,
    required this.currentMonth,
    required this.older,
    required this.loading,
    required this.failed,
    required this.retry,
    required this.empty,
    required this.total,
    required this.previous,
    required this.next,
    required this.page,
    required this.images,
    required this.views,
    required this.bookmarks,
    required this.detailBack,
    required this.workId,
    required this.author,
    required this.created,
    required this.aiType,
    required this.model,
    required this.metadata,
    required this.promptText,
    required this.noMetadata,
    required this.copy,
    required this.copied,
    required this.image,
    required this.use,
    required this.compatible,
    required this.compatibleSettings,
    required this.selectedCompatible,
    required this.selectAll,
    required this.clearAll,
    required this.noSelected,
    required this.preview,
    required this.downloadCurrent,
    required this.downloadSeries,
    required this.downloading,
    required this.downloaded,
    required this.notice,
  });
}

_Text _textFor(Object? value) {
  switch (normalizeAppLocaleCode(value)) {
    case 'zh-TW':
      return const _Text(
          title: 'AI 繪畫咒語圖庫',
          subtitle: '搜尋 AITag 公開作品並查看生成原參數。',
          back: '返回工具',
          source: '開啟 AITag',
          query: '搜尋作品、作者、標籤、模型或 ID',
          prompt: '搜尋正向提示詞（可選）',
          search: '搜尋',
          refresh: '重新整理',
          newest: '最新作品',
          monthly: '本月排行',
          timeRange: '時間範圍',
          allTime: '全部時間',
          fullYear: '{year} 全年',
          quarter: '{year} 年第 {quarter} 季度',
          currentMonth: '目前月份',
          older: '更早作品',
          loading: '正在讀取 AITag 資料…',
          failed: '讀取失敗，請檢查網路後重試。',
          retry: '重試',
          empty: '找不到符合的作品',
          total: '共 {count} 個作品',
          previous: '上一頁',
          next: '下一頁',
          page: '第 {page} 頁',
          images: '{count} 張',
          views: '瀏覽 {count}',
          bookmarks: '收藏 {count}',
          detailBack: '返回搜尋結果',
          workId: '作品 ID',
          author: '作者 ID',
          created: '發佈時間',
          aiType: '生成類型',
          model: '模型',
          metadata: '圖片原始資料',
          promptText: '提示詞文字',
          noMetadata: '此圖片沒有公開的生成原始資料。',
          copy: '複製',
          copied: '已複製',
          image: '圖片 {index}',
          use: '一鍵套用到生成',
          compatible: '可用相容參數 {count} 項',
          compatibleSettings: '相容參數重用設定',
          selectedCompatible: '已選擇 {selected}/{total} 項',
          selectAll: '全選',
          clearAll: '清除',
          noSelected: '請至少勾選一個相容參數',
          preview: '全螢幕預覽',
          downloadCurrent: '下載目前圖片',
          downloadSeries: '下載整個系列',
          downloading: '下載中…',
          downloaded: '已儲存 {count} 張圖片',
          notice: '資料與圖片來自 AITag；介面結構變更時可能暫時無法使用。');
    case 'en-US':
      return const _Text(
          title: 'AI Art Prompt Gallery',
          subtitle:
              'Search AITag public works and inspect generation metadata.',
          back: 'Back to Tools',
          source: 'Open AITag',
          query: 'Search works, creators, tags, models, or IDs',
          prompt: 'Search positive prompts (optional)',
          search: 'Search',
          refresh: 'Refresh',
          newest: 'Newest',
          monthly: 'Monthly Rank',
          timeRange: 'Time range',
          allTime: 'All time',
          fullYear: '{year} (full year)',
          quarter: '{year} Q{quarter}',
          currentMonth: 'Current month',
          older: 'Older works',
          loading: 'Loading AITag data…',
          failed: 'Could not load data. Check your network and try again.',
          retry: 'Retry',
          empty: 'No matching works found',
          total: '{count} works',
          previous: 'Previous',
          next: 'Next',
          page: 'Page {page}',
          images: '{count} images',
          views: '{count} views',
          bookmarks: '{count} bookmarks',
          detailBack: 'Back to results',
          workId: 'Work ID',
          author: 'Creator ID',
          created: 'Published',
          aiType: 'AI Type',
          model: 'Model',
          metadata: 'Original Image Metadata',
          promptText: 'Prompt Text',
          noMetadata:
              'No public generation metadata is available for this image.',
          copy: 'Copy',
          copied: 'Copied',
          image: 'Image {index}',
          use: 'Use in Generate',
          compatible: '{count} compatible values',
          compatibleSettings: 'Compatible parameters to reuse',
          selectedCompatible: '{selected}/{total} selected',
          selectAll: 'Select all',
          clearAll: 'Clear all',
          noSelected: 'Select at least one compatible parameter',
          preview: 'Full-screen preview',
          downloadCurrent: 'Download current image',
          downloadSeries: 'Download full series',
          downloading: 'Downloading…',
          downloaded: 'Saved {count} images',
          notice:
              'Data and images are provided by AITag; availability may change with its API.');
    case 'ja-JP':
      return const _Text(
          title: 'AI イラスト呪文ギャラリー',
          subtitle: 'AITag の公開作品を検索し、生成パラメータを確認します。',
          back: 'ツールへ戻る',
          source: 'AITag を開く',
          query: '作品、作者、タグ、モデル、ID を検索',
          prompt: 'ポジティブプロンプトを検索（任意）',
          search: '検索',
          refresh: '更新',
          newest: '新着作品',
          monthly: '月間ランキング',
          timeRange: '期間',
          allTime: '全期間',
          fullYear: '{year} 年通年',
          quarter: '{year} 年 Q{quarter}',
          currentMonth: '今月',
          older: '以前の作品',
          loading: 'AITag データを読み込み中…',
          failed: '読み込めませんでした。ネットワークを確認して再試行してください。',
          retry: '再試行',
          empty: '一致する作品がありません',
          total: '全 {count} 作品',
          previous: '前のページ',
          next: '次のページ',
          page: '{page} ページ',
          images: '{count} 枚',
          views: '閲覧 {count}',
          bookmarks: 'ブックマーク {count}',
          detailBack: '検索結果へ戻る',
          workId: '作品 ID',
          author: '作者 ID',
          created: '公開日時',
          aiType: '生成タイプ',
          model: 'モデル',
          metadata: '画像の生成データ',
          promptText: 'プロンプトテキスト',
          noMetadata: 'この画像には公開された生成データがありません。',
          copy: 'コピー',
          copied: 'コピー済み',
          image: '画像 {index}',
          use: '生成画面で使用',
          compatible: '互換設定 {count} 件',
          compatibleSettings: '再利用する互換設定',
          selectedCompatible: '{selected}/{total} 件を選択',
          selectAll: 'すべて選択',
          clearAll: 'すべて解除',
          noSelected: '互換設定を1つ以上選択してください',
          preview: '全画面プレビュー',
          downloadCurrent: '現在の画像を保存',
          downloadSeries: 'シリーズ全体を保存',
          downloading: '保存中…',
          downloaded: '{count} 枚を保存しました',
          notice: 'データと画像は AITag 提供です。API 変更時は一時的に利用できない場合があります。');
    case 'ko-KR':
      return const _Text(
          title: 'AI 그림 프롬프트 갤러리',
          subtitle: 'AITag 공개 작품을 검색하고 생성 매개변수를 확인합니다.',
          back: '도구로 돌아가기',
          source: 'AITag 열기',
          query: '작품, 작가, 태그, 모델 또는 ID 검색',
          prompt: '긍정 프롬프트 검색(선택 사항)',
          search: '검색',
          refresh: '새로고침',
          newest: '최신 작품',
          monthly: '월간 순위',
          timeRange: '기간',
          allTime: '전체 기간',
          fullYear: '{year}년 전체',
          quarter: '{year}년 {quarter}분기',
          currentMonth: '이번 달',
          older: '이전 작품',
          loading: 'AITag 데이터를 불러오는 중…',
          failed: '데이터를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도하세요.',
          retry: '다시 시도',
          empty: '일치하는 작품이 없습니다',
          total: '총 {count}개 작품',
          previous: '이전 페이지',
          next: '다음 페이지',
          page: '{page}페이지',
          images: '{count}장',
          views: '조회 {count}',
          bookmarks: '북마크 {count}',
          detailBack: '검색 결과로 돌아가기',
          workId: '작품 ID',
          author: '작가 ID',
          created: '게시 시간',
          aiType: '생성 유형',
          model: '모델',
          metadata: '이미지 원본 데이터',
          promptText: '프롬프트 텍스트',
          noMetadata: '이 이미지에는 공개된 생성 원본 데이터가 없습니다.',
          copy: '복사',
          copied: '복사됨',
          image: '이미지 {index}',
          use: '생성 화면에서 사용',
          compatible: '호환 값 {count}개',
          compatibleSettings: '재사용할 호환 매개변수',
          selectedCompatible: '{selected}/{total}개 선택',
          selectAll: '전체 선택',
          clearAll: '전체 해제',
          noSelected: '호환 매개변수를 하나 이상 선택하세요',
          preview: '전체 화면 미리보기',
          downloadCurrent: '현재 이미지 저장',
          downloadSeries: '전체 시리즈 저장',
          downloading: '저장 중…',
          downloaded: '이미지 {count}장을 저장했습니다',
          notice: '데이터와 이미지는 AITag에서 제공되며 API 변경 시 일시적으로 사용할 수 없을 수 있습니다.');
    default:
      return const _Text(
          title: 'AI绘画咒语图库',
          subtitle: '搜索 AITag 公开作品并查看生成原参数。',
          back: '返回工具',
          source: '打开 AITag',
          query: '搜索作品、作者、标签、模型或 ID',
          prompt: '搜索正向提示词（可选）',
          search: '搜索',
          refresh: '刷新',
          newest: '最新作品',
          monthly: '本月排行',
          timeRange: '时间范围',
          allTime: '全部时间',
          fullYear: '{year} 全年',
          quarter: '{year} 年第 {quarter} 季度',
          currentMonth: '当前月份',
          older: '更早作品',
          loading: '正在读取 AITag 数据…',
          failed: '读取失败，请检查网络后重试。',
          retry: '重试',
          empty: '没有找到匹配的作品',
          total: '共 {count} 个作品',
          previous: '上一页',
          next: '下一页',
          page: '第 {page} 页',
          images: '{count} 张',
          views: '浏览 {count}',
          bookmarks: '收藏 {count}',
          detailBack: '返回搜索结果',
          workId: '作品 ID',
          author: '作者 ID',
          created: '发布时间',
          aiType: '生成类型',
          model: '模型',
          metadata: '图片原数据',
          promptText: '提示词文本',
          noMetadata: '该图片没有公开的生成原数据。',
          copy: '复制',
          copied: '已复制',
          image: '图片 {index}',
          use: '一键使用到生成',
          compatible: '可用兼容参数 {count} 项',
          compatibleSettings: '兼容参数复用设置',
          selectedCompatible: '已选择 {selected}/{total} 项',
          selectAll: '全选',
          clearAll: '清空',
          noSelected: '请至少勾选一个兼容参数',
          preview: '全屏预览',
          downloadCurrent: '下载当前图片',
          downloadSeries: '下载整个系列',
          downloading: '正在下载…',
          downloaded: '已保存 {count} 张图片',
          notice: '数据与图片来自 AITag；接口结构变更时可能暂时不可用。');
  }
}

String _f(String value, String key, Object replacement) =>
    value.replaceAll('{$key}', '$replacement');

class AitagGalleryScreen extends StatefulWidget {
  final VoidCallback? onBack;
  final AitagService? service;
  final bool showAppBar;
  const AitagGalleryScreen({
    super.key,
    this.onBack,
    this.service,
    this.showAppBar = true,
  });

  @override
  State<AitagGalleryScreen> createState() => _AitagGalleryScreenState();
}

class _AitagGalleryScreenState extends State<AitagGalleryScreen> {
  late final AitagService service = widget.service ?? AitagService();
  final query = TextEditingController();
  final prompt = TextEditingController();
  final scrollController = ScrollController();
  AitagSearchResult result =
      const AitagSearchResult(page: 1, total: 0, items: []);
  String sort = 'new';
  String timeRange = 'all';
  bool loading = true;
  bool failed = false;
  Object? loadError;

  @override
  void initState() {
    super.initState();
    service.loadConfig().then((_) {
      if (mounted) setState(() {});
    }).catchError((_) {});
    _search(1);
  }

  @override
  void dispose() {
    query.dispose();
    prompt.dispose();
    scrollController.dispose();
    service.close();
    super.dispose();
  }

  Future<void> _search(int page,
      {String? sortOverride, String? timeRangeOverride}) async {
    setState(() {
      loading = true;
      failed = false;
    });
    try {
      final next = await service.search(
          page: page,
          query: query.text,
          prompt: prompt.text,
          sort: sortOverride ?? sort,
          timeRange: timeRangeOverride ?? timeRange);
      if (mounted) setState(() => result = next);
    } catch (error) {
      if (mounted) {
        setState(() {
          failed = true;
          loadError = error;
        });
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _refresh() async {
    service.clearDetailCache();
    try {
      await service.loadConfig();
    } catch (_) {
      // Keep the last known config and still refresh the result list.
    }
    if (mounted) setState(() {});
    await _search(result.page);
  }

  @override
  Widget build(BuildContext context) {
    final language =
        context.select<AppState, String>((state) => state.settings.language);
    final text = _textFor(language);
    final maxPage = math.max(1, (result.total / aitagPageSize).ceil());
    final timeOptions = <({String value, String label})>[];
    if (sort == 'monthly') {
      final months = service.availableMonths
          .where((month) => month.compareTo('2023-11') >= 0)
          .toSet()
          .toList()
        ..sort((a, b) => b.compareTo(a));
      timeOptions
        ..add((value: 'current', label: text.currentMonth))
        ..addAll(months.map((month) => (value: 'm$month', label: month)))
        ..add((value: 'older', label: text.older));
    } else {
      final years = service.availableYears.isEmpty
          ? <int>[DateTime.now().year]
          : service.availableYears.toSet().toList()
        ..sort((a, b) => b.compareTo(a));
      timeOptions.add((value: 'all', label: text.allTime));
      for (final year in years) {
        timeOptions.add((
          value: 'y$year',
          label: _f(text.fullYear, 'year', year),
        ));
        final quarters = year > 2023
            ? const [1, 2, 3, 4]
            : year == 2023
                ? const [4]
                : const <int>[];
        for (final quarter in quarters) {
          timeOptions.add((
            value: 'q${year}Q$quarter',
            label: _f(_f(text.quarter, 'year', year), 'quarter', quarter),
          ));
        }
      }
      timeOptions.add((value: 'older', label: text.older));
    }
    return Scaffold(
      appBar: widget.showAppBar
          ? AppBar(
              automaticallyImplyLeading: widget.onBack != null,
              leading: widget.onBack == null
                  ? null
                  : IconButton(
                      tooltip: text.back,
                      onPressed: widget.onBack,
                      icon: const Icon(Icons.arrow_back)),
              title: Text(text.title),
              actions: [
                IconButton(
                    tooltip: text.refresh,
                    onPressed: loading ? null : _refresh,
                    icon: const Icon(Icons.refresh)),
                IconButton(
                    tooltip: text.source,
                    onPressed: () => launchUrl(Uri.parse(aitagSiteUrl),
                        mode: LaunchMode.externalApplication),
                    icon: const Icon(Icons.open_in_new))
              ],
            )
          : null,
      body: LayoutBuilder(builder: (context, constraints) {
        final columns = constraints.maxWidth >= 1100
            ? 5
            : constraints.maxWidth >= 760
                ? 3
                : constraints.maxWidth >= 480
                    ? 2
                    : 1;
        return RefreshIndicator(
          onRefresh: _refresh,
          child: Scrollbar(
            controller: scrollController,
            thumbVisibility: true,
            interactive: true,
            child: CustomScrollView(
              controller: scrollController,
              physics: const AlwaysScrollableScrollPhysics(),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              slivers: [
                SliverToBoxAdapter(
                    child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                  child: Card(
                      child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(text.subtitle,
                              style: Theme.of(context).textTheme.bodyMedium),
                          const SizedBox(height: 12),
                          TextField(
                              controller: query,
                              textInputAction: TextInputAction.search,
                              onSubmitted: (_) => _search(1),
                              decoration: InputDecoration(
                                  prefixIcon: const Icon(Icons.search),
                                  hintText: text.query)),
                          const SizedBox(height: 10),
                          TextField(
                              controller: prompt,
                              textInputAction: TextInputAction.search,
                              onSubmitted: (_) => _search(1),
                              decoration: InputDecoration(
                                  prefixIcon:
                                      const Icon(Icons.auto_awesome_outlined),
                                  hintText: text.prompt)),
                          const SizedBox(height: 10),
                          Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                SegmentedButton<String>(
                                    segments: [
                                      ButtonSegment(
                                          value: 'new',
                                          label: Text(text.newest)),
                                      ButtonSegment(
                                          value: 'monthly',
                                          label: Text(text.monthly))
                                    ],
                                    selected: {
                                      sort
                                    },
                                    onSelectionChanged: loading
                                        ? null
                                        : (value) {
                                            final nextSort = value.first;
                                            final nextTimeRange =
                                                nextSort == 'monthly'
                                                    ? 'current'
                                                    : 'all';
                                            setState(() {
                                              sort = nextSort;
                                              timeRange = nextTimeRange;
                                            });
                                            _search(1,
                                                sortOverride: nextSort,
                                                timeRangeOverride:
                                                    nextTimeRange);
                                          }),
                                SizedBox(
                                  width: 240,
                                  child: DropdownButtonFormField<String>(
                                    value: timeRange,
                                    isExpanded: true,
                                    decoration: InputDecoration(
                                      labelText: text.timeRange,
                                      prefixIcon: const Icon(
                                          Icons.calendar_month_outlined),
                                    ),
                                    items: timeOptions
                                        .map((option) => DropdownMenuItem(
                                              value: option.value,
                                              child: Text(option.label,
                                                  overflow:
                                                      TextOverflow.ellipsis),
                                            ))
                                        .toList(),
                                    onChanged: loading
                                        ? null
                                        : (value) {
                                            if (value == null) return;
                                            setState(() => timeRange = value);
                                            _search(1,
                                                timeRangeOverride: value);
                                          },
                                  ),
                                ),
                                FilledButton.icon(
                                    onPressed:
                                        loading ? null : () => _search(1),
                                    icon: const Icon(Icons.search),
                                    label: Text(text.search)),
                                Text(_f(text.total, 'count', result.total)),
                              ]),
                        ]),
                  )),
                )),
                if (loading)
                  SliverFillRemaining(
                      hasScrollBody: false,
                      child: Center(
                          child:
                              Column(mainAxisSize: MainAxisSize.min, children: [
                        const CircularProgressIndicator(),
                        const SizedBox(height: 12),
                        Text(text.loading)
                      ])))
                else if (failed)
                  SliverFillRemaining(
                      hasScrollBody: false,
                      child: Center(
                          child:
                              Column(mainAxisSize: MainAxisSize.min, children: [
                        Text(formatAitagFailure(loadError, language)),
                        const SizedBox(height: 12),
                        OutlinedButton(
                            onPressed: _refresh, child: Text(text.retry))
                      ])))
                else if (result.items.isEmpty)
                  SliverFillRemaining(
                      hasScrollBody: false,
                      child: Center(child: Text(text.empty)))
                else
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: _MasonryGrid(
                        columnCount: columns,
                        itemCount: result.items.length,
                        itemBuilder: (context, index) => _WorkCard(
                            work: result.items[index],
                            service: service,
                            text: text,
                            onTap: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                    builder: (_) => _AitagDetailScreen(
                                        service: service,
                                        workId: result.items[index].id,
                                        text: text)))),
                      ),
                    ),
                  ),
                if (!loading && !failed && result.items.isNotEmpty)
                  SliverToBoxAdapter(
                      child: SafeArea(
                          top: false,
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
                            child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  OutlinedButton(
                                      onPressed: result.page > 1
                                          ? () => _search(result.page - 1)
                                          : null,
                                      child: Text(text.previous)),
                                  Padding(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 14),
                                      child: Text(
                                          '${_f(text.page, 'page', result.page)} / $maxPage')),
                                  OutlinedButton(
                                      onPressed: result.page < maxPage
                                          ? () => _search(result.page + 1)
                                          : null,
                                      child: Text(text.next)),
                                ]),
                          ))),
              ],
            ),
          ),
        );
      }),
    );
  }
}

class _CachedAitagImage extends StatelessWidget {
  final AitagService service;
  final String url;
  final BoxFit fit;
  const _CachedAitagImage(
      {required this.service, required this.url, required this.fit});

  @override
  Widget build(BuildContext context) {
    final days = context.read<AppState>().settings.aitagCacheRetentionDays;
    return FutureBuilder(
      future: service.cachedImage(url, retentionDays: days),
      builder: (context, snapshot) {
        if (snapshot.hasData) return Image.file(snapshot.data!, fit: fit);
        if (snapshot.hasError) {
          return Image.network(url,
              fit: fit,
              headers: aitagImageHeaders,
              errorBuilder: (_, __, ___) =>
                  const Center(child: Icon(Icons.broken_image_outlined)));
        }
        return const Center(child: CircularProgressIndicator(strokeWidth: 2));
      },
    );
  }
}

class _MasonryGrid extends StatelessWidget {
  final int columnCount;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;

  const _MasonryGrid({
    required this.columnCount,
    required this.itemCount,
    required this.itemBuilder,
  });

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var column = 0; column < columnCount; column++) ...[
            if (column > 0) const SizedBox(width: 10),
            Expanded(
              child: Column(
                children: [
                  for (var index = column;
                      index < itemCount;
                      index += columnCount)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: itemBuilder(context, index),
                    ),
                ],
              ),
            ),
          ],
        ],
      );
}

Future<void> _showAitagPreview(
        BuildContext context, AitagService service, String url) =>
    showDialog<void>(
      context: context,
      useSafeArea: false,
      barrierColor: Colors.black87,
      builder: (dialogContext) => Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: Stack(children: [
          Positioned.fill(
              child: InteractiveViewer(
            minScale: .8,
            maxScale: 6,
            child: Center(
                child: _CachedAitagImage(
                    service: service, url: url, fit: BoxFit.contain)),
          )),
          SafeArea(
              child: Align(
            alignment: AlignmentDirectional.topEnd,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: IconButton.filledTonal(
                tooltip:
                    MaterialLocalizations.of(dialogContext).closeButtonTooltip,
                onPressed: () => Navigator.of(dialogContext).pop(),
                icon: const Icon(Icons.close),
              ),
            ),
          )),
        ]),
      ),
    );

class _WorkCard extends StatelessWidget {
  final AitagWork work;
  final AitagService service;
  final _Text text;
  final VoidCallback onTap;
  const _WorkCard(
      {required this.work,
      required this.service,
      required this.text,
      required this.onTap});

  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
            onTap: onTap,
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  FutureBuilder<AitagWorkDetail>(
                      future: service.work(work.id),
                      builder: (context, snapshot) {
                        final image = snapshot.data?.images.firstOrNull;
                        final url =
                            image == null ? '' : service.imageUrl(image);
                        return Stack(children: [
                          if (url.isNotEmpty)
                            SizedBox(
                              width: double.infinity,
                              child: _CachedAitagImage(
                                  service: service,
                                  url: url,
                                  fit: BoxFit.fitWidth),
                            )
                          else
                            const AspectRatio(
                              aspectRatio: 4 / 3,
                              child: Center(
                                  child: Icon(Icons.image_search_outlined,
                                      size: 38)),
                            ),
                          Positioned(
                              right: 7,
                              bottom: 7,
                              child: Chip(
                                  visualDensity: VisualDensity.compact,
                                  label: Text(_f(
                                      text.images, 'count', work.imageCount)))),
                        ]);
                      }),
                  Padding(
                      padding: const EdgeInsets.all(10),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                                work.title.isEmpty ? '#${work.id}' : work.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.titleSmall),
                            const SizedBox(height: 4),
                            Text(
                                '${work.aiType.isEmpty ? 'AI' : work.aiType} · ${work.createDate}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.bodySmall),
                            const SizedBox(height: 5),
                            Row(children: [
                              Expanded(
                                  child: Text(
                                      _f(text.views, 'count', work.totalView),
                                      style: Theme.of(context)
                                          .textTheme
                                          .labelSmall)),
                              Text(
                                  _f(text.bookmarks, 'count',
                                      work.totalBookmarks),
                                  style: Theme.of(context).textTheme.labelSmall)
                            ]),
                          ])),
                ])),
      );
}

class _AitagDetailScreen extends StatefulWidget {
  final AitagService service;
  final int workId;
  final _Text text;
  const _AitagDetailScreen(
      {required this.service, required this.workId, required this.text});
  @override
  State<_AitagDetailScreen> createState() => _AitagDetailScreenState();
}

class _AitagDetailScreenState extends State<_AitagDetailScreen> {
  int selected = 0;
  bool downloading = false;
  late final Future<AitagWorkDetail> detail =
      widget.service.work(widget.workId);

  Future<void> _copy(String value) async {
    await Clipboard.setData(ClipboardData(text: value));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(widget.text.copied),
          duration: const Duration(seconds: 1)));
    }
  }

  Future<void> _download(
      AitagWorkDetail detail, List<AitagImage> images) async {
    if (downloading || images.isEmpty) return;
    setState(() => downloading = true);
    final state = context.read<AppState>();
    final feedback = ImageSaveFeedback.show(context, state.settings.language);
    try {
      if (!await ensureOnlineGalleryDownloadDirectory(state)) {
        feedback.finish(saved: 0, cancelled: true);
        return;
      }
      if (!mounted) {
        feedback.finish(saved: 0, cancelled: true);
        return;
      }
      feedback.downloading(widget.text.downloading, images.length);
      final result = await downloadGalleryBatch<AitagImage>(
        images: images,
        id: (image) => '${image.id}',
        fetch: widget.service.downloadImage,
        save: (image, index, bytes, extension) =>
            state.storage.saveOnlineGalleryImage(
          bytes,
          source: 'aitag',
          itemId: '${detail.work.id}',
          title: detail.work.title,
          imageId: '${(index + 1).toString().padLeft(2, '0')}-${image.id}',
          extension: extension,
        ),
      );
      feedback.finish(
          saved: result.savedFiles.length,
          failed: result.failures.length,
          path: result.savedFiles.isEmpty
              ? null
              : result.savedFiles.first.parent.path);
    } catch (_) {
      feedback.finish(saved: 0, failed: images.length);
    } finally {
      if (mounted) setState(() => downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: Text(widget.text.metadata),
          actions: [
            IconButton(
                tooltip: widget.text.source,
                onPressed: () => launchUrl(
                    Uri.parse('$aitagSiteUrl/i/${widget.workId}'),
                    mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.open_in_new))
          ],
        ),
        body: FutureBuilder<AitagWorkDetail>(
            future: detail,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 12),
                  Text(widget.text.loading)
                ]));
              }
              if (snapshot.hasError || snapshot.data == null) {
                return Center(child: Text(widget.text.failed));
              }
              final data = snapshot.data!;
              final index = data.images.isEmpty
                  ? 0
                  : selected.clamp(0, data.images.length - 1);
              final image = data.images.isEmpty ? null : data.images[index];
              final url = image == null ? '' : widget.service.imageUrl(image);
              final metadata =
                  image == null ? '' : formatAitagMetadata(image.aiJson);
              final report = image == null
                  ? null
                  : inspectImageMetadata(
                      aitagMetadataRecord(image, data.work.aiType));
              return LayoutBuilder(builder: (context, constraints) {
                final visual = Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (url.isNotEmpty)
                        ConstrainedBox(
                          constraints: BoxConstraints(
                              maxHeight: constraints.maxHeight * .68),
                          child: GestureDetector(
                            onDoubleTap: () =>
                                _showAitagPreview(context, widget.service, url),
                            child: _CachedAitagImage(
                                service: widget.service,
                                url: url,
                                fit: BoxFit.contain),
                          ),
                        ),
                      if (data.images.length > 1)
                        SizedBox(
                            height: 94,
                            child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                padding: const EdgeInsets.only(top: 10),
                                itemCount: data.images.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(width: 8),
                                itemBuilder: (context, i) => InkWell(
                                    onTap: () => setState(() => selected = i),
                                    child: Container(
                                        width: 76,
                                        decoration: BoxDecoration(
                                            border: Border.all(
                                                color: i == index
                                                    ? Theme.of(context)
                                                        .colorScheme
                                                        .primary
                                                    : Theme.of(context)
                                                        .dividerColor,
                                                width: 2),
                                            borderRadius:
                                                BorderRadius.circular(10)),
                                        clipBehavior: Clip.antiAlias,
                                        child: _CachedAitagImage(
                                            service: widget.service,
                                            url: widget.service
                                                .imageUrl(data.images[i]),
                                            fit: BoxFit.contain))))),
                      if (image != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: Wrap(spacing: 8, runSpacing: 8, children: [
                            FilledButton.tonalIcon(
                              onPressed: () => _showAitagPreview(
                                  context, widget.service, url),
                              icon: const Icon(Icons.fullscreen),
                              label: Text(widget.text.preview),
                            ),
                            FilledButton.tonalIcon(
                              onPressed: downloading
                                  ? null
                                  : () => _download(data, [image]),
                              icon: downloading
                                  ? const SizedBox.square(
                                      dimension: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2))
                                  : const Icon(Icons.download_outlined),
                              label: Text(widget.text.downloadCurrent),
                            ),
                            if (data.images.length > 1)
                              FilledButton.tonalIcon(
                                onPressed: downloading
                                    ? null
                                    : () => _download(data, data.images),
                                icon: const Icon(
                                    Icons.download_for_offline_outlined),
                                label: Text(widget.text.downloadSeries),
                              ),
                          ]),
                        ),
                    ]);
                final details = Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                          data.work.title.isEmpty
                              ? '#${data.work.id}'
                              : data.work.title,
                          style: Theme.of(context).textTheme.headlineSmall),
                      const SizedBox(height: 8),
                      Wrap(spacing: 8, runSpacing: 8, children: [
                        Chip(
                            label:
                                Text('${widget.text.workId}: ${data.work.id}')),
                        Chip(
                            label: Text(
                                '${widget.text.author}: ${data.work.userId}')),
                        Chip(
                            label: Text(
                                '${widget.text.created}: ${data.work.createDate}')),
                        Chip(
                            label: Text(
                                '${widget.text.aiType}: ${data.work.aiType}'))
                      ]),
                      if (stripAitagHtml(data.work.caption).isNotEmpty)
                        Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: Text(stripAitagHtml(data.work.caption))),
                      const SizedBox(height: 12),
                      if (image != null)
                        Card(
                            child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Text(
                                    '${widget.text.model}: ${image.model.isEmpty ? data.work.aiType : image.model}'))),
                      if (image?.promptText.isNotEmpty == true)
                        _DataBlock(
                            title: widget.text.promptText,
                            value: image!.promptText,
                            copy: widget.text.copy,
                            onCopy: () => _copy(image.promptText)),
                      if (report != null)
                        _MetadataReportBlock(
                          report: report,
                          raw: metadata,
                          text: widget.text,
                          onCopy: _copy,
                        )
                      else
                        _DataBlock(
                            title: widget.text.metadata,
                            value: widget.text.noMetadata,
                            copy: widget.text.copy,
                            onCopy: null),
                      Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: Text(widget.text.notice,
                              style: Theme.of(context).textTheme.bodySmall)),
                    ]);
                return SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: constraints.maxWidth >= 840
                        ? Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                                Expanded(child: visual),
                                const SizedBox(width: 16),
                                Expanded(child: details)
                              ])
                        : Column(children: [
                            visual,
                            const SizedBox(height: 16),
                            details
                          ]));
              });
            }),
      );
}

class _MetadataReportBlock extends StatelessWidget {
  final ImageMetadataReport report;
  final String raw;
  final _Text text;
  final Future<void> Function(String) onCopy;
  const _MetadataReportBlock({
    required this.report,
    required this.raw,
    required this.text,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final compatible = report.imported.compatibleValuesByKey;
    final selected = state.aitagCompatibleParams;
    final selectedCount = compatible.keys.where(selected.contains).length;
    const labels = <String, String>{
      'positivePrompt': 'Positive prompt',
      'negativePrompt': 'Negative prompt',
      'model': 'Model',
      'width': 'Width',
      'height': 'Height',
      'steps': 'Steps',
      'cfgScale': 'CFG scale',
      'cfgRescale': 'CFG rescale',
      'sampler': 'Sampler',
      'noiseSchedule': 'Noise schedule',
      'seed': 'Seed',
      'smea': 'SMEA',
      'smeaDyn': 'SMEA Dyn',
    };
    final selectedSummary = _f(
        _f(text.selectedCompatible, 'selected', selectedCount),
        'total',
        compatible.length);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              initiallyExpanded: false,
              title: Text(text.compatibleSettings),
              subtitle: Text(selectedSummary),
              children: [
                Wrap(spacing: 8, runSpacing: 8, children: [
                  OutlinedButton(
                      onPressed: () => state.setAitagCompatibleParams(
                          {...importedGenerateParamKeys}),
                      child: Text(text.selectAll)),
                  OutlinedButton(
                      onPressed: () =>
                          state.setAitagCompatibleParams(<String>{}),
                      child: Text(text.clearAll)),
                ]),
                const SizedBox(height: 6),
                ...compatible.entries.map((entry) {
                  final label = metadataParameterLabel(
                      state.settings.language, labels[entry.key] ?? entry.key);
                  return CheckboxListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    value: selected.contains(entry.key),
                    title: Text(label),
                    subtitle: Text('${entry.value}',
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                    onChanged: (checked) {
                      final next = {...selected};
                      if (checked == true) {
                        next.add(entry.key);
                      } else {
                        next.remove(entry.key);
                      }
                      state.setAitagCompatibleParams(next);
                    },
                  );
                }),
                const SizedBox(height: 6),
                FilledButton.icon(
                  onPressed: selectedCount == 0
                      ? null
                      : () {
                          state.applyImportedMetadata(
                              report.imported.selecting(selected));
                          ScaffoldMessenger.of(context)
                              .showSnackBar(SnackBar(content: Text(text.use)));
                        },
                  icon: const Icon(Icons.play_arrow),
                  label: Text(text.use),
                ),
                if (selectedCount == 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(text.noSelected,
                        style: Theme.of(context).textTheme.bodySmall),
                  ),
              ],
            ),
            const Divider(),
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              initiallyExpanded: false,
              title: Text(text.metadata),
              subtitle: Text('${report.entries.length}'),
              children: [
                if (report.entries.isEmpty)
                  Text(text.noMetadata)
                else
                  ...report.entries.map((entry) {
                    final label = metadataParameterLabel(
                        state.settings.language, entry.key);
                    return Card.outlined(
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(children: [
                              Expanded(
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                    Text(metadataGroupLabel(
                                        state.settings.language, entry.group)),
                                    Text(label,
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleSmall),
                                  ])),
                              IconButton(
                                  tooltip: text.copy,
                                  onPressed: () => onCopy(entry.value),
                                  icon: const Icon(Icons.copy_outlined)),
                            ]),
                            SelectableText(entry.value,
                                style:
                                    const TextStyle(fontFamily: 'monospace')),
                          ],
                        ),
                      ),
                    );
                  }),
                if (raw.isNotEmpty)
                  ExpansionTile(
                    tilePadding: EdgeInsets.zero,
                    initiallyExpanded: false,
                    title: Text(text.metadata),
                    trailing: IconButton(
                        tooltip: text.copy,
                        onPressed: () => onCopy(raw),
                        icon: const Icon(Icons.copy_outlined)),
                    children: [
                      SelectableText(raw,
                          style: const TextStyle(fontFamily: 'monospace'))
                    ],
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DataBlock extends StatelessWidget {
  final String title, value, copy;
  final VoidCallback? onCopy;
  const _DataBlock(
      {required this.title,
      required this.value,
      required this.copy,
      required this.onCopy});
  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(12),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(
                  child: Text(title,
                      style: Theme.of(context).textTheme.titleMedium)),
              IconButton(
                  tooltip: copy,
                  onPressed: onCopy,
                  icon: const Icon(Icons.copy_outlined))
            ]),
            SelectableText(value,
                style: const TextStyle(fontFamily: 'monospace')),
          ])));
}

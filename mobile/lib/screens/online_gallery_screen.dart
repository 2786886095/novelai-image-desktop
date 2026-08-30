import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../i18n/app_locales.dart';
import '../services/online_gallery_service.dart';
import '../state/app_state.dart';
import 'aitag_gallery_screen.dart';

class _GalleryText {
  final String title;
  final String source;
  final String subtitle;
  final String query;
  final String search;
  final String refresh;
  final String openSource;
  final String safeOnly;
  final String loading;
  final String empty;
  final String retry;
  final String previous;
  final String next;
  final String page;
  final String results;
  final String backCollections;
  final String images;
  final String score;
  final String favorites;
  final String prompt;
  final String negative;
  final String copy;
  final String copied;
  final String usePrompt;
  final String promptApplied;
  final String shareImage;
  final String sharing;
  final String metadata;
  final String artists;
  final String characters;
  final String copyrights;
  final String general;
  final String meta;
  final String noPrompt;

  const _GalleryText({
    required this.title,
    required this.source,
    required this.subtitle,
    required this.query,
    required this.search,
    required this.refresh,
    required this.openSource,
    required this.safeOnly,
    required this.loading,
    required this.empty,
    required this.retry,
    required this.previous,
    required this.next,
    required this.page,
    required this.results,
    required this.backCollections,
    required this.images,
    required this.score,
    required this.favorites,
    required this.prompt,
    required this.negative,
    required this.copy,
    required this.copied,
    required this.usePrompt,
    required this.promptApplied,
    required this.shareImage,
    required this.sharing,
    required this.metadata,
    required this.artists,
    required this.characters,
    required this.copyrights,
    required this.general,
    required this.meta,
    required this.noPrompt,
  });
}

_GalleryText _galleryText(Object? language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return const _GalleryText(
        title: '線上畫廊',
        source: '畫廊來源',
        subtitle: '搜尋、瀏覽並查看完整圖片與可用提示詞。',
        query: '搜尋標籤，多個標籤以空格分隔',
        search: '搜尋',
        refresh: '重新整理',
        openSource: '開啟來源網站',
        safeOnly: '僅顯示全年齡',
        loading: '正在載入畫廊…',
        empty: '沒有符合的結果',
        retry: '重試',
        previous: '上一頁',
        next: '下一頁',
        page: '第 {page} 頁',
        results: '{count} 個結果',
        backCollections: '返回圖鑑列表',
        images: '{count} 張',
        score: '評分',
        favorites: '收藏',
        prompt: '正向提示詞',
        negative: '負向提示詞',
        copy: '複製',
        copied: '已複製',
        usePrompt: '套用到生成',
        promptApplied: '提示詞已套用到生成頁',
        shareImage: '下載 / 分享',
        sharing: '正在準備圖片…',
        metadata: '原始資料',
        artists: '藝術家',
        characters: '角色',
        copyrights: '作品',
        general: '通用',
        meta: '元資料',
        noPrompt: '這個項目沒有可用提示詞。',
      );
    case 'en-US':
      return const _GalleryText(
        title: 'Online Gallery',
        source: 'Gallery source',
        subtitle:
            'Search, browse, and inspect full images and reusable prompts.',
        query: 'Search tags; separate multiple tags with spaces',
        search: 'Search',
        refresh: 'Refresh',
        openSource: 'Open source website',
        safeOnly: 'All-ages only',
        loading: 'Loading gallery…',
        empty: 'No matching results',
        retry: 'Retry',
        previous: 'Previous',
        next: 'Next',
        page: 'Page {page}',
        results: '{count} results',
        backCollections: 'Back to collections',
        images: '{count} images',
        score: 'Score',
        favorites: 'Favorites',
        prompt: 'Positive prompt',
        negative: 'Negative prompt',
        copy: 'Copy',
        copied: 'Copied',
        usePrompt: 'Use in Generate',
        promptApplied: 'Prompt applied to Generate',
        shareImage: 'Download / Share',
        sharing: 'Preparing image…',
        metadata: 'Raw metadata',
        artists: 'Artists',
        characters: 'Characters',
        copyrights: 'Copyrights',
        general: 'General',
        meta: 'Metadata',
        noPrompt: 'No reusable prompt is available for this item.',
      );
    case 'ja-JP':
      return const _GalleryText(
        title: 'オンラインギャラリー',
        source: 'ギャラリー',
        subtitle: '画像を検索・閲覧し、利用可能なプロンプトを確認します。',
        query: 'タグを検索（複数は空白で区切る）',
        search: '検索',
        refresh: '更新',
        openSource: '配布元を開く',
        safeOnly: '全年齢のみ',
        loading: 'ギャラリーを読み込み中…',
        empty: '一致する結果がありません',
        retry: '再試行',
        previous: '前へ',
        next: '次へ',
        page: '{page} ページ',
        results: '{count} 件',
        backCollections: '図鑑一覧へ戻る',
        images: '{count} 枚',
        score: 'スコア',
        favorites: 'お気に入り',
        prompt: 'ポジティブプロンプト',
        negative: 'ネガティブプロンプト',
        copy: 'コピー',
        copied: 'コピー済み',
        usePrompt: '生成画面で使用',
        promptApplied: '生成画面に適用しました',
        shareImage: '保存 / 共有',
        sharing: '画像を準備中…',
        metadata: '元データ',
        artists: 'アーティスト',
        characters: 'キャラクター',
        copyrights: '作品',
        general: '一般',
        meta: 'メタデータ',
        noPrompt: '利用できるプロンプトがありません。',
      );
    case 'ko-KR':
      return const _GalleryText(
        title: '온라인 갤러리',
        source: '갤러리 소스',
        subtitle: '이미지를 검색하고 전체 이미지와 재사용 가능한 프롬프트를 확인합니다.',
        query: '태그 검색; 여러 태그는 공백으로 구분',
        search: '검색',
        refresh: '새로 고침',
        openSource: '원본 사이트 열기',
        safeOnly: '전체 이용가만',
        loading: '갤러리 불러오는 중…',
        empty: '검색 결과가 없습니다',
        retry: '다시 시도',
        previous: '이전',
        next: '다음',
        page: '{page}페이지',
        results: '{count}개 결과',
        backCollections: '도감 목록으로',
        images: '{count}장',
        score: '점수',
        favorites: '즐겨찾기',
        prompt: '긍정 프롬프트',
        negative: '부정 프롬프트',
        copy: '복사',
        copied: '복사됨',
        usePrompt: '생성에 적용',
        promptApplied: '생성 화면에 프롬프트를 적용했습니다',
        shareImage: '다운로드 / 공유',
        sharing: '이미지 준비 중…',
        metadata: '원본 데이터',
        artists: '작가',
        characters: '캐릭터',
        copyrights: '작품',
        general: '일반',
        meta: '메타데이터',
        noPrompt: '사용 가능한 프롬프트가 없습니다.',
      );
    default:
      return const _GalleryText(
        title: '在线画廊',
        source: '画廊来源',
        subtitle: '搜索、浏览并查看完整图片与可用提示词。',
        query: '搜索标签，多个标签用空格分隔',
        search: '搜索',
        refresh: '刷新',
        openSource: '打开来源网站',
        safeOnly: '仅显示全年龄',
        loading: '正在加载画廊…',
        empty: '没有符合的结果',
        retry: '重试',
        previous: '上一页',
        next: '下一页',
        page: '第 {page} 页',
        results: '{count} 个结果',
        backCollections: '返回图鉴列表',
        images: '{count} 张',
        score: '评分',
        favorites: '收藏',
        prompt: '正向提示词',
        negative: '负向提示词',
        copy: '复制',
        copied: '已复制',
        usePrompt: '应用到生成',
        promptApplied: '提示词已应用到生成页',
        shareImage: '下载 / 分享',
        sharing: '正在准备图片…',
        metadata: '原始数据',
        artists: '艺术家',
        characters: '角色',
        copyrights: '作品',
        general: '通用',
        meta: '元数据',
        noPrompt: '这个项目没有可用提示词。',
      );
  }
}

String _format(String value, String key, Object replacement) =>
    value.replaceAll('{$key}', '$replacement');

String _sourceLabel(OnlineGallerySource source, Object? language) {
  if (source != OnlineGallerySource.quicktag) return source.label;
  return switch (normalizeAppLocaleCode(language)) {
    'zh-TW' => '法典圖鑑',
    'en-US' => 'Prompt Codex',
    'ja-JP' => 'プロンプト図鑑',
    'ko-KR' => '프롬프트 도감',
    _ => '法典图鉴',
  };
}

String _friendlyGalleryError(
  Object exception,
  OnlineGallerySource source,
  Object? language,
) {
  final sourceName = _sourceLabel(source, language);
  final raw = exception.toString();
  final status =
      RegExp(r'HTTP\s+(\d{3})', caseSensitive: false).firstMatch(raw)?.group(1);
  return switch (normalizeAppLocaleCode(language)) {
    'zh-TW' => status == null
        ? '暫時無法載入 $sourceName。請檢查網路後重試，或開啟來源網站確認服務狀態。'
        : '$sourceName 暫時無法使用（HTTP $status）。請稍後重試，或開啟來源網站確認服務狀態。',
    'en-US' => status == null
        ? 'Could not load $sourceName. Check your connection and retry, or open the source website to verify its status.'
        : '$sourceName is temporarily unavailable (HTTP $status). Retry later or open the source website to verify its status.',
    'ja-JP' => status == null
        ? '$sourceName を読み込めません。通信を確認して再試行するか、配布元サイトの状態を確認してください。'
        : '$sourceName は一時的に利用できません（HTTP $status）。しばらくしてから再試行してください。',
    'ko-KR' => status == null
        ? '$sourceName을(를) 불러올 수 없습니다. 네트워크를 확인한 뒤 다시 시도하거나 원본 사이트 상태를 확인하세요.'
        : '$sourceName을(를) 일시적으로 사용할 수 없습니다(HTTP $status). 잠시 후 다시 시도하세요.',
    _ => status == null
        ? '暂时无法加载 $sourceName。请检查网络后重试，或打开来源网站确认服务状态。'
        : '$sourceName 暂时不可用（HTTP $status）。请稍后重试，或打开来源网站确认服务状态。',
  };
}

class OnlineGalleryScreen extends StatefulWidget {
  const OnlineGalleryScreen({super.key});

  @override
  State<OnlineGalleryScreen> createState() => _OnlineGalleryScreenState();
}

class _OnlineGalleryScreenState extends State<OnlineGalleryScreen> {
  final service = OnlineGalleryService();
  final query = TextEditingController();
  final scrollController = ScrollController();
  OnlineGallerySource source = OnlineGallerySource.aitag;
  OnlineGalleryPage? result;
  bool loading = false;
  bool safeOnly = true;
  String error = '';
  String collectionId = '';
  int aitagEpoch = 0;

  @override
  void dispose() {
    query.dispose();
    scrollController.dispose();
    service.close();
    super.dispose();
  }

  Future<void> _selectSource(OnlineGallerySource value) async {
    if (value == source) return;
    setState(() {
      source = value;
      result = null;
      error = '';
      collectionId = '';
      query.clear();
    });
    if (value != OnlineGallerySource.aitag) await _search(1);
  }

  Future<void> _search(int page) async {
    if (source == OnlineGallerySource.aitag) {
      setState(() => aitagEpoch++);
      return;
    }
    setState(() {
      loading = true;
      error = '';
    });
    try {
      final value = await service.search(
        source: source,
        page: page,
        query: query.text,
        collectionId: collectionId,
        safeOnly: safeOnly,
      );
      if (!mounted) return;
      setState(() => result = value);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (scrollController.hasClients) scrollController.jumpTo(0);
      });
    } catch (exception) {
      if (mounted) {
        final language = context.read<AppState>().settings.language;
        setState(
            () => error = _friendlyGalleryError(exception, source, language));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _openItem(OnlineGalleryItem item) {
    if (item.isCollection) {
      setState(() {
        collectionId = item.collectionId;
        query.clear();
      });
      _search(1);
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => _OnlineGalleryDetailScreen(
        service: service,
        item: item,
      ),
    ));
  }

  Widget _sourceToolbar(
      BuildContext context, _GalleryText text, String language) {
    final selector = DropdownButtonFormField<OnlineGallerySource>(
      value: source,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: text.source,
        prefixIcon: const Icon(Icons.public_outlined),
      ),
      items: OnlineGallerySource.values
          .map((value) => DropdownMenuItem(
                value: value,
                child: Text(_sourceLabel(value, language),
                    overflow: TextOverflow.ellipsis),
              ))
          .toList(),
      onChanged: loading
          ? null
          : (value) {
              if (value != null) _selectSource(value);
            },
    );
    return Material(
      color: Theme.of(context).colorScheme.surface,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
        child: LayoutBuilder(builder: (context, constraints) {
          if (constraints.maxWidth < 680) return selector;
          return Row(children: [
            SizedBox(width: 300, child: selector),
            const SizedBox(width: 16),
            Expanded(
              child: Text(text.subtitle,
                  style: Theme.of(context).textTheme.bodyMedium),
            ),
          ]);
        }),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final language =
        context.select<AppState, String>((state) => state.settings.language);
    final text = _galleryText(language);
    return Scaffold(
      appBar: AppBar(
        title: Text(text.title),
        actions: [
          IconButton(
            tooltip: text.refresh,
            onPressed: loading ? null : () => _search(result?.page ?? 1),
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: text.openSource,
            onPressed: () => launchUrl(Uri.parse(source.siteUrl),
                mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.open_in_new),
          ),
        ],
      ),
      body: Column(
        children: [
          _sourceToolbar(context, text, language),
          const Divider(height: 1),
          Expanded(
            child: source == OnlineGallerySource.aitag
                ? AitagGalleryScreen(
                    key: ValueKey('aitag-gallery-$aitagEpoch'),
                    showAppBar: false,
                  )
                : _buildExternal(context, text),
          ),
        ],
      ),
    );
  }

  Widget _buildExternal(BuildContext context, _GalleryText text) {
    return LayoutBuilder(builder: (context, constraints) {
      final columns = constraints.maxWidth >= 1180
          ? 5
          : constraints.maxWidth >= 880
              ? 4
              : constraints.maxWidth >= 620
                  ? 3
                  : constraints.maxWidth >= 390
                      ? 2
                      : 1;
      return Scrollbar(
        controller: scrollController,
        thumbVisibility: true,
        interactive: true,
        child: CustomScrollView(
          controller: scrollController,
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (collectionId.isNotEmpty)
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: TextButton.icon(
                              onPressed: loading
                                  ? null
                                  : () {
                                      setState(() {
                                        collectionId = '';
                                        query.clear();
                                      });
                                      _search(1);
                                    },
                              icon: const Icon(Icons.arrow_back),
                              label: Text(text.backCollections),
                            ),
                          ),
                        TextField(
                          controller: query,
                          textInputAction: TextInputAction.search,
                          onSubmitted: (_) => _search(1),
                          decoration: InputDecoration(
                            prefixIcon: const Icon(Icons.search),
                            hintText: text.query,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            FilterChip(
                              avatar:
                                  const Icon(Icons.shield_outlined, size: 18),
                              label: Text(text.safeOnly),
                              selected: safeOnly,
                              onSelected: loading
                                  ? null
                                  : (value) {
                                      setState(() => safeOnly = value);
                                      _search(1);
                                    },
                            ),
                            FilledButton.icon(
                              onPressed: loading ? null : () => _search(1),
                              icon: const Icon(Icons.search),
                              label: Text(text.search),
                            ),
                            if (result?.total != null)
                              Text(_format(
                                  text.results, 'count', result!.total!)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            if (loading)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const CircularProgressIndicator(),
                    const SizedBox(height: 12),
                    Text(text.loading),
                  ]),
                ),
              )
            else if (error.isNotEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.cloud_off_outlined, size: 36),
                      const SizedBox(height: 10),
                      Text(error, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      OutlinedButton.icon(
                        onPressed: () => _search(result?.page ?? 1),
                        icon: const Icon(Icons.refresh),
                        label: Text(text.retry),
                      ),
                    ]),
                  ),
                ),
              )
            else if (result == null || result!.items.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: Text(text.empty)),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverGrid.builder(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                    childAspectRatio: columns == 1 ? 1.35 : .72,
                  ),
                  itemCount: result!.items.length,
                  itemBuilder: (context, index) => _GalleryCard(
                    item: result!.items[index],
                    text: text,
                    onTap: () => _openItem(result!.items[index]),
                  ),
                ),
              ),
            if (!loading && result != null && result!.items.isNotEmpty)
              SliverToBoxAdapter(
                child: SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        OutlinedButton(
                          onPressed: result!.page > 1
                              ? () => _search(result!.page - 1)
                              : null,
                          child: Text(text.previous),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                          child: Text(_format(text.page, 'page', result!.page)),
                        ),
                        OutlinedButton(
                          onPressed: result!.hasMore
                              ? () => _search(result!.page + 1)
                              : null,
                          child: Text(text.next),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
    });
  }
}

class _GalleryCard extends StatelessWidget {
  final OnlineGalleryItem item;
  final _GalleryText text;
  final VoidCallback onTap;

  const _GalleryCard({
    required this.item,
    required this.text,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _NetworkGalleryImage(
                      url: item.cover.previewUrl,
                      source: item.source,
                      fit: BoxFit.cover,
                    ),
                    PositionedDirectional(
                      top: 7,
                      start: 7,
                      child: Chip(
                        visualDensity: VisualDensity.compact,
                        label: Text(item.isCollection
                            ? _format(text.images, 'count', item.mediaCount)
                            : item.rating.toUpperCase()),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.title.isEmpty ? '#${item.id}' : item.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall),
                    if (item.author.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(item.author,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                    if (item.description.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(item.description,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}

class _NetworkGalleryImage extends StatelessWidget {
  final String url;
  final OnlineGallerySource source;
  final BoxFit fit;

  const _NetworkGalleryImage({
    required this.url,
    required this.source,
    required this.fit,
  });

  @override
  Widget build(BuildContext context) {
    if (url.isEmpty) {
      return const Center(
          child: Icon(Icons.image_not_supported_outlined, size: 36));
    }
    return Image.network(
      url,
      fit: fit,
      headers: {
        'Referer': '${source.siteUrl}/',
        'User-Agent': 'Langbai-NovelAI-Studio-Mobile'
      },
      frameBuilder: (context, child, frame, syncLoaded) {
        if (syncLoaded || frame != null) return child;
        return const Center(child: CircularProgressIndicator(strokeWidth: 2));
      },
      errorBuilder: (_, __, ___) =>
          const Center(child: Icon(Icons.broken_image_outlined, size: 34)),
    );
  }
}

class _OnlineGalleryDetailScreen extends StatefulWidget {
  final OnlineGalleryService service;
  final OnlineGalleryItem item;

  const _OnlineGalleryDetailScreen({required this.service, required this.item});

  @override
  State<_OnlineGalleryDetailScreen> createState() =>
      _OnlineGalleryDetailScreenState();
}

class _OnlineGalleryDetailScreenState
    extends State<_OnlineGalleryDetailScreen> {
  late final Future<OnlineGalleryDetail> detail =
      widget.service.detail(widget.item);
  bool sharing = false;

  Future<void> _share(OnlineGalleryMedia media, _GalleryText text) async {
    if (sharing || media.downloadUrl.isEmpty) return;
    setState(() => sharing = true);
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(SnackBar(content: Text(text.sharing)));
    try {
      final response = await http.get(Uri.parse(media.downloadUrl), headers: {
        'Referer': '${widget.item.source.siteUrl}/',
        'User-Agent': 'Langbai-NovelAI-Studio-Mobile',
      }).timeout(const Duration(minutes: 2));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw HttpException('HTTP ${response.statusCode}');
      }
      final path = Uri.parse(media.downloadUrl).path;
      final extension =
          RegExp(r'\.([a-zA-Z0-9]{2,5})$').firstMatch(path)?.group(1) ?? 'png';
      final temp = await getTemporaryDirectory();
      final file = File(
          '${temp.path}${Platform.pathSeparator}online-${widget.item.source.id}-${widget.item.id}.$extension');
      await file.writeAsBytes(response.bodyBytes, flush: true);
      await Share.shareXFiles([XFile(file.path)], text: widget.item.title);
    } catch (error) {
      if (mounted) {
        final language = context.read<AppState>().settings.language;
        messenger.showSnackBar(SnackBar(
            content: Text(
                _friendlyGalleryError(error, widget.item.source, language))));
      }
    } finally {
      if (mounted) setState(() => sharing = false);
    }
  }

  void _copy(String value, _GalleryText text) {
    Clipboard.setData(ClipboardData(text: value));
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(text.copied)));
  }

  void _apply(OnlineGalleryDetail detail, _GalleryText text) {
    if (detail.prompt.trim().isEmpty) return;
    final state = context.read<AppState>();
    state.setParam((params) {
      params.positivePrompt = detail.prompt.trim();
      if (detail.negativePrompt.trim().isNotEmpty) {
        params.negativePrompt = detail.negativePrompt.trim();
      }
    });
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(text.promptApplied)));
  }

  @override
  Widget build(BuildContext context) {
    final language =
        context.select<AppState, String>((state) => state.settings.language);
    final text = _galleryText(language);
    return Scaffold(
      appBar: AppBar(
        title: Text(
            widget.item.title.isEmpty
                ? '#${widget.item.id}'
                : widget.item.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            tooltip: text.openSource,
            onPressed: () => launchUrl(Uri.parse(widget.item.sourceUrl),
                mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.open_in_new),
          ),
        ],
      ),
      body: FutureBuilder<OnlineGalleryDetail>(
        future: detail,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError || !snapshot.hasData) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                    snapshot.error == null
                        ? text.empty
                        : _friendlyGalleryError(
                            snapshot.error!, widget.item.source, language),
                    textAlign: TextAlign.center),
              ),
            );
          }
          final value = snapshot.data!;
          return LayoutBuilder(builder: (context, constraints) {
            final split = constraints.maxWidth >= 820;
            final image = _DetailMedia(
              detail: value,
              text: text,
              onShare: _share,
              sharing: sharing,
            );
            final info = _DetailInfo(
              detail: value,
              text: text,
              onCopy: _copy,
              onApply: _apply,
            );
            if (split) {
              return Row(children: [
                Expanded(flex: 6, child: image),
                const VerticalDivider(width: 1),
                Expanded(flex: 4, child: info),
              ]);
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 28),
              children: [
                SizedBox(height: constraints.maxHeight * .58, child: image),
                const SizedBox(height: 12),
                info,
              ],
            );
          });
        },
      ),
    );
  }
}

class _DetailMedia extends StatefulWidget {
  final OnlineGalleryDetail detail;
  final _GalleryText text;
  final Future<void> Function(OnlineGalleryMedia media, _GalleryText text)
      onShare;
  final bool sharing;

  const _DetailMedia({
    required this.detail,
    required this.text,
    required this.onShare,
    required this.sharing,
  });

  @override
  State<_DetailMedia> createState() => _DetailMediaState();
}

class _DetailMediaState extends State<_DetailMedia> {
  int index = 0;

  @override
  Widget build(BuildContext context) {
    final media = widget.detail.media.isEmpty
        ? [widget.detail.item.cover]
        : widget.detail.media;
    return Stack(children: [
      Positioned.fill(
        child: PageView.builder(
          itemCount: media.length,
          onPageChanged: (value) => setState(() => index = value),
          itemBuilder: (context, itemIndex) => InteractiveViewer(
            minScale: 1,
            maxScale: 5,
            child: Center(
              child: _NetworkGalleryImage(
                url: media[itemIndex].displayUrl,
                source: widget.detail.item.source,
                fit: BoxFit.contain,
              ),
            ),
          ),
        ),
      ),
      if (media.length > 1)
        PositionedDirectional(
          top: 10,
          end: 10,
          child: Chip(label: Text('${index + 1} / ${media.length}')),
        ),
      PositionedDirectional(
        end: 10,
        bottom: 10,
        child: FilledButton.tonalIcon(
          onPressed: widget.sharing
              ? null
              : () => widget.onShare(media[index], widget.text),
          icon: widget.sharing
              ? const SizedBox.square(
                  dimension: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.download_outlined),
          label: Text(widget.text.shareImage),
        ),
      ),
    ]);
  }
}

class _DetailInfo extends StatelessWidget {
  final OnlineGalleryDetail detail;
  final _GalleryText text;
  final void Function(String value, _GalleryText text) onCopy;
  final void Function(OnlineGalleryDetail detail, _GalleryText text) onApply;

  const _DetailInfo({
    required this.detail,
    required this.text,
    required this.onCopy,
    required this.onApply,
  });

  @override
  Widget build(BuildContext context) {
    final item = detail.item;
    final groups = <(String, List<String>)>[
      (text.artists, item.tags.artists),
      (text.characters, item.tags.characters),
      (text.copyrights, item.tags.copyrights),
      (text.general, item.tags.general),
      (text.meta, item.tags.meta),
    ];
    return ListView(
      shrinkWrap: true,
      physics: const ClampingScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Text(item.title.isEmpty ? '#${item.id}' : item.title,
            style: Theme.of(context).textTheme.headlineSmall),
        if (item.author.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(item.author, style: Theme.of(context).textTheme.bodyMedium),
        ],
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          if (item.score != 0) Chip(label: Text('${text.score} ${item.score}')),
          if (item.favoriteCount != 0)
            Chip(label: Text('${text.favorites} ${item.favoriteCount}')),
          Chip(label: Text(item.rating.toUpperCase())),
        ]),
        const Divider(height: 28),
        if (detail.prompt.isEmpty)
          Text(text.noPrompt)
        else ...[
          _PromptBlock(
            title: text.prompt,
            value: detail.prompt,
            copy: text.copy,
            onCopy: () => onCopy(detail.prompt, text),
          ),
          if (detail.negativePrompt.isNotEmpty) ...[
            const SizedBox(height: 12),
            _PromptBlock(
              title: text.negative,
              value: detail.negativePrompt,
              copy: text.copy,
              onCopy: () => onCopy(detail.negativePrompt, text),
            ),
          ],
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => onApply(detail, text),
            icon: const Icon(Icons.auto_awesome_outlined),
            label: Text(text.usePrompt),
          ),
        ],
        for (final group in groups)
          if (group.$2.isNotEmpty) ...[
            const SizedBox(height: 18),
            Text('${group.$1} (${group.$2.length})',
                style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: group.$2
                  .map((tag) => InputChip(
                        label: Text(tag.replaceAll('_', ' ')),
                        onPressed: () => onCopy(tag, text),
                      ))
                  .toList(),
            ),
          ],
        if (detail.metadata.isNotEmpty) ...[
          const SizedBox(height: 16),
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: Text(text.metadata),
            children: [
              SelectableText(
                detail.metadata.toString(),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _PromptBlock extends StatelessWidget {
  final String title;
  final String value;
  final String copy;
  final VoidCallback onCopy;

  const _PromptBlock({
    required this.title,
    required this.value,
    required this.copy,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainer,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(children: [
                Expanded(
                  child: Text(title,
                      style: Theme.of(context).textTheme.titleSmall),
                ),
                TextButton.icon(
                  onPressed: onCopy,
                  icon: const Icon(Icons.copy_outlined, size: 18),
                  label: Text(copy),
                ),
              ]),
              SelectableText(value),
            ],
          ),
        ),
      );
}

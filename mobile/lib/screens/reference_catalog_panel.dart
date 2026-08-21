import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../references/reference_catalog.dart';
import '../state/app_state.dart';

const _all = '__all__';

const _copy = <String, Map<String, String>>{
  'zh-CN': {
    'title': '在线角色精准参考库',
    'hint': '从 Gitee 中国大陆线路读取，只下载每个角色与形态的最佳精准参考图。',
    'load': '读取在线目录',
    'refresh': '刷新目录',
    'loading': '正在读取…',
    'search': '搜索角色、形态或游戏',
    'game': '游戏',
    'category': '分类',
    'perRow': '每排显示',
    'auto': '自动',
    'all': '全部',
    'inGame': '游戏内角色图',
    'illustration': '角色立绘',
    'resource': '角色资源',
    'download': '下载到本机',
    'downloaded': '已下载',
    'progress': '下载进度',
    'size': '大小',
    'retry': '重试',
    'unavailable': '在线目录暂不可用',
    'empty': '没有匹配的角色',
    'more': '加载更多',
    'result': '项角色与形态',
    'preview': '预览',
    'seriesTitle': '整系列下载',
    'seriesHint': '一次下载该游戏全部精准参考图，已保存项目会自动跳过。',
    'selectSeries': '先选择一个游戏系列，即可查看总大小并整包下载。',
    'total': '系列总计',
    'pending': '待下载',
    'saved': '已保存',
    'downloadSeries': '下载整个系列',
    'downloadingSeries': '正在下载系列',
    'seriesDone': '系列下载完成',
    'seriesPartial': '部分项目失败，再次点击可重试未完成项目。',
    'failed': '失败',
    'confirmSeries': '确认下载整个系列？',
    'confirm': '开始下载',
    'cancel': '取消',
  },
  'zh-TW': {
    'title': '線上角色精準參考庫',
    'hint': '從 Gitee 中國大陸線路讀取，只下載每個角色與形態的最佳精準參考圖。',
    'load': '讀取線上目錄',
    'refresh': '重新整理',
    'loading': '讀取中…',
    'search': '搜尋角色、形態或遊戲',
    'game': '遊戲',
    'category': '分類',
    'perRow': '每列顯示',
    'auto': '自動',
    'all': '全部',
    'inGame': '遊戲內角色圖',
    'illustration': '角色立繪',
    'resource': '角色資源',
    'download': '下載到本機',
    'downloaded': '已下載',
    'progress': '下載進度',
    'size': '大小',
    'retry': '重試',
    'unavailable': '線上目錄暫時無法使用',
    'empty': '沒有相符的角色',
    'more': '載入更多',
    'result': '項角色與形態',
    'preview': '預覽',
    'seriesTitle': '整系列下載',
    'seriesHint': '一次下載該遊戲全部精準參考圖，已儲存項目會自動略過。',
    'selectSeries': '先選擇一個遊戲系列，即可查看總大小並整包下載。',
    'total': '系列總計',
    'pending': '待下載',
    'saved': '已儲存',
    'downloadSeries': '下載整個系列',
    'downloadingSeries': '正在下載系列',
    'seriesDone': '系列下載完成',
    'seriesPartial': '部分項目失敗，再次點擊可重試未完成項目。',
    'failed': '失敗',
    'confirmSeries': '確認下載整個系列？',
    'confirm': '開始下載',
    'cancel': '取消',
  },
  'en-US': {
    'title': 'Online precise-reference library',
    'hint':
        'Uses the mainland Gitee route first and downloads only the best precise reference for each character and form.',
    'load': 'Load online catalog',
    'refresh': 'Refresh',
    'loading': 'Loading…',
    'search': 'Search character, form, or game',
    'game': 'Game',
    'category': 'Category',
    'perRow': 'Cards per row',
    'auto': 'Auto',
    'all': 'All',
    'inGame': 'In-game character',
    'illustration': 'Character illustration',
    'resource': 'Character resource',
    'download': 'Download locally',
    'downloaded': 'Downloaded',
    'progress': 'Download',
    'size': 'Size',
    'retry': 'Retry',
    'unavailable': 'Online catalog unavailable',
    'empty': 'No matching characters',
    'more': 'Load more',
    'result': 'characters and forms',
    'preview': 'Preview',
    'seriesTitle': 'Download a full series',
    'seriesHint':
        'Download every precise reference in this game. Saved items are skipped.',
    'selectSeries':
        'Choose a game series to see its total size and download it as a set.',
    'total': 'Series total',
    'pending': 'Pending',
    'saved': 'Saved',
    'downloadSeries': 'Download full series',
    'downloadingSeries': 'Downloading series',
    'seriesDone': 'Series download complete',
    'seriesPartial':
        'Some items failed. Run it again to retry unfinished items.',
    'failed': 'Failed',
    'confirmSeries': 'Download this full series?',
    'confirm': 'Start download',
    'cancel': 'Cancel',
  },
  'ja-JP': {
    'title': 'オンライン精密参照ライブラリ',
    'hint': '中国本土では Gitee を優先し、各キャラクター／形態の最適な精密参照だけを保存します。',
    'load': 'オンラインカタログを読む',
    'refresh': '更新',
    'loading': '読込中…',
    'search': 'キャラクター・形態・ゲームを検索',
    'game': 'ゲーム',
    'category': '分類',
    'perRow': '1行の件数',
    'auto': '自動',
    'all': 'すべて',
    'inGame': 'ゲーム内キャラクター',
    'illustration': 'キャラクター立ち絵',
    'resource': 'キャラクター素材',
    'download': '端末に保存',
    'downloaded': '保存済み',
    'progress': 'ダウンロード',
    'size': 'サイズ',
    'retry': '再試行',
    'unavailable': 'オンラインカタログを利用できません',
    'empty': '一致するキャラクターがありません',
    'more': 'さらに読み込む',
    'result': '件のキャラクター／形態',
    'preview': 'プレビュー',
    'seriesTitle': 'シリーズ一括保存',
    'seriesHint': 'このゲームの精密参照をまとめて保存します。保存済み項目はスキップします。',
    'selectSeries': 'ゲームシリーズを選択すると、合計サイズを確認して一括保存できます。',
    'total': 'シリーズ合計',
    'pending': '未保存',
    'saved': '保存済み',
    'downloadSeries': 'シリーズを一括保存',
    'downloadingSeries': 'シリーズを保存中',
    'seriesDone': 'シリーズの保存が完了しました',
    'seriesPartial': '一部の保存に失敗しました。もう一度実行すると再試行できます。',
    'failed': '失敗',
    'confirmSeries': 'シリーズ全体を保存しますか？',
    'confirm': '保存を開始',
    'cancel': 'キャンセル',
  },
  'ko-KR': {
    'title': '온라인 정밀 참조 라이브러리',
    'hint': '중국 본토에서는 Gitee를 우선하며 각 캐릭터와 형태의 최적 정밀 참조만 저장합니다.',
    'load': '온라인 카탈로그 불러오기',
    'refresh': '새로고침',
    'loading': '불러오는 중…',
    'search': '캐릭터·형태·게임 검색',
    'game': '게임',
    'category': '분류',
    'perRow': '행당 카드',
    'auto': '자동',
    'all': '전체',
    'inGame': '게임 내 캐릭터',
    'illustration': '캐릭터 일러스트',
    'resource': '캐릭터 리소스',
    'download': '기기에 저장',
    'downloaded': '저장됨',
    'progress': '다운로드',
    'size': '크기',
    'retry': '재시도',
    'unavailable': '온라인 카탈로그를 사용할 수 없습니다',
    'empty': '일치하는 캐릭터가 없습니다',
    'more': '더 불러오기',
    'result': '개 캐릭터 및 형태',
    'preview': '미리보기',
    'seriesTitle': '시리즈 전체 다운로드',
    'seriesHint': '이 게임의 모든 정밀 참조를 한 번에 저장합니다. 저장된 항목은 건너뜁니다.',
    'selectSeries': '게임 시리즈를 선택하면 전체 크기를 확인하고 한 번에 다운로드할 수 있습니다.',
    'total': '시리즈 전체',
    'pending': '다운로드 대기',
    'saved': '저장됨',
    'downloadSeries': '시리즈 전체 다운로드',
    'downloadingSeries': '시리즈 다운로드 중',
    'seriesDone': '시리즈 다운로드 완료',
    'seriesPartial': '일부 항목이 실패했습니다. 다시 실행하면 재시도합니다.',
    'failed': '실패',
    'confirmSeries': '시리즈 전체를 다운로드할까요?',
    'confirm': '다운로드 시작',
    'cancel': '취소',
  },
};

Map<String, String> _text(String language) =>
    _copy[language] ?? _copy['zh-CN']!;

class ReferenceCatalogPanel extends StatefulWidget {
  final bool autoLoad;
  final ReferenceCatalog? initialCatalog;
  final String? initialGame;

  const ReferenceCatalogPanel({
    super.key,
    this.autoLoad = false,
    this.initialCatalog,
    this.initialGame,
  });

  @override
  State<ReferenceCatalogPanel> createState() => _ReferenceCatalogPanelState();
}

class _ReferenceCatalogPanelState extends State<ReferenceCatalogPanel> {
  ReferenceCatalog? _catalog;
  String _query = '';
  String _game = _all;
  String _category = _all;
  String _error = '';
  bool _loading = false;
  int _visible = 60;
  int _columns = 0;
  final Map<String, int> _progress = {};
  final Set<String> _active = {};
  bool _bulkActive = false;
  String _bulkGame = '';
  int _bulkTotal = 0;
  int _bulkDone = 0;
  int _bulkFailed = 0;
  int _bulkTotalBytes = 0;
  int _bulkProcessedBytes = 0;

  @override
  void initState() {
    super.initState();
    _catalog = widget.initialCatalog;
    _game = widget.initialGame ?? _all;
    if (widget.autoLoad) _load();
  }

  Future<void> _load({bool refresh = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final catalog = await loadOnlineReferenceCatalog(refresh: refresh);
      if (!mounted) return;
      setState(() {
        _catalog = catalog;
        _visible = 60;
      });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<ReferenceCatalogGame> get _games {
    final catalog = _catalog;
    if (catalog == null) return const [];
    if (catalog.games.isNotEmpty) return catalog.games;
    final ids = catalog.assets.map((asset) => asset.game).toSet().toList()
      ..sort();
    return ids
        .map((id) => ReferenceCatalogGame(
              id: id,
              names: catalog.assets
                  .firstWhere((asset) => asset.game == id)
                  .gameNames,
              categories: catalog.assets
                  .where((asset) => asset.game == id)
                  .map((asset) => asset.category)
                  .toSet()
                  .toList(),
            ))
        .toList();
  }

  String _gameName(String id, String language) {
    final game = _games.where((item) => item.id == id).firstOrNull;
    return game?.names[language] ?? game?.names['zh-CN'] ?? id;
  }

  List<String> get _categories {
    if (_catalog == null) return const [];
    if (_game == _all) {
      return _catalog!.assets.map((asset) => asset.category).toSet().toList();
    }
    return _games.where((item) => item.id == _game).firstOrNull?.categories ??
        const [];
  }

  String _categoryName(String value, Map<String, String> text) =>
      value == '游戏内角色图'
          ? text['inGame']!
          : value == '角色立绘'
              ? text['illustration']!
              : text['resource']!;

  List<ReferenceCatalogAsset> get _filtered {
    final needle = _query.trim().toLowerCase();
    return (_catalog?.assets ?? const [])
        .where((asset) =>
            (_game == _all || asset.game == _game) &&
            (_category == _all || asset.category == _category) &&
            (needle.isEmpty || asset.searchText.contains(needle)))
        .toList();
  }

  List<ReferenceCatalogAsset> get _seriesAssets => _game == _all
      ? const []
      : (_catalog?.assets ?? const [])
          .where((asset) => asset.game == _game)
          .toList();

  Future<bool> _download(BuildContext context, ReferenceCatalogAsset asset,
      String language, Map<String, String> text,
      {bool notify = true,
      void Function(int loaded, int total)? onBytes}) async {
    final state = context.read<AppState>();
    if (_active.contains(asset.id) ||
        state.referencePresets.any((preset) => preset.sourceId == asset.id)) {
      return true;
    }
    setState(() {
      _active.add(asset.id);
      _progress[asset.id] = 0;
    });
    try {
      final bytes = await downloadReferenceCatalogAsset(
        asset,
        onProgress: (loaded, total) {
          if (!mounted) return;
          onBytes?.call(loaded, total);
          setState(() => _progress[asset.id] = total <= 0
              ? 0
              : (loaded * 100 / total).round().clamp(0, 100).toInt());
        },
      );
      final error = await state.saveDownloadedPreciseReferencePreset(
        bytes: bytes,
        sourceId: asset.id,
        name: asset.nameFor(language),
        group: '${asset.game} · ${asset.category}',
        width: asset.width,
        height: asset.height,
        sourceNames: asset.names,
        sourceGameNames: asset.gameNames,
        sourceGameId: asset.game,
        sourceCategory: asset.category,
      );
      if (!context.mounted) return false;
      if (notify) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error ?? state.displayStatus)),
        );
      }
      return error == null;
    } catch (error) {
      if (notify && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${text['unavailable']}: $error')),
        );
      }
      return false;
    } finally {
      if (mounted) setState(() => _active.remove(asset.id));
    }
  }

  Future<void> _downloadSeries(
    BuildContext context,
    String language,
    Map<String, String> text,
  ) async {
    if (_bulkActive || _game == _all) return;
    final state = context.read<AppState>();
    final downloaded = state.referencePresets
        .where((preset) => preset.sourceId.isNotEmpty)
        .map((preset) => preset.sourceId)
        .toSet();
    final seriesAssets = _seriesAssets;
    final queue =
        seriesAssets.where((asset) => !downloaded.contains(asset.id)).toList();
    if (queue.isEmpty) return;
    final totalBytes = queue.fold<int>(0, (sum, asset) => sum + asset.bytes);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        icon: const Icon(Icons.cloud_download_outlined),
        title: Text(text['confirmSeries']!),
        content: Text(
          '${_gameName(_game, language)}\n${text['pending']} ${queue.length} · ${formatReferenceCatalogBytes(totalBytes)}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(text['cancel']!),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(text['confirm']!),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted || !context.mounted) return;
    setState(() {
      _bulkActive = true;
      _bulkGame = _game;
      _bulkTotal = queue.length;
      _bulkDone = 0;
      _bulkFailed = 0;
      _bulkTotalBytes = totalBytes;
      _bulkProcessedBytes = 0;
    });
    var processedBytes = 0;
    for (final asset in queue) {
      if (!mounted || !context.mounted) break;
      final success = await _download(
        context,
        asset,
        language,
        text,
        notify: false,
        onBytes: (loaded, total) {
          if (!mounted) return;
          final estimate = asset.bytes > 0 ? asset.bytes : total;
          setState(() => _bulkProcessedBytes =
              processedBytes + loaded.clamp(0, estimate).toInt());
        },
      );
      if (!mounted) break;
      processedBytes += asset.bytes;
      setState(() {
        if (success) {
          _bulkDone += 1;
        } else {
          _bulkFailed += 1;
        }
        _bulkProcessedBytes = processedBytes;
      });
    }
    if (!mounted || !context.mounted) return;
    setState(() => _bulkActive = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(_bulkFailed == 0
          ? '${text['seriesDone']} · $_bulkDone'
          : '${text['seriesPartial']} ${text['failed']} $_bulkFailed'),
    ));
  }

  Future<void> _preview(BuildContext context, ReferenceCatalogAsset asset) =>
      showDialog<void>(
        context: context,
        builder: (dialogContext) => Dialog.fullscreen(
          child: SafeArea(
            child: Stack(children: [
              Positioned.fill(
                child: InteractiveViewer(
                  minScale: .5,
                  maxScale: 5,
                  child: Center(
                      child: _RemoteCatalogImage(
                    urls: asset.thumbnailUrls,
                    fit: BoxFit.contain,
                  )),
                ),
              ),
              Positioned(
                right: 12,
                top: 12,
                child: IconButton.filledTonal(
                  onPressed: () => Navigator.pop(dialogContext),
                  icon: const Icon(Icons.close),
                ),
              ),
            ]),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final language = state.settings.language;
    final text = _text(language);
    final filtered = _filtered;
    final visible = filtered.take(_visible).toList();
    final downloaded = state.referencePresets
        .where((preset) => preset.sourceId.isNotEmpty)
        .map((preset) => preset.sourceId)
        .toSet();
    final seriesAssets = _seriesAssets;
    final seriesTotalBytes =
        seriesAssets.fold<int>(0, (sum, asset) => sum + asset.bytes);
    final seriesPending =
        seriesAssets.where((asset) => !downloaded.contains(asset.id)).toList();
    final seriesPendingBytes =
        seriesPending.fold<int>(0, (sum, asset) => sum + asset.bytes);
    final bulkPercent = _bulkTotalBytes > 0
        ? (_bulkProcessedBytes / _bulkTotalBytes).clamp(0, 1).toDouble()
        : _bulkTotal > 0
            ? ((_bulkDone + _bulkFailed) / _bulkTotal).clamp(0, 1).toDouble()
            : 0.0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              LayoutBuilder(builder: (context, constraints) {
                final compact = constraints.maxWidth < 520;
                final intro = Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      backgroundColor:
                          Theme.of(context).colorScheme.primaryContainer,
                      child: const Icon(Icons.cloud_download_outlined),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            text['title']!,
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 3),
                          Text(text['hint']!,
                              style: Theme.of(context).textTheme.bodySmall),
                        ],
                      ),
                    ),
                  ],
                );
                final loadButton = FilledButton.tonalIcon(
                  onPressed:
                      _loading ? null : () => _load(refresh: _catalog != null),
                  icon: _loading
                      ? const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : Icon(_catalog == null
                          ? Icons.cloud_download_outlined
                          : Icons.refresh),
                  label: Text(_loading
                      ? text['loading']!
                      : _catalog == null
                          ? text['load']!
                          : text['refresh']!),
                );
                if (compact) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      intro,
                      const SizedBox(height: 12),
                      loadButton,
                    ],
                  );
                }
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: intro),
                    const SizedBox(width: 12),
                    loadButton,
                  ],
                );
              }),
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 12),
                Card(
                  color: Theme.of(context).colorScheme.errorContainer,
                  child: ListTile(
                    leading: const Icon(Icons.cloud_off_outlined),
                    title: Text(text['unavailable']!),
                    subtitle: Text(_error,
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                    trailing: TextButton(
                      onPressed: _loading ? null : () => _load(),
                      child: Text(text['retry']!),
                    ),
                  ),
                ),
              ],
              if (_catalog != null) ...[
                const SizedBox(height: 14),
                TextField(
                  decoration: InputDecoration(
                    labelText: text['search'],
                    prefixIcon: const Icon(Icons.search),
                    border: const OutlineInputBorder(),
                    suffixIcon: _query.isEmpty
                        ? null
                        : IconButton(
                            onPressed: () => setState(() {
                              _query = '';
                              _visible = 60;
                            }),
                            icon: const Icon(Icons.close),
                          ),
                  ),
                  onChanged: (value) => setState(() {
                    _query = value;
                    _visible = 60;
                  }),
                ),
                const SizedBox(height: 10),
                LayoutBuilder(builder: (context, constraints) {
                  final stacked = constraints.maxWidth < 560;
                  final controls = <Widget>[
                    DropdownButtonFormField<String>(
                      value: _game,
                      isExpanded: true,
                      decoration: InputDecoration(
                          labelText: text['game'],
                          border: const OutlineInputBorder()),
                      items: [
                        DropdownMenuItem(
                            value: _all, child: Text(text['all']!)),
                        for (final game in _games)
                          DropdownMenuItem(
                              value: game.id,
                              child: Text(_gameName(game.id, language),
                                  overflow: TextOverflow.ellipsis)),
                      ],
                      onChanged: (value) => setState(() {
                        _game = value ?? _all;
                        _category = _all;
                        _visible = 60;
                      }),
                    ),
                    if (_game == _all || _categories.length > 1)
                      DropdownButtonFormField<String>(
                        value: _category,
                        isExpanded: true,
                        decoration: InputDecoration(
                            labelText: text['category'],
                            border: const OutlineInputBorder()),
                        items: [
                          DropdownMenuItem(
                              value: _all, child: Text(text['all']!)),
                          for (final category in _categories)
                            DropdownMenuItem(
                                value: category,
                                child: Text(_categoryName(category, text),
                                    overflow: TextOverflow.ellipsis)),
                        ],
                        onChanged: (value) => setState(() {
                          _category = value ?? _all;
                          _visible = 60;
                        }),
                      ),
                    DropdownButtonFormField<int>(
                      value: _columns,
                      isExpanded: true,
                      decoration: InputDecoration(
                          labelText: text['perRow'],
                          border: const OutlineInputBorder()),
                      items: [
                        DropdownMenuItem(value: 0, child: Text(text['auto']!)),
                        for (final value in const [1, 2, 3, 4, 5])
                          DropdownMenuItem(value: value, child: Text('$value')),
                      ],
                      onChanged: (value) =>
                          setState(() => _columns = value ?? 0),
                    ),
                  ];
                  return stacked
                      ? Column(children: [
                          for (var i = 0; i < controls.length; i++) ...[
                            controls[i],
                            if (i < controls.length - 1)
                              const SizedBox(height: 10)
                          ]
                        ])
                      : Row(children: [
                          for (var i = 0; i < controls.length; i++) ...[
                            Expanded(child: controls[i]),
                            if (i < controls.length - 1)
                              const SizedBox(width: 10)
                          ]
                        ]);
                }),
                const SizedBox(height: 12),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 240),
                  switchInCurve: Curves.easeOutCubic,
                  switchOutCurve: Curves.easeInCubic,
                  child: _game == _all
                      ? Card(
                          key: const ValueKey('reference-series-empty'),
                          color:
                              Theme.of(context).colorScheme.surfaceContainerLow,
                          margin: EdgeInsets.zero,
                          child: ListTile(
                            leading: const Icon(Icons.info_outline),
                            title: Text(text['selectSeries']!),
                          ),
                        )
                      : Card(
                          key: ValueKey('reference-series-$_game'),
                          margin: EdgeInsets.zero,
                          color: Theme.of(context)
                              .colorScheme
                              .primaryContainer
                              .withOpacity(.34),
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    CircleAvatar(
                                      backgroundColor: Theme.of(context)
                                          .colorScheme
                                          .primaryContainer,
                                      child: const Icon(
                                          Icons.cloud_download_outlined),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(text['seriesTitle']!,
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .labelMedium
                                                  ?.copyWith(
                                                      color: Theme.of(context)
                                                          .colorScheme
                                                          .primary,
                                                      fontWeight:
                                                          FontWeight.w800)),
                                          Text(_gameName(_game, language),
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .titleMedium
                                                  ?.copyWith(
                                                      fontWeight:
                                                          FontWeight.w800)),
                                          Text(text['seriesHint']!,
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .bodySmall),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    Chip(
                                      label: Text(
                                          '${text['total']} ${seriesAssets.length} · ${formatReferenceCatalogBytes(seriesTotalBytes)}'),
                                    ),
                                    Chip(
                                      label: Text(
                                          '${text['pending']} ${seriesPending.length} · ${formatReferenceCatalogBytes(seriesPendingBytes)}'),
                                    ),
                                    Chip(
                                      label: Text(
                                          '${text['saved']} ${seriesAssets.length - seriesPending.length}'),
                                    ),
                                  ],
                                ),
                                if (_bulkGame == _game &&
                                    (_bulkActive ||
                                        _bulkDone > 0 ||
                                        _bulkFailed > 0)) ...[
                                  const SizedBox(height: 10),
                                  Row(children: [
                                    Expanded(
                                      child: Text(
                                        _bulkActive
                                            ? text['downloadingSeries']!
                                            : _bulkFailed > 0
                                                ? text['seriesPartial']!
                                                : text['seriesDone']!,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: Theme.of(context)
                                            .textTheme
                                            .labelMedium,
                                      ),
                                    ),
                                    Text(
                                        '${_bulkDone + _bulkFailed}/$_bulkTotal · ${(bulkPercent * 100).round()}%'),
                                  ]),
                                  const SizedBox(height: 5),
                                  TweenAnimationBuilder<double>(
                                    tween: Tween(end: bulkPercent),
                                    duration: const Duration(milliseconds: 180),
                                    builder: (context, value, _) =>
                                        LinearProgressIndicator(value: value),
                                  ),
                                  if (_bulkFailed > 0) ...[
                                    const SizedBox(height: 4),
                                    Text('${text['failed']} $_bulkFailed',
                                        style: TextStyle(
                                            color: Theme.of(context)
                                                .colorScheme
                                                .error)),
                                  ],
                                ],
                                const SizedBox(height: 12),
                                FilledButton.icon(
                                  onPressed:
                                      _bulkActive || seriesPending.isEmpty
                                          ? null
                                          : () => _downloadSeries(
                                              context, language, text),
                                  icon: _bulkActive
                                      ? const SizedBox.square(
                                          dimension: 18,
                                          child: CircularProgressIndicator(
                                              strokeWidth: 2))
                                      : const Icon(
                                          Icons.download_for_offline_outlined),
                                  label: Text(_bulkActive
                                      ? '${text['downloadingSeries']} ${_bulkDone + _bulkFailed}/$_bulkTotal'
                                      : seriesPending.isEmpty
                                          ? text['downloaded']!
                                          : text['downloadSeries']!),
                                ),
                              ],
                            ),
                          ),
                        ),
                ),
                const SizedBox(height: 12),
                Text('${filtered.length} ${text['result']}',
                    style: Theme.of(context).textTheme.labelLarge),
                const SizedBox(height: 8),
                if (visible.isEmpty)
                  Padding(
                      padding: const EdgeInsets.all(30),
                      child: Center(child: Text(text['empty']!)))
                else
                  LayoutBuilder(builder: (context, constraints) {
                    final automaticColumns = constraints.maxWidth >= 1000
                        ? 5
                        : constraints.maxWidth >= 760
                            ? 4
                            : constraints.maxWidth >= 520
                                ? 3
                                : constraints.maxWidth >= 380
                                    ? 2
                                    : 1;
                    final columns = _columns == 0
                        ? automaticColumns
                        : _columns.clamp(1, automaticColumns);
                    return GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: visible.length,
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: columns,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                        mainAxisExtent: 330,
                      ),
                      itemBuilder: (_, index) {
                        final asset = visible[index];
                        final busy = _active.contains(asset.id);
                        final done = downloaded.contains(asset.id);
                        final percent = _progress[asset.id] ?? 0;
                        return TweenAnimationBuilder<double>(
                          key: ValueKey('reference-catalog-${asset.id}'),
                          tween: Tween(begin: 0, end: 1),
                          duration: Duration(
                              milliseconds: 220 + (index.clamp(0, 10) * 18)),
                          curve: Curves.easeOutCubic,
                          builder: (context, value, child) => Opacity(
                            opacity: value,
                            child: Transform.translate(
                              offset: Offset(0, 12 * (1 - value)),
                              child: child,
                            ),
                          ),
                          child: Card(
                            clipBehavior: Clip.antiAlias,
                            margin: EdgeInsets.zero,
                            child: InkWell(
                              onDoubleTap: () => _preview(context, asset),
                              child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    Expanded(
                                        child: Stack(
                                            fit: StackFit.expand,
                                            children: [
                                          ColoredBox(
                                            color: Theme.of(context)
                                                .colorScheme
                                                .surfaceContainerLow,
                                            child: _RemoteCatalogImage(
                                                urls: asset.thumbnailUrls),
                                          ),
                                          Positioned(
                                              right: 6,
                                              top: 6,
                                              child: IconButton.filledTonal(
                                                tooltip: text['preview'],
                                                onPressed: () =>
                                                    _preview(context, asset),
                                                icon: const Icon(
                                                    Icons.visibility_outlined,
                                                    size: 18),
                                              )),
                                        ])),
                                    Padding(
                                      padding: const EdgeInsets.all(9),
                                      child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.stretch,
                                          children: [
                                            Text(asset.nameFor(language),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                    fontWeight:
                                                        FontWeight.w700)),
                                            const SizedBox(height: 2),
                                            Text(
                                                '${_gameName(asset.game, language)} · ${_categoryName(asset.category, text)}',
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .bodySmall),
                                            Text(
                                                '${asset.width}×${asset.height} · ${text['size']} ${formatReferenceCatalogBytes(asset.bytes)}',
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .bodySmall),
                                            if (busy) ...[
                                              const SizedBox(height: 6),
                                              TweenAnimationBuilder<double>(
                                                tween: Tween(
                                                    end: percent > 0
                                                        ? percent / 100
                                                        : 0),
                                                duration: const Duration(
                                                    milliseconds: 180),
                                                builder: (context, value, _) =>
                                                    LinearProgressIndicator(
                                                  value: percent > 0
                                                      ? value
                                                      : null,
                                                ),
                                              ),
                                              const SizedBox(height: 2),
                                              Text(
                                                  '${text['progress']} $percent%',
                                                  textAlign: TextAlign.right,
                                                  style: Theme.of(context)
                                                      .textTheme
                                                      .labelSmall),
                                            ] else
                                              const SizedBox(height: 8),
                                            SizedBox(
                                              height: 40,
                                              child: FilledButton.tonal(
                                                onPressed: busy || done
                                                    ? null
                                                    : () => _download(context,
                                                        asset, language, text),
                                                child: Text(
                                                    done
                                                        ? text['downloaded']!
                                                        : text['download']!,
                                                    maxLines: 1,
                                                    overflow:
                                                        TextOverflow.ellipsis),
                                              ),
                                            ),
                                          ]),
                                    ),
                                  ]),
                            ),
                          ),
                        );
                      },
                    );
                  }),
                if (_visible < filtered.length) ...[
                  const SizedBox(height: 12),
                  Center(
                      child: OutlinedButton.icon(
                    onPressed: () => setState(() => _visible += 60),
                    icon: const Icon(Icons.expand_more),
                    label: Text(text['more']!),
                  )),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _RemoteCatalogImage extends StatefulWidget {
  final List<String> urls;
  final BoxFit fit;
  const _RemoteCatalogImage({required this.urls, this.fit = BoxFit.contain});

  @override
  State<_RemoteCatalogImage> createState() => _RemoteCatalogImageState();
}

class _RemoteCatalogImageState extends State<_RemoteCatalogImage> {
  int _index = 0;

  @override
  void didUpdateWidget(covariant _RemoteCatalogImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.urls.join('\n') != widget.urls.join('\n')) _index = 0;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.urls.isEmpty || _index >= widget.urls.length) {
      return const Center(child: Icon(Icons.broken_image_outlined));
    }
    return Image.network(
      widget.urls[_index],
      fit: widget.fit,
      gaplessPlayback: true,
      frameBuilder: (context, child, frame, synchronous) =>
          frame != null || synchronous
              ? child
              : const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      errorBuilder: (context, error, stackTrace) {
        if (_index + 1 < widget.urls.length) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) setState(() => _index += 1);
          });
          return const Center(child: CircularProgressIndicator(strokeWidth: 2));
        }
        return const Center(child: Icon(Icons.broken_image_outlined));
      },
    );
  }
}

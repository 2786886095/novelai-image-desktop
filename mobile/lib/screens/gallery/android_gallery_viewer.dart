import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../i18n/app_locales.dart';
import '../../i18n/local_favorites_text.dart';
import '../../images/coordinated_file_image.dart';
import '../../models/nai_models.dart';
import '../../state/app_state.dart';
import '../../ui/android/android_tokens.dart';
import '../../ui/global_typography.dart';
import '../../ui/zoomable_image.dart';

typedef AndroidHistoryAction = Future<void> Function(
  BuildContext context,
  HistoryItem item,
);

/// Presentation-only labels. Existing history/actions keep their shared strings.
String androidGalleryText(String language, String key) {
  const labels = <String, Map<String, String>>{
    'works': {
      'zh-CN': '作品',
      'zh-TW': '作品',
      'en-US': 'Works',
      'ja-JP': '作品',
      'ko-KR': '작품'
    },
    'details': {
      'zh-CN': '详情',
      'zh-TW': '詳細資料',
      'en-US': 'Details',
      'ja-JP': '詳細',
      'ko-KR': '세부 정보'
    },
    'more': {
      'zh-CN': '更多',
      'zh-TW': '更多',
      'en-US': 'More',
      'ja-JP': 'その他',
      'ko-KR': '더 보기'
    },
    'exportShare': {
      'zh-CN': '导出/分享',
      'zh-TW': '匯出/分享',
      'en-US': 'Export/share',
      'ja-JP': '書き出し・共有',
      'ko-KR': '내보내기/공유'
    },
    'exportHint': {
      'zh-CN': '通过系统面板选择保存或分享原文件',
      'zh-TW': '透過系統面板選擇儲存或分享原檔',
      'en-US': 'Choose where to save or share the original in the system sheet',
      'ja-JP': 'システム画面で元ファイルの保存先や共有先を選択',
      'ko-KR': '시스템 창에서 원본 저장 또는 공유 위치 선택'
    },
    'applied': {
      'zh-CN': '参数已应用到创作，尚未生成',
      'zh-TW': '參數已套用至創作，尚未生成',
      'en-US': 'Parameters applied to Create. No image generated.',
      'ja-JP': 'パラメーターを制作に適用しました。生成はしていません。',
      'ko-KR': '매개변수를 창작에 적용했습니다. 생성하지 않았습니다.'
    },
    'goCreate': {
      'zh-CN': '去创作',
      'zh-TW': '前往創作',
      'en-US': 'Go to Create',
      'ja-JP': '制作へ',
      'ko-KR': '창작으로'
    },
    'selected': {
      'zh-CN': '已选',
      'zh-TW': '已選',
      'en-US': 'Selected',
      'ja-JP': '選択中',
      'ko-KR': '선택됨'
    },
    'emptyHint': {
      'zh-CN': '生成的图片会保留在这里；可按日期和分组查找。',
      'zh-TW': '生成的圖片會保留在此；可依日期與分組尋找。',
      'en-US': 'Saved results appear here. Find them by date and group.',
      'ja-JP': '保存した画像を日付とグループで探せます。',
      'ko-KR': '저장한 결과를 날짜와 그룹별로 찾을 수 있습니다.'
    },
  };
  return labels[key]?[language] ?? labels[key]?['en-US'] ?? key;
}

/// Own Android route; no generation, persistence format or image rewriting.
/// Navigation stores IDs, then resolves current records on every state change so
/// rename/delete/reconcile cannot leave actions bound to an obsolete file path.
class AndroidGalleryViewer extends StatefulWidget {
  final List<String> navigationIds;
  final String initialId;
  final AndroidHistoryAction onWorkbench;
  final AndroidHistoryAction onMetadata;
  final AndroidHistoryAction onShare;
  final AndroidHistoryAction onRename;
  final AndroidHistoryAction onMove;
  final AndroidHistoryAction onFilePath;
  final AndroidHistoryAction onFavorite;
  final AndroidHistoryAction onDelete;
  final ValueChanged<HistoryItem> onReuse;
  final VoidCallback? onOpenCreate;

  const AndroidGalleryViewer({
    super.key,
    required this.navigationIds,
    required this.initialId,
    required this.onWorkbench,
    required this.onMetadata,
    required this.onShare,
    required this.onRename,
    required this.onMove,
    required this.onFilePath,
    required this.onFavorite,
    required this.onDelete,
    required this.onReuse,
    this.onOpenCreate,
  });

  @override
  State<AndroidGalleryViewer> createState() => _AndroidGalleryViewerState();
}

class _AndroidGalleryViewerState extends State<AndroidGalleryViewer>
    with WidgetsBindingObserver {
  late final PageController _pages;
  final ScrollController _filmstrip = ScrollController();
  late String _selectedId;
  late int _index;
  Timer? _reconcileTimer;
  bool _operating = false;
  bool _emptyCloseScheduled = false;

  @override
  void initState() {
    super.initState();
    _selectedId = widget.initialId;
    _index = math.max(0, widget.navigationIds.indexOf(_selectedId));
    _pages = PageController(initialPage: _index);
    WidgetsBinding.instance.addObserver(this);
    _reconcileTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (mounted &&
          WidgetsBinding.instance.lifecycleState != AppLifecycleState.paused) {
        unawaited(_reconcile());
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollFilmstrip());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_reconcile());
  }

  Future<void> _reconcile() async {
    try {
      await context.read<AppState>().reconcileMissingHistory();
    } catch (_) {
      // An inconclusive storage scan never prunes the original history.
    }
  }

  @override
  void dispose() {
    _reconcileTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _pages.dispose();
    _filmstrip.dispose();
    super.dispose();
  }

  void _scrollFilmstrip() {
    if (!mounted || !_filmstrip.hasClients) return;
    final offset =
        (_index * 76.0 - 76).clamp(0.0, _filmstrip.position.maxScrollExtent);
    if (MediaQuery.disableAnimationsOf(context)) {
      _filmstrip.jumpTo(offset);
    } else {
      unawaited(_filmstrip.animateTo(offset,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic));
    }
  }

  void _select(int next, List<HistoryItem> items, {bool jump = false}) {
    if (next < 0 || next >= items.length || !mounted) return;
    setState(() {
      _index = next;
      _selectedId = items[next].id;
    });
    if (jump && _pages.hasClients) {
      if (MediaQuery.disableAnimationsOf(context)) {
        _pages.jumpToPage(next);
      } else {
        unawaited(_pages.animateToPage(next,
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic));
      }
    }
    _scrollFilmstrip();
  }

  Future<void> _run(AndroidHistoryAction action, HistoryItem item) async {
    if (_operating) return;
    setState(() => _operating = true);
    try {
      await action(context, item);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(error.toString().replaceFirst('Bad state: ', ''))));
      }
    } finally {
      if (mounted) setState(() => _operating = false);
    }
  }

  void _reuse(HistoryItem item, String language) {
    // This callback is the pre-existing _reuseParams; it only calls setParam.
    widget.onReuse(item);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(androidGalleryText(language, 'applied')),
      action: widget.onOpenCreate == null
          ? null
          : SnackBarAction(
              label: androidGalleryText(language, 'goCreate'),
              onPressed: () {
                Navigator.of(context).pop();
                widget.onOpenCreate?.call();
              },
            ),
    ));
  }

  Future<void> _more(HistoryItem item, String language) async {
    String t(String key) => mobileUiTextFor(language, key);
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            for (final row in <(String, IconData, String)>[
              ('rename', Icons.drive_file_rename_outline, t('gallery.rename')),
              ('move', Icons.drive_file_move_outline, t('gallery.moveGroup')),
              ('path', Icons.folder_outlined, t('gallery.viewFilePath')),
              (
                'favorite',
                Icons.star_border,
                localFavoritesText(language, 'add')
              ),
              ('delete', Icons.delete_outline, t('common.delete')),
            ])
              ListTile(
                key: ValueKey('android-gallery-more-${row.$1}'),
                leading: Icon(row.$2),
                title: Text(row.$3),
                onTap: () => Navigator.of(sheet).pop(row.$1),
              ),
          ]),
        ),
      ),
    );
    if (!mounted || action == null) return;
    final callback = switch (action) {
      'rename' => widget.onRename,
      'move' => widget.onMove,
      'path' => widget.onFilePath,
      'favorite' => widget.onFavorite,
      'delete' => widget.onDelete,
      _ => null,
    };
    if (callback != null) await _run(callback, item);
  }

  Future<void> _details(HistoryItem item, String language) async {
    String t(String key) => mobileUiTextFor(language, key);
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: .65,
        minChildSize: .3,
        maxChildSize: .95,
        builder: (sheet, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
          children: [
            Text(_fileName(item.filePath),
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
            for (final row in <(String, String)>[
              (t('gallery.feature'), item.feature),
              (t('gallery.model'), item.model),
              (t('gallery.seed'), '${item.seed}'),
              (t('gallery.size'), '${item.width} × ${item.height}'),
              (
                t('gallery.time'),
                item.createdAt.replaceFirst('T', ' ').split('.').first
              ),
            ])
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                          width: 88,
                          child: Text(row.$1,
                              style: Theme.of(context).textTheme.labelLarge)),
                      Expanded(child: SelectableText(row.$2)),
                    ]),
              ),
            const Divider(height: 28),
            Text(t('gallery.prompt'),
                style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            SelectableText(
                item.prompt.isEmpty ? t('gallery.noPrompt') : item.prompt),
          ],
        ),
      ),
    );
  }

  Widget _actions(HistoryItem item, String language,
      {required bool horizontal}) {
    String t(String key) => mobileUiTextFor(language, key);
    final rows = <(String, IconData, VoidCallback)>[
      (
        t('gallery.setWorkbench'),
        Icons.workspaces_outline,
        () => _run(widget.onWorkbench, item)
      ),
      (
        t('gallery.viewMetadata'),
        Icons.data_object_outlined,
        () => _run(widget.onMetadata, item)
      ),
      (
        androidGalleryText(language, 'exportShare'),
        Icons.ios_share_outlined,
        () => _run(widget.onShare, item)
      ),
      (
        androidGalleryText(language, 'more'),
        Icons.more_horiz,
        () => _more(item, language)
      ),
    ];
    if (horizontal) {
      return SingleChildScrollView(
        key: const ValueKey('android-gallery-horizontal-actions'),
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Row(children: [
          for (var i = 0; i < rows.length; i++)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: OutlinedButton.icon(
                key: ValueKey('android-gallery-action-$i'),
                onPressed: _operating ? null : rows[i].$3,
                icon: Icon(rows[i].$2),
                label: Text(rows[i].$1),
                style:
                    OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
              ),
            ),
        ]),
      );
    }
    final tokens = LangbaiAndroidTokens.of(context);
    return SingleChildScrollView(
      key: const ValueKey('android-gallery-vertical-actions'),
      padding: const EdgeInsets.only(right: 8, left: 4),
      child: Column(children: [
        for (var i = 0; i < rows.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: SizedBox(
              width: 72,
              child: FilledButton.tonal(
                key: ValueKey('android-gallery-action-$i'),
                onPressed: _operating ? null : rows[i].$3,
                style: FilledButton.styleFrom(
                  backgroundColor: tokens.dock,
                  foregroundColor: tokens.textPrimary,
                  minimumSize: const Size(64, 64),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
                ),
                child: Column(children: [
                  Icon(rows[i].$2),
                  const SizedBox(height: 4),
                  Text(rows[i].$1,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 11),
                      maxLines: 3),
                ]),
              ),
            ),
          ),
      ]),
    );
  }

  Widget _imageArea(List<HistoryItem> items, HistoryItem item, String language,
          bool horizontal) =>
      Row(
        children: [
          Expanded(
            child: PageView.builder(
              key: const ValueKey('android-gallery-pages'),
              controller: _pages,
              itemCount: items.length,
              onPageChanged: (value) => _select(value, items),
              itemBuilder: (context, index) => ZoomableImage(
                key: ValueKey('android-gallery-image-${items[index].id}'),
                image:
                    imageFile(File(items[index].filePath), fit: BoxFit.contain),
                imagePaths: [items[index].filePath],
                backgroundColor: Colors.black,
              ),
            ),
          ),
          if (!horizontal) _actions(item, language, horizontal: false),
        ],
      );

  Widget _filmstripView(List<HistoryItem> items) => SizedBox(
        height: 84,
        child: ListView.separated(
          key: const ValueKey('android-gallery-filmstrip'),
          controller: _filmstrip,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          scrollDirection: Axis.horizontal,
          itemCount: items.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (context, index) => Semantics(
            selected: items[index].id == _selectedId,
            button: true,
            label:
                '${index + 1} / ${items.length} · ${_fileName(items[index].filePath)}',
            child: Material(
              color: Colors.transparent,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(
                  color: items[index].id == _selectedId
                      ? Theme.of(context).colorScheme.primary
                      : Colors.transparent,
                  width: 2,
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                key: ValueKey('android-gallery-thumbnail-${items[index].id}'),
                onTap: () => _select(index, items, jump: true),
                child: SizedBox(
                    width: 68,
                    child: imageFile(File(items[index].filePath),
                        fit: BoxFit.cover, cacheWidth: 144)),
              ),
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final language = state.settings.language;
    final byId = {for (final item in state.history) item.id: item};
    final items = [
      for (final id in widget.navigationIds)
        if (byId[id] != null) byId[id]!
    ];
    if (items.isEmpty) {
      if (!_emptyCloseScheduled) {
        _emptyCloseScheduled = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) Navigator.of(context).pop();
        });
      }
      return const Scaffold(body: SizedBox.shrink());
    }
    var selectedIndex = items.indexWhere((item) => item.id == _selectedId);
    if (selectedIndex < 0) selectedIndex = _index.clamp(0, items.length - 1);
    if (_index != selectedIndex || items[selectedIndex].id != _selectedId) {
      _index = selectedIndex;
      _selectedId = items[selectedIndex].id;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _pages.hasClients) _pages.jumpToPage(_index);
        _scrollFilmstrip();
      });
    }
    final item = items[selectedIndex];
    final horizontal =
        MediaQuery.orientationOf(context) == Orientation.landscape ||
            MediaQuery.textScalerOf(context).scale(1) >= 1.3;
    final controls = <Widget>[
      if (horizontal) _actions(item, language, horizontal: true),
      _filmstripView(items),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
        child: Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 12,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                key: const ValueKey('android-gallery-details'),
                onPressed: () => _details(item, language),
                icon: const Icon(Icons.info_outline),
                label: Text(androidGalleryText(language, 'details')),
              ),
              FilledButton.icon(
                key: const ValueKey('android-gallery-reuse'),
                onPressed: _operating ? null : () => _reuse(item, language),
                icon: const Icon(Icons.settings_backup_restore),
                label: Text(mobileUiTextFor(language, 'gallery.reuseParams')),
                style: FilledButton.styleFrom(minimumSize: const Size(160, 52)),
              ),
            ]),
      ),
    ];
    return Scaffold(
      key: const ValueKey('android-gallery-viewer'),
      appBar: AppBar(
        title: studioAppBarTitle(context, Text(
            '${selectedIndex + 1}/${items.length} · ${_fileName(item.filePath)}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis)),
      ),
      body: SafeArea(
        top: false,
        child: LayoutBuilder(builder: (context, constraints) {
          final image = _imageArea(items, item, language, horizontal);
          if (constraints.maxHeight < 420) {
            return SingleChildScrollView(
                child: Column(children: [
              SizedBox(
                  height: math.max(140, constraints.maxHeight * .5),
                  child: image),
              ...controls,
            ]));
          }
          return Column(children: [Expanded(child: image), ...controls]);
        }),
      ),
    );
  }
}

String _fileName(String path) => path.replaceAll('\\', '/').split('/').last;

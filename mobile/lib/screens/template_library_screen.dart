import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../i18n/app_locales.dart';
import '../prompts/template_library.dart';

const _copy = <String, List<String>>{
  'zh-CN': [
    '提示词模板库',
    '图片模板 · 6 套',
    '漫画模板 · 2 套',
    '反推',
    '文字转换',
    '纯 Tag',
    '自然语言',
    '混合',
    '日式整页',
    '单分镜',
    '内置',
    '自定义',
    '模板用途',
    '查看的模板',
    '当前生效',
    '内置原稿只读；修改请另存自定义。旧版模板不会被覆盖。',
    '两种漫画均按页数：一行一页；单分镜一张单格图算一页。',
    '正文',
    '名称',
    '使用此模板',
    '另存为自定义',
    '保存修改',
    '恢复默认',
    '删除自定义',
    '导入 TXT / MD / JSON',
    '导出自定义 JSON',
    '重新读取',
    '导入预览',
    '导入并保存',
    '导入后立即选用',
    '取消',
    '确认删除这份自定义模板？当前选用将恢复内置，其他模板不变。',
    '已保存',
    '尚有未保存修改；重新读取前请先保存或放弃。',
    '图片选用后启用 V5 Full / 3.0.0，不修改当前生图参数。',
    '模板已保存，但设置同步失败；请重新读取后再选用，不要重复导入。',
    '库文件损坏或未读就绪，已禁止写入和运行时回退；原文件保留。',
    '删除',
    '请先保存修改，再选用。',
    '旧版与自定义内容保留。恢复默认不会删除自定义模板。'
  ],
  'zh-TW': [
    '提示詞範本庫',
    '圖片範本 · 6 套',
    '漫畫範本 · 2 套',
    '反推',
    '文字轉換',
    '純 Tag',
    '自然語言',
    '混合',
    '日式整頁',
    '單分鏡',
    '內建',
    '自訂',
    '範本用途',
    '檢視範本',
    '目前生效',
    '內建原稿唯讀；修改請另存自訂。舊版不會被覆蓋。',
    '兩種漫畫皆一行一頁；單分鏡一張單格圖算一頁。',
    '正文',
    '名稱',
    '使用此範本',
    '另存自訂',
    '儲存修改',
    '恢復預設',
    '刪除自訂',
    '匯入 TXT / MD / JSON',
    '匯出自訂 JSON',
    '重新讀取',
    '匯入預覽',
    '匯入並儲存',
    '匯入後使用',
    '取消',
    '刪除此自訂範本？目前選用回復內建，其他範本不變。',
    '已儲存',
    '尚有未儲存修改，請先儲存或放棄。',
    '圖片選用後啟用 V5 Full / 3.0.0，不改生圖參數。',
    '範本已儲存但設定同步失敗；重新讀取後再選用，勿重複匯入。',
    '範本庫損壞或尚未就緒；禁止寫入與執行時回退，原檔保留。',
    '刪除',
    '請先儲存修改再選用。',
    '舊版與自訂內容保留，恢復預設不刪除自訂範本。'
  ],
  'en-US': [
    'Prompt template library',
    'Image templates · 6',
    'Comic templates · 2',
    'Reverse',
    'Text conversion',
    'Tags',
    'Natural language',
    'Mixed',
    'Japanese full page',
    'Single panel',
    'Built-in',
    'Custom',
    'Template use',
    'Preview template',
    'Currently active',
    'Built-ins are read-only. Save a custom copy to edit. Older templates are preserved.',
    'Both comic formats count pages: one line per page; one single-panel image is one page.',
    'Body',
    'Name',
    'Use this template',
    'Save custom copy',
    'Save changes',
    'Restore default',
    'Delete custom',
    'Import TXT / MD / JSON',
    'Export custom JSON',
    'Reload',
    'Import preview',
    'Import and save',
    'Use after importing',
    'Cancel',
    'Delete this custom template? Its active slot returns to built-in; other templates stay unchanged.',
    'Saved',
    'Unsaved changes: save or discard before reloading.',
    'Selecting an image template enables V5 Full / 3.0.0 without changing generation parameters.',
    'Templates were saved, but settings synchronization failed. Reload and select again; do not import twice.',
    'The library is unavailable or corrupt. Writes and runtime fallback are blocked; the original file is retained.',
    'Delete',
    'Save changes before selecting.',
    'Older and custom content is retained. Restore default never deletes custom templates.'
  ],
  'ja-JP': [
    'プロンプトテンプレート',
    '画像テンプレート · 6',
    '漫画テンプレート · 2',
    '画像解析',
    '文章変換',
    'タグ',
    '自然言語',
    '混合',
    '日本式全ページ',
    '単一コマ',
    '内蔵',
    'カスタム',
    '用途',
    'プレビュー',
    '使用中',
    '内蔵原稿は読み取り専用です。編集はカスタムコピーに保存し、旧版を保持します。',
    '両形式とも1行1ページです。単一コマ画像1枚も1ページです。',
    '本文',
    '名前',
    'このテンプレートを使用',
    'カスタムコピーを保存',
    '変更を保存',
    '既定に戻す',
    'カスタムを削除',
    'TXT / MD / JSON を読み込む',
    'カスタム JSON を書き出す',
    '再読み込み',
    '読み込みプレビュー',
    '読み込んで保存',
    '読み込み後に使用',
    'キャンセル',
    '削除しますか？使用中のスロットは内蔵に戻り、他は保持されます。',
    '保存しました',
    '未保存の変更があります。先に保存または破棄してください。',
    '画像選択は V5 Full / 3.0.0 を有効にします。生成設定は変更しません。',
    '保存しましたが同期に失敗しました。再読み込みして選択し、重複して読み込まないでください。',
    'ライブラリが未準備または破損しています。書き込みと実行時フォールバックを禁止し、原本を保持します。',
    '削除',
    '選択前に変更を保存してください。',
    '旧版とカスタムを保持します。既定に戻しても削除されません。'
  ],
  'ko-KR': [
    '프롬프트 템플릿',
    '이미지 템플릿 · 6개',
    '만화 템플릿 · 2개',
    '이미지 분석',
    '텍스트 변환',
    '태그',
    '자연어',
    '혼합',
    '일본식 전체 페이지',
    '단일 컷',
    '기본',
    '사용자',
    '템플릿 용도',
    '미리 보기',
    '현재 사용',
    '기본 원문은 읽기 전용입니다. 수정하려면 사용자 사본을 저장하며 이전 템플릿은 유지됩니다.',
    '두 형식 모두 한 줄당 한 페이지입니다. 단일 컷 이미지 한 장도 한 페이지입니다.',
    '본문',
    '이름',
    '이 템플릿 사용',
    '사용자 사본 저장',
    '변경 저장',
    '기본값 복원',
    '사용자 템플릿 삭제',
    'TXT / MD / JSON 가져오기',
    '사용자 JSON 내보내기',
    '새로 읽기',
    '가져오기 미리 보기',
    '가져와 저장',
    '가져온 후 사용',
    '취소',
    '삭제할까요? 사용 중인 슬롯은 기본으로 돌아가며 다른 항목은 유지됩니다.',
    '저장됨',
    '저장하지 않은 변경이 있습니다. 먼저 저장하거나 취소하세요.',
    '이미지 선택 시 V5 Full / 3.0.0이 활성화되며 생성 매개변수는 바뀌지 않습니다.',
    '저장했지만 동기화에 실패했습니다. 다시 불러와 선택하고 중복 가져오기를 하지 마세요.',
    '라이브러리가 준비되지 않았거나 손상되었습니다. 쓰기와 실행 중 대체를 차단하고 원본은 유지합니다.',
    '삭제',
    '선택하기 전에 변경을 저장하세요.',
    '이전 및 사용자 콘텐츠가 유지됩니다. 기본값 복원은 사용자 템플릿을 삭제하지 않습니다.'
  ],
};

List<String> mobileTemplateLibraryCopy(Object? language) =>
    _copy[normalizeAppLocaleCode(language)] ?? _copy['zh-CN']!;
String mobileTemplateSlotLabel(String slot, Object? language) {
  final c = mobileTemplateLibraryCopy(language);
  if (slot == 'comic.jp-page') return c[8];
  if (slot == 'comic.single-panel') return c[9];
  final fields = slot.split('.');
  return '${fields[1] == 'reverse' ? c[3] : c[4]} · ${fields[2] == 'tags' ? c[5] : fields[2] == 'natural' ? c[6] : c[7]}';
}

class TemplateLibraryScreen extends StatefulWidget {
  final MobileTemplateLibrary library;
  final Object? language;
  final Future<void> Function(String kind)? onUseImageV3;
  const TemplateLibraryScreen(
      {super.key,
      required this.library,
      required this.language,
      this.onUseImageV3});
  @override
  State<TemplateLibraryScreen> createState() => _TemplateLibraryScreenState();
}

class _TemplateLibraryScreenState extends State<TemplateLibraryScreen> {
  final _name = TextEditingController(), _body = TextEditingController();
  String _slot = 'image.reverse.tags',
      _family = 'image',
      _previewId = '',
      _draftRevision = '';
  String? _message, _error;
  bool _busy = false, _dirty = false;
  List<String> get c => mobileTemplateLibraryCopy(widget.language);
  MobileTemplateLibrary get library => widget.library;
  MobileCustomTemplate? get custom {
    final rows =
        library.custom.where((r) => r.id == _previewId && r.slot == _slot);
    return rows.isEmpty ? null : rows.first;
  }

  MobileBuiltinTemplate? get builtin {
    final rows = library.builtins.where((r) => r.slot == _slot);
    return rows.isEmpty ? null : rows.first;
  }

  @override
  void initState() {
    super.initState();
    library.addListener(_libraryChanged);
    _read();
    if (!library.loaded) library.load();
  }

  @override
  void didUpdateWidget(covariant TemplateLibraryScreen old) {
    super.didUpdateWidget(old);
    if (old.library != library) {
      old.library.removeListener(_libraryChanged);
      library.addListener(_libraryChanged);
      _read();
    }
  }

  void _libraryChanged() {
    if (!mounted) return;
    setState(() {
      if (!_dirty) _read();
    });
  }

  void _read({String? previewId}) {
    String? selected;
    try {
      selected = library.resolve(_slot).id;
    } catch (_) {
      selected = builtin?.id;
    }
    _previewId = previewId ?? selected ?? '';
    final item = custom;
    _name.text = item?.name ?? '';
    _body.text = item?.body ?? builtin?.body ?? '';
    _draftRevision = library.revision;
    _dirty = false;
  }

  @override
  void dispose() {
    library.removeListener(_libraryChanged);
    _name.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<bool> _mayLeaveDraft() async {
    if (!_dirty) return true;
    final discard = {
          'zh-CN': '放弃修改',
          'zh-TW': '放棄修改',
          'en-US': 'Discard changes',
          'ja-JP': '変更を破棄',
          'ko-KR': '변경 취소',
        }[normalizeAppLocaleCode(widget.language)] ??
        'Discard changes';
    return await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(content: Text(c[33]), actions: [
                  TextButton(
                      style:
                          TextButton.styleFrom(minimumSize: const Size(0, 44)),
                      onPressed: () => Navigator.pop(ctx, false),
                      child: Text(c[30])),
                  TextButton(
                      style:
                          TextButton.styleFrom(minimumSize: const Size(0, 44)),
                      onPressed: () => Navigator.pop(ctx, true),
                      child: Text(discard)),
                ])) ??
        false;
  }

  Future<void> _chooseSlot(String value) async {
    if (!await _mayLeaveDraft() || !mounted) return;
    setState(() {
      _slot = value;
      _error = null;
      _message = null;
      _read();
    });
  }

  Future<void> _run(Future<void> Function() task) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      await task();
      if (mounted) {
        setState(() {
          _message = c[32];
          if (!_dirty) _read(previewId: _previewId);
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _enableImage(String slot) async {
    if (!slot.startsWith('image.')) return;
    try {
      await widget.onUseImageV3?.call(slot.split('.')[1]);
    } catch (e) {
      throw StateError('${c[35]} $e');
    }
  }

  Future<void> _use() async {
    if (_dirty) throw StateError(c[38]);
    final item = custom;
    await library.select(_slot,
        id: item?.id ?? builtin!.id,
        source: item == null ? 'builtin' : 'custom',
        expectedRevision: _draftRevision);
    await _enableImage(_slot);
  }

  Future<void> _import() async {
    final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['txt', 'md', 'json'],
        withData: true);
    if (result == null || result.files.length != 1 || !mounted) return;
    final file = result.files.single;
    if (file.size <= 0 || file.size > mobileTemplateImportMaxBytes) {
      throw const FormatException('Import a nonempty file up to 8 MiB.');
    }
    final bytes = file.bytes ??
        (file.path == null ? null : await File(file.path!).readAsBytes());
    if (bytes == null) {
      throw const FormatException('Selected file cannot be read.');
    }
    final preview = parseMobileTemplateImport(
        utf8.decode(bytes, allowMalformed: false), file.name, _slot);
    var activate = true;
    if (!mounted) return;
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => StatefulBuilder(
            builder: (ctx, update) => AlertDialog(
                  title: Text('${c[27]} · ${preview.entries.length}'),
                  content: SizedBox(
                      width: 480,
                      child: SingleChildScrollView(
                          child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            ...preview.entries.map((v) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Text(
                                    '${v.name}\n${mobileTemplateSlotLabel(v.slot, widget.language)} · ${v.body.length}'))),
                            ...preview.warnings.map((v) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Text(v))),
                            CheckboxListTile(
                                contentPadding: EdgeInsets.zero,
                                value: activate,
                                onChanged: (v) =>
                                    update(() => activate = v ?? false),
                                title: Text(c[29])),
                          ]))),
                  actions: [
                    TextButton(
                        style: TextButton.styleFrom(
                            minimumSize: const Size(0, 44)),
                        onPressed: () => Navigator.pop(ctx, false),
                        child: Text(c[30])),
                    FilledButton(
                        style: FilledButton.styleFrom(
                            minimumSize: const Size(0, 44)),
                        onPressed: () => Navigator.pop(ctx, true),
                        child: Text(c[28]))
                  ],
                )));
    if (confirmed != true) return;
    await library.importEntries(preview.entries,
        activate: activate, expectedRevision: _draftRevision);
    if (activate) {
      for (final slot in preview.entries.map((e) => e.slot).toSet()) {
        await _enableImage(slot);
      }
    }
  }

  Future<void> _export() async {
    final text = library.exportCustomJson();
    final dir = await getTemporaryDirectory();
    final f = File(p.join(dir.path,
        'langbai-custom-prompt-templates-${DateTime.now().microsecondsSinceEpoch}.json'));
    await f.writeAsString(text, flush: true);
    if (!mounted) return;
    final box = context.findRenderObject() as RenderBox?;
    await Share.shareXFiles([XFile(f.path, mimeType: 'application/json')],
        sharePositionOrigin:
            box == null ? null : box.localToGlobal(Offset.zero) & box.size);
  }

  Future<void> _remove() async {
    final item = custom;
    if (item == null) return;
    if (await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(content: Text(c[31]), actions: [
                  TextButton(
                      style:
                          TextButton.styleFrom(minimumSize: const Size(0, 44)),
                      onPressed: () => Navigator.pop(ctx, false),
                      child: Text(c[30])),
                  FilledButton(
                      style: FilledButton.styleFrom(
                          minimumSize: const Size(0, 44)),
                      onPressed: () => Navigator.pop(ctx, true),
                      child: Text(c[37])),
                ])) !=
        true) return;
    await library.remove(item.id, expectedRevision: _draftRevision);
    _dirty = false;
    _read();
  }

  @override
  Widget build(BuildContext context) {
    final disabled =
        _busy || !library.loaded || library.readOnly || builtin == null;
    String active;
    try {
      active = library.resolve(_slot).name;
    } catch (_) {
      active = c[36];
    }
    final slots =
        mobileTemplateSlots.where((v) => v.startsWith('$_family.')).toList();
    final options = <DropdownMenuItem<String>>[
      if (builtin != null)
        DropdownMenuItem(
            value: builtin!.id,
            child: Text(
                '${c[10]} · ${mobileTemplateSlotLabel(_slot, widget.language)}',
                overflow: TextOverflow.ellipsis)),
      ...library.custom.where((v) => v.slot == _slot).map((v) =>
          DropdownMenuItem(
              value: v.id,
              child: Text('${c[11]} · ${v.name}',
                  overflow: TextOverflow.ellipsis))),
    ];
    return PopScope(
        canPop: !_dirty,
        onPopInvokedWithResult: (didPop, _) async {
          if (!didPop && await _mayLeaveDraft() && context.mounted) {
            setState(() => _dirty = false);
            Navigator.of(context).pop();
          }
        },
        child: Scaffold(
          appBar: AppBar(title: Text(c[0])),
          body: SafeArea(
              child: ListView(padding: const EdgeInsets.all(16), children: [
            Wrap(spacing: 8, runSpacing: 8, children: [
              ChoiceChip(
                  label: Text(c[1]),
                  selected: _family == 'image',
                  onSelected: _busy
                      ? null
                      : (_) async {
                          if (await _mayLeaveDraft() && mounted) {
                            setState(() {
                              _family = 'image';
                              _slot = 'image.reverse.tags';
                              _read();
                            });
                          }
                        }),
              ChoiceChip(
                  label: Text(c[2]),
                  selected: _family == 'comic',
                  onSelected: _busy
                      ? null
                      : (_) async {
                          if (await _mayLeaveDraft() && mounted) {
                            setState(() {
                              _family = 'comic';
                              _slot = 'comic.jp-page';
                              _read();
                            });
                          }
                        }),
            ]),
            const SizedBox(height: 12),
            Text(c[15]),
            if (_family == 'comic')
              Padding(
                  padding: const EdgeInsets.only(top: 8), child: Text(c[16])),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              OutlinedButton.icon(
                  key: const ValueKey('template-library-reload'),
                  style:
                      OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                  onPressed: _busy
                      ? null
                      : () async {
                          if (!await _mayLeaveDraft()) return;
                          await _run(() async {
                            _dirty = false;
                            await library.load();
                          });
                        },
                  icon: const Icon(Icons.refresh),
                  label: Text(c[26])),
              OutlinedButton.icon(
                  style:
                      OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                  onPressed: disabled || _dirty ? null : () => _run(_import),
                  icon: const Icon(Icons.file_open_outlined),
                  label: Text(c[24])),
              OutlinedButton.icon(
                  style:
                      OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                  onPressed: disabled || library.custom.isEmpty
                      ? null
                      : () => _run(_export),
                  icon: const Icon(Icons.ios_share),
                  label: Text(c[25])),
            ]),
            if (_busy)
              const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: LinearProgressIndicator()),
            if (library.readOnly)
              Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text('${c[36]}\n${library.error ?? ''}',
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error))),
            if (_error != null)
              Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(_error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error))),
            if (_message != null)
              Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(_message!, semanticsLabel: _message)),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
                value: _slot,
                isExpanded: true,
                decoration: InputDecoration(labelText: c[12]),
                items: slots
                    .map((slot) => DropdownMenuItem(
                        value: slot,
                        child: Text(
                            '${mobileTemplateSlotLabel(slot, widget.language)} · ${slot.startsWith('image.') ? '3.0.0' : slot == 'comic.jp-page' ? 'v4.1' : 'v1.0'}',
                            overflow: TextOverflow.ellipsis)))
                    .toList(),
                onChanged: _busy
                    ? null
                    : (v) {
                        if (v != null) _chooseSlot(v);
                      }),
            const SizedBox(height: 12),
            Text('${c[14]}：$active',
                style: Theme.of(context).textTheme.bodySmall),
            if (_family == 'image')
              Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(c[34],
                      style: Theme.of(context).textTheme.bodySmall)),
            const SizedBox(height: 12),
            if (options.isNotEmpty)
              DropdownButtonFormField<String>(
                  value: options.any((v) => v.value == _previewId)
                      ? _previewId
                      : options.first.value,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: c[13]),
                  items: options,
                  onChanged: _busy
                      ? null
                      : (v) async {
                          if (v != null && await _mayLeaveDraft() && mounted) {
                            setState(() => _read(previewId: v));
                          }
                        }),
            const SizedBox(height: 12),
            TextField(
                key: const ValueKey('template-library-body'),
                controller: _body,
                readOnly: custom == null || disabled,
                minLines: 12,
                maxLines: 22,
                decoration: InputDecoration(
                    labelText: '${c[17]} · ${_body.text.length}',
                    alignLabelWithHint: true,
                    border: const OutlineInputBorder()),
                style: const TextStyle(
                    fontFamily: 'monospace', fontSize: 13, height: 1.6),
                onChanged: (_) => setState(() => _dirty = true)),
            const SizedBox(height: 12),
            TextField(
                key: const ValueKey('template-library-name'),
                controller: _name,
                maxLength: 60,
                enabled: !disabled,
                decoration: InputDecoration(labelText: c[18]),
                onChanged: (_) => setState(() => _dirty = custom != null)),
            Wrap(spacing: 8, runSpacing: 8, children: [
              FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                  onPressed: disabled || _dirty ? null : () => _run(_use),
                  child: Text(c[19])),
              if (custom == null)
                OutlinedButton(
                    style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 44)),
                    onPressed: disabled || _name.text.trim().isEmpty
                        ? null
                        : () => _run(() async {
                              final id = await library.create(
                                  slot: _slot,
                                  name: _name.text,
                                  body: _body.text,
                                  fromBuiltinId: builtin!.id,
                                  expectedRevision: _draftRevision);
                              _read(previewId: id);
                            }),
                    child: Text(c[20]))
              else
                OutlinedButton(
                    style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 44)),
                    onPressed: disabled ||
                            _name.text.trim().isEmpty ||
                            _body.text.trim().isEmpty
                        ? null
                        : () => _run(() async {
                              final id = custom!.id;
                              await library.update(
                                  id: id,
                                  name: _name.text,
                                  body: _body.text,
                                  expectedRevision: _draftRevision);
                              _dirty = false;
                              _read(previewId: id);
                            }),
                    child: Text(c[21])),
              OutlinedButton(
                  style:
                      OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                  onPressed: disabled || _dirty
                      ? null
                      : () => _run(() async {
                            await library.reset(_slot,
                                expectedRevision: _draftRevision);
                            _dirty = false;
                            _read();
                          }),
                  child: Text(c[22])),
              if (custom != null)
                TextButton(
                    style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
                    onPressed: disabled ? null : () => _run(_remove),
                    child: Text(c[23])),
            ]),
            const SizedBox(height: 12),
            Text(c[39], style: Theme.of(context).textTheme.bodySmall),
          ])),
        ));
  }
}

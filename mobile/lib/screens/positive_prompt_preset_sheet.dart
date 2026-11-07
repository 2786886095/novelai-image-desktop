import '../images/coordinated_file_image.dart';
import '../ui/zoomable_image.dart';
import 'dart:convert';
import 'character_preset_bar.dart' show characterPresetLabels;
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../i18n/app_locales.dart';
import '../models/nai_models.dart';
import '../prompts/positive_prompt_presets.dart';
import '../state/app_state.dart';

typedef _PresetText = ({
  String trigger,
  String title,
  String subtitle,
  String saveCurrent,
  String create,
  String search,
  String empty,
  String name,
  String nameHint,
  String prompt,
  String promptHint,
  String images,
  String imageHint,
  String addImages,
  String edit,
  String delete,
  String save,
  String cancel,
  String apply,
  String duplicate,
  String required,
  String confirmDelete,
  String details,
  String backToPresets,
  String noMatches,
});

_PresetText _textFor(String language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return (
        trigger: '正面預設',
        title: '正面提示詞預設',
        subtitle: '套用時直接取代目前正面提示詞；參考圖只供查看，不會參與生成。',
        saveCurrent: '儲存目前內容',
        create: '手動新增',
        search: '搜尋名稱或提示詞',
        empty: '尚無正面提示詞預設',
        name: '預設名稱',
        nameHint: '留空時以提示詞開頭命名',
        prompt: '正面提示詞',
        promptHint: '只儲存正面提示詞內容',
        images: '參考查看圖',
        imageHint: '最多 3 張；只供辨認和對照，不會加入生成參數。',
        addImages: '加入圖片',
        edit: '編輯',
        delete: '刪除',
        save: '儲存',
        cancel: '取消',
        apply: '取代目前正面提示詞',
        duplicate: '相同預設已存在，未重複儲存。',
        required: '請填寫正面提示詞。',
        confirmDelete: '刪除這個預設及其參考圖？',
        details: '詳細資料',
        backToPresets: '返回預設列表',
        noMatches: '沒有符合的預設',
      );
    case 'en-US':
      return (
        trigger: 'Prompt presets',
        title: 'Positive prompt presets',
        subtitle:
            'Applying replaces the current positive prompt. Reference images are view-only and never enter generation.',
        saveCurrent: 'Save current',
        create: 'Create manually',
        search: 'Search names or prompts',
        empty: 'No positive prompt presets yet',
        name: 'Preset name',
        nameHint: 'Leave blank to name from the prompt',
        prompt: 'Positive prompt',
        promptHint: 'Only positive-prompt text is saved',
        images: 'Reference images',
        imageHint:
            'Up to 3. Images are for visual reference only and never enter generation parameters.',
        addImages: 'Add images',
        edit: 'Edit',
        delete: 'Delete',
        save: 'Save',
        cancel: 'Cancel',
        apply: 'Replace current positive prompt',
        duplicate: 'An identical preset already exists.',
        required: 'Enter a positive prompt.',
        confirmDelete: 'Delete this preset and its reference images?',
        details: 'Details',
        backToPresets: 'Back to presets',
        noMatches: 'No matching presets',
      );
    case 'ja-JP':
      return (
        trigger: '正面プリセット',
        title: 'ポジティブプロンプトプリセット',
        subtitle: '適用すると現在の内容を置換します。参照画像は閲覧専用で生成には使われません。',
        saveCurrent: '現在を保存',
        create: '手動で新規作成',
        search: '名前またはプロンプトを検索',
        empty: 'プリセットはまだありません',
        name: 'プリセット名',
        nameHint: '空欄ならプロンプト冒頭から命名',
        prompt: 'ポジティブプロンプト',
        promptHint: 'ポジティブプロンプトのみ保存',
        images: '参照画像',
        imageHint: '最大3枚。確認用のみで生成パラメータには追加されません。',
        addImages: '画像を追加',
        edit: '編集',
        delete: '削除',
        save: '保存',
        cancel: 'キャンセル',
        apply: '現在の正面プロンプトを置換',
        duplicate: '同じプリセットが既にあります。',
        required: 'ポジティブプロンプトを入力してください。',
        confirmDelete: 'このプリセットと参照画像を削除しますか？',
        details: '詳細',
        backToPresets: 'プリセット一覧に戻る',
        noMatches: '一致するプリセットがありません',
      );
    case 'ko-KR':
      return (
        trigger: '긍정 프리셋',
        title: '긍정 프롬프트 프리셋',
        subtitle: '적용하면 현재 내용을 교체합니다. 참고 이미지는 보기 전용이며 생성에 사용되지 않습니다.',
        saveCurrent: '현재 내용 저장',
        create: '직접 만들기',
        search: '이름 또는 프롬프트 검색',
        empty: '저장된 프리셋이 없습니다',
        name: '프리셋 이름',
        nameHint: '비워 두면 프롬프트 앞부분으로 이름 지정',
        prompt: '긍정 프롬프트',
        promptHint: '긍정 프롬프트만 저장합니다',
        images: '참고 이미지',
        imageHint: '최대 3장. 확인용이며 생성 매개변수에는 추가되지 않습니다.',
        addImages: '이미지 추가',
        edit: '편집',
        delete: '삭제',
        save: '저장',
        cancel: '취소',
        apply: '현재 긍정 프롬프트 교체',
        duplicate: '동일한 프리셋이 이미 있습니다.',
        required: '긍정 프롬프트를 입력하세요.',
        confirmDelete: '이 프리셋과 참고 이미지를 삭제할까요?',
        details: '상세 정보',
        backToPresets: '프리셋 목록으로',
        noMatches: '일치하는 프리셋이 없습니다',
      );
    default:
      return (
        trigger: '正面预设',
        title: '正面提示词预设',
        subtitle: '应用后直接替换当前正面提示词；参考图只用于查看，不会参与生图。',
        saveCurrent: '保存当前',
        create: '手动新建',
        search: '搜索名称或提示词',
        empty: '还没有正面提示词预设',
        name: '预设名称',
        nameHint: '留空时以提示词开头命名',
        prompt: '正面提示词',
        promptHint: '只保存正面提示词内容',
        images: '参考查看图',
        imageHint: '最多 3 张；只用于辨认和对照，不会加入生成参数。',
        addImages: '添加图片',
        edit: '编辑',
        delete: '删除',
        save: '保存',
        cancel: '取消',
        apply: '替换当前正面提示词',
        duplicate: '相同预设已存在，未重复保存。',
        required: '请填写正面提示词。',
        confirmDelete: '删除这个预设及其参考图？',
        details: '详情',
        backToPresets: '返回预设列表',
        noMatches: '没有匹配的预设',
      );
  }
}

class PositivePromptPresetButton extends StatelessWidget {
  final String currentPrompt;
  final ValueChanged<String> onApply;
  final List<CharCaptionItem> currentCaptions;
  final ValueChanged<List<CharCaptionItem>>? onApplyCharacters;
  final bool compact;

  const PositivePromptPresetButton({
    super.key,
    required this.currentPrompt,
    required this.onApply,
    this.currentCaptions = const [],
    this.onApplyCharacters,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final text = _textFor(context.watch<AppState>().settings.language);
    return OutlinedButton.icon(
      onPressed: () => showPositivePromptPresetSheet(
        context,
        currentPrompt: currentPrompt,
        onApply: onApply,
        currentCaptions: currentCaptions,
        onApplyCharacters: onApplyCharacters,
      ),
      icon: const Icon(Icons.bookmarks_outlined, size: 18),
      label: Text(text.trigger),
      style: compact
          ? OutlinedButton.styleFrom(
              minimumSize: const Size(0, 40),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              visualDensity: VisualDensity.compact,
            )
          : null,
    );
  }
}

Future<void> showPositivePromptPresetSheet(
  BuildContext context, {
  required String currentPrompt,
  required ValueChanged<String> onApply,
  List<CharCaptionItem> currentCaptions = const [],
  ValueChanged<List<CharCaptionItem>>? onApplyCharacters,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (sheetContext) => Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(sheetContext).bottom),
      child: FractionallySizedBox(
        heightFactor: .94,
        child: _PositivePromptPresetSheet(
          currentPrompt: currentPrompt,
          onApply: onApply,
          currentCaptions: currentCaptions,
          onApplyCharacters: onApplyCharacters,
        ),
      ),
    ),
  );
}

class _PositivePromptPresetSheet extends StatefulWidget {
  final String currentPrompt;
  final ValueChanged<String> onApply;
  final List<CharCaptionItem> currentCaptions;
  final ValueChanged<List<CharCaptionItem>>? onApplyCharacters;

  const _PositivePromptPresetSheet({
    required this.currentPrompt,
    required this.onApply,
    this.currentCaptions = const [],
    this.onApplyCharacters,
  });

  @override
  State<_PositivePromptPresetSheet> createState() =>
      _PositivePromptPresetSheetState();
}

class _PositivePromptPresetSheetState
    extends State<_PositivePromptPresetSheet> {
  final _search = TextEditingController();
  final _name = TextEditingController();
  final _prompt = TextEditingController();
  final _listScroll = ScrollController();
  bool _showDetails = false;
  double? _listOffsetBeforeDetails;
  String? _editingId;
  String _selectedId = '';
  String _activeImageId = '';
  String _message = '';
  bool _busy = false;
  List<CharCaptionItem> _draftCaptions = [];
  String get _draftText => _draftCaptions.isEmpty
      ? _prompt.text
      : _draftCaptions.map((c) => c.prompt).join('\n');

  @override
  void dispose() {
    _search.dispose();
    _name.dispose();
    _prompt.dispose();
    _listScroll.dispose();
    super.dispose();
  }

  void _startCreate(List<PositivePromptPreset> presets, bool current) {
    setState(() {
      _editingId = '';
      _draftCaptions = current
          ? widget.currentCaptions
              .map((c) => CharCaptionItem.fromJson(c.toJson()))
              .toList()
          : [];
      _prompt.text = current ? widget.currentPrompt : '';
      _name.text = current && widget.currentPrompt.trim().isNotEmpty
          ? defaultPositivePromptPresetName(
              widget.currentPrompt, presets.length + 1)
          : '';
      _message = '';
    });
  }

  void _startEdit(PositivePromptPreset preset) {
    setState(() {
      _editingId = preset.id;
      _draftCaptions = preset.captions
          .map((c) => CharCaptionItem.fromJson(c.toJson()))
          .toList();
      _selectedId = preset.id;
      _name.text = preset.name;
      _prompt.text = preset.prompt;
      _message = '';
    });
  }

  Future<void> _save(AppState state, _PresetText text) async {
    if (_draftText.trim().isEmpty && _draftCaptions.isEmpty) {
      setState(() => _message = text.required);
      return;
    }
    final requested = _name.text.trim().isEmpty
        ? defaultPositivePromptPresetName(
            _draftText, state.settings.positivePromptPresets.length + 1)
        : _name.text.trim();
    final duplicate = state.settings.positivePromptPresets
        .where((preset) =>
            preset.id != _editingId &&
            preset.name.trim() == requested &&
            preset.prompt == _draftText &&
            jsonEncode(preset.captions.map((c) => c.toJson()).toList()) ==
                jsonEncode(_draftCaptions.map((c) => c.toJson()).toList()))
        .firstOrNull;
    if (duplicate != null) {
      setState(() {
        _selectedId = duplicate.id;
        _editingId = null;
        _message = text.duplicate;
      });
      return;
    }
    setState(() => _busy = true);
    try {
      final saved = await state.savePositivePromptPreset(
        id: (_editingId ?? '').isEmpty ? null : _editingId,
        name: requested,
        prompt: _draftText,
        captions: _draftCaptions,
      );
      if (!mounted) return;
      setState(() {
        _selectedId = saved.id;
        _editingId = null;
        _message = '';
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(
    AppState state,
    PositivePromptPreset preset,
    _PresetText text,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(text.delete),
        content: Text(text.confirmDelete),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(text.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(text.delete),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    await state.removePositivePromptPreset(preset.id);
    if (!mounted) return;
    setState(() {
      _selectedId = state.settings.positivePromptPresets.firstOrNull?.id ?? '';
      if (_selectedId.isEmpty) _showDetails = false;
      _editingId = null;
      _busy = false;
    });
  }

  Future<void> _importImages(
    AppState state,
    PositivePromptPreset preset,
  ) async {
    final available =
        positivePromptPresetImageLimit - preset.previewImages.length;
    if (available <= 0) return;
    final picked = await ImagePicker().pickMultiImage(imageQuality: 100);
    if (picked.isEmpty) return;
    setState(() => _busy = true);
    final imported = await state.importPositivePromptPresetImages(
      preset: preset,
      sources: picked
          .take(available)
          .map((item) => (path: item.path, name: item.name))
          .toList(),
    );
    if (!mounted) return;
    setState(() {
      if (imported.isNotEmpty) _activeImageId = imported.first.id;
      _busy = false;
    });
  }

  void _showImage(PositivePromptPreset preset, StylePromptPreviewImage image) {
    showGalleryImagePreview(context, images: [
      imageFile(File(image.filePath),
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) =>
              const Icon(Icons.broken_image_outlined, color: Colors.white70))
    ], captions: [
      '${preset.name} · ${image.name}'
    ]);
  }

  void _filterChanged() {
    if (_listScroll.hasClients) _listScroll.jumpTo(0);
    setState(() => _message = '');
  }

  Widget _presetList(
    List<PositivePromptPreset> presets,
    PositivePromptPreset? selected,
    _PresetText text,
  ) {
    if (presets.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child:
              Text(_search.text.trim().isEmpty ? text.empty : text.noMatches),
        ),
      );
    }
    final colors = Theme.of(context).colorScheme;
    return Scrollbar(
      controller: _listScroll,
      child: ListView.separated(
        key: const ValueKey('positive-preset-list'),
        controller: _listScroll,
        primary: false,
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        itemCount: presets.length,
        separatorBuilder: (_, __) => const SizedBox(height: 4),
        itemBuilder: (context, index) {
          final preset = presets[index];
          final active = preset.id == selected?.id;
          return Material(
            color: active ? colors.primaryContainer : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: ListTile(
              key: ValueKey('positive-preset-row-${preset.id}'),
              selected: active,
              selectedColor: colors.onPrimaryContainer,
              minVerticalPadding: 8,
              leading: Icon(
                  active ? Icons.check_circle : Icons.bookmark_outline,
                  size: 21),
              title: Text(
                preset.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              onTap: () {
                FocusScope.of(context).unfocus();
                setState(() {
                  _selectedId = preset.id;
                  _activeImageId = preset.previewImages.firstOrNull?.id ?? '';
                  _message = '';
                });
              },
            ),
          );
        },
      ),
    );
  }

  Widget _referenceDisclosure(
    AppState state,
    PositivePromptPreset preset,
    _PresetText text,
  ) {
    return Card.outlined(
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        key: ValueKey('positive-preset-reference-${preset.id}'),
        leading: const Icon(Icons.photo_library_outlined),
        title: Text(
            '${text.images} · ${preset.previewImages.length}/$positivePromptPresetImageLimit'),
        children: [_images(state, preset, text)],
      ),
    );
  }

  Widget _images(
    AppState state,
    PositivePromptPreset preset,
    _PresetText text,
  ) {
    final images = preset.previewImages;
    final active =
        images.where((item) => item.id == _activeImageId).firstOrNull ??
            images.firstOrNull;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(text.imageHint, style: Theme.of(context).textTheme.bodySmall),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: OutlinedButton.icon(
              onPressed:
                  _busy || images.length >= positivePromptPresetImageLimit
                      ? null
                      : () => _importImages(state, preset),
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: Text(
                  '${text.addImages} ${images.length}/$positivePromptPresetImageLimit'),
            ),
          ),
          if (active != null) ...[
            const SizedBox(height: 8),
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Material(
                color: Theme.of(context).colorScheme.surfaceContainerLowest,
                borderRadius: BorderRadius.circular(12),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => _showImage(preset, active),
                  child: imageFile(
                    File(active.filePath),
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => const Center(
                      child: Icon(Icons.broken_image_outlined, size: 42),
                    ),
                  ),
                ),
              ),
            ),
          ],
          if (images.isNotEmpty) ...[
            const SizedBox(height: 8),
            SizedBox(
              height: 76,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: images.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final image = images[index];
                  return Stack(
                    children: [
                      InkWell(
                        onTap: () => setState(() => _activeImageId = image.id),
                        onLongPress: () => _showImage(preset, image),
                        child: Container(
                          width: 94,
                          decoration: BoxDecoration(
                            border: Border.all(
                              color: image.id == active?.id
                                  ? Theme.of(context).colorScheme.primary
                                  : Theme.of(context)
                                      .colorScheme
                                      .outlineVariant,
                              width: image.id == active?.id ? 2 : 1,
                            ),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: imageFile(File(image.filePath),
                              fit: BoxFit.cover),
                        ),
                      ),
                      Positioned(
                        top: 2,
                        right: 2,
                        child: IconButton.filledTonal(
                          visualDensity: VisualDensity.compact,
                          tooltip: text.delete,
                          onPressed: _busy
                              ? null
                              : () async {
                                  await state.removePositivePromptPresetImage(
                                    preset: preset,
                                    image: image,
                                  );
                                  if (mounted) {
                                    setState(() {
                                      _activeImageId = preset
                                              .previewImages.firstOrNull?.id ??
                                          '';
                                    });
                                  }
                                },
                          icon: const Icon(Icons.delete_outline, size: 17),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _detail(
    AppState state,
    PositivePromptPreset? selected,
    _PresetText text, {
    bool showApply = true,
  }) {
    if (selected == null) {
      return Center(child: Text(text.empty));
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(selected.name,
                  style: Theme.of(context).textTheme.titleLarge),
            ),
            IconButton(
              tooltip: text.edit,
              onPressed: () => _startEdit(selected),
              icon: const Icon(Icons.edit_outlined),
            ),
            IconButton(
              tooltip: text.delete,
              onPressed: _busy ? null : () => _delete(state, selected, text),
              icon: const Icon(Icons.delete_outline),
            ),
          ],
        ),
        Card.outlined(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: SelectableText(selected.prompt),
          ),
        ),
        const SizedBox(height: 10),
        _referenceDisclosure(state, selected, text),
        const SizedBox(height: 12),
        if (showApply) _applyButton(state, selected, text),
        if (showApply && _message.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(_message, textAlign: TextAlign.center),
        ],
      ],
    );
  }

  Widget _applyButton(
      AppState state, PositivePromptPreset selected, _PresetText text,
      {bool compact = false}) {
    return FilledButton.icon(
      key: const ValueKey('positive-preset-apply'),
      onPressed: () {
        if (selected.captions.isNotEmpty) {
          if (selected.captions.length > state.params.maxCharacterPrompts) {
            setState(() =>
                _message = characterPresetLabels(state.settings.language)[9]);
            return;
          }
          final captions = selected.captions
              .map((c) => CharCaptionItem.fromJson(c.toJson()))
              .toList();
          if (widget.onApplyCharacters != null) {
            widget.onApplyCharacters!(captions);
          } else {
            state.extras.charCaptions = captions;
            state.markCharacterChanged();
          }
        } else {
          widget.onApply(selected.prompt);
        }
        Navigator.pop(context);
      },
      icon: const Icon(Icons.swap_horiz),
      label: Text(
          selected.captions.isNotEmpty
              ? "${characterPresetLabels(state.settings.language)[2]} · ${selected.captions.length}"
              : compact
                  ? characterPresetLabels(state.settings.language)[2]
                  : text.apply,
          maxLines: 2,
          overflow: TextOverflow.ellipsis),
    );
  }

  void _openDetails() {
    _listOffsetBeforeDetails =
        _listScroll.hasClients ? _listScroll.offset : null;
    setState(() => _showDetails = true);
  }

  void _backToList() {
    final offset = _listOffsetBeforeDetails;
    setState(() => _showDetails = false);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted ||
          _showDetails ||
          offset == null ||
          !_listScroll.hasClients) {
        return;
      }
      final position = _listScroll.position;
      _listScroll.jumpTo(
        offset
            .clamp(position.minScrollExtent, position.maxScrollExtent)
            .toDouble(),
      );
    });
  }

  Widget _phonePresets(
    AppState state,
    List<PositivePromptPreset> presets,
    PositivePromptPreset? selected,
    _PresetText text,
    bool keyboardOpen,
  ) {
    final details = _showDetails && selected != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: IndexedStack(
            index: details ? 1 : 0,
            sizing: StackFit.expand,
            children: [
              _presetList(presets, selected, text),
              if (details)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton.icon(
                        onPressed: _backToList,
                        icon: const Icon(Icons.arrow_back),
                        label: Text(text.backToPresets),
                      ),
                    ),
                    Expanded(
                        child:
                            _detail(state, selected, text, showApply: false)),
                  ],
                )
              else
                const SizedBox.shrink(),
            ],
          ),
        ),
        if (!keyboardOpen && selected != null) ...[
          const Divider(height: 1),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Column(
                children: [
                  if (_message.isNotEmpty)
                    Text(_message, textAlign: TextAlign.center),
                  Row(
                    children: [
                      if (!details) ...[
                        OutlinedButton(
                          onPressed: _openDetails,
                          child: Text(text.details,
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ),
                        const SizedBox(width: 8),
                      ],
                      Expanded(
                          child: _applyButton(state, selected, text,
                              compact: true)),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _editor(
    AppState state,
    PositivePromptPreset? selected,
    _PresetText text,
  ) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        TextField(
          controller: _name,
          decoration: InputDecoration(
            labelText: text.name,
            hintText: text.nameHint,
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        if (_draftCaptions.isNotEmpty)
          for (var i = 0; i < _draftCaptions.length; i++) ...[
            Text(mobileUiFormatFor(state.settings.language,
                'generate.characterLabel', {'index': i + 1})),
            TextFormField(
                key: ValueKey('preset-role-positive-$i'),
                initialValue: _draftCaptions[i].prompt,
                minLines: 2,
                maxLines: 5,
                decoration: InputDecoration(labelText: text.prompt),
                onChanged: (v) => setState(() => _draftCaptions[i].prompt = v)),
            TextFormField(
                key: ValueKey('preset-role-negative-$i'),
                initialValue: _draftCaptions[i].negativePrompt,
                minLines: 1,
                maxLines: 3,
                decoration: InputDecoration(
                    labelText: mobileUiTextFor(
                        state.settings.language, 'generate.characterNegative')),
                onChanged: (v) =>
                    setState(() => _draftCaptions[i].negativePrompt = v)),
            const SizedBox(height: 12),
          ]
        else
          TextField(
            controller: _prompt,
            minLines: 7,
            maxLines: 15,
            decoration: InputDecoration(
              labelText: text.prompt,
              hintText: text.promptHint,
              border: const OutlineInputBorder(),
            ),
          ),
        const SizedBox(height: 12),
        if ((_editingId ?? '').isNotEmpty && selected != null)
          _referenceDisclosure(state, selected, text),
        if (_message.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(_message, textAlign: TextAlign.center),
        ],
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton(
              onPressed: _busy ? null : () => setState(() => _editingId = null),
              child: Text(text.cancel),
            ),
            const SizedBox(width: 8),
            FilledButton.icon(
              onPressed: _busy ? null : () => _save(state, text),
              icon: const Icon(Icons.check),
              label: Text(text.save),
            ),
          ],
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = _textFor(state.settings.language);
    final query = _search.text.trim().toLowerCase();
    final presets = state.settings.positivePromptPresets
        .where((preset) =>
            query.isEmpty ||
            preset.name.toLowerCase().contains(query) ||
            preset.prompt.toLowerCase().contains(query))
        .toList();
    if (_selectedId.isEmpty &&
        state.settings.positivePromptPresets.isNotEmpty) {
      _selectedId = state.settings.positivePromptPresets.first.id;
    }
    final selected = state.settings.positivePromptPresets
        .where((preset) => preset.id == _selectedId)
        .firstOrNull;
    final visibleSelection =
        presets.where((preset) => preset.id == _selectedId).firstOrNull;
    final keyboardOpen = MediaQuery.viewInsetsOf(context).bottom > 0;
    final compactDetails =
        _showDetails && MediaQuery.sizeOf(context).width < 760;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 8, 8),
          child: Row(
            children: [
              const Icon(Icons.bookmarks_outlined),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      text.title,
                      maxLines: keyboardOpen ? 1 : 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    if (!keyboardOpen)
                      Text(
                        selected?.captions.isNotEmpty == true
                            ? "${mobileUiTextFor(state.settings.language, 'generate.characterPrompts')} · ${selected!.captions.length}"
                            : text.subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                  ],
                ),
              ),
              IconButton(
                tooltip:
                    mobileUiTextFor(state.settings.language, 'common.close'),
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        ),
        if (_editingId == null && !compactDetails)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: Column(
              children: [
                TextField(
                  controller: _search,
                  onChanged: (_) => _filterChanged(),
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search),
                    hintText: text.search,
                    suffixIcon: _search.text.isEmpty
                        ? null
                        : IconButton(
                            onPressed: () {
                              _search.clear();
                              _filterChanged();
                            },
                            icon: const Icon(Icons.clear),
                          ),
                    border: const OutlineInputBorder(),
                    isDense: true,
                  ),
                ),
                if (!keyboardOpen) const SizedBox(height: 8),
                if (!keyboardOpen)
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _startCreate(
                              state.settings.positivePromptPresets, false),
                          icon: const Icon(Icons.add),
                          label: Text(text.create,
                              maxLines: 2, overflow: TextOverflow.ellipsis),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: widget.currentPrompt.trim().isEmpty &&
                                  widget.currentCaptions.isEmpty
                              ? null
                              : () => _startCreate(
                                  state.settings.positivePromptPresets, true),
                          icon: const Icon(Icons.push_pin_outlined),
                          label: Text(text.saveCurrent,
                              maxLines: 2, overflow: TextOverflow.ellipsis),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        const Divider(height: 1),
        Expanded(
          child: _editingId != null
              ? _editor(state, selected, text)
              : LayoutBuilder(
                  builder: (context, constraints) {
                    if (constraints.maxWidth >= 760) {
                      return Row(
                        children: [
                          SizedBox(
                            width: 310,
                            child: _presetList(presets, visibleSelection, text),
                          ),
                          const VerticalDivider(width: 1),
                          Expanded(
                              child: _detail(state, visibleSelection, text)),
                        ],
                      );
                    }
                    return _phonePresets(
                      state,
                      presets,
                      visibleSelection,
                      text,
                      keyboardOpen,
                    );
                  },
                ),
        ),
      ],
    );
  }
}

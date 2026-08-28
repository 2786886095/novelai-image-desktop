import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../billing/anlas.dart';
import '../i18n/app_locales.dart';
import '../models/nai_models.dart';
import '../prompts/capsule_data.dart';
import '../prompts/prompt_tools.dart';
import '../references/reference_catalog.dart';
import '../references/reference_presets.dart';
import '../services/nai_api.dart';
import '../state/app_state.dart';
import '../ui/quality_preset_control.dart';
import '../ui/studio_shell.dart';
import '../ui/zoomable_image.dart';
import 'reference_catalog_panel.dart';

bool _isRoomyPhoneLandscape(BuildContext context) {
  final size = MediaQuery.sizeOf(context);
  return StudioBreakpoints.classify(size) == StudioWindowClass.phone &&
      size.width > size.height &&
      size.width >= 700;
}

Map<String, String> _opusUsageText(String language) {
  switch (language) {
    case 'zh-TW':
      return {
        'title': 'Opus 生成使用限制',
        'body':
            'Opus 包含一般解析度、最多 28 步的免費 NovelAI Diffusion V5 生成。額度會自動補充；用完後仍可消耗 Anlas。',
        'remaining': '剩餘',
        'images': '張圖片',
        'refill': '目前每天恢復',
        'unavailable': '官網暫未返回 V5 Opus 額度資料。',
        'empty': '免費額度已用完，V5 生成將消耗 Anlas。',
        'synced': '已從 NovelAI 官方介面即時同步',
        'stale': '官網同步失敗，目前顯示上次成功資料',
        'refresh': '重新整理',
        'close': '關閉'
      };
    case 'en-US':
      return {
        'title': 'Opus Generation Usage Limit',
        'body':
            'Opus includes free NovelAI Diffusion V5 generations at normal resolutions and up to 28 steps. The allowance refills automatically; after it is depleted, V5 can still spend Anlas.',
        'remaining': 'remaining',
        'images': 'images',
        'refill': 'Currently refills per day',
        'unavailable': 'NovelAI did not return V5 Opus allowance data yet.',
        'empty': 'The free allowance is depleted; V5 will spend Anlas.',
        'synced': 'Live data synced from the official NovelAI endpoint',
        'stale': 'Official sync failed; showing the last successful reading',
        'refresh': 'Refresh',
        'close': 'Close'
      };
    case 'ja-JP':
      return {
        'title': 'Opus 生成使用上限',
        'body':
            'Opus では通常解像度・最大 28 ステップの NovelAI Diffusion V5 生成を無料枠で利用できます。枠は自動回復し、使い切った後も Anlas を消費できます。',
        'remaining': '残り',
        'images': '枚',
        'refill': '1 日の回復',
        'unavailable': 'NovelAI から V5 Opus 枠の情報が返されていません。',
        'empty': '無料枠を使い切りました。V5 は Anlas を消費します。',
        'synced': 'NovelAI 公式エンドポイントからリアルタイム同期済み',
        'stale': '公式同期に失敗したため、前回成功時の値を表示中',
        'refresh': '更新',
        'close': '閉じる'
      };
    case 'ko-KR':
      return {
        'title': 'Opus 생성 사용 한도',
        'body':
            'Opus에는 일반 해상도와 최대 28스텝의 무료 NovelAI Diffusion V5 생성이 포함됩니다. 한도는 자동 회복되며, 소진 후에도 Anlas를 사용할 수 있습니다.',
        'remaining': '남음',
        'images': '장',
        'refill': '하루 회복',
        'unavailable': 'NovelAI에서 V5 Opus 한도 데이터를 반환하지 않았습니다.',
        'empty': '무료 한도를 모두 사용했습니다. V5는 Anlas를 소모합니다.',
        'synced': 'NovelAI 공식 엔드포인트에서 실시간 동기화됨',
        'stale': '공식 동기화에 실패하여 마지막 성공 데이터를 표시 중',
        'refresh': '새로고침',
        'close': '닫기'
      };
    default:
      return {
        'title': 'Opus 生成使用限制',
        'body':
            'Opus 包含普通分辨率、最多 28 步的免费 NovelAI Diffusion V5 生成。额度会自动补充；用完后仍可消耗 Anlas。',
        'remaining': '剩余',
        'images': '张图片',
        'refill': '目前每天恢复',
        'unavailable': '官网暂未返回 V5 Opus 额度数据。',
        'empty': '免费额度已用完，V5 生成将消耗 Anlas。',
        'synced': '已从 NovelAI 官方接口实时同步',
        'stale': '官网同步失败，当前显示上次成功数据',
        'refresh': '刷新',
        'close': '关闭'
      };
  }
}

Future<void> _showOpusUsageDialog(BuildContext context) async {
  await showDialog<void>(
    context: context,
    builder: (dialogContext) => Consumer<AppState>(
      builder: (context, state, _) {
        final text = _opusUsageText(state.settings.language);
        final usage = state.account.opusUsage;
        final percent = usage == null
            ? 0.0
            : (usage.isNegative ? 0.0 : usage.percent.clamp(0, 100).toDouble());
        final images = (17.3 * percent).round();
        final refill = usage != null && usage.timeUntilNextPercent > 0
            ? (86400 / usage.timeUntilNextPercent * 10).round() / 10
            : 0.0;
        final refillImages = (17.3 * refill).round();
        final officialSyncOk =
            !state.account.stale && state.account.opusUsageUpdatedAt != null;
        return AlertDialog(
          title: Text(text['title']!),
          content: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(text['body']!),
                const SizedBox(height: 18),
                if (usage != null) ...[
                  Text(
                    '${text['remaining']} ${percent.toStringAsFixed(percent % 1 == 0 ? 0 : 1)}% (~$images ${text['images']})',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Semantics(
                    label: '${text['remaining']} $percent%',
                    value: '$percent%',
                    child: LinearProgressIndicator(
                      value: percent / 100,
                      minHeight: 12,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                      '${text['refill']} ${refill.toStringAsFixed(refill % 1 == 0 ? 0 : 1)}% (~$refillImages ${text['images']})'),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(
                        !officialSyncOk
                            ? Icons.sync_problem_outlined
                            : Icons.cloud_done_outlined,
                        size: 16,
                        color: !officialSyncOk
                            ? Theme.of(context).colorScheme.error
                            : Theme.of(context).colorScheme.primary,
                      ),
                      const SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          !officialSyncOk ? text['stale']! : text['synced']!,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                    ],
                  ),
                  if (usage.isNegative) ...[
                    const SizedBox(height: 10),
                    Text(text['empty']!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error)),
                  ],
                ] else
                  Text(text['unavailable']!),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: state.refreshAnlas, child: Text(text['refresh']!)),
            FilledButton(
                onPressed: () => Navigator.pop(dialogContext),
                child: Text(text['close']!)),
          ],
        );
      },
    ),
  );
}

class GenerateScreen extends StatelessWidget {
  const GenerateScreen({super.key});

  Future<void> _pickImage(BuildContext context) async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked != null && context.mounted) {
      await context
          .read<AppState>()
          .setWorkbenchPath(picked.path, applyMetadata: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final p = state.params;
    final text = generateScreenTextFor(state.settings.language);
    final size = MediaQuery.sizeOf(context);
    final windowClass = StudioBreakpoints.classify(size);
    final landscapePhone = _isRoomyPhoneLandscape(context);
    final wide = windowClass != StudioWindowClass.phone || landscapePhone;
    final showV5Allowance =
        state.account.tierLevel == 3 && p.model.startsWith('nai-diffusion-5-');

    final preview = _PreviewCard(onPick: () => _pickImage(context));
    final controls = <Widget>[
      _TagSearchBox(
        onInsert: (tag, negative) => state.setParam((params) {
          if (negative) {
            params.negativePrompt = _appendTag(params.negativePrompt, tag);
          } else {
            params.positivePrompt = _appendTag(params.positivePrompt, tag);
          }
        }),
      ),
      const SizedBox(height: 12),
      if (state.settings.promptShortcuts.isNotEmpty) ...[
        _PromptShortcutBar(),
        const SizedBox(height: 12),
      ],
      PromptEditor(
        label: text.stylePrompt,
        value: p.stylePrompt,
        lockKind: 'style',
        onChanged: (value) =>
            state.setParam((params) => params.stylePrompt = value),
      ),
      const SizedBox(height: 8),
      const _StylePresetControls(),
      const SizedBox(height: 12),
      PromptEditor(
        label: text.positivePrompt,
        value: p.positivePrompt,
        maxLines: 5,
        showRelatedTags: true,
        showTextTools: true,
        onChanged: (value) =>
            state.setParam((params) => params.positivePrompt = value),
      ),
      const SizedBox(height: 12),
      PromptEditor(
        label: text.negativePrompt,
        value: p.negativePrompt,
        maxLines: 3,
        lockKind: 'negative',
        onChanged: (value) =>
            state.setParam((params) => params.negativePrompt = value),
      ),
      const SizedBox(height: 16),
      _ParamControls(),
      const SizedBox(height: 16),
      _CharacterPrompts(),
      const SizedBox(height: 16),
      _ReferenceControls(),
      if (state.workbenchImage != null) ...[
        const SizedBox(height: 16),
        _I2IControls(),
      ],
      const SizedBox(height: 16),
      _OutputControls(),
    ];
    final runButton = _PrimaryRunButton(state: state);
    final previewPadding = landscapePhone
        ? const EdgeInsets.fromLTRB(10, 8, 6, 8)
        : const EdgeInsets.fromLTRB(16, 12, 8, 120);
    final controlsPadding = landscapePhone
        ? const EdgeInsets.fromLTRB(6, 8, 10, 8)
        : const EdgeInsets.fromLTRB(8, 12, 16, 120);
    final runButtonWidth = size.width < 760 ? 136.0 : 150.0;

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: landscapePhone ? 48 : null,
        title: Text(
          state.workbenchImage == null
              ? text.titleTextToImage
              : text.titleImageLoaded,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: landscapePhone ? 166 : double.infinity,
            ),
            child: TextButton.icon(
              onPressed: showV5Allowance
                  ? () => _showOpusUsageDialog(context)
                  : state.refreshAnlas,
              style: landscapePhone
                  ? TextButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                    )
                  : null,
              icon: Icon(state.account.stale
                  ? Icons.sync_problem_outlined
                  : Icons.refresh),
              label: Text(
                state.account.hasToken
                    ? '${state.account.tierName ?? "API"} · ${state.account.anlasBalance ?? "—"}${!showV5Allowance || state.account.opusUsage == null ? "" : " · V5 ${state.account.opusUsage!.isNegative ? 0 : state.account.opusUsage!.percent.clamp(0, 100).round()}%"}'
                    : text.notConfigured,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
          if (landscapePhone && !state.generationQueueRunning)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 10),
              child:
                  SizedBox(width: runButtonWidth, height: 38, child: runButton),
            ),
          if (landscapePhone && state.generationQueueRunning)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: state.queuePaused ? text.resume : text.pause,
                    onPressed: state.toggleQueuePause,
                    icon: Icon(
                        state.queuePaused ? Icons.play_arrow : Icons.pause),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: text.cancelAndClear,
                    onPressed: state.cancelGeneration,
                    icon: const Icon(Icons.stop),
                  ),
                ],
              ),
            ),
        ],
      ),
      // Tablet/desktop-ish width and roomy phone landscape: preview pinned on
      // the left, controls scroll on the right. Keep the outer shell classified
      // as phone so landscape phones still use compact bottom navigation rather
      // than the tablet rail.
      body: wide
          ? Row(
              key: const ValueKey('generate-split-layout'),
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  flex: 5,
                  child: SingleChildScrollView(
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: previewPadding,
                    child: preview,
                  ),
                ),
                const VerticalDivider(width: 1),
                Expanded(
                  flex: 6,
                  child: ListView(
                    keyboardDismissBehavior:
                        ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: controlsPadding,
                    children: controls,
                  ),
                ),
              ],
            )
          : ListView(
              key: const ValueKey('generate-single-layout'),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              // Keep the final controls clear of the persistent run bar even
              // when optional parameter cards make the page taller.
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 168),
              children: [preview, const SizedBox(height: 12), ...controls],
            ),
      bottomNavigationBar: landscapePhone ? null : const _RunBar(),
    );
  }

  static String _appendTag(String prompt, String tag) {
    final t = tag.trim();
    if (t.isEmpty) return prompt;
    final base = prompt.trim();
    return base.isEmpty ? '$t, ' : '$base, $t, ';
  }
}

class PromptEditor extends StatefulWidget {
  final String label;
  final String value;
  final int maxLines;
  final String? hintText;
  final bool showRelatedTags;
  final String? lockKind;
  // Translate / normalize / weight tools — only meaningful on the positive
  // prompt, so style and negative fields opt out.
  final bool showTextTools;
  final ValueChanged<String> onChanged;

  const PromptEditor({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.maxLines = 1,
    this.hintText,
    this.showRelatedTags = false,
    this.lockKind,
    this.showTextTools = false,
  });

  @override
  State<PromptEditor> createState() => PromptEditorState();
}

class PromptEditorState extends State<PromptEditor> {
  late final TextEditingController controller;
  bool translating = false;
  String? translationBackup;
  Timer? suggestionTimer;
  int suggestionRequest = 0;
  List<TagSuggestion> suggestions = const [];

  @override
  void initState() {
    super.initState();
    controller = TextEditingController(text: widget.value);
  }

  @override
  void didUpdateWidget(covariant PromptEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (controller.text == widget.value) return;
    controller.value = TextEditingValue(
      text: widget.value,
      selection: TextSelection.collapsed(offset: widget.value.length),
    );
  }

  @override
  void dispose() {
    suggestionTimer?.cancel();
    controller.dispose();
    super.dispose();
  }

  void _apply(String value) {
    controller.value = TextEditingValue(
      text: value,
      selection: TextSelection.collapsed(offset: value.length),
    );
    widget.onChanged(value);
    _scheduleSuggestions(value);
  }

  void _scheduleSuggestions(String value) {
    suggestionTimer?.cancel();
    final state = context.read<AppState>();
    if (!state.settings.autoComplete) {
      if (suggestions.isNotEmpty && mounted) setState(() => suggestions = []);
      return;
    }
    final token = _lastPromptToken(value);
    if (token.length < 2) {
      if (suggestions.isNotEmpty && mounted) setState(() => suggestions = []);
      return;
    }
    final request = ++suggestionRequest;
    suggestionTimer = Timer(const Duration(milliseconds: 320), () async {
      final result = await state.suggestTags(token);
      if (!mounted || request != suggestionRequest) return;
      setState(() => suggestions = result.take(8).toList());
    });
  }

  String _lastPromptToken(String value) {
    final comma = value.lastIndexOf(',');
    final line = value.lastIndexOf('\n');
    return value.substring((comma > line ? comma : line) + 1).trim();
  }

  void _applySuggestion(TagSuggestion suggestion) {
    final value = controller.text;
    final comma = value.lastIndexOf(',');
    final line = value.lastIndexOf('\n');
    final split = comma > line ? comma : line;
    final prefix = split < 0 ? '' : value.substring(0, split + 1);
    final spacing = prefix.isEmpty || prefix.endsWith('\n') ? '' : ' ';
    _apply('$prefix$spacing${suggestion.tag}, ');
    setState(() => suggestions = []);
  }

  Future<void> _translate() async {
    final input = controller.text.trim();
    if (input.isEmpty) return;
    setState(() => translating = true);
    final translated = await context.read<AppState>().translateText(
          input,
          target: 'en',
        );
    if (!mounted) return;
    setState(() => translating = false);
    if (translated == null || translated.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.read<AppState>().status)),
      );
      return;
    }
    translationBackup = controller.text;
    _apply(translated.trim());
  }

  Future<void> _editWeights() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    var working = controller.text;
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) {
          final tags = splitPromptTags(working);
          return SafeArea(
            child: SizedBox(
              height: MediaQuery.sizeOf(context).height * 0.72,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(generateScreenTextFor(language).weight,
                              style: Theme.of(context).textTheme.titleMedium),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(context, working),
                          child: Text(t('common.apply')),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: tags.isEmpty
                        ? Center(child: Text(t('generate.noAdjustableTags')))
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                            itemCount: tags.length,
                            separatorBuilder: (_, __) =>
                                const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final parsed = parseWeightedTag(tags[index]);
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(parsed.core),
                                subtitle: Text(
                                    '×${weightMultiplier(parsed.level).toStringAsFixed(2)}'),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      tooltip: t('generate.decreaseWeight'),
                                      onPressed: parsed.level <= -5
                                          ? null
                                          : () => setSheetState(() {
                                                working = setTagLevel(working,
                                                    index, parsed.level - 1);
                                              }),
                                      icon: const Icon(Icons.remove),
                                    ),
                                    Text('${parsed.level}'),
                                    IconButton(
                                      tooltip: t('generate.increaseWeight'),
                                      onPressed: parsed.level >= 5
                                          ? null
                                          : () => setSheetState(() {
                                                working = setTagLevel(working,
                                                    index, parsed.level + 1);
                                              }),
                                      icon: const Icon(Icons.add),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (result != null) _apply(result);
  }

  Future<void> _openNormalize() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    var options = const PromptNormalizeOptions();
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          final preview = normalizePrompt(
            controller.text,
            options: options,
          );
          final toggles = <({String label, bool value, VoidCallback toggle})>[
            (
              label: t('generate.normalizeLowercase'),
              value: options.lowercase,
              toggle: () =>
                  options = options.copyWith(lowercase: !options.lowercase),
            ),
            (
              label: t('generate.normalizeHalfWidth'),
              value: options.halfWidthPunct,
              toggle: () => options =
                  options.copyWith(halfWidthPunct: !options.halfWidthPunct),
            ),
            (
              label: t('generate.normalizeStripDecorative'),
              value: options.stripDecorative,
              toggle: () => options =
                  options.copyWith(stripDecorative: !options.stripDecorative),
            ),
            (
              label: t('generate.normalizeUnderscoreToSpace'),
              value: options.underscoreToSpace,
              toggle: () => options = options.copyWith(
                  underscoreToSpace: !options.underscoreToSpace),
            ),
            (
              label: t('generate.normalizeNewlineToComma'),
              value: options.newlineToComma,
              toggle: () => options =
                  options.copyWith(newlineToComma: !options.newlineToComma),
            ),
            (
              label: t('generate.normalizeDedupe'),
              value: options.dedupe,
              toggle: () => options = options.copyWith(dedupe: !options.dedupe),
            ),
            (
              label: t('generate.normalizeStripQuality'),
              value: options.stripQualityPrefix,
              toggle: () => options = options.copyWith(
                  stripQualityPrefix: !options.stripQualityPrefix),
            ),
            (
              label: t('generate.normalizeStripNonAscii'),
              value: options.stripNonAscii,
              toggle: () => options =
                  options.copyWith(stripNonAscii: !options.stripNonAscii),
            ),
            (
              label: t('generate.normalizeKeepWildcards'),
              value: options.keepWildcards,
              toggle: () => options =
                  options.copyWith(keepWildcards: !options.keepWildcards),
            ),
          ];
          return SafeArea(
            child: SizedBox(
              height: MediaQuery.sizeOf(context).height * 0.82,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            t('generate.normalizeTitle'),
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        FilledButton(
                          onPressed: preview.trim().isEmpty
                              ? null
                              : () => Navigator.pop(sheetContext, preview),
                          child: Text(t('common.apply')),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      children: [
                        for (final item in toggles)
                          CheckboxListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(item.label),
                            value: item.value,
                            onChanged: (_) => setSheetState(item.toggle),
                          ),
                        const SizedBox(height: 8),
                        Text(
                          t('generate.preview'),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 6),
                        SelectableText(preview.isEmpty
                            ? t('generate.emptyResult')
                            : preview),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (result != null) _apply(result);
  }

  Future<void> _pickRelatedTag() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final tags = relatedPromptTags(controller.text);
    if (tags.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(t('generate.relatedTagUnavailable'))),
      );
      return;
    }
    final selected = await showModalBottomSheet<RelatedPromptTag>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(generateScreenTextFor(language).relatedTag,
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: tags
                    .map((tag) => ActionChip(
                          label: Text('${tag.description}\n${tag.tag}'),
                          onPressed: () => Navigator.pop(context, tag),
                        ))
                    .toList(),
              ),
            ],
          ),
        ),
      ),
    );
    if (selected == null) return;
    final base = controller.text.trim();
    _apply(base.isEmpty ? selected.tag : '$base, ${selected.tag}');
  }

  Future<void> _previewWildcard() async {
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final preview = expandPromptWildcards(controller.text);
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(t('generate.randomPreviewTitle')),
        content: SelectableText(preview),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(t('common.close')),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              _apply(preview);
            },
            child: Text(t('generate.applyResult')),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final locked = widget.lockKind == 'style'
        ? state.settings.lockStylePrompt
        : widget.lockKind == 'negative'
            ? state.settings.lockNegativePrompt
            : false;
    final text = generateScreenTextFor(state.settings.language);
    final language = state.settings.language;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: controller,
          maxLines: widget.maxLines,
          decoration: InputDecoration(
            labelText: widget.label,
            hintText: widget.hintText,
            border: const OutlineInputBorder(),
          ),
          onChanged: (value) {
            widget.onChanged(value);
            _scheduleSuggestions(value);
          },
        ),
        if (state.settings.autoComplete && suggestions.isNotEmpty) ...[
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: suggestions
                .map(
                  (suggestion) => ActionChip(
                    label: Text(
                      '${suggestion.tag} · ${localizedTagLabel(
                        language,
                        suggestion.tag,
                        sourceLabel: suggestion.description,
                      )}',
                    ),
                    onPressed: () => _applySuggestion(suggestion),
                  ),
                )
                .toList(),
          ),
        ],
        const SizedBox(height: 6),
        Wrap(
          spacing: 4,
          runSpacing: 4,
          children: [
            if (widget.showTextTools) ...[
              TextButton.icon(
                onPressed: translating ? null : _translate,
                icon: translating
                    ? const SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.translate, size: 18),
                label: Text(translating ? text.translateBusy : text.translate),
              ),
              if (translationBackup != null)
                IconButton(
                  tooltip: text.undoTranslation,
                  onPressed: () {
                    final backup = translationBackup;
                    if (backup == null) return;
                    setState(() => translationBackup = null);
                    _apply(backup);
                  },
                  icon: const Icon(Icons.undo),
                ),
              TextButton.icon(
                onPressed: _openNormalize,
                icon: const Icon(Icons.auto_fix_high, size: 18),
                label: Text(text.normalize),
              ),
              TextButton(
                onPressed: _editWeights,
                child: SizedBox(
                  width: 126,
                  height: 24,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      const Align(
                        alignment: Alignment.centerLeft,
                        child: Icon(Icons.tune, size: 18),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 22),
                        child: Text(
                          text.weight,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            if (hasPromptWildcards(controller.text))
              TextButton.icon(
                onPressed: _previewWildcard,
                icon: const Icon(Icons.casino_outlined, size: 18),
                label: Text(text.randomPreview),
              ),
            if (widget.showRelatedTags)
              TextButton.icon(
                onPressed: _pickRelatedTag,
                icon: const Icon(Icons.hub_outlined, size: 18),
                label: Text(text.relatedTag),
              ),
            if (widget.lockKind != null)
              IconButton(
                tooltip: locked ? text.unlockPrompt : text.lockPrompt,
                onPressed: () => state.setPromptLock(widget.lockKind!, !locked),
                icon: Icon(locked ? Icons.lock : Icons.lock_open),
              ),
          ],
        ),
      ],
    );
  }
}

class _StylePresetControls extends StatefulWidget {
  const _StylePresetControls();

  @override
  State<_StylePresetControls> createState() => _StylePresetControlsState();
}

class _StylePresetControlsState extends State<_StylePresetControls> {
  String _selectedGroup = 'all';

  ({
    String label,
    String all,
    String defaultGroup,
    String create,
    String name,
    String exists,
    String created,
    String deleteGroup,
    String deleteConfirm,
    String moveTo,
    String manage
  }) _groupText(String language) => switch (language) {
        'zh-TW' => (
            label: '風格分組',
            all: '全部分組',
            defaultGroup: '預設分組',
            create: '建立分組',
            name: '分組名稱',
            exists: '該分組已存在。',
            created: '已建立分組',
            deleteGroup: '刪除分組',
            deleteConfirm: '分組內的風格會移至預設分組。',
            moveTo: '移至分組',
            manage: '選擇與管理風格'
          ),
        'en-US' => (
            label: 'Style group',
            all: 'All groups',
            defaultGroup: 'Default group',
            create: 'Create group',
            name: 'Group name',
            exists: 'That group already exists.',
            created: 'Group created',
            deleteGroup: 'Delete group',
            deleteConfirm: 'Styles in it will move to the default group.',
            moveTo: 'Move to group',
            manage: 'Choose and manage styles'
          ),
        'ja-JP' => (
            label: 'スタイルグループ',
            all: 'すべてのグループ',
            defaultGroup: 'デフォルトグループ',
            create: 'グループを作成',
            name: 'グループ名',
            exists: '同じグループが既に存在します。',
            created: 'グループを作成しました',
            deleteGroup: 'グループを削除',
            deleteConfirm: 'スタイルはデフォルトグループへ移動します。',
            moveTo: 'グループへ移動',
            manage: 'スタイルを選択・管理'
          ),
        'ko-KR' => (
            label: '스타일 그룹',
            all: '모든 그룹',
            defaultGroup: '기본 그룹',
            create: '그룹 만들기',
            name: '그룹 이름',
            exists: '같은 그룹이 이미 있습니다.',
            created: '그룹을 만들었습니다',
            deleteGroup: '그룹 삭제',
            deleteConfirm: '스타일은 기본 그룹으로 이동합니다.',
            moveTo: '그룹으로 이동',
            manage: '스타일 선택 및 관리'
          ),
        _ => (
            label: '风格分组',
            all: '全部分组',
            defaultGroup: '默认分组',
            create: '创建分组',
            name: '分组名称',
            exists: '该分组已经存在。',
            created: '已创建分组',
            deleteGroup: '删除分组',
            deleteConfirm: '分组内的风格会移动到默认分组。',
            moveTo: '移动到分组',
            manage: '选择与管理风格'
          ),
      };

  String _fillName(String template, String name) =>
      template.replaceAll('{name}', name);

  Future<String?> _askName(
    BuildContext context,
    GenerateScreenText text,
    String initialName,
  ) {
    final controller = TextEditingController(text: initialName);
    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(text.saveStylePreset),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(labelText: text.stylePresetName),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.pop(dialogContext, controller.text.trim()),
            child: Text(MaterialLocalizations.of(context).okButtonLabel),
          ),
        ],
      ),
    );
  }

  Future<String?> _askGroupName(BuildContext context, String language) {
    final labels = _groupText(language);
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(labels.create),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(labelText: labels.name),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.pop(dialogContext, controller.text.trim()),
            child: Text(MaterialLocalizations.of(context).okButtonLabel),
          ),
        ],
      ),
    );
  }

  Future<void> _importImages(
    BuildContext context,
    AppState state,
    StylePromptPreset preset,
    GenerateScreenText text,
  ) async {
    final available = 3 - preset.previewImages.length;
    final messenger = ScaffoldMessenger.of(context);
    if (available <= 0) {
      messenger
          .showSnackBar(SnackBar(content: Text(text.stylePresetImageLimit)));
      return;
    }
    final picked = await ImagePicker().pickMultiImage(imageQuality: 100);
    if (picked.isEmpty) return;
    await state.importStylePromptPreviewImages(
      preset: preset,
      sources: picked
          .take(available)
          .map((item) => (path: item.path, name: item.name))
          .toList(),
    );
  }

  Future<void> _replaceImage(
    AppState state,
    StylePromptPreset preset,
    StylePromptPreviewImage image,
  ) async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked == null) return;
    await state.replaceStylePromptPreviewImage(
      preset: preset,
      previous: image,
      source: (path: picked.path, name: picked.name),
    );
  }

  void _showPreview(
    BuildContext context,
    StylePromptPreset preset,
    StylePromptPreviewImage image,
  ) {
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.9),
      builder: (dialogContext) => Dialog.fullscreen(
        backgroundColor: Colors.black,
        child: SafeArea(
          child: Stack(
            children: [
              Positioned.fill(
                child: InteractiveViewer(
                  minScale: 0.5,
                  maxScale: 6,
                  child: Center(
                    child: Image.file(
                      File(image.filePath),
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Icon(
                        Icons.broken_image_outlined,
                        color: Colors.white70,
                        size: 64,
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: IconButton.filledTonal(
                  tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                  onPressed: () => Navigator.pop(dialogContext),
                  icon: const Icon(Icons.close),
                ),
              ),
              Positioned(
                left: 16,
                right: 64,
                bottom: 12,
                child: Text(
                  '${preset.name} · ${image.name}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showImageManager(
    BuildContext context,
    String presetId,
    GenerateScreenText text,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) => Consumer<AppState>(
        builder: (context, state, _) {
          final preset = state.settings.stylePromptPresets
              .where((item) => item.id == presetId)
              .firstOrNull;
          if (preset == null) return const SizedBox.shrink();
          final images = preset.previewImages;
          return RepaintBoundary(
            key: const ValueKey('style-image-manager-sheet'),
            child: DraggableScrollableSheet(
              expand: false,
              initialChildSize: 0.72,
              minChildSize: 0.42,
              maxChildSize: 0.94,
              builder: (context, controller) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 0, 12, 10),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(text.stylePresetImageManager,
                                  style:
                                      Theme.of(context).textTheme.titleLarge),
                              Text('${preset.name} · ${images.length}/3',
                                  overflow: TextOverflow.ellipsis),
                            ],
                          ),
                        ),
                        FilledButton.tonalIcon(
                          onPressed: images.length >= 3
                              ? null
                              : () =>
                                  _importImages(context, state, preset, text),
                          icon: const Icon(Icons.add_photo_alternate_outlined),
                          label: Text(text.stylePresetAddImages),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: images.isEmpty
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(24),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.palette_outlined,
                                      size: 48,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .primary),
                                  const SizedBox(height: 12),
                                  Text(text.stylePresetNoImages,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleMedium),
                                  const SizedBox(height: 6),
                                  Text(text.stylePresetImageHint,
                                      textAlign: TextAlign.center),
                                ],
                              ),
                            ),
                          )
                        : GridView.builder(
                            controller: controller,
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount:
                                  MediaQuery.sizeOf(context).width >= 720
                                      ? 3
                                      : 2,
                              mainAxisSpacing: 12,
                              crossAxisSpacing: 12,
                              childAspectRatio: 0.68,
                            ),
                            itemCount: images.length,
                            itemBuilder: (context, index) {
                              final image = images[index];
                              return Card(
                                clipBehavior: Clip.antiAlias,
                                child: Column(
                                  children: [
                                    Expanded(
                                      child: InkWell(
                                        onTap: () => _showPreview(
                                            context, preset, image),
                                        onLongPress: () => _showPreview(
                                            context, preset, image),
                                        child: SizedBox.expand(
                                          child: Image.file(
                                            File(image.filePath),
                                            fit: BoxFit.contain,
                                            errorBuilder: (_, __, ___) =>
                                                const Icon(Icons
                                                    .broken_image_outlined),
                                          ),
                                        ),
                                      ),
                                    ),
                                    Padding(
                                      padding:
                                          const EdgeInsets.fromLTRB(8, 6, 8, 2),
                                      child: Text(image.name,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis),
                                    ),
                                    Padding(
                                      padding:
                                          const EdgeInsets.fromLTRB(4, 0, 4, 4),
                                      child: Row(
                                        children: [
                                          Expanded(
                                            child: TextButton(
                                              onPressed: () => _replaceImage(
                                                  state, preset, image),
                                              child: Text(
                                                  text.stylePresetReplaceImage),
                                            ),
                                          ),
                                          IconButton(
                                            tooltip:
                                                text.stylePresetDeleteImage,
                                            onPressed: () => state
                                                .removeStylePromptPreviewImage(
                                              preset: preset,
                                              image: image,
                                            ),
                                            icon: const Icon(
                                                Icons.delete_outline),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<bool> _confirmGroupDelete(
    BuildContext context,
    String group,
    String language,
  ) async {
    final labels = _groupText(language);
    final title = switch (language) {
      'en-US' => '${labels.deleteGroup} “$group”?',
      'ja-JP' => '「$group」を${labels.deleteGroup}しますか？',
      'ko-KR' => '“$group” ${labels.deleteGroup}할까요?',
      _ => '${labels.deleteGroup}“$group”？',
    };
    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: Text(title),
            content: Text(labels.deleteConfirm),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child:
                    Text(MaterialLocalizations.of(context).cancelButtonLabel),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: Text(labels.deleteGroup),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<bool> _confirmStyleDelete(
    BuildContext context,
    String name,
    String language,
  ) async {
    final message = switch (language) {
      'zh-TW' => '確定刪除風格「$name」嗎？此操作無法復原。',
      'en-US' => 'Delete style “$name”? This cannot be undone.',
      'ja-JP' => 'スタイル「$name」を削除しますか？この操作は元に戻せません。',
      'ko-KR' => '스타일 “$name”을 삭제할까요? 이 작업은 되돌릴 수 없습니다.',
      _ => '确定删除风格“$name”吗？此操作无法撤销。',
    };
    return await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: Text(textForDeleteStyle(language)),
            content: Text(message),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogContext, false),
                child:
                    Text(MaterialLocalizations.of(context).cancelButtonLabel),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(dialogContext, true),
                child: Text(textForDeleteStyle(language)),
              ),
            ],
          ),
        ) ??
        false;
  }

  String textForDeleteStyle(String language) => switch (language) {
        'zh-TW' => '刪除風格',
        'en-US' => 'Delete style',
        'ja-JP' => 'スタイルを削除',
        'ko-KR' => '스타일 삭제',
        _ => '删除风格',
      };

  Future<void> _showStyleLibrary(
    BuildContext context,
    GenerateScreenText text,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Consumer<AppState>(
          builder: (context, state, _) {
            final labels = _groupText(state.settings.language);
            final groups = <String>{
              'Default',
              ...state.settings.stylePromptPresetGroups,
              ...state.settings.stylePromptPresets
                  .map((preset) => preset.group),
            }.toList();
            if (!groups.contains(_selectedGroup)) {
              final current = state.settings.stylePromptPresets
                  .where((preset) =>
                      preset.prompt.trim() == state.params.stylePrompt.trim())
                  .firstOrNull;
              _selectedGroup = current?.group ?? 'Default';
            }

            Future<void> createGroup() async {
              final name =
                  await _askGroupName(sheetContext, state.settings.language);
              if (name == null || name.isEmpty) return;
              final created = await state.addStylePromptPresetGroup(name);
              if (!context.mounted) return;
              if (created) {
                setState(() => _selectedGroup = name);
                setSheetState(() {});
              }
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content:
                    Text(created ? '${labels.created}“$name”。' : labels.exists),
              ));
            }

            Widget presetTile(StylePromptPreset preset) {
              final selected =
                  preset.prompt.trim() == state.params.stylePrompt.trim();
              return ListTile(
                minTileHeight: 54,
                contentPadding: const EdgeInsets.only(left: 20, right: 4),
                leading: Icon(
                  selected ? Icons.check_circle : Icons.palette_outlined,
                  color:
                      selected ? Theme.of(context).colorScheme.primary : null,
                ),
                title: Text(preset.name,
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text(preset.prompt,
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                onTap: () {
                  state.applyStylePromptPreset(preset);
                  Navigator.pop(sheetContext);
                },
                trailing: PopupMenuButton<String>(
                  tooltip: labels.moveTo,
                  onSelected: (value) async {
                    if (value == '__images') {
                      await _showImageManager(sheetContext, preset.id, text);
                    } else if (value == '__delete') {
                      if (!await _confirmStyleDelete(
                          sheetContext, preset.name, state.settings.language)) {
                        return;
                      }
                      await state.removeStylePromptPreset(preset.id);
                    } else if (value.startsWith('group:')) {
                      await state.moveStylePromptPreset(
                          preset.id, value.substring(6));
                    }
                    if (context.mounted) setSheetState(() {});
                  },
                  itemBuilder: (context) => [
                    PopupMenuItem<String>(
                      enabled: false,
                      child: Text(labels.moveTo),
                    ),
                    ...groups.map((group) => PopupMenuItem<String>(
                          value: 'group:$group',
                          enabled: group != preset.group,
                          child: Row(
                            children: [
                              if (group == preset.group)
                                const Icon(Icons.check, size: 18)
                              else
                                const SizedBox(width: 18),
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(group == 'Default'
                                    ? labels.defaultGroup
                                    : group),
                              ),
                            ],
                          ),
                        )),
                    const PopupMenuDivider(),
                    PopupMenuItem<String>(
                      value: '__images',
                      child: Text(text.stylePresetImages),
                    ),
                    PopupMenuItem<String>(
                      value: '__delete',
                      child: Text(text.deleteStylePreset),
                    ),
                  ],
                ),
              );
            }

            return RepaintBoundary(
              key: const ValueKey('style-preset-library-sheet'),
              child: DraggableScrollableSheet(
                expand: false,
                initialChildSize: 0.76,
                minChildSize: 0.44,
                maxChildSize: 0.96,
                builder: (context, controller) => Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 0, 18, 10),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(labels.manage,
                                style: Theme.of(context).textTheme.titleLarge),
                          ),
                          Text('${state.settings.stylePromptPresets.length}',
                              style: Theme.of(context).textTheme.labelLarge),
                        ],
                      ),
                    ),
                    const Divider(height: 1),
                    Expanded(
                      child: ListView(
                        controller: controller,
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
                        children: [
                          ...groups.map((group) {
                            final presets = state.settings.stylePromptPresets
                                .where((preset) => preset.group == group)
                                .toList()
                              ..sort((a, b) => a.name
                                  .toLowerCase()
                                  .compareTo(b.name.toLowerCase()));
                            return Card(
                              margin: const EdgeInsets.only(bottom: 6),
                              clipBehavior: Clip.antiAlias,
                              child: ExpansionTile(
                                key: PageStorageKey('style-group-$group'),
                                initiallyExpanded: _selectedGroup == group,
                                leading: Icon(_selectedGroup == group
                                    ? Icons.folder_open_outlined
                                    : Icons.folder_outlined),
                                title: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        group == 'Default'
                                            ? labels.defaultGroup
                                            : group,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                    Text('${presets.length}',
                                        style: Theme.of(context)
                                            .textTheme
                                            .labelSmall),
                                    if (group != 'Default')
                                      IconButton(
                                        tooltip: labels.deleteGroup,
                                        visualDensity: VisualDensity.compact,
                                        onPressed: () async {
                                          if (!await _confirmGroupDelete(
                                              sheetContext,
                                              group,
                                              state.settings.language)) return;
                                          await state
                                              .removeStylePromptPresetGroup(
                                                  group);
                                          if (!context.mounted) return;
                                          setState(
                                              () => _selectedGroup = 'Default');
                                          setSheetState(() {});
                                        },
                                        icon: const Icon(Icons.delete_outline,
                                            size: 20),
                                      ),
                                  ],
                                ),
                                onExpansionChanged: (expanded) {
                                  if (expanded) {
                                    setState(() => _selectedGroup = group);
                                    setSheetState(() {});
                                  }
                                },
                                children: presets.isEmpty
                                    ? [
                                        Padding(
                                          padding: const EdgeInsets.all(16),
                                          child: Text(text.chooseStylePreset),
                                        ),
                                      ]
                                    : presets.map(presetTile).toList(),
                              ),
                            );
                          }),
                          OutlinedButton.icon(
                            onPressed: createGroup,
                            icon: const Icon(Icons.create_new_folder_outlined),
                            label: Text(labels.create),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = generateScreenTextFor(state.settings.language);
    final labels = _groupText(state.settings.language);
    final selected = state.settings.stylePromptPresets
        .where(
            (preset) => preset.prompt.trim() == state.params.stylePrompt.trim())
        .firstOrNull;
    final messenger = ScaffoldMessenger.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(text.stylePresets,
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                ),
                Text('${state.settings.stylePromptPresets.length}',
                    style: Theme.of(context).textTheme.labelMedium),
              ],
            ),
            const SizedBox(height: 8),
            InkWell(
              key: const ValueKey('style-preset-library-trigger'),
              borderRadius: BorderRadius.circular(12),
              onTap: () => _showStyleLibrary(context, text),
              child: InputDecorator(
                decoration: InputDecoration(
                  labelText: labels.manage,
                  border: const OutlineInputBorder(),
                  suffixIcon: const Icon(Icons.keyboard_arrow_down),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.palette_outlined, size: 20),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Text(
                        selected == null
                            ? text.chooseStylePreset
                            : '${selected.name} · ${selected.group == 'Default' ? labels.defaultGroup : selected.group}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.icon(
                  onPressed: () async {
                    final prompt = state.params.stylePrompt.trim();
                    if (prompt.isEmpty) {
                      messenger.showSnackBar(
                        SnackBar(content: Text(text.stylePresetNeedPrompt)),
                      );
                      return;
                    }
                    final fallback =
                        prompt.length > 28 ? prompt.substring(0, 28) : prompt;
                    final name = await _askName(context, text, fallback);
                    if (name == null || name.trim().isEmpty) return;
                    final preset = await state.addStylePromptPreset(
                      name: name,
                      prompt: prompt,
                      group:
                          _selectedGroup == 'all' ? 'Default' : _selectedGroup,
                    );
                    messenger.showSnackBar(SnackBar(
                      content:
                          Text(_fillName(text.stylePresetSaved, preset.name)),
                    ));
                  },
                  icon: const Icon(Icons.push_pin_outlined),
                  label: Text(text.saveStylePreset),
                ),
                OutlinedButton.icon(
                  onPressed: selected == null
                      ? null
                      : () async {
                          final name = selected.name;
                          if (!await _confirmStyleDelete(
                              context, name, state.settings.language)) return;
                          await state.removeStylePromptPreset(selected.id);
                          messenger.showSnackBar(SnackBar(
                            content:
                                Text(_fillName(text.stylePresetDeleted, name)),
                          ));
                        },
                  icon: const Icon(Icons.delete_outline),
                  label: Text(text.deleteStylePreset),
                ),
                OutlinedButton.icon(
                  onPressed: selected == null
                      ? null
                      : () => _showImageManager(context, selected.id, text),
                  icon: const Icon(Icons.photo_library_outlined),
                  label: Text(
                    '${text.stylePresetImages} ${selected?.previewImages.length ?? 0}/3',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PromptShortcutBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = generateScreenTextFor(state.settings.language);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              text.promptShortcuts,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: state.settings.promptShortcuts
                  .map(
                    (template) => ActionChip(
                      avatar: const Icon(Icons.bolt, size: 18),
                      label: Text(template.name),
                      onPressed: () => state.applyPromptShortcut(template),
                    ),
                  )
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class _PreviewCard extends StatelessWidget {
  final VoidCallback onPick;
  const _PreviewCard({required this.onPick});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = generateScreenTextFor(state.settings.language);
    final current = state.current;
    final work = state.workbenchImage;
    final path = work?.filePath ?? current?.filePath;
    return AspectRatio(
      aspectRatio: 1,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (path != null && File(path).existsSync())
              ZoomableImage(
                image: Image.file(File(path), fit: BoxFit.contain),
              )
            else
              Center(child: Text(text.previewEmpty)),
            if (state.busy)
              Container(
                  color: Colors.black38,
                  child: const Center(child: CircularProgressIndicator())),
            Positioned(
              right: 8,
              bottom: 8,
              child: Wrap(
                spacing: 8,
                children: [
                  FilledButton.tonalIcon(
                      onPressed: onPick,
                      icon: const Icon(Icons.image),
                      label: Text(text.loadImage)),
                  if (work != null)
                    FilledButton.tonalIcon(
                        onPressed: state.clearWorkbench,
                        icon: const Icon(Icons.close),
                        label: Text(text.switchToTextToImage)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TagSearchBox extends StatefulWidget {
  final void Function(String tag, bool negative) onInsert;
  const _TagSearchBox({required this.onInsert});

  @override
  State<_TagSearchBox> createState() => _TagSearchBoxState();
}

class _TagSearchBoxState extends State<_TagSearchBox> {
  final ctrl = TextEditingController();
  late final Future<List<CapsuleCategory>> taxonomy;
  List<TagSuggestion> tags = [];

  @override
  void initState() {
    super.initState();
    taxonomy = loadCapsuleTaxonomy();
  }

  @override
  void dispose() {
    ctrl.dispose();
    super.dispose();
  }

  Future<void> _search(String value) async {
    if (value.trim().isEmpty) {
      setState(() => tags = []);
      return;
    }
    final result = await context.read<AppState>().suggestTags(value);
    if (mounted) setState(() => tags = result);
  }

  Future<void> _openCapsules() async {
    FocusManager.instance.primaryFocus?.unfocus();
    final categories = await taxonomy;
    if (!mounted) return;
    final text =
        generateScreenTextFor(context.read<AppState>().settings.language);
    if (categories.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(text.capsuleLoadFailed)),
      );
      return;
    }
    final selected = await showModalBottomSheet<_CapsulePick>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _CapsulePickerSheet(categories: categories),
    );
    if (selected != null) {
      widget.onInsert(selected.tag.replaceAll('_', ' '), selected.negative);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = generateScreenTextFor(state.settings.language);
    final language = state.settings.language;
    final hasOfflineTags = state.offlineTagStatus.downloaded;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: ctrl,
              decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  labelText: text.tagSearchLabel,
                  hintText: text.tagSearchHint,
                  border: const OutlineInputBorder()),
              onChanged: _search,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                OutlinedButton.icon(
                  onPressed: _openCapsules,
                  icon: const Icon(Icons.category_outlined),
                  label: Text(text.browseCategories),
                ),
                if (!hasOfflineTags)
                  FilledButton.tonalIcon(
                    onPressed:
                        state.offlineTagBusy ? null : state.downloadOfflineTags,
                    icon: state.offlineTagBusy
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.download_for_offline_outlined),
                    label: Text(state.offlineTagBusy
                        ? text.downloadBusy
                        : text.downloadChineseTags),
                  )
                else
                  Text(
                    '${text.tagsReadyPrefix}${state.offlineTagStatus.count}${text.tagsReadySuffix}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
            if (!hasOfflineTags)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  text.offlineTagHint,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            if (tags.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: tags
                    .map((t) => ActionChip(
                        label: Text(
                          '${t.tag} · ${localizedTagLabel(
                            language,
                            t.tag,
                            sourceLabel: t.description,
                          )}',
                        ),
                        onPressed: () => widget.onInsert(t.tag, false)))
                    .toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CapsulePick {
  final String tag;
  final bool negative;

  const _CapsulePick(this.tag, this.negative);
}

class _CapsulePickerSheet extends StatefulWidget {
  final List<CapsuleCategory> categories;

  const _CapsulePickerSheet({required this.categories});

  @override
  State<_CapsulePickerSheet> createState() => _CapsulePickerSheetState();
}

class _CapsulePickerSheetState extends State<_CapsulePickerSheet> {
  int categoryIndex = 0;
  int subgroupIndex = 0;

  @override
  Widget build(BuildContext context) {
    final category = widget.categories[categoryIndex];
    final subgroup = category.subgroups[subgroupIndex];
    final settings = context.watch<AppState>().settings;
    final text = generateScreenTextFor(settings.language);
    final language = settings.language;
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.84,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                text.inspirationCapsules,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  for (var index = 0; index < widget.categories.length; index++)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(localizedCapsuleCategoryName(
                            language, widget.categories[index].name)),
                        selected: categoryIndex == index,
                        onSelected: (_) => setState(() {
                          categoryIndex = index;
                          subgroupIndex = 0;
                        }),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  for (var index = 0;
                      index < category.subgroups.length;
                      index++)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(localizedCapsuleSubgroupName(
                            language, category.subgroups[index].name)),
                        selected: subgroupIndex == index,
                        onSelected: (_) =>
                            setState(() => subgroupIndex = index),
                      ),
                    ),
                ],
              ),
            ),
            const Divider(height: 17),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: subgroup.tags
                        .map((tag) => ActionChip(
                              labelPadding:
                                  const EdgeInsets.symmetric(horizontal: 6),
                              label: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    tag.tag.replaceAll('_', ' '),
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600),
                                  ),
                                  if (tag.label.isNotEmpty)
                                    Text(
                                      localizedTagLabel(
                                        language,
                                        tag.tag,
                                        sourceLabel: tag.label,
                                      ),
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onSurfaceVariant,
                                      ),
                                    ),
                                ],
                              ),
                              onPressed: () => Navigator.pop(
                                context,
                                _CapsulePick(tag.tag, category.isNegative),
                              ),
                            ))
                        .toList(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ParamControls extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final watched = context.watch<AppState>();
    final p = watched.params;
    final language = watched.settings.language;
    final text = generateScreenTextFor(language);
    String t(String key) => mobileUiTextFor(language, key);
    final mode = p.model == 'nai-diffusion-furry-3'
        ? 'furry'
        : watched.settings.modelMode;
    final visibleModels = naiModels
        .where((model) => mode == 'furry'
            ? model.value == 'nai-diffusion-furry-3' ||
                model.value.startsWith('nai-diffusion-4') ||
                model.value.startsWith('nai-diffusion-5')
            : model.value != 'nai-diffusion-furry-3')
        .toList();
    return Column(
      children: [
        SegmentedButton<String>(
          segments: [
            ButtonSegment(
              value: 'anime',
              icon: const Icon(Icons.face_outlined),
              label: Text(text.animeMode),
            ),
            ButtonSegment(
              value: 'furry',
              icon: const Icon(Icons.pets_outlined),
              label: Text(text.furryMode),
            ),
          ],
          selected: {mode},
          onSelectionChanged: (selection) async {
            final next = selection.first;
            await state.setSettings((settings) => settings.modelMode = next);
            state.setParam((params) {
              final supportsFurry = params.model == 'nai-diffusion-furry-3' ||
                  params.model.startsWith('nai-diffusion-4') ||
                  params.model.startsWith('nai-diffusion-5');
              final supportsAnime = params.model != 'nai-diffusion-furry-3';
              if ((next == 'furry' && !supportsFurry) ||
                  (next == 'anime' && !supportsAnime)) {
                params.model = 'nai-diffusion-5-full';
              }
            });
          },
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: p.model,
          decoration: InputDecoration(
              labelText: text.model, border: const OutlineInputBorder()),
          isExpanded: true,
          items: visibleModels
              .map((m) => DropdownMenuItem(
                  value: m.value,
                  child: Text(
                      localizedNaiOptionLabel(language, m.value, m.label),
                      overflow: TextOverflow.ellipsis)))
              .toList(),
          onChanged: (v) =>
              v == null ? null : state.setParam((x) => x.model = v),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: sizePresets.map((s) {
            final selected = p.width == s.width && p.height == s.height;
            return ChoiceChip(
                label: Text(localizedSizePresetLabel(
                    language, s.width, s.height, s.label)),
                selected: selected,
                onSelected: (_) {
                  if (watched.workbenchImage != null) {
                    state.setI2ISizeMode('custom');
                  }
                  state.setParam((x) => (x
                    ..width = s.width
                    ..height = s.height));
                });
          }).toList(),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _SyncedNumberField(
                label: text.width,
                value: p.width,
                commitOnly: true,
                normalize: (value) =>
                    snapNaiDimensionWithinArea(value, p.height, p.width),
                onChanged: (value) {
                  if (watched.workbenchImage != null) {
                    state.setI2ISizeMode('custom');
                  }
                  state.setParam((x) => x.width = value);
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _SyncedNumberField(
                label: text.height,
                value: p.height,
                commitOnly: true,
                normalize: (value) =>
                    snapNaiDimensionWithinArea(value, p.width, p.height),
                onChanged: (value) {
                  if (watched.workbenchImage != null) {
                    state.setI2ISizeMode('custom');
                  }
                  state.setParam((x) => x.height = value);
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            t('size.commitHint'),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: p.sampler,
          decoration: InputDecoration(
              labelText: text.sampler, border: const OutlineInputBorder()),
          isExpanded: true,
          items: naiSamplers
              .map((s) => DropdownMenuItem(
                  value: s.value,
                  child: Text(
                      localizedNaiOptionLabel(language, s.value, s.label))))
              .toList(),
          onChanged: (v) =>
              v == null ? null : state.setParam((x) => x.sampler = v),
        ),
        _Slider(
            label: 'Steps',
            value: p.steps.toDouble(),
            min: 1,
            max: 50,
            divisions: 49,
            onChanged: (v) => state.setParam((x) => x.steps = v.round()),
            display: '${p.steps}'),
        _Slider(
            label: 'CFG Scale',
            value: p.cfgScale,
            min: 1,
            max: 10,
            divisions: 45,
            onChanged: (v) => state.setParam(
                (x) => x.cfgScale = double.parse(v.toStringAsFixed(1))),
            display: p.cfgScale.toStringAsFixed(1)),
        _Slider(
            label: 'CFG Rescale',
            value: p.cfgRescale,
            min: 0,
            max: 1,
            divisions: 100,
            onChanged: (v) => state.setParam(
                (x) => x.cfgRescale = double.parse(v.toStringAsFixed(2))),
            display: p.cfgRescale.toStringAsFixed(2)),
        if (p.supportsNoiseScheduleControl) ...[
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            value: p.noiseSchedule,
            isExpanded: true,
            decoration: InputDecoration(
                labelText: text.noiseSchedule,
                border: const OutlineInputBorder()),
            items: naiNoiseSchedules
                .map((option) => DropdownMenuItem(
                      value: option.value,
                      child: Text(localizedNaiOptionLabel(
                          language, option.value, option.label)),
                    ))
                .toList(),
            onChanged: (value) => value == null
                ? null
                : state.setParam((x) => x.noiseSchedule = value),
          ),
        ],
        const SizedBox(height: 10),
        DropdownButtonFormField<int>(
          value: p.ucPreset,
          isExpanded: true,
          decoration: InputDecoration(
              labelText: text.ucPreset, border: const OutlineInputBorder()),
          items: ucPresets
              .map((option) => DropdownMenuItem(
                    value: int.parse(option.value),
                    child: Text(localizedNaiOptionLabel(
                        language, option.value, option.label)),
                  ))
              .toList(),
          onChanged: (value) =>
              value == null ? null : state.setParam((x) => x.ucPreset = value),
        ),
        const SizedBox(height: 10),
        SegmentedButton<String>(
          segments: [
            ButtonSegment(
                value: 'random',
                icon: const Icon(Icons.casino_outlined),
                label: Text(text.randomSeed)),
            ButtonSegment(
                value: 'fixed',
                icon: const Icon(Icons.push_pin_outlined),
                label: Text(text.fixedSeed)),
          ],
          selected: {p.seedMode},
          onSelectionChanged: (selection) => state.setParam((x) {
            x.seedMode = selection.first;
            // Roll a fresh seed instead of always landing on 1 — matches
            // desktop and this screen's own "randomize" button below.
            if (x.seedMode == 'fixed' && x.seed <= 0) {
              x.seed = Random.secure().nextInt(0x100000000 - 1) + 1;
            }
          }),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            if (p.seedMode == 'fixed')
              Expanded(
                child: _SyncedNumberField(
                  label: 'Seed',
                  value: p.seed,
                  onChanged: (value) => state.setParam((x) {
                    x.seed = value.clamp(1, 0xffffffff);
                    x.seedMode = 'fixed';
                  }),
                ),
              ),
            if (p.seedMode == 'fixed')
              IconButton(
                tooltip: text.fixedSeedTooltip,
                onPressed: () => state.setParam(
                  (x) => x.seed = Random.secure().nextInt(0x100000000 - 1) + 1,
                ),
                icon: const Icon(Icons.casino_outlined),
              ),
            if (p.seedMode == 'fixed') const SizedBox(width: 12),
            Expanded(
              child: _SyncedNumberField(
                label: text.batch,
                value: context.watch<AppState>().batchCount,
                onChanged: state.setBatchCount,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        QualityPresetControl(
          language: language,
          model: p.model,
          value: p.qualityPreset,
          transparentBackground: p.transparentBackground,
          onChanged: (value) => state.setParam((x) {
            x
              ..qualityPreset = value
              ..qualityToggle = value != 'none';
          }),
          onTransparentChanged: (value) => state.setParam(
            (x) => x.transparentBackground = value,
          ),
        ),
        if (p.supportsVariety)
          SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(text.variety),
              value: p.variety,
              onChanged: (v) => state.setParam((x) => x.variety = v)),
        if (!p.isV4Plus) ...[
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(t('generate.smea')),
            value: p.smea,
            onChanged: (value) => state.setParam((x) {
              x.smea = value;
              if (!value) x.smeaDyn = false;
            }),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(t('generate.smeaDyn')),
            value: p.smeaDyn,
            onChanged: p.smea
                ? (value) => state.setParam((x) => x.smeaDyn = value)
                : null,
          ),
        ],
      ],
    );
  }
}

class _I2IControls extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final text = generateScreenTextFor(s.settings.language);
    String t(String key) => mobileUiTextFor(s.settings.language, key);
    final source = s.workbenchImage;
    final output = s.i2iOutputSize;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Align(
                alignment: Alignment.centerLeft,
                child: Text(text.i2iParams,
                    style: const TextStyle(fontWeight: FontWeight.bold))),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: [
                ButtonSegment(
                  value: 'adaptive',
                  icon: const Icon(Icons.auto_fix_high_outlined),
                  label: Text(t('i2i.sizeAdaptive')),
                ),
                ButtonSegment(
                  value: 'custom',
                  icon: const Icon(Icons.aspect_ratio_outlined),
                  label: Text(t('i2i.sizeCustom')),
                ),
              ],
              selected: {s.i2iSizeMode},
              onSelectionChanged: (selection) =>
                  s.setI2ISizeMode(selection.first),
            ),
            if (source != null) ...[
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  s.i2iSizeMode == 'adaptive'
                      ? mobileUiFormatFor(
                          s.settings.language,
                          'i2i.sizeAdaptivePath',
                          {
                            'source': '${source.width}×${source.height}',
                            'output': '${output.$1}×${output.$2}',
                          },
                        )
                      : mobileUiFormatFor(
                          s.settings.language,
                          'i2i.sizeCustomPath',
                          {'output': '${output.$1}×${output.$2}'},
                        ),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ],
            _Slider(
                label: text.strength,
                value: s.i2i.strength,
                min: 0,
                max: 1,
                divisions: 20,
                display: s.i2i.strength.toStringAsFixed(2),
                onChanged: (v) {
                  s.i2i.strength = v;
                  s.markChanged();
                }),
            _Slider(
                label: text.noise,
                value: s.i2i.noise,
                min: 0,
                max: 0.99,
                divisions: 20,
                display: s.i2i.noise.toStringAsFixed(2),
                onChanged: (v) {
                  s.i2i.noise = v;
                  s.markChanged();
                }),
            const SizedBox(height: 8),
            _SyncedNumberField(
              label: text.extraNoiseSeed,
              value: s.i2i.extraNoiseSeed,
              onChanged: (value) {
                s.i2i.extraNoiseSeed = value.clamp(0, 2147483647);
                s.markChanged();
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _OutputControls extends StatelessWidget {
  Future<void> _createGroup(BuildContext context, AppState state) async {
    final controller = TextEditingController();
    final language = state.settings.language;
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(mobileUiTextFor(language, 'gallery.createGroup')),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(
            labelText: mobileUiTextFor(language, 'gallery.groupName'),
            border: const OutlineInputBorder(),
          ),
          onSubmitted: (value) => Navigator.pop(dialogContext, value),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(mobileUiTextFor(language, 'common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: Text(mobileUiTextFor(language, 'common.create')),
          ),
        ],
      ),
    );
    controller.dispose();
    if (name != null && name.trim().isNotEmpty) {
      await state.createGenerationGroup(name);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = generateScreenTextFor(state.settings.language);
    final selectedExists = state.generationGroupId.isEmpty ||
        state.groups.any((group) => group.id == state.generationGroupId);
    final selected = selectedExists ? state.generationGroupId : '';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(text.output,
                style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            TextFormField(
              initialValue: state.params.fileNamePrefix,
              decoration: InputDecoration(
                labelText: text.imagePrefix,
                border: const OutlineInputBorder(),
              ),
              onChanged: (value) =>
                  state.setParam((params) => params.fileNamePrefix = value),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: selected,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: text.historyGroup,
                border: const OutlineInputBorder(),
              ),
              items: [
                DropdownMenuItem(value: '', child: Text(text.ungrouped)),
                ...state.groups.map(
                  (group) => DropdownMenuItem(
                    value: group.id,
                    child: Text(group.name, overflow: TextOverflow.ellipsis),
                  ),
                ),
              ],
              onChanged: (value) {
                state.setGenerationGroup(value ?? '');
              },
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => _createGroup(context, state),
              icon: const Icon(Icons.create_new_folder_outlined),
              label: Text(mobileUiTextFor(
                  state.settings.language, 'gallery.createGroup')),
            ),
          ],
        ),
      ),
    );
  }
}

class _SyncedNumberField extends StatefulWidget {
  final String label;
  final int value;
  final ValueChanged<int> onChanged;
  final bool commitOnly;
  final int Function(int value)? normalize;

  const _SyncedNumberField({
    required this.label,
    required this.value,
    required this.onChanged,
    this.commitOnly = false,
    this.normalize,
  });

  @override
  State<_SyncedNumberField> createState() => _SyncedNumberFieldState();
}

class _SyncedNumberFieldState extends State<_SyncedNumberField> {
  late final TextEditingController controller;
  late final FocusNode focusNode;

  @override
  void initState() {
    super.initState();
    controller = TextEditingController(text: '${widget.value}');
    focusNode = FocusNode()..addListener(_finishAfterEditing);
  }

  @override
  void didUpdateWidget(covariant _SyncedNumberField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!focusNode.hasFocus && controller.text != '${widget.value}') {
      controller.text = '${widget.value}';
    }
  }

  void _finishAfterEditing() {
    if (focusNode.hasFocus) return;
    if (widget.commitOnly) {
      final parsed = int.tryParse(controller.text);
      if (parsed != null) {
        final next = widget.normalize?.call(parsed) ?? parsed;
        controller.text = '$next';
        if (next != widget.value) widget.onChanged(next);
        return;
      }
    }
    if (controller.text != '${widget.value}') {
      controller.text = '${widget.value}';
    }
  }

  @override
  void dispose() {
    focusNode
      ..removeListener(_finishAfterEditing)
      ..dispose();
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        focusNode: focusNode,
        keyboardType: TextInputType.number,
        decoration: InputDecoration(
          labelText: widget.label,
          border: const OutlineInputBorder(),
        ),
        onChanged: (raw) {
          if (widget.commitOnly) return;
          final value = int.tryParse(raw);
          if (value != null) widget.onChanged(value);
        },
        onSubmitted: (_) => focusNode.unfocus(),
      );
}

class _CharacterPrompts extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final language = s.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                    child: Text(t('generate.characterPrompts'),
                        style: const TextStyle(fontWeight: FontWeight.bold))),
                TextButton.icon(
                    onPressed: s.addCharacter,
                    icon: const Icon(Icons.add),
                    label: Text(t('common.add'))),
              ],
            ),
            if (s.extras.charCaptions.isNotEmpty) ...[
              const SizedBox(height: 8),
              const _CharacterPositionEditor(),
            ],
            for (var i = 0; i < s.extras.charCaptions.length; i++)
              _CharCard(
                key: ObjectKey(s.extras.charCaptions[i]),
                index: i,
              ),
          ],
        ),
      ),
    );
  }
}

class _CharacterPositionEditor extends StatelessWidget {
  const _CharacterPositionEditor();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final captions = state.extras.charCaptions;
    final custom = captions.any((caption) => caption.useCoords);
    final ratio = max(0.2, state.params.width / max(1, state.params.height));

    void setMode(bool enabled) {
      for (final caption in captions) {
        caption.useCoords = enabled;
      }
      state.markChanged();
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(t('generate.positionMode'),
                style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 2),
            Text(t('generate.positionHint'),
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 10),
            SegmentedButton<bool>(
              segments: [
                ButtonSegment(
                  value: false,
                  icon: const Icon(Icons.auto_awesome_outlined),
                  label: Text(t('generate.positionAiChoice')),
                ),
                ButtonSegment(
                  value: true,
                  icon: const Icon(Icons.open_with),
                  label: Text(t('generate.positionCustom')),
                ),
              ],
              selected: {custom},
              showSelectedIcon: false,
              onSelectionChanged: (selection) => setMode(selection.first),
            ),
            if (custom) ...[
              const SizedBox(height: 12),
              LayoutBuilder(
                builder: (context, constraints) {
                  final maxCanvasHeight = min(
                    420.0,
                    MediaQuery.sizeOf(context).height * 0.45,
                  );
                  final canvasWidth = min(
                    constraints.maxWidth,
                    maxCanvasHeight * ratio,
                  );
                  final canvasHeight = canvasWidth / ratio;
                  return Center(
                    child: Container(
                      key: const ValueKey('character-position-canvas'),
                      width: canvasWidth,
                      height: canvasHeight,
                      clipBehavior: Clip.hardEdge,
                      decoration: BoxDecoration(
                        color: const Color(0xFF090B18),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.white24),
                      ),
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          const Positioned.fill(
                            child: IgnorePointer(
                              child: CustomPaint(
                                painter: _CharacterPositionGridPainter(),
                              ),
                            ),
                          ),
                          for (var index = 0; index < captions.length; index++)
                            Positioned(
                              left: ((captions[index].useCoords
                                          ? captions[index].x
                                          : 0.5) *
                                      canvasWidth) -
                                  22,
                              top: ((captions[index].useCoords
                                          ? captions[index].y
                                          : 0.5) *
                                      canvasHeight) -
                                  22,
                              width: 44,
                              height: 44,
                              child: Semantics(
                                label: mobileUiFormatFor(
                                  language,
                                  'generate.positionMarker',
                                  {'index': index + 1},
                                ),
                                button: true,
                                child: RawGestureDetector(
                                  key: ValueKey(
                                      'character-position-marker-$index'),
                                  behavior: HitTestBehavior.opaque,
                                  // Win the gesture arena immediately inside a
                                  // marker. The raw listener still receives the
                                  // exact deltas, while the parent ListView is
                                  // prevented from scrolling during placement.
                                  gestures: {
                                    EagerGestureRecognizer:
                                        GestureRecognizerFactoryWithHandlers<
                                            EagerGestureRecognizer>(
                                      EagerGestureRecognizer.new,
                                      (_) {},
                                    ),
                                  },
                                  child: Listener(
                                    behavior: HitTestBehavior.opaque,
                                    onPointerDown: (_) {
                                      captions[index].useCoords = true;
                                    },
                                    onPointerMove: (event) {
                                      final caption = captions[index];
                                      caption
                                        ..useCoords = true
                                        ..x = (caption.x +
                                                event.delta.dx / canvasWidth)
                                            .clamp(0.0, 1.0)
                                            .toDouble()
                                        ..y = (caption.y +
                                                event.delta.dy / canvasHeight)
                                            .clamp(0.0, 1.0)
                                            .toDouble();
                                      state.markChanged();
                                    },
                                    child: Center(
                                      child: Container(
                                        width: 34,
                                        height: 34,
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(
                                          color: Theme.of(context)
                                              .colorScheme
                                              .primary,
                                          shape: BoxShape.circle,
                                          border: Border.all(
                                            color: Colors.white,
                                            width: 3,
                                          ),
                                          boxShadow: const [
                                            BoxShadow(
                                              color: Colors.black45,
                                              blurRadius: 8,
                                              offset: Offset(0, 3),
                                            ),
                                          ],
                                        ),
                                        child: Text(
                                          '${index + 1}',
                                          style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CharacterPositionGridPainter extends CustomPainter {
  const _CharacterPositionGridPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withOpacity(0.09)
      ..strokeWidth = 1;
    for (final fraction in const [1 / 3, 2 / 3]) {
      canvas.drawLine(
        Offset(size.width * fraction, 0),
        Offset(size.width * fraction, size.height),
        paint,
      );
      canvas.drawLine(
        Offset(0, size.height * fraction),
        Offset(size.width, size.height * fraction),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _CharacterPositionGridPainter oldDelegate) =>
      false;
}

class _ReferenceControls extends StatelessWidget {
  Future<void> _pick(BuildContext context, {required bool precise}) async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked == null || !context.mounted) return;
    final state = context.read<AppState>();
    final error = precise
        ? await state.addPreciseReference(picked.path)
        : await state.addVibeImage(picked.path);
    if (error != null && context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final extras = state.extras;
    return Card(
      child: ExpansionTile(
        leading: const Icon(Icons.auto_awesome_motion_outlined),
        title: Text(t('generate.referenceImages')),
        subtitle: Text(
          mobileUiFormatFor(language, 'generate.referenceSubtitle', {
            'vibe': extras.vibeImages.length,
            'precise': extras.preciseReferences.length
          }),
        ),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        children: [
          ListTile(
            key: const ValueKey('reference-preset-library-open'),
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.collections_bookmark_outlined),
            title: Text(t('referencePresets.title')),
            subtitle: Text(t('referencePresets.subtitle')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => showReferencePresetLibrary(context),
          ),
          const Divider(height: 20),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(t('generate.vibeTransfer'),
                style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(t('generate.vibeHint')),
          ),
          if (!state.params.supportsVibeTransfer)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.info_outline),
              title: Text(t('generate.vibeUnsupportedV5')),
            ),
          for (var index = 0; index < extras.vibeImages.length; index++)
            _VibeReferenceRow(index: index),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: state.params.supportsVibeTransfer
                  ? () => _pick(context, precise: false)
                  : null,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: Text(t('generate.addVibe')),
            ),
          ),
          const Divider(height: 28),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(t('generate.preciseReference'),
                style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              t('generate.preciseHint'),
            ),
          ),
          if (!state.params.supportsPreciseReference)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.warning_amber_rounded),
              title: Text(t('generate.preciseUnsupportedTitle')),
              subtitle: Text(t('generate.preciseUnsupportedSubtitle')),
              trailing: TextButton(
                onPressed: () => state.setParam((params) {
                  params.model = params.model.contains('curated')
                      ? 'nai-diffusion-4-5-curated'
                      : 'nai-diffusion-4-5-full';
                }),
                child: Text(t('generate.switchV45')),
              ),
            ),
          for (var index = 0; index < extras.preciseReferences.length; index++)
            _PreciseReferenceRow(index: index),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: state.params.supportsPreciseReference
                  ? () => _pick(context, precise: true)
                  : null,
              icon: const Icon(Icons.person_search_outlined),
              label: Text(t('generate.addPrecise')),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReferenceThumbnail extends StatelessWidget {
  final String path;
  static const double dimension = 64;
  const _ReferenceThumbnail({required this.path});

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(dimension > 80 ? 12 : 6),
        child: SizedBox.square(
          dimension: dimension,
          child: path.startsWith('asset:')
              ? Image.asset(
                  path.substring(6),
                  fit: BoxFit.contain,
                  cacheWidth: (dimension * 2.5).round(),
                  filterQuality: FilterQuality.low,
                )
              : path.isNotEmpty && File(path).existsSync()
                  ? Image.file(
                      File(path),
                      fit: BoxFit.contain,
                      cacheWidth: (dimension * 2.5).round(),
                      filterQuality: FilterQuality.low,
                    )
                  : const ColoredBox(
                      color: Colors.black12,
                      child: Icon(Icons.broken_image_outlined),
                    ),
        ),
      );
}

class _VibeReferenceRow extends StatelessWidget {
  final int index;
  const _VibeReferenceRow({required this.index});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final item = state.extras.vibeImages[index];
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ReferenceThumbnail(path: item.sourcePath),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              children: [
                _Slider(
                  label: t('generate.infoExtracted'),
                  help: t('generate.infoExtractedHelp'),
                  value: item.infoExtracted,
                  min: 0,
                  max: 1,
                  divisions: 100,
                  display: item.infoExtracted.toStringAsFixed(2),
                  onChanged: (value) =>
                      state.updateVibeImage(index, infoExtracted: value),
                ),
                _Slider(
                  label: t('generate.referenceStrength'),
                  help: t('generate.vibeStrengthHelp'),
                  value: item.strength,
                  min: 0,
                  max: 1,
                  divisions: 100,
                  display: item.strength.toStringAsFixed(2),
                  onChanged: (value) =>
                      state.updateVibeImage(index, strength: value),
                ),
              ],
            ),
          ),
          Column(
            children: [
              IconButton(
                tooltip: t('referencePresets.save'),
                onPressed: () => _saveReferencePreset(
                  context,
                  kind: ReferencePresetKind.vibe,
                  index: index,
                ),
                icon: const Icon(Icons.bookmark_add_outlined),
              ),
              IconButton(
                tooltip: t('common.remove'),
                onPressed: () => state.removeVibeImage(index),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PreciseReferenceRow extends StatelessWidget {
  final int index;
  const _PreciseReferenceRow({required this.index});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final item = state.extras.preciseReferences[index];
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ReferenceThumbnail(path: item.sourcePath),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                DropdownButtonFormField<String>(
                  value: item.type,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: t('generate.referenceType'),
                    border: const OutlineInputBorder(),
                  ),
                  items: [
                    DropdownMenuItem(
                        value: 'character',
                        child: Text(t('generate.refType.character'))),
                    DropdownMenuItem(
                        value: 'style',
                        child: Text(t('generate.refType.style'))),
                    DropdownMenuItem(
                        value: 'character&style',
                        child: Text(t('generate.refType.both'))),
                  ],
                  onChanged: (value) => value == null
                      ? null
                      : state.updatePreciseReference(index, type: value),
                ),
                const SizedBox(height: 5),
                Text(
                  t('generate.referenceTypeHelp'),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                        height: 1.35,
                      ),
                ),
                _Slider(
                  label: t('generate.strengthLabel'),
                  help: t('generate.preciseStrengthHelp'),
                  value: item.strength,
                  min: 0,
                  max: 1,
                  divisions: 100,
                  display: item.strength.toStringAsFixed(2),
                  onChanged: (value) =>
                      state.updatePreciseReference(index, strength: value),
                ),
                _Slider(
                  label: t('generate.fidelityLabel'),
                  help: t('generate.fidelityHelp'),
                  value: item.fidelity,
                  min: 0,
                  max: 1,
                  divisions: 100,
                  display: item.fidelity.toStringAsFixed(2),
                  onChanged: (value) =>
                      state.updatePreciseReference(index, fidelity: value),
                ),
                Text(mobileUiFormatFor(language, 'generate.autoOfficialSize',
                    {'width': item.width, 'height': item.height})),
              ],
            ),
          ),
          Column(
            children: [
              IconButton(
                tooltip: t('referencePresets.save'),
                onPressed: () => _saveReferencePreset(
                  context,
                  kind: ReferencePresetKind.precise,
                  index: index,
                ),
                icon: const Icon(Icons.bookmark_add_outlined),
              ),
              IconButton(
                tooltip: t('common.remove'),
                onPressed: () => state.removePreciseReference(index),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

Future<void> _saveReferencePreset(
  BuildContext context, {
  required ReferencePresetKind kind,
  required int index,
}) async {
  final state = context.read<AppState>();
  final language = state.settings.language;
  String t(String key) => mobileUiTextFor(language, key);
  final nameController = TextEditingController();
  final groupController = TextEditingController();
  final result = await showDialog<(String, String)>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(t('referencePresets.saveTitle')),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: nameController,
              autofocus: true,
              decoration: InputDecoration(
                labelText: t('referencePresets.name'),
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: groupController,
              decoration: InputDecoration(
                labelText: t('referencePresets.group'),
                border: const OutlineInputBorder(),
              ),
            ),
            if (state.referencePresetGroups.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final group in state.referencePresetGroups)
                    ActionChip(
                      label: Text(group),
                      onPressed: () => groupController.text = group,
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: Text(t('common.cancel')),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(
            dialogContext,
            (nameController.text, groupController.text),
          ),
          child: Text(t('common.save')),
        ),
      ],
    ),
  );
  nameController.dispose();
  groupController.dispose();
  if (result == null || !context.mounted) return;
  final error = kind == ReferencePresetKind.vibe
      ? await state.saveVibeReferencePreset(
          index,
          name: result.$1,
          group: result.$2,
        )
      : await state.savePreciseReferencePreset(
          index,
          name: result.$1,
          group: result.$2,
        );
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(error ?? state.displayStatus)),
  );
}

typedef ReferencePresetApplyCallback = Future<String?> Function(
  ReferencePreset preset,
);

Future<void> showReferencePresetLibrary(
  BuildContext context, {
  ReferencePresetApplyCallback? onApplyPreset,
  ReferencePresetKind? allowedKind,
}) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ReferencePresetLibraryPanel(
        onApplyPreset: onApplyPreset,
        allowedKind: allowedKind,
      ),
    );

class ReferencePresetLibraryPanel extends StatefulWidget {
  final VoidCallback? onClose;
  final bool standalone;
  final bool showClose;
  final ReferencePresetApplyCallback? onApplyPreset;
  final ReferencePresetKind? allowedKind;
  const ReferencePresetLibraryPanel({
    super.key,
    this.onClose,
    this.standalone = false,
    this.showClose = true,
    this.onApplyPreset,
    this.allowedKind,
  });

  @override
  State<ReferencePresetLibraryPanel> createState() =>
      _ReferencePresetLibraryPanelState();
}

class _ReferencePresetLibraryPanelState
    extends State<ReferencePresetLibraryPanel> {
  static const _allGroups = '__all__';
  static const _ungrouped = '__ungrouped__';
  String _group = _allGroups;
  ReferencePresetKind? _kind;
  bool _busy = false;
  String _query = '';
  int _section = 0;
  final Set<String> _selectedIds = <String>{};

  Widget _presetImage(String path) => path.startsWith('asset:')
      ? Image.asset(path.substring(6), fit: BoxFit.contain)
      : Image.file(File(path), fit: BoxFit.contain);

  @override
  void initState() {
    super.initState();
    _kind = widget.allowedKind;
  }

  Future<void> _addPreset(BuildContext context) async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked == null || !context.mounted) return;
    final state = context.read<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final nameController = TextEditingController();
    final groupController = TextEditingController();
    if (_group != _allGroups && _group != _ungrouped) {
      groupController.text = _group;
    }
    var kind = widget.allowedKind ?? ReferencePresetKind.vibe;
    var infoExtracted = 1.0;
    var strength = 1.0;
    var fidelity = 1.0;
    var preciseType = 'character';
    final result = await showDialog<ReferencePresetKind>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: Text(t('referencePresets.add')),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 220),
                    child: Image.file(File(picked.path), fit: BoxFit.contain),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: nameController,
                    autofocus: true,
                    decoration: InputDecoration(
                      labelText: t('referencePresets.name'),
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: groupController,
                    decoration: InputDecoration(
                      labelText: t('referencePresets.group'),
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 10),
                  if (widget.allowedKind == null)
                    DropdownButtonFormField<ReferencePresetKind>(
                      value: kind,
                      isExpanded: true,
                      decoration: InputDecoration(
                        labelText: t('referencePresets.kind'),
                        border: const OutlineInputBorder(),
                      ),
                      items: [
                        DropdownMenuItem(
                          value: ReferencePresetKind.vibe,
                          child: Text(t('referencePresets.vibe')),
                        ),
                        DropdownMenuItem(
                          value: ReferencePresetKind.precise,
                          child: Text(t('referencePresets.precise')),
                        ),
                      ],
                      onChanged: (value) => setDialogState(() {
                        kind = value ?? ReferencePresetKind.vibe;
                        strength = 1;
                      }),
                    ),
                  if (kind == ReferencePresetKind.precise) ...[
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      value: preciseType,
                      isExpanded: true,
                      decoration: InputDecoration(
                        labelText: t('generate.referenceType'),
                        border: const OutlineInputBorder(),
                      ),
                      items: [
                        DropdownMenuItem(
                            value: 'character',
                            child: Text(t('generate.refType.character'))),
                        DropdownMenuItem(
                            value: 'style',
                            child: Text(t('generate.refType.style'))),
                        DropdownMenuItem(
                            value: 'character&style',
                            child: Text(t('generate.refType.both'))),
                      ],
                      onChanged: (value) => setDialogState(
                        () => preciseType = value ?? 'character',
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      t('generate.referenceTypeHelp'),
                      style:
                          Theme.of(dialogContext).textTheme.bodySmall?.copyWith(
                                color: Theme.of(dialogContext)
                                    .colorScheme
                                    .onSurfaceVariant,
                                height: 1.35,
                              ),
                    ),
                  ],
                  _Slider(
                    label: kind == ReferencePresetKind.vibe
                        ? t('generate.infoExtracted')
                        : t('generate.strengthLabel'),
                    help: kind == ReferencePresetKind.vibe
                        ? t('generate.infoExtractedHelp')
                        : t('generate.preciseStrengthHelp'),
                    value: kind == ReferencePresetKind.vibe
                        ? infoExtracted
                        : strength,
                    min: 0,
                    max: 1,
                    divisions: 100,
                    display: (kind == ReferencePresetKind.vibe
                            ? infoExtracted
                            : strength)
                        .toStringAsFixed(2),
                    onChanged: (value) => setDialogState(() {
                      if (kind == ReferencePresetKind.vibe) {
                        infoExtracted = value;
                      } else {
                        strength = value;
                      }
                    }),
                  ),
                  _Slider(
                    label: kind == ReferencePresetKind.vibe
                        ? t('generate.referenceStrength')
                        : t('generate.fidelityLabel'),
                    help: kind == ReferencePresetKind.vibe
                        ? t('generate.vibeStrengthHelp')
                        : t('generate.fidelityHelp'),
                    value:
                        kind == ReferencePresetKind.vibe ? strength : fidelity,
                    min: 0,
                    max: 1,
                    divisions: 100,
                    display:
                        (kind == ReferencePresetKind.vibe ? strength : fidelity)
                            .toStringAsFixed(2),
                    onChanged: (value) => setDialogState(() {
                      if (kind == ReferencePresetKind.vibe) {
                        strength = value;
                      } else {
                        fidelity = value;
                      }
                    }),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(t('common.cancel')),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, kind),
              child: Text(t('common.save')),
            ),
          ],
        ),
      ),
    );
    if (result == null || !context.mounted) {
      nameController.dispose();
      groupController.dispose();
      return;
    }
    final error = await state.saveReferencePresetFromPath(
      picked.path,
      kind: result,
      name: nameController.text,
      group: groupController.text,
      infoExtracted: infoExtracted,
      strength: strength,
      preciseType: preciseType,
      fidelity: fidelity,
      informationExtracted: 1,
    );
    nameController.dispose();
    groupController.dispose();
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error ?? state.displayStatus)),
    );
  }

  Future<void> _createGroup(BuildContext context) async {
    final state = context.read<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(t('referencePresets.createGroup')),
        content: TextField(
          autofocus: true,
          controller: controller,
          decoration: InputDecoration(
            labelText: t('referencePresets.group'),
            border: const OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(t('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: Text(t('common.create')),
          ),
        ],
      ),
    );
    controller.dispose();
    if (value == null || !context.mounted) return;
    final error = await state.addReferencePresetGroup(value);
    if (!context.mounted) return;
    if (error == null && value.trim().isNotEmpty) {
      setState(() => _group = value.trim());
    } else if (error != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error)));
    }
  }

  Future<void> _deleteGroup(BuildContext context) async {
    if (_group == _allGroups || _group == _ungrouped) return;
    final state = context.read<AppState>();
    String t(String key) => mobileUiTextFor(state.settings.language, key);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(t('referencePresets.deleteGroupTitle')),
        content: Text(t('referencePresets.deleteGroupHint')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(t('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(t('referencePresets.deleteGroup')),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    final target = _group;
    await state.deleteReferencePresetGroup(target);
    if (mounted) setState(() => _group = _allGroups);
  }

  Future<void> _movePresetToGroup(
    BuildContext context,
    ReferencePreset preset,
  ) async {
    final state = context.read<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final value = await showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) => ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          ListTile(
            title: Text(t('referencePresets.moveGroup')),
            subtitle: Text(preset.localizedName(language)),
          ),
          RadioListTile<String>(
            value: '',
            groupValue: preset.group,
            title: Text(t('referencePresets.ungrouped')),
            onChanged: (next) => Navigator.pop(sheetContext, next),
          ),
          for (final group in state.referencePresetGroups)
            RadioListTile<String>(
              value: group,
              groupValue: preset.group,
              title: Text(localizeReferencePresetGroup(group, language)),
              onChanged: (next) => Navigator.pop(sheetContext, next),
            ),
        ],
      ),
    );
    if (value == null || !context.mounted) return;
    final error = await state.moveReferencePresetToGroup(preset.id, value);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error ?? state.displayStatus)),
    );
  }

  Future<void> _import(BuildContext context) async {
    final state = context.read<AppState>();
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['nairp', 'zip'],
    );
    final path = result?.files.single.path;
    if (path == null || !context.mounted) return;
    setState(() => _busy = true);
    final error = await state.importReferencePresets(path);
    if (!context.mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error ?? state.displayStatus)),
    );
  }

  Future<void> _export(
    BuildContext context, {
    String? presetId,
    String? group,
  }) async {
    final state = context.read<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    setState(() => _busy = true);
    try {
      final file =
          await state.exportReferencePresets(presetId: presetId, group: group);
      if (!context.mounted) return;
      final box = context.findRenderObject() as RenderBox?;
      await Share.shareXFiles(
        [XFile(file.path)],
        text: t('referencePresets.title'),
        sharePositionOrigin:
            box == null ? null : box.localToGlobal(Offset.zero) & box.size,
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(t('referencePresets.exported'))),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _previewPreset(
      BuildContext context, ReferencePreset preset) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog.fullscreen(
        child: SafeArea(
          child: Stack(
            children: [
              Positioned.fill(
                child: InteractiveViewer(
                  minScale: 0.5,
                  maxScale: 5,
                  child: Center(
                    child: _presetImage(preset.filePath),
                  ),
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
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _deletePreset(
      BuildContext context, ReferencePreset preset) async {
    final state = context.read<AppState>();
    String t(String key) => mobileUiTextFor(state.settings.language, key);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(t('referencePresets.deleteTitle')),
        content: Text(t('referencePresets.deleteConfirm')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(t('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(t('common.remove')),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    await state.deleteReferencePreset(preset.id);
    if (mounted) setState(() => _selectedIds.remove(preset.id));
  }

  Future<void> _applySelected(BuildContext context) async {
    if (_selectedIds.isEmpty || _busy) return;
    final state = context.read<AppState>();
    setState(() => _busy = true);
    String? lastError;
    var applied = 0;
    for (final preset in state.referencePresets
        .where((item) => _selectedIds.contains(item.id))) {
      final error = widget.onApplyPreset == null
          ? await state.applyReferencePreset(preset.id)
          : await widget.onApplyPreset!(preset);
      if (error == null) {
        applied += 1;
      } else {
        lastError = error;
      }
    }
    if (!mounted || !context.mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(lastError ?? '${state.displayStatus} · $applied')),
    );
    if (applied > 0 && context.mounted) Navigator.maybePop(context);
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    String countText(String key, int count) =>
        t(key).replaceAll('{count}', '$count');
    String presetName(ReferencePreset preset) => preset.localizedName(language);
    String groupName(String group) =>
        localizeReferencePresetGroup(group, language);
    final normalizedQuery = _query.trim().toLowerCase();
    final presets = state.referencePresets.where((preset) {
      final matchesGroup = _group == _allGroups ||
          (_group == _ungrouped
              ? preset.group.isEmpty
              : preset.group == _group);
      final matchesAllowed =
          widget.allowedKind == null || preset.kind == widget.allowedKind;
      final matchesQuery = normalizedQuery.isEmpty ||
          preset.localizedSearchText.contains(normalizedQuery);
      return matchesGroup &&
          matchesAllowed &&
          (_kind == null || preset.kind == _kind) &&
          matchesQuery;
    }).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

    Widget presetCard(ReferencePreset preset) {
      final detail = preset.kind == ReferencePresetKind.vibe
          ? '${t('referencePresets.vibe')} · ${preset.infoExtracted.toStringAsFixed(2)} / ${preset.strength.toStringAsFixed(2)}'
          : '${t('referencePresets.precise')} · ${preset.preciseType} · ${preset.strength.toStringAsFixed(2)} / ${preset.fidelity.toStringAsFixed(2)}';
      final presetGroupName = preset.group.isEmpty
          ? t('referencePresets.ungrouped')
          : groupName(preset.group);
      final selected = _selectedIds.contains(preset.id);
      return Card(
        clipBehavior: Clip.antiAlias,
        margin: EdgeInsets.zero,
        color: selected ? Theme.of(context).colorScheme.primaryContainer : null,
        child: InkWell(
          onTap: widget.standalone
              ? null
              : () => setState(() {
                    if (selected) {
                      _selectedIds.remove(preset.id);
                    } else {
                      _selectedIds.add(preset.id);
                    }
                  }),
          onDoubleTap: () => _previewPreset(context, preset),
          onLongPress: () => _previewPreset(context, preset),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Container(
                      color: Theme.of(context).colorScheme.surfaceContainerLow,
                      child: _presetImage(preset.filePath),
                    ),
                    Positioned(
                      left: 8,
                      top: 8,
                      child: Chip(
                        visualDensity: VisualDensity.compact,
                        label: Text(preset.kind == ReferencePresetKind.vibe
                            ? t('referencePresets.vibe')
                            : t('referencePresets.precise')),
                      ),
                    ),
                    if (!widget.standalone)
                      Positioned(
                        right: 8,
                        top: 8,
                        child: Checkbox(
                          value: selected,
                          onChanged: (_) => setState(() {
                            if (selected) {
                              _selectedIds.remove(preset.id);
                            } else {
                              _selectedIds.add(preset.id);
                            }
                          }),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 9, 10, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(presetName(preset),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context)
                            .textTheme
                            .titleSmall
                            ?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 3),
                    Text(presetGroupName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall),
                    Text(detail,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall),
                    if (widget.standalone) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _busy
                                  ? null
                                  : () => _movePresetToGroup(context, preset),
                              child: Text(t('referencePresets.moveGroup')),
                            ),
                          ),
                          IconButton(
                            tooltip: t('common.remove'),
                            onPressed: _busy
                                ? null
                                : () => _deletePreset(context, preset),
                            icon: const Icon(Icons.delete_outline),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    return SizedBox(
      height: widget.standalone
          ? double.infinity
          : MediaQuery.sizeOf(context).height * 0.9,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 760;
          final columns = constraints.maxWidth >= 1180
              ? 5
              : constraints.maxWidth >= 920
                  ? 4
                  : constraints.maxWidth >= 620
                      ? 3
                      : 2;
          final selectedGroupName = _group == _allGroups
              ? t('referencePresets.allGroups')
              : _group == _ungrouped
                  ? t('referencePresets.ungrouped')
                  : groupName(_group);
          return SingleChildScrollView(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: Card(
                    margin: EdgeInsets.zero,
                    color: Theme.of(context).colorScheme.secondaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 24,
                            backgroundColor:
                                Theme.of(context).colorScheme.primaryContainer,
                            child: Icon(
                              Icons.collections_bookmark_outlined,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  t('referencePresets.title'),
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleLarge
                                      ?.copyWith(fontWeight: FontWeight.w800),
                                ),
                                const SizedBox(height: 2),
                                Text(t('referencePresets.importHint')),
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 6,
                                  children: [
                                    Chip(
                                      avatar: const Icon(Icons.image_outlined,
                                          size: 16),
                                      label: Text(countText(
                                          'referencePresets.presetCount',
                                          state.referencePresets.length)),
                                    ),
                                    Chip(
                                      avatar: const Icon(Icons.folder_outlined,
                                          size: 16),
                                      label: Text(countText(
                                          'referencePresets.groupCount',
                                          state.referencePresetGroups.length)),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          if (!widget.standalone && widget.showClose)
                            IconButton.filledTonal(
                              onPressed: widget.onClose ??
                                  () => Navigator.pop(context),
                              icon: const Icon(Icons.close),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
                if (widget.standalone)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: SizedBox(
                      width: double.infinity,
                      child: SegmentedButton<int>(
                        segments: [
                          ButtonSegment(
                            value: 0,
                            icon: const Icon(Icons.cloud_download_outlined),
                            label: Text(t('referencePresets.online')),
                          ),
                          ButtonSegment(
                            value: 1,
                            icon:
                                const Icon(Icons.collections_bookmark_outlined),
                            label: Text(t('referencePresets.local')),
                          ),
                        ],
                        selected: {_section},
                        onSelectionChanged: (value) =>
                            setState(() => _section = value.first),
                      ),
                    ),
                  ),
                if (!widget.standalone || _section == 1) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Card(
                      margin: EdgeInsets.zero,
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            TextField(
                              decoration: InputDecoration(
                                labelText: t('referencePresets.search'),
                                prefixIcon: const Icon(Icons.search),
                                border: const OutlineInputBorder(),
                                suffixIcon: _query.isEmpty
                                    ? null
                                    : IconButton(
                                        onPressed: () =>
                                            setState(() => _query = ''),
                                        icon: const Icon(Icons.close),
                                      ),
                              ),
                              onChanged: (value) =>
                                  setState(() => _query = value),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: DropdownButtonFormField<String>(
                                    value: _group,
                                    isExpanded: true,
                                    decoration: InputDecoration(
                                      labelText:
                                          t('referencePresets.currentGroup'),
                                      prefixIcon: const Icon(
                                          Icons.folder_open_outlined),
                                      border: const OutlineInputBorder(),
                                    ),
                                    items: [
                                      DropdownMenuItem(
                                        value: _allGroups,
                                        child: Text(
                                            t('referencePresets.allGroups')),
                                      ),
                                      DropdownMenuItem(
                                        value: _ungrouped,
                                        child: Text(
                                            t('referencePresets.ungrouped')),
                                      ),
                                      for (final group
                                          in state.referencePresetGroups)
                                        DropdownMenuItem(
                                          value: group,
                                          child: Text(groupName(group)),
                                        ),
                                    ],
                                    onChanged: (value) => setState(
                                        () => _group = value ?? _allGroups),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                if (widget.standalone)
                                  IconButton.filledTonal(
                                    tooltip: t('referencePresets.createGroup'),
                                    onPressed: _busy
                                        ? null
                                        : () => _createGroup(context),
                                    icon: const Icon(
                                        Icons.create_new_folder_outlined),
                                  ),
                                if (widget.standalone &&
                                    _group != _allGroups &&
                                    _group != _ungrouped)
                                  IconButton.filledTonal(
                                    tooltip: t('referencePresets.deleteGroup'),
                                    onPressed: _busy
                                        ? null
                                        : () => _deleteGroup(context),
                                    icon: const Icon(
                                        Icons.folder_delete_outlined),
                                  ),
                              ],
                            ),
                            if (widget.standalone) ...[
                              const SizedBox(height: 8),
                              Text(
                                t('referencePresets.createHint'),
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                              const SizedBox(height: 10),
                            ],
                            if (widget.allowedKind == null) ...[
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  ChoiceChip(
                                    label:
                                        Text(t('referencePresets.filterAll')),
                                    selected: _kind == null,
                                    onSelected: (_) =>
                                        setState(() => _kind = null),
                                  ),
                                  ChoiceChip(
                                    label: Text(t('referencePresets.vibe')),
                                    selected: _kind == ReferencePresetKind.vibe,
                                    onSelected: (_) => setState(
                                        () => _kind = ReferencePresetKind.vibe),
                                  ),
                                  ChoiceChip(
                                    label: Text(t('referencePresets.precise')),
                                    selected:
                                        _kind == ReferencePresetKind.precise,
                                    onSelected: (_) => setState(() =>
                                        _kind = ReferencePresetKind.precise),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                            ],
                            if (widget.standalone)
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  FilledButton.icon(
                                    onPressed: _busy
                                        ? null
                                        : () => _addPreset(context),
                                    icon: const Icon(
                                        Icons.add_photo_alternate_outlined),
                                    label: Text(t('referencePresets.add')),
                                  ),
                                  OutlinedButton.icon(
                                    onPressed:
                                        _busy ? null : () => _import(context),
                                    icon: const Icon(
                                        Icons.file_download_outlined),
                                    label: Text(t('referencePresets.import')),
                                  ),
                                  OutlinedButton.icon(
                                    onPressed: _busy || _group == _allGroups
                                        ? null
                                        : () => _export(
                                              context,
                                              group: _group == _ungrouped
                                                  ? ''
                                                  : _group,
                                            ),
                                    icon: const Icon(Icons.folder_zip_outlined),
                                    label:
                                        Text(t('referencePresets.exportGroup')),
                                  ),
                                  OutlinedButton.icon(
                                    onPressed:
                                        _busy ? null : () => _export(context),
                                    icon: const Icon(Icons.archive_outlined),
                                    label:
                                        Text(t('referencePresets.exportAll')),
                                  ),
                                ],
                              ),
                            if (!widget.standalone)
                              OutlinedButton.icon(
                                onPressed:
                                    _busy ? null : () => _import(context),
                                icon: const Icon(Icons.file_download_outlined),
                                label: Text(t('referencePresets.import')),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (_busy) const LinearProgressIndicator(),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 12, 18, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            selectedGroupName,
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                        ),
                        Text(countText(
                            'referencePresets.presetCount', presets.length)),
                      ],
                    ),
                  ),
                  presets.isEmpty
                      ? SizedBox(
                          height: 220,
                          child: Center(
                            child: Padding(
                              padding: const EdgeInsets.all(24),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.collections_bookmark_outlined,
                                      size: 48,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .outline),
                                  const SizedBox(height: 10),
                                  Text(t('referencePresets.empty')),
                                  const SizedBox(height: 12),
                                ],
                              ),
                            ),
                          ),
                        )
                      : GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          padding: EdgeInsets.fromLTRB(
                              16, 0, 16, widget.standalone ? 24 : 92),
                          gridDelegate:
                              SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: columns,
                            crossAxisSpacing: 10,
                            mainAxisSpacing: 10,
                            mainAxisExtent: wide ? 300 : 270,
                          ),
                          itemCount: presets.length,
                          itemBuilder: (_, index) => presetCard(presets[index]),
                        ),
                ],
                if (widget.standalone && _section == 0)
                  const ReferenceCatalogPanel(autoLoad: true),
                if (!widget.standalone)
                  SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${t('referencePresets.selected')} ${_selectedIds.length}',
                              style: Theme.of(context).textTheme.titleSmall,
                            ),
                          ),
                          TextButton(
                            onPressed: _selectedIds.isEmpty
                                ? null
                                : () => setState(_selectedIds.clear),
                            child: Text(t('referencePresets.clearSelection')),
                          ),
                          const SizedBox(width: 8),
                          FilledButton.icon(
                            onPressed: _selectedIds.isEmpty || _busy
                                ? null
                                : () => _applySelected(context),
                            icon: const Icon(Icons.done_all),
                            label: Text(t('referencePresets.applySelected')),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _CharCard extends StatefulWidget {
  final int index;
  const _CharCard({super.key, required this.index});

  @override
  State<_CharCard> createState() => _CharCardState();
}

class _CharCardState extends State<_CharCard> {
  bool _collapsed = false;

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final language = s.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final c = s.extras.charCaptions[widget.index];
    final characterLabel = mobileUiFormatFor(
      language,
      'generate.characterLabel',
      {'index': widget.index + 1},
    );
    final positionSummary = c.useCoords
        ? '${t('generate.positionCustom')} · '
            'X ${c.x.toStringAsFixed(2)} · Y ${c.y.toStringAsFixed(2)}'
        : t('generate.positionAiChoice');

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(
            color: Theme.of(context).colorScheme.outlineVariant,
          ),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 4, 6),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          characterLabel,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          positionSummary,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                  ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    key: ValueKey('character-card-toggle-${widget.index}'),
                    tooltip: t(_collapsed
                        ? 'generate.characterExpand'
                        : 'generate.characterCollapse'),
                    onPressed: () => setState(() => _collapsed = !_collapsed),
                    icon: Icon(
                      _collapsed ? Icons.expand_more : Icons.expand_less,
                    ),
                  ),
                  IconButton(
                    key: ValueKey('character-card-delete-${widget.index}'),
                    tooltip: t('common.delete'),
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => s.removeCharacter(widget.index),
                  ),
                ],
              ),
            ),
            if (!_collapsed)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                child: Column(
                  children: [
                    TextFormField(
                      key: ValueKey('character-prompt-field-${widget.index}'),
                      initialValue: c.prompt,
                      decoration: InputDecoration(
                        labelText: characterLabel,
                        border: const OutlineInputBorder(),
                      ),
                      onChanged: (v) {
                        c.prompt = v;
                        s.markChanged();
                      },
                    ),
                    const SizedBox(height: 8),
                    TextFormField(
                      key: ValueKey('character-negative-field-${widget.index}'),
                      initialValue: c.negativePrompt,
                      decoration: InputDecoration(
                        labelText: t('generate.characterNegative'),
                        border: const OutlineInputBorder(),
                      ),
                      onChanged: (v) {
                        c.negativePrompt = v;
                        s.markChanged();
                      },
                    ),
                    if (c.useCoords)
                      ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: Text(t('generate.positionExact')),
                        subtitle: Text(
                            'X ${c.x.toStringAsFixed(2)} · Y ${c.y.toStringAsFixed(2)}'),
                        children: [
                          Row(children: [
                            Expanded(
                                child: _Slider(
                                    label: 'X',
                                    value: c.x,
                                    min: 0,
                                    max: 1,
                                    divisions: 100,
                                    display: c.x.toStringAsFixed(2),
                                    onChanged: (v) {
                                      c.x = v;
                                      s.markChanged();
                                    })),
                            Expanded(
                                child: _Slider(
                                    label: 'Y',
                                    value: c.y,
                                    min: 0,
                                    max: 1,
                                    divisions: 100,
                                    display: c.y.toStringAsFixed(2),
                                    onChanged: (v) {
                                      c.y = v;
                                      s.markChanged();
                                    })),
                          ]),
                        ],
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Slider extends StatelessWidget {
  final String label;
  final String? help;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final String display;
  final ValueChanged<double> onChanged;
  const _Slider(
      {required this.label,
      this.help,
      required this.value,
      required this.min,
      required this.max,
      required this.divisions,
      required this.display,
      required this.onChanged});
  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(label, softWrap: true)),
          const SizedBox(width: 8),
          Text(display, style: const TextStyle(fontWeight: FontWeight.bold)),
        ]),
        Slider(
            value: value.clamp(min, max),
            min: min,
            max: max,
            divisions: divisions,
            label: display,
            onChanged: onChanged),
        if (help?.isNotEmpty == true)
          Padding(
            padding: const EdgeInsets.only(left: 4, right: 4, bottom: 6),
            child: Text(
              help!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    height: 1.35,
                  ),
            ),
          ),
      ]);
}

class _RunBar extends StatelessWidget {
  const _RunBar();

  @override
  Widget build(BuildContext context) {
    // Only ever built in portrait — landscape phones use compact AppBar
    // controls instead (see GenerateScreen.build) since this bar's full
    // stacked layout is too tall to dock as a bottomNavigationBar there.
    final state = context.watch<AppState>();
    final text = generateScreenTextFor(state.settings.language);
    final runButton = _PrimaryRunButton(state: state);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _AnlasQuoteBar(state: state),
            const SizedBox(height: 6),
            if (state.generationQueueRunning) ...[
              _GenerationQueuePanel(state: state),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed:
                          state.queueAdding ? null : state.enqueueGeneration,
                      icon: state.queueAdding
                          ? const SizedBox.square(
                              dimension: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.add_to_photos_outlined),
                      label: Text(
                        state.queueAdding
                            ? text.quoting
                            : '${text.addToQueue}（${text.waiting} ${state.generationQueue.length}）',
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  IconButton.filledTonal(
                    tooltip: state.queuePaused ? text.resume : text.pause,
                    onPressed: state.toggleQueuePause,
                    icon: Icon(
                      state.queuePaused ? Icons.play_arrow : Icons.pause,
                    ),
                  ),
                  const SizedBox(width: 4),
                  IconButton.filled(
                    tooltip: text.cancelAndClear,
                    onPressed: state.cancelGeneration,
                    icon: const Icon(Icons.stop),
                  ),
                ],
              ),
            ] else
              SizedBox(
                width: double.infinity,
                child: runButton,
              ),
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                state.displayStatus,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PrimaryRunButton extends StatelessWidget {
  final AppState state;

  const _PrimaryRunButton({required this.state});

  @override
  Widget build(BuildContext context) {
    final text = generateScreenTextFor(state.settings.language);
    return FilledButton.icon(
      onPressed:
          state.busy || !state.account.hasToken ? null : state.runTextOrImage,
      icon: Icon(
          state.workbenchImage == null ? Icons.play_arrow : Icons.image_search),
      label: Text(
        state.workbenchImage == null
            ? (state.batchCount > 1
                ? '${text.generateCountPrefix}${state.batchCount}${text.generateCountSuffix}'
                : text.generateImage)
            : text.useCurrentImage,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}

class _AnlasQuoteBar extends StatelessWidget {
  final AppState state;

  const _AnlasQuoteBar({required this.state});

  @override
  Widget build(BuildContext context) {
    final quote = state.generationQuote;
    final text = generateScreenTextFor(state.settings.language);
    final scheme = Theme.of(context).colorScheme;
    final source = quote?.source == AnlasQuoteSource.officialApi
        ? text.officialQuote
        : quote?.source == AnlasQuoteSource.estimateFormula
            ? text.formulaQuote
            : text.pendingQuote;
    final amount = quote?.amount;
    final warning = quote?.insufficient == true;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: warning
            ? scheme.errorContainer
            : scheme.secondaryContainer.withOpacity(0.55),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        child: Row(
          children: [
            Icon(
              warning ? Icons.warning_amber_rounded : Icons.toll_outlined,
              size: 18,
              color: warning ? scheme.onErrorContainer : scheme.secondary,
            ),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                amount == null
                    ? '${text.precharge}: ${state.account.hasToken ? text.reading : text.configureToken}'
                    : '${text.precharge}: $amount Anlas · $source',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            if (state.quoteLoading)
              const Padding(
                padding: EdgeInsets.only(right: 8),
                child: SizedBox.square(
                  dimension: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            Text(
              '${text.balance} ${state.account.anlasBalance ?? text.unknown}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _GenerationQueuePanel extends StatelessWidget {
  final AppState state;

  const _GenerationQueuePanel({required this.state});

  @override
  Widget build(BuildContext context) {
    final progress = state.queueProgress ?? const GenerationQueueProgress();
    final text = generateScreenTextFor(state.settings.language);
    final finished = progress.done + progress.failed;
    final pending = (progress.total - finished - 1).clamp(0, progress.total);
    final manuallyQueued = state.generationQueue.length;
    final batchPending = (pending - manuallyQueued).clamp(0, pending);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${text.queue} · ${text.running}${pending > 0 ? ' / $pending ${text.queued}' : ''}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                if (pending > 0)
                  IconButton(
                    tooltip: text.clearPending,
                    visualDensity: VisualDensity.compact,
                    onPressed: state.clearPendingGenerationQueue,
                    icon: const Icon(Icons.playlist_remove, size: 20),
                  ),
                IconButton(
                  tooltip: state.queueCollapsed
                      ? text.expandQueue
                      : text.collapseQueue,
                  visualDensity: VisualDensity.compact,
                  onPressed: state.toggleQueueCollapsed,
                  icon: Icon(
                    state.queueCollapsed
                        ? Icons.keyboard_arrow_down
                        : Icons.keyboard_arrow_up,
                    size: 20,
                  ),
                ),
              ],
            ),
            LinearProgressIndicator(
              value: progress.total <= 0 ? null : finished / progress.total,
            ),
            if (!state.queueCollapsed) ...[
              const SizedBox(height: 5),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  state.queuePaused
                      ? text.pauseAfterCurrent
                      : text.runningCurrent,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              if (batchPending > 0)
                _QueueLine(
                    label:
                        '${text.batchPendingPrefix}$batchPending${text.batchPendingSuffix}'),
              for (final job in state.generationQueue)
                _QueueLine(
                  label: job.quotePending
                      ? '${job.label} · ${text.quoting}'
                      : job.label,
                  pending: job.quotePending,
                  trailing: IconButton(
                    tooltip: text.removeFromQueue,
                    visualDensity: VisualDensity.compact,
                    onPressed: () => state.removeQueueJob(job.id),
                    icon: const Icon(Icons.close, size: 18),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _QueueLine extends StatelessWidget {
  final String label;
  final Widget? trailing;
  final bool pending;

  const _QueueLine({required this.label, this.trailing, this.pending = false});

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 30,
        child: Row(
          children: [
            if (pending)
              const SizedBox(
                width: 15,
                height: 15,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else
              const Icon(Icons.schedule, size: 15),
            const SizedBox(width: 6),
            Expanded(
              child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      );
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../i18n/app_locales.dart';
import '../images/png_metadata.dart';
import '../state/app_state.dart';

typedef _MetadataText = ({
  String title,
  String subtitle,
  String choose,
  String replace,
  String dropHint,
  String localOnly,
  String detected,
  String sourceNovelAi,
  String sourceSd,
  String sourceComfy,
  String sourceUnknown,
  String compatible,
  String compatibleHint,
  String apply,
  String applied,
  String noCompatible,
  String details,
  String noParams,
  String raw,
  String copyRaw,
  String copied,
  String viewOnly,
  String readFailed,
});

_MetadataText _metadataTextFor(Object? language) {
  switch (normalizeAppLocaleCode(language)) {
    case 'zh-TW':
      return (
        title: '恢復圖片原始資料',
        subtitle: '讀取 NovelAI、Stable Diffusion WebUI / Forge 與 ComfyUI 圖片內嵌參數。',
        choose: '選擇原始圖片',
        replace: '更換圖片',
        dropHint: '支援 PNG、JPG、JPEG、WebP。請盡量選擇未經聊天軟體壓縮的原圖。',
        localOnly: '零積分 · 不呼叫 AI · 不傳送網路請求',
        detected: '辨識來源',
        sourceNovelAi: 'NovelAI',
        sourceSd: 'Stable Diffusion WebUI / Forge',
        sourceComfy: 'ComfyUI',
        sourceUnknown: '未知或無可辨識參數',
        compatible: '可一鍵使用的參數',
        compatibleHint: '只套用 NovelAI 支援的相容項目；SD 模型、VAE、LoRA 保留供查看。',
        apply: '一鍵套用到生成',
        applied: '已套用相容參數',
        noCompatible: '沒有可直接套用到 NovelAI 的相容參數',
        details: '逐項參數',
        noParams: '沒有讀取到生成參數。圖片可能被壓縮或匯出時關閉了中繼資料。',
        raw: '完整原始資料',
        copyRaw: '複製原始資料',
        copied: '原始資料已複製',
        viewOnly: '部分 SD / ComfyUI 專用值只能查看，無法直接套用到 NovelAI。',
        readFailed: '無法讀取該圖片，請確認檔案未損壞並重新選擇原圖。',
      );
    case 'en-US':
      return (
        title: 'Restore Image Metadata',
        subtitle:
            'Read embedded NovelAI, Stable Diffusion WebUI / Forge, and ComfyUI generation data.',
        choose: 'Choose original image',
        replace: 'Replace image',
        dropHint:
            'Supports PNG, JPG, JPEG, and WebP. Use the uncompressed original whenever possible.',
        localOnly: '0 Anlas · no AI call · no network request',
        detected: 'Detected source',
        sourceNovelAi: 'NovelAI',
        sourceSd: 'Stable Diffusion WebUI / Forge',
        sourceComfy: 'ComfyUI',
        sourceUnknown: 'Unknown or no recognized parameters',
        compatible: 'Parameters ready to reuse',
        compatibleHint:
            'Only NovelAI-compatible values are applied. SD model, VAE, and LoRA values remain view-only.',
        apply: 'Use in Generate',
        applied: 'Compatible parameters applied',
        noCompatible: 'No compatible parameters can be applied to NovelAI',
        details: 'Parameter details',
        noParams:
            'No generation parameters were found. The image may have been compressed or exported without metadata.',
        raw: 'Complete raw metadata',
        copyRaw: 'Copy raw metadata',
        copied: 'Raw metadata copied',
        viewOnly:
            'Some SD / ComfyUI-only values are view-only and cannot be applied directly to NovelAI.',
        readFailed:
            'Could not read this image. Check that the file is intact and choose the original again.',
      );
    case 'ja-JP':
      return (
        title: '画像の元データを復元',
        subtitle:
            'NovelAI、Stable Diffusion WebUI / Forge、ComfyUI の埋め込み生成情報を読み取ります。',
        choose: '元画像を選択',
        replace: '画像を変更',
        dropHint: 'PNG、JPG、JPEG、WebP に対応。可能な限り未圧縮の元画像を選択してください。',
        localOnly: 'Anlas 0 · AI 不使用 · ネットワーク送信なし',
        detected: '検出元',
        sourceNovelAi: 'NovelAI',
        sourceSd: 'Stable Diffusion WebUI / Forge',
        sourceComfy: 'ComfyUI',
        sourceUnknown: '不明または認識可能な設定なし',
        compatible: '再利用できる設定',
        compatibleHint: 'NovelAI と互換性のある項目だけを適用します。SD のモデル、VAE、LoRA は閲覧のみです。',
        apply: '生成画面で使用',
        applied: '互換設定を適用しました',
        noCompatible: 'NovelAI に直接適用できる互換設定がありません',
        details: '設定一覧',
        noParams: '生成設定を読み取れません。圧縮されたか、メタデータなしで保存された可能性があります。',
        raw: '完全な元データ',
        copyRaw: '元データをコピー',
        copied: '元データをコピーしました',
        viewOnly: '一部の SD / ComfyUI 専用値は閲覧のみで、NovelAI へ直接適用できません。',
        readFailed: '画像を読み取れません。ファイルが壊れていないか確認し、元画像を選び直してください。',
      );
    case 'ko-KR':
      return (
        title: '이미지 원본 데이터 복원',
        subtitle:
            'NovelAI, Stable Diffusion WebUI / Forge, ComfyUI 이미지의 내장 생성 정보를 읽습니다.',
        choose: '원본 이미지 선택',
        replace: '이미지 변경',
        dropHint: 'PNG, JPG, JPEG, WebP 지원. 가능하면 압축되지 않은 원본을 선택하세요.',
        localOnly: 'Anlas 0 · AI 호출 없음 · 네트워크 전송 없음',
        detected: '감지된 출처',
        sourceNovelAi: 'NovelAI',
        sourceSd: 'Stable Diffusion WebUI / Forge',
        sourceComfy: 'ComfyUI',
        sourceUnknown: '알 수 없거나 인식 가능한 매개변수 없음',
        compatible: '바로 사용할 수 있는 매개변수',
        compatibleHint: 'NovelAI와 호환되는 값만 적용합니다. SD 모델, VAE, LoRA 값은 보기 전용입니다.',
        apply: '생성 화면에서 사용',
        applied: '호환 매개변수를 적용했습니다',
        noCompatible: 'NovelAI에 바로 적용할 수 있는 호환 매개변수가 없습니다',
        details: '매개변수 상세',
        noParams: '생성 매개변수를 찾지 못했습니다. 이미지가 압축되었거나 메타데이터 없이 저장되었을 수 있습니다.',
        raw: '전체 원본 데이터',
        copyRaw: '원본 데이터 복사',
        copied: '원본 데이터를 복사했습니다',
        viewOnly: '일부 SD / ComfyUI 전용 값은 보기 전용이며 NovelAI에 바로 적용할 수 없습니다.',
        readFailed: '이미지를 읽을 수 없습니다. 파일이 손상되지 않았는지 확인하고 원본을 다시 선택하세요.',
      );
    default:
      return (
        title: '恢复图片原数据',
        subtitle: '读取 NovelAI、Stable Diffusion WebUI / Forge 与 ComfyUI 图片内嵌参数。',
        choose: '选择原始图片',
        replace: '更换图片',
        dropHint: '支持 PNG、JPG、JPEG、WebP。请尽量选择未经聊天软件压缩的原图。',
        localOnly: '零积分 · 不调用 AI · 不发送网络请求',
        detected: '识别来源',
        sourceNovelAi: 'NovelAI',
        sourceSd: 'Stable Diffusion WebUI / Forge',
        sourceComfy: 'ComfyUI',
        sourceUnknown: '未知或无可识别参数',
        compatible: '可一键使用的参数',
        compatibleHint: '只套用 NovelAI 支持的兼容项；SD 模型、VAE、LoRA 保留供查看。',
        apply: '一键使用到生成',
        applied: '已套用兼容参数',
        noCompatible: '没有可直接套用到 NovelAI 的兼容参数',
        details: '逐项参数',
        noParams: '没有读取到生成参数。图片可能被平台压缩或导出时关闭了元数据。',
        raw: '完整原始数据',
        copyRaw: '复制原始数据',
        copied: '原始数据已复制',
        viewOnly: '部分 SD / ComfyUI 专用值只能查看，无法直接套用到 NovelAI。',
        readFailed: '无法读取该图片，请确认文件未损坏并重新选择原图。',
      );
  }
}

class MetadataInspectorScreen extends StatefulWidget {
  final VoidCallback onBack;
  final VoidCallback onOpenGenerate;

  const MetadataInspectorScreen({
    super.key,
    required this.onBack,
    required this.onOpenGenerate,
  });

  @override
  State<MetadataInspectorScreen> createState() =>
      _MetadataInspectorScreenState();
}

class _MetadataInspectorScreenState extends State<MetadataInspectorScreen> {
  final _picker = ImagePicker();
  ImageMetadataReport? _report;
  String? _filePath;
  String _fileName = '';
  bool _reading = false;

  Future<void> _pick() async {
    final text = _metadataTextFor(context.read<AppState>().settings.language);
    setState(() => _reading = true);
    try {
      final picked = await _picker.pickImage(source: ImageSource.gallery);
      if (picked == null || !mounted) return;
      final bytes = await picked.readAsBytes();
      final report = inspectImageMetadata(parseImageTextMetadata(bytes));
      if (!mounted) return;
      setState(() {
        _report = report;
        _filePath = picked.path;
        _fileName = picked.name;
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(text.readFailed)));
      }
    } finally {
      if (mounted) setState(() => _reading = false);
    }
  }

  String _source(_MetadataText text, ImageMetadataKind kind) => switch (kind) {
        ImageMetadataKind.novelAi => text.sourceNovelAi,
        ImageMetadataKind.stableDiffusion => text.sourceSd,
        ImageMetadataKind.comfyUi => text.sourceComfy,
        ImageMetadataKind.unknown => text.sourceUnknown,
      };

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = _metadataTextFor(state.settings.language);
    final report = _report;
    final compatible = report?.imported.compatibleValues ?? const {};
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: MaterialLocalizations.of(context).backButtonTooltip,
          onPressed: widget.onBack,
          icon: const Icon(Icons.arrow_back),
        ),
        title: Text(text.title),
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 980),
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.all(16),
            children: [
              Text(text.subtitle, style: Theme.of(context).textTheme.bodyLarge),
              const SizedBox(height: 12),
              Card(
                clipBehavior: Clip.antiAlias,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: LayoutBuilder(builder: (context, constraints) {
                    final compact = constraints.maxWidth < 620;
                    final preview =
                        _filePath != null && File(_filePath!).existsSync()
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(14),
                                child: Image.file(
                                  File(_filePath!),
                                  width: compact ? double.infinity : 150,
                                  height: 150,
                                  fit: BoxFit.contain,
                                ),
                              )
                            : Container(
                                width: compact ? double.infinity : 150,
                                height: 150,
                                decoration: BoxDecoration(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: const Icon(Icons.image_search, size: 44),
                              );
                    final copy = Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _fileName.isEmpty ? text.choose : _fileName,
                          style: Theme.of(context).textTheme.titleMedium,
                          overflow: TextOverflow.ellipsis,
                          maxLines: 2,
                        ),
                        const SizedBox(height: 6),
                        Text(text.dropHint),
                        const SizedBox(height: 6),
                        Text(
                          text.localOnly,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.primary),
                        ),
                        const SizedBox(height: 12),
                        FilledButton.tonalIcon(
                          onPressed: _reading ? null : _pick,
                          icon: _reading
                              ? const SizedBox.square(
                                  dimension: 18,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.folder_open),
                          label:
                              Text(report == null ? text.choose : text.replace),
                        ),
                      ],
                    );
                    return compact
                        ? Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              preview,
                              const SizedBox(height: 14),
                              copy
                            ],
                          )
                        : Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              preview,
                              const SizedBox(width: 18),
                              Expanded(child: copy),
                            ],
                          );
                  }),
                ),
              ),
              if (report != null) ...[
                const SizedBox(height: 12),
                _SummaryCard(
                  title: text.detected,
                  value: _source(text, report.kind),
                  subtitle: report.software,
                ),
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(text.compatible,
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 4),
                        Text(text.compatibleHint),
                        const SizedBox(height: 12),
                        if (compatible.isEmpty)
                          Text(text.noCompatible)
                        else
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: compatible.entries
                                .map((entry) => Chip(
                                    label:
                                        Text('${entry.key}: ${entry.value}')))
                                .toList(),
                          ),
                        const SizedBox(height: 14),
                        FilledButton.icon(
                          onPressed: compatible.isEmpty
                              ? null
                              : () {
                                  state.applyImportedMetadata(report.imported);
                                  ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text(text.applied)));
                                  widget.onOpenGenerate();
                                },
                          icon: const Icon(Icons.play_arrow),
                          label: Text(text.apply),
                        ),
                      ],
                    ),
                  ),
                ),
                if (report.kind == ImageMetadataKind.stableDiffusion ||
                    report.kind == ImageMetadataKind.comfyUi) ...[
                  const SizedBox(height: 12),
                  Card(
                    color: Theme.of(context).colorScheme.secondaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.info_outline),
                          const SizedBox(width: 10),
                          Expanded(child: Text(text.viewOnly)),
                        ],
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(text.details,
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 10),
                        if (report.entries.isEmpty)
                          Text(text.noParams)
                        else
                          ...report.entries.map((entry) => _ParameterTile(
                                entry: entry,
                              )),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Card(
                  child: ExpansionTile(
                    title: Text(text.raw),
                    childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Align(
                        alignment: Alignment.centerRight,
                        child: OutlinedButton.icon(
                          onPressed: report.rawText.isEmpty
                              ? null
                              : () async {
                                  await Clipboard.setData(
                                      ClipboardData(text: report.rawText));
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text(text.copied)));
                                },
                          icon: const Icon(Icons.copy),
                          label: Text(text.copyRaw),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        constraints: const BoxConstraints(maxHeight: 420),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Theme.of(context)
                              .colorScheme
                              .surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: SingleChildScrollView(
                          child: SelectableText(
                            report.rawText.isEmpty
                                ? text.noParams
                                : report.rawText,
                            style: const TextStyle(
                                fontFamily: 'monospace', fontSize: 12),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String title;
  final String value;
  final String subtitle;

  const _SummaryCard({
    required this.title,
    required this.value,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          leading: const Icon(Icons.data_object),
          title: Text(value),
          subtitle: Text(subtitle.isEmpty ? title : '$title · $subtitle'),
        ),
      );
}

class _ParameterTile extends StatelessWidget {
  final ImageMetadataEntry entry;

  const _ParameterTile({required this.entry});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: DecoratedBox(
          decoration: BoxDecoration(
            border:
                Border.all(color: Theme.of(context).colorScheme.outlineVariant),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(entry.key,
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                    Text(entry.group,
                        style: Theme.of(context).textTheme.labelSmall),
                  ],
                ),
                const SizedBox(height: 6),
                SelectableText(entry.value),
              ],
            ),
          ),
        ),
      );
}

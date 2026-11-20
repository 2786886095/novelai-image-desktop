import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n/app_locales.dart';
import '../screens/metadata_inspector_screen.dart' show metadataParameterLabel;
import '../state/app_state.dart';

const _labels = {
  'zh-CN': [
    '这张图片用来做什么？',
    '图生图',
    '风格迁移',
    '精确参考',
    '仅导入参数',
    '应用参数',
    '确认后记住勾选项，下次使用新图片里的值。',
    '没有可导入的参数',
    '应用',
    '全选',
    '清空',
    '角色',
    '当前模型或服务不支持，或参考图数量已达上限。'
  ],
  'zh-TW': [
    '這張圖片要用來做什麼？',
    '圖生圖',
    '風格遷移',
    '精確參考',
    '僅匯入參數',
    '套用參數',
    '確認後記住勾選項目，下次使用新圖片裡的值。',
    '沒有可匯入的參數',
    '套用',
    '全選',
    '清除',
    '角色',
    '目前模型或服務不支援，或參考圖數量已達上限。'
  ],
  'en-US': [
    'How would you like to use this image?',
    'Image to image',
    'Vibe transfer',
    'Precise reference',
    'Parameters only',
    'Apply parameters',
    'Confirmed selections are remembered. Values come from each new image.',
    'No importable parameters',
    'Apply',
    'Select all',
    'Clear',
    'Characters',
    'Unavailable for this model or provider, or the reference limit has been reached.'
  ],
  'ja-JP': [
    'この画像をどう使いますか？',
    '画像から生成',
    '雰囲気転送',
    '精密参照',
    'パラメーターのみ',
    '適用する項目',
    '確定した項目を記憶します。値は新しい画像から取得します。',
    '読み込める項目はありません',
    '適用',
    'すべて選択',
    '解除',
    'キャラクター',
    'このモデル・サービスでは非対応か、参照画像数の上限に達しています。'
  ],
  'ko-KR': [
    '이 이미지를 어떻게 사용할까요?',
    '이미지로 생성',
    '분위기 전이',
    '정밀 참조',
    '매개변수만',
    '적용할 항목',
    '확정한 항목을 기억합니다. 값은 새 이미지에서 가져옵니다.',
    '가져올 항목이 없습니다',
    '적용',
    '전체 선택',
    '해제',
    '캐릭터',
    '모델 또는 서비스에서 지원하지 않거나 참조 이미지 한도에 도달했습니다.'
  ],
};

Future<void> chooseImageImport(BuildContext context, String path) async {
  final app = context.read<AppState>();
  try {
    final image = await app.previewImageImport(path);
    if (!context.mounted || ModalRoute.of(context)?.isCurrent == false) return;
    final result = await showModalBottomSheet<(ImageImportUse, Set<String>)>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ImageImportSheet(app: app, image: image),
    );
    if (result != null && context.mounted) {
      await app.confirmImageImport(image, result.$1, result.$2);
    }
  } catch (error) {
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('$error')));
    }
  }
}

class ImageImportSheet extends StatefulWidget {
  final AppState app;
  final PendingImageImport image;
  const ImageImportSheet({super.key, required this.app, required this.image});
  @override
  State<ImageImportSheet> createState() => _ImageImportSheetState();
}

class _ImageImportSheetState extends State<ImageImportSheet> {
  late final fields = widget.image.fields;
  late final selected =
      widget.image.remembered.intersection(fields.keys.toSet());
  ImageImportUse? use;

  @override
  Widget build(BuildContext context) {
    final app = widget.app, image = widget.image;
    final lang = app.settings.language;
    final t = _labels[normalizeAppLocaleCode(lang)] ?? _labels['en-US']!;
    final english = Map.fromIterables(
        image.metadata.imported.compatibleValuesByKey.keys,
        image.metadata.imported.compatibleValues.keys);
    bool allowed(ImageImportUse role) =>
        app.canUseImportedImage(image, role, selected);
    return SafeArea(
        top: false,
        child: FractionallySizedBox(
            heightFactor: .90,
            child: Column(children: [
              ListTile(
                  title:
                      Text(t[0], style: Theme.of(context).textTheme.titleLarge),
                  trailing:
                      CloseButton(onPressed: () => Navigator.pop(context))),
              Expanded(
                  child: ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      children: [
                    SizedBox(
                        height: 160,
                        child: Image.memory(image.bytes,
                            fit: BoxFit.contain,
                            cacheHeight: 480,
                            errorBuilder: (_, __, ___) => const Icon(
                                Icons.image_not_supported_outlined))),
                    const SizedBox(height: 12),
                    Wrap(spacing: 8, runSpacing: 4, children: [
                      for (final item in ImageImportUse.values)
                        if (item != ImageImportUse.parameters ||
                            fields.isNotEmpty)
                          ChoiceChip(
                              key: ValueKey('import-use-${item.name}'),
                              label: Text(t[item.index + 1]),
                              selected: item == use && allowed(item),
                              onSelected: allowed(item)
                                  ? (_) => setState(() => use = item)
                                  : null)
                    ]),
                    if (!allowed(ImageImportUse.vibe) ||
                        !allowed(ImageImportUse.precise))
                      Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(t[12],
                              style: Theme.of(context).textTheme.bodySmall)),
                    const Divider(),
                    if (fields.isEmpty)
                      Text(t[7])
                    else ...[
                      Text(t[5],
                          style: Theme.of(context).textTheme.titleMedium),
                      Text(t[6]),
                      Wrap(children: [
                        TextButton(
                            key: const ValueKey('import-select-all'),
                            onPressed: () =>
                                setState(() => selected.addAll(fields.keys)),
                            child: Text(t[9])),
                        TextButton(
                            onPressed: () => setState(selected.clear),
                            child: Text(t[10])),
                      ]),
                      for (final field in fields.entries)
                        CheckboxListTile(
                            key: ValueKey('import-field-${field.key}'),
                            contentPadding: EdgeInsets.zero,
                            controlAffinity: ListTileControlAffinity.leading,
                            title: Text(field.key == 'characters'
                                ? t[11]
                                : metadataParameterLabel(
                                    lang, english[field.key] ?? field.key)),
                            subtitle: Text('${field.value}',
                                maxLines: 2, overflow: TextOverflow.ellipsis),
                            value: selected.contains(field.key),
                            onChanged: (v) => setState(() {
                                  if (v == true) {
                                    selected.add(field.key);
                                  } else {
                                    selected.remove(field.key);
                                  }
                                })),
                    ],
                  ])),
              Padding(
                  padding: const EdgeInsets.all(12),
                  child: SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                          key: const ValueKey('confirm-image-import'),
                          onPressed: use != null && allowed(use!)
                              ? () =>
                                  Navigator.pop(context, (use!, {...selected}))
                              : null,
                          child: Text(t[8]))))
            ])));
  }
}

import 'dart:convert';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../models/nai_models.dart';
import '../artist/favorite_style_labels.dart';
import '../state/app_state.dart';
import '../ui/studio_dropdown.dart';
import '../i18n/style_library_text.dart';

const _copy = {
  'zh-CN': [
    '批量填充角色',
    '粘贴角色 JSON / TXT。按顺序更新，未列出的角色和字段保留。',
    '复制给 AI 的指令',
    '读取当前角色',
    '预览',
    '填充',
    '数据无效，或角色数量超出当前模型上限。',
    '角色或模型已改变，请重新打开。',
    '批量移动分组',
    '目标分组',
    '选择要移动的画风',
    '已复制',
    '批量挂示例图',
    '分组预设与格式',
    '仅复制新建指令',
    '规范化为 JSON',
    '组合名称',
    '保存预览为组合',
    '已保存',
    '保存失败',
    '复制 AI 修改指令',
    '同时移除预览中未列出的末尾角色',
    '生成或修改要求（可选）'
  ],
  'zh-TW': [
    '批次填入角色',
    '貼上角色 JSON / TXT。依序更新，未列出的角色與欄位保留。',
    '複製 AI 指令',
    '讀取目前角色',
    '預覽',
    '填入',
    '格式錯誤或超過角色上限。',
    '角色或模型已改變，請重新開啟。',
    '批次移動群組',
    '目標群組',
    '選擇要移動的畫風',
    '已複製',
    '批次附加範例圖',
    '群組預設與格式',
    '僅複製新建指令',
    '規範化為 JSON',
    '組合名稱',
    '將預覽另存為組合',
    '已儲存',
    '儲存失敗',
    '複製 AI 修改指令',
    '同時移除預覽中未列出的末尾角色',
    '生成或修改要求（選填）'
  ],
  'en-US': [
    'Bulk fill characters',
    'Paste character JSON / TXT. Unlisted slots and fields are kept.',
    'Copy AI instructions',
    'Read current characters',
    'Preview',
    'Apply',
    'Invalid format or too many characters.',
    'Characters or model changed; please reopen.',
    'Move styles in bulk',
    'Destination group',
    'Select styles to move',
    'Copied',
    'Attach example images',
    'Group presets and format',
    'Copy new-character instructions',
    'Format as JSON',
    'Group name',
    'Save preview as group',
    'Saved',
    'Save failed',
    'Copy AI edit instructions',
    'Also remove trailing characters not in this preview',
    'Creation or revision instructions (optional)'
  ],
  'ja-JP': [
    'キャラクターを一括入力',
    'キャラクター JSON / TXT を貼り付けます。指定のない枠と項目は変更しません。',
    'AI 指示をコピー',
    '現在のキャラクターを読込',
    'プレビュー',
    '適用',
    '形式または人数が無効です。',
    'モデルまたはキャラクターが変更されました。開き直してください。',
    'スタイルを一括移動',
    '移動先',
    '移動するスタイルを選択',
    'コピーしました',
    '見本画像を一括追加',
    'グループと書式',
    '新規作成指示をコピー',
    'JSON に整形',
    'グループ名',
    'プレビューを保存',
    '保存しました',
    '保存できませんでした',
    'AI 修正指示をコピー',
    'プレビューにない末尾のキャラクターも削除',
    '生成または修正の要望（任意）'
  ],
  'ko-KR': [
    '캐릭터 일괄 입력',
    '캐릭터 JSON / TXT을 붙여넣으세요. 지정하지 않은 슬롯과 필드는 유지됩니다.',
    'AI 지시문 복사',
    '현재 캐릭터 읽기',
    '미리보기',
    '적용',
    '형식 또는 캐릭터 수가 올바르지 않습니다.',
    '모델이나 캐릭터가 변경되었습니다. 다시 열어 주세요.',
    '스타일 일괄 이동',
    '대상 그룹',
    '이동할 스타일 선택',
    '복사됨',
    '예시 이미지 일괄 추가',
    '그룹 프리셋 및 형식',
    '새 캐릭터 지시 복사',
    'JSON으로 정리',
    '그룹 이름',
    '미리보기를 그룹으로 저장',
    '저장됨',
    '저장 실패',
    'AI 수정 지시 복사',
    '미리 보기에 없는 마지막 캐릭터도 삭제',
    '생성 또는 수정 요청 (선택 사항)'
  ]
};
List<String> mobileBulkLabels(String language) =>
    _copy[language] ?? _copy['en-US']!;

List<Map<String, String>> parseMobileRoles(String input, int max) {
  if (input.length > 128000) throw const FormatException();
  var raw = input.trim().replaceAll(RegExp(r'\r\n?'), '\n');
  if (raw.startsWith('\x60\x60\x60') || raw.startsWith('~~~')) {
    final m = RegExp(r'^(\x60{3}|~{3})(?:json|text)?[ \t]*\n([\s\S]*?)\n\1$',
            caseSensitive: false)
        .firstMatch(raw);
    if (m == null) throw const FormatException();
    raw = m[2]!.trim();
  }
  if (raw.isEmpty) throw const FormatException();
  final hdr = RegExp(
      r'^\s*(?:【|\[)?(?:角色|人物|character|chara|キャラクター|캐릭터)\s*([0-9一二三四五六七八九十]+)\s*(?:】|\])?\s*[:：]?\s*(.*)$',
      caseSensitive: false);
  final neg = RegExp(
      r'^\s*(?:【|\[)?(?:负面|負面|负向|反向|negative)\s*([0-9一二三四五六七八九十]*)\s*(?:】|\])?\s*[:：]\s*(.*)$',
      caseSensitive: false);
  final pos = RegExp(r'^\s*(?:正向|正面|positive)\s*[:：]\s*', caseSensitive: false);
  final lines = raw.split('\n');
  if (!raw.startsWith('{') &&
      (!raw.startsWith('[') || hdr.hasMatch(lines.first))) {
    if (!lines.any(hdr.hasMatch)) {
      if (lines.any(neg.hasMatch)) throw const FormatException();
      final blocks = raw.split(RegExp(r'\n[ \t]*\n+'));
      if (blocks.length > max) throw const FormatException();
      return blocks
          .map((v) => {'prompt': v.trim().replaceFirst(pos, '')})
          .toList();
    }
    int num(String v) {
      final n = int.tryParse(v);
      if (n != null) return n;
      const digits = '零一二三四五六七八九';
      if (v.length == 1 && digits.contains(v)) return digits.indexOf(v);
      final m = RegExp(r'^([一二三四五六七八九]?)十([一二三四五六七八九]?)$').firstMatch(v);
      if (m == null) throw const FormatException();
      return (m[1]!.isEmpty ? 1 : digits.indexOf(m[1]!)) * 10 +
          (m[2]!.isEmpty ? 0 : digits.indexOf(m[2]!));
    }

    final groups = <int, Map<String, String>>{};
    var index = 0, field = 'prompt';
    for (final line in lines) {
      final h = hdr.firstMatch(line), n = neg.firstMatch(line);
      if (h != null) {
        index = num(h[1]!);
        if (index < 1 || index > max || groups.containsKey(index))
          throw const FormatException();
        field = 'prompt';
        groups[index] = {field: h[2]!.replaceFirst(pos, '')};
      } else if (n != null) {
        if (n[1]!.isNotEmpty) index = num(n[1]!);
        final row = groups[index];
        field = 'negativePrompt';
        if (row == null || row.containsKey(field))
          throw const FormatException();
        row[field] = n[2]!;
      } else if (line.trim().isNotEmpty) {
        final row = groups[index];
        if (row == null) throw const FormatException();
        row[field] = [
          if ((row[field] ?? '').isNotEmpty) row[field]!,
          field == 'prompt' ? line.replaceFirst(pos, '') : line
        ].join('\n');
      }
    }
    return List.generate(
        groups.length, (i) => groups[i + 1] ?? (throw const FormatException()));
  }
  final value = jsonDecode(raw);
  final rows = value is Map ? value['characters'] : value;
  if (rows is! List || rows.isEmpty || rows.length > max)
    throw const FormatException();
  return rows.map((r) {
    if (r is! Map ||
        r['prompt'] is! String ||
        r.keys.any(
            (k) => !const {'name', 'prompt', 'negativePrompt'}.contains(k)) ||
        r.values.any((v) => v is! String) ||
        (r['name'] as String? ?? '').length > 64) throw const FormatException();
    return Map<String, String>.from(r);
  }).toList();
}

String roleSnapshot(AppState app) => jsonEncode([
      app.params.model,
      app.extras.charCaptions.map((r) => r.toJson()).toList()
    ]);
bool fillMobileRoles(
    AppState app, String snapshot, List<Map<String, String>> rows,
    {bool removeTrailing = false}) {
  if (roleSnapshot(app) != snapshot ||
      rows.isEmpty ||
      rows.length > app.params.maxCharacterPrompts) return false;
  final chars = app.extras.charCaptions;
  final coords = chars.any((c) => c.useCoords);
  for (var i = 0; i < rows.length; i++) {
    if (i == chars.length) chars.add(CharCaptionItem(useCoords: coords));
    final c = chars[i], r = rows[i];
    c.prompt = r['prompt']!;
    if (r.containsKey('name')) c.name = r['name']!;
    if (r.containsKey('negativePrompt'))
      c.negativePrompt = r['negativePrompt']!;
  }
  if (removeTrailing && chars.length > rows.length)
    chars.removeRange(rows.length, chars.length);
  app.markCharacterChanged();
  return true;
}

class MobileRoleBulkDialog extends StatefulWidget {
  const MobileRoleBulkDialog({super.key});
  @override
  State<MobileRoleBulkDialog> createState() => _RoleBulkState();
}

class _RoleBulkState extends State<MobileRoleBulkDialog> {
  final field = TextEditingController();
  final presetName = TextEditingController();
  final instructions = TextEditingController();
  List<Map<String, String>>? confirmedRows;
  bool saving = false;
  late final String snapshot = roleSnapshot(context.read<AppState>());
  List<Map<String, String>>? rows;
  String? error;
  @override
  void dispose() {
    instructions.dispose();
    presetName.dispose();
    field.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = context.read<AppState>(),
        l = mobileBulkLabels(app.settings.language),
        max = app.params.maxCharacterPrompts;
    final base = snapshot;
    final current = {
      'characters': app.extras.charCaptions
          .map((c) => {
                'name': c.name,
                'prompt': c.prompt,
                'negativePrompt': c.negativePrompt
              })
          .toList()
    };
    return AlertDialog(
        scrollable: true,
        title: Text(l[0]),
        content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l[1]),
              Wrap(children: [
                TextButton(
                    onPressed: () async {
                      final msg = ScaffoldMessenger.of(context);
                      await Clipboard.setData(ClipboardData(
                          text:
                              'Return only JSON: {"characters":[{"name":"A","prompt":"silver hair","negativePrompt":"hat"}]}. Use 1–$max characters in slot order. Preserve quotes and weights. Current characters: ' +
                                  jsonEncode(rows == null
                                      ? current
                                      : {'characters': rows}) +
                                  (instructions.text.trim().isEmpty
                                      ? ''
                                      : '\n' + instructions.text.trim())));
                      if (mounted)
                        msg.showSnackBar(SnackBar(content: Text(l[11])));
                    },
                    child: Text(l[20])),
                TextButton(
                    onPressed: () {
                      field.text =
                          const JsonEncoder.withIndent('  ').convert(current);
                      setState(() {
                        rows = null;
                        error = null;
                      });
                    },
                    child: Text(l[3])),
                TextButton.icon(
                    icon: const Icon(Icons.file_open),
                    label: Text(
                        styleLibraryText(app.settings.language)['import']!),
                    onPressed: () async {
                      try {
                        final result = await FilePicker.platform.pickFiles(
                            type: FileType.custom,
                            allowedExtensions: ['json', 'txt']);
                        if (!mounted || result == null) return;
                        final file = result.files.single;
                        if (file.size > 512000) throw const FormatException();
                        final bytes =
                            file.bytes ?? await File(file.path!).readAsBytes();
                        final value = utf8.decode(bytes);
                        if (value.length > 128000)
                          throw const FormatException();
                        if (mounted)
                          setState(() {
                            field.text = value;
                            rows = null;
                            error = null;
                          });
                      } catch (_) {
                        if (mounted) setState(() => error = l[6]);
                      }
                    })
              ]),
              TextField(
                  controller: field,
                  minLines: 3,
                  maxLines: 6,
                  decoration: InputDecoration(
                      labelText: 'JSON / TXT',
                      errorText: error,
                      errorMaxLines: 3),
                  onChanged: (_) => setState(() {
                        rows = null;
                        error = null;
                      })),
              ExpansionTile(
                  key: const ValueKey('bulk-extra'),
                  tilePadding: EdgeInsets.zero,
                  title: Text(l[13]),
                  children: [
                    TextField(
                        controller: instructions,
                        maxLength: 2000,
                        decoration: InputDecoration(labelText: l[22])),
                    Wrap(children: [
                      TextButton(
                          onPressed: () async {
                            final msg = ScaffoldMessenger.of(context);
                            await Clipboard.setData(ClipboardData(
                                text:
                                    'Return only JSON: {"characters":[{"name":"A","prompt":"silver hair","negativePrompt":"hat"}]}. Use 1–$max characters in slot order. Preserve quotes and weights.' +
                                        (instructions.text.trim().isEmpty
                                            ? ''
                                            : '\n' +
                                                instructions.text.trim())));
                            if (mounted)
                              msg.showSnackBar(SnackBar(content: Text(l[11])));
                          },
                          child: Text(l[14])),
                      TextButton(
                          key: const ValueKey('bulk-format'),
                          onPressed: () {
                            try {
                              final list = parseMobileRoles(field.text, max);
                              setState(() {
                                field.text = const JsonEncoder.withIndent('  ')
                                    .convert({'characters': list});
                                rows = list;
                                error = null;
                              });
                            } on FormatException {
                              setState(() => error = l[6]);
                            }
                          },
                          child: Text(l[15])),
                    ]),
                    for (final preset in app.settings.positivePromptPresets
                        .where((p) => p.captions?.isNotEmpty ?? false))
                      ListTile(
                          dense: true,
                          title: Text(preset.name),
                          onTap: () {
                            final saved = preset.captions!;
                            if (saved.length > max) {
                              setState(() => error = l[6]);
                              return;
                            }
                            final list = [
                              for (final c in saved)
                                {
                                  'name': c.name,
                                  'prompt': c.prompt,
                                  'negativePrompt': c.negativePrompt
                                }
                            ];
                            setState(() {
                              field.text = const JsonEncoder.withIndent('  ')
                                  .convert({'characters': list});
                              rows = list;
                              error = null;
                            });
                          }),
                    TextField(
                        key: const ValueKey('bulk-preset-name'),
                        controller: presetName,
                        maxLength: 120,
                        decoration: InputDecoration(labelText: l[16]),
                        onChanged: (_) => setState(() {})),
                    TextButton(
                        key: const ValueKey('bulk-preset-save'),
                        onPressed: saving ||
                                rows == null ||
                                presetName.text.trim().isEmpty
                            ? null
                            : () async {
                                final list = rows!;
                                final msg = ScaffoldMessenger.of(context);
                                setState(() => saving = true);
                                try {
                                  await app.savePositivePromptPreset(
                                      name: presetName.text.trim(),
                                      prompt: list
                                          .map((r) => r['prompt']!)
                                          .join('\n'),
                                      captions: [
                                        for (final r in list)
                                          CharCaptionItem(
                                              name: r['name'] ?? '',
                                              prompt: r['prompt']!,
                                              negativePrompt:
                                                  r['negativePrompt'] ?? '')
                                      ]);
                                  if (mounted) {
                                    presetName.clear();
                                    msg.showSnackBar(
                                        SnackBar(content: Text(l[18])));
                                  }
                                } catch (_) {
                                  if (mounted) setState(() => error = l[19]);
                                } finally {
                                  if (mounted) setState(() => saving = false);
                                }
                              },
                        child: Text(l[17])),
                  ]),
              if (rows != null && rows!.length < app.extras.charCaptions.length)
                CheckboxListTile(
                    key: const ValueKey('bulk-remove-trailing'),
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                        '${l[21]} (${app.extras.charCaptions.length - rows!.length})'),
                    value: identical(confirmedRows, rows),
                    onChanged: (v) => setState(
                        () => confirmedRows = v == true ? rows : null)),
              if (rows != null)
                for (var i = 0; i < rows!.length; i++)
                  ListTile(
                      dense: true,
                      title: Text(
                          '#' +
                              (i + 1).toString() +
                              ' ' +
                              (rows![i]['name'] ?? '') +
                              ' ' +
                              rows![i]['prompt']!,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis),
                      subtitle: rows![i]['negativePrompt'] == null
                          ? null
                          : Text(rows![i]['negativePrompt']!,
                              maxLines: 2, overflow: TextOverflow.ellipsis))
            ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(MaterialLocalizations.of(context).cancelButtonLabel)),
          if (rows == null)
            FilledButton(
                onPressed: () {
                  try {
                    final parsed = parseMobileRoles(field.text, max);
                    setState(() {
                      rows = parsed;
                      error = null;
                    });
                  } on FormatException {
                    setState(() => error = l[6]);
                  }
                },
                child: Text(l[4]))
          else
            FilledButton(
                onPressed: () {
                  if (!fillMobileRoles(app, base, rows!,
                      removeTrailing: identical(confirmedRows, rows))) {
                    setState(() => error = l[7]);
                    return;
                  }
                  Navigator.pop(context);
                },
                child: Text(l[5]))
        ]);
  }
}

class MoveMobileStylesDialog extends StatefulWidget {
  final bool attach;
  final List<StylePromptPreset> styles;
  final List<String> groups;
  final String language;
  const MoveMobileStylesDialog(
      {super.key,
      this.attach = false,
      required this.styles,
      required this.groups,
      required this.language});
  @override
  State<MoveMobileStylesDialog> createState() => _MoveStylesState();
}

typedef MobileStyleMove = ({Set<String> ids, String group});

class _MoveStylesState extends State<MoveMobileStylesDialog> {
  final ids = <String>{};
  String? group;
  @override
  Widget build(BuildContext context) {
    final l = mobileBulkLabels(widget.language),
        t = styleLibraryText(widget.language);
    return AlertDialog(
        title: Text(widget.attach ? l[12] : l[8]),
        content: SizedBox(
            width: 420,
            height: MediaQuery.sizeOf(context).height * .43,
            child: Column(children: [
              if (!widget.attach) Text(l[9]),
              if (!widget.attach)
                StudioDropdownButton<String>(
                    value: group ?? '',
                    isExpanded: true,
                    items: [
                      DropdownMenuItem(value: '', child: Text('—')),
                      for (final g in widget.groups)
                        DropdownMenuItem(
                            value: g,
                            child: Text(g, overflow: TextOverflow.ellipsis))
                    ],
                    onChanged: (v) => setState(() => group = v)),
              Wrap(
                  alignment: WrapAlignment.center,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(l[10] +
                        ' · ' +
                        ids.length.toString() +
                        '/' +
                        widget.styles.length.toString()),
                    TextButton(
                        key: const ValueKey('batch-toggle-visible'),
                        onPressed: widget.styles.isEmpty
                            ? null
                            : () => setState(() {
                                  if (ids.length == widget.styles.length) {
                                    ids.clear();
                                  } else {
                                    ids.addAll(widget.styles.map((p) => p.id));
                                  }
                                }),
                        child: Text((favoriteStyleLabels[widget.language] ??
                                favoriteStyleLabels['en-US']!)[
                            ids.length == widget.styles.length && ids.isNotEmpty
                                ? 2
                                : 1]))
                  ]),
              Expanded(
                  child: ListView.builder(
                      itemCount: widget.styles.length,
                      itemBuilder: (_, i) {
                        final p = widget.styles[i];
                        return CheckboxListTile(
                            title: Text(p.name),
                            subtitle: Text(p.group),
                            value: ids.contains(p.id),
                            onChanged: (v) => setState(() {
                                  if (v == true) {
                                    ids.add(p.id);
                                  } else {
                                    ids.remove(p.id);
                                  }
                                }));
                      }))
            ])),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(t['cancel']!)),
          FilledButton(
              onPressed: ids.isEmpty || !widget.attach && (group ?? '').isEmpty
                  ? null
                  : () => Navigator.pop(
                      context, (ids: Set.of(ids), group: group ?? '')),
              child: Text(MaterialLocalizations.of(context).okButtonLabel))
        ]);
  }
}

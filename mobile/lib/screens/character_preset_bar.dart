import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../models/nai_models.dart';

const _labels = <String, List<String>>{
  "zh-CN": [
    "角色预设",
    "保存当前角色",
    "应用",
    "重命名",
    "删除",
    "名称",
    "保存",
    "取消",
    "已保存",
    "预设角色数量超过当前模型上限，请先切换模型。"
  ],
  "zh-TW": [
    "角色預設",
    "儲存目前角色",
    "套用",
    "重新命名",
    "刪除",
    "名稱",
    "儲存",
    "取消",
    "已儲存",
    "預設角色數量超過目前模型上限，請先切換模型。"
  ],
  "en-US": [
    "Character presets",
    "Save current characters",
    "Apply",
    "Rename",
    "Delete",
    "Name",
    "Save",
    "Cancel",
    "Saved",
    "Too many characters for this model. Switch models first."
  ],
  "ja-JP": [
    "キャラクタープリセット",
    "現在のキャラクターを保存",
    "適用",
    "名前を変更",
    "削除",
    "名前",
    "保存",
    "キャンセル",
    "保存しました",
    "現在のモデルの人数上限を超えています。モデルを変更してください。"
  ],
  "ko-KR": [
    "캐릭터 프리셋",
    "현재 캐릭터 저장",
    "적용",
    "이름 변경",
    "삭제",
    "이름",
    "저장",
    "취소",
    "저장됨",
    "현재 모델의 캐릭터 수 제한을 초과합니다. 모델을 변경하세요."
  ]
};
List<String> characterPresetLabels(String language) =>
    _labels[language] ?? _labels['en-US']!;
Future<String?> requestPresetName(BuildContext context, String language,
    {String initial = ''}) {
  final t = characterPresetLabels(language);
  var value = initial;
  return showDialog<String>(
      context: context,
      builder: (context) => StatefulBuilder(
          builder: (context, setState) => AlertDialog(
                  title: Text(t[5]),
                  content: TextFormField(
                      initialValue: initial,
                      autofocus: true,
                      maxLength: 120,
                      decoration: InputDecoration(labelText: t[5]),
                      onChanged: (v) => setState(() => value = v)),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: Text(t[7])),
                    FilledButton(
                        onPressed: value.trim().isEmpty
                            ? null
                            : () => Navigator.pop(context, value.trim()),
                        child: Text(t[6]))
                  ])));
}

class CharacterPresetBar extends StatefulWidget {
  const CharacterPresetBar({super.key});
  @override
  State<CharacterPresetBar> createState() => _CharacterPresetBarState();
}

class _CharacterPresetBarState extends State<CharacterPresetBar> {
  String selected = '';
  bool busy = false;
  Future<void> perform(Future<void> Function() action) async {
    setState(() => busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final t = characterPresetLabels(state.settings.language);
    final presets = state.settings.characterPromptPresets;
    final current = presets.where((p) => p['id'] == selected).firstOrNull;
    return ExpansionTile(
        title: Text(t[0]),
        tilePadding: EdgeInsets.zero,
        children: [
          DropdownButtonFormField<String>(
              value: current == null ? '' : selected,
              isExpanded: true,
              decoration: InputDecoration(labelText: t[0]),
              items: [
                const DropdownMenuItem(value: '', child: Text('—')),
                ...presets.map((p) => DropdownMenuItem(
                    value: p['id'] as String,
                    child:
                        Text('${p['name']}', overflow: TextOverflow.ellipsis)))
              ],
              onChanged:
                  busy ? null : (v) => setState(() => selected = v ?? '')),
          Wrap(spacing: 8, children: [
            TextButton(
                onPressed: busy || state.extras.charCaptions.isEmpty
                    ? null
                    : () => perform(() async {
                          final name = await requestPresetName(
                              context, state.settings.language);
                          if (name == null) return;
                          final id =
                              DateTime.now().microsecondsSinceEpoch.toString();
                          final item = <String, dynamic>{
                            'id': id,
                            'name': name,
                            'createdAt': DateTime.now().toIso8601String(),
                            'captions': state.extras.charCaptions
                                .map((c) => c.toJson())
                                .toList()
                          };
                          await state.setSettings((s) =>
                              s.characterPromptPresets = [
                                ...s.characterPromptPresets,
                                item
                              ]);
                          selected = id;
                        }),
                child: Text(t[1])),
            TextButton(
                onPressed: busy || current == null
                    ? null
                    : () => perform(() async {
                          final captions = (current['captions'] as List)
                              .whereType<Map>()
                              .map((c) => CharCaptionItem.fromJson(
                                  Map<String, dynamic>.from(c)))
                              .toList();
                          if (captions.length >
                              state.params.maxCharacterPrompts) {
                            throw Exception(t[9]);
                          }
                          state.extras.charCaptions = captions;
                          state.markCharacterChanged();
                        }),
                child: Text(t[2])),
            TextButton(
                onPressed: busy || current == null
                    ? null
                    : () => perform(() async {
                          final name = await requestPresetName(
                              context, state.settings.language,
                              initial: '${current['name']}');
                          if (name == null) return;
                          await state.setSettings((s) =>
                              s.characterPromptPresets = s
                                  .characterPromptPresets
                                  .map((p) => p['id'] == selected
                                      ? {...p, 'name': name}
                                      : p)
                                  .toList());
                        }),
                child: Text(t[3])),
            TextButton(
                onPressed: busy || current == null
                    ? null
                    : () => perform(() async {
                          final yes = await showDialog<bool>(
                              context: context,
                              builder: (context) => AlertDialog(
                                      title:
                                          Text('${t[4]}: ${current['name']}?'),
                                      actions: [
                                        TextButton(
                                            onPressed: () =>
                                                Navigator.pop(context, false),
                                            child: Text(t[7])),
                                        FilledButton(
                                            onPressed: () =>
                                                Navigator.pop(context, true),
                                            child: Text(t[4]))
                                      ]));
                          if (yes != true) return;
                          await state.setSettings((s) =>
                              s.characterPromptPresets = s
                                  .characterPromptPresets
                                  .where((p) => p['id'] != selected)
                                  .toList());
                          selected = '';
                        }),
                child: Text(t[4])),
          ]),
        ]);
  }
}

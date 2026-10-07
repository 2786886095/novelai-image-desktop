import 'package:flutter/material.dart';

List<String> characterNameEditText(String language) => switch (language) {
  'zh-CN' => ['编辑角色名称', '角色名称', '保存', '取消'],
  'zh-TW' => ['編輯角色名稱', '角色名稱', '儲存', '取消'],
  'ja-JP' => ['キャラクター名を編集', 'キャラクター名', '保存', 'キャンセル'],
  'ko-KR' => ['캐릭터 이름 편집', '캐릭터 이름', '저장', '취소'],
  _ => ['Edit character name', 'Character name', 'Save', 'Cancel'],
};

class CharacterNameControl extends StatelessWidget {
  final String name, fallback, language;
  final String? subtitle;
  final Key? editKey;
  final ValueChanged<String> onSave;
  const CharacterNameControl({super.key, required this.name, required this.fallback, required this.language, required this.onSave, this.subtitle, this.editKey});
  @override
  Widget build(BuildContext context) {
    final text = characterNameEditText(language), display = name.trim().isEmpty ? fallback : name.trim();
    return Row(children: [
      Expanded(child: Tooltip(message: display, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(display, key: const ValueKey('character-name-display'), maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)), if (subtitle != null) ...[const SizedBox(height: 2), Text(subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant))]]))),
      IconButton(key: editKey ?? const ValueKey('character-name-edit'), tooltip: text[0], visualDensity: VisualDensity.compact, constraints: const BoxConstraints(minWidth: 40, minHeight: 40), icon: const Icon(Icons.edit_outlined), onPressed: () async {
        final saved = await showDialog<String>(context: context, builder: (_) => _CharacterNameDialog(name: name, fallback: fallback, text: text));
        if (saved != null && context.mounted) onSave(saved.trim());
      }),
    ]);
  }
}

class _CharacterNameDialog extends StatefulWidget {
  final String name, fallback;
  final List<String> text;
  const _CharacterNameDialog({required this.name, required this.fallback, required this.text});
  @override
  State<_CharacterNameDialog> createState() => _CharacterNameDialogState();
}
class _CharacterNameDialogState extends State<_CharacterNameDialog> {
  late final _controller = TextEditingController(text: widget.name);
  @override
  void dispose() {_controller.dispose(); super.dispose();}
  void _save() => Navigator.pop(context, _controller.text.trim());
  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.text[0]),
    content: SingleChildScrollView(child: TextField(key: const ValueKey('character-name-input'), controller: _controller, autofocus: true, maxLength: 64, textInputAction: TextInputAction.done, decoration: InputDecoration(labelText: widget.text[1], hintText: widget.fallback, border: const OutlineInputBorder()), onSubmitted: (_) => _save())),
    actions: [TextButton(key: const ValueKey('character-name-cancel'), onPressed: () => Navigator.pop(context), child: Text(widget.text[3])), FilledButton(key: const ValueKey('character-name-save'), onPressed: _save, child: Text(widget.text[2]))],
  );
}

import 'dart:async';
import 'package:flutter/material.dart';
import '../models/nai_models.dart';
import 'studio_theme.dart';

List<String> characterEditLabels(String language) =>
    const {
      'zh-CN': ['拖动排序', '同步位置', '保留位置', '角色顺序已更改', '全部角色', '选择要保存的角色'],
      'zh-TW': ['拖曳排序', '同步位置', '保留位置', '角色順序已變更', '全部角色', '選擇要儲存的角色'],
      'en-US': [
        'Drag to reorder',
        'Sync positions',
        'Keep positions',
        'Character order changed',
        'All characters',
        'Characters to save'
      ],
      'ja-JP': [
        'ドラッグして並べ替え',
        '位置を同期',
        '位置を保持',
        '順序を変更しました',
        'すべてのキャラクター',
        '保存するキャラクター'
      ],
      'ko-KR': [
        '드래그하여 정렬',
        '위치 동기화',
        '위치 유지',
        '캐릭터 순서 변경됨',
        '모든 캐릭터',
        '저장할 캐릭터'
      ],
    }[language] ??
    const [
      'Drag to reorder',
      'Sync positions',
      'Keep positions',
      'Character order changed',
      'All characters',
      'Characters to save'
    ];

List<CharCaptionItem> reorderCharacters(
    List<CharCaptionItem> items, int from, int to) {
  if (from < 0 ||
      to < 0 ||
      from >= items.length ||
      to >= items.length ||
      from == to) return items;
  final next = [...items];
  next.insert(to, next.removeAt(from));
  return next;
}

class StudioCollapse extends StatelessWidget {
  const StudioCollapse(
      {super.key,
      required this.open,
      required this.child,
      this.instant = false});
  final bool open;
  final bool instant;
  final Widget child;
  @override
  Widget build(BuildContext context) => ExcludeFocus(
      excluding: !open,
      child: IgnorePointer(
          ignoring: !open,
          child: TweenAnimationBuilder<double>(
              tween: Tween(end: open ? 1 : 0),
              duration: instant || MediaQuery.of(context).disableAnimations
                  ? Duration.zero
                  : (open
                      ? AppMotion.disclosureOpen
                      : AppMotion.disclosureClose),
              curve: AppMotion.easeOut,
              builder: (context, value, child) => ClipRect(
                  child: Align(
                      alignment: Alignment.topCenter,
                      heightFactor: value,
                      child: Offstage(
                          offstage: value == 0,
                          child: Opacity(opacity: value, child: child)))),
              child: child)));
}

/// Compact before recognition, then let Flutter move the whole keyed card and gap.
class CharacterReorderList extends StatefulWidget {
  final int count;
  final Key Function(int) keyFor;
  final void Function(int, int) onReorder;
  final Widget Function(BuildContext, int, bool, Widget) itemBuilder;
  final String dragLabel;
  const CharacterReorderList(
      {super.key,
      required this.count,
      required this.keyFor,
      required this.onReorder,
      required this.itemBuilder,
      required this.dragLabel});
  @override
  State<CharacterReorderList> createState() => _CharacterReorderListState();
}

class _CharacterReorderListState extends State<CharacterReorderList> {
  bool compact = false, active = false;
  double? height;
  final list = GlobalKey();
  Timer? settle;
  @override
  void dispose() { settle?.cancel(); super.dispose(); }
  void reset() {
    settle?.cancel();
    if (mounted) {
      setState(() {
        compact = false;
        active = false;
        height = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) => ConstrainedBox(
      constraints: BoxConstraints(minHeight: height ?? 0),
      child: ReorderableListView.builder(
          key: list,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          buildDefaultDragHandles: false,
          itemCount: widget.count,
          onReorderStart: (_) => setState(() => active = true),
          onReorderEnd: (_) {
            settle?.cancel();
            settle = Timer(const Duration(milliseconds: 300), reset);
          },
          onReorder: (from, to) {
            widget.onReorder(from, to > from ? to - 1 : to);
            reset();
          },
          proxyDecorator: (child, index, animation) => Material(
              elevation: 8,
              borderRadius: BorderRadius.circular(StudioRadii.panel),
              color: Theme.of(context).colorScheme.surface,
              child: child),
          itemBuilder: (context, i) => KeyedSubtree(
              key: widget.keyFor(i),
              child: widget.itemBuilder(
                  context,
                  i,
                  compact,
                  Listener(
                      onPointerDown: (_) {
                        if (widget.count < 2) return;
                        setState(() {
                          height = list.currentContext?.size?.height;
                          compact = true;
                        });
                      },
                      onPointerUp: (_) {
                        if (!active) reset();
                      },
                      onPointerCancel: (_) => reset(),
                      child: ReorderableDelayedDragStartListener(
                          index: i,
                          enabled: widget.count > 1,
                          child: Tooltip(
                              triggerMode: TooltipTriggerMode.manual,
                              message: widget.dragLabel,
                              child: const Padding(
                                  padding: EdgeInsets.all(12),
                                  child: Icon(Icons.menu)))))))));
}

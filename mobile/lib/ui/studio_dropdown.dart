import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'studio_theme.dart';

/// Shared selection route. Keeps Material focus, barrier, keyboard and scrolling
/// behavior while using the same height disclosure as character cards.
class StudioDropdownButton<T> extends StatefulWidget {
  const StudioDropdownButton(
      {super.key,
      required this.items,
      required this.onChanged,
      this.value,
      this.isExpanded = false,
      this.isDense = false,
      this.underline});
  final T? value;
  final List<DropdownMenuItem<T>>? items;
  final ValueChanged<T?>? onChanged;
  final bool isExpanded, isDense;
  final Widget? underline;
  @override
  State<StudioDropdownButton<T>> createState() => _StudioDropdownState<T>();
}

class _StudioDropdownState<T> extends State<StudioDropdownButton<T>> {
  bool open = false;
  final focus = FocusNode();
  @override
  void dispose() {
    focus.dispose();
    super.dispose();
  }

  Future<void> show() async {
    final items = widget.items;
    if (open || widget.onChanged == null || items == null || items.isEmpty) {
      return;
    }
    final box = context.findRenderObject() as RenderBox;
    final navigator = Navigator.of(context);
    final overlay = navigator.overlay!.context.findRenderObject() as RenderBox;
    final anchor = box.localToGlobal(Offset.zero, ancestor: overlay) & box.size;
    final selected = items.indexWhere((e) => e.value == widget.value);
    setState(() => open = true);
    try {
      final index = await navigator.push<int>(_StudioSelectRoute<T>(
          items: List.of(items),
          anchor: anchor,
          selected: selected,
          theme: Theme.of(context),
          reduced: MediaQuery.disableAnimationsOf(context),
          label: MaterialLocalizations.of(context).modalBarrierDismissLabel));
      if (!mounted) return;
      if (index != null && widget.onChanged != null) {
        widget.onChanged!(items[index].value);
      }
    } finally {
      if (mounted) {
        setState(() => open = false);
        focus.requestFocus();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.items ?? <DropdownMenuItem<T>>[];
    final index = items.indexWhere((e) => e.value == widget.value);
    final enabled = widget.onChanged != null && items.isNotEmpty;
    final reduced = MediaQuery.disableAnimationsOf(context);
    final content = index < 0 ? const SizedBox.shrink() : items[index].child;
    return Semantics(
        button: true,
        enabled: enabled,
        expanded: open,
        child: InkWell(
            focusNode: focus,
            onTap: enabled ? show : null,
            borderRadius: BorderRadius.circular(StudioRadii.control),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              ConstrainedBox(
                  constraints:
                      BoxConstraints(minHeight: widget.isDense ? 24 : 48),
                  child: Row(
                      mainAxisSize: widget.isExpanded
                          ? MainAxisSize.max
                          : MainAxisSize.min,
                      children: [
                        if (widget.isExpanded)
                          Expanded(child: content)
                        else
                          content,
                        const SizedBox(width: 8),
                        AnimatedRotation(
                            turns: open ? .5 : 0,
                            duration: reduced
                                ? Duration.zero
                                : (open
                                    ? AppMotion.disclosureOpen
                                    : AppMotion.disclosureClose),
                            curve: AppMotion.easeOut,
                            child: Icon(Icons.arrow_drop_down,
                                color: enabled
                                    ? null
                                    : Theme.of(context).disabledColor))
                      ])),
              if (widget.underline != null) widget.underline!,
            ])));
  }
}

class StudioDropdownButtonFormField<T> extends FormField<T> {
  StudioDropdownButtonFormField(
      {super.key,
      required List<DropdownMenuItem<T>>? items,
      required ValueChanged<T?>? onChanged,
      this.value,
      bool isExpanded = false,
      InputDecoration decoration = const InputDecoration()})
      : super(
            initialValue: value,
            enabled: onChanged != null,
            builder: (field) => InputDecorator(
                decoration: decoration.copyWith(
                    errorText: field.errorText, enabled: onChanged != null),
                isEmpty: field.value == null,
                child: StudioDropdownButton<T>(
                    value: field.value,
                    items: items,
                    isDense: true,
                    isExpanded: isExpanded,
                    onChanged: onChanged == null
                        ? null
                        : (v) {
                            field.didChange(v);
                            onChanged(v);
                          })));
  final T? value;
  @override
  FormFieldState<T> createState() => _StudioDropdownFieldState<T>();
}

class _StudioDropdownFieldState<T> extends FormFieldState<T> {
  @override
  void didUpdateWidget(covariant StudioDropdownButtonFormField<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    final next = widget as StudioDropdownButtonFormField<T>;
    if (oldWidget.value != next.value) setValue(next.value);
  }
}

class _StudioSelectRoute<T> extends PopupRoute<int> {
  _StudioSelectRoute(
      {required this.items,
      required this.anchor,
      required this.selected,
      required this.theme,
      required this.reduced,
      required this.label});
  final List<DropdownMenuItem<T>> items;
  final Rect anchor;
  final int selected;
  final ThemeData theme;
  final bool reduced;
  final String label;
  @override
  Duration get transitionDuration =>
      reduced ? Duration.zero : AppMotion.disclosureOpen;
  @override
  Duration get reverseTransitionDuration =>
      reduced ? Duration.zero : AppMotion.disclosureClose;
  @override
  bool get barrierDismissible => true;
  @override
  Color? get barrierColor => null;
  @override
  String get barrierLabel => label;
  @override
  Widget buildPage(BuildContext context, Animation<double> animation,
      Animation<double> secondaryAnimation) {
    final size = MediaQuery.sizeOf(context);
    final padding = MediaQuery.paddingOf(context);
    final below =
        math.max(0.0, size.height - padding.bottom - anchor.bottom - 12);
    final above = math.max(0.0, anchor.top - padding.top - 12);
    final up = below < math.min(240, items.length * 48) && above > below;
    final available = up ? above : below;
    final width =
        math.min(math.max(anchor.width, 220.0), math.max(0.0, size.width - 24));
    final left = anchor.left
        .clamp(12.0, math.max(12.0, size.width - width - 12))
        .toDouble();
    final curved = animation.drive(CurveTween(curve: _DisclosureCurve(animation, false)));
    final opacity = animation.drive(CurveTween(curve: _DisclosureCurve(animation, true)));
    return Stack(children: [
      Positioned(
          left: left,
          width: width,
          top: up ? null : anchor.bottom + 6,
          bottom: up ? size.height - anchor.top + 6 : null,
          child: Theme(
              data: theme,
              child: FadeTransition(
                  opacity: opacity,
                  child: SizeTransition(
                      sizeFactor: curved,
                      axisAlignment: up ? 1 : -1,
                      child: Material(
                          elevation: 8,
                          color: theme.colorScheme.surface,
                          borderRadius:
                              BorderRadius.circular(StudioRadii.panel),
                          clipBehavior: Clip.antiAlias,
                          child: ConstrainedBox(
                              constraints: BoxConstraints(
                                  maxHeight: math.min(360.0, available)),
                              child: _StudioSelectList<T>(
                                  items: items, selected: selected)))))))
    ]);
  }
}

class _StudioSelectList<T> extends StatefulWidget {
  const _StudioSelectList({required this.items, required this.selected});
  final List<DropdownMenuItem<T>> items;
  final int selected;
  @override
  State<_StudioSelectList<T>> createState() => _StudioSelectListState<T>();
}

class _StudioSelectListState<T> extends State<_StudioSelectList<T>> {
  late final nodes = List.generate(widget.items.length, (_) => FocusNode());
  late int current =
      widget.selected >= 0 && widget.items[widget.selected].enabled
          ? widget.selected
          : widget.items.indexWhere((e) => e.enabled);
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && current >= 0) jump(current);
    });
  }

  void jump(int index) {
    current = index;
    nodes[index].requestFocus();
    final context = nodes[index].context;
    if (context != null) Scrollable.ensureVisible(context, alignment: .5);
  }

  @override
  void dispose() {
    for (final n in nodes) {
      n.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Focus(
      onKeyEvent: (_, event) {
        if (event is! KeyDownEvent) return KeyEventResult.ignored;
        final key = event.logicalKey;
        if (key == LogicalKeyboardKey.escape || key == LogicalKeyboardKey.tab) {
          Navigator.pop(context);
          return KeyEventResult.handled;
        }
        final enabled = [
          for (var i = 0; i < widget.items.length; i++)
            if (widget.items[i].enabled) i
        ];
        if (enabled.isEmpty) return KeyEventResult.ignored;
        final at = enabled.indexOf(current);
        if (key == LogicalKeyboardKey.arrowDown ||
            key == LogicalKeyboardKey.arrowUp) {
          jump(enabled[(at + (key == LogicalKeyboardKey.arrowDown ? 1 : -1)) %
              enabled.length]);
          return KeyEventResult.handled;
        }
        if (key == LogicalKeyboardKey.home || key == LogicalKeyboardKey.end) {
          jump(key == LogicalKeyboardKey.home ? enabled.first : enabled.last);
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      },
      child: SingleChildScrollView(
          child: Column(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(widget.items.length, (i) {
                final item = widget.items[i];
                final selected = widget.selected == i;
                return Semantics(
                    selected: selected,
                    enabled: item.enabled,
                    child: InkWell(
                        focusNode: nodes[i],
                        onFocusChange: (v) {
                          if (v) current = i;
                        },
                        onTap: item.enabled
                            ? () {
                                item.onTap?.call();
                                Navigator.pop(context, i);
                              }
                            : null,
                        child: Container(
                            constraints: const BoxConstraints(minHeight: 48),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10),
                            color: selected
                                ? Theme.of(context).colorScheme.primaryContainer
                                : null,
                            child: Row(children: [
                              Expanded(child: item.child),
                              if (selected)
                                const Padding(
                                    padding: EdgeInsets.only(left: 8),
                                    child: Icon(Icons.check, size: 18))
                            ]))));
              }))));
}

class _DisclosureCurve extends Curve {
 final Animation<double> animation;final bool opacity;
 const _DisclosureCurve(this.animation,this.opacity);
 @override double transformInternal(double t){
  if(animation.status!=AnimationStatus.reverse)return AppMotion.easeOut.transform(t);
  return opacity?const Interval(0,.36).transform(t):Curves.easeInOutCubic.transform(t);
 }
}

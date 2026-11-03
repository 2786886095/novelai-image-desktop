import 'package:flutter/material.dart';

/// A route publishes its controls, not another toolbar. The shell alone owns
/// fixed chrome. Standalone/Navigator-pushed pages keep their normal AppBar.
class WorkbenchChrome {
  final AppBar bar;
  final String? title;
  final Widget? search;
  final VoidCallback? closeSearch;
  const WorkbenchChrome(this.bar, {this.search, this.closeSearch, this.title});
}

class WorkbenchChromeController extends ValueNotifier<WorkbenchChrome?> {
  WorkbenchChromeController() : super(null);
  bool _closed = false;
  void publish(WorkbenchChrome next) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_closed) value = next;
    });
  }
  @override
  void dispose() { _closed = true; super.dispose(); }
}

class CompactWorkbenchScope extends InheritedWidget {
  final WorkbenchChromeController controller;
  const CompactWorkbenchScope({super.key, required this.controller, required super.child});
  static CompactWorkbenchScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<CompactWorkbenchScope>();
  @override
  bool updateShouldNotify(CompactWorkbenchScope oldWidget) => controller != oldWidget.controller;
}

PreferredSizeWidget? workbenchAppBar(BuildContext context, AppBar bar,
    {Widget? search, VoidCallback? closeSearch, String? title}) {
  final scope = CompactWorkbenchScope.maybeOf(context);
  if (scope == null) return bar;
  scope.controller.publish(WorkbenchChrome(bar, search: search, closeSearch: closeSearch, title: title ?? _titleText(bar.title)));
  return null;
}

String? _titleText(Widget? widget) {
  if (widget is Text) return widget.data;
  if (widget is Tooltip) return widget.message ?? _titleText(widget.child);
  if (widget is MediaQuery) return _titleText(widget.child);
  if (widget is DefaultTextStyle) return _titleText(widget.child);
  if (widget is Padding) return _titleText(widget.child);
  if (widget is Column && widget.children.isNotEmpty) return _titleText(widget.children.first);
  return null;
}

/// Relocated toolbar actions must dismiss their containing sheet before a
/// drawer/dialog is opened on the original page. Keep callbacks and disabled
/// states; resolving Builder also preserves the page's explicit scaffold key.
List<Widget> workbenchSheetActions(BuildContext context, List<Widget> actions) {
  VoidCallback? dismissThen(VoidCallback? callback) => callback == null ? null : () {
    Navigator.of(context).pop();
    WidgetsBinding.instance.addPostFrameCallback((_) => callback());
  };
  Widget adapt(Widget action) {
    if (action is Builder) return adapt(action.builder(context));
    if (action is IconButton) {
      return IconButton(key: action.key,
      icon: action.icon, tooltip: action.tooltip, style: action.style,
      onPressed: dismissThen(action.onPressed), iconSize: action.iconSize,
      constraints: action.constraints, padding: action.padding,
      color: action.color, disabledColor: action.disabledColor);
    }
    if (action is TextButton) {
      return TextButton(key: action.key, style: action.style,
        onPressed: dismissThen(action.onPressed), child: action.child!);
    }
    if (action is FilledButton) {
      return FilledButton(key: action.key, style: action.style,
        onPressed: dismissThen(action.onPressed), child: action.child!);
    }
    if (action is OutlinedButton) {
      return OutlinedButton(key: action.key, style: action.style,
        onPressed: dismissThen(action.onPressed), child: action.child!);
    }
    return action;
  }
  return actions.map(adapt).toList();
}

/// Navigator tools have their own route, so they cannot inherit the home
/// shell's scope. Give them the same compact, fixed, safe-area-aware frame.
class CompactToolFrame extends StatefulWidget {
  final Widget child;
  final Widget recommendation;
  const CompactToolFrame({super.key, required this.child, required this.recommendation});
  @override
  State<CompactToolFrame> createState() => _CompactToolFrameState();
}
class _CompactToolFrameState extends State<CompactToolFrame> {
  final _chrome = WorkbenchChromeController();
  @override
  void dispose() { _chrome.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) => Scaffold(resizeToAvoidBottomInset: false,
    body: SafeArea(bottom: false, child: Column(children: [
      ValueListenableBuilder<WorkbenchChrome?>(valueListenable: _chrome,
        builder: (context, chrome, _) => Material(child: SizedBox(
          key: const ValueKey('compact-tool-bar'), height: 56,
          child: Row(children: [
            chrome?.bar.leading ?? BackButton(onPressed: () => Navigator.maybePop(context)),
            Expanded(child: Tooltip(message: chrome?.title ?? '', child: Text(chrome?.title ?? '', maxLines: 1, overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleSmall))),
            widget.recommendation,
            if (chrome?.bar.actions?.isNotEmpty == true) IconButton(
              tooltip: MaterialLocalizations.of(context).moreButtonTooltip,
              onPressed: () => showModalBottomSheet<void>(context: context, showDragHandle: true, useSafeArea: true,
                builder: (sheetContext) => SafeArea(top: false, child: SingleChildScrollView(padding: const EdgeInsets.all(16),
                  child: Wrap(spacing: 8, runSpacing: 8, children: workbenchSheetActions(sheetContext, chrome!.bar.actions!))))),
              icon: const Icon(Icons.more_horiz)),
          ])))),
      Expanded(child: CompactWorkbenchScope(controller: _chrome, child: widget.child)),
    ])));
}

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import '../../ui/android/android_tokens.dart';
import 'android_prompt_text.dart';
import 'prompt_chip_tokenizer.dart';

class PromptToolAction {
  final String label;
  final IconData icon;
  final FutureOr<void> Function()? onPressed;
  const PromptToolAction(
      {required this.label, required this.icon, required this.onPressed});
}

/// Tracks only this editor and the explicitly registered tool routes. Closing an
/// owner must not pop an unrelated page that happened to be pushed above it.
class PromptEditorRouteScope {
  final _tools = <Route<dynamic>>{};
  final _closed = Completer<void>();
  Route<dynamic>? _editor;
  bool _closing = false;
  bool _cleanupScheduled = false;

  bool get isClosed => _closing;

  void registerEditor(Route<dynamic> route) {
    _editor = route;
    if (_closing) _scheduleCleanup();
  }

  void attachEditor(BuildContext context) {
    _editor = ModalRoute.of(context);
    if (_closing) _scheduleCleanup();
  }

  Widget registerTool(BuildContext context, Widget child) {
    final route = ModalRoute.of(context);
    if (route != null) {
      _tools.removeWhere((entry) => !entry.isActive);
      _tools.add(route);
    }
    if (_closing) _scheduleCleanup();
    return child;
  }

  Future<T?> wait<T>(Future<T?> result) => Future.any<T?>([
        result,
        _closed.future.then<T?>((_) => null),
      ]);

  void close() {
    _closing = true;
    if (_editor?.isActive != true && !_tools.any((route) => route.isActive)) {
      _editor = null;
      _tools.clear();
      if (!_closed.isCompleted) _closed.complete();
      return;
    }
    _scheduleCleanup();
  }

  void _scheduleCleanup() {
    if (_cleanupScheduled) return;
    _cleanupScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cleanupScheduled = false;
      for (final route in _tools.toList().reversed) {
        _remove(route);
      }
      _tools.clear();
      final editor = _editor;
      if (editor != null) _remove(editor);
      _editor = null;
      // Older Flutter removeRoute does not complete the route's push Future.
      // Release the owner's await without completing or popping other routes.
      if (!_closed.isCompleted) _closed.complete();
    });
    WidgetsBinding.instance.scheduleFrame();
  }

  void _remove(Route<dynamic> route) {
    final navigator = route.navigator;
    if (navigator == null || !route.isActive) return;
    if (route.isCurrent) {
      navigator.pop();
    } else {
      navigator.removeRoute(route);
    }
  }
}

/// Presentation only. The owning PromptEditor retains its controller, existing
/// tool implementations, stale-result guards and persistence callbacks.
class AndroidPromptEditorPage extends StatefulWidget {
  final TextEditingController controller;
  final String label;
  final String language;
  final String snapshot;
  final ValueChanged<String> onChanged;
  final ValueListenable<int> revision;
  final bool Function() ownerAlive;
  final bool Function(String snapshot) onRevert;
  final List<PromptToolAction> Function() tools;
  final Widget Function()? extraTools;
  final Widget Function()? suggestions;
  final PromptEditorRouteScope? routeScope;
  const AndroidPromptEditorPage(
      {super.key,
      required this.controller,
      required this.label,
      required this.language,
      required this.snapshot,
      required this.onChanged,
      required this.revision,
      required this.ownerAlive,
      required this.onRevert,
      required this.tools,
      this.extraTools,
      this.suggestions,
      this.routeScope});

  @override
  State<AndroidPromptEditorPage> createState() =>
      _AndroidPromptEditorPageState();
}

class _AndroidPromptEditorPageState extends State<AndroidPromptEditorPage> {
  final _focus = FocusNode();
  final _undo = <String>[];
  late String _lastValue;
  bool _undoing = false;
  bool _tags = false;
  int? _selected;
  late final PromptEditorRouteScope _routes;

  String t(String key) => androidPromptText(widget.language, key);

  @override
  void initState() {
    super.initState();
    _routes = widget.routeScope ?? PromptEditorRouteScope();
    _lastValue = widget.controller.text;
    widget.controller.addListener(_changed);
    widget.revision.addListener(_ownerChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _routes.attachEditor(context);
  }

  void _refresh() {
    if (!mounted) return;
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() {});
      });
    } else {
      setState(() {});
    }
  }

  void _changed() {
    if (!mounted || !widget.ownerAlive()) {
      _ownerChanged();
      return;
    }
    final value = widget.controller.text;
    if (value != _lastValue) {
      if (!_undoing && (_undo.isEmpty || _undo.last != _lastValue)) {
        _undo.add(_lastValue);
        if (_undo.length > 100) _undo.removeAt(0);
      }
      _lastValue = value;
      _selected = null;
    }
    _refresh();
  }

  void _ownerChanged() {
    if (!widget.ownerAlive()) {
      _routes.close();
      _refresh();
      return;
    }
    _refresh();
  }

  void _write(String value) {
    if (!mounted || !widget.ownerAlive()) return;
    widget.controller.value = TextEditingValue(
        text: value, selection: TextSelection.collapsed(offset: value.length));
    widget.onChanged(value);
  }

  void _undoOnce() {
    if (_undo.isEmpty || !widget.ownerAlive()) return;
    final value = _undo.removeLast();
    _undoing = true;
    _write(value);
    _undoing = false;
    _refresh();
  }

  Future<bool> _confirm(String title) async =>
      await _routes.wait(showDialog<bool>(
          context: context,
          builder: (dialogContext) => _routes.registerTool(
              dialogContext,
              AlertDialog(title: Text(title), actions: [
                TextButton(
                    onPressed: () => Navigator.pop(dialogContext, false),
                    child: Text(t('cancel'))),
                FilledButton(
                    onPressed: () => Navigator.pop(dialogContext, true),
                    child: Text(t('confirm'))),
              ])))) ==
      true;

  Future<void> _menu(String action) async {
    if (!widget.ownerAlive()) return;
    if (action == 'copy') {
      await Clipboard.setData(ClipboardData(text: widget.controller.text));
    }
    if (action == 'paste') {
      final data = await Clipboard.getData(Clipboard.kTextPlain);
      if (!mounted || !widget.ownerAlive() || data?.text == null) return;
      final value = widget.controller.value;
      final start =
          value.selection.isValid ? value.selection.start : value.text.length;
      final end =
          value.selection.isValid ? value.selection.end : value.text.length;
      _write(value.text.replaceRange(start, end, data!.text!));
    }
    if (action == 'clear' && await _confirm(t('confirmClear'))) _write('');
    if (action == 'discard' && await _confirm(t('confirmDiscard'))) {
      if (!mounted || !widget.ownerAlive()) return;
      if (!widget.onRevert(widget.snapshot)) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(t('stale'))));
      }
    }
  }

  @override
  void dispose() {
    _routes.close();
    widget.controller.removeListener(_changed);
    widget.revision.removeListener(_ownerChanged);
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.ownerAlive()) return const Scaffold(body: SizedBox.shrink());
    final tokens = LangbaiAndroidTokens.of(context);
    final keyboard = MediaQuery.viewInsetsOf(context).bottom > 0;
    final chips = tokenizePromptChips(widget.controller.text);
    final chipItems = chips ?? const <PromptChipToken>[];
    final displayTags = _tags && chips != null;
    final actions = widget.tools();
    final selected =
        displayTags && _selected != null && _selected! < chipItems.length
            ? chipItems[_selected!]
            : null;
    final tools = <Widget>[
      Padding(
        padding: const EdgeInsets.only(right: 6),
        child: OutlinedButton.icon(
          onPressed: () {
            setState(() => _tags = false);
            _focus.requestFocus();
          },
          icon: const Icon(Icons.add, size: 18),
          label: Text(t('add')),
        ),
      ),
      if (keyboard)
        Padding(
          padding: const EdgeInsets.only(right: 6),
          child: OutlinedButton.icon(
            onPressed: () {
              if (!displayTags && chips == null) {
                ScaffoldMessenger.of(context)
                    .showSnackBar(SnackBar(content: Text(t('fallback'))));
                return;
              }
              FocusManager.instance.primaryFocus?.unfocus();
              setState(() {
                _tags = !displayTags;
                _selected = null;
              });
            },
            icon: const Icon(Icons.sell_outlined, size: 18),
            label: Text(t(displayTags ? 'text' : 'tags')),
          ),
        ),
      for (final action in actions)
        Padding(
            padding: const EdgeInsets.only(right: 6),
            child: OutlinedButton.icon(
                onPressed: action.onPressed == null
                    ? null
                    : () async {
                        if (widget.ownerAlive()) await action.onPressed!();
                      },
                icon: Icon(action.icon, size: 18),
                label: Text(action.label))),
      if (widget.extraTools != null) widget.extraTools!(),
    ];
    return Scaffold(
      key: const ValueKey('android-prompt-editor-page'),
      backgroundColor: tokens.canvas,
      resizeToAvoidBottomInset: true,
      // The toolbar row holds only navigation and actions; the full field name
      // sits below it (medium top app bar pattern). At 320dp the four toolbar
      // controls left ~128dp and cut "Positive prompt" to "Posit…".
      appBar: AppBar(
          actions: [
            IconButton(
                tooltip: t('undo'),
                onPressed: _undo.isEmpty ? null : _undoOnce,
                icon: const Icon(Icons.undo)),
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text(t('done'))),
            PopupMenuButton<String>(
                onSelected: _menu,
                itemBuilder: (_) => [
                      for (final name in ['copy', 'paste', 'clear', 'discard'])
                        PopupMenuItem(
                            value: name,
                            child: Builder(
                                builder: (menuContext) => _routes.registerTool(
                                    menuContext, Text(t(name))))),
                    ]),
          ]),
      body: SafeArea(
          top: false,
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(
                padding: EdgeInsets.fromLTRB(16, 0, 16, keyboard ? 4 : 8),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Semantics(
                          header: true,
                          child: Text(widget.label,
                              key: const ValueKey('android-prompt-editor-title'),
                              maxLines: keyboard ? 1 : 2,
                              overflow: TextOverflow.ellipsis,
                              style: (keyboard
                                      ? Theme.of(context).textTheme.titleMedium
                                      : Theme.of(context).textTheme.titleLarge)
                                  ?.copyWith(fontWeight: FontWeight.w700))),
                      if (!keyboard)
                        Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                                '${widget.controller.text.runes.length} ${t('characters')} · ${t('saved')}',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(color: tokens.textSecondary))),
                    ])),
            if (!keyboard)
              Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: SegmentedButton<bool>(
                      segments: [
                        ButtonSegment(
                            value: false,
                            icon: const Icon(Icons.notes),
                            label: Text(t('text'))),
                        ButtonSegment(
                            value: true,
                            icon: const Icon(Icons.sell_outlined),
                            label: Text(t('tags')))
                      ],
                      selected: {
                        displayTags
                      },
                      onSelectionChanged: (values) {
                        if (values.first && chips == null) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(t('fallback'))));
                          return;
                        }
                        if (values.first) {
                          FocusManager.instance.primaryFocus?.unfocus();
                        }
                        setState(() {
                          _tags = values.first;
                          _selected = null;
                        });
                      })),
            const SizedBox(height: 12),
            Expanded(
                child: displayTags
                    ? ListView(padding: const EdgeInsets.all(16), children: [
                        Wrap(spacing: 8, runSpacing: 8, children: [
                          for (var i = 0; i < chipItems.length; i++)
                            if (chipItems[i].text.isNotEmpty)
                              InputChip(
                                  label: ConstrainedBox(
                                      constraints: BoxConstraints(
                                          maxWidth:
                                              MediaQuery.sizeOf(context).width -
                                                  92),
                                      child: Text(chipItems[i].text,
                                          maxLines: 3,
                                          overflow: TextOverflow.ellipsis)),
                                  selected: i == _selected,
                                  onPressed: () {
                                    widget.controller.selection = TextSelection(
                                        baseOffset: chipItems[i].start,
                                        extentOffset: chipItems[i].end);
                                    setState(() => _selected = i);
                                  }),
                        ]),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                            onPressed: () {
                              setState(() => _tags = false);
                              _focus.requestFocus();
                            },
                            icon: const Icon(Icons.add),
                            label: Text(t('add'))),
                      ])
                    : Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: TextField(
                          key: const ValueKey('android-fullscreen-prompt-text'),
                          controller: widget.controller,
                          focusNode: _focus,
                          expands: true,
                          minLines: null,
                          maxLines: null,
                          textAlignVertical: TextAlignVertical.top,
                          keyboardType: TextInputType.multiline,
                          textCapitalization: TextCapitalization.none,
                          scrollPadding: const EdgeInsets.only(bottom: 112),
                          decoration: InputDecoration(
                              hintText: t('empty'),
                              alignLabelWithHint: true,
                              contentPadding: const EdgeInsets.all(16)),
                          onChanged: widget.onChanged,
                        ))),
            if (selected != null)
              Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Wrap(spacing: 8, children: [
                    OutlinedButton.icon(
                        onPressed: () => Clipboard.setData(
                            ClipboardData(text: selected.text)),
                        icon: const Icon(Icons.copy, size: 18),
                        label: Text(t('copyTag'))),
                    OutlinedButton.icon(
                        onPressed: () => _write(
                            deletePromptChip(widget.controller.text, selected)),
                        icon: const Icon(Icons.delete_outline, size: 18),
                        label: Text(t('deleteTag'))),
                  ])),
            if (widget.suggestions != null)
              ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 96),
                  child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: widget.suggestions!())),
            Material(
                color: tokens.dock,
                child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 64),
                    child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        child: Row(children: tools)))),
          ])),
    );
  }
}

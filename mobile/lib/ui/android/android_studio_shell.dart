import 'package:flutter/material.dart';

import '../studio_shell.dart';
import '../compact_workbench.dart';
import 'android_destination_groups.dart';
import 'android_tokens.dart';

/// Five task groups, but the original destination index remains the only route
/// identity. Pages are lazy-mounted once and retained across group switches.
class AndroidStudioShell extends StatefulWidget {
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final List<StudioDestination> destinations;
  final List<Widget> pages;
  final String language;
  final List<int>? destinationOrder;
  final ValueChanged<List<int>>? onDestinationOrderChanged;
  final bool nestedDetailActive;
  final Widget? recommendation;
  final Widget? accountControls;

  const AndroidStudioShell(
      {super.key,
      required this.selectedIndex,
      required this.onDestinationSelected,
      required this.destinations,
      required this.pages,
      required this.language,
      this.destinationOrder,
      this.onDestinationOrderChanged,
      this.nestedDetailActive = false,
      this.recommendation,
      this.accountControls})
      : assert(destinations.length == 15 && pages.length == 15);

  @override
  State<AndroidStudioShell> createState() => _AndroidStudioShellState();
}

class _AndroidStudioShellState extends State<AndroidStudioShell> {
  final _lastVisited = List<int>.of(androidGroupDefaultDestinations);
  static const _icons = [
    Icons.brush_outlined,
    Icons.photo_library_outlined,
    Icons.auto_awesome_outlined,
    Icons.handyman_outlined,
    Icons.person_outline
  ];
  static const _selectedIcons = [
    Icons.brush,
    Icons.photo_library,
    Icons.auto_awesome,
    Icons.handyman,
    Icons.person
  ];

  late final _chrome = List.generate(15, (_) => WorkbenchChromeController());
  bool _searchOpen = false;
  final _memberBarAnchor = GlobalKey(debugLabel: 'member-bar-anchor');
  bool _memberMenuOpen = false;

  @override
  void dispose() { for (final controller in _chrome) { controller.dispose(); } super.dispose(); }

  int get _group => androidGroupForDestination(widget.selectedIndex);

  @override
  void initState() {
    super.initState();
    _lastVisited[_group] = widget.selectedIndex;
  }

  @override
  void didUpdateWidget(covariant AndroidStudioShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    _lastVisited[_group] = widget.selectedIndex;
    if (oldWidget.selectedIndex != widget.selectedIndex) _searchOpen = false;
  }

  void _select(int index) {
    FocusManager.instance.primaryFocus?.unfocus();
    widget.onDestinationSelected(index);
  }

  void _selectGroup(int group) => _select(_lastVisited[group]);

  void _back() {
    final defaultIndex = androidGroupDefaultDestinations[_group];
    _select(widget.selectedIndex != defaultIndex ? defaultIndex : 0);
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final t = LangbaiAndroidTokens.of(context);
    final wide = size.shortestSide >= 600 && size.width >= 1180;
    final side = wide || size.shortestSide >= 600 || size.width > size.height;
    final keyboard = MediaQuery.viewInsetsOf(context).bottom > 0;
    final labels = androidGroupLabelsFor(widget.language);
    final body = Column(children: [
      ValueListenableBuilder<WorkbenchChrome?>(
        valueListenable: _chrome[widget.selectedIndex],
        builder: (context, chrome, _) => _compactBar(context, chrome)),
      Expanded(
          child: StudioLazyIndexedStack(
              index: widget.selectedIndex, children: [
                for (var i = 0; i < widget.pages.length; i++)
                  CompactWorkbenchScope(controller: _chrome[i], child: widget.pages[i]),
              ])),
    ]);
    return PopScope(
      canPop: widget.selectedIndex == 0,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop && !widget.nestedDetailActive) _back();
      },
      child: Scaffold(
        key: const ValueKey('android-studio-shell'),
        // The active page owns its keyboard inset. A second outer resize would
        // subtract it twice from nested generation/chat/settings scaffolds.
        resizeToAvoidBottomInset: false,
        backgroundColor: t.canvas,
        body: SafeArea(
            bottom: false,
            child: side
                ? Row(children: [
                    wide
                        ? _wideNavigation(context, labels)
                        : _rail(context, labels),
                    VerticalDivider(width: 1, color: t.outline),
                    Expanded(child: body),
                  ])
                : body),
        bottomNavigationBar: side || keyboard
            ? null
            : MediaQuery.textScalerOf(context).scale(14) > 18.2
                ? _largeTextNavigation(context, labels)
                : NavigationBar(
                key: const ValueKey('android-main-navigation'),
                height: 64,
                selectedIndex: _group,
                onDestinationSelected: _selectGroup,
                labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
                destinations: [
                  for (var group = 0; group < 5; group++)
                    NavigationDestination(
                        key: ValueKey('android-group-$group'),
                        icon: Icon(_icons[group]),
                        selectedIcon: Icon(_selectedIcons[group]),
                        label: labels[group]),
                ],
              ),
      ),
    );
  }

  Future<void> _showMemberMenu(List<int> members) async {
    if (_memberMenuOpen) return;
    final bar = _memberBarAnchor.currentContext?.findRenderObject() as RenderBox?;
    final overlay = Navigator.of(context).overlay?.context.findRenderObject() as RenderBox?;
    if (bar == null || overlay == null) return;
    FocusManager.instance.primaryFocus?.unfocus();
    final rect = bar.localToGlobal(Offset.zero, ancestor: overlay) & bar.size;
    final media = MediaQuery.of(context);
    final width = (rect.width - 24).clamp(180.0, 280.0);
    final top = rect.bottom + 4;
    final left = rect.center.dx - width / 2;
    final height = (overlay.size.height - top - media.padding.bottom -
        media.viewInsets.bottom - 8).clamp(48.0, 360.0);
    _memberMenuOpen = true;
    try {
      final selected = await showMenu<int>(
        context: context,
        // Center the surface in the workbench and grow down from the toolbar.
        // Never set initialValue: it would align the selected row over the trigger.
        position: RelativeRect.fromLTRB(left, top, overlay.size.width - left - width, overlay.size.height - top),
        constraints: BoxConstraints(minWidth: width, maxWidth: width, maxHeight: height),
        menuPadding: const EdgeInsets.symmetric(vertical: 6),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        clipBehavior: Clip.antiAlias,
        popUpAnimationStyle: media.disableAnimations ? AnimationStyle.noAnimation : null,
        items: [for (final index in members) PopupMenuItem<int>(
          key: ValueKey('android-member-option-$index'), value: index,
          child: Semantics(selected: index == widget.selectedIndex, child: Row(children: [
            Icon(index == widget.selectedIndex ? widget.destinations[index].selectedIcon : widget.destinations[index].icon,
              key: ValueKey('android-member-icon-$index'), size: 20,
              color: index == widget.selectedIndex ? Theme.of(context).colorScheme.primary : null),
            const SizedBox(width: 12),
            Expanded(child: Text(widget.destinations[index].label, maxLines: 2, overflow: TextOverflow.ellipsis)),
            if (index == widget.selectedIndex) ...[
              const SizedBox(width: 8),
              Icon(Icons.check, size: 20, color: Theme.of(context).colorScheme.primary),
            ],
          ])))],
      );
      if (mounted && selected != null) _select(selected);
    } finally {
      _memberMenuOpen = false;
    }
  }

  Widget _compactBar(BuildContext context, WorkbenchChrome? chrome) {
    final members = androidOrderedGroupMembers(_group, widget.destinationOrder);
    final search = _searchOpen ? chrome?.search : null;
    return SizedBox(key: _memberBarAnchor, child: Material(
      key: const ValueKey('compact-workbench-bar'),
      color: LangbaiAndroidTokens.of(context).canvas,
      child: SizedBox(height: 56, child: Row(children: [
        if (search != null)
          IconButton(key: const ValueKey('compact-workbench-close-search'),
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
            onPressed: () { chrome?.closeSearch?.call(); FocusManager.instance.primaryFocus?.unfocus(); setState(() => _searchOpen = false); },
            icon: const Icon(Icons.arrow_back))
        else if (chrome?.bar.leading != null) chrome!.bar.leading!,
        Expanded(child: search ?? Padding(padding: const EdgeInsets.only(left: 12, right: 4),
          child: Tooltip(message: widget.destinations[widget.selectedIndex].label,
            child: InkWell(
              key: const ValueKey('android-member-selector'),
              borderRadius: BorderRadius.circular(12),
              onTap: () => _showMemberMenu(members),
              child: SizedBox(height: 48, child: Row(children: [
                Expanded(child: Text(widget.destinations[widget.selectedIndex].label,
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleSmall)),
                const Icon(Icons.keyboard_arrow_down, size: 20),
              ])),
            )))),
        if (search == null) ...[
          if (widget.recommendation != null) widget.recommendation!,
          IconButton(key: const ValueKey('compact-workbench-search'),
            tooltip: MaterialLocalizations.of(context).searchFieldLabel,
            onPressed: chrome?.search != null
              ? () => setState(() => _searchOpen = true)
              : () => _showAllFeatures(search: true),
            icon: const Icon(Icons.search)),
        ],
        IconButton(key: const ValueKey('android-all-features'),
          tooltip: MaterialLocalizations.of(context).moreButtonTooltip,
          onPressed: () => _showPageActions(chrome), icon: const Icon(Icons.more_horiz)),
      ])),
    ));
  }

  Future<void> _showPageActions(WorkbenchChrome? chrome) => showModalBottomSheet<void>(
    context: context, showDragHandle: true, useSafeArea: true,
    isScrollControlled: true,
    builder: (sheetContext) => ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(sheetContext).height * .8),
      child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          if (chrome?.bar.title != null) DefaultTextStyle(style: Theme.of(context).textTheme.titleMedium!, child: chrome!.bar.title!),
          if (chrome?.bar.actions?.isNotEmpty == true)
            Wrap(spacing: 8, runSpacing: 8, children: workbenchSheetActions(sheetContext, chrome!.bar.actions!)),
          if (widget.accountControls != null) ...[const Divider(), widget.accountControls!],
          ListTile(leading: const Icon(Icons.apps_outlined), title: Text(androidShellText(widget.language, 'all')),
            onTap: () { Navigator.pop(sheetContext); _showAllFeatures(); }),
        ]))));

  Widget _largeTextNavigation(BuildContext context, List<String> labels) {
    final t = LangbaiAndroidTokens.of(context);
    return SafeArea(top: false, child: Material(color: t.dock,
      child: SingleChildScrollView(
        key: const ValueKey('android-large-text-navigation'),
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (var group = 0; group < 5; group++)
            SizedBox(width: (MediaQuery.sizeOf(context).width / 5).clamp(104.0, 160.0),
              child: Semantics(selected: _group == group, button: true,
                child: InkWell(key: ValueKey('android-group-$group'),
                  onTap: () => _selectGroup(group),
                  child: Padding(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(_group == group ? _selectedIcons[group] : _icons[group],
                        color: _group == group ? Theme.of(context).colorScheme.primary : t.textSecondary),
                      const SizedBox(height: 6),
                      Text(labels[group], textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.labelMedium),
                    ]))))),
        ]))));
  }

  /// A scrollable, 64dp rail remains usable on short landscape phones. No
  /// minimum-height NavigationRail can force its five items below the screen.
  Widget _rail(BuildContext context, List<String> labels) {
    final t = LangbaiAndroidTokens.of(context);
    final primary = Theme.of(context).colorScheme.primary;
    return SizedBox(
        width: 88,
        child: Material(
          color: t.card,
          child: SingleChildScrollView(
              child: Column(children: [
            const SizedBox(height: 4),
            for (var group = 0; group < 5; group++)
              Semantics(
                  selected: _group == group,
                  button: true,
                  label: labels[group],
                  child: InkWell(
                    key: ValueKey('android-rail-group-$group'),
                    onTap: () => _selectGroup(group),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 64),
                      child: Padding(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 8),
                          child:
                              Column(mainAxisSize: MainAxisSize.min, children: [
                            Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 16, vertical: 4),
                                decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(20),
                                    color: _group == group
                                        ? Theme.of(context)
                                            .colorScheme
                                            .primaryContainer
                                        : Colors.transparent),
                                child: Icon(
                                    _group == group
                                        ? _selectedIcons[group]
                                        : _icons[group],
                                    color: _group == group
                                        ? primary
                                        : t.textSecondary)),
                            const SizedBox(height: 4),
                            Text(labels[group],
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.labelMedium),
                          ])),
                    ),
                  )),
            const SizedBox(height: 4),
          ])),
        ));
  }

  Widget _wideNavigation(BuildContext context, List<String> labels) {
    final t = LangbaiAndroidTokens.of(context);
    return SizedBox(
        width: 280,
        child: Material(
            color: t.card,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 24),
              children: [
                Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text('Langbai Studio',
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.copyWith(fontWeight: FontWeight.w700))),
                for (var group = 0; group < 5; group++) ...[
                  Padding(
                      padding: const EdgeInsets.fromLTRB(12, 20, 12, 8),
                      child: Text(labels[group],
                          style: Theme.of(context)
                              .textTheme
                              .labelLarge
                              ?.copyWith(color: t.textSecondary))),
                  for (final index in androidOrderedGroupMembers(
                      group, widget.destinationOrder))
                    ListTile(
                        key: ValueKey('android-wide-member-$index'),
                        selected: widget.selectedIndex == index,
                        selectedTileColor:
                            Theme.of(context).colorScheme.primaryContainer,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14)),
                        leading: Icon(widget.selectedIndex == index
                            ? widget.destinations[index].selectedIcon
                            : widget.destinations[index].icon),
                        title: Text(widget.destinations[index].label),
                        onTap: () => _select(index)),
                ],
              ],
            )));
  }

  Future<void> _showAllFeatures({bool search = false}) async {
    var order = StudioAdaptiveShell.normalizeDestinationOrder(
            widget.destinationOrder, widget.destinations.length)
        .toList();
    var editing = false;
    var query = '';
    final labels = androidGroupLabelsFor(widget.language);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: .8,
          maxChildSize: .94,
          minChildSize: .4,
          builder: (context, controller) => Column(children: [
            Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(children: [
                  Expanded(
                      child: Text(
                          androidShellText(
                              widget.language, editing ? 'order' : 'all'),
                          style: Theme.of(context).textTheme.titleLarge)),
                  if (widget.onDestinationOrderChanged != null)
                    IconButton(
                        tooltip: androidShellText(widget.language, 'order'),
                        onPressed: () =>
                            setSheetState(() => editing = !editing),
                        icon: Icon(editing ? Icons.check : Icons.swap_vert)),
                  IconButton(
                      tooltip: androidShellText(widget.language, 'done'),
                      onPressed: () => Navigator.pop(sheetContext),
                      icon: const Icon(Icons.close)),
                ])),
            if (search && !editing) Padding(padding: const EdgeInsets.all(12),
              child: TextField(autofocus: true, key: const ValueKey('workbench-feature-search'),
                decoration: InputDecoration(prefixIcon: const Icon(Icons.search),
                  hintText: MaterialLocalizations.of(context).searchFieldLabel),
                onChanged: (value) => setSheetState(() => query = value.trim().toLowerCase()))),
            if (editing) ...[
              Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                  child: Text(androidShellText(widget.language, 'hint'))),
              TextButton(
                  onPressed: () {
                    final next = StudioAdaptiveShell.normalizeDestinationOrder(
                            null, widget.destinations.length)
                        .toList();
                    setSheetState(() => order = next);
                    widget.onDestinationOrderChanged?.call(next);
                  },
                  child: Text(androidShellText(widget.language, 'reset'))),
            ],
            Expanded(
              child: editing
                  ? ReorderableListView.builder(
                      scrollController: controller,
                      buildDefaultDragHandles: false,
                      itemCount: order.length,
                      onReorder: (oldIndex, newIndex) {
                        final next = List<int>.of(order);
                        if (newIndex > oldIndex) newIndex--;
                        next.insert(newIndex, next.removeAt(oldIndex));
                        setSheetState(() => order = next);
                        widget.onDestinationOrderChanged?.call(next);
                      },
                      itemBuilder: (context, position) {
                        final index = order[position];
                        return ListTile(
                            key: ValueKey('android-order-$index'),
                            leading: Icon(widget.destinations[index].icon),
                            title: Text(widget.destinations[index].label),
                            subtitle:
                                Text(labels[androidGroupForDestination(index)]),
                            trailing: ReorderableDragStartListener(
                                index: position,
                                child: const SizedBox(
                                    width: 48,
                                    height: 48,
                                    child: Icon(Icons.drag_handle))));
                      })
                  : ListView.builder(
                      controller: controller,
                      itemCount: order.where((i) => widget.destinations[i].label.toLowerCase().contains(query)).length,
                      itemBuilder: (context, position) {
                        final index = order.where((i) => widget.destinations[i].label.toLowerCase().contains(query)).elementAt(position);
                        return ListTile(
                            key: ValueKey('android-catalog-$index'),
                            leading: Icon(widget.destinations[index].icon),
                            title: Text(widget.destinations[index].label),
                            subtitle:
                                Text(labels[androidGroupForDestination(index)]),
                            selected: widget.selectedIndex == index,
                            onTap: () {
                              Navigator.pop(sheetContext);
                              _select(index);
                            });
                      }),
            ),
          ]),
        ),
      ),
    );
  }
}

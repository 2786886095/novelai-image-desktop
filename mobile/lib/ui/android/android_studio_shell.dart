import 'package:flutter/material.dart';

import '../studio_shell.dart';
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

  const AndroidStudioShell(
      {super.key,
      required this.selectedIndex,
      required this.onDestinationSelected,
      required this.destinations,
      required this.pages,
      required this.language,
      this.destinationOrder,
      this.onDestinationOrderChanged,
      this.nestedDetailActive = false})
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

  final _memberKeys = <int, GlobalKey>{};

  int get _group => androidGroupForDestination(widget.selectedIndex);

  @override
  void initState() {
    super.initState();
    _lastVisited[_group] = widget.selectedIndex;
    _revealSelectedMember();
  }

  @override
  void didUpdateWidget(covariant AndroidStudioShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    _lastVisited[_group] = widget.selectedIndex;
    if (oldWidget.selectedIndex != widget.selectedIndex) _revealSelectedMember();
  }

  /// Members reached from the catalog, Back or a deep link may sit past the
  /// strip's edge at 320dp; scroll the selected chip into view after layout.
  void _revealSelectedMember() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final chip = _memberKeys[widget.selectedIndex]?.currentContext;
      if (!mounted || chip == null) return;
      Scrollable.ensureVisible(chip,
          alignment: .5,
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic);
    });
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
      _memberBar(context, compact: side && size.shortestSide < 600),
      Expanded(
          child: StudioLazyIndexedStack(
              index: widget.selectedIndex, children: widget.pages)),
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
                height: 72,
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

  Widget _memberBar(BuildContext context, {required bool compact}) {
    final t = LangbaiAndroidTokens.of(context);
    final members = androidOrderedGroupMembers(_group, widget.destinationOrder);
    return Material(
        color: t.canvas,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Row(children: [
            Expanded(
                child: compact
                    ? Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: DropdownButtonHideUnderline(
                            child: DropdownButton<int>(
                          key: const ValueKey('android-member-selector'),
                          value: widget.selectedIndex,
                          isExpanded: true,
                          menuMaxHeight: 360,
                          items: [
                            for (final index in members)
                              DropdownMenuItem(
                                  value: index,
                                  child: Text(widget.destinations[index].label,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis))
                          ],
                          onChanged: (index) {
                            if (index != null) _select(index);
                          },
                        )))
                    : SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 4),
                        child: Row(children: [
                          for (final index in members)
                            Padding(
                                padding:
                                    const EdgeInsetsDirectional.only(end: 8),
                                child: ConstrainedBox(
                                  key: _memberKeys.putIfAbsent(
                                      index, () => GlobalKey()),
                                  constraints:
                                      const BoxConstraints(minHeight: 48),
                                  child: ChoiceChip(
                                      key: ValueKey('android-member-$index'),
                                      showCheckmark: false,
                                      selected: widget.selectedIndex == index,
                                      label: Text(
                                          widget.destinations[index].label),
                                      onSelected: (_) => _select(index)),
                                )),
                        ]))),
            IconButton(
                key: const ValueKey('android-all-features'),
                constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                tooltip: androidShellText(widget.language, 'all'),
                onPressed: _showAllFeatures,
                icon: const Icon(Icons.apps_outlined)),
            const SizedBox(width: 4),
          ]),
        ));
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

  Future<void> _showAllFeatures() async {
    var order = StudioAdaptiveShell.normalizeDestinationOrder(
            widget.destinationOrder, widget.destinations.length)
        .toList();
    var editing = false;
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
                      itemCount: order.length,
                      itemBuilder: (context, position) {
                        final index = order[position];
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

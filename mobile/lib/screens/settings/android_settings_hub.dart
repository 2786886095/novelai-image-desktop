import 'dart:async';
import 'package:flutter/material.dart';
import '../../ui/android/android_tokens.dart';
import '../../ui/global_typography.dart';
import 'settings_search_index.dart';

class AndroidSettingsEntry {
  final String id;
  final String title;
  final Set<AndroidSettingsCategory> categories;
  final Widget child;
  const AndroidSettingsEntry(
      {required this.id,
      required this.title,
      required this.categories,
      required this.child});
}

class AndroidSettingsHub extends StatefulWidget {
  final String language;
  final List<AndroidSettingsEntry> entries;
  final AndroidSettingsCategory? category;
  final ValueChanged<AndroidSettingsCategory?> onCategoryChanged;
  final ValueChanged<bool> onSearchChanged;
  final bool accountConfigured;
  final int? balance;
  final bool providerConfigured;
  final VoidCallback onRefreshAccount;
  final bool reduceMotion;
  final bool active;
  const AndroidSettingsHub(
      {super.key,
      required this.language,
      required this.entries,
      required this.category,
      required this.onCategoryChanged,
      required this.onSearchChanged,
      required this.accountConfigured,
      required this.balance,
      required this.providerConfigured,
      required this.onRefreshAccount,
      this.reduceMotion = false,
      this.active = true});
  @override
  State<AndroidSettingsHub> createState() => _AndroidSettingsHubState();
}

class _AndroidSettingsHubState extends State<AndroidSettingsHub> {
  final _search = TextEditingController();
  final _detailScroll = ScrollController();
  final _visited = <String>{};
  final _anchors = <String, GlobalKey>{};
  String? _highlight;
  Timer? _highlightTimer;
  String get _query => _search.text.trim();
  bool get _hasDetail => widget.category != null || _query.isNotEmpty;
  @override
  void dispose() {
    _highlightTimer?.cancel();
    _search.dispose();
    _detailScroll.dispose();
    super.dispose();
  }

  void _searchChanged(String value) {
    setState(() {});
    widget.onSearchChanged(value.trim().isNotEmpty);
  }

  void _clearSearch() {
    _search.clear();
    setState(() {});
    widget.onSearchChanged(false);
  }

  void _back() {
    if (_query.isNotEmpty) {
      _clearSearch();
      return;
    }
    widget.onCategoryChanged(null);
  }

  void _category(AndroidSettingsCategory value) {
    FocusManager.instance.primaryFocus?.unfocus();
    _clearSearch();
    widget.onCategoryChanged(value);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _detailScroll.hasClients) _detailScroll.jumpTo(0);
    });
  }

  void _open(AndroidSettingsEntry entry) {
    _category(entry.categories.first);
    setState(() {
      _highlight = entry.id;
      _visited.add(entry.id);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final target = _anchors[entry.id]?.currentContext;
      if (target != null) {
        await Scrollable.ensureVisible(target,
            alignment: .05,
            duration: widget.reduceMotion
                ? Duration.zero
                : const Duration(milliseconds: 220));
      }
    });
    _highlightTimer?.cancel();
    _highlightTimer = Timer(const Duration(milliseconds: 1200), () {
      if (mounted) setState(() => _highlight = null);
    });
  }

  IconData _icon(AndroidSettingsCategory value) => switch (value) {
        AndroidSettingsCategory.access => Icons.person_outline,
        AndroidSettingsCategory.ai => Icons.auto_awesome_outlined,
        AndroidSettingsCategory.tags => Icons.label_outline,
        AndroidSettingsCategory.network => Icons.wifi_outlined,
        AndroidSettingsCategory.preferences => Icons.tune_outlined,
        AndroidSettingsCategory.storage => Icons.folder_outlined,
        AndroidSettingsCategory.privacy => Icons.shield_outlined,
        AndroidSettingsCategory.backup => Icons.backup_outlined,
        AndroidSettingsCategory.appearance => Icons.text_fields_outlined,
        AndroidSettingsCategory.navigation => Icons.dashboard_outlined,
        AndroidSettingsCategory.diagnostics => Icons.receipt_long_outlined,
        AndroidSettingsCategory.updates => Icons.info_outline,
      };
  Widget _summary() {
    final language = widget.language, t = LangbaiAndroidTokens.of(context);
    final accountStatus = androidSettingsCopy(
        language, widget.accountConfigured ? 'configured' : 'unconfigured');
    final providerLabel = androidSettingsCopy(language, 'provider');
    final providerStatus = androidSettingsCopy(
        language, widget.providerConfigured ? 'configured' : 'unconfigured');
    return Card(
        child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () => _category(AndroidSettingsCategory.access),
            child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(children: [
                  CircleAvatar(
                      backgroundColor: t.inset,
                      child: const Icon(Icons.person_outline)),
                  const SizedBox(width: 12),
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text('NovelAI · $accountStatus',
                            style: Theme.of(context).textTheme.titleMedium,
                            maxLines: 2),
                        const SizedBox(height: 4),
                        Text('Anlas · ${widget.balance?.toString() ?? '—'}',
                            style: TextStyle(color: t.textSecondary)),
                        Text('$providerLabel · $providerStatus',
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(color: t.textSecondary),
                            maxLines: 2),
                      ])),
                  IconButton(
                      tooltip: MaterialLocalizations.of(context)
                          .refreshIndicatorSemanticLabel,
                      onPressed: widget.onRefreshAccount,
                      icon: const Icon(Icons.refresh)),
                ]))));
  }

  Widget _categories() {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _summary(),
      const SizedBox(height: 12),
      Text(androidSettingsCopy(widget.language, 'summary'),
          style: Theme.of(context).textTheme.bodyMedium),
      const SizedBox(height: 16),
      Card(
          child: Column(children: [
        for (final category in AndroidSettingsCategory.values)
          ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 64),
              child: ListTile(
                  key: ValueKey('android-settings-category-${category.name}'),
                  leading: Icon(_icon(category)),
                  title: Text(
                      androidSettingsCategoryTitle(widget.language, category)),
                  subtitle: Text(
                      widget.entries
                          .where((entry) => entry.categories.contains(category))
                          .map((entry) => entry.title)
                          .take(3)
                          .join(' · '),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis),
                  selected: widget.category == category,
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _category(category))),
      ])),
    ]);
  }

  Widget _results() {
    final matches = widget.entries
        .where((entry) => androidSettingsSearchMatches(
            id: entry.id,
            title: entry.title,
            language: widget.language,
            query: _query))
        .toList();
    if (matches.isEmpty) {
      return Center(
          child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(androidSettingsCopy(widget.language, 'empty'))));
    }
    return ListView(padding: androidPagePadding(context), children: [
      for (final entry in matches)
        Card(
            child: ListTile(
                key: ValueKey('android-settings-search-${entry.id}'),
                title: Text(entry.title),
                subtitle: Text(androidSettingsCategoryTitle(
                    widget.language, entry.categories.first)),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _open(entry))),
    ]);
  }

  Widget _detail() {
    final category = widget.category;
    if (category != null) {
      _visited.addAll(widget.entries
          .where((entry) => entry.categories.contains(category))
          .map((entry) => entry.id));
    }
    final colors = LangbaiAndroidTokens.of(context);
    return SingleChildScrollView(
        key: const ValueKey('android-settings-detail-scroll'),
        controller: _detailScroll,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: androidPagePadding(context,
            bottom: 24 + MediaQuery.viewInsetsOf(context).bottom),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (final entry in widget.entries)
            if (_visited.contains(entry.id))
              Offstage(
                  offstage:
                      category == null || !entry.categories.contains(category),
                  key: ValueKey('android-settings-retained-${entry.id}'),
                  child: Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: KeyedSubtree(
                          key:
                              _anchors.putIfAbsent(entry.id, () => GlobalKey()),
                          child: AnimatedContainer(
                              duration: widget.reduceMotion
                                  ? Duration.zero
                                  : const Duration(milliseconds: 160),
                              padding: const EdgeInsets.all(2),
                              decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.all(
                                      width: 2,
                                      color: _highlight == entry.id
                                          ? Theme.of(context)
                                              .colorScheme
                                              .primary
                                          : Colors.transparent)),
                              child: entry.child)))),
          if (category == null)
            Padding(
                padding: const EdgeInsets.all(32),
                child: Text(androidSettingsCopy(widget.language, 'choose'),
                    style: TextStyle(color: colors.textSecondary))),
        ]));
  }

  @override
  Widget build(BuildContext context) {
    final tokens = LangbaiAndroidTokens.of(context);
    return PopScope(
        canPop: !widget.active || !_hasDetail,
        onPopInvokedWithResult: (didPop, result) {
          if (!didPop && widget.active && _hasDetail) _back();
        },
        child: Scaffold(
            key: const ValueKey('android-settings-hub'),
            backgroundColor: tokens.canvas,
            appBar: AppBar(
                leading: _hasDetail
                    ? IconButton(
                        tooltip: androidSettingsCopy(widget.language, 'back'),
                        onPressed: _back,
                        icon: const Icon(Icons.arrow_back))
                    : null,
                title: studioAppBarTitle(context, Text(widget.category == null
                    ? androidSettingsCopy(widget.language, 'title')
                    : androidSettingsCategoryTitle(
                        widget.language, widget.category!)))),
            body: Column(children: [
              Padding(
                  padding: androidPagePadding(context, bottom: 12),
                  child: TextField(
                      key: const ValueKey('android-settings-search'),
                      controller: _search,
                      onChanged: _searchChanged,
                      decoration: InputDecoration(
                          hintText:
                              androidSettingsCopy(widget.language, 'search'),
                          prefixIcon: const Icon(Icons.search),
                          suffixIcon: _query.isEmpty
                              ? null
                              : IconButton(
                                  tooltip: MaterialLocalizations.of(context)
                                      .closeButtonTooltip,
                                  onPressed: _clearSearch,
                                  icon: const Icon(Icons.close))))),
              Expanded(child: LayoutBuilder(builder: (context, constraints) {
                final wide = constraints.maxWidth >= 840;
                final home = SingleChildScrollView(
                    padding: androidPagePadding(context), child: _categories());
                final detail = _detail();
                return Stack(children: [
                  Offstage(
                      offstage: _query.isNotEmpty,
                      child: wide
                          ? Row(children: [
                              SizedBox(width: 320, child: home),
                              Expanded(child: detail)
                            ])
                          : Stack(children: [
                              Offstage(
                                  offstage: widget.category != null,
                                  child: home),
                              Offstage(
                                  offstage: widget.category == null,
                                  child: detail)
                            ])),
                  if (_query.isNotEmpty) _results(),
                ]);
              })),
            ])));
  }
}

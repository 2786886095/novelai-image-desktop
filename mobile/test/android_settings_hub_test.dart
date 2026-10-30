import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/settings/android_settings_hub.dart';
import 'package:novelai_mobile/screens/settings/settings_search_index.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';

const _sectionIds = [
  'accounts',
  'provider',
  'balance',
  'openai-edit',
  'external-mcp',
  'update',
  'update-source',
  'language',
  'network',
  'token-guide',
  'reverse',
  'convert',
  'tags',
  'translate',
  'templates',
  'shortcuts',
  'storage',
  'resources',
  'backup',
  'persistence',
  'sound',
  'appearance',
  'about',
  'navigation',
  'diagnostics',
];

void main() {
  test(
      'all existing settings sections have static searchable categories in five languages',
      () {
    for (final language in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
      for (final category in AndroidSettingsCategory.values) {
        expect(androidSettingsCategoryTitle(language, category), isNotEmpty);
      }
      for (final id in _sectionIds) {
        expect(androidSettingsEntryCategories(id), isNotEmpty, reason: id);
        final title = androidSettingsEntryTitle(language, id);
        expect(title, isNotEmpty, reason: id);
        expect(
            androidSettingsSearchMatches(
                id: id, title: title, language: language, query: title),
            isTrue,
            reason: id);
      }
    }
    expect(androidSettingsEntryCategories('future-setting'),
        contains(AndroidSettingsCategory.preferences));
  });

  test('search accepts common setting aliases without indexing a field value',
      () {
    for (final entry in <String, String>{
      'reverse': 'model',
      'network': '代理',
      'storage': 'metadata',
      'backup': 'restore',
      'translate': '百度',
      'templates': 'manga',
      'navigation': '排序',
      'appearance': 'reduce motion',
    }.entries) {
      expect(
          androidSettingsSearchMatches(
              id: entry.key,
              title: androidSettingsEntryTitle('zh-CN', entry.key),
              language: 'zh-CN',
              query: entry.value),
          isTrue);
    }
    for (final id in _sectionIds) {
      expect(
          androidSettingsSearchMatches(
              id: id,
              title: androidSettingsEntryTitle('en-US', id),
              language: 'en-US',
              query: 'fixture-private-value-74d0'),
          isFalse);
    }
  });

  testWidgets(
      'category and search navigation retain mounted editing state and notify detail changes',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    final categoryEvents = <AndroidSettingsCategory?>[];
    final searchEvents = <bool>[];
    var refreshCount = 0;
    await tester.pumpWidget(_Harness(
      onCategory: categoryEvents.add,
      onSearch: searchEvents.add,
      onRefresh: () => refreshCount++,
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('fixture-editor')), findsNothing);
    await tester
        .tap(find.byKey(const ValueKey('android-settings-category-access')));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('fixture-editor')), 'draft retained');
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('fixture-editor')), findsNothing);
    expect(find.byKey(const ValueKey('fixture-editor'), skipOffstage: false),
        findsOneWidget);
    await tester.enterText(
        find.byKey(const ValueKey('android-settings-search')), 'model');
    await tester.pumpAndSettle();
    await tester
        .tap(find.byKey(const ValueKey('android-settings-search-reverse')));
    await tester.pumpAndSettle();
    expect(find.text('Vision model fixture'), findsOneWidget);
    expect(searchEvents, containsAllInOrder([true, false]));
    expect(categoryEvents,
        [AndroidSettingsCategory.access, null, AndroidSettingsCategory.ai]);
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    await tester
        .tap(find.byKey(const ValueKey('android-settings-category-access')));
    await tester.pumpAndSettle();
    final field =
        tester.widget<TextField>(find.byKey(const ValueKey('fixture-editor')));
    expect(field.controller!.text, 'draft retained');
    expect(tester.takeException(), isNull);
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.refresh));
    expect(refreshCount, 1);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('search back clears query before leaving an active category',
      (tester) async {
    final categoryEvents = <AndroidSettingsCategory?>[];
    final searchEvents = <bool>[];
    await tester.pumpWidget(
        _Harness(onCategory: categoryEvents.add, onSearch: searchEvents.add));
    await tester
        .tap(find.byKey(const ValueKey('android-settings-category-access')));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('android-settings-search')), 'proxy');
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('fixture-editor')), findsOneWidget);
    expect(categoryEvents, [AndroidSettingsCategory.access]);
    expect(searchEvents.last, isFalse);
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pumpAndSettle();
    expect(categoryEvents.last, isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final size in [const Size(320, 640), const Size(1000, 800)]) {
    for (final dark in [false, true]) {
      testWidgets('settings hub supports $size dark=$dark and large text',
          (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = size;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(_Harness(dark: dark, textScale: 1.5));
        await tester.pumpAndSettle();
        expect(
            find.byKey(const ValueKey('android-settings-hub')), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.tap(
            find.byKey(const ValueKey('android-settings-category-access')));
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('fixture-editor')), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }
}

class _Harness extends StatefulWidget {
  final ValueChanged<AndroidSettingsCategory?>? onCategory;
  final ValueChanged<bool>? onSearch;
  final VoidCallback? onRefresh;
  final bool dark;
  final double textScale;
  const _Harness(
      {this.onCategory,
      this.onSearch,
      this.onRefresh,
      this.dark = false,
      this.textScale = 1});
  @override
  State<_Harness> createState() => _HarnessState();
}

class _HarnessState extends State<_Harness> {
  AndroidSettingsCategory? category;
  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: androidStudioTheme(ThemeData(
            brightness: widget.dark ? Brightness.dark : Brightness.light)),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(widget.textScale)),
          child: child!,
        ),
        home: AndroidSettingsHub(
          language: 'en-US',
          category: category,
          reduceMotion: true,
          accountConfigured: false,
          balance: null,
          providerConfigured: false,
          onRefreshAccount: widget.onRefresh ?? () {},
          onCategoryChanged: (value) {
            setState(() => category = value);
            widget.onCategory?.call(value);
          },
          onSearchChanged: (value) => widget.onSearch?.call(value),
          entries: [
            AndroidSettingsEntry(
                id: 'accounts',
                title: 'Accounts',
                categories: androidSettingsEntryCategories('accounts'),
                child: const _RetainedEditor()),
            AndroidSettingsEntry(
                id: 'reverse',
                title: 'Image analysis',
                categories: androidSettingsEntryCategories('reverse'),
                child: const Card(
                    child: Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('Vision model fixture')))),
            AndroidSettingsEntry(
                id: 'network',
                title: 'Network',
                categories: androidSettingsEntryCategories('network'),
                child: const Text('Proxy fixture')),
          ],
        ),
      );
}

class _RetainedEditor extends StatefulWidget {
  const _RetainedEditor();
  @override
  State<_RetainedEditor> createState() => _RetainedEditorState();
}

class _RetainedEditorState extends State<_RetainedEditor> {
  final controller = TextEditingController(text: 'original');
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Card(
          child: Padding(
        padding: const EdgeInsets.all(16),
        child: TextField(
            key: const ValueKey('fixture-editor'), controller: controller),
      ));
}

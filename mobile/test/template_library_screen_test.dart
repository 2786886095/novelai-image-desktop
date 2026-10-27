import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/template_library.dart';
import 'package:novelai_mobile/screens/template_library_screen.dart';
import 'package:novelai_mobile/screens/prompt_skill_selector.dart';

Future<void> tapIo(
    WidgetTester tester, Finder button, bool Function() completed) async {
  await tester.runAsync(() async {
    await tester.tap(button);
    for (var i = 0; i < 500 && !completed(); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect(completed(), isTrue,
        reason: 'Real file operation did not complete.');
    await Future<void>.delayed(const Duration(milliseconds: 10));
  });
  await tester.pumpAndSettle();
}

Future<void> showWidget(
    WidgetTester tester, Finder finder, double delta) async {
  await tester.scrollUntilVisible(finder, delta,
      scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  late MobileTemplateLibrary library;
  setUp(() async {
    dir = await Directory.systemTemp.createTemp('template-library-widget-');
    library = MobileTemplateLibrary(directoryProvider: () async => dir);
    await library.load();
  });
  tearDown(() async {
    library.dispose();
    await dir.delete(recursive: true);
  });
  testWidgets(
      'real template screen shows immutable body and two distinct comic sources',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: TemplateLibraryScreen(library: library, language: 'zh-CN')));
    await tester.pumpAndSettle();
    final body = tester
        .widget<TextField>(find.byKey(const ValueKey('template-library-body')));
    expect(body.readOnly, isTrue);
    expect(body.controller!.text, library.builtins.first.body);
    await tester.tap(find.text('漫画模板 · 2 套'));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<TextField>(
                find.byKey(const ValueKey('template-library-body')))
            .controller!
            .text,
        library.builtins.singleWhere((v) => v.slot == 'comic.jp-page').body);
    expect(find.text(mobileTemplateLibraryCopy('zh-CN')[16]), findsOneWidget);
    expect(find.textContaining('日式整页 · v4.1'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'five languages remain overflow-free at narrow portrait and text stress',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(375, 812));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    for (final language in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
      await tester.pumpWidget(MaterialApp(
          theme: ThemeData.dark(),
          home: MediaQuery(
              data: const MediaQueryData(textScaler: TextScaler.linear(1.25)),
              child: TemplateLibraryScreen(
                  key: ValueKey(language),
                  library: library,
                  language: language))));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: language);
      final reload = find.byKey(const ValueKey('template-library-reload'));
      expect(reload, findsOneWidget);
      final box = tester.getRect(reload);
      expect(box.width, greaterThan(44));
      expect(box.height, greaterThanOrEqualTo(44));
    }
  });
  testWidgets('image selector offers v3 but assistant overlay hides it',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: PromptSkillSelector(
                model: 'v5',
                edition: '3.0.0',
                language: 'en-US',
                onChanged: (_, __) {}))));
    await tester.pumpAndSettle();
    expect(find.text('3.0.0 · V5 Full'), findsWidgets);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: PromptSkillSelector(
                model: 'v5',
                edition: '2.0.0',
                language: 'en-US',
                allowV3: false,
                onChanged: (_, __) {}))));
    await tester.pumpAndSettle();
    expect(find.text('3.0.0 · V5 Full'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('real buttons save a custom copy, use it and save edited body',
      (tester) async {
    final enabled = <String>[];
    await tester.pumpWidget(MaterialApp(
        home: TemplateLibraryScreen(
            library: library,
            language: 'zh-CN',
            onUseImageV3: (kind) async {
              enabled.add(kind);
            })));
    await tester.pumpAndSettle();
    final name = find.byKey(const ValueKey('template-library-name'));
    await showWidget(tester, name, 500);
    await tester.enterText(name, 'Widget copy');
    await tester.pump();
    final fork = find.widgetWithText(OutlinedButton, '另存为自定义');
    await showWidget(tester, fork, 500);
    expect(tester.widget<OutlinedButton>(fork).onPressed, isNotNull);
    await tapIo(tester, fork, () => library.custom.length == 1);
    expect(library.custom, hasLength(1),
        reason: tester
            .widgetList<Text>(find.byType(Text))
            .map((v) => v.data ?? '')
            .join(' | '));
    final body = find.byKey(const ValueKey('template-library-body'));
    expect(tester.widget<TextField>(body).readOnly, isFalse);
    final use = find.widgetWithText(FilledButton, '使用此模板');
    await showWidget(tester, use, 500);
    await tapIo(tester, use, () => enabled.contains('reverse'));
    expect(enabled, ['reverse']);
    expect(library.resolve('image.reverse.tags').source, 'custom');
    await showWidget(tester, body, -500);
    await tester.enterText(body, 'A literal custom prompt {{input}}');
    await tester.pump();
    expect(tester.widget<FilledButton>(use).onPressed, isNull);
    final save = find.widgetWithText(OutlinedButton, '保存修改');
    await showWidget(tester, save, 500);
    await tapIo(
        tester,
        save,
        () =>
            library.resolve('image.reverse.tags').body ==
            'A literal custom prompt {{input}}');
    expect(library.resolve('image.reverse.tags').body,
        'A literal custom prompt {{input}}');
    expect(tester.takeException(), isNull);
  });
  testWidgets('unsaved custom edits survive canceling a slot switch',
      (tester) async {
    await tester.runAsync(() => library.create(
        slot: 'image.reverse.tags',
        name: 'custom',
        body: 'before',
        activate: true));
    await tester.pumpWidget(MaterialApp(
        home: TemplateLibraryScreen(library: library, language: 'zh-CN')));
    await tester.pumpAndSettle();
    final body = find.byKey(const ValueKey('template-library-body'));
    await showWidget(tester, body, -500);
    await tester.enterText(body, 'unsaved text');
    await tester.pump();
    await tester.scrollUntilVisible(find.text('漫画模板 · 2 套'), -600,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('漫画模板 · 2 套'));
    await tester.pumpAndSettle();
    expect(find.text('放弃修改'), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, '取消'));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(body).controller!.text, 'unsaved text');
    expect(library.resolve('image.reverse.tags').body, 'before');
    expect(tester.takeException(), isNull);
  });
}

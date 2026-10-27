import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/comic/comic_prompt_composer.dart';
import 'package:novelai_mobile/comic/comic_prompt_controller.dart';
import 'package:novelai_mobile/comic/comic_prompt_text.dart';

void main() {
  ComicPromptComposerController make() => ComicPromptComposerController(
      contextFingerprint: () => 'fixture',
      readDraft: () async => null,
      writeDraft: (_) async {},
      transport: (r, s) async => ComicTextReply(
          ok: true,
          text: r.action == 'recommend'
              ? jsonEncode({'pages': 2, 'reason': 'Two story beats'})
              : List.generate(r.pages, (i) => '1girl, quiet street ${i + 1}')
                  .join('\n')));
  for (final language in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
    for (final size in [const Size(375, 812), const Size(800, 375)]) {
      testWidgets(
          'comic composer readable $language $size without horizontal overflow',
          (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = size;
        addTearDown(tester.view.reset);
        final c = make();
        addTearDown(c.dispose);
        await c.load();
        c.setInput('A short story');
        await tester.pumpWidget(MaterialApp(
            home: Scaffold(
                body: ListView(children: [
          ComicPromptComposerView(controller: c, language: language)
        ]))));
        await tester.pumpAndSettle();
        expect(find.text(comicPromptText(language, 'title')), findsOneWidget);
        expect(tester.takeException(), isNull);
        final generate = tester.widget<ButtonStyleButton>(
            find.byKey(const ValueKey('comic-generate-prompts')));
        expect(generate.onPressed, isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        c.dispose();
        await tester.pump();
      });
    }
  }
  testWidgets(
      'AI recommendation is explicit and import needs separate confirmation',
      (tester) async {
    final c = make();
    addTearDown(c.dispose);
    await c.load();
    c.setInput('A story');
    var imported = 0;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ListView(children: [
      ComicPromptComposerView(
          controller: c,
          language: 'en-US',
          onImport: (pages) async {
            imported = pages.length;
          })
    ]))));
    await tester.ensureVisible(find.byKey(const ValueKey('comic-recommend')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('comic-recommend')));
    await tester.pumpAndSettle();
    expect(c.pages, 2);
    expect(imported, 0);
    await tester
        .ensureVisible(find.byKey(const ValueKey('comic-generate-prompts')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('comic-generate-prompts')));
    await tester.pumpAndSettle();
    expect(c.canImport, true);
    expect(imported, 0);
    await tester
        .ensureVisible(find.byKey(const ValueKey('comic-import-pages')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('comic-import-pages')));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(imported, 0);
    await tester.tap(find.byKey(const ValueKey('comic-confirm-import')));
    await tester.pumpAndSettle();
    expect(imported, 2);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    c.dispose();
    await tester.pump();
  });
}

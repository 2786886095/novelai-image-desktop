import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/negative_prompt_library.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/prompt/android_prompt_editor_page.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/ui/negative_prompt_library.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> openEditor(WidgetTester tester, TextEditingController controller,
    ValueNotifier<int> revision,
    {ValueChanged<String>? onChanged,
    bool Function()? alive,
    bool Function(String)? revert,
    double scale = 1,
    double keyboard = 0}) async {
  await tester.pumpWidget(MaterialApp(
      theme: androidStudioTheme(StudioTheme.light()),
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(scale),
              viewInsets: EdgeInsets.only(bottom: keyboard)),
          child: child!),
      home: Builder(
          builder: (context) => Scaffold(
              body: FilledButton(
                  onPressed: () =>
                      Navigator.of(context).push<void>(MaterialPageRoute(
                          builder: (_) => AndroidPromptEditorPage(
                                controller: controller,
                                label: '正面提示词',
                                language: 'zh-CN',
                                snapshot: controller.text,
                                onChanged: onChanged ?? (_) {},
                                revision: revision,
                                ownerAlive: alive ?? () => true,
                                onRevert: revert ??
                                    (snapshot) {
                                      controller.text = snapshot;
                                      return true;
                                    },
                                tools: () => [
                                  PromptToolAction(
                                      label: '现有工具',
                                      icon: Icons.tune,
                                      onPressed: () {})
                                ],
                              ))),
                  child: const Text('Open editor'))))));
  await tester.tap(find.text('Open editor'));
  await tester.pumpAndSettle();
}

void main() {
  for (final unrelated in [false, true]) {
    testWidgets(
        'owner disposal closes real negative library and confirmation; unrelated route $unrelated',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final previous = debugDefaultTargetPlatformOverride;
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      tester.view.physicalSize = const Size(430, 932);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final state = AppState();
      state.settings.autoComplete = false;
      state.settings.negativePromptPresets = [
        {
          'id': 'dispose-fixture',
          'name': 'Owner lifecycle fixture',
          'prompt': 'bad hands',
          'createdAt': '2026-10-30T00:00:00.000Z',
        }
      ];
      addTearDown(state.dispose);
      final visible = ValueNotifier<bool>(true);
      addTearDown(visible.dispose);
      final owner = GlobalKey<PromptEditorState>();
      final navigator = GlobalKey<NavigatorState>();
      final writes = <String>[];
      try {
        await tester.pumpWidget(ChangeNotifierProvider.value(
          value: state,
          child: MaterialApp(
            navigatorKey: navigator,
            theme: androidStudioTheme(StudioTheme.light()),
            home: Scaffold(
              body: ValueListenableBuilder<bool>(
                valueListenable: visible,
                builder: (_, show, __) => show
                    ? PromptEditor(
                        key: owner,
                        label: '负面提示词',
                        value: 'bad hands',
                        lockKind: 'negative',
                        onChanged: writes.add,
                      )
                    : const Text('Original owner removed'),
              ),
            ),
          ),
        ));
        var editorClosed = false;
        owner.currentState!.openFullscreen().then((_) => editorClosed = true);
        await tester.pumpAndSettle();
        await tester.tap(find.byType(NegativePromptLibraryButton));
        await tester.pumpAndSettle();
        final labels = negativeLibraryLabels('zh-CN');
        await tester.tap(find.text(labels[6]));
        // The real library keeps its busy spinner running while the delete
        // confirmation awaits input. Wait only for the dialog transition.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 350));
        expect(find.byType(AlertDialog), findsOneWidget);
        expect(find.text(labels[19]), findsOneWidget);
        expect(find.byType(LinearProgressIndicator), findsOneWidget);

        if (unrelated) {
          navigator.currentState!.push<void>(MaterialPageRoute<void>(
              builder: (_) =>
                  const Scaffold(body: Text('Independent route must remain'))));
          await tester.pumpAndSettle();
        }
        // Real PromptEditorState.dispose closes its actual shared controller
        // while its library route and nested delete dialog are still present.
        visible.value = false;
        await tester.pumpAndSettle();
        expect(owner.currentState, isNull);
        expect(editorClosed, isTrue);
        expect(
            find.byKey(const ValueKey('android-prompt-editor-page'),
                skipOffstage: false),
            findsNothing);
        expect(find.byType(AlertDialog, skipOffstage: false), findsNothing);
        expect(find.byType(NegativePromptLibraryButton, skipOffstage: false),
            findsNothing);
        expect(writes, isEmpty);
        expect(state.settings.negativePromptPresets.single['id'],
            'dispose-fixture');
        if (unrelated) {
          expect(find.text('Independent route must remain'), findsOneWidget);
          navigator.currentState!.pop();
          await tester.pumpAndSettle();
        }
        expect(find.text('Original owner removed'), findsOneWidget);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        debugDefaultTargetPlatformOverride = previous;
      }
    });
  }

  testWidgets('owner can dispose after push but before editor first frame',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final previous = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final state = AppState();
    state.settings.autoComplete = false;
    addTearDown(state.dispose);
    final visible = ValueNotifier<bool>(true);
    addTearDown(visible.dispose);
    final owner = GlobalKey<PromptEditorState>();
    final writes = <String>[];
    try {
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: androidStudioTheme(StudioTheme.light()),
          home: Scaffold(
            body: ValueListenableBuilder<bool>(
              valueListenable: visible,
              builder: (_, show, __) => show
                  ? PromptEditor(
                      key: owner,
                      label: '正面提示词',
                      value: 'cat',
                      onChanged: writes.add,
                    )
                  : const Text('Owner removed before editor build'),
            ),
          ),
        ),
      ));
      var editorClosed = false;
      owner.currentState!.openFullscreen().then((_) => editorClosed = true);
      // Deliberately no pump between push and removing the real owning State.
      visible.value = false;
      await tester.pumpAndSettle();
      expect(owner.currentState, isNull);
      expect(editorClosed, isTrue);
      expect(find.text('Owner removed before editor build'), findsOneWidget);
      expect(
          find.byKey(const ValueKey('android-prompt-editor-page'),
              skipOffstage: false),
          findsNothing);
      expect(writes, isEmpty);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      debugDefaultTargetPlatformOverride = previous;
    }
  });

  testWidgets(
      'real shared controller edits persist after Done without disposal',
      (tester) async {
    final controller = TextEditingController(text: 'cat, blue eyes');
    final revision = ValueNotifier<int>(0);
    addTearDown(controller.dispose);
    addTearDown(revision.dispose);
    var saved = '';
    await openEditor(tester, controller, revision,
        onChanged: (value) => saved = value);
    await tester.enterText(
        find.byKey(const ValueKey('android-fullscreen-prompt-text')),
        'new, prompt');
    await tester.pump();
    expect(controller.text, 'new, prompt');
    expect(saved, 'new, prompt');
    await tester.tap(find.text('完成'));
    await tester.pumpAndSettle();
    expect(
        find.byKey(const ValueKey('android-prompt-editor-page')), findsNothing);
    controller.text = 'still owned by caller';
    expect(controller.text, 'still owned by caller');
    expect(tester.takeException(), isNull);
  });
  testWidgets('text and chips switch without rewriting bytes', (tester) async {
    const source = ' cat ,{red, blue}, 0.8::stars, night:: ';
    final controller = TextEditingController(text: source);
    final revision = ValueNotifier<int>(0);
    addTearDown(controller.dispose);
    addTearDown(revision.dispose);
    await openEditor(tester, controller, revision);
    await tester.tap(find.text('标签'));
    await tester.pumpAndSettle();
    expect(find.byType(InputChip), findsNWidgets(3));
    expect(controller.text, source);
    await tester.tap(find.text('文本'));
    await tester.pumpAndSettle();
    expect(controller.text, source);
    expect(tester.takeException(), isNull);
  });
  testWidgets('complex unfinished prompt rejects chip mode and preserves text',
      (tester) async {
    final controller = TextEditingController(text: '{unfinished, prompt');
    final revision = ValueNotifier<int>(0);
    addTearDown(controller.dispose);
    addTearDown(revision.dispose);
    await openEditor(tester, controller, revision);
    await tester.tap(find.text('标签'));
    await tester.pump();
    expect(find.byKey(const ValueKey('android-fullscreen-prompt-text')),
        findsOneWidget);
    expect(controller.text, '{unfinished, prompt');
    expect(tester.takeException(), isNull);
  });
  testWidgets('discard refuses newer external content', (tester) async {
    final controller = TextEditingController(text: 'initial');
    final revision = ValueNotifier<int>(0);
    addTearDown(controller.dispose);
    addTearDown(revision.dispose);
    var lastOwned = controller.text;
    await openEditor(tester, controller, revision,
        onChanged: (v) => lastOwned = v,
        revert: (snapshot) {
          if (controller.text != lastOwned) return false;
          controller.text = snapshot;
          return true;
        });
    controller.text = 'external update';
    await tester.pump();
    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('放弃本次修改'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('确认'));
    await tester.pump();
    expect(controller.text, 'external update');
    expect(find.text('内容已被其他操作更新，无法整体还原。'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  for (final scale in [1.0, 2.0]) {
    testWidgets('compact editor stays usable above keyboard at scale $scale',
        (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final controller = TextEditingController(text: 'cat');
      final revision = ValueNotifier<int>(0);
      addTearDown(controller.dispose);
      addTearDown(revision.dispose);
      await openEditor(tester, controller, revision,
          scale: scale, keyboard: 300);
      expect(find.byKey(const ValueKey('android-fullscreen-prompt-text')),
          findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}

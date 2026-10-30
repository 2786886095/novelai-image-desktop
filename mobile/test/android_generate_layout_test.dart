import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/billing/anlas.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

const classic = bool.fromEnvironment('LANGBAI_ANDROID_CLASSIC');

Future<void> pumpCreate(WidgetTester tester, AppState state,
        {double scale = 1}) =>
    tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
            theme: androidStudioTheme(StudioTheme.light()),
            builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(scale)),
                child: child!),
            home: const GenerateScreen())));

Future<void> withTestPlatform(WidgetTester tester, TargetPlatform platform,
    Future<void> Function() body) async {
  final previous = debugDefaultTargetPlatformOverride;
  debugDefaultTargetPlatformOverride = platform;
  try {
    await body();
  } finally {
    // Widget-test foundation invariants run before addTearDown callbacks.
    // Unmount while the same visual platform is active, then reset explicitly.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    debugDefaultTargetPlatformOverride = previous;
  }
}

class _ReactiveSheetState extends AppState {
  void advanceQueue() {
    generationQueueRunning = true;
    queueCollapsed = false;
    queueProgress = const GenerationQueueProgress(total: 3, done: 1);
    notifyListeners();
  }
  void updateBalance() {
    account = const AccountSummary(hasToken: true, anlasBalance: 77);
    generationQuote = const AnlasQuote(ok: true, amount: 19, source: AnlasQuoteSource.officialApi, message: 'fixture');
    notifyListeners();
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });
  for (final size in [
    const Size(320, 640),
    const Size(430, 932),
    const Size(800, 360)
  ]) {
    for (final scale in [1.0, 2.0]) {
      testWidgets('Android card workspace and dock fit $size scale $scale',
          (tester) async {
        await withTestPlatform(tester, TargetPlatform.android, () async {
          tester.view.physicalSize = size;
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.reset);
          final state = AppState();
          state.settings.autoComplete = false;
          addTearDown(state.dispose);
          await pumpCreate(tester, state, scale: scale);
          await tester.pump();
          expect(find.byKey(const ValueKey('android-create-workspace')),
              findsOneWidget);
          expect(find.byKey(const ValueKey('android-create-empty-result')),
              findsOneWidget);
          expect(find.byKey(const ValueKey('android-create-operation-dock')),
              findsOneWidget);
          expect(tester.takeException(), isNull);
        });
      }, skip: classic);
    }
  }
  testWidgets('summary opens same live persisted prompt controller',
      (tester) async {
    await withTestPlatform(tester, TargetPlatform.android, () async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final state = AppState();
      state.settings.autoComplete = false;
      state.params.positivePrompt = 'cat';
      addTearDown(state.dispose);
      await pumpCreate(tester, state);
      await tester.pump();
      final editor = find.byType(PromptEditor).at(1);
      await tester.ensureVisible(editor);
      await tester.tap(editor);
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byKey(const ValueKey('android-fullscreen-prompt-text')),
          'cat, new prompt');
      await tester.pump();
      expect(state.params.positivePrompt, 'cat, new prompt');
      await tester.tap(find.text('完成'));
      await tester.pumpAndSettle();
      expect(state.params.positivePrompt, 'cat, new prompt');
      expect(tester.takeException(), isNull);
    });
  }, skip: classic);
  testWidgets('open queue and quote sheets react to live state notifications',
      (tester) async {
    await withTestPlatform(tester, TargetPlatform.android, () async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final state = _ReactiveSheetState();
      state.settings.autoComplete = false;
      addTearDown(state.dispose);
      await pumpCreate(tester, state);
      await tester.tap(find.byTooltip('任务队列 · 0'));
      await tester.pumpAndSettle();
      expect(find.text('任务队列 · 0'), findsOneWidget);
      state.advanceQueue();
      await tester.pump();
      expect(find.textContaining('队列 · 1 运行'), findsOneWidget);
      expect(find.text('任务队列 · 0'), findsNothing);
      await tester.tap(find.byTooltip('关闭').last);
      await tester.pump(const Duration(milliseconds: 350));
      await tester.ensureVisible(find.text('? Anlas'));
      await tester.tap(find.text('? Anlas'));
      await tester.pump(const Duration(milliseconds: 350));
      state.updateBalance();
      await tester.pump();
      expect(find.textContaining('77'), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  }, skip: classic);
  testWidgets('iOS remains on the classic creation layout', (tester) async {
    await withTestPlatform(tester, TargetPlatform.iOS, () async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final state = AppState();
      addTearDown(state.dispose);
      await pumpCreate(tester, state);
      await tester.pump();
      expect(
          find.byKey(const ValueKey('android-create-workspace')), findsNothing);
      expect(
          find.byKey(const ValueKey('generate-single-layout')), findsOneWidget);
      expect(find.byType(TextField), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  });
}

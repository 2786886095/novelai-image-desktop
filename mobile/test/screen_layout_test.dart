import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/main.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/inspect_screen.dart';
import 'package:novelai_mobile/screens/ai_log_screen.dart';
import 'package:novelai_mobile/screens/settings_screen.dart';
import 'package:novelai_mobile/screens/tools_hub_screen.dart';
import 'package:novelai_mobile/screens/tools_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

const _screens = <({String name, Widget screen})>[
  (name: 'generate', screen: GenerateScreen()),
  (name: 'inpaint', screen: ToolsScreen(kind: ToolPageKind.inpaint)),
  (name: 'upscale', screen: ToolsScreen(kind: ToolPageKind.upscale)),
  (name: 'postprocess', screen: ToolsScreen(kind: ToolPageKind.postprocess)),
  (name: 'reverse', screen: InspectScreen(kind: InspectPageKind.reverse)),
  (name: 'convert', screen: InspectScreen(kind: InspectPageKind.convert)),
  (name: 'gallery', screen: GalleryScreen()),
  (name: 'tools', screen: ToolsHubScreen()),
  (name: 'ai-log', screen: AiLogScreen()),
  (name: 'settings', screen: SettingsScreen()),
];

Future<void> _pumpScreen(
  WidgetTester tester,
  AppState state,
  Widget screen,
  String reason,
) async {
  await tester.pumpWidget(
    ChangeNotifierProvider.value(
      value: state,
      child: MaterialApp(theme: StudioTheme.light(), home: screen),
    ),
  );
  await tester.pump();
  expect(tester.takeException(), isNull, reason: reason);
}

void main() {
  for (final target in <(String, Size)>[
    ('tiny phone', const Size(320, 640)),
    ('compact phone', const Size(360, 800)),
    ('large phone', const Size(412, 915)),
    ('landscape phone', const Size(800, 360)),
    ('portrait tablet', const Size(800, 1280)),
    ('landscape tablet', const Size(1280, 800)),
  ]) {
    testWidgets('all primary screens fit the ${target.$1} viewport',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = target.$2;
      addTearDown(tester.view.reset);
      final state = AppState();
      addTearDown(state.dispose);

      for (final entry in _screens) {
        await _pumpScreen(
          tester,
          state,
          entry.screen,
          '${target.$1}: ${entry.name}',
        );
      }
    });
  }

  testWidgets('positive prompt keeps user and external edits after rebuilds',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    // Tall viewport so the lazily-built ListView renders the positive field
    // (this test exercises controller sync, not small-screen layout).
    tester.view.physicalSize = const Size(420, 1700);
    addTearDown(tester.view.reset);
    final state = AppState();
    addTearDown(state.dispose);

    await _pumpScreen(
      tester,
      state,
      const GenerateScreen(),
      'prompt editor initial layout',
    );
    final positiveField = find.byWidgetPredicate(
      (widget) =>
          widget is TextField && widget.decoration?.labelText == '正面提示词',
    );
    expect(positiveField, findsOneWidget);

    await tester.enterText(positiveField, '1girl, smile');
    await tester.pump();
    expect(state.params.positivePrompt, '1girl, smile');

    state.setParam(
      (params) => params.positivePrompt = '1girl, smile, blue eyes',
    );
    await tester.pump();
    final field = tester.widget<TextField>(positiveField);
    expect(field.controller?.text, '1girl, smile, blue eyes');
  });

  testWidgets('generate screen uses split content on roomy phone landscape',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 360);
    addTearDown(tester.view.reset);
    final state = AppState();
    addTearDown(state.dispose);

    await _pumpScreen(
      tester,
      state,
      const GenerateScreen(),
      'generate landscape phone split layout',
    );

    expect(find.byKey(const ValueKey('generate-split-layout')), findsOneWidget);
    expect(find.byKey(const ValueKey('generate-single-layout')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('home shell phone landscape keeps compact nav and split content',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 360);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..booted = true
      ..needsNetworkOnboarding = false
      ..account = const AccountSummary(
        hasToken: true,
        tierName: 'Opus',
        anlasBalance: 9049,
      );
    addTearDown(state.dispose);

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(theme: StudioTheme.light(), home: const HomeShell()),
      ),
    );
    await tester.pump();

    expect(
        find.byKey(const ValueKey('studio-phone-navigation')), findsOneWidget);
    expect(
        find.byKey(const ValueKey('studio-tablet-navigation')), findsNothing);
    expect(find.byKey(const ValueKey('generate-split-layout')), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);
    final nav = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(nav.height, 66);
    expect(
        nav.labelBehavior, NavigationDestinationLabelBehavior.onlyShowSelected);
    expect(tester.takeException(), isNull);
  });

  testWidgets('expanded generation queue fits a compact phone viewport',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(360, 800);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..account = const AccountSummary(hasToken: true, anlasBalance: 100)
      ..busy = true
      ..generationQueueRunning = true
      ..queueProgress = const GenerationQueueProgress(total: 4)
      ..generationQueue = [
        GenerationQueueJob(
          id: 'queued-1',
          params: (GenerateParams()..positivePrompt = 'second queued prompt'),
          extras: GenerateExtras(),
          quotedAnlas: 20,
          addedAt: DateTime(2026, 6, 22),
        ),
      ];
    addTearDown(state.dispose);

    await _pumpScreen(
      tester,
      state,
      const GenerateScreen(),
      'expanded phone generation queue',
    );
    expect(find.textContaining('队列 · 1 运行'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('first launch shows the onboarding walkthrough', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..booted = true
      ..needsNetworkOnboarding = true;
    addTearDown(state.dispose);

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(theme: StudioTheme.light(), home: const HomeShell()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('欢迎使用 Langbai NovelAI Studio'), findsOneWidget);
    expect(find.text('跳过'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

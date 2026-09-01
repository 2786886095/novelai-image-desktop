import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/main.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/inspect_screen.dart';
import 'package:novelai_mobile/screens/ai_log_screen.dart';
import 'package:novelai_mobile/screens/settings_screen.dart';
import 'package:novelai_mobile/screens/tools_hub_screen.dart';
import 'package:novelai_mobile/screens/tools_screen.dart';
import 'package:novelai_mobile/screens/v5_artist_weight_repair_screen.dart';
import 'package:novelai_mobile/services/update_service.dart';
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
  (
    name: 'reference-presets',
    screen: Scaffold(
      body: SafeArea(
        child: ReferencePresetLibraryPanel(
          standalone: true,
          showClose: false,
        ),
      ),
    ),
  ),
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

  testWidgets('V5 artist repair weight draw fits a tiny phone', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 640);
    addTearDown(tester.view.reset);
    final state = AppState();
    addTearDown(state.dispose);

    await _pumpScreen(
      tester,
      state,
      V5ArtistWeightRepairScreen(
        onBack: () {},
        mode: V5ArtistToolMode.draw,
      ),
      'V5 artist repair initial layout',
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.textContaining('0.2'), findsWidgets);
  });

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

  testWidgets('character positions switch to custom mode and drag directly',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 2600);
    addTearDown(tester.view.reset);
    final state = AppState();
    addTearDown(state.dispose);
    state.addCharacter();
    state.addCharacter();

    await _pumpScreen(
      tester,
      state,
      const GenerateScreen(),
      'character position editor initial layout',
    );
    expect(
        find.byKey(const ValueKey('character-position-canvas')), findsNothing);

    final generatePage = find.byKey(const ValueKey('generate-single-layout'));
    final generateScroll = find
        .descendant(of: generatePage, matching: find.byType(Scrollable))
        .first;
    await tester.scrollUntilVisible(
      find.text('自定义拖动'),
      500,
      scrollable: generateScroll,
      maxScrolls: 12,
    );
    final scrollState = tester.state<ScrollableState>(generateScroll);
    scrollState.position.jumpTo(
      (scrollState.position.pixels + 120)
          .clamp(0, scrollState.position.maxScrollExtent)
          .toDouble(),
    );
    await tester.pump();
    await tester.tap(find.text('自定义拖动'));
    await tester.pump();
    expect(state.extras.charCaptions.every((item) => item.useCoords), isTrue);
    expect(find.byKey(const ValueKey('character-position-canvas')),
        findsOneWidget);

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('character-position-marker-1')),
      300,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 6,
    );
    final before = state.extras.charCaptions[1].x;
    await tester.drag(
      find.byKey(const ValueKey('character-position-marker-1')),
      const Offset(36, 0),
    );
    await tester.pump();
    expect(state.extras.charCaptions[1].x, greaterThan(before));

    final scrollable = tester.state<ScrollableState>(
      find.byType(Scrollable).first,
    );
    final scrollBefore = scrollable.position.pixels;
    final yBefore = state.extras.charCaptions[1].y;
    await tester.drag(
      find.byKey(const ValueKey('character-position-marker-1')),
      const Offset(0, 48),
    );
    await tester.pump();
    expect(state.extras.charCaptions[1].y, greaterThan(yBefore));
    expect(scrollable.position.pixels, closeTo(scrollBefore, 0.01));
  });

  testWidgets(
      'character prompt cards collapse independently and start expanded',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 2800);
    addTearDown(tester.view.reset);
    final state = AppState();
    addTearDown(state.dispose);
    state.addCharacter();
    state.addCharacter();

    await _pumpScreen(
      tester,
      state,
      const GenerateScreen(),
      'character prompt collapse initial layout',
    );

    final firstToggle = find.byKey(const ValueKey('character-card-toggle-0'));
    await tester.scrollUntilVisible(
      firstToggle,
      400,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 12,
    );
    expect(
        find.byKey(const ValueKey('character-prompt-field-0')), findsOneWidget);
    expect(
        find.byKey(const ValueKey('character-prompt-field-1')), findsOneWidget);

    tester.widget<IconButton>(firstToggle).onPressed!.call();
    await tester.pump();
    expect(
        find.byKey(const ValueKey('character-prompt-field-0')), findsNothing);
    expect(
        find.byKey(const ValueKey('character-prompt-field-1')), findsOneWidget);
    expect(find.text('角色 1'), findsOneWidget);

    tester.widget<IconButton>(firstToggle).onPressed!.call();
    await tester.pump();
    expect(
        find.byKey(const ValueKey('character-prompt-field-0')), findsOneWidget);
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

  testWidgets('reference preset library opens without compact-phone overflow',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 640);
    addTearDown(tester.view.reset);
    final state = AppState();
    addTearDown(state.dispose);

    await _pumpScreen(
      tester,
      state,
      const GenerateScreen(),
      'reference preset compact phone',
    );
    final scrollable = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(
      find.text('参考图'),
      260,
      scrollable: scrollable,
    );
    await tester.tap(find.text('参考图'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('reference-preset-library-open')),
      160,
      scrollable: scrollable,
    );
    await tester
        .tap(find.byKey(const ValueKey('reference-preset-library-open')));
    await tester.pumpAndSettle();

    expect(find.text('支持 .nairp 预设归档'), findsOneWidget);
    expect(find.text('导入'), findsOneWidget);
    expect(find.text('导出全部'), findsNothing);
    expect(find.text('应用所选预设'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('standalone reference preset page fits a compact phone',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 640);
    addTearDown(tester.view.reset);
    final state = AppState();
    addTearDown(state.dispose);

    await _pumpScreen(
      tester,
      state,
      const Scaffold(
        body: SafeArea(
          child: ReferencePresetLibraryPanel(
            standalone: true,
            showClose: false,
          ),
        ),
      ),
      'standalone reference preset page',
    );

    expect(find.text('支持 .nairp 预设归档'), findsOneWidget);
    expect(find.text('在线角色精准参考库'), findsOneWidget);
    expect(find.text('本机预设'), findsOneWidget);
    await tester.tap(find.text('本机预设'));
    await tester.pumpAndSettle();
    expect(find.text('新建参考图预设'), findsOneWidget);
    expect(find.text('导入'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'large reference preset library starts folded with a fixed apply action',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 640);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..referencePresetGroups = ['大图库']
      ..referencePresets = List.generate(
        672,
        (index) => ReferencePreset(
          id: 'large-$index',
          name: '预设 $index',
          group: '大图库',
          kind: ReferencePresetKind.precise,
          filePath: 'asset:assets/icon/app_icon.png',
          createdAt:
              '2026-09-01T00:00:${(index % 60).toString().padLeft(2, '0')}.000Z',
          preciseType: 'character',
          width: 832,
          height: 1216,
        ),
      );
    addTearDown(state.dispose);

    await _pumpScreen(
      tester,
      state,
      const Scaffold(
        body: SafeArea(
          child: ReferencePresetLibraryPanel(showClose: false),
        ),
      ),
      'large reference preset library',
    );

    final applyButton =
        find.byKey(const ValueKey('reference-preset-apply-fixed'));
    expect(find.text('展开图片列表'), findsOneWidget);
    expect(applyButton, findsOneWidget);
    expect(tester.getBottomRight(applyButton).dy, lessThanOrEqualTo(640));
    expect(
        find.byKey(const ValueKey('reference-preset-load-more')), findsNothing);
    expect(find.byType(Image), findsNothing);

    final expandButton =
        find.byKey(const ValueKey('reference-preset-list-expand'));
    await tester.ensureVisible(expandButton);
    await tester.pumpAndSettle();
    await tester.tap(expandButton);
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('reference-preset-load-more')),
        findsOneWidget);
    expect(find.byType(Image).evaluate().length, lessThanOrEqualTo(24));
    expect(tester.takeException(), isNull);
  });

  testWidgets('settings hides raw update socket errors on compact phones',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 640);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..updateInfo = const UpdateInfo(
        hasUpdate: false,
        currentVersion: appVersion,
        error: 'ClientException with SocketConnection refused, port 52702',
      );
    addTearDown(state.dispose);

    await _pumpScreen(
      tester,
      state,
      const SettingsScreen(),
      'compact update check error',
    );

    expect(find.text('检查失败'), findsOneWidget);
    expect(find.textContaining('SocketConnection'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'generate screen keeps a compact bar when the queue runs in landscape',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 360);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..generationQueueRunning = true
      ..queueProgress = const GenerationQueueProgress(done: 0, total: 1);
    addTearDown(state.dispose);

    await _pumpScreen(
      tester,
      state,
      const GenerateScreen(),
      'generate landscape phone queue running',
    );

    expect(find.byKey(const ValueKey('generate-split-layout')), findsOneWidget);
    expect(tester.takeException(), isNull);
    // The tall stacked queue panel must not be docked as a bottomNavigationBar
    // in landscape — it doesn't fit a short viewport and gets clipped behind
    // the AppBar. Landscape uses compact pause/stop controls instead.
    expect(find.byIcon(Icons.pause), findsOneWidget);
    expect(find.byIcon(Icons.stop), findsOneWidget);
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

  testWidgets('home shell exposes reference presets in the phone bottom bar',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..booted = true
      ..needsNetworkOnboarding = false;
    addTearDown(state.dispose);

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(theme: StudioTheme.light(), home: const HomeShell()),
      ),
    );
    await tester.pump();

    expect(find.text('预设'), findsOneWidget);
    await tester.tap(find.text('预设'));
    await tester.pumpAndSettle();

    expect(find.text('参考图预设'), findsOneWidget);
    await tester.tap(find.text('本机预设'));
    await tester.pumpAndSettle();
    expect(find.text('新建参考图预设'), findsOneWidget);
    expect(find.byIcon(Icons.close), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tablet places reference presets immediately after tools',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1280, 800);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..booted = true
      ..needsNetworkOnboarding = false;
    addTearDown(state.dispose);

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(theme: StudioTheme.light(), home: const HomeShell()),
      ),
    );
    await tester.pump();

    final rail = tester.widget<NavigationRail>(find.byType(NavigationRail));
    final labels = rail.destinations
        .map((destination) => (destination.label as Text).data)
        .toList();
    expect(labels.indexOf('预设'), labels.indexOf('工具') + 1);
    expect(tester.takeException(), isNull);
  });

  for (final target in <(String, Size)>[
    ('compact phone', const Size(360, 800)),
    ('landscape tablet', const Size(1280, 800)),
  ]) {
    testWidgets(
        'settings about section expands without layout issues on ${target.$1}',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = target.$2;
      addTearDown(tester.view.reset);
      final state = AppState()..settings.language = 'en-US';
      addTearDown(state.dispose);

      await _pumpScreen(
        tester,
        state,
        const SettingsScreen(),
        'settings about initial ${target.$1}',
      );

      final aboutTile = find.text('About');
      final scrollable = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(
        aboutTile,
        360,
        scrollable: scrollable,
      );
      // Put the tile safely inside the viewport before tapping. On compact
      // phones it can otherwise land exactly on the bottom edge.
      await tester.drag(scrollable, const Offset(0, -96));
      await tester.pumpAndSettle();
      await tester.tap(aboutTile);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull,
          reason: 'settings about expanded ${target.$1}');

      const githubUrl = 'https://github.com/2786886095/novelai-image-desktop';
      await tester.scrollUntilVisible(
        find.text(githubUrl),
        180,
        scrollable: scrollable,
      );
      final githubTile =
          tester.widget<ListTile>(find.widgetWithText(ListTile, githubUrl));
      expect(githubTile.onTap, isNotNull);

      await tester.scrollUntilVisible(
        find.text('Alipay reward code'),
        120,
        scrollable: scrollable,
      );
      expect(find.text('WeChat reward code'), findsOneWidget);
      expect(find.text('Alipay reward code'), findsOneWidget);
      expect(tester.takeException(), isNull,
          reason: 'settings about rewards ${target.$1}');
    });
  }

  testWidgets('expanded generation queue fits a compact phone viewport',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(360, 800);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..account = const AccountSummary(hasToken: true, anlasBalance: 100)
      ..busy = true
      ..generationQueueRunning = true
      ..queueCollapsed = false
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

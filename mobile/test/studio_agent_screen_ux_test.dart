import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/studio_agent_screen.dart';
import 'package:novelai_mobile/screens/studio_agent_components.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/i18n/studio_agent_text.dart';
import 'package:novelai_mobile/state/app_state.dart';

class UxStorage extends Storage {
  final AgentWorkspace fixture = AgentWorkspace(conversations: [
    AgentConversation(id: 'chat-a', title: '雨夜街头 · 竖图', messages: [
      AgentMessage(id: 'u1', role: 'user', content: '我想画雨夜街头，蓝色外套，竖图'),
      AgentMessage(
          id: 'a1',
          role: 'assistant',
          content: '我已按当前设置整理了画面。\n\n构图：人物居中，背景是雨夜街灯。',
          tools: [
            AgentToolExecution(
                id: 't1',
                name: 'langbai_prepare_generation',
                title: '生图准备',
                status: 'completed',
                output:
                    '{"positivePrompt":"1girl, rain","model":"nai-diffusion-5-full","width":832,"height":1216,"steps":28,"count":1,"estimatedAnlas":0}')
          ]),
    ]),
    AgentConversation(id: 'chat-b', title: '角色服装灵感')
  ], selectedConversationId: 'chat-a');
  @override
  Future<AgentWorkspace> getAgentWorkspace() async => fixture;
  @override
  Future<void> setAgentWorkspace(AgentWorkspace value) async {}
  @override
  Future<Set<String>> getAgentAlwaysAllowedTools() async => {};
  @override
  Future<String?> getAgentApiKey() async => 'fixture-key';
}

class UxController extends AgentController {
  UxController({required super.app});
  final decisions = <String>[];
  @override
  Future<void> respondPermission(String response) async {
    decisions.add(response);
    pendingPermission = null;
    sending = false;
    notifyListeners();
  }
}

Future<void> captureUx(WidgetTester tester, GlobalKey key, String name) async {
  final phase = Platform.environment['STUDIO_UX_CAPTURE_PHASE'];
  if (phase == null) return;
  final boundary =
      key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  final image = await boundary.toImage(pixelRatio: 1);
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  final file =
      File('../artifacts/pi-agent-transaction/ux/screenshots/$name-$phase.png');
  await file.parent.create(recursive: true);
  await file.writeAsBytes(data!.buffer.asUint8List());
  image.dispose();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
      'Studio option semantics expose selected mode and toggled web/preset state',
      (tester) async {
    final handle = tester.ensureSemantics();
    final storage = UxStorage(),
        app = AppState(storage: UxStorage())
          ..settings = AppSettings(language: 'zh-CN');
    final controller = UxController(app: app)
      ..workspace = storage.fixture
      ..loaded = true;
    controller.selectedConversation!.studioApprovalMode = 'auto';
    controller.selectedConversation!.studioWebSearchEnabled = true;
    controller.selectedConversation!.studioTemplateEnabled = false;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(home: StudioAgentScreen(controller: controller))));
    await tester.pumpAndSettle();
    final selected = tester
        .widgetList<Semantics>(find.byType(Semantics))
        .where((w) => w.properties.selected != null)
        .toList();
    expect(selected.where((w) => w.properties.selected == true), hasLength(1));
    expect(selected.where((w) => w.properties.selected == false), hasLength(1));
    final autoNode = tester.getSemantics(find.text('全自动'));
    expect(
        autoNode.getSemanticsData().hasFlag(ui.SemanticsFlag.isSelected), true);
    expect(autoNode.label, contains('全自动'));
    final toggled = tester
        .widgetList<Semantics>(find.byType(Semantics))
        .where((w) => w.properties.toggled != null)
        .toList();
    expect(toggled.where((w) => w.properties.toggled == true), hasLength(1));
    expect(toggled.where((w) => w.properties.toggled == false), hasLength(1));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    controller.dispose();
    app.dispose();
    handle.dispose();
  });
  testWidgets(
      'tool disclosure animates without gating input and honors reduced motion',
      (tester) async {
    for (final reduced in [false, true]) {
      await tester.pumpWidget(MaterialApp(
          home: MediaQuery(
              data: MediaQueryData(disableAnimations: reduced),
              child: const Scaffold(
                  body: StudioAgentToolGroup(
                      title: 'Tools',
                      attention: false,
                      children: [
                    TextField(key: ValueKey('tool-input'))
                  ])))));
      await tester.pumpAndSettle();
      if (reduced) {
        expect(find.byType(AnimatedSize), findsNothing);
      } else {
        final animation =
            tester.widget<AnimatedSize>(find.byType(AnimatedSize));
        expect(animation.duration, AppMotion.disclosureOpen);
        expect(animation.reverseDuration, AppMotion.disclosureClose);
      }
      await tester.tap(find.text('Tools'));
      await tester.pump();
      expect(find.byKey(const ValueKey('tool-input')), findsOneWidget);
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byKey(const ValueKey('tool-input')), 'fixture');
      expect(
          tester
              .widget<TextField>(find.byKey(const ValueKey('tool-input')))
              .controller,
          isNull);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    }
  });
  testWidgets(
      'creative resources use compact three-tab lists, expanded-only details, durable choices at phone and tablet sizes',
      (tester) async {
    for (final size in [
      const Size(320, 640),
      const Size(390, 844),
      const Size(1024, 768)
    ]) {
      for (final language in ['zh-CN', 'zh-TW', 'en', 'ja', 'ko']) {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        final storage = UxStorage(),
            app = AppState(storage: UxStorage())
              ..settings = AppSettings(language: language);
        final controller = UxController(app: app)
          ..workspace = storage.fixture
          ..loaded = true;
        await tester.pumpWidget(ChangeNotifierProvider.value(
            value: app,
            child: MaterialApp(
                theme: ThemeData(
                    useMaterial3: true,
                    colorSchemeSeed: const Color(0xff7047d8)),
                home: StudioAgentScreen(controller: controller))));
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('resource-dsh-infinite-gen-4')),
            findsNothing);
        await tester
            .tap(find.byTooltip(studioAgentText(language, 'expandResources')));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byKey(const ValueKey('resource-dsh-infinite-gen-4')),
            findsOneWidget);
        expect(
            find.byKey(const ValueKey(
                'resource-tavern:builtin-lyra-beta-3-8-sampler')),
            findsNothing);
        expect(find.text(studioAgentText(language, 'presetInfiniteBody')),
            findsNothing);
        await tester.tap(find.descendant(
            of: find.byKey(const ValueKey('resource-dsh-infinite-gen-4')),
            matching: find.byIcon(Icons.expand_more)));
        await tester.pumpAndSettle();
        expect(find.text(studioAgentText(language, 'presetInfiniteBody')),
            findsOneWidget);
        await tester.tap(find.descendant(
            of: find.byKey(const ValueKey('resource-dsh-infinite-gen-4')),
            matching: find.byIcon(Icons.expand_less)));
        await tester.pumpAndSettle();
        await tester
            .tap(find.byKey(const ValueKey('resource-studio-complete')));
        await tester.pumpAndSettle();
        expect(
            controller.selectedConversation!.studioPresetId, 'studio-complete');
        await tester.tap(
            find.text(studioAgentText(language, 'resource_worldbooks')).last);
        await tester.pumpAndSettle();
        expect(controller.workspace.studioResourceTab, 'worldbooks');
        final book = controller.workspace.lorebooks.first;
        expect(find.byKey(ValueKey('resource-${book.id}')), findsOneWidget);
        await tester.tap(find.byKey(ValueKey('resource-${book.id}')));
        await tester.pumpAndSettle();
        expect(controller.workspace.studioDefaults['lorebookIds'],
            controller.selectedConversation!.lorebookIds);
        await tester.tap(
            find.text(studioAgentText(language, 'resource_characters')).last);
        await tester.pumpAndSettle();
        expect(
            find.byKey(ValueKey(
                'resource-${controller.workspace.characters.first.id}')),
            findsOneWidget);
        expect(
            AgentWorkspace.fromJson(controller.workspace.toJson())
                .studioResourceTab,
            'characters');
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
        await tester.pumpAndSettle();
        controller.dispose();
        app.dispose();
      }
    }
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  setUpAll(() async {
    final font = File('C:/Windows/Fonts/msyh.ttc');
    if (font.existsSync()) {
      final loader = FontLoader('UxAudit');
      loader.addFont(font.readAsBytes().then(ByteData.sublistView));
      await loader.load();
    }
    final icons = File(
        'F:/flutter/bin/cache/artifacts/material_fonts/materialicons-regular.otf');
    if (icons.existsSync()) {
      final loader = FontLoader('MaterialIcons');
      loader.addFont(icons.readAsBytes().then(ByteData.sublistView));
      await loader.load();
    }
  });
  testWidgets('Agent chat fits phone and tablet with readable tool feedback',
      (tester) async {
    for (final size in [
      const Size(320, 640),
      const Size(390, 844),
      const Size(1024, 768)
    ]) {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      final key = GlobalKey();
      final app = AppState(storage: UxStorage())
        ..settings = AppSettings(
            agentApiBaseUrl: 'https://example.invalid/v1',
            agentApiModel: '对话模型');
      await tester.pumpWidget(ChangeNotifierProvider.value(
          value: app,
          child: MaterialApp(
              theme: ThemeData(
                  useMaterial3: true,
                  colorSchemeSeed: const Color(0xff7047d8),
                  fontFamily: 'UxAudit'),
              home: RepaintBoundary(
                  key: key, child: const StudioAgentScreen()))));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('雨夜街头 · 竖图'), findsWidgets);
      expect(
          find.byKey(const ValueKey('agent-model-selector')), findsOneWidget);
      expect(
          find.byKey(const ValueKey('agent-context-control')), findsOneWidget);
      expect(find.byKey(const ValueKey('agent-template-selector')),
          findsOneWidget);
      expect(
          find.byKey(const ValueKey('agent-preset-selector')), findsOneWidget);
      expect(
          find.descendant(
              of: find.byType(AppBar),
              matching: find.byIcon(Icons.settings_outlined)),
          findsNothing);
      await tester.runAsync(() => captureUx(
          tester,
          key,
          size.width == 320
              ? '02-narrow-chat'
              : size.width < 600
                  ? '03-phone-chat'
                  : '04-tablet-chat'));
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    }
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  testWidgets(
      'inline plan waits for the user, revise cancels and preserves a draft',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final storage = UxStorage();
    final app = AppState(storage: storage)
      ..settings = AppSettings(
          agentApiBaseUrl: 'https://example.invalid/v1',
          agentApiModel: 'fixture');
    final controller = UxController(app: app)
      ..workspace = storage.fixture
      ..loaded = true
      ..sending = true
      ..pendingPermission = AgentPermissionRequest(
          id: 'approval',
          conversationId: 'chat-a',
          tool: 'langbai_generate_image',
          title: '生图',
          arguments: {
            'positivePrompt': '1girl, rain',
            'model': 'nai-diffusion-5-full',
            'width': 832,
            'height': 1216,
            'steps': 28,
            'count': 1,
            'estimatedAnlas': 0
          });
    final key = GlobalKey();
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(
            theme: ThemeData(
                useMaterial3: true,
                colorSchemeSeed: const Color(0xff7047d8),
                fontFamily: 'UxAudit'),
            home: RepaintBoundary(
                key: key, child: StudioAgentScreen(controller: controller)))));
    await tester.pumpAndSettle();
    expect(controller.decisions, isEmpty);
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.text('确认执行'), findsOneWidget);
    await tester
        .runAsync(() => captureUx(tester, key, '06-phone-confirmation'));
    await tester.ensureVisible(find.text('修改方案'));
    await tester.tap(find.text('修改方案'));
    await tester.pumpAndSettle();
    expect(controller.decisions, ['reject']);
    expect(find.text('确认执行'), findsNothing);
    expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        isNotEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    controller.dispose();
  });
  testWidgets(
      'first setup has actionable configuration and rejects invalid addresses without losing input',
      (tester) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final app = AppState(storage: UxStorage())
      ..settings = AppSettings(agentApiBaseUrl: '', agentApiModel: '');
    final controller = UxController(app: app)
      ..workspace = AgentWorkspace(
          conversations: [AgentConversation(id: 'new', title: '新对话')],
          selectedConversationId: 'new')
      ..loaded = true;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(home: StudioAgentScreen(controller: controller))));
    await tester.pumpAndSettle();
    expect(find.text('发送'), findsNothing);
    await tester.tap(find.text('配置对话模型').first);
    await tester.pumpAndSettle();
    final fields = find.descendant(
        of: find.byType(AlertDialog), matching: find.byType(TextField));
    await tester.enterText(fields.at(0), 'file:///tmp/test');
    await tester.enterText(fields.at(1), 'my-model');
    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(tester.widget<TextField>(fields.at(1)).controller!.text, 'my-model');
    expect(find.text('请填写有效的 http(s) API 地址和模型 ID。'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    controller.dispose();
  });
  testWidgets(
      'conversation switching retains independent drafts without lifecycle errors',
      (tester) async {
    final storage = UxStorage();
    final app = AppState(storage: storage)
      ..settings = AppSettings(
          agentApiBaseUrl: 'https://example.invalid/v1',
          agentApiModel: 'fixture');
    final controller = UxController(app: app)
      ..workspace = storage.fixture
      ..loaded = true;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(home: StudioAgentScreen(controller: controller))));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'draft-a');
    controller.selectConversation('chat-b');
    await tester.pumpAndSettle();
    expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        '');
    await tester.enterText(find.byType(TextField).last, 'draft-b');
    controller.selectConversation('chat-a');
    await tester.pumpAndSettle();
    expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        'draft-a');
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    controller.dispose();
  });
  testWidgets('completed tool details are collapsed and explicitly expandable',
      (tester) async {
    final storage = UxStorage();
    final app = AppState(storage: storage)
      ..settings = AppSettings(
          agentApiBaseUrl: 'https://example.invalid/v1',
          agentApiModel: 'fixture');
    final controller = UxController(app: app)
      ..workspace = storage.fixture
      ..loaded = true;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(home: StudioAgentScreen(controller: controller))));
    await tester.pumpAndSettle();
    expect(find.text('工具过程 · 1 项'), findsOneWidget);
    expect(find.text('生图方案'), findsNothing);
    await tester.tap(find.text('工具过程 · 1 项'));
    await tester.pumpAndSettle();
    expect(find.text('生图方案'), findsWidgets);
    await tester.tap(find.text('工具过程 · 1 项'));
    await tester.pumpAndSettle();
    expect(find.text('生图方案'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
  });
  testWidgets('context controls show live usage and manual compression',
      (tester) async {
    final storage = UxStorage();
    storage.fixture.conversations.first.context = AgentContextSnapshot(
        used: 1200, limit: 8192, percent: 14.65, estimated: true);
    final app = AppState(storage: storage)
      ..settings = AppSettings(
          agentApiBaseUrl: 'https://example.invalid/v1',
          agentApiModel: 'fixture');
    final controller = UxController(app: app)
      ..workspace = storage.fixture
      ..loaded = true;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(home: StudioAgentScreen(controller: controller))));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('agent-context-control')));
    await tester.pumpAndSettle();
    expect(find.textContaining('1200 / 8192'), findsOneWidget);
    expect(find.text('压缩上下文'), findsOneWidget);
    expect(find.text('自动压缩'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
  });
  testWidgets('template picker selects saved optimize and assistant bodies',
      (tester) async {
    final storage = UxStorage();
    storage.fixture.agentTemplates = {
      'optimize': 'saved optimize',
      'assistant': 'saved assistant'
    };
    final app = AppState(storage: storage)
      ..settings = AppSettings(
          agentApiBaseUrl: 'https://example.invalid/v1',
          agentApiModel: 'fixture',
          convertPromptTemplates: {'mixed': 'saved convert'},
          reversePromptTemplates: {'mixed': 'saved reverse'});
    final controller = UxController(app: app)
      ..workspace = storage.fixture
      ..loaded = true;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(home: StudioAgentScreen(controller: controller))));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('agent-template-selector')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('应用模板'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('转换').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('提示词助手').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('加入本次操作'));
    await tester.pumpAndSettle();
    expect(find.byType(InputChip), findsOneWidget);
    expect(
        tester.widget<TextField>(find.byType(TextField).last).controller!.text,
        isEmpty);
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
  });
  testWidgets('web results expose clickable source URLs', (tester) async {
    final storage = UxStorage();
    storage.fixture.conversations.first.messages.last.tools.add(AgentToolExecution(
        id: 'web',
        name: 'langbai_search_web',
        title: '查询公开网页',
        status: 'completed',
        output:
            '{"provider":"DuckDuckGo Lite","sources":[{"title":"Example","snippet":"Public source","url":"https://example.org/source"}]}'));
    final app = AppState(storage: storage)
      ..settings = AppSettings(
          agentApiBaseUrl: 'https://example.invalid/v1',
          agentApiModel: 'fixture');
    final controller = UxController(app: app)
      ..workspace = storage.fixture
      ..loaded = true;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(home: StudioAgentScreen(controller: controller))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('工具过程 · 2 项'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('技术详情').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('技术详情').last);
    await tester.pumpAndSettle();
    expect(find.text('Example'), findsOneWidget);
    expect(find.textContaining('https://example.org/source'), findsWidgets);
    expect(
        tester
            .widget<ListTile>(find.ancestor(
                of: find.text('Example'), matching: find.byType(ListTile)))
            .onTap,
        isNotNull);
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
  });
  testWidgets('tall tablet keeps large approval actions accessible',
      (tester) async {
    tester.view.physicalSize = const Size(1024, 1024);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final storage = UxStorage();
    final app = AppState(storage: storage)
      ..settings = AppSettings(
          agentApiBaseUrl: 'https://example.invalid/v1',
          agentApiModel: 'fixture');
    final controller = UxController(app: app)
      ..workspace = storage.fixture
      ..loaded = true
      ..sending = true
      ..pendingPermission = AgentPermissionRequest(
          id: 'approval-large',
          conversationId: 'chat-a',
          tool: 'langbai_generate_image',
          title: '生图',
          arguments: {
            'positivePrompt': List.filled(100, 'rain city').join(', '),
            'model': 'nai-diffusion-5-full',
            'width': 832,
            'height': 1216,
            'steps': 28,
            'count': 1
          });
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(home: StudioAgentScreen(controller: controller))));
    await tester.pumpAndSettle();
    final tray = find.byKey(const ValueKey('agent-decision-tray'));
    expect(tester.getSize(tray).height, lessThanOrEqualTo(320));
    expect(find.text('确认执行').hitTestable(), findsOneWidget);
    expect(find.text('取消').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
  });
  testWidgets(
      'keyboard retains composer identity, focus and visible approval actions',
      (tester) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      tester.view.resetViewInsets();
    });
    for (final tool in ['langbai_generate_image', 'langbai_redraw_image']) {
      final storage = UxStorage();
      final app = AppState(storage: storage)
        ..settings = AppSettings(
            agentApiBaseUrl: 'https://example.invalid/v1',
            agentApiModel: 'fixture');
      final controller = UxController(app: app)
        ..workspace = storage.fixture
        ..loaded = true
        ..sending = true
        ..pendingPermission = AgentPermissionRequest(
            id: 'test',
            conversationId: 'chat-a',
            tool: tool,
            title: '重绘',
            arguments: {
              'positivePrompt':
                  List.filled(80, 'rain, blue coat, city street').join(', '),
              'model': 'nai-diffusion-5-full',
              'width': 832,
              'height': 1216,
              'steps': 28,
              'count': 1,
              'estimatedAnlas': 0
            });
      final key = GlobalKey();
      await tester.pumpWidget(ChangeNotifierProvider.value(
          value: app,
          child: MaterialApp(
              theme: ThemeData(
                  useMaterial3: true,
                  colorSchemeSeed: const Color(0xff7047d8),
                  fontFamily: 'UxAudit'),
              home: RepaintBoundary(
                  key: key,
                  child: StudioAgentScreen(controller: controller)))));
      await tester.pumpAndSettle();
      final input = find.byKey(const ValueKey('agent-composer-input'));
      final element = tester.element(input);
      await tester.tap(input);
      await tester.enterText(input, '保留雨夜背景\n外套换成白色');
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      await tester.pumpAndSettle();
      expect(identical(tester.element(input), element), isTrue);
      expect(tester.widget<TextField>(input).focusNode!.hasFocus, isTrue);
      expect(
          tester.widget<TextField>(input).controller!.text, contains('外套换成白色'));
      final confirm = find.text('确认执行');
      expect(confirm.hitTestable(), findsOneWidget);
      expect(tester.getBottomRight(input).dy, lessThanOrEqualTo(500));
      expect(tester.takeException(), isNull);
      expect(controller.decisions, isEmpty);
      if (tool == 'langbai_generate_image') {
        await tester
            .runAsync(() => captureUx(tester, key, '07-phone-keyboard'));
      }
      await tester.tap(find.text('取消'));
      await tester.pumpAndSettle();
      expect(controller.decisions, ['reject']);
      expect(find.byKey(const ValueKey('agent-decision-tray')), findsNothing);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      controller.dispose();
      tester.view.resetViewInsets();
    }
  });
  testWidgets(
      'switching chats restores the previous reading offset instead of jumping latest',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final storage = UxStorage();
    storage.fixture.conversations.first.messages.addAll(List.generate(
        40,
        (i) => AgentMessage(
            id: 'history-$i',
            role: 'assistant',
            content: '旧消息 $i：雨夜街头，保留人物和构图。')));
    final app = AppState(storage: storage)
      ..settings = AppSettings(
          agentApiBaseUrl: 'https://example.invalid/v1',
          agentApiModel: 'fixture');
    final controller = UxController(app: app)
      ..workspace = storage.fixture
      ..loaded = true;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(home: StudioAgentScreen(controller: controller))));
    await tester.pumpAndSettle();
    final list = find.byType(ListView).first;
    final scroll = tester.widget<ListView>(list).controller!;
    expect(scroll.offset, scroll.position.maxScrollExtent);
    await tester.drag(list, const Offset(0, 450));
    await tester.pumpAndSettle();
    final saved = scroll.offset;
    expect(saved, lessThan(scroll.position.maxScrollExtent - 100));
    controller.selectConversation('chat-b');
    await tester.pumpAndSettle();
    controller.selectConversation('chat-a');
    await tester.pumpAndSettle();
    expect(scroll.offset, closeTo(saved, 1));
    expect(find.text('回到最新'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    controller.dispose();
  });
  testWidgets(
      'incremental user drag survives assistant notifications and latest needs one tap',
      (tester) async {
    tester.view.physicalSize = const Size(411, 914);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final storage = UxStorage();
    storage.fixture.conversations.first.messages.addAll(List.generate(
        40,
        (i) => AgentMessage(
            id: 'slow-$i',
            role: 'assistant',
            content: 'Earlier message $i.\n\n${List.filled(8, 'Scrollable fixture history.').join(' ')}')));
    final app = AppState(storage: storage)
      ..settings = AppSettings(language: 'zh-CN');
    final controller = UxController(app: app)
      ..workspace = storage.fixture
      ..loaded = true;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(home: StudioAgentScreen(controller: controller))));
    await tester.pumpAndSettle();
    final list = find.byType(ListView).first;
    final scroll = tester.widget<ListView>(list).controller!;
    final start = scroll.offset;
    final bounds = tester.getRect(list);
    final gesture =
        await tester.startGesture(Offset(bounds.center.dx, bounds.top + 80));
    await gesture.moveBy(const Offset(0, 24));
    await tester.pump(const Duration(milliseconds: 16));
    await gesture.moveBy(const Offset(0, 8));
    await tester.pump(const Duration(milliseconds: 16));
    final early = scroll.offset;
    // Incoming stream chunks/configuration refreshes must not cancel a human drag.
    controller.notifyListeners();
    await tester.pump(const Duration(milliseconds: 16));
    final notified = scroll.offset;
    for (var i = 0; i < 22; i++) {
      await gesture.moveBy(const Offset(0, 8));
      await tester.pump(const Duration(milliseconds: 16));
    }
    final during = scroll.offset;
    await gesture.up();
    await tester.pumpAndSettle();
    debugPrint(
        'SCROLL_PROBE start=$start early=$early notified=$notified during=$during after=${scroll.offset} max=${scroll.position.maxScrollExtent}');
    expect(during, lessThan(start - 100),
        reason:
            'An accepted incremental drag must keep its controller after notification.');
    expect(find.text('回到最新'), findsOneWidget);
    await tester.tap(find.text('回到最新'));
    await tester.pumpAndSettle();
    expect(scroll.offset, closeTo(scroll.position.maxScrollExtent, 1));
    expect(find.text('回到最新'), findsNothing);
    controller.selectConversation('chat-b');
    await tester.pumpAndSettle();
    controller.selectConversation('chat-a');
    await tester.pumpAndSettle();
    expect(scroll.offset, closeTo(scroll.position.maxScrollExtent, 1));
    expect(find.text('回到最新'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    controller.dispose();
  });
}

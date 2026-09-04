import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/agent_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';

class _AgentScreenStorage extends Storage {
  AgentWorkspace workspace = AgentWorkspace();
  Set<String> permissions = <String>{};

  @override
  Future<AgentWorkspace> getAgentWorkspace() async => workspace;

  @override
  Future<void> setAgentWorkspace(AgentWorkspace value) async {
    workspace = value;
  }

  @override
  Future<Set<String>> getAgentAlwaysAllowedTools() async => permissions;

  @override
  Future<void> setAgentAlwaysAllowedTools(Set<String> value) async {
    permissions = Set<String>.from(value);
  }

  @override
  Future<String?> getAgentApiKey() async => '';
}

Widget _appFor(
  Size size, {
  Brightness brightness = Brightness.light,
  TextScaler textScaler = TextScaler.noScaling,
  bool disableAnimations = false,
}) {
  final storage = _AgentScreenStorage();
  final app = AppState(storage: storage)
    ..settings = AppSettings(language: 'zh-CN');
  return MediaQuery(
    data: MediaQueryData(
      size: size,
      textScaler: textScaler,
      disableAnimations: disableAnimations,
    ),
    child: ChangeNotifierProvider<AppState>.value(
      value: app,
      child: MaterialApp(
        theme: ThemeData(
          brightness: brightness,
          colorSchemeSeed: const Color(0xff7047eb),
        ),
        home: const Scaffold(body: AgentScreen()),
      ),
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('phone layout exposes tavern chat and character library',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(_appFor(const Size(390, 844)));
    await tester.pumpAndSettle();
    expect(find.textContaining('以你的身份说点什么…'), findsOneWidget);
    expect(find.text('软件智能生图'), findsWidgets);
    expect(tester.takeException(), isNull);

    await tester.tap(find.byIcon(Icons.people_alt_outlined).first);
    await tester.pumpAndSettle();
    expect(find.text('酒馆AI生图'), findsOneWidget);
    expect(find.text('新建角色'), findsWidgets);
    expect(find.byTooltip('导入角色卡'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tablet and wide layouts render without overflow',
      (tester) async {
    for (final size in const [Size(820, 1000), Size(1280, 900)]) {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      await tester.pumpWidget(_appFor(size));
      await tester.pumpAndSettle();
      expect(find.textContaining('以你的身份说点什么…'), findsOneWidget);
      expect(find.text('软件智能生图'), findsWidgets);
      if (size.width >= 1080) {
        expect(find.text('酒馆AI生图'), findsOneWidget);
        expect(find.text('模型'), findsWidgets);
        expect(find.text('场景生图'), findsWidgets);
      }
      expect(tester.takeException(), isNull,
          reason: '${size.width}x${size.height}');
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    }
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  testWidgets('small, landscape, dark and reduced-motion layouts stay operable',
      (tester) async {
    for (final scenario in const [
      (Size(375, 812), Brightness.light, TextScaler.linear(1.3), true),
      (Size(800, 360), Brightness.dark, TextScaler.noScaling, false),
      (Size(800, 1280), Brightness.dark, TextScaler.noScaling, true),
    ]) {
      tester.view.physicalSize = scenario.$1;
      tester.view.devicePixelRatio = 1;
      await tester.pumpWidget(_appFor(
        scenario.$1,
        brightness: scenario.$2,
        textScaler: scenario.$3,
        disableAnimations: scenario.$4,
      ));
      await tester.pumpAndSettle();
      expect(find.text('软件智能生图'), findsWidgets);
      expect(find.textContaining('以你的身份说点什么…'), findsOneWidget);
      expect(tester.takeException(), isNull,
          reason:
              '${scenario.$1.width}x${scenario.$1.height} ${scenario.$2} scale ${scenario.$3}');
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    }
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

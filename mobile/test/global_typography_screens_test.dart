import 'package:flutter/material.dart';
import 'package:novelai_mobile/ui/global_typography.dart';
import 'package:flutter_test/flutter_test.dart';
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
      child: MaterialApp(theme:withUiFont(StudioTheme.light().copyWith(platform:reason.contains('iOS')||reason.contains('iPad')?TargetPlatform.iOS:TargetPlatform.android),'serif'),builder:(context,child)=>UiTypographyScope(family:'serif',child:MediaQuery(data:MediaQuery.of(context).copyWith(textScaler:const StudioTextScaler(TextScaler.linear(1.3),2)),child:child!)),home:screen),
    ),
  );
  await tester.pump();
  expect(tester.takeException(), isNull, reason: reason);
}

void main() {
  for (final target in <(String, Size)>[
    
    ('compact phone', const Size(360, 800)),
    
    ('landscape phone', const Size(800, 360)),
    ('portrait tablet', const Size(800, 1280)),
    ('iOS phone',const Size(390,844)),
    ('iPad portrait',const Size(768,1024)),
    ('iPad landscape',const Size(1024,768)),
    
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

}

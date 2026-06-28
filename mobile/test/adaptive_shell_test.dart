import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/studio_shell.dart';

const _destinations = [
  StudioDestination(
      label: '生成', icon: Icons.add, selectedIcon: Icons.add_circle),
  StudioDestination(
      label: '重绘', icon: Icons.brush_outlined, selectedIcon: Icons.brush),
  StudioDestination(
      label: '超分', icon: Icons.zoom_out_map, selectedIcon: Icons.zoom_out_map),
  StudioDestination(
      label: '后期', icon: Icons.tune_outlined, selectedIcon: Icons.tune),
  StudioDestination(
      label: '反推',
      icon: Icons.visibility_outlined,
      selectedIcon: Icons.visibility),
  StudioDestination(
      label: '转换',
      icon: Icons.translate_outlined,
      selectedIcon: Icons.translate),
  StudioDestination(
      label: '图库', icon: Icons.photo_outlined, selectedIcon: Icons.photo),
  StudioDestination(
      label: '设置', icon: Icons.settings_outlined, selectedIcon: Icons.settings),
];

Widget _app() => MaterialApp(
      home: StudioAdaptiveShell(
        selectedIndex: 0,
        onDestinationSelected: (_) {},
        destinations: _destinations,
        pages: List.generate(
            8,
            (index) =>
                ColoredBox(color: Colors.white, child: Text('page-$index'))),
      ),
    );

void main() {
  test('window classes use stable phone and tablet breakpoints', () {
    expect(StudioBreakpoints.classify(599), StudioWindowClass.phone);
    expect(StudioBreakpoints.classify(600), StudioWindowClass.tablet);
    expect(StudioBreakpoints.classify(1179), StudioWindowClass.tablet);
    expect(StudioBreakpoints.classify(1180), StudioWindowClass.wideTablet);
  });

  testWidgets('phone uses compact bottom navigation', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_app());

    expect(
        find.byKey(const ValueKey('studio-phone-navigation')), findsOneWidget);
    expect(
        find.byKey(const ValueKey('studio-tablet-navigation')), findsNothing);
    expect(find.text('More'), findsOneWidget);
  });

  testWidgets('tablet uses the complete navigation rail', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1280, 800);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_app());

    expect(
        find.byKey(const ValueKey('studio-tablet-navigation')), findsOneWidget);
    expect(find.byKey(const ValueKey('studio-phone-navigation')), findsNothing);
  });
}

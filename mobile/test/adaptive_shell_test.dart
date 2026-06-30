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

Widget _focusApp(FocusNode focusNode) => MaterialApp(
      home: StudioAdaptiveShell(
        selectedIndex: 0,
        onDestinationSelected: (_) {},
        destinations: _destinations,
        pages: [
          Scaffold(body: Center(child: TextField(focusNode: focusNode))),
          ...List.generate(
            7,
            (index) =>
                ColoredBox(color: Colors.white, child: Text('page-$index')),
          ),
        ],
      ),
    );

void main() {
  test('window classes use stable phone and tablet breakpoints', () {
    expect(StudioBreakpoints.classify(const Size(390, 844)),
        StudioWindowClass.phone);
    expect(StudioBreakpoints.classify(const Size(844, 390)),
        StudioWindowClass.phone);
    expect(StudioBreakpoints.classify(const Size(600, 800)),
        StudioWindowClass.tablet);
    expect(StudioBreakpoints.classify(const Size(1179, 820)),
        StudioWindowClass.tablet);
    expect(StudioBreakpoints.classify(const Size(1180, 820)),
        StudioWindowClass.wideTablet);
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

  testWidgets('landscape phone still uses compact bottom navigation',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(844, 390);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_app());

    expect(
        find.byKey(const ValueKey('studio-phone-navigation')), findsOneWidget);
    expect(
        find.byKey(const ValueKey('studio-tablet-navigation')), findsNothing);
  });

  testWidgets('phone navigation dismisses focused keyboard field',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    final focusNode = FocusNode();
    addTearDown(focusNode.dispose);

    await tester.pumpWidget(_focusApp(focusNode));
    await tester.showKeyboard(find.byType(TextField));
    expect(focusNode.hasFocus, isTrue);

    await tester.tap(find.byIcon(Icons.brush_outlined));
    await tester.pumpAndSettle();

    expect(focusNode.hasFocus, isFalse);
  });

  testWidgets('opening More dismisses focused keyboard field', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    final focusNode = FocusNode();
    addTearDown(focusNode.dispose);

    await tester.pumpWidget(_focusApp(focusNode));
    await tester.showKeyboard(find.byType(TextField));
    expect(focusNode.hasFocus, isTrue);

    await tester.tap(find.byIcon(Icons.apps_outlined));
    await tester.pumpAndSettle();

    expect(focusNode.hasFocus, isFalse);
    expect(find.text('More'), findsWidgets);
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

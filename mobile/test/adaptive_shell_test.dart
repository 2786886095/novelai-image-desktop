import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/studio_shell.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

const _destinations = [
  StudioDestination(
      label: '生成', icon: Icons.add, selectedIcon: Icons.add_circle),
  StudioDestination(
      label: '重绘', icon: Icons.brush_outlined, selectedIcon: Icons.brush),
  StudioDestination(
      label: '图像后期', icon: Icons.tune_outlined, selectedIcon: Icons.tune),
  StudioDestination(
      label: '反推',
      icon: Icons.visibility_outlined,
      selectedIcon: Icons.visibility),
  StudioDestination(
      label: '转换',
      icon: Icons.translate_outlined,
      selectedIcon: Icons.translate),
  StudioDestination(
      label: '原数据',
      icon: Icons.data_object_outlined,
      selectedIcon: Icons.data_object),
  StudioDestination(
      label: '工具', icon: Icons.widgets_outlined, selectedIcon: Icons.widgets),
  StudioDestination(
      label: '预设',
      icon: Icons.collections_bookmark_outlined,
      selectedIcon: Icons.collections_bookmark),
  StudioDestination(
      label: '在线画廊', icon: Icons.public_outlined, selectedIcon: Icons.public),
  StudioDestination(
      label: '酒馆AI生图',
      icon: Icons.local_fire_department_outlined,
      selectedIcon: Icons.local_fire_department_rounded),
  StudioDestination(
      label: '图库',
      icon: Icons.photo_library_outlined,
      selectedIcon: Icons.photo_library),
  StudioDestination(
      label: '记录', icon: Icons.receipt_outlined, selectedIcon: Icons.receipt),
  StudioDestination(
      label: '设置', icon: Icons.settings_outlined, selectedIcon: Icons.settings),
];

Widget _app() => MaterialApp(
      home: StudioAdaptiveShell(
        selectedIndex: 0,
        onDestinationSelected: (_) {},
        destinations: _destinations,
        pages: List.generate(
            _destinations.length,
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
            _destinations.length - 1,
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
    expect(find.text('预设'), findsOneWidget);
    final nav = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(nav.destinations, hasLength(5));
    expect(find.byType(AnimatedOpacity), findsNWidgets(_destinations.length));
    final transitions =
        tester.widgetList<AnimatedOpacity>(find.byType(AnimatedOpacity));
    expect(
        transitions.every((transition) =>
            transition.duration == AppMotion.standard &&
            transition.curve == AppMotion.easeOut),
        isTrue);
    expect(transitions.where((transition) => transition.opacity == 1),
        hasLength(1));
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

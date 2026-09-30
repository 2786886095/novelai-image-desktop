import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/studio_shell.dart';

void main() {
  test('mobile navigation default preserves existing phone shortcuts', () {
    expect(StudioAdaptiveShell.normalizeDestinationOrder(null, 15).take(4),
        [0, 1, 5, 7]);
  });

  test('mobile navigation accepts user order and appends new destinations', () {
    expect(StudioAdaptiveShell.normalizeDestinationOrder([9, 3, 0], 5),
        [3, 0, 1, 2, 4]);
    expect(StudioAdaptiveShell.normalizeDestinationOrder([4, 1, 0], 6),
        [4, 1, 0, 5, 2, 3]);
  });

  testWidgets('phone reorder entry saves the chosen order without changing page ids', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    List<int>? saved;
    final destinations = List.generate(9, (index) => StudioDestination(
      label: 'Tab $index', icon: Icons.circle_outlined, selectedIcon: Icons.circle));
    await tester.pumpWidget(MaterialApp(home: StudioAdaptiveShell(
      selectedIndex: 0, onDestinationSelected: (_) {}, destinations: destinations,
      pages: List.generate(9, (index) => Text('Page $index')),
      onDestinationOrderChanged: (order) => saved = order)));
    final nav = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(nav.destinations.cast<NavigationDestination>().map((item) => item.label).take(4),
        ['Tab 0', 'Tab 1', 'Tab 5', 'Tab 7']);
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reorder navigation'));
    await tester.pumpAndSettle();
    expect(find.byType(ReorderableListView), findsOneWidget);
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(saved!.take(4), [0, 1, 5, 7]);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/character_preset_bar.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/ui/character_editing.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('reorder retains identity, blank text and coordinates', () {
    final a = CharCaptionItem(prompt: 'alice', x: 0, y: 1, useCoords: true),
        b = CharCaptionItem(prompt: '', negativePrompt: 'red');
    final items = [a, b];
    final next = reorderCharacters(items, 0, 1);
    expect(next, [b, a]);
    expect(identical(next[1], a), isTrue);
    expect(next[1].x, 0);
    expect(reorderCharacters(items, 0, 9), same(items));
  });
  testWidgets('save dialog can save the second character only', (tester) async {
    final s = AppState();
    addTearDown(s.dispose);
    s.settings.language = 'en-US';
    s.extras.charCaptions = [
      CharCaptionItem(prompt: 'alice'),
      CharCaptionItem(prompt: 'bob', negativePrompt: 'hat')
    ];
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: s,
        child: const MaterialApp(home: Scaffold(body: CharacterPresetBar()))));
    await tester.tap(find.text('Save to prompt presets'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('2 · bob'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), 'Bob');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    final saved = s.settings.positivePromptPresets.single.toJson();
    expect(s.settings.characterPromptPresets, isEmpty);
    expect(saved['name'], 'Bob');
    expect((saved['captions'] as List).length, 1);
    expect((saved['captions'] as List).single['prompt'], 'bob');
    expect((saved['captions'] as List).single['negativePrompt'], 'hat');
  });
  testWidgets('collapse animates both directions and retains field state',
      (tester) async {
    var open = true;
    late StateSetter change;
    await tester
        .pumpWidget(MaterialApp(home: StatefulBuilder(builder: (context, set) {
      change = set;
      return Scaffold(
          body: StudioCollapse(
              open: open,
              child: const SizedBox(height: 200, child: TextField())));
    })));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'kept');
    change(() => open = false);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    final height = tester.getSize(find.byType(StudioCollapse)).height;
    expect(height, greaterThan(0));
    expect(height, lessThan(200));
    await tester.pumpAndSettle();
    expect(tester.getSize(find.byType(StudioCollapse)).height, 0);
    change(() => open = true);
    await tester.pumpAndSettle();
    expect(find.text('kept'), findsOneWidget);
  });
  testWidgets('marker dragging previews locally then commits on release',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 2800);
    addTearDown(tester.view.reset);
    final s = AppState();
    addTearDown(s.dispose);
    s.extras.charCaptions = [
      CharCaptionItem(prompt: 'alice', x: .3, y: .3, useCoords: true)
    ];
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: s, child: const MaterialApp(home: GenerateScreen())));
    await tester.pumpAndSettle();
    final marker = find.byKey(const ValueKey('character-position-marker-0'));
    await tester.scrollUntilVisible(marker, 400,
        scrollable: find.byType(Scrollable).first, maxScrolls: 12);
    await tester.pumpAndSettle();
    var notifications = 0;
    s.addListener(() => notifications++);
    final gesture = await tester.startGesture(tester.getCenter(marker));
    for (var i = 0; i < 8; i++) {
      await gesture.moveBy(const Offset(3, 2));
      await tester.pump();
    }
    expect(s.extras.charCaptions.single.x, .3);
    expect(notifications, 0);
    await gesture.up();
    await tester.pumpAndSettle();
    expect(s.extras.charCaptions.single.x, greaterThan(.3));
    expect(notifications, 1);
  });
  testWidgets('drag handle reorders through real pointer gestures',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 2800);
    addTearDown(tester.view.reset);
    final s = AppState();
    addTearDown(s.dispose);
    s.settings.language = 'en-US';
    final a = CharCaptionItem(prompt: 'alice'),
        b = CharCaptionItem(prompt: 'bob');
    s.extras.charCaptions = [a, b];
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: s, child: const MaterialApp(home: GenerateScreen())));
    await tester.pumpAndSettle();
    final handles = find.byType(ReorderableDelayedDragStartListener);
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey("character-sort-list")), 400,
        scrollable: find.byType(Scrollable).first, maxScrolls: 12);
    await tester.pumpAndSettle();
    final start = tester.getCenter(handles.first);
    final gesture = await tester.startGesture(start);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await gesture.moveBy(const Offset(0, 24));
    await tester.pump(const Duration(milliseconds: 300));
    await gesture.moveTo(
        tester.getBottomRight(find.byType(ReorderableDelayedDragStartListener).last) + const Offset(0, 90));
    await tester.pump(const Duration(milliseconds: 400));
    await gesture.up();
    await tester.pumpAndSettle();
    expect(s.extras.charCaptions, [b, a]);
    expect(find.text('Sync positions'), findsOneWidget);
  });
  testWidgets('reorder exposes both choices and restores collapse state',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 2800);
    addTearDown(tester.view.reset);
    final s = AppState();
    addTearDown(s.dispose);
    s.settings.language = 'en-US';
    final a = CharCaptionItem(prompt: 'alice', x: .2, y: .3, useCoords: true),
        b = CharCaptionItem(prompt: 'bob', x: .8, y: .7, useCoords: true);
    s.extras.charCaptions = [a, b];
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: s, child: const MaterialApp(home: GenerateScreen())));
    await tester.pumpAndSettle();
    final list = find.byKey(const ValueKey("character-sort-list"));
    await tester.scrollUntilVisible(list, 400,
        scrollable: find.byType(Scrollable).first, maxScrolls: 12);
    await tester.pumpAndSettle();
    final toggle = find.byKey(const ValueKey('character-card-toggle-1'));
    await tester.ensureVisible(toggle);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    await tester.ensureVisible(list);
    await tester.pumpAndSettle();
    final gesture = await tester.startGesture(
        tester.getCenter(find.byType(ReorderableDelayedDragStartListener).first));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await gesture.moveBy(const Offset(0, 24));
    await tester.pumpAndSettle();
    expect(
        tester
            .widgetList<StudioCollapse>(find.byType(StudioCollapse))
            .where((c) => c.instant)
            .length,
        greaterThanOrEqualTo(2));
    await gesture.moveTo(
        tester.getBottomRight(find.byType(ReorderableDelayedDragStartListener).last) + const Offset(0, 90));
    await tester.pump();
    await gesture.up();
    await tester.pumpAndSettle();
    expect(s.extras.charCaptions, [b, a]);
    expect(a.x, .2);
    expect(find.text('Sync positions'), findsOneWidget);
    expect(find.text('Keep positions'), findsOneWidget);
    final restored = tester
        .widgetList<StudioCollapse>(
            find.descendant(of: list, matching: find.byType(StudioCollapse)))
        .map((c) => c.open)
        .toList();
    expect(restored, [false, true]);
    await tester.ensureVisible(find.text('Sync positions'));
    await tester.tap(find.text('Sync positions'));
    await tester.pumpAndSettle();
    expect(b.x, .2);
    expect(a.x, .8);
    expect(b.prompt, 'bob');
  });
}

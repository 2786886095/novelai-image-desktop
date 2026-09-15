import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/studio_dropdown.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:novelai_mobile/ui/character_editing.dart';
import 'package:novelai_mobile/models/nai_models.dart';

void main() {
  test('shared timings and reduced motion survive settings roundtrip', () {
    expect(AppMotion.disclosureOpen.inMilliseconds, 160);
    expect(AppMotion.disclosureClose.inMilliseconds, 120);
    expect(
        AppSettings.fromJson(AppSettings(reduceMotion: true).toJson())
            .reduceMotion,
        isTrue);
  });
  testWidgets(
      'menu has intermediate height, keyboard selection and reverse exit',
      (t) async {
    String? value = 'a';
    await t.pumpWidget(MaterialApp(
        theme: StudioTheme.light(),
        home: Scaffold(
            body: Padding(
                padding: const EdgeInsets.all(24),
                child: StatefulBuilder(
                    builder: (c, set) => StudioDropdownButtonFormField<String>(
                        value: value,
                        isExpanded: true,
                        decoration: const InputDecoration(labelText: 'Model'),
                        items: const [
                          DropdownMenuItem(value: 'a', child: Text('Alpha')),
                          DropdownMenuItem(value: 'b', child: Text('Beta'))
                        ],
                        onChanged: (v) => set(() => value = v)))))));
    await t.tap(find.text('Alpha'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 70));
    final transition = find.byType(SizeTransition);
    expect(transition, findsOneWidget);
    final middle = t.getSize(transition).height;
    expect(middle, greaterThan(0));
    await t.pumpAndSettle();
    expect(t.getSize(transition).height, greaterThan(middle));
    await t.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await t.sendKeyEvent(LogicalKeyboardKey.enter);
    await t.pump();
    expect(value, 'b');
    await t.pump(const Duration(milliseconds: 70));
    expect(find.byType(SizeTransition), findsOneWidget);
    await t.pumpAndSettle();
    expect(find.byType(SizeTransition), findsNothing);
    expect(find.text('Beta'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('barrier cancel preserves value and reopening stays usable',
      (t) async {
    var changes = 0;
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Padding(
                padding: const EdgeInsets.all(60),
                child: StudioDropdownButton<String>(
                    value: 'a',
                    items: const [
                      DropdownMenuItem(value: 'a', child: Text('Alpha'))
                    ],
                    onChanged: (_) => changes++)))));
    await t.tap(find.text('Alpha'));
    await t.pumpAndSettle();
    await t.tapAt(const Offset(10, 10));
    await t.pumpAndSettle();
    expect(changes, 0);
    await t.tap(find.text('Alpha'));
    await t.pumpAndSettle();
    expect(find.text('Alpha'), findsNWidgets(2));
    await t.sendKeyEvent(LogicalKeyboardKey.escape);
    await t.pumpAndSettle();
    expect(changes, 0);
  });
  testWidgets('collapse reverses smoothly and keeps edited state', (t) async {
    var open = true;
    late StateSetter set;
    await t.pumpWidget(
        MaterialApp(home: Scaffold(body: StatefulBuilder(builder: (c, s) {
      set = s;
      return StudioCollapse(
          open: open, child: const SizedBox(height: 200, child: TextField()));
    }))));
    await t.enterText(find.byType(TextField), 'keep');
    set(() => open = false);
    await t.pump();
    await t.pump(const Duration(milliseconds: 70));
    final mid = t.getSize(find.byType(StudioCollapse)).height;
    expect(mid, lessThan(200));
    expect(mid, greaterThan(0));
    set(() => open = true);
    await t.pump();
    await t.pumpAndSettle();
    expect(find.text('keep'), findsOneWidget);
    expect(t.getSize(find.byType(StudioCollapse)).height, 200);
  });
  testWidgets('reduced motion menu skips height transition', (t) async {
    await t.pumpWidget(MaterialApp(
        builder: (c, child) => MediaQuery(
            data: MediaQuery.of(c).copyWith(disableAnimations: true),
            child: child!),
        home: Scaffold(
            body: StudioDropdownButton<String>(
                value: 'a',
                items: const [
                  DropdownMenuItem(value: 'a', child: Text('Alpha'))
                ],
                onChanged: (_) {}))));
    await t.tap(find.text('Alpha'));
    await t.pumpAndSettle();
    expect(find.byType(SizeTransition), findsOneWidget);
    await t.sendKeyEvent(LogicalKeyboardKey.escape);
    await t.pump();
    await t.pump();
    expect(find.byType(SizeTransition), findsNothing);
  });
}

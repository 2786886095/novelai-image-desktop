import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/studio_page_motion.dart';

void main() {
  testWidgets(
      'interrupted forward/back motion preserves one editor and never exposes inactive actions',
      (t) async {
    final key = GlobalKey<MotionHarnessState>();
    await t.pumpWidget(MotionHarness(key: key));
    await t.pumpAndSettle();
    expect(t.getSemantics(find.byType(Scaffold)).toStringDeep(), contains('home-action'));
    key.currentState!.select(true);
    await t.pump();
    await t.pump(const Duration(milliseconds: 80));
    final x = t.getTopLeft(find.byKey(const ValueKey('editor'))).dx;
    expect(x, greaterThan(0));
    expect(t.getSemantics(find.byType(Scaffold)).toStringDeep(), isNot(contains('home-action')));
    key.currentState!.select(false);
    await t.pump();
    await t.pump(const Duration(milliseconds: 25));
    key.currentState!.select(true);
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('editor')), 'retained');
    key.currentState!.select(false);
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('editor')), findsNothing);
    expect(find.byKey(const ValueKey('editor'), skipOffstage: false),
        findsOneWidget);
    key.currentState!.select(true);
    await t.pumpAndSettle();
    expect(
        t
            .widget<TextField>(find.byKey(const ValueKey('editor')))
            .controller!
            .text,
        'retained');
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox.shrink());
  });
  for (final viaSystem in [false, true]) {
    testWidgets(
        'reduced motion snaps during an active transition viaSystem=$viaSystem',
        (t) async {
      final key = GlobalKey<MotionHarnessState>();
      await t.pumpWidget(MotionHarness(key: key));
      await t.pumpAndSettle();
      key.currentState!.select(true);
      await t.pump();
      await t.pump(const Duration(milliseconds: 50));
      expect(t.getTopLeft(find.byKey(const ValueKey('editor'))).dx,
          greaterThan(0));
      key.currentState!.reduce(viaSystem);
      await t.pump();
      expect(t.getTopLeft(find.byKey(const ValueKey('editor'))).dx, 0);
      key.currentState!.select(false);
      await t.pump();
      expect(find.byKey(const ValueKey('editor')), findsNothing);
      expect(t.takeException(), isNull);
      await t.pumpWidget(const SizedBox.shrink());
    });
  }
  testWidgets(
      'pointer feedback starts before tap recognition, cancels on scroll and cancellation, action once only',
      (t) async {
    var actions = 0;
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: StudioPressFeedback(
                child: ListTile(
                    title: const Text('row'), onTap: () => actions++)))));
    final g = await t.startGesture(t.getCenter(find.text('row')));
    await t.pump();
    expect(t.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity, 1);
    expect(actions, 0);
    await g.moveBy(const Offset(0, 30));
    await t.pump();
    expect(t.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity, 0);
    await g.cancel();
    await t.pumpAndSettle();
    expect(actions, 0);
    await t.tap(find.text('row'));
    await t.pumpAndSettle();
    expect(actions, 1);
    expect(t.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity, 0);
    await t.pumpWidget(const SizedBox.shrink());
  });
}

class MotionHarness extends StatefulWidget {
  const MotionHarness({super.key});
  @override
  State<MotionHarness> createState() => MotionHarnessState();
}

class MotionHarnessState extends State<MotionHarness> {
  bool selected = false, system = false, explicit = false;
  void select(bool v) => setState(() => selected = v);
  void reduce(bool viaSystem) => setState(() {
        system = viaSystem;
        explicit = !viaSystem;
      });
  @override
  Widget build(BuildContext context) => MaterialApp(
      builder: (c, child) => MediaQuery(
          data: MediaQuery.of(c).copyWith(disableAnimations: system),
          child: child!),
      home: Scaffold(
          body: ClipRect(
              child: Stack(fit: StackFit.expand, children: [
        StudioRetainedPageMotion(
            active: !selected,
            reduceMotion: explicit,
            child: Semantics(
                label: 'home-action',
                child:
                    TextButton(onPressed: () {}, child: const Text('home')))),
        StudioRetainedPageMotion(
            active: selected,
            reduceMotion: explicit,
            fade: false,
            enterOffset: const Offset(1, 0),
            child: const Editor())
      ]))));
}

class Editor extends StatefulWidget {
  const Editor({super.key});
  @override
  State<Editor> createState() => _EditorState();
}

class _EditorState extends State<Editor> {
  final c = TextEditingController();
  @override
  void dispose() {
    c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Material(
      color: Colors.white,
      child: TextField(key: const ValueKey('editor'), controller: c));
}

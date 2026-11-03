import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/settings/android_settings_hub.dart';
import 'package:novelai_mobile/screens/settings/settings_search_index.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/ui/android/android_studio_shell.dart';
import 'package:novelai_mobile/ui/studio_shell.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

final observations = <String, Object?>{};
const editorKey = ValueKey('motion-fixture-editor');
final captureKey = GlobalKey();
Future<List<int>> capture(WidgetTester tester, String name) async {
  final boundary =
      captureKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  return (await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = (await image.toByteData(format: ui.ImageByteFormat.png))!
        .buffer
        .asUint8List();
    final dir = Platform.environment['MOTION_SCREENSHOTS'];
    if (dir != null) {
      Directory(dir).createSync(recursive: true);
      File('$dir/$name.png').writeAsBytesSync(bytes);
    }
    image.dispose();
    return bytes;
  }))!;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final font = FontLoader('MotionZh')
      ..addFont(
          rootBundle.load('assets/ui-fonts/LXGWMarkerGothic-Regular.ttf'));
    await font.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });
  tearDownAll(() {
    // Literal behavioral evidence marker for the external transaction probe.
    // ignore: avoid_print
    print('MOTION_OBS ${jsonEncode(observations)}');
  });
  testWidgets(
      'settings tap feedback, forward and reverse intermediate frames retain editor',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const SettingsHarness());
    await tester.pumpAndSettle();
    final tile = find.byKey(const ValueKey('android-settings-category-access'));
    final before = await capture(tester, 'settings-home');
    final gesture = await tester.startGesture(tester.getCenter(tile));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 45));
    final down = await capture(tester, 'settings-pressed');
    final feedback = before.length != down.length ||
        !List.generate(before.length, (i) => before[i] == down[i])
            .every((b) => b);
    await gesture.up();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 16));
    final early = tester.getTopLeft(find.byKey(editorKey)).dx;
    await capture(tester, 'settings-enter-016ms');
    await tester.pump(const Duration(milliseconds: 80));
    final middle = tester.getTopLeft(find.byKey(editorKey)).dx;
    await capture(tester, 'settings-enter-096ms');
    await tester.pumpAndSettle();
    final settled = tester.getTopLeft(find.byKey(editorKey)).dx;
    await tester.enterText(find.byKey(editorKey), 'fictional retained draft');
    await tester.tap(find.byIcon(Icons.arrow_back));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 60));
    final reverseVisible = find.byKey(editorKey).evaluate().isNotEmpty;
    final reverse =
        reverseVisible ? tester.getTopLeft(find.byKey(editorKey)).dx : settled;
    await capture(tester, 'settings-return-060ms');
    await tester.pumpAndSettle();
    await tester.tap(tile);
    await tester.pumpAndSettle();
    final draft =
        (tester.widget<TextField>(find.byKey(editorKey))).controller!.text;
    observations['settings'] = {
      'pressFeedback': feedback,
      'earlyX': early,
      'middleX': middle,
      'settledX': settled,
      'reverseVisible': reverseVisible,
      'reverseX': reverse,
      'draftRetained': draft == 'fictional retained draft'
    };
    expect(feedback, isTrue);
    expect(early, greaterThan(middle + 1));
    expect(middle, greaterThan(settled + .5));
    expect(reverseVisible, isTrue);
    expect(reverse, greaterThan(settled + .5));
    expect(draft, 'fictional retained draft');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  for (final reduce in [true, false]) {
    testWidgets(
        'reduced motion=$reduce supports rapid return and system back without losing draft',
        (tester) async {
      await tester.pumpWidget(SettingsHarness(reduce: reduce));
      await tester.pumpAndSettle();
      await tester
          .tap(find.byKey(const ValueKey('android-settings-category-access')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      final x = tester.getTopLeft(find.byKey(editorKey)).dx;
      if (reduce) {
        await tester.pumpAndSettle();
        expect(tester.getTopLeft(find.byKey(editorKey)).dx, x);
      }
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('android-settings-category-access')),
          findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
  for (final size in [
    const Size(320, 640),
    const Size(800, 360),
    const Size(1000, 800)
  ]) {
    testWidgets('settings transition bounds $size large text with keyboard',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(const SettingsHarness(textScale: 1.5));
      await tester.pumpAndSettle();
      await tester.ensureVisible(
          find.byKey(const ValueKey('android-settings-category-access')));
      await tester.pumpAndSettle();
      await tester
          .tap(find.byKey(const ValueKey('android-settings-category-access')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      tester.view.viewInsets = const FakeViewPadding(bottom: 130);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
  testWidgets(
      'Android first destination visit slides while fixed chrome stays still and drafts survive',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const ShellHarness());
    await tester.pumpAndSettle();
    final bar = find.byKey(const ValueKey('compact-workbench-bar'));
    final nav = find.byKey(const ValueKey('android-main-navigation'));
    final barBefore = tester.getRect(bar), navBefore = tester.getRect(nav);
    await tester.enterText(
        find.byKey(const ValueKey('shell-editor-0')), 'draft');
    await tester.tap(find.byKey(const ValueKey('android-group-1')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 16));
    final newPage = find.byKey(const ValueKey('shell-editor-10'));
    final early = tester.getTopLeft(newPage).dx;
    await tester.pump(const Duration(milliseconds: 80));
    final middle = tester.getTopLeft(newPage).dx;
    final chromeStill =
        barBefore == tester.getRect(bar) && navBefore == tester.getRect(nav);
    await tester.pumpAndSettle();
    final settled = tester.getTopLeft(newPage).dx;
    await tester.tap(find.byKey(const ValueKey('android-group-0')));
    await tester.pumpAndSettle();
    final draft =
        (tester.widget<TextField>(find.byKey(const ValueKey('shell-editor-0'))))
            .controller!
            .text;
    observations['destination'] = {
      'earlyX': early,
      'middleX': middle,
      'settledX': settled,
      'chromeStill': chromeStill,
      'draftRetained': draft == 'draft'
    };
    expect(early, greaterThan(middle + 1));
    expect(middle, greaterThan(settled + .5));
    expect(chromeStill, isTrue);
    expect(draft, 'draft');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

class SettingsHarness extends StatefulWidget {
  final bool reduce;
  final double textScale;
  const SettingsHarness({super.key, this.reduce = false, this.textScale = 1});
  @override
  State<SettingsHarness> createState() => _SettingsHarnessState();
}

class _SettingsHarnessState extends State<SettingsHarness> {
  AndroidSettingsCategory? category;
  @override
  Widget build(BuildContext context) => MaterialApp(
      theme: androidStudioTheme(StudioTheme.light().copyWith(
          textTheme:
              StudioTheme.light().textTheme.apply(fontFamily: 'MotionZh'))),
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
              disableAnimations: widget.reduce,
              textScaler: TextScaler.linear(widget.textScale)),
          child: RepaintBoundary(key: captureKey, child: child!)),
      home: AndroidSettingsHub(
          language: 'zh-CN',
          entries: const [
            AndroidSettingsEntry(
                id: 'accounts',
                title: '虚拟账号设置',
                categories: {AndroidSettingsCategory.access},
                child: DraftEditor(
                    key: ValueKey('settings-draft'), fieldKey: editorKey)),
            AndroidSettingsEntry(
                id: 'reverse',
                title: '虚拟 AI 设置',
                categories: {AndroidSettingsCategory.ai},
                child: Text('Virtual AI fixture'))
          ],
          category: category,
          onCategoryChanged: (v) => setState(() => category = v),
          onSearchChanged: (_) {},
          accountConfigured: false,
          balance: null,
          providerConfigured: false,
          onRefreshAccount: () {}));
}

class DraftEditor extends StatefulWidget {
  final Key fieldKey;
  const DraftEditor({super.key, required this.fieldKey});
  @override
  State<DraftEditor> createState() => _DraftEditorState();
}

class _DraftEditorState extends State<DraftEditor> {
  final controller = TextEditingController();
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
              key: widget.fieldKey,
              controller: controller,
              decoration: const InputDecoration(labelText: '虚拟测试字段'))));
}

class ShellHarness extends StatefulWidget {
  const ShellHarness({super.key});
  @override
  State<ShellHarness> createState() => _ShellHarnessState();
}

class _ShellHarnessState extends State<ShellHarness> {
  int selected = 0;
  @override
  Widget build(BuildContext context) => MaterialApp(
      theme: androidStudioTheme(StudioTheme.light().copyWith(
          textTheme:
              StudioTheme.light().textTheme.apply(fontFamily: 'MotionZh'))),
      home: AndroidStudioShell(
          selectedIndex: selected,
          onDestinationSelected: (v) => setState(() => selected = v),
          destinations: List.generate(
              15,
              (i) => StudioDestination(
                  label: 'Page $i',
                  icon: Icons.circle_outlined,
                  selectedIcon: Icons.circle)),
          pages: List.generate(
              15,
              (i) => Scaffold(
                  body: DraftEditor(
                      key: ValueKey('page-$i'),
                      fieldKey: ValueKey('shell-editor-$i')))),
          language: 'zh-CN'));
}

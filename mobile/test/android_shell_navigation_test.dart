import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/android/android_destination_groups.dart';
import 'package:novelai_mobile/ui/android/android_gate.dart';
import 'package:novelai_mobile/ui/android/android_studio_shell.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/ui/studio_shell.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('all fifteen route identities occur exactly once in the five groups',
      () {
    final all = androidDestinationGroups.expand((g) => g).toList()..sort();
    expect(all, List.generate(15, (i) => i));
    expect(androidGroupDefaultDestinations, [0, 10, 9, 6, 12]);
    expect(androidOrderedGroupMembers(1, [7, 5, 8, 10, 14]), [5, 8, 10, 14]);
  });

  test('Android text tokens have independent readable light and dark contrast',
      () {
    for (final t in [LangbaiAndroidTokens.light, LangbaiAndroidTokens.dark]) {
      for (final text in [t.textPrimary, t.textSecondary]) {
        final a = text.computeLuminance(), b = t.card.computeLuminance();
        expect((a > b ? a + .05 : b + .05) / (a > b ? b + .05 : a + .05),
            greaterThanOrEqualTo(4.5));
      }
    }
  });

  testWidgets('Android gate does not select the iOS presentation',
      (tester) async {
    bool? result;
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) {
      result = isAndroidRedesign(context);
      return const SizedBox();
    })));
    expect(result, isFalse);
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) {
      result = isAndroidRedesign(context);
      return const SizedBox();
    })));
    expect(result, !const bool.fromEnvironment('LANGBAI_ANDROID_CLASSIC'));
    debugDefaultTargetPlatformOverride = null;
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('all routes are reachable and visited pages remain mounted',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final mounted = <int, int>{};
    final host = GlobalKey<_HostState>();
    await tester.pumpWidget(_Host(key: host, mounts: mounted));
    await tester.enterText(
        find.byKey(const ValueKey('input-0')), 'retained prompt');
    for (var group = 0; group < 5; group++) {
      await tester.tap(find.byKey(ValueKey('android-group-$group')));
      await tester.pump(const Duration(milliseconds: 240));
      for (final index in androidDestinationGroups[group]) {
        final chip = find.byKey(ValueKey('android-member-$index'));
        await tester.ensureVisible(chip);
        await tester.tap(chip);
        await tester.pump(const Duration(milliseconds: 240));
        expect(host.currentState!.index, index);
      }
    }
    expect(mounted.length, 15);
    expect(mounted.values.every((count) => count == 1), isTrue);
    await tester.tap(find.byKey(const ValueKey('android-group-0')));
    await tester.pump(const Duration(milliseconds: 240));
    final chip = find.byKey(const ValueKey('android-member-0'));
    await tester.ensureVisible(chip);
    await tester.tap(chip);
    await tester.pump(const Duration(milliseconds: 240));
    final field =
        tester.widget<TextField>(find.byKey(const ValueKey('input-0')));
    expect(field.controller!.text, 'retained prompt');
    expect(tester.takeException(), isNull);
  });

  testWidgets('keyboard hides outer navigation and Back returns group then Create',
      (tester) async {
    final host = GlobalKey<_HostState>();
    final mounts = <int, int>{};
    await tester.pumpWidget(_Host(key: host, mounts: mounts, keyboard: 250));
    expect(find.byKey(const ValueKey('android-main-navigation')), findsNothing);
    host.currentState!.setIndex(11);
    await tester.pump();
    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(host.currentState!.index, 12);
    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(host.currentState!.index, 0);
  });

  for (final size in [
    const Size(320, 640),
    const Size(375, 812),
    const Size(430, 932),
    const Size(800, 360),
    const Size(800, 1280),
    const Size(1280, 800)
  ]) {
    testWidgets(
        'responsive group navigation $size, large text and reduced motion',
        (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final mounts = <int, int>{};
      await tester.pumpWidget(_Host(mounts: mounts, scale: 2, language: 'en-US'));
      await tester.pump();
      expect(
          find.byKey(const ValueKey('android-studio-shell')), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    });
  }

  testWidgets('320dp member strip reveals a member selected off-screen',
      (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final host = GlobalKey<_HostState>();
    final mounts = <int, int>{};
    await tester.pumpWidget(_Host(key: host, mounts: mounts));
    // Metadata (5) is the last Gallery member; select it the way the
    // all-features catalog or a deep link does, without touching the strip.
    host.currentState!.setIndex(5);
    await tester.pumpAndSettle();
    final chip = tester.getRect(find.byKey(const ValueKey('android-member-5')));
    final apps =
        tester.getRect(find.byKey(const ValueKey('android-all-features')));
    expect(chip.left, greaterThanOrEqualTo(0));
    expect(chip.right, lessThanOrEqualTo(apps.left));
    host.currentState!.setIndex(10);
    await tester.pumpAndSettle();
    expect(
        tester.getRect(find.byKey(const ValueKey('android-member-10'))).left,
        greaterThanOrEqualTo(0));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('section card keeps trailing action at the end edge',
      (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        theme: androidStudioTheme(StudioTheme.light()),
        home: Scaffold(
            body: AndroidSectionCard(
                key: const ValueKey('card'),
                title: 'Prompts',
                icon: Icons.notes,
                trailing: IconButton(
                    key: const ValueKey('trailing'),
                    onPressed: () {},
                    icon: const Icon(Icons.search)),
                child: const SizedBox(height: 20)))));
    final card = tester.getRect(find.byKey(const ValueKey('card')));
    final action = tester.getRect(find.byKey(const ValueKey('trailing')));
    final title = tester.getRect(find.text('Prompts'));
    expect(card.right - action.right, 16);
    expect((action.center.dy - title.center.dy).abs(), lessThan(1));
    expect(action.size, const Size(48, 48));
  });
}

class _Host extends StatefulWidget {
  final Map<int, int> mounts;
  final double scale, keyboard;
  final String language;
  const _Host(
      {super.key,
      required this.mounts,
      this.scale = 1,
      this.keyboard = 0,
      this.language = 'zh-CN'});
  @override
  State<_Host> createState() => _HostState();
}

class _HostState extends State<_Host> {
  int index = 0;
  void setIndex(int next) => setState(() => index = next);
  late final pages = [
    for (var i = 0; i < 15; i++) _Page(index: i, mounts: widget.mounts)
  ];
  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: androidStudioTheme(StudioTheme.light()),
        home: Builder(
            builder: (context) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                      textScaler: TextScaler.linear(widget.scale),
                      disableAnimations: true,
                      viewInsets: EdgeInsets.only(bottom: widget.keyboard)),
                  child: AndroidStudioShell(
                    selectedIndex: index,
                    onDestinationSelected: setIndex,
                    language: widget.language,
                    pages: pages,
                    destinations: [
                      for (var i = 0; i < 15; i++)
                        StudioDestination(
                            label: 'Feature $i',
                            icon: Icons.image_outlined,
                            selectedIcon: Icons.image)
                    ],
                  ),
                )),
      );
}

class _Page extends StatefulWidget {
  final int index;
  final Map<int, int> mounts;
  const _Page({required this.index, required this.mounts});
  @override
  State<_Page> createState() => _PageState();
}

class _PageState extends State<_Page> {
  final controller = TextEditingController();
  @override
  void initState() {
    super.initState();
    widget.mounts.update(widget.index, (n) => n + 1, ifAbsent: () => 1);
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      body: SingleChildScrollView(
          child: TextField(
              key: ValueKey('input-${widget.index}'), controller: controller)));
}

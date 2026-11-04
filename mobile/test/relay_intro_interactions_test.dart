import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/screens/novelai_accounts_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

class Fixture {
  final AppState state;
  final List<MethodCall> calls;
  Fixture(this.state, this.calls);
}

Future<Fixture> mount(WidgetTester tester,
    {Size size = const Size(390, 844),
    double scale = 1,
    String language = 'zh-CN',
    bool icon = false,
    bool compact = false,
    bool success = true,
    bool reduced = false}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({});
  final state = AppState();
  state.settings.language = language;
  state.settings.reduceMotion = reduced;
  addTearDown(state.dispose);
  const channel = MethodChannel('plugins.flutter.io/url_launcher');
  final calls = <MethodCall>[];
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel,
      (call) async {
    calls.add(call);
    return success;
  });
  addTearDown(() => tester.binding.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, null));
  await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
      value: state,
      child: MaterialApp(
          theme: androidStudioTheme(StudioTheme.light()),
          builder: (c, child) => MediaQuery(
              data: MediaQuery.of(c).copyWith(
                  textScaler: TextScaler.linear(scale),
                  disableAnimations: reduced),
              child: child!),
          home: Scaffold(
              body: Center(
                  child: NovelAiRelayRecommendation(
                      iconOnly: icon, compact: compact))))));
  await tester.pumpAndSettle();
  return Fixture(state, calls);
}

final trigger = find.byKey(const ValueKey('novelai-relay-recommendation'));
final dialog = find.byKey(const ValueKey('relay-intro-dialog'));
final back = find.byKey(const ValueKey('relay-intro-back'));
final visit = find.byKey(const ValueKey('relay-intro-visit'));
Future<void> close(WidgetTester tester) async {
  await tester.tap(back);
  await tester.pumpAndSettle();
}

void main() {
  for (final language in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
    for (final size in [const Size(320, 640), const Size(844, 390)]) {
      testWidgets('introduction fits $language $size at200percent',
          (tester) async {
        final f = await mount(tester, size: size, scale: 2, language: language);
        await tester.tap(trigger);
        await tester.pumpAndSettle();
        expect(dialog, findsOneWidget);
        expect(f.calls, isEmpty);
        expect(find.text('nai.langbai.cc'), findsWidgets);
        final rect = tester.getRect(dialog);
        expect(rect.left, greaterThanOrEqualTo(0));
        expect(rect.right, lessThanOrEqualTo(size.width));
        expect(rect.top, greaterThanOrEqualTo(0));
        expect(rect.bottom, lessThanOrEqualTo(size.height));
        await close(tester);
        expect(f.calls, isEmpty);
        expect(tester.takeException(), isNull);
      });
    }
  }
  for (final variant in ['full', 'compact', 'icon']) {
    testWidgets('shared $variant entry waits for explicit choice',
        (tester) async {
      final f = await mount(tester,
          icon: variant == 'icon', compact: variant == 'compact');
      final before = jsonEncode(f.state.settings.toJson());
      await tester.tap(trigger);
      await tester.pumpAndSettle();
      expect(dialog, findsOneWidget);
      expect(f.calls, isEmpty);
      await close(tester);
      expect(f.calls, isEmpty);
      await tester.tap(trigger);
      await tester.pumpAndSettle();
      await tester.tap(visit);
      await tester.pumpAndSettle();
      expect(f.calls, hasLength(1));
      expect(
          (f.calls.single.arguments as Map)['url'], 'https://nai.langbai.cc');
      expect((f.calls.single.arguments as Map)['useWebView'], false);
      expect(jsonEncode(f.state.settings.toJson()), before);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('barrier Escape and system back never navigate externally',
      (tester) async {
    final f = await mount(tester);
    for (final method in ['barrier', 'escape', 'back']) {
      await tester.tap(trigger);
      await tester.pumpAndSettle();
      if (method == 'barrier') {
        await tester.tapAt(const Offset(2, 2));
      } else if (method == 'escape') {
        await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      } else {
        await tester.binding.handlePopRoute();
      }
      await tester.pumpAndSettle();
      expect(dialog, findsNothing);
      expect(f.calls, isEmpty);
    }
    expect(tester.takeException(), isNull);
  });
  testWidgets('rapid trigger and confirmation only launch once',
      (tester) async {
    final f = await mount(tester, icon: true);
    final button = tester.widget<IconButton>(trigger);
    button.onPressed!();
    button.onPressed!();
    await tester.pumpAndSettle();
    expect(dialog, findsOneWidget);
    expect(f.calls, isEmpty);
    final enter = tester.widget<FilledButton>(visit).onPressed!;
    enter();
    enter();
    await tester.pumpAndSettle();
    expect(f.calls, hasLength(1));
    expect(dialog, findsNothing);
    expect(find.byType(Scaffold), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'external browser failure gives feedback and allows a new attempt',
      (tester) async {
    final f = await mount(tester, success: false);
    await tester.tap(trigger);
    await tester.pumpAndSettle();
    expect(f.calls, isEmpty);
    await tester.tap(visit);
    await tester.pumpAndSettle();
    expect(f.calls, hasLength(1));
    expect(find.byType(SnackBar), findsOneWidget);
    await tester.tap(trigger);
    await tester.pumpAndSettle();
    expect(dialog, findsOneWidget);
    await close(tester);
    expect(f.calls, hasLength(1));
    expect(tester.takeException(), isNull);
  });
  testWidgets('safe default focus and closed dialog traversal', (tester) async {
    final f = await mount(tester);
    await tester.tap(trigger);
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(dialog, findsNothing);
    expect(f.calls, isEmpty);
    await tester.tap(trigger);
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(dialog, findsNothing);
    expect(f.calls, isEmpty);
  });
  testWidgets('reduced motion can return immediately', (tester) async {
    final f = await mount(tester, reduced: true);
    await tester.tap(trigger);
    await tester.pump();
    expect(dialog, findsOneWidget);
    await tester.tap(back);
    await tester.pump();
    await tester.pump();
    expect(dialog, findsNothing);
    expect(f.calls, isEmpty);
  });
}

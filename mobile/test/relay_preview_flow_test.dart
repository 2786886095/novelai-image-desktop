import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/screens/novelai_accounts_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

final captureKey = GlobalKey();
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await (FontLoader('RelayZh')
          ..addFont(
              rootBundle.load('assets/ui-fonts/LXGWMarkerGothic-Regular.ttf')))
        .load();
    await (FontLoader('MaterialIcons')
          ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf')))
        .load();
  });
  testWidgets('fixed relay introduction flow', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final state = AppState();
    state.settings.language = 'zh-CN';
    addTearDown(state.dispose);
    final before = jsonEncode(state.settings.toJson());
    const channel = MethodChannel('plugins.flutter.io/url_launcher');
    final calls = <MethodCall>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel,
        (call) async {
      calls.add(call);
      return true;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null));
    await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
        value: state,
        child: RepaintBoundary(
            key: captureKey,
            child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: androidStudioTheme(StudioTheme.light().copyWith(
                    textTheme: StudioTheme.light()
                        .textTheme
                        .apply(fontFamily: 'RelayZh'))),
                home: const Scaffold(
                    body: Center(child: NovelAiRelayRecommendation()))))));
    await tester.pumpAndSettle();
    final trigger = find.byKey(const ValueKey('novelai-relay-recommendation'));
    await tester.tap(trigger);
    await tester.pumpAndSettle();
    final shown =
        find.byKey(const ValueKey('relay-intro-dialog')).evaluate().isNotEmpty;
    final openCalls = calls.length;
    final preview = find.byKey(const ValueKey('relay-intro-preview'));
    final previewShown = preview.evaluate().isNotEmpty;
    bool? fullAspect;
    if (previewShown) {
      final image = tester.widget<Image>(preview);
      final r = tester.getRect(preview);
      fullAspect = image.fit == BoxFit.contain &&
          (r.width / r.height - 1193 / 766).abs() < .001;
      await tester.ensureVisible(preview);
      await tester.tap(preview);
      await tester.pumpAndSettle();
    }
    final afterPreview = calls.length;
    int? afterReturn, afterVisit;
    if (shown) {
      final dir = Platform.environment['RELAY_SCREENSHOTS'];
      if (dir != null) {
        final boundary = captureKey.currentContext!.findRenderObject()!
            as RenderRepaintBoundary;
        await tester.runAsync(() async {
          final image = await boundary.toImage(pixelRatio: 1.5);
          final data = await image.toByteData(format: ui.ImageByteFormat.png);
          Directory(dir).createSync(recursive: true);
          File('$dir/mobile-relay-intro.png')
              .writeAsBytesSync(data!.buffer.asUint8List());
          image.dispose();
        });
      }
      await tester.tap(find.byKey(const ValueKey('relay-intro-back')));
      await tester.pumpAndSettle();
      afterReturn = calls.length;
      await tester.tap(trigger);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('relay-intro-visit')));
      await tester.pumpAndSettle();
      afterVisit = calls.length;
    }
    final result = {
      'dialogShown': shown,
      'previewShown': previewShown,
      'fullAspect': fullAspect,
      'browserLaunchesAfterPreview': afterPreview,
      'browserLaunchesBeforeConfirm': openCalls,
      'browserLaunchesAfterReturn': afterReturn,
      'browserLaunchesAfterVisit': afterVisit,
      'settingsPreserved': jsonEncode(state.settings.toJson()) == before,
      'onlyFixedUrl': calls
          .every((c) => (c.arguments as Map)['url'] == 'https://nai.langbai.cc')
    };
    // ignore: avoid_print
    print('MOBILE_RELAY_OBS ${jsonEncode(result)}');
    expect(previewShown, true);
    expect(fullAspect, true);
    expect(afterPreview, 0);
    expect(shown, true);
    expect(openCalls, 0);
    expect(afterReturn, 0);
    expect(afterVisit, 1);
    expect(result['settingsPreserved'], true);
    expect(result['onlyFixedUrl'], true);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}

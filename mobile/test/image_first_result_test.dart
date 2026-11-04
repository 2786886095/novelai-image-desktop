import 'dart:convert';
import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

final captureKey = GlobalKey();
Future<void> capture(WidgetTester tester, String name) async {
  final dir = Platform.environment['RESULT_SCREENSHOTS'];
  if (dir == null) return;
  final boundary =
      captureKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 1.5);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    Directory(dir).createSync(recursive: true);
    File('$dir/$name.png').writeAsBytesSync(data!.buffer.asUint8List());
    image.dispose();
  });
}

class FixtureState extends AppState {
  void choose(HistoryItem item) {
    current = item;
    workbenchImage = null;
    notifyListeners();
  }

  void setBusy(bool value) {
    busy = value;
    notifyListeners();
  }

  @override
  Future<void> setWorkbenchFromHistory(HistoryItem item) async {
    choose(item);
  }
}

Future<FixtureState> mount(
    WidgetTester tester, Size size, int width, int height,
    {double scale = 1,
    String language = 'zh-CN',
    TargetPlatform platform = TargetPlatform.android}) async {
  final old = debugDefaultTargetPlatformOverride;
  debugDefaultTargetPlatformOverride = platform;
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  final dir = Directory.systemTemp.createTempSync('langbai-result-fixture-');
  final bitmap = img.Image(width: width, height: height);
  img.fill(bitmap, color: img.ColorRgb8(46, 87, 111));
  img.fillRect(bitmap,
      x1: 0,
      y1: 0,
      x2: width ~/ 2,
      y2: height ~/ 2,
      color: img.ColorRgb8(110, 160, 170));
  img.fillRect(bitmap,
      x1: width ~/ 2,
      y1: height ~/ 2,
      x2: width - 1,
      y2: height - 1,
      color: img.ColorRgb8(190, 151, 95));
  final path = '${dir.path}/abstract.png';
  File(path).writeAsBytesSync(img.encodePng(bitmap));
  final path2 = '${dir.path}/abstract-2.png';
  File(path).copySync(path2);
  // Resolve before mounting, outside the fake-async zone. A FileImage started
  // inside pumpWidget would leave its OS read waiting in that zone.
  await tester.runAsync(() async {
    for (final file in [path, path2]) {
      final done = Completer<void>();
      final stream = FileImage(File(file)).resolve(ImageConfiguration.empty);
      final listener = ImageStreamListener((_, __) {
        if (!done.isCompleted) done.complete();
      }, onError: (Object error, StackTrace? stack) {
        if (!done.isCompleted) done.completeError(error, stack);
      });
      stream.addListener(listener);
      await done.future.timeout(const Duration(seconds: 10));
      stream.removeListener(listener);
    }
  });
  final state = FixtureState();
  state.settings.autoComplete = false;
  state.settings.language = language;
  HistoryItem item(String id, int w, int h) => HistoryItem(
      id: id,
      filePath: id == 'fixture-1' ? path : path2,
      date: '2026-11-04',
      createdAt: '2026-11-04T00:00:00Z',
      seed: 42,
      model: 'fictional-fixture',
      width: w,
      height: h,
      prompt: 'abstract color blocks');
  state.history = [
    item('fixture-1', width, height),
    item('fixture-2', width, height)
  ];
  state.current = state.history.first;
  state.params.width = 1024;
  state.params.height = 1024;
  state.params.positivePrompt = 'fictional retained draft';
  addTearDown(() async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    state.dispose();
    tester.view.reset();
    debugDefaultTargetPlatformOverride = old;
    // Keep isolated fictional files as evidence; do not delete while an image
    // stream may still hold an OS handle.
  });
  await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
      value: state,
      child: RepaintBoundary(
          key: captureKey,
          child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: androidStudioTheme(StudioTheme.light().copyWith(
                  textTheme: StudioTheme.light()
                      .textTheme
                      .apply(fontFamily: 'ResultZh'))),
              builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context)
                      .copyWith(textScaler: TextScaler.linear(scale)),
                  child: child!),
              home: const GenerateScreen()))));
  await tester.pumpAndSettle();
  return state;
}

Map<String, Object?> geometry(WidgetTester tester) {
  final viewport = find.byKey(const ValueKey('generate-preview-viewport'));
  final raw =
      find.descendant(of: viewport, matching: find.byType(RawImage)).first;
  final render = tester.renderObject<RenderImage>(raw);
  assert(render.image != null);
  final fitted = applyBoxFit(
      render.fit ?? BoxFit.scaleDown,
      Size(render.image!.width.toDouble(), render.image!.height.toDouble()),
      render.size);
  final card = tester
      .getRect(find.ancestor(of: viewport, matching: find.byType(Card)).last);
  final image = fitted.destination;
  return {
    'cardWidth': card.width,
    'cardHeight': card.height,
    'imageWidth': image.width,
    'imageHeight': image.height,
    'widthShare': image.width / card.width,
    'areaShare': image.width * image.height / (card.width * card.height),
    'contain': render.fit == BoxFit.contain,
    'standaloneLoad': find.text('加载图片').evaluate().isNotEmpty,
    'standalonePaste': find
        .byKey(const ValueKey('generation-paste-image'))
        .evaluate()
        .isNotEmpty
  };
}

void fixtureTest(String name, Future<void> Function(WidgetTester) body) {
  testWidgets(name, (tester) async {
    final platform = debugDefaultTargetPlatformOverride;
    try {
      await body(tester);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      debugDefaultTargetPlatformOverride = platform;
    }
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });
  setUpAll(() async {
    await (FontLoader('ResultZh')
          ..addFont(
              rootBundle.load('assets/ui-fonts/LXGWMarkerGothic-Regular.ttf')))
        .load();
    await (FontLoader('MaterialIcons')
          ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf')))
        .load();
  });
  fixtureTest('image-first fixed square geometry', (tester) async {
    final state = await mount(tester, const Size(390, 844), 512, 512);
    final m = geometry(tester);
    // ignore: avoid_print
    print('RESULT_OBS ${jsonEncode(m)}');
    await capture(tester, 'square-390');
    expect(m['widthShare'] as double, greaterThan(.90));
    expect(m['areaShare'] as double, greaterThan(.75));
    expect(m['standaloneLoad'], false);
    expect(m['standalonePaste'], false);
    expect(m['contain'], true);
    expect(state.params.width, 1024);
    expect(state.params.height, 1024);
    expect(tester.takeException(), isNull);
  });
  for (final size in [
    const Size(320, 640),
    const Size(430, 932),
    const Size(800, 360),
    const Size(900, 1200)
  ]) {
    for (final ratio in [
      const Size(512, 512),
      const Size(416, 608),
      const Size(608, 416)
    ]) {
      for (final scale in [1.0, 2.0]) {
        fixtureTest('image fit $size source $ratio font $scale',
            (tester) async {
          final state = await mount(
              tester, size, ratio.width.toInt(), ratio.height.toInt(),
              scale: scale);
          final m = geometry(tester);
          expect(m['contain'], true);
          expect((m['imageWidth'] as double) / (m['imageHeight'] as double),
              closeTo(ratio.width / ratio.height, .001));
          expect(m['standaloneLoad'], false);
          expect(m['standalonePaste'], false);
          expect(
              tester
                  .getSize(find.byKey(const ValueKey('result-image-toolbar')))
                  .height,
              lessThanOrEqualTo(64));
          expect(
              tester
                  .getSize(find.byKey(const ValueKey('result-image-stage')))
                  .width,
              closeTo(m['cardWidth'] as double, .1));
          expect(state.params.positivePrompt, 'fictional retained draft');
          expect(tester.takeException(), isNull);
          if (size.width == 430 && scale == 1) {
            await capture(
                tester, 'fit-${ratio.width.toInt()}-${ratio.height.toInt()}');
          }
        });
      }
    }
  }
  fixtureTest(
      'toolbar menu retains load paste copy and zoom without extra rows',
      (tester) async {
    final state = await mount(tester, const Size(390, 844), 512, 512);
    var pasted = 0;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('langbai.novelai/composer_files'),
            (call) async {
      if (call.method == 'paste') {
        pasted++;
        return <String>[];
      }
      return null;
    });
    addTearDown(() => TestDefaultBinaryMessengerBinding
        .instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('langbai.novelai/composer_files'), null));
    await tester.tap(find.byKey(const ValueKey('result-image-tools')));
    await tester.pumpAndSettle();
    await capture(tester, 'tools-menu');
    expect(pasted, 0);
    final items = tester
        .widgetList<PopupMenuItem<String>>(find.byType(PopupMenuItem<String>))
        .toList();
    expect(items.firstWhere((x) => x.value == 'load').enabled, true);
    expect(items.firstWhere((x) => x.value == 'paste').enabled, true);
    expect(items.any((x) => x.value == 'copy'), true);
    await tester.tap(find.byWidgetPredicate(
        (w) => w is PopupMenuItem<String> && w.value == 'paste'));
    await tester.pumpAndSettle();
    expect(pasted, 1);
    expect(state.params.positivePrompt, 'fictional retained draft');
    expect(state.current!.id, 'fixture-1');
    expect(tester.takeException(), isNull);
  });
  fixtureTest(
      'busy import actions disabled and generation parameters unchanged',
      (tester) async {
    final state = await mount(tester, const Size(390, 844), 512, 512);
    state.setBusy(true);
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('result-image-tools')));
    await tester.pump(const Duration(milliseconds: 350));
    final items = tester
        .widgetList<PopupMenuItem<String>>(find.byType(PopupMenuItem<String>))
        .toList();
    expect(items.firstWhere((x) => x.value == 'load').enabled, false);
    expect(items.firstWhere((x) => x.value == 'paste').enabled, false);
    expect(state.params.width, 1024);
    expect(state.params.height, 1024);
    expect(tester.takeException(), isNull);
    state.setBusy(false);
  });
  fixtureTest('fullscreen, pinch reset and browse preserve draft',
      (tester) async {
    final state = await mount(tester, const Size(390, 844), 512, 512);
    final interactive = find.descendant(
        of: find.byKey(const ValueKey('generate-preview-viewport')),
        matching: find.byType(InteractiveViewer));
    final viewer = tester.widget<InteractiveViewer>(interactive);
    final first = await tester.startGesture(
        tester.getCenter(interactive) - const Offset(30, 0),
        pointer: 1);
    final second = await tester.startGesture(
        tester.getCenter(interactive) + const Offset(30, 0),
        pointer: 2);
    await first.moveBy(const Offset(-50, 0));
    await second.moveBy(const Offset(50, 0));
    await tester.pump();
    await first.up();
    await second.up();
    await tester.pumpAndSettle();
    expect(viewer.transformationController!.value.getMaxScaleOnAxis(),
        greaterThan(1));
    await tester.tap(find.byKey(const ValueKey('result-image-tools')));
    await tester.pumpAndSettle();
    await tester.tap(find.byWidgetPredicate(
        (w) => w is PopupMenuItem<String> && w.value == 'reset'));
    await tester.pumpAndSettle();
    expect(viewer.transformationController!.value.getMaxScaleOnAxis(), 1);
    await tester.tap(find.byIcon(Icons.fullscreen).first);
    await tester.pumpAndSettle();
    expect(find.byType(Dialog), findsOneWidget);
    await tester.tap(find.byIcon(Icons.close).last);
    await tester.pumpAndSettle();
    expect(find.byType(Dialog), findsNothing);
    final zoom = find.byKey(const ValueKey('generate-preview-viewport'));
    await tester.tap(find.byKey(const ValueKey('preview-next')));
    await tester.pumpAndSettle();
    expect(state.current!.id, 'fixture-2');
    expect(find.text('2/2'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('preview-previous')));
    await tester.pumpAndSettle();
    expect(state.current!.id, 'fixture-1');
    expect(find.text('1/2'), findsOneWidget);
    expect(zoom, findsOneWidget);
    expect(state.params.positivePrompt, 'fictional retained draft');
    expect(tester.takeException(), isNull);
  });
  for (final language in ['en-US', 'zh-TW', 'ja-JP', 'ko-KR']) {
    fixtureTest('translated compact toolbar $language', (tester) async {
      await mount(tester, const Size(320, 640), 512, 512,
          scale: 2, language: language);
      await tester.tap(find.byKey(const ValueKey('result-image-tools')));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
  fixtureTest('iOS preview stays on existing non-Android layout',
      (tester) async {
    await mount(tester, const Size(390, 844), 512, 512,
        platform: TargetPlatform.iOS);
    expect(
        find.byKey(const ValueKey('android-image-first-result')), findsNothing);
    expect(
        find.byKey(const ValueKey('generate-single-layout')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

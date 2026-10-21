// Host-only fixture regression. Controlled preferences/path provider and test
// font metrics are not a native receipt or a replacement for Android ui9.
import 'dart:io';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/batch_redraw_screen.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/screens/tools_hub_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:path/path.dart' as path;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../integration_test/native_ui_actions.dart';
import '../integration_test/native_ui_scenarios.dart'
    show openNativeComicFromTools;

const _requiredRobotoNames = [
  'roboto-regular.ttf',
  'roboto-medium.ttf',
  'roboto-bold.ttf'
];

String _asciiLower(String value) => String.fromCharCodes(
    value.codeUnits.map((unit) => unit >= 65 && unit <= 90 ? unit + 32 : unit));

List<File> _resolveRequiredRobotoFiles(Iterable<File> entries) {
  final files = entries.toList();
  return _requiredRobotoNames.map((required) {
    final matches = files
        .where((file) => _asciiLower(path.basename(file.path)) == required)
        .toList();
    if (matches.length != 1) {
      throw StateError(
          'Expected one SDK font $required; found ${matches.length}: '
          '${matches.map((file) => path.basename(file.path)).join(', ')}');
    }
    return matches.single;
  }).toList();
}

Future<void> _drive(WidgetTester tester, Future<void> action) async {
  var completed = false;
  Object? failure;
  StackTrace? stack;
  action.then((_) => completed = true,
      onError: (Object error, StackTrace trace) {
    failure = error;
    stack = trace;
    completed = true;
  });
  for (var frame = 0; frame < 500 && !completed; frame++) {
    await tester.pump(const Duration(milliseconds: 50));
    // Let only already-started local asset/file work complete outside fake time.
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 1)));
  }
  if (!completed) throw StateError('Host Comic target diagnostic timed out');
  if (failure != null) Error.throwWithStackTrace(failure!, stack!);
}

List<Element> _tiles() => nativeUiElements((widget) =>
    widget is ListTile && widget.onTap != null && widget.title is Text);
String _title(Element element) =>
    ((element.widget as ListTile).title as Text).data!;

ScrollableState _hubScroll() {
  final hub = nativeUiElements((widget) => widget is ToolsHubScreen).single;
  final positions = <ScrollableState>[];
  void visit(Element element) {
    if (element is StatefulElement && element.state is ScrollableState) {
      final state = element.state as ScrollableState;
      if (state.position.axis == Axis.vertical) positions.add(state);
    }
    element.visitChildren(visit);
  }

  hub.visitChildren(visit);
  return positions.single;
}

Future<void> _backToHub(WidgetTester tester) async {
  List<Element> back() => nativeUiElements((widget) =>
      widget is BackButton ||
      (widget is IconButton &&
          widget.icon is Icon &&
          (widget.icon as Icon).icon == Icons.arrow_back));
  await _drive(tester,
      nativeUiWait(() => back().isNotEmpty, 'real nested tool back control'));
  await _drive(tester, nativeUiTap(back().first));
  await _drive(
      tester,
      nativeUiWait(
          () =>
              nativeUiElements((widget) => widget is ToolsHubScreen).isNotEmpty,
          'real tools hub after Back'));
}

AppState _app() => AppState()
  ..settings = AppSettings(
      language: 'en-US',
      proxyMode: 'custom',
      proxyUrl: 'http://127.0.0.1:1',
      proxyForNai: true,
      proxyForAi: true,
      proxyForUpdate: true,
      proxyForTranslate: true,
      proxyForMcp: true,
      allowCustomEndpointFallback: false);

Future<void> _mount(WidgetTester tester, AppState app, Widget child) async {
  await tester.pumpWidget(ChangeNotifierProvider.value(
      value: app, child: MaterialApp(home: child)));
  await tester.pump();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory sandbox;
  setUpAll(() async {
    // Actual Android Roboto metrics, not Flutter-test's wide Ahem fallback.
    final config = File('.dart_tool/package_config.json').absolute;
    final packages = (jsonDecode(config.readAsStringSync())
        as Map<String, dynamic>)['packages'] as List<dynamic>;
    final flutter = packages
        .cast<Map<String, dynamic>>()
        .singleWhere((entry) => entry['name'] == 'flutter');
    final package =
        Directory.fromUri(config.uri.resolve(flutter['rootUri'] as String));
    final sdk = package.parent.parent;
    final font = FontLoader('Roboto');
    final fonts = Directory(
        path.join(sdk.path, 'bin', 'cache', 'artifacts', 'material_fonts'));
    // Flutter SDK releases differ in filename case. Enumerate actual files,
    // require all three unique ASCII case-insensitive matches, and load those
    // exact paths. No Ahem fallback or silently substituted font is permitted.
    for (final file
        in _resolveRequiredRobotoFiles(fonts.listSync().whereType<File>())) {
      font.addFont(Future.value(ByteData.sublistView(file.readAsBytesSync())));
    }
    await font.load();
  });
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    sandbox = Directory.systemTemp.createTempSync('native-comic-target-host-');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('plugins.flutter.io/path_provider'),
            (call) async => sandbox.path);
  });
  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('plugins.flutter.io/path_provider'), null);
    final resolved = await sandbox.resolveSymbolicLinks();
    final temp = await Directory.systemTemp.resolveSymbolicLinks();
    if (!path.isWithin(temp, resolved) ||
        !path.basename(resolved).startsWith('native-comic-target-host-')) {
      throw StateError('Host diagnostic sandbox escaped its owned temp root');
    }
    await sandbox.delete(recursive: true);
  });

  test('SDK font resolver uses actual mixed-case file paths in required order',
      () {
    final fonts = Directory(path.join(sandbox.path, 'fonts'))..createSync();
    final names = [
      'Roboto-Bold.ttf',
      'ROBOTO-REGULAR.TTF',
      'roboto-Medium.ttf'
    ];
    for (var i = 0; i < names.length; i++) {
      File(path.join(fonts.path, names[i])).writeAsBytesSync([i + 1]);
    }
    File(path.join(fonts.path, 'unrelated.ttf')).writeAsBytesSync([99]);
    final resolved =
        _resolveRequiredRobotoFiles(fonts.listSync().whereType<File>());
    expect(resolved.map((file) => path.basename(file.path)),
        ['ROBOTO-REGULAR.TTF', 'roboto-Medium.ttf', 'Roboto-Bold.ttf']);
    expect(resolved.map((file) => file.readAsBytesSync().single), [2, 3, 1]);
  });

  test('SDK font resolver rejects missing required weight without fallback',
      () {
    final files = ['Roboto-Regular.ttf', 'Roboto-Bold.ttf']
        .map((name) => File(path.join(sandbox.path, name)));
    expect(
        () => _resolveRequiredRobotoFiles(files),
        throwsA(isA<StateError>().having((error) => error.message, 'message',
            contains('roboto-medium.ttf; found 0'))));
  });

  test('SDK font resolver rejects case-insensitive ambiguity', () {
    // Use enumerated path identities so this remains testable even on a
    // case-insensitive host filesystem where both files cannot be created.
    final files = [
      'Roboto-Regular.ttf',
      'roboto-regular.ttf',
      'Roboto-Medium.ttf',
      'Roboto-Bold.ttf'
    ].map((name) => File(path.join(sandbox.path, name)));
    expect(
        () => _resolveRequiredRobotoFiles(files),
        throwsA(isA<StateError>().having((error) => error.message, 'message',
            contains('roboto-regular.ttf; found 2'))));
  });

  testWidgets(
      'retained scroll makes old first open Batch; same fixture helper '
      'uniquely reveals and hit-tests Comic', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(360, 620);
    addTearDown(tester.view.reset);
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final app = _app();
    app.params.positivePrompt = 'HOST_COMIC_DRAFT_UNCHANGED';
    try {
      await _mount(tester, app, const ToolsHubScreen());
      final scroll = _hubScroll();
      scroll.position.jumpTo(scroll.position.maxScrollExtent);
      await tester.pump(const Duration(milliseconds: 50));
      final retained = scroll.position.pixels;
      expect(retained, greaterThan(0));
      final oldTarget = _tiles().first;
      expect(_title(oldTarget), 'Batch Img2Img');
      await _drive(tester, nativeUiTap(oldTarget));
      await _drive(
          tester,
          nativeUiWait(
              () => nativeUiElements((widget) => widget is BatchRedrawScreen)
                  .isNotEmpty,
              'old ordinal target really opened Batch'));
      expect(nativeUiElements((widget) => widget is ComicScreen), isEmpty);
      // ignore: avoid_print
      print('HOST_COMIC_BASELINE retainedScroll=$retained '
          'oldFirst=Batch Img2Img route=BatchRedrawScreen; host-only');
      await _backToHub(tester);
      final sameScroll = _hubScroll();
      sameScroll.position.jumpTo(sameScroll.position.maxScrollExtent);
      await tester.pump(const Duration(milliseconds: 50));
      expect(_title(_tiles().first), 'Batch Img2Img');
      // This is the exact exported helper used by the real ui9 fixture.
      await _drive(tester, openNativeComicFromTools(app));
      await _drive(
          tester,
          nativeUiWait(
              () => nativeUiElements((widget) => widget is ComicScreen)
                  .isNotEmpty,
              'production Comic route after unique target hit-test'));
      expect(nativeUiElements((widget) => widget is ComicScreen).length, 1);
      expect(
          nativeUiElements((widget) => widget is BatchRedrawScreen), isEmpty);
      expect(sameScroll.position.pixels, sameScroll.position.minScrollExtent);
      expect(app.params.positivePrompt, 'HOST_COMIC_DRAFT_UNCHANGED');
      // ignore: avoid_print
      print('HOST_COMIC_MODIFIED target=Comic Generator '
          'route=ComicScreen scroll=min; host-only, not-native-certification');
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.runAsync(() => Future<void>.delayed(Duration.zero));
      await tester.pump();
      app.dispose();
      debugDefaultTargetPlatformOverride = null;
    }
  });

  testWidgets('missing production hub cannot fall back to an arbitrary tile',
      (tester) async {
    final app = _app();
    try {
      await _mount(tester, app, const Scaffold(body: Text('No tools hub')));
      await expectLater(
          openNativeComicFromTools(app),
          throwsA(isA<StateError>().having((error) => error.message, 'message',
              contains('one current production tools hub'))));
      expect(nativeUiElements((widget) => widget is ComicScreen), isEmpty);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      app.dispose();
    }
  });

  testWidgets('ambiguous production hubs fail before a pointer is dispatched',
      (tester) async {
    final app = _app();
    try {
      await _mount(
          tester,
          app,
          const Row(children: [
            Expanded(child: ToolsHubScreen()),
            Expanded(child: ToolsHubScreen()),
          ]));
      await expectLater(
          openNativeComicFromTools(app),
          throwsA(isA<StateError>().having((error) => error.message, 'message',
              contains('one current production tools hub'))));
      expect(nativeUiElements((widget) => widget is ComicScreen), isEmpty);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      app.dispose();
    }
  });
}

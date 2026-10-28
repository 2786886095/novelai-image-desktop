// Host mechanism regression: real production screen, file/prefs storage and
// pointer dispatch, with controlled local paths and artist-pool data. Platform
// override exercises layout only; this is not a native Android/iOS receipt.
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/random_artist_lab_screen.dart';
import 'package:novelai_mobile/services/artist_tag_service.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:path/path.dart' as path;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../integration_test/native_ui_actions.dart';
import '../integration_test/native_scenario_support.dart' show png, digest;
import '../integration_test/native_ui_scenarios.dart'
    show verifyNativeArtistFavoriteReopened;

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

class _LocalArtistPool extends ArtistTagService {
  @override
  Future<List<ArtistTagRecord>> popular(AppSettings settings,
          {int limit = 1000,
          bool force = false,
          bool includeCurated = true}) async =>
      const [
        ArtistTagRecord(1, 'native_artist_a', 100),
        ArtistTagRecord(2, 'native_artist_b', 90)
      ];
}

Future<void> _drive(WidgetTester tester, Future<void> action,
    {Duration frameInterval = const Duration(milliseconds: 50)}) async {
  var done = false;
  Object? failure;
  StackTrace? trace;
  action.then((_) {
    done = true;
  }, onError: (Object error, StackTrace stack) {
    failure = error;
    trace = stack;
    done = true;
  });
  for (var i = 0; i < 1000 && !done; i++) {
    await tester.pump(frameInterval);
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 1)));
  }
  if (!done) throw StateError('Host favorite pointer diagnostic timed out');
  if (failure != null) Error.throwWithStackTrace(failure!, trace!);
}

ScrollableState _artistScroll() {
  final roots = nativeUiElements((w) =>
      w is ListView &&
      w.key == const PageStorageKey<String>('random-artist-lab-scroll'));
  expect(roots, hasLength(1));
  final states = <ScrollableState>[];
  void visit(Element element) {
    if (element is StatefulElement && element.state is ScrollableState) {
      states.add(element.state as ScrollableState);
      return;
    }
    element.visitChildren(visit);
  }

  roots.single.visitChildren(visit);
  return states.single;
}

Future<void> _reveal(
    WidgetTester tester, bool Function(Widget) predicate) async {
  for (var i = 0; i < 60; i++) {
    if (nativeUiElements(predicate).isNotEmpty) return;
    final position = _artistScroll().position;
    position.jumpTo((position.pixels + 500)
        .clamp(position.minScrollExtent, position.maxScrollExtent));
    await tester.pump(const Duration(milliseconds: 50));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 1)));
  }
  throw StateError('Host setup did not reveal actual Favorite button');
}

bool _favoriteButton(Widget widget) =>
    widget is IconButton &&
    widget.icon is Icon &&
    (widget.icon as Icon).icon == Icons.favorite_border &&
    widget.onPressed != null;

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
    sandbox =
        Directory.systemTemp.createTempSync('native-favorite-reopen-host-');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('plugins.flutter.io/path_provider'),
            (call) async => sandbox.path);
  });
  tearDown(() async {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('plugins.flutter.io/path_provider'), null);
    final resolved = await sandbox.resolveSymbolicLinks();
    final temp = await Directory.systemTemp.resolveSymbolicLinks();
    if (!path.isWithin(temp, resolved) ||
        !path.basename(resolved).startsWith('native-favorite-reopen-host-')) {
      throw StateError('Favorite diagnostic sandbox escaped owned temp root');
    }
    await sandbox.delete(recursive: true);
  });

  for (final layout in <(TargetPlatform, Size)>[
    (TargetPlatform.android, const Size(360, 740)),
    (TargetPlatform.android, const Size(1280, 900)),
    (TargetPlatform.iOS, const Size(393, 852)),
    (TargetPlatform.iOS, const Size(1024, 768)),
  ]) {
    testWidgets(
        'Favorite persisted, reopened and viewed via pointers ${layout.$1.name} ${layout.$2}',
        (tester) async {
      debugDefaultTargetPlatformOverride = layout.$1;
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = layout.$2;
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      final storage = Storage();
      final app = AppState(storage: storage)
        ..settings = AppSettings(
            language: 'en-US',
            imageOutputDir: sandbox.path,
            imageBaseUrl: 'http://127.0.0.1:1',
            apiBaseUrl: 'http://127.0.0.1:1',
            convertApiUrl: 'http://127.0.0.1:1',
            visionApiUrl: 'http://127.0.0.1:1',
            allowCustomEndpoint: true,
            allowCustomEndpointFallback: false,
            proxyMode: 'direct',
            streamPreviewEnabled: false,
            saveToGallery: false,
            keepImageMetadata: true)
        ..params = GenerateParams(
            width: 64,
            height: 64,
            seed: 42,
            seedMode: 'fixed',
            positivePrompt: 'synthetic forest',
            qualityPreset: 'none',
            ucPreset: 0);
      final previewEvents = <(String, int, DateTime)>[];
      try {
        final bytes = png(64, 64);
        final created = await tester.runAsync(() async {
          await storage.setSettings(app.settings);
          await storage.setParams(app.params);
          return storage.saveArtistLabTemporaryImage(
              bytes, app.params.copy(), 42);
        });
        expect(created, isNotNull);
        // Mobile separators are uniformly '/'. Host Windows needs its canonical
        // separator spelling for the existing strict temp-directory guard; this
        // names the exact same real file, not an alternate Storage implementation.
        final temp = HistoryItem.fromJson({
          ...created!.toJson(),
          'filePath': path.normalize(created.filePath)
        });
        final prefs = await SharedPreferences.getInstance();
        const prefix = 'artist_lab_random_v1_';
        await prefs.setString(
            '${prefix}results',
            jsonEncode([
              {
                'recipe': const ArtistRecipe(
                    'host-42', 'native_artist_a', ['native_artist_a']).toJson(),
                'sequence': 1,
                'seed': 42,
                'status': 'done',
                'image': temp.toJson(),
                'error': null,
                'generationModel': app.params.model,
                'liked': false,
              }
            ]));
        await prefs.setInt('${prefix}count', 2);
        await prefs.setInt('${prefix}minArtists', 1);
        await prefs.setInt('${prefix}maxArtists', 2);
        await prefs.setInt('${prefix}poolSize', 100);
        await prefs.setString(
            '${prefix}customArtists', 'native_artist_a, native_artist_b');
        await prefs.setBool('${prefix}useCustomArtists', true);
        Future<void> mountScreen() async {
          await tester.pumpWidget(ChangeNotifierProvider.value(
              value: app,
              child: MaterialApp(
                  builder: (context, child) => Listener(
                      onPointerDown: (event) {
                        if (event.pointer > (1 << 20)) {
                          previewEvents.add((
                            'down',
                            event.pointer,
                            tester.binding.clock.now()
                          ));
                        }
                      },
                      onPointerUp: (event) {
                        if (event.pointer > (1 << 20)) {
                          previewEvents.add((
                            'up',
                            event.pointer,
                            tester.binding.clock.now()
                          ));
                        }
                      },
                      child: child!),
                  theme: ThemeData(fontFamily: 'Roboto'),
                  home: RandomArtistLabScreen(
                      onBack: () {}, artistService: _LocalArtistPool()))));
          await tester.pumpAndSettle();
        }

        await mountScreen();
        await _reveal(tester, _favoriteButton);
        // Finish the actual file decode before promotion. Windows host files
        // cannot be unlinked while the engine still holds an open decode handle.
        await _drive(
            tester,
            nativeUiWait(
                () => nativeUiElements((w) => w is RawImage && w.image != null)
                    .isNotEmpty,
                'actual temporary preview decode before Favorite promotion'));
        await _drive(
            tester, nativeUiTap(nativeUiElements(_favoriteButton).single));
        await _drive(
            tester,
            nativeUiWait(
                () => app.history.any((h) => h.feature == 'artist-lab'),
                'saved history'));
        final saved = app.history.singleWhere((h) => h.feature == 'artist-lab');
        await _drive(
            tester,
            nativeUiWait(() {
              final favorites =
                  jsonDecode(prefs.getString('${prefix}favorites') ?? '[]')
                      as List;
              return favorites.length == 1 &&
                  favorites.single['liked'] == true &&
                  favorites.single['image']['id'] == saved.id;
            }, 'real Favorite preference persistence'));
        final originalChecks = await tester.runAsync(() async => [
              !await File(temp.filePath).exists(),
              digest(await File(saved.filePath).readAsBytes()) == digest(bytes),
              (await Storage().getHistory()).any((h) => h.id == saved.id),
              (await Storage().getGroups())
                  .any((g) => g.id == saved.groupId && g.name == '画风实验室-随机抽卡'),
            ]);
        expect(originalChecks, everyElement(isTrue));
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        // A fresh root has no retained PageStorage scroll position. This is
        // the production lazy-reopen precondition, not an iOS-native claim.
        await mountScreen();
        expect(_artistScroll().position.pixels, 0);
        expect(nativeUiElements((w) => w is SegmentedButton<bool>), isEmpty);
        Map<String, Object?>? observed;
        await _drive(
            tester,
            verifyNativeArtistFavoriteReopened(saved).then((value) {
              observed = value;
            }),
            frameInterval: const Duration(milliseconds: 160));
        // Artificially slow frames exceed the old multi-frame double-tap gap.
        // Observe real GestureBinding dispatch, never invoke a recognizer callback.
        expect(previewEvents.map((event) => event.$1),
            ['down', 'up', 'down', 'up']);
        expect(previewEvents.map((event) => event.$2).toSet(), hasLength(2));
        expect(previewEvents[0].$2, previewEvents[1].$2);
        expect(previewEvents[2].$2, previewEvents[3].$2);
        final gap = previewEvents[2].$3.difference(previewEvents[1].$3);
        expect(gap, greaterThanOrEqualTo(kDoubleTapMinTime));
        expect(gap, lessThan(kDoubleTapTimeout));
        debugPrint('HOST_FAVORITE_DOUBLE_TAP:${jsonEncode({
              'platformLayout': layout.$1.name,
              'size': [layout.$2.width, layout.$2.height],
              'frameIntervalMs': 160,
              'pointerEvents': previewEvents.length,
              'uniquePointerIds':
                  previewEvents.map((event) => event.$2).toSet().length,
              'firstUpToSecondDownMs': gap.inMilliseconds,
            })}');
        expect(observed, {
          'restoredFavoriteCount': 1,
          'actualFavoriteSegmentPointerTap': true,
          'actualSavedImagePreviewDoublePointerTap': true,
          'actualSavedOriginalPathAndDecodedDimensionsVerified': true,
        });
        expect(prefs.getBool('${prefix}showFavorites'), isTrue);
        expect(
            await tester.runAsync(
                () async => digest(await File(saved.filePath).readAsBytes())),
            digest(bytes));
        expect(
            await tester.runAsync(() async =>
                (await Storage().getHistory()).any((h) => h.id == saved.id)),
            isTrue);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        app.dispose();
        debugDefaultTargetPlatformOverride = null;
        PaintingBinding.instance.imageCache.clear();
        PaintingBinding.instance.imageCache.clearLiveImages();
        await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 50)));
      }
    });
  }
}

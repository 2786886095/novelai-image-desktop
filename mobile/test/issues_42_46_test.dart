import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:provider/provider.dart';
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/screens/local_favorites_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/local_favorites.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/zoomable_image.dart';

Uint8List fixture([bool metadata = true]) =>
    Uint8List.fromList(img.encodePng(img.Image(
        width: 80,
        height: 40,
        textData: metadata
            ? {
                'Software': 'NovelAI',
                'Source': 'NovelAI Diffusion V4.5 Full',
                'Comment': jsonEncode({
                  'prompt': 'restored scene',
                  'uc': 'restored negative',
                  'seed': 9876,
                  'steps': 16,
                  'scale': 8,
                  'width': 832,
                  'height': 1216,
                  'v4_prompt': {
                    'caption': {
                      'base_caption': 'restored scene',
                      'char_captions': [
                        {
                          'char_caption': 'traveler',
                          'centers': [
                            {'x': 0.2, 'y': 0.7}
                          ]
                        }
                      ]
                    }
                  }
                })
              }
            : null)));

HistoryItem record(String id, String path, {String? group}) => HistoryItem(
    id: id,
    filePath: path,
    prompt: 'history $id',
    model: 'nai-diffusion-4-5-full',
    seed: 1,
    width: 80,
    height: 40,
    createdAt: '2026-10-06T12:00:00',
    feature: 'generate',
    date: '2026-10-06',
    groupId: group);

Future<void> nativeDrop(List<String> paths) async {
  final done = Future<void>.sync(() async {
    await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .handlePlatformMessage(
            'langbai.novelai/composer_files',
            const StandardMethodCodec()
                .encodeMethodCall(MethodCall('drop', paths)),
            (_) {});
  });
  await done;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('copy-original setting defaults false and survives storage reload',
      () async {
    for (final json in <Map<String, dynamic>>[
      {},
      {'copyImageMetadata': 'true'}
    ]) {
      expect(AppSettings.fromJson(json).toJson()['copyImageMetadata'], false);
    }
    expect(AppSettings().toJson()['copyImageMetadata'], false);
    final storage = Storage();
    final enabled = AppSettings.fromJson(
        {'copyImageMetadata': true, 'keepImageMetadata': false});
    await storage.setSettings(enabled);
    final restored = await Storage().getSettings();
    expect(restored.toJson()['copyImageMetadata'], true);
    expect(restored.keepImageMetadata, false,
        reason: 'Copy and save metadata are independent.');
  });

  for (final source in ['paste', 'drop']) {
    testWidgets(
        '$source generation image restores embedded parameters; history stays image-only',
        (t) async {
      final dir = Directory.systemTemp.createTempSync('mobile-42-');
      final file = File('${dir.path}/input.png')..writeAsBytesSync(fixture());
      final plain = File('${dir.path}/plain.png')
        ..writeAsBytesSync(fixture(false));
      final state = AppState(storage: Storage());
      state.settings.language = 'en-US';
      state.params
        ..positivePrompt = 'edited'
        ..seed = 42
        ..steps = 28;
      const channel = MethodChannel('langbai.novelai/composer_files');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel,
              (call) async => call.method == 'paste' ? [file.path] : null);
      addTearDown(() async {
        await t.pumpWidget(const SizedBox());
        state.dispose();
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null);
        PaintingBinding.instance.imageCache
          ..clear()
          ..clearLiveImages();
      });
      t.view.physicalSize = const Size(1200, 1000);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(ChangeNotifierProvider.value(
          value: state, child: const MaterialApp(home: GenerateScreen())));
      await t.pumpAndSettle();
      final paste = find.byKey(const ValueKey('generation-paste-image'));
      expect(paste, findsOneWidget);
      await t.ensureVisible(paste);
      await t.pumpAndSettle();
      await t.runAsync(() async {
        if (source == 'paste') {
          await t.tap(paste);
        } else {
          await nativeDrop([file.path]);
        }
        for (var i = 0;
            i < 80 && state.workbenchImage?.filePath != file.path;
            i++) {
          await Future<void>.delayed(const Duration(milliseconds: 10));
        }
      });
      await t.pumpAndSettle();
      expect(state.params.positivePrompt, 'restored scene');
      expect(state.params.negativePrompt, 'restored negative');
      expect(state.params.seed, 9876);
      expect(state.params.steps, 16);
      expect(state.extras.charCaptions.single.prompt, 'traveler');
      await t.runAsync(
          () => state.setWorkbenchFromHistory(record('plain', plain.path)));
      expect(state.params.positivePrompt, 'restored scene');
      expect(state.params.seed, 9876);
      expect(state.workbenchImportedParams, isNull);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets(
      'generation main and fullscreen navigate the same group list without restoring form values',
      (t) async {
    final dir = Directory.systemTemp.createTempSync('mobile-43-');
    final files = List.generate(
        3, (i) => File('${dir.path}/$i.png')..writeAsBytesSync(fixture()));
    final state = AppState(storage: Storage());
    state.settings.language = 'en-US';
    state.params
      ..positivePrompt = 'edited'
      ..seed = 42;
    state.history = [
      record('a', files[0].path, group: 'g'),
      record('excluded', files[1].path, group: 'other'),
      record('b', files[2].path, group: 'g')
    ];
    state.selectedGroupId = 'g';
    state.current = state.history.first;
    t.view.physicalSize = const Size(1200, 1000);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    addTearDown(() async {
      await t.pumpWidget(const SizedBox());
      state.dispose();
    });
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: state, child: const MaterialApp(home: GenerateScreen())));
    await t.pumpAndSettle();
    final preview = t.widget<ZoomableImage>(find.byType(ZoomableImage));
    expect(preview.gallery, hasLength(2));
    await t.runAsync(() async {
      await t.tap(find.byKey(const ValueKey('preview-next')));
      for (var i = 0;
          i < 80 && state.workbenchImage?.filePath != files[2].path;
          i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    await t.pumpAndSettle();
    expect(state.workbenchImage?.filePath, files[2].path);
    await t.tap(find.byIcon(Icons.fullscreen));
    await t.pumpAndSettle();
    expect(find.text('2 / 2'), findsOneWidget);
    await t.runAsync(() async {
      await t.tap(find.descendant(
          of: find.byType(Dialog), matching: find.byIcon(Icons.chevron_left)));
      for (var i = 0;
          i < 80 && state.workbenchImage?.filePath != files[0].path;
          i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    await t.pumpAndSettle();
    expect(find.text('1 / 2'), findsOneWidget);
    await t.tap(find.descendant(
        of: find.byType(Dialog), matching: find.byIcon(Icons.close)));
    await t.pumpAndSettle();
    expect(state.workbenchImage?.filePath, files[0].path);
    expect(state.params.positivePrompt, 'edited');
    expect(state.params.seed, 42);
    expect(t.widget<ZoomableImage>(find.byType(ZoomableImage)).initialIndex, 0);
    expect(t.takeException(), isNull);
  });

  testWidgets(
      'main preview double tap uses painted image, not the letterbox box',
      (t) async {
    final state = AppState(storage: Storage());
    addTearDown(state.dispose);
    final bytes = fixture(false);
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
            home: Scaffold(
                body: SizedBox(
                    width: 400,
                    height: 436,
                    child: ZoomableImage(
                        image: Image.memory(bytes, fit: BoxFit.contain)))))));
    await t.runAsync(() => precacheImage(
        MemoryImage(bytes), t.element(find.byType(ZoomableImage))));
    await t.pumpAndSettle();
    final box = t.getRect(find.byType(InteractiveViewer));
    Future<void> doubleTap(Offset position) async {
      await t.tapAt(position);
      await t.pump(const Duration(milliseconds: 50));
      await t.tapAt(position);
      await t.pumpAndSettle();
    }

    await doubleTap(box.topLeft + const Offset(200, 30));
    expect(find.byType(Dialog), findsNothing);
    await doubleTap(box.center);
    expect(find.byType(Dialog), findsOneWidget);
    await t.tap(find.descendant(
        of: find.byType(Dialog), matching: find.byIcon(Icons.close)));
    await t.pumpAndSettle();
  });

  testWidgets('local favorite explicit apply restores original metadata',
      (t) async {
    final dir = Directory.systemTemp.createTempSync('mobile-45-');
    UnifiedStorage.active = dir;
    final bytes = fixture();
    final file = File('${dir.path}/images/favorites/20261006_80x40_01.png');
    file.parent.createSync(recursive: true);
    file.writeAsBytesSync(bytes);
    final favorite = LocalFavorite(
        id: 'favorite',
        sourceId: 'source',
        prefix: '20261006_80x40_01',
        name: '',
        extension: '.png',
        fileName: '20261006_80x40_01.png',
        sha256: sha256.convert(bytes).toString(),
        bytes: bytes.length);
    final index = File('${dir.path}/data/local-favorites.json');
    index.parent.createSync(recursive: true);
    index.writeAsStringSync(jsonEncode({
      'version': 1,
      'directory': '',
      'items': [favorite.toJson()]
    }));
    final state = AppState(storage: Storage());
    state.settings.language = 'en-US';
    state.params.positivePrompt = 'edited';
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    addTearDown(() async {
      await t.pumpWidget(const SizedBox());
      UnifiedStorage.active = null;
      state.dispose();
    });
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: state, child: const MaterialApp(home: LocalFavoritesScreen())));
    await t.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 100)));
    await t.pumpAndSettle();
    expect(find.byTooltip('Apply to generation'), findsOneWidget);
    await t.runAsync(() async {
      await t.tap(find.byTooltip('Apply to generation'));
      for (var i = 0;
          i < 80 && state.workbenchImage?.filePath != file.path;
          i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    await t.pumpAndSettle();
    expect(p.normalize(state.workbenchImage!.filePath), p.normalize(file.path));
    expect(state.params.positivePrompt, 'restored scene');
    expect(state.params.seed, 9876);
    expect(state.extras.charCaptions.single.prompt, 'traveler');
    expect(File(file.path).readAsBytesSync(), bytes);
    expect(t.takeException(), isNull);
  });

  testWidgets(
      'gallery detail fullscreen uses the visible filtered history, not all groups',
      (t) async {
    final dir = Directory.systemTemp.createTempSync('mobile-gallery-43-');
    final files = List.generate(
        3, (i) => File('${dir.path}/$i.png')..writeAsBytesSync(fixture(false)));
    final state = AppState(storage: Storage());
    state.settings.language = 'en-US';
    state.groups = [
      const HistoryGroup(id: 'g', name: 'Group', createdAt: '2026-10-06')
    ];
    state.selectedGroupId = 'g';
    state.history = [
      record('a', files[0].path, group: 'g'),
      record('x', files[1].path, group: 'other'),
      record('b', files[2].path, group: 'g')
    ];
    addTearDown(() async {
      await t.pumpWidget(const SizedBox());
      state.dispose();
    });
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: state, child: const MaterialApp(home: GalleryScreen())));
    await t.pumpAndSettle();
    await t.tap(find.byType(Image).first);
    await t.pumpAndSettle();
    expect(t.widget<ZoomableImage>(find.byType(ZoomableImage)).gallery,
        hasLength(2));
    expect(state.workbenchImage, isNull,
        reason: 'Ordinary history tap never applies metadata.');
    expect(t.takeException(), isNull);
  });
}

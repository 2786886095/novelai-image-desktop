import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _Paths extends PathProviderPlatform {
  final String root;
  _Paths(this.root);
  @override Future<String?> getApplicationDocumentsPath() async => root;
  @override Future<String?> getTemporaryPath() async => root;
  @override Future<String?> getApplicationSupportPath() async => root;
}

Uint8List _image({bool webp = false}) {
  final image = im.Image(width: 32, height: 24, numChannels: 4);
  for (final p in image) {
    p..r = p.x * 7..g = p.y * 9..b = 77..a = 255;
  }
  return webp ? im.encodeWebP(image, lossless: true, exact: true) : im.encodePng(image);
}

HistoryItem _row(String path) => HistoryItem(
  id: 'same-history-id', filePath: path, date: '2026-10-31',
  createdAt: '2026-10-31T12:34:56Z', seed: 12345,
  model: 'nai-diffusion-4-5-full', width: 32, height: 24,
  prompt: 'fixture only', groupId: 'same-group',
  params: {'positivePrompt': 'fixture only', 'privateFixture': {'kept': true},
    '_langbaiLocalGenerationCompletedAt': '2026-10-31T12:34:56Z',
    '_langbaiLocalGenerationCompletedSource': 'local-completion'},
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final findings = <String, Object?>{};
  late Directory root;
  late Storage storage;
  late File png, webp;
  late HistoryItem original;
  WidgetTester? activeTester;
  setUp(() async {
    SharedPreferences.setMockInitialValues({'local_favorites_v1': '{"fixtureFavorite":"same-history-id"}'});
    UnifiedStorage.active = null;
    root = await Directory.systemTemp.createTemp('issue79-converted-history-');
    PathProviderPlatform.instance = _Paths(root.path);
    storage = Storage();
    await storage.setSettings(AppSettings(saveToGallery: false, imageOutputDir: root.path));
    png = File('${root.path}/converted.png')..writeAsBytesSync(_image());
    webp = File('${root.path}/converted.webp');
    original = _row(png.path);
    await storage.writeHistory([original]);
  });
  tearDown(() async {
    Future<void> cleanup() async {
      PaintingBinding.instance.imageCache..clear()..clearLiveImages();
      final absolute = root.absolute.path;
      expect(root.parent.absolute.path, Directory.systemTemp.absolute.path);
      expect(root.uri.pathSegments.where((s) => s.isNotEmpty).last,
          startsWith('issue79-converted-history-'));
      for (var attempt = 0; attempt < 20; attempt++) {
        try {
          if (await root.exists()) await Directory(absolute).delete(recursive: true);
          return;
        } on FileSystemException catch (e) {
          if (e.osError?.errorCode != 32 || attempt == 19) rethrow;
          await Future<void>.delayed(const Duration(milliseconds: 50));
        }
      }
    }
    // Widget tests use a fake clock; let pending FileImage I/O finish in the
    // real async zone before Windows fixture cleanup. Never suppress failures.
    if (activeTester != null) { await activeTester!.runAsync(cleanup); }
    else { await cleanup(); }
    activeTester = null;
  });
  tearDownAll(() {
    final output = Platform.environment['ISSUE79_MOBILE_FINDINGS'];
    if (output != null) File(output).writeAsStringSync('${jsonEncode(findings)}\n');
  });

  test('real Storage recovers a unique converted WebP without losing history identity', () async {
    await webp.writeAsBytes(_image(webp: true));
    await png.delete();
    final removed = await storage.reconcileMissingHistory();
    final rows = await Storage().getHistory();
    final result = {
      'removedOriginalId': removed.contains(original.id),
      'historyCount': rows.length,
      'relinkedToWebp': rows.length == 1 && rows.single.filePath == webp.path,
      'identityPreserved': rows.length == 1 && rows.single.id == original.id,
      'metadataPreserved': rows.length == 1 && jsonEncode({...rows.single.toJson(), 'filePath': ''}) == jsonEncode({...original.toJson(), 'filePath': ''}),
      'favoriteUnchanged': (await SharedPreferences.getInstance()).getString('local_favorites_v1') == '{"fixtureFavorite":"same-history-id"}',
      'webpBytesUnchanged': (await webp.readAsBytes()).toString() == _image(webp: true).toString(),
    };
    findings['storage'] = result;
    expect(result['relinkedToWebp'], isTrue);
    expect(result['removedOriginalId'], isFalse);
    expect(result['identityPreserved'], isTrue);
    expect(result['metadataPreserved'], isTrue);
    expect(result['favoriteUnchanged'], isTrue);
    expect(result['webpBytesUnchanged'], isTrue);
  });

  test('AppState rebinds current image and active same-path views after recovery', () async {
    final app = AppState(storage: storage);
    addTearDown(app.dispose);
    app.booted = true;
    app.history = [original]; app.current = original;
    app.workbenchImage = WorkingImage(filePath: png.path, width: 32, height: 24);
    app.comparisonBefore = WorkingImage(filePath: png.path, width: 32, height: 24);
    app.comparisonAfter = WorkingImage(filePath: png.path, width: 32, height: 24);
    await webp.writeAsBytes(_image(webp: true)); await png.delete();
    await app.reconcileMissingHistory();
    final result = {
      'historyRebound': app.history.length == 1 && app.history.single.filePath == webp.path,
      'currentRebound': app.current?.filePath == webp.path,
      'workbenchRebound': app.workbenchImage?.filePath == webp.path,
      'comparisonBeforeRebound': app.comparisonBefore?.filePath == webp.path,
      'comparisonAfterRebound': app.comparisonAfter?.filePath == webp.path,
    };
    findings['appState'] = result;
    expect(result.values.every((v) => v), isTrue);
  });

  testWidgets('the actual gallery displays the recovered WebP history tile', (tester) async {
    activeTester = tester;
    final app = AppState(storage: storage);
    app.booted = true; app.settings.language = 'en-US';
    app.history = [original]; app.current = original;
    await tester.runAsync(() async {
      await webp.writeAsBytes(_image(webp: true)); await png.delete();
      await app.reconcileMissingHistory();
    });
    await tester.pumpWidget(ChangeNotifierProvider.value(value: app,
        child: const MaterialApp(home: GalleryScreen())));
    await tester.runAsync(() async => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pumpAndSettle();
    final present = find.text('converted.webp').evaluate().isNotEmpty;
    findings['gallery'] = {'convertedFilenameVisible': present,
      'historyStillIndexed': app.history.length == 1};
    await tester.pumpWidget(const SizedBox.shrink());
    app.dispose();
    expect(present, isTrue);
    expect(tester.takeException(), isNull);
  });
}

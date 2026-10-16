// Deterministic production gallery-page regressions over actual loopback TLS.
// Host widget/plugins are authoring fixtures; these tests are not device receipts.
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/screens/online_gallery_screen.dart';
import 'package:novelai_mobile/services/online_gallery_service.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_dropdown.dart';
import '../integration_test/native_gallery_tls_fixture.dart';
import 'package:image/image.dart' as im;

class _RealProxy extends HttpOverrides {
  final int port;
  _RealProxy(this.port);
  @override
  HttpClient createHttpClient(SecurityContext? context) =>
      super.createHttpClient(context)
        ..findProxy = (_) => 'PROXY 127.0.0.1:$port';
}

Future<void> _io(WidgetTester t, bool Function() done) async {
  for (var i = 0; i < 250; i++) {
    await t.pump(const Duration(milliseconds: 20));
    await t
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
    if (done()) {
      await t.pump();
      return;
    }
  }
  fail('Production gallery operation did not reach concrete state');
}

List<File> _files(Directory root) => root
    .listSync(recursive: true)
    .whereType<File>()
    .where((f) => f.path.contains('Online Gallery'))
    .toList();
bool _idle(WidgetTester t) {
  final buttons = find.ancestor(
      of: find.text('Download current image'),
      matching: find.byWidgetPredicate((w) => w is ButtonStyleButton));
  return buttons.evaluate().isNotEmpty &&
      t.widget<ButtonStyleButton>(buttons.first).onPressed != null;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final cancel in [false, true]) {
    testWidgets(
        cancel
            ? 'visible gallery cancel aborts held HTTP before release and saves no stale file'
            : 'gallery rejects real HTTP HTML/oversize/error without writing and preserves valid bytes',
        (t) async {
      SharedPreferences.setMockInitialValues({});
      t.view.physicalSize = const Size(1200, 1600);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      final root = await t.runAsync(
          () => Directory.systemTemp.createTemp('gallery-page-regression-'));
      final image = im.encodePng(
          im.Image(width: 64, height: 64)..clear(im.ColorRgb8(70, 100, 130)));
      final tls =
          (await t.runAsync(() => NativeGalleryTlsFixture.open(image)))!;
      final previous = HttpOverrides.current;
      HttpOverrides.global = _RealProxy(tls.proxy.port);
      final networkProvider = debugNetworkImageHttpClientProvider;
      debugNetworkImageHttpClientProvider = tls.ioClient;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
              const MethodChannel('plugins.flutter.io/path_provider'),
              (_) async => root!.path);
      final storage = Storage(),
          app = AppState(storage: Storage())..settings.language = 'en-US';
      app.settings.onlineGalleryDownloadDir = root!.path;
      app.settings.imageOutputDir = root.path;
      await t.runAsync(() => storage.setSettings(app.settings));
      try {
        await t.pumpWidget(ChangeNotifierProvider.value(
            value: app, child: const MaterialApp(home: OnlineGalleryScreen())));
        await t.pump();
        final selector = find.byType(StudioDropdownButton<OnlineGallerySource>);
        await t.tap(selector);
        await t.pump();
        await t.pump(const Duration(milliseconds: 500));
        await t.tap(find.text('Danbooru').last);
        await _io(
            t, () => find.text('native_character_1').evaluate().isNotEmpty);
        final card = find.text('native_character_1').first;
        await t.ensureVisible(card);
        await t.tap(card);
        await _io(
            t, () => find.text('Download current image').evaluate().isNotEmpty);
        Future<void> download() async {
          final b = find.text('Download current image');
          await t.ensureVisible(b);
          await t.tap(b);
          await t.pump();
        }

        if (cancel) {
          tls.holdDownload();
          await download();
          await _io(t, () => tls.held != null);
          final control =
              find.byKey(const ValueKey('online-gallery-cancel-download'));
          expect(control, findsOneWidget,
              reason: 'Active request requires a visible cancel control');
          await t.tap(control);
          await _io(t, () => control.evaluate().isEmpty);
          expect(tls.held, isNotNull,
              reason:
                  'Request must finish cancellation before response gate opens');
          expect(_files(root), isEmpty);
          await t.runAsync(tls.releaseHeld);
          await t.pump(const Duration(milliseconds: 100));
          expect(_files(root), isEmpty);
          // Disposal during a second actual held response also suppresses persistence.
          tls.holdDownload();
          await download();
          await _io(t, () => tls.held != null);
          await t.pumpWidget(const SizedBox.shrink());
          await t.runAsync(tls.releaseHeld);
          await t.pump();
          expect(_files(root), isEmpty);
          // ignore: avoid_print
          print(
              'GALLERY_CANCEL visible=true completedBeforeRelease=true staleFiles=0 disposeFiles=0');
        } else {
          for (final mode in ['html', 'error', 'oversize']) {
            tls.imageMode = mode;
            final before = tls.requests.length;
            await download();
            await _io(
                t,
                () =>
                    tls.requests
                        .skip(before)
                        .any((r) => r['path'] == '/images/1.png') &&
                    _idle(t));
            // ignore: avoid_print
            print('GALLERY_REJECTION mode=$mode files=${_files(root).length}');
            expect(_files(root), isEmpty,
                reason:
                    'Untrusted $mode response must not become a saved image');
          }
          tls.imageMode = 'normal';
          for (var i = 1; i <= 2; i++) {
            await download();
            await _io(t, () => _files(root).length == i && _idle(t));
          }
          final saved = _files(root);
          expect(saved.map((e) => e.path).toSet().length, 2);
          for (final f in saved) {
            expect(f.path.endsWith('.png'), isTrue);
            expect(f.readAsBytesSync(), image);
          }
          expect(
              tls.requests.every((r) =>
                  r['method'] == 'GET' &&
                  r['bodyBytes'] == 0 &&
                  r['authorization'] == null),
              isTrue);
          expect(tls.errors, isEmpty);
          // ignore: avoid_print
          print(
              'GALLERY_VALID saved=2 exactBytes=true noClobber=true allGetNoUpload=true');
        }
        expect(t.takeException(), isNull);
      } finally {
        await t.pumpWidget(const SizedBox.shrink());
        await t.runAsync(tls.releaseHeld);
        PaintingBinding.instance.imageCache
          ..clear()
          ..clearLiveImages();
        debugNetworkImageHttpClientProvider = networkProvider;
        HttpOverrides.global = previous;
        await t.runAsync(tls.close);
        app.dispose();
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(
                const MethodChannel('plugins.flutter.io/path_provider'), null);
        await t.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 50)));
        if (root.existsSync()) root.deleteSync(recursive: true);
      }
    });
  }
}

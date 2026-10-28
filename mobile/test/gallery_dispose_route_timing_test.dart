// Controlled host mechanism probe. Real production UI and TLS, not a native receipt.
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/screens/online_gallery_screen.dart';
import 'package:novelai_mobile/services/online_gallery_service.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import '../integration_test/native_gallery_tls_fixture.dart';
import '../integration_test/native_online_gallery_scenarios.dart'
    show nativePopGalleryDetailAndWaitForDisposal;
import 'package:image/image.dart' as im;

class _RealProxy extends HttpOverrides {
  final int port;
  _RealProxy(this.port);
  @override
  HttpClient createHttpClient(SecurityContext? context) =>
      super.createHttpClient(context)
        ..findProxy = (_) => 'PROXY 127.0.0.1:$port';
}

Future<void> ioUntil(WidgetTester t, bool Function() done,
    {bool advanceClock = true}) async {
  for (var i = 0; i < 250; i++) {
    if (done()) return;
    await t
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
    await t
        .pump(advanceClock ? const Duration(milliseconds: 20) : Duration.zero);
  }
  fail('Concrete gallery IO state never reached');
}

List<File> files(Directory root) => root
    .listSync(recursive: true)
    .whereType<File>()
    .where((f) => f.path.contains('Online Gallery'))
    .toList();
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  WidgetController.hitTestWarningShouldBeFatal = true;
  for (final platform in [TargetPlatform.iOS, TargetPlatform.android]) {
    for (final strategy in [
      'early-release',
      'await-dispose',
      'visible-cancel'
    ]) {
      testWidgets('${platform.name} $strategy actual route held download',
          (t) async {
        SharedPreferences.setMockInitialValues({});
        debugDefaultTargetPlatformOverride = platform;
        t.view.physicalSize = const Size(393, 852);
        t.view.devicePixelRatio = 1;
        final root = (await t.runAsync(
            () => Directory.systemTemp.createTemp('gallery-route-gate-')))!;
        final image = im.encodePng(
            im.Image(width: 64, height: 64)..clear(im.ColorRgb8(70, 100, 130)));
        final tls =
            (await t.runAsync(() => NativeGalleryTlsFixture.open(image)))!;
        final provider = debugNetworkImageHttpClientProvider;
        debugNetworkImageHttpClientProvider = tls.ioClient;
        final previous = HttpOverrides.current;
        HttpOverrides.global = _RealProxy(tls.proxy.port);
        const channel = MethodChannel('plugins.flutter.io/path_provider');
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, (_) async => root.path);
        final storage = Storage();
        final app = AppState(storage: storage)..settings.language = 'en-US';
        app.settings.onlineGalleryDownloadDir = root.path;
        app.settings.imageOutputDir = root.path;
        await t.runAsync(() => storage.setSettings(app.settings));
        final service = OnlineGalleryService(client: tls.client());
        State? detailState;
        final trace = <Map<String, Object?>>[];
        final elapsed = Stopwatch()..start();
        void record(String event) {
          final route = detailState?.mounted == true
              ? ModalRoute.of(detailState!.context)
              : null;
          trace.add({
            'event': event,
            'hostTimeMs': t.binding.clock.now().millisecondsSinceEpoch,
            'wallElapsedUs': elapsed.elapsedMicroseconds,
            'detailMounted': detailState?.mounted,
            'routeCurrent': route?.isCurrent,
            'routeStatus': route?.animation?.status.name,
            'files': files(root).length,
            'held': tls.held != null,
            'requests': tls.requests.length
          });
        }

        try {
          await t.pumpWidget(ChangeNotifierProvider.value(
              value: app,
              child: MaterialApp(
                  home: Center(
                      child: SizedBox(
                          width: 360,
                          height: 740,
                          child: OnlineGalleryScreen(
                              service: service,
                              downloadClientFactory: tls.client,
                              initialSource: OnlineGallerySource.danbooru))))));
          await t.pump();
          await t.tap(find.text('Search'));
          try {
            await ioUntil(
                t, () => find.text('native_character_1').evaluate().isNotEmpty);
          } catch (_) {
            // ignore: avoid_print
            print('PROBE_SETUP_DIAGNOSTIC:${jsonEncode({
                  'requests': tls.requests,
                  'errors': tls.errors,
                  'texts':
                      t.allWidgets.whereType<Text>().map((w) => w.data).toList()
                })}');
            rethrow;
          }
          final card = find.text('native_character_1').first;
          await Scrollable.ensureVisible(card.evaluate().single, alignment: .5);
          await t.pump();
          await t.tap(card);
          await t.pump();
          await t.pump(const Duration(milliseconds: 500));
          await ioUntil(t,
              () => find.text('Download current image').evaluate().isNotEmpty);
          detailState = t.allStates.singleWhere((s) =>
              s.runtimeType.toString() == '_OnlineGalleryDetailScreenState');
          record('detail-ready');
          tls.holdDownload();
          final download = find.text('Download current image');
          await Scrollable.ensureVisible(download.evaluate().single,
              alignment: .5);
          await t.pump();
          await t.tap(download);
          await t.pump();
          await ioUntil(t, () => tls.held != null);
          record('held-arrived');
          expect(files(root), isEmpty);
          if (strategy == 'visible-cancel') {
            await t.tap(
                find.byKey(const ValueKey('online-gallery-cancel-download')));
            await t.pump();
            await ioUntil(
                t,
                () => find
                    .byKey(const ValueKey('online-gallery-cancel-download'))
                    .evaluate()
                    .isEmpty);
            record('cancel-completed');
          } else {
            if (strategy == 'await-dispose') {
              final scaffold = find
                  .descendant(
                      of: find.byWidgetPredicate((w) =>
                          w.runtimeType.toString() ==
                          '_OnlineGalleryDetailScreen'),
                      matching: find.byType(Scaffold))
                  .evaluate()
                  .single;
              record('native-boundary-called');
              await nativePopGalleryDetailAndWaitForDisposal(scaffold,
                  advanceFrame: () async {
                await t.pump(const Duration(milliseconds: 50));
                record('native-boundary-frame');
              });
              record('native-boundary-returned');
            } else {
              Navigator.of(detailState.context).pop();
              record('pop-called');
              await t.pump();
              await t.pump(const Duration(milliseconds: 50));
              record('one-native-frame-after-pop');
            }
          }
          await t.runAsync(tls.releaseHeld);
          record('gate-released');
          // Advance actual IO, not the route animation clock, so the original
          // pop -> 50ms -> release race can be observed independently.
          if (strategy == 'early-release') {
            await ioUntil(
                t,
                () =>
                    files(root).length == 1 &&
                    files(root).single.lengthSync() == image.length &&
                    find
                        .byKey(const ValueKey('online-gallery-cancel-download'))
                        .evaluate()
                        .isEmpty,
                advanceClock: false);
            record('save-boundary');
            expect(detailState.mounted, isTrue);
            expect(files(root).single.readAsBytesSync(), image);
            await t.pump(const Duration(milliseconds: 400));
            expect(detailState.mounted, isFalse);
            record('later-disposed');
          } else {
            await t.runAsync(
                () => Future<void>.delayed(const Duration(milliseconds: 100)));
            await t.pump();
            record('post-release-observed');
            expect(files(root), isEmpty);
            if (strategy == 'await-dispose') {
              expect(detailState.mounted, isFalse);
            }
            record('no-stale-file');
          }
          expect(tls.errors, isEmpty);
          expect(
              tls.requests.every((r) =>
                  r['method'] == 'GET' &&
                  r['bodyBytes'] == 0 &&
                  r['authorization'] == null),
              isTrue);
          expect(t.takeException(), isNull);
          // ignore: avoid_print
          print('GALLERY_ROUTE_TRACE:${jsonEncode({
                'platform': platform.name,
                'strategy': strategy,
                'trace': trace
              })}');
        } finally {
          // ignore: avoid_print
          print('GALLERY_ROUTE_FINAL:${jsonEncode({
                'platform': platform.name,
                'strategy': strategy,
                'trace': trace
              })}');
          await t.pumpWidget(const SizedBox.shrink());
          await t.runAsync(tls.releaseHeld);
          PaintingBinding.instance.imageCache
            ..clear()
            ..clearLiveImages();
          debugNetworkImageHttpClientProvider = provider;
          HttpOverrides.global = previous;
          await t.runAsync(tls.close);
          app.dispose();
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
              .setMockMethodCallHandler(channel, null);
          await t.runAsync(
              () => Future<void>.delayed(const Duration(milliseconds: 50)));
          if (root.existsSync()) {
            await t.runAsync(() async {
              for (var attempt = 0; attempt < 20; attempt++) {
                try {
                  await root.delete(recursive: true);
                  return;
                } on FileSystemException {
                  if (attempt == 19) rethrow;
                  await Future<void>.delayed(const Duration(milliseconds: 50));
                }
              }
            });
          }
          debugDefaultTargetPlatformOverride = null;
          t.view.reset();
        }
      });
    }
  }
}

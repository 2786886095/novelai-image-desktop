import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class Paths extends PathProviderPlatform {
  final String root;
  Paths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
  @override
  Future<String?> getApplicationSupportPath() async => root;
}

class DelayedStorage extends Storage {
  final entered = Completer<void>(), gate = Completer<void>();
  final bool delay;
  DelayedStorage(this.delay);
  @override
  Future<String?> getToken() async => 'synthetic';
  @override
  Future<HistoryItem> saveImage(Uint8List bytes, GenerateParams p, int seed,
      {String feature = 't2i',
      String? model,
      int? width,
      int? height,
      String? groupId}) async {
    final saved = await super.saveImage(bytes, p, seed,
        feature: feature,
        model: model,
        width: width,
        height: height,
        groupId: groupId);
    if (delay) {
      entered.complete();
      await gate.future;
    }
    return saved;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final stage in ['save', 'preload']) {
    test(
        'late director cancel during $stage preserves editor and retains durable history',
        () async {
      SharedPreferences.setMockInitialValues({});
      UnifiedStorage.active = null;
      HttpOverrides.global = null;
      final root = await Directory.systemTemp.createTemp('director-late-');
      PathProviderPlatform.instance = Paths(root.path);
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0),
          png = im.encodePng(im.Image(width: 64, height: 64));
      var posts = 0;
      server.listen((r) async {
        try {
          await utf8.decoder.bind(r).join();
          if (r.uri.path.endsWith('/user/data')) {
            r.response.headers.contentType = ContentType.json;
            r.response.write(
                '{"subscription":{"tier":3,"active":true,"trainingStepsLeft":{"fixedTrainingStepsLeft":100000,"purchasedTrainingSteps":0}}}');
          } else if (r.uri.path.endsWith('/augment-image')) {
            posts++;
            r.response.headers.contentType = ContentType('application', 'zip');
            r.response.add(ZipEncoder().encode(
                Archive()..addFile(ArchiveFile('0.png', png.length, png))));
          } else {
            r.response.statusCode = 404;
            r.response.write(r.uri.path);
          }
          await r.response.close();
        } catch (_) {}
      });
      final storage = DelayedStorage(stage == 'save'),
          preloadEntered = Completer<void>(),
          preloadGate = Completer<void>();
      final app = AppState(
          api: NaiApi(),
          storage: storage,
          preloadCompletedImage: (_) async {
            if (stage == 'preload') {
              preloadEntered.complete();
              await preloadGate.future;
            }
          })
        ..settings = AppSettings(
            imageBaseUrl: 'http://127.0.0.1:${server.port}',
            apiBaseUrl: 'http://127.0.0.1:${server.port}',
            allowCustomEndpoint: true,
            proxyMode: 'direct',
            saveToGallery: false,
            imageOutputDir: root.path,
            language: 'en-US')
        ..directorTool = 'colorize';
      await storage.setSettings(app.settings);
      final source = File('${root.path}/source.png')..writeAsBytesSync(png);
      app.workbenchImage =
          WorkingImage(filePath: source.path, width: 64, height: 64);
      final original = app.workbenchImage;
      final pending = app.augment();
      try {
        await (stage == 'save' ? storage.entered.future : preloadEntered.future)
            .timeout(const Duration(seconds: 10));
        expect(await storage.getHistory(), hasLength(1));
        app.cancelPostprocess();
        if (stage == 'save') {
          storage.gate.complete();
        } else {
          preloadGate.complete();
        }
        await pending.timeout(const Duration(seconds: 10));
        expect(app.workbenchImage, same(original));
        expect(app.current, isNull);
        expect(app.comparisonAfter, isNull);
        expect(app.comparisonAutoOpenPending, false);
        expect(app.history, hasLength(1));
        expect(await File(app.history.single.filePath).exists(), true);
        expect(await storage.getHistory(), hasLength(1));
        expect(app.status, contains('original preserved'));
        expect(app.status, contains('history'));
        expect(posts, 1);
        expect(app.postprocessRunning, false);
      } finally {
        if (!storage.gate.isCompleted) storage.gate.complete();
        if (!preloadGate.isCompleted) preloadGate.complete();
        await pending;
        app.dispose();
        await server.close(force: true);
        await root.delete(recursive: true);
      }
    });
  }
}

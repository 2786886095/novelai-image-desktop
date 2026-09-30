import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/batch/batch_redraw_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class BatchPaths extends PathProviderPlatform {
  final String root;
  BatchPaths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
  @override
  Future<String?> getApplicationSupportPath() async => root;
}

class BatchStorage extends Storage {
  bool failHistory = false;
  @override
  Future<String?> getToken() async => 'fixture-native-token';
  @override
  Future<void> writeHistory(List<HistoryItem> items) async {
    if (failHistory) throw StateError('fixture history locked');
    await super.writeHistory(items);
  }
}

class NativeApi extends NaiApi {
  @override
  Future<AccountSummary> fetchAccount(
          String token, AppSettings settings) async =>
      const AccountSummary(hasToken: true, anlasBalance: 1000);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late HttpServer server;
  late AppState app;
  late BatchStorage storage;
  late Completer<void> submitted;
  Completer<void>? responseGate;
  var posts = 0;
  final bytes = img.encodePng(img.Image(width: 64, height: 64));
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    UnifiedStorage.active = null;
    HttpOverrides.global = null;
    root = await Directory.systemTemp.createTemp('batch-native-http-');
    PathProviderPlatform.instance = BatchPaths(root.path);
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    submitted = Completer<void>();
    responseGate = null;
    posts = 0;
    server.listen((req) async {
      try {
        expect(req.method, 'POST');
        expect(req.uri.path, '/ai/generate-image');
        expect(
            req.headers.value('authorization'), 'Bearer fixture-native-token');
        posts++;
        final body = jsonDecode(await utf8.decoder.bind(req).join()) as Map;
        expect(body['action'], 'img2img');
        expect((body['parameters'] as Map)['strength'], 0.4);
        expect(
            img
                .decodeImage(
                    base64Decode(body['parameters']['image'] as String))
                ?.width,
            64);
        if (!submitted.isCompleted) submitted.complete();
        await responseGate?.future;
        final archive = Archive()
          ..addFile(ArchiveFile('0.png', bytes.length, bytes))
          ..addFile(ArchiveFile('1.png', bytes.length, bytes));
        req.response.headers.contentType = ContentType('application', 'zip');
        req.response.add(ZipEncoder().encode(archive)!);
        await req.response.close();
      } catch (_) {
        await req.response.close().catchError((Object _) {});
      }
    });
    storage = BatchStorage();
    app = AppState(
        api: NativeApi(), storage: storage, preloadCompletedImage: (_) async {})
      ..settings = AppSettings(
          imageBaseUrl: 'http://127.0.0.1:${server.port}',
          allowCustomEndpoint: true,
          proxyMode: 'direct',
          saveToGallery: false);
    await storage.setSettings(app.settings);
    final c = app.batchRedraw;
    await c.load();
    c.project = BatchRedrawProject.empty(app.params)
      ..globalStrength = 0.4
      ..sizeMode = 'custom'
      ..globalParams.width = 64
      ..globalParams.height = 64
      ..items = [
        for (var i = 0; i < 2; i++)
          BatchRedrawItem(
              id: '$i',
              name: '$i.png',
              base64: base64Encode(bytes),
              width: 64,
              height: 64,
              prompt: 'forest')
      ];
  });
  tearDown(() async {
    if (responseGate != null && !responseGate!.isCompleted) {
      responseGate!.complete();
    }
    app.dispose();
    await server.close(force: true);
    UnifiedStorage.active = null;
    await root.delete(recursive: true);
  });
  test(
      'real native HTTP and filesystem preserve every returned image and completed project',
      () async {
    final c = app.batchRedraw;
    await c.startQueue(c.project.items);
    expect(c.runPhase, 'completed', reason: c.runError);
    expect(posts, 2);
    expect(c.project.items.every((i) => i.candidates.length == 2), isTrue);
    for (final candidate in c.project.items.expand((i) => i.candidates)) {
      expect(
          img
              .decodeImage(await File(candidate.outputPath).readAsBytes())
              ?.width,
          64);
    }
    final restored = await storage.getBatchRedrawProject(app.params);
    expect(restored.items.every((i) => i.candidates.length == 2), isTrue);
    expect((await storage.getBatchRun())?['phase'], 'completed');
  });
  test(
      'real history failure returns durable candidates and stops before another HTTP request',
      () async {
    storage.failHistory = true;
    final c = app.batchRedraw;
    await c.startQueue(c.project.items);
    expect(c.runPhase, 'failed');
    expect(posts, 1);
    expect(c.project.items.first.candidates, hasLength(2));
    for (final candidate in c.project.items.first.candidates) {
      expect(File(candidate.outputPath).existsSync(), isTrue);
    }
    expect(c.runError, contains('历史'));
    expect(c.project.items.last.candidates, isEmpty);
  });
  test(
      'real native cancellation aborts its HTTP request without starting the next image',
      () async {
    responseGate = Completer<void>();
    final c = app.batchRedraw;
    final work = c.startQueue(c.project.items);
    await submitted.future.timeout(const Duration(seconds: 10));
    c.cancelQueue();
    await work.timeout(const Duration(seconds: 10));
    expect(posts, 1);
    expect(c.runPhase, 'cancelled');
    expect(c.project.items.every((i) => i.candidates.isEmpty), isTrue);
    expect(app.busy, isFalse);
  });
}

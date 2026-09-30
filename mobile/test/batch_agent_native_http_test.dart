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
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

import 'batch_native_http_test.dart' show BatchPaths, BatchStorage, NativeApi;
import 'package:novelai_mobile/agent/batch_generation_actions.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/session_controls.dart';

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
        final receipts = await Directory('${root.path}/journal')
            .list()
            .where((f) => f.path.endsWith('.json'))
            .toList();
        expect(
            receipts.any((f) =>
                jsonDecode(File(f.path).readAsStringSync())['result']?['data']
                    ?['queued'] ==
                true),
            true);
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
  for (final mode in ['auto', 'confirm', 'history-failure']) {
    test('Agent receipt -> actual native HTTP ZIP -> durable files: $mode',
        () async {
      final client = HttpClient(), sessions = AgentSessionControls(app);
      if (mode == 'confirm') {
        await sessions.execute(
            'studio_generation_policy', {'mode': 'confirm'}, 'one');
      }
      if (mode == 'history-failure') storage.failHistory = true;
      app.batchRedraw.project.candidateCount = 2;
      late LocalAgentBridge bridge;
      var approvals = 0;
      final actions = BatchGenerationActions(
          app: app,
          sessions: sessions,
          root: Directory('${root.path}/ops'),
          approve: (s, a) {
            approvals++;
            return bridge.approveOperation(s, a);
          },
          cancelApproval: (s) =>
              bridge.cancelOperationApproval(s, 'batch.generation.start'));
      bridge = LocalAgentBridge(
          journal: Directory('${root.path}/journal'),
          managesApproval: BatchGenerationActions.handles,
          afterResponse: actions.afterResponse,
          cancelImages: actions.cancel,
          executeScoped: actions.execute,
          execute: (_, __) async => throw StateError('unscoped'));
      await bridge.start();
      Future<Map<String, dynamic>> call(
          String tool, Map<String, dynamic> args, String id) async {
        final req = await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
        req.headers.set('Authorization', 'Bearer ${bridge.token}');
        req.write(jsonEncode(
            {'tool': tool, 'args': args, 'sessionId': 'one', 'callId': id}));
        final res = await req.close();
        expect(res.statusCode, 200);
        return Map<String, dynamic>.from(
            jsonDecode(await utf8.decoder.bind(res).join()));
      }

      try {
        final args = {
          'action': 'batch.generation.start',
          'mode': 'all',
          'itemIds': <String>[],
          'expectedRevision': app.batchRedraw.revision
        };
        final pending = call('langbai_software_action', args, 'start');
        if (mode == 'confirm') {
          Map? request;
          for (var i = 0; i < 600; i++) {
            final data =
                (await call('studio_image_approval', {}, 'poll-$i'))['data'];
            if (data is Map) {
              request = data;
              break;
            }
            await Future<void>.delayed(const Duration(milliseconds: 5));
          }
          expect(request, isNotNull);
          expect(posts, 0);
          expect(request!['parameters']['count'], 4);
          await call('studio_resolve_image_approval',
              {'id': request['id'], 'approved': true}, 'approve');
        }
        final result = await pending;
        expect(result['ok'], true, reason: '$result');
        expect(result['data']['queued'], true);
        await submitted.future.timeout(const Duration(seconds: 10));
        await actions.settled();
        expect(posts, mode == 'history-failure' ? 1 : 4);
        expect(approvals, mode == 'confirm' ? 1 : 0);
        expect(actions.operation!['state'],
            mode == 'history-failure' ? 'failed' : 'completed');
        final saved = await storage.getBatchRedrawProject(app.params);
        final candidates = saved.items.expand((x) => x.candidates).toList();
        expect(candidates.length, mode == 'history-failure' ? 2 : 8);
        for (final image in candidates) {
          expect(
              img
                  .decodeImage(await File(image.outputPath).readAsBytes())
                  ?.width,
              64);
        }
        expect(await call('langbai_software_action', args, 'start'), result);
        expect(posts, mode == 'history-failure' ? 1 : 4);
      } finally {
        await bridge.close();
        await actions.close();
        sessions.close();
        client.close(force: true);
      }
    });
  }
}

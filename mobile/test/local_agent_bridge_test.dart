import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/agent_models.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = null;
  late Directory dir;
  late LocalAgentBridge bridge;
  late HttpClient client;
  Future<(int, Map<String, dynamic>)> call(String id,
      {String? token,
      String? origin,
      String session = 'test-session',
      String tool = 'langbai_generate_image',
      Map<String, dynamic> args = const {}}) async {
    final request = await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
    request.headers.set('Authorization', 'Bearer ${token ?? bridge.token}');
    if (origin != null) request.headers.set('Origin', origin);
    request.write(jsonEncode(
        {'sessionId': session, 'callId': id, 'tool': tool, 'args': args}));
    final response = await request.close();
    return (
      response.statusCode,
      jsonDecode(await utf8.decoder.bind(response).join())
          as Map<String, dynamic>
    );
  }

  Future<Map<String, dynamic>> pending() async {
    for (var n = 0; n < 100; n++) {
      final r = await call('read-$n', tool: 'studio_image_approval');
      if (r.$2['data'] is Map) return Map<String, dynamic>.from(r.$2['data']);
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    throw StateError('Approval did not appear');
  }

  Future<void> decide(bool approved) async {
    final p = await pending();
    expect(
        (await call('resolve',
                tool: 'studio_resolve_image_approval',
                args: {'id': p['id'], 'approved': approved}))
            .$2['ok'],
        true);
  }

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('local-agent-test');
    client = HttpClient();
    client.connectionTimeout = const Duration(seconds: 5);
  });
  tearDown(() async {
    await bridge.close();
    client.close(force: true);
    await dir.delete(recursive: true);
  });
  test(
      'session material confirmation is Agent-only and does not invoke a software mutation',
      () async {
    int calls = 0;
    bridge = LocalAgentBridge(
        journal: dir,
        execute: (tool, args) async {
          calls++;
          return const AgentToolResult(ok: true, title: 'unexpected', output: '{}');
        });
    await bridge.start();
    final args = {
      'name': 'Rain',
      'collection': 'characters',
      'revision': 'rev'
    };
    final work = call('bind-once', tool: 'studio_material_confirm', args: args);
    final p = await pending();
    expect(p['tool'], 'studio_material_confirm');
    await decide(true);
    final r = await work;
    expect(r.$2['data']['approved'], true);
    expect(calls, 0);
    expect(
        (await call('bind-once', tool: 'studio_material_confirm', args: args))
            .$2,
        r.$2);
    final rejected = await call('bad',
        tool: 'studio_material_confirm', args: {...args, 'approved': true});
    expect(rejected.$1, 400);
    final cancelled =
        call('bind-cancel', tool: 'studio_material_confirm', args: args);
    await decide(false);
    final cancellation = await cancelled;
    expect(cancellation.$2['ok'], true);
    expect(cancellation.$2['data']['approved'], false);
    expect(calls, 0);
    expect(
        (await call('bind-cancel', tool: 'studio_material_confirm', args: args))
            .$2,
        cancellation.$2);
  });

  test(
      'successful image result uses shared Harness generatedImages contract and durable replay',
      () async {
    final evidence =
        Directory('../artifacts/agent-api-integration-20260927').absolute;
    expect(evidence.existsSync(), true);
    final image = File('${evidence.path}/android-contract-fixture.png');
    image.writeAsBytesSync(base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='));
    int calls = 0;
    bridge = LocalAgentBridge(
        journal: dir,
        execute: (_, __) async {
          calls++;
          return AgentToolResult(
              ok: true,
              title: 'fixture only',
              output: 'saved',
              generatedImages: [
                AgentAttachment(
                    id: 'fixture',
                    name: 'fixture.png',
                    mime: 'image/png',
                    size: image.lengthSync(),
                    kind: 'image',
                    filePath: image.path,
                    createdAt: '2026-09-27')
              ]);
        });
    await bridge.start();
    final task = call('image-contract');
    await decide(true);
    final result = (await task).$2;
    expect(result['generatedImages'], hasLength(1));
    expect(result['generatedImages'][0]['filePath'], image.path);
    expect(result['images'], result['generatedImages']);
    expect((await call('image-contract')).$2['generatedImages'],
        result['generatedImages']);
    expect(calls, 1);
    File('${evidence.path}/android-image-result.json')
        .writeAsStringSync(jsonEncode(result));
  });
  test('requires bearer and rejects browser Origin', () async {
    var count = 0;
    bridge = LocalAgentBridge(
        journal: dir,
        execute: (_, __) async {
          count++;
          return const AgentToolResult(ok: true, title: 'ok', output: 'done');
        });
    await bridge.start();
    expect((await call('a', token: 'wrong')).$1, 403);
    expect((await call('b', origin: 'https://untrusted.example')).$1, 403);
    expect(count, 0);
  });
  test('Agent UI denial never executes; durable denial is not replayed',
      () async {
    var count = 0;
    bridge = LocalAgentBridge(
        journal: dir,
        execute: (_, __) async {
          count++;
          return const AgentToolResult(ok: true, title: 'ok', output: 'done');
        });
    await bridge.start();
    final task = call('denied');
    await decide(false);
    expect((await task).$2['ok'], false);
    await call('denied');
    expect(count, 0);
  });
  test(
      'approval poll bypasses mutation lock; wrong session and stale IDs fail; mutation executes once',
      () async {
    var count = 0;
    bridge = LocalAgentBridge(
        journal: dir,
        execute: (_, __) async {
          count++;
          return const AgentToolResult(ok: true, title: 'ok', output: 'saved');
        });
    await bridge.start();
    final first = call('same');
    final p = await pending();
    expect(count, 0);
    expect((await call('same')).$1, 409);
    expect(
        (await call('wrong',
                session: 'other',
                tool: 'studio_resolve_image_approval',
                args: {'id': p['id'], 'approved': true}))
            .$2['ok'],
        false);
    await decide(true);
    expect((await first).$2['ok'], true);
    expect((await call('same')).$2['output'], 'saved');
    expect(count, 1);
    expect(
        (await call('stale',
                tool: 'studio_resolve_image_approval',
                args: {'id': p['id'], 'approved': true}))
            .$2['ok'],
        false);
  });
  test('unknown result stays pending across a bridge restart', () async {
    var count = 0;
    bridge = LocalAgentBridge(
        journal: dir,
        execute: (_, __) async {
          count++;
          throw StateError('unknown');
        });
    await bridge.start();
    final first = call('uncertain');
    await decide(true);
    expect((await first).$1, 500);
    await bridge.close();
    bridge = LocalAgentBridge(
        journal: dir,
        execute: (_, __) async {
          count++;
          return const AgentToolResult(ok: true, title: 'ok', output: 'retry');
        });
    await bridge.start();
    expect((await call('uncertain')).$1, 409);
    expect(count, 1);
  });
  test(
      'ordinary operation executes with no popup; declared reads return data envelope',
      () async {
    var count = 0;
    bridge = LocalAgentBridge(
        journal: dir,
        execute: (_, __) async {
          count++;
          return const AgentToolResult(
              ok: true, title: 'ok', output: '{"executed":true}');
        });
    await bridge.start();
    expect(
        (await call('ordinary', tool: 'langbai_apply_prompt')).$2['ok'], true);
    expect(count, 1);
    expect(
        (await call('poll', tool: 'studio_image_approval')).$2['data'], null);
    expect(
        (await call('catalog', tool: 'langbai_software_capabilities'))
            .$2['data'],
        {'executed': true});
  });
  test(
      'approval parameters redact credentials and images; shutdown cancels without execution',
      () async {
    var count = 0;
    bridge = LocalAgentBridge(
        journal: dir,
        execute: (_, __) async {
          count++;
          return const AgentToolResult(ok: true, title: 'ok', output: 'done');
        });
    await bridge.start();
    final task = call('private', tool: 'langbai_memory_delete', args: {
      'id': 'x',
      'apiKey': 'PRIVATE-TEST-KEY',
      'imageData': 'PRIVATE-PIXELS'
    });
    final p = await pending();
    expect(jsonEncode(p), isNot(contains('PRIVATE-TEST-KEY')));
    expect(jsonEncode(p), isNot(contains('PRIVATE-PIXELS')));
    // Attach handler before closing the HTTP connection.
    final finish = task.then((_) => null, onError: (_) => null);
    await bridge.close();
    await finish;
    expect(count, 0);
  });
  test(
      'cancel remains reachable during pending approval and prevents queued resume',
      () async {
    final executed = <String>[];
    bridge = LocalAgentBridge(
        journal: dir,
        execute: (tool, args) async {
          executed.add(args['action']);
          return const AgentToolResult(
              ok: true, title: 'task', output: '{"executed":true}');
        });
    await bridge.start();
    final waiting = call('resume-pending',
        tool: 'langbai_tasks',
        args: {'action': 'resume', 'expectedRevision': 'r'});
    await pending();
    final stopped = await call('cancel-now',
        tool: 'langbai_tasks', args: {'action': 'cancel'});
    expect(stopped.$2['ok'], true);
    expect((await waiting).$2['ok'], false);
    expect(executed, ['cancel']);
  });
  test(
      'backup/library confirmation uses async local details and scoped executor, not a model claim',
      () async {
    var count = 0;
    String? receivedSession;
    bridge = LocalAgentBridge(
        journal: dir,
        execute: (_, __) async => throw StateError('must use scoped executor'),
        describeApproval: (tool, args, session) async => {
              'action': 'restore',
              '备份': 'local-test.naisbackup',
              'categories': ['promptPresets']
            },
        executeScoped: (tool, args, session) async {
          receivedSession = session;
          count++;
          return const AgentToolResult(
              ok: true, title: 'restored', output: '{"restored":true}');
        });
    await bridge.start();
    final request = call('restore-one',
        tool: 'langbai_backup',
        args: {'action': 'restore', 'inspectionId': 'fixture'});
    final p = await pending();
    expect(p['parameters']['备份'], 'local-test.naisbackup');
    await decide(true);
    final result = await request;
    expect(result.$2['data']['restored'], true);
    expect(receivedSession, 'test-session');
    expect(count, 1);
    final replay = await call('restore-one',
        tool: 'langbai_backup',
        args: {'action': 'restore', 'inspectionId': 'fixture'});
    expect(replay.$2['data']['restored'], true);
    expect(count, 1);
  });
}

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/batch_generation_actions.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/session_controls.dart';
import 'batch_generation_actions_test.dart'
    show LaunchApp, LaunchStorage, seedBatch, startArgs, waitFor;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final mode in ['auto', 'confirm']) {
    test(
        'actual HTTP $mode whole-batch approval, durable reply, replay and restart without resubmission',
        () async {
      HttpOverrides.global = null;
      SharedPreferences.setMockInitialValues({});
      final root = await Directory.systemTemp.createTemp('comic-launch-http-'),
          app = LaunchApp(LaunchStorage()),
          client = HttpClient();
      final sessions = AgentSessionControls(app);
      await seedBatch(app, each: 6);
      if (mode == 'confirm') {
        await sessions.execute(
            'studio_generation_policy', {'mode': 'confirm'}, 'one');
      }
      late LocalAgentBridge bridge;
      late BatchGenerationActions actions;
      var approvals = 0;
      void setup() {
        actions = BatchGenerationActions(
            app: app,
            sessions: sessions,
            root: Directory('${root.path}/operations'),
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
            executeScoped: (tool, args, session) =>
                actions.execute(tool, args, session),
            execute: (_, __) async => throw StateError('unscoped'));
      }

      setup();
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

      final gate = Completer<void>();
      app.network = () async {
        final files = await Directory('${root.path}/journal')
            .list()
            .where((f) => f.path.endsWith('.json'))
            .toList();
        final records = [
          for (final f in files) jsonDecode(await File(f.path).readAsString())
        ];
        expect(
            records.any((r) => r['result']?['data']?['queued'] == true), true);
        await gate.future;
      };
      try {
        final args = startArgs(app),
            pending = call('langbai_software_action', startArgs(app), 'start');
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
          expect(request!['parameters']['count'], 12);
          expect(app.calls, 0);
          expect(
              (await call(
                  'langbai_software_action',
                  {'action': 'batch.generation.status'},
                  'during-approval'))['ok'],
              true);
          await call('studio_resolve_image_approval',
              {'id': request['id'], 'approved': true}, 'approve');
        }
        final reply = await pending;
        expect(reply['ok'], true);
        expect(reply['data']['queued'], true);
        await waitFor(() => app.calls == 1);
        expect(await call('langbai_software_action', args, 'start'), reply);
        expect(app.calls, 1);
        gate.complete();
        await actions.settled();
        expect(app.calls, 12);
        expect(approvals, mode == 'auto' ? 0 : 1);
        expect(actions.operation!['state'], 'completed');
        await bridge.close();
        await actions.close();
        setup();
        await bridge.start();
        expect(await call('langbai_software_action', args, 'start'), reply);
        await Future<void>.delayed(const Duration(milliseconds: 20));
        expect(app.calls, 12);
        final status = await call('langbai_software_action',
            {'action': 'batch.generation.status'}, 'restarted-status');
        expect(status['data']['operation']['state'], 'completed');
        expect(app.calls, 12);
      } finally {
        if (!gate.isCompleted) gate.complete();
        await bridge.close();
        await actions.close();
        app.dispose();
        client.close(force: true);
        await root.delete(recursive: true);
      }
    });
  }
  test(
      'actual HTTP UI revoke cancels pending approval; another session cannot stop task',
      () async {
    HttpOverrides.global = null;
    SharedPreferences.setMockInitialValues({});
    final root = await Directory.systemTemp.createTemp('comic-revoke-http-'),
        app = LaunchApp(LaunchStorage()),
        client = HttpClient();
    final sessions = AgentSessionControls(app);
    await seedBatch(app);
    await sessions.execute(
        'studio_generation_policy', {'mode': 'confirm'}, 'one');
    late LocalAgentBridge bridge;
    final actions = BatchGenerationActions(
        app: app,
        sessions: sessions,
        root: root,
        approve: (s, a) => bridge.approveOperation(s, a),
        cancelApproval: (s) =>
            bridge.cancelOperationApproval(s, 'batch.generation.start'));
    bridge = LocalAgentBridge(
        journal: Directory('${root.path}/journal'),
        managesApproval: BatchGenerationActions.handles,
        afterResponse: actions.afterResponse,
        cancelImages: actions.cancel,
        executeScoped: (tool, args, session) async {
          if (tool == 'studio_stop_generation') {
            actions.cancelOwned(session);
            return AgentToolResult(
                ok: true,
                title: 'stop',
                output:
                    jsonEncode(await sessions.execute(tool, args, session)));
          }
          return actions.execute(tool, args, session);
        },
        execute: (_, __) async => throw StateError('unscoped'));
    await bridge.start();
    Future<Map> call(String tool, Map<String, dynamic> args, String id,
        {String session = 'one'}) async {
      final req = await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
      req.headers.set('Authorization', 'Bearer ${bridge.token}');
      req.write(jsonEncode(
          {'tool': tool, 'args': args, 'sessionId': session, 'callId': id}));
      final res = await req.close();
      return jsonDecode(await utf8.decoder.bind(res).join()) as Map;
    }

    try {
      final pending = call('langbai_software_action', startArgs(app), 'start');
      await waitFor(() => actions.operation?['state'] == 'awaiting');
      await call('studio_stop_generation', {}, 'foreign', session: 'other');
      expect(actions.busy, true);
      await call('studio_stop_generation', {}, 'stop');
      expect((await pending)['ok'], false);
      expect(app.calls, 0);
      expect(actions.busy, false);
      expect((await call('studio_image_approval', {}, 'none'))['data'], null);
    } finally {
      await bridge.close();
      await actions.close();
      app.dispose();
      client.close(force: true);
      await root.delete(recursive: true);
    }
  });
  test(
      'bridge disconnect while generating cancels own scope and keeps late result',
      () async {
    HttpOverrides.global = null;
    SharedPreferences.setMockInitialValues({});
    final root = await Directory.systemTemp.createTemp('comic-close-http-'),
        app = LaunchApp(LaunchStorage()),
        client = HttpClient();
    final sessions = AgentSessionControls(app);
    await seedBatch(app);
    final gate = Completer<void>();
    app.network = () => gate.future;
    final actions = BatchGenerationActions(
        app: app,
        sessions: sessions,
        root: root,
        approve: (_, __) async => true);
    final bridge = LocalAgentBridge(
        journal: Directory('${root.path}/journal'),
        managesApproval: BatchGenerationActions.handles,
        afterResponse: actions.afterResponse,
        cancelImages: () {
          actions.cancel();
          sessions.close();
        },
        executeScoped: actions.execute,
        execute: (_, __) async => throw StateError('unscoped'));
    await bridge.start();
    try {
      final req = await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
      req.headers.set('Authorization', 'Bearer ${bridge.token}');
      req.write(jsonEncode({
        'tool': 'langbai_software_action',
        'args': startArgs(app),
        'sessionId': 'one',
        'callId': 'start'
      }));
      final reply = await req.close();
      expect(jsonDecode(await utf8.decoder.bind(reply).join())['ok'], true);
      await waitFor(() => app.calls == 1);
      await bridge.close();
      gate.complete();
      await actions.close();
      expect(app.calls, 1);
      expect(app.batchRedraw.project.items.first.candidates, hasLength(1));
      expect(actions.operation!['state'], 'cancelled');
    } finally {
      if (!gate.isCompleted) gate.complete();
      await bridge.close();
      await actions.close();
      app.dispose();
      client.close(force: true);
      await root.delete(recursive: true);
    }
  });
}

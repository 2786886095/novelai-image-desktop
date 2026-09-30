import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/apk_update.dart';
import 'package:novelai_mobile/services/update_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/app_update_actions.dart';
import 'app_update_actions_test.dart' show FakeUpdatePort;

class FixedPlanDevicePort extends DeviceAppUpdatePort {
  final UpdateInfo plan;
  FixedPlanDevicePort(this.plan, ApkUpdateCoordinator coordinator,
      Future<void> Function() beforeInstall)
      : super(
            settings: () => AppSettings(),
            coordinator: coordinator,
            beforeInstall: beforeInstall);
  @override
  Future<UpdateInfo> check() async => plan;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = null;
  test(
      'HTTP durable reply precedes self-close, real file downloader and native handoff',
      () async {
    final root =
        await Directory.systemTemp.createTemp('app-update-device-port-');
    final client = HttpClient();
    late LocalAgentBridge bridge;
    late AppUpdateActions actions;
    final payload = [1, 2, 3, 4];
    final plan = UpdateInfo(
        hasUpdate: true,
        currentVersion: '2.4.3',
        latestVersion: '2.4.4',
        releaseUrl:
            'https://github.com/2786886095/novelai-image-desktop/releases/download/v2.4.4/app-release.apk',
        apkSha256: sha256.convert(payload).toString(),
        apkSize: 4);
    String state = 'idle';
    String? id;
    var stops = 0, installs = 0;
    final done = Completer<void>();
    final coordinator = ApkUpdateCoordinator(
        directory: () async => Directory('${root.path}/updates'),
        clientFactory: (_) =>
            MockClient((_) async => http.Response.bytes(payload, 200)),
        invoke: (method, args) async {
          if (method == 'status') {
            return {'state': state, 'id': id, 'currentVersion': '2.4.3'};
          }
          if (method == 'install') {
            expect(stops, 1);
            expect(args['version'], '2.4.4');
            expect(
                await File(args['filePath'] as String).readAsBytes(), payload);
            id = args['id'] as String;
            state = 'installer_started';
            installs++;
            return state;
          }
          throw StateError('unexpected $method');
        });
    final port = FixedPlanDevicePort(plan, coordinator, () async {
      final receipts = await Directory('${root.path}/journal')
          .list()
          .where((f) => f.path.endsWith('.json'))
          .toList();
      expect(receipts.length, 1);
      expect(
          jsonDecode(await File(receipts.single.path).readAsString())['result']
              ['data']['queued'],
          true);
      await bridge.close();
      stops++;
    });
    actions = AppUpdateActions(
        root: Directory('${root.path}/operations'),
        port: port,
        approve: (_, __) async => true,
        changed: () {
          if (actions.operation?['state'] == 'installer_started' &&
              !done.isCompleted) done.complete();
        });
    bridge = LocalAgentBridge(
        journal: Directory('${root.path}/journal'),
        managesApproval: AppUpdateActions.handles,
        executeScoped: (t, a, s) => actions.execute(t, a, s),
        execute: (t, a) => actions.execute(t, a, 's'),
        afterResponse: actions.afterResponse);
    await bridge.start();
    Future<Map<String, dynamic>> call(
        Map<String, dynamic> args, String callId) async {
      final request = await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
      request.headers.set('Authorization', 'Bearer ${bridge.token}');
      request.write(jsonEncode({
        'tool': 'langbai_software_action',
        'args': args,
        'sessionId': 's',
        'callId': callId
      }));
      final response = await request.close();
      expect(response.statusCode, 200);
      return jsonDecode(await utf8.decoder.bind(response).join())
          as Map<String, dynamic>;
    }

    try {
      final check = await call({'action': 'app.update.check'}, 'check');
      final result = await call({
        'action': 'app.update.install',
        'expectedRevision': check['data']['revision']
      }, 'install');
      expect(result['data']['queued'], true);
      await done.future.timeout(const Duration(seconds: 5));
      await actions.settled();
      expect(installs, 1);
      expect(actions.operation!['state'], 'installer_started');
      expect(coordinator.busy, true);
    } finally {
      client.close(force: true);
      await bridge.close();
      state = 'installer_closed';
      await actions.refresh();
      await root.delete(recursive: true);
    }
  });
  for (final approved in [true, false]) {
    test(
        'actual HTTP once-only approval and journal replay: approved=$approved',
        () async {
      final root = await Directory.systemTemp.createTemp('app-update-http-');
      final client = HttpClient();
      late LocalAgentBridge bridge;
      late AppUpdateActions actions;
      final port = FakeUpdatePort();
      var confirmations = 0;
      actions = AppUpdateActions(
          root: Directory('${root.path}/operations'),
          port: port,
          approve: (s, args) {
            confirmations++;
            return bridge.approveOperation(s, args);
          },
          cancelApproval: (s) =>
              bridge.cancelOperationApproval(s, 'app.update.install'));
      bridge = LocalAgentBridge(
          journal: Directory('${root.path}/journal'),
          managesApproval: AppUpdateActions.handles,
          executeScoped: (tool, args, session) =>
              actions.execute(tool, args, session),
          execute: (tool, args) => actions.execute(tool, args, 's'),
          afterResponse: actions.afterResponse);
      await bridge.start();
      Future<Map<String, dynamic>> call(
          String tool, Map<String, dynamic> args, String id) async {
        final request =
            await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
        request.headers.set('Authorization', 'Bearer ${bridge.token}');
        request.write(jsonEncode(
            {'tool': tool, 'args': args, 'callId': id, 'sessionId': 's'}));
        final response = await request.close();
        expect(response.statusCode, 200);
        return jsonDecode(await utf8.decoder.bind(response).join())
            as Map<String, dynamic>;
      }

      try {
        final check = await call(
            'langbai_software_action', {'action': 'app.update.check'}, 'check');
        final args = {
          'action': 'app.update.install',
          'expectedRevision': check['data']['revision']
        };
        final mutation = call('langbai_software_action', args, 'install');
        Map<String, dynamic>? pending;
        for (var n = 0; n < 100; n++) {
          final reply = await call('studio_image_approval', {}, 'poll-$n');
          if (reply['data'] is Map) {
            pending = Map<String, dynamic>.from(reply['data']);
            break;
          }
          await Future<void>.delayed(const Duration(milliseconds: 5));
        }
        expect(pending, isNotNull);
        expect(pending!['parameters']['platform'], 'android');
        expect(port.downloads, 0);
        expect(
            (await call('langbai_software_action',
                {'action': 'app.update.status'}, 'during'))['ok'],
            true);
        await call('studio_resolve_image_approval',
            {'id': pending['id'], 'approved': approved}, 'resolve');
        final reply = await mutation;
        expect(reply['ok'], approved);
        for (var n = 0; n < 100 && approved && port.installs == 0; n++) {
          await Future<void>.delayed(const Duration(milliseconds: 5));
        }
        await actions.settled();
        expect(confirmations, 1);
        expect(port.installs, approved ? 1 : 0);
        final replay = await call('langbai_software_action', args, 'install');
        expect(replay, reply);
        expect(confirmations, 1);
        expect(port.installs, approved ? 1 : 0);
        final receipts = await Directory('${root.path}/journal')
            .list()
            .where((f) => f.path.endsWith('.json'))
            .toList();
        expect(receipts.length, 1,
            reason: 'read calls do not create install receipts');
      } finally {
        client.close(force: true);
        await bridge.close();
        port.state = 'installer_closed';
        await actions.refresh();
        await actions.cancel();
        await root.delete(recursive: true);
      }
    });
  }
}

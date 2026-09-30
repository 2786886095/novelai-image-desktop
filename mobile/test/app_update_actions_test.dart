import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/app_update_actions.dart';
import 'package:novelai_mobile/agent/operation_approval.dart';
import 'package:novelai_mobile/services/update_service.dart';

class FakeUpdatePort implements AppUpdatePort {
  @override
  bool busy = false;
  @override
  String? nativeId;
  String version = '2.4.3', state = 'idle', stage = 'installer_started';
  int downloads = 0, installs = 0, cancels = 0;
  Completer<void>? downloading;
  Completer<UpdateInfo>? checking;
  bool throwAfterHandoff = false;
  @override
  Future<Map<String, dynamic>> status() async =>
      {'id': nativeId, 'state': state, 'currentVersion': version};
  @override
  Future<UpdateInfo> check() async => checking == null
      ? UpdateInfo(
          hasUpdate: true,
          currentVersion: version,
          latestVersion: '2.4.4',
          releaseUrl:
              'https://github.com/2786886095/novelai-image-desktop/releases/download/v2.4.4/app-release.apk',
          apkSha256: 'a' * 64,
          apkSize: 4)
      : await checking!.future;
  @override
  void reserve(UpdateInfo info) {
    if (busy) throw StateError('busy');
    busy = true;
    nativeId = 'a' * 48;
    state = 'idle';
  }

  @override
  Future<void> download(void Function(double) progress) async {
    downloads++;
    progress(.5);
    await downloading?.future;
    progress(1);
  }

  @override
  Future<String> install() async {
    installs++;
    state = stage;
    if (throwAfterHandoff) throw StateError('lost platform reply');
    return stage;
  }

  @override
  Future<void> cancel(String? id) async {
    if (state == 'installer_started') {
      throw StateError('installer already opened');
    }
    cancels++;
    state = 'cancelled';
    if (downloading != null && !downloading!.isCompleted) {
      downloading!.complete();
    }
  }

  @override
  void release() {
    if (!['checking', 'permission_required', 'installer_started']
        .contains(state)) busy = false;
  }
}

void main() {
  late Directory root;
  late FakeUpdatePort port;
  late AppUpdateActions actions;
  late AgentOperationApprovals approvals;
  int confirmations = 0;
  bool accepted = true;
  setUp(() async {
    root = await Directory.systemTemp.createTemp('agent-app-update-');
    port = FakeUpdatePort();
    approvals = AgentOperationApprovals();
    confirmations = 0;
    accepted = true;
    actions = AppUpdateActions(
        root: root,
        port: port,
        approve: (_, __) async {
          confirmations++;
          return accepted;
        },
        handoffTimeout: const Duration(milliseconds: 50));
  });
  tearDown(() async {
    approvals.close();
    if (port.state == 'installer_started') port.state = 'installer_closed';
    await actions.refresh();
    await actions.cancel();
    await actions.settled();
    await root.delete(recursive: true);
  });
  Future<Map<String, dynamic>> installArgs() async {
    final result = await actions.execute(
        'langbai_software_action', {'action': 'app.update.check'}, 's');
    expect(result.ok, true);
    return {
      'action': 'app.update.install',
      'expectedRevision': jsonDecode(result.output)['revision']
    };
  }

  Future<void> start({bool delivered = true}) async {
    final args = await installArgs();
    final result = await actions.execute('langbai_software_action', args, 's');
    expect(result.ok, true);
    expect(port.downloads, 0);
    expect(port.installs, 0);
    final saved = jsonDecode(
        await File('${root.path}/app-update-operation.json').readAsString());
    expect(saved['state'], 'queued');
    final response = {'ok': true, 'data': jsonDecode(result.output)};
    actions.afterResponse(
        'langbai_software_action', args, 's', 'one', response, delivered);
    actions.afterResponse(
        'langbai_software_action', args, 's', 'one', response, delivered);
  }

  test(
      'one approval, durable response first, no duplicate install, restart version readback only',
      () async {
    await start();
    await actions.settled();
    expect(confirmations, 1);
    expect(port.downloads, 1);
    expect(port.installs, 1);
    expect(actions.operation!['state'], 'installer_started');
    final restarted = AppUpdateActions(
        root: root,
        port: port,
        approve: (_, __) async => throw StateError('unexpected'));
    await restarted.initialize();
    expect(restarted.operation!['state'], 'installer_started');
    expect(port.installs, 1);
    port.version = '2.4.4';
    await restarted.refresh();
    expect(restarted.operation!['state'], 'completed');
    expect(port.installs, 1);
  });
  test('denial and stale revision have no download or native side effects',
      () async {
    final args = await installArgs();
    accepted = false;
    expect((await actions.execute('langbai_software_action', args, 's')).ok,
        false);
    expect(confirmations, 1);
    accepted = true;
    port.version = '2.4.4';
    expect((await actions.execute('langbai_software_action', args, 's')).ok,
        false);
    expect(confirmations, 1);
    expect(port.downloads, 0);
    expect(port.installs, 0);
  });
  test('disconnected response does not install', () async {
    await start(delivered: false);
    await actions.settled();
    expect(actions.operation!['state'], 'interrupted');
    expect(port.downloads, 0);
  });
  test('missing response times out without starting', () async {
    final args = await installArgs();
    expect(
        (await actions.execute('langbai_software_action', args, 's')).ok, true);
    await Future<void>.delayed(const Duration(milliseconds: 100));
    await actions.settled();
    expect(actions.operation!['state'], 'interrupted');
    expect(port.downloads, 0);
  });
  test('cancel during download prevents installer and records interruption',
      () async {
    port.downloading = Completer<void>();
    await start();
    for (var n = 0; n < 100 && port.downloads == 0; n++) {
      await Future<void>.delayed(const Duration(milliseconds: 2));
    }
    expect(port.downloads, 1);
    await actions.cancel();
    expect(port.installs, 0);
    expect(actions.operation!['state'], 'interrupted');
    expect(port.busy, false);
  });
  test(
      'permission wait remains pending and can be cancelled without claiming success',
      () async {
    port.stage = 'permission_required';
    await start();
    await actions.settled();
    expect(actions.pending, true);
    expect(actions.operation!['state'], 'permission_required');
    await actions.cancel();
    expect(actions.operation!['state'], 'interrupted');
    expect(port.cancels, 1);
    expect(actions.pending, false);
  });
  test(
      'platform reply loss after installer start is read back rather than reported cancelled',
      () async {
    port.throwAfterHandoff = true;
    await start();
    await actions.settled();
    expect(actions.operation!['state'], 'installer_started');
    await expectLater(actions.cancel(), throwsStateError);
    expect(port.installs, 1);
    port.state = 'installer_closed';
    await actions.refresh();
    expect(actions.operation!['state'], 'interrupted');
    expect(actions.pending, false);
  });
  test('restart after an interrupted queued job never retries', () async {
    final args = await installArgs();
    await actions.execute('langbai_software_action', args, 's');
    final restarted = AppUpdateActions(
        root: root,
        port: FakeUpdatePort(),
        approve: (_, __) async => throw StateError('unexpected'));
    await restarted.initialize();
    expect(restarted.operation!['state'], 'interrupted');
    expect(port.downloads, 0);
  });
  test('cancel only the matching operation approval, reads remain available',
      () async {
    actions = AppUpdateActions(
        root: root,
        port: port,
        approve: (s, args) =>
            approvals.wait(s, 'langbai_software_action', args),
        cancelApproval: (s) =>
            approvals.cancelOperation(s, 'app.update.install'));
    final args = await installArgs();
    final pending = actions.execute('langbai_software_action', args, 's');
    for (var n = 0; n < 100 && approvals.read('s') == null; n++) {
      await Future<void>.delayed(const Duration(milliseconds: 2));
    }
    expect(approvals.read('s'), isNotNull);
    expect(
        (await actions.execute('langbai_software_action',
                {'action': 'app.update.status'}, 'other'))
            .ok,
        true);
    final other = approvals.wait(
        'other', 'langbai_software_action', {'action': 'component.install'});
    await actions.cancel();
    expect((await pending).ok, false);
    expect(approvals.read('s'), isNull);
    expect(approvals.read('other'), isNotNull);
    approvals.close();
    expect(await other, false);
    expect(port.downloads, 0);
  });
  test('cancel during metadata check does not cancel a previous native receipt',
      () async {
    port.checking = Completer<UpdateInfo>();
    final check = actions.execute(
        'langbai_software_action', {'action': 'app.update.check'}, 's');
    for (var n = 0; n < 100 && !actions.busy; n++) {
      await Future<void>.delayed(const Duration(milliseconds: 2));
    }
    await actions.cancel();
    port.checking!
        .complete(const UpdateInfo(hasUpdate: false, currentVersion: '2.4.3'));
    expect((await check).ok, false);
    expect(port.cancels, 0);
  });
  test('rejects malformed journal and unknown install parameters', () async {
    final args = await installArgs();
    expect(
        (await actions.execute('langbai_software_action',
                {...args, 'url': 'https://example.invalid'}, 's'))
            .ok,
        false);
    expect(confirmations, 0);
    await File('${root.path}/app-update-operation.json')
        .writeAsString('{broken');
    final restarted = AppUpdateActions(
        root: root, port: port, approve: (_, __) async => true);
    expect(
        (await restarted.execute('langbai_software_action',
                {'action': 'app.update.status'}, 's'))
            .ok,
        false);
    expect(port.downloads, 0);
  });
}

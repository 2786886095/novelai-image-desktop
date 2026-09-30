import 'dart:io';
import 'dart:async';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/services/update_service.dart';
import 'package:novelai_mobile/services/apk_update.dart';
import 'package:novelai_mobile/models/nai_models.dart';

void main() {
  late Directory dir;
  setUp(() async {
    dir = await Directory.systemTemp.createTemp('studio-update-test-');
  });
  tearDown(() async {
    await dir.delete(recursive: true);
  });
  const url =
      'https://github.com/2786886095/novelai-image-desktop/releases/download/v99.0.0/app-release.apk';
  final payload = [1, 2, 3, 4];
  UpdateInfo info({String? hash, String? link, int? size}) => UpdateInfo(
      hasUpdate: true,
      currentVersion: '2.4.3',
      latestVersion: '99.0.0',
      releaseUrl: link ?? url,
      apkSha256: hash ?? sha256.convert(payload).toString(),
      apkSize: size ?? 4);
  test('verifies bytes, caches by digest, and does not redownload a valid APK',
      () async {
    var requests = 0;
    final client = MockClient((r) async {
      requests++;
      return http.Response.bytes(payload, 200);
    });
    final progress = <double>[];
    final file = await downloadVerifiedApk(client, info(), dir, progress.add);
    expect(await file.readAsBytes(), payload);
    expect(progress.last, 1);
    await downloadVerifiedApk(client, info(), dir, progress.add);
    expect(requests, 1);
  });
  test('rejects corrupted, oversized, and truncated downloads', () async {
    for (final content in [
      [9, 8, 7, 6],
      [1, 2, 3, 4, 5],
      [1, 2]
    ]) {
      final client = MockClient((r) async => http.Response.bytes(content, 200));
      await expectLater(downloadVerifiedApk(client, info(), dir, (_) {}),
          throwsFormatException);
      expect(await dir.list().toList(), isEmpty);
    }
  });
  test('checks origin and metadata before any download', () async {
    var requests = 0;
    final client = MockClient((r) async {
      requests++;
      return http.Response.bytes(payload, 200);
    });
    for (final value in [
      info(link: 'https://example.test/app-release.apk'),
      info(hash: 'missing'),
      info(size: 0)
    ]) {
      await expectLater(downloadVerifiedApk(client, value, dir, (_) {}),
          throwsFormatException);
    }
    expect(requests, 0);
  });
  test('revalidates the cached file rather than trusting its filename',
      () async {
    final client = MockClient((r) async => http.Response.bytes(payload, 200));
    final file = await downloadVerifiedApk(client, info(), dir, (_) {});
    await file.writeAsBytes([0, 0, 0, 0]);
    await downloadVerifiedApk(client, info(), dir, (_) {});
    expect(await file.readAsBytes(), payload);
  });
  test('rejects a different release asset before any download', () async {
    var requests = 0;
    final client = MockClient((r) async {
      requests++;
      return http.Response.bytes(payload, 200);
    });
    await expectLater(
        downloadVerifiedApk(client,
            info(link: url.replaceFirst('v99.0.0', 'v98.0.0')), dir, (_) {}),
        throwsFormatException);
    expect(requests, 0);
  });
  test('lease excludes settings and Agent, cancelled capability cannot install',
      () async {
    var installs = 0;
    final coordinator = ApkUpdateCoordinator(
        directory: () async => dir,
        clientFactory: (_) =>
            MockClient((_) async => http.Response.bytes(payload, 200)),
        invoke: (method, args) async {
          if (method == 'status') {
            return {'state': 'idle', 'currentVersion': '2.4.3'};
          }
          if (method == 'install') {
            installs++;
            return 'installer_started';
          }
          return true;
        });
    final session = coordinator.reserve(AppSettings(), info());
    expect(() => coordinator.reserve(AppSettings(), info()), throwsStateError);
    await session.download((_) {});
    await session.cancel();
    await expectLater(session.install(), throwsStateError);
    expect(installs, 0);
    expect(coordinator.busy, false);
  });
  test('rehashes bytes immediately before the native install call', () async {
    var installs = 0;
    final coordinator = ApkUpdateCoordinator(
        directory: () async => dir,
        clientFactory: (_) =>
            MockClient((_) async => http.Response.bytes(payload, 200)),
        invoke: (method, args) async {
          if (method == 'status') {
            return {'state': 'idle', 'currentVersion': '2.4.3'};
          }
          installs++;
          return 'installer_started';
        });
    final session = coordinator.reserve(AppSettings(), info());
    await session.download((_) {});
    await (await dir.list().where((f) => f.path.endsWith('.apk')).single
            as File)
        .writeAsBytes([0, 0, 0, 0]);
    await expectLater(session.install(), throwsStateError);
    expect(installs, 0);
    session.release();
    expect(coordinator.busy, false);
  });
  test('idle network stream cancellation closes partial and releases lease',
      () async {
    final stream = StreamController<List<int>>();
    final ready = Completer<void>();
    final coordinator = ApkUpdateCoordinator(
        directory: () async => dir,
        clientFactory: (_) => MockClient.streaming((_, __) async {
              ready.complete();
              return http.StreamedResponse(stream.stream, 200);
            }),
        invoke: (_, __) async => {'state': 'idle', 'currentVersion': '2.4.3'});
    final session = coordinator.reserve(AppSettings(), info());
    final download = session.download((_) {});
    final error = expectLater(download, throwsStateError);
    await ready.future;
    await Future<void>.delayed(const Duration(milliseconds: 10));
    await session.cancel();
    await error.timeout(const Duration(seconds: 2));
    expect(await dir.list().toList(), isEmpty);
    expect(coordinator.busy, false);
    await stream.close();
  });
  test(
      'pending system permission keeps lease until cancellation or system close',
      () async {
    String state = 'idle';
    String? id;
    final coordinator = ApkUpdateCoordinator(
        directory: () async => dir,
        clientFactory: (_) =>
            MockClient((_) async => http.Response.bytes(payload, 200)),
        invoke: (method, args) async {
          if (method == 'status') {
            return {'state': state, 'id': id, 'currentVersion': '2.4.3'};
          }
          if (method == 'install') {
            id = args['id'];
            state = 'permission_required';
            return state;
          }
          state = 'cancelled';
          return true;
        });
    var session = coordinator.reserve(AppSettings(), info());
    await session.download((_) {});
    expect(await session.install(), 'permission_required');
    session.release();
    expect(coordinator.busy, true);
    await session.cancel();
    expect(coordinator.busy, false);
    session = coordinator.reserve(AppSettings(), info());
    await session.download((_) {});
    await session.install();
    state = 'installer_closed';
    await coordinator.nativeStatus();
    expect(coordinator.busy, false);
  });
  test(
      'already-cancelled future is observed without orphan asynchronous errors',
      () async {
    final cancel = UpdateCancellation()..cancel();
    await expectLater(cancel.wait(Future<int>.error(StateError('late error'))),
        throwsStateError);
  });
}

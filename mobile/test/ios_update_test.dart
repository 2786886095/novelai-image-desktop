// Host authoring only: real TLS/files, synthetic native-status dependency.
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/ios_update.dart';
import 'package:novelai_mobile/services/proxy_http_client.dart';
import 'package:novelai_mobile/services/update_service.dart';
import '../integration_test/native_ios_update_tls_fixture.dart';

Map<String, dynamic> hostStatus() => {
      'state': 'download_only',
      'downloadSupported': true,
      'installSupported': false,
      'documentsVisible': true,
      'openDocumentsInPlace': true,
      'appDisplayName': 'Langbai Studio',
      'currentVersion': appVersion,
      'currentBuild': '180',
      'bundleIdentifier': 'host.authoring.only'
    };
// Real isolated filesystem aliases, not a replacement filesystem/channel.
Future<void> createDirectoryAlias(Link alias, Directory target) async {
  if (Platform.isWindows) {
    String quote(String value) => "'${value.replaceAll("'", "''")}'";
    final result = Process.runSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'New-Item -ItemType Junction -Path ${quote(alias.path)} -Target ${quote(target.path)} | Out-Null'
    ]);
    expect(result.exitCode, 0, reason: '${result.stderr}');
  } else {
    await alias.create(target.path);
  }
  expect(await FileSystemEntity.type(alias.path, followLinks: false),
      FileSystemEntityType.link);
}

UpdateInfo cacheFixtureInfo(Uint8List bytes) => UpdateInfo(
    hasUpdate: true,
    currentVersion: appVersion,
    latestVersion: '99.0.0',
    ipaUrl: NativeIosUpdateTlsFixture.ipaUrl,
    ipaSha256: sha256.convert(bytes).toString(),
    ipaSize: bytes.length);

Future<void> main() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('default download is in app Documents with configured Files visibility',
      () async {
    final previous = HttpOverrides.current;
    HttpOverrides.global = null;
    final fixture = await NativeIosUpdateTlsFixture.open();
    fixture.trustInDisposableProcess();
    final root = await Directory.systemTemp.createTemp('ios-documents-host-');
    final documents = await Directory('${root.path}/documents').create();
    final temporary = await Directory('${root.path}/temporary').create();
    final directoryCalls = <String>[];
    const channel = MethodChannel('plugins.flutter.io/path_provider');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      directoryCalls.add(call.method);
      return switch (call.method) {
        'getApplicationDocumentsDirectory' => documents.path,
        'getTemporaryDirectory' => temporary.path,
        _ => throw StateError('Unexpected directory request: ${call.method}'),
      };
    });
    final settings = AppSettings(
        proxyMode: 'custom', proxyUrl: fixture.proxyUrl, proxyForUpdate: true);
    final client = createProxyHttpClient(settings, scope: ProxyScope.update);
    try {
      final plist = File('ios/Runner/Info.plist').readAsStringSync();
      for (final key in [
        'UIFileSharingEnabled',
        'LSSupportsOpeningDocumentsInPlace'
      ]) {
        expect(RegExp('<key>$key</key>\\s*<true/>').hasMatch(plist), isTrue);
      }
      expect(
          RegExp(r'<key>CFBundleDisplayName</key>\s*<string>Langbai Studio</string>')
              .hasMatch(plist),
          isTrue);
      final info =
          await checkAppUpdateWithClient(client, isAndroid: false, isIOS: true);
      final owner = IosUpdateCoordinator(invoke: (_) async => hostStatus());
      final session = owner.reserve(settings, info);
      final file = await session.download((_) {});
      session.release();
      expect(
          await file.parent.resolveSymbolicLinks(),
          await Directory('${documents.path}/ios-updates')
              .resolveSymbolicLinks());
      expect(directoryCalls, ['getApplicationDocumentsDirectory']);
      expect(file.path.startsWith('${temporary.path}/'), isFalse);
      expect(temporary.listSync(), isEmpty);
      expect(await file.readAsBytes(), fixture.artifact);
    } finally {
      client.close();
      await fixture.close();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
      await root.delete(recursive: true);
      HttpOverrides.global = previous;
    }
  });
  test(
      'iOS missing native capability and changed installed version fail closed',
      () async {
    final root = await Directory.systemTemp.createTemp('ios-capability-host-');
    final valid = UpdateInfo(
        hasUpdate: true,
        currentVersion: appVersion,
        latestVersion: '99.0.0',
        ipaUrl: NativeIosUpdateTlsFixture.ipaUrl,
        ipaSha256: 'a' * 64,
        ipaSize: 4);
    try {
      for (final status in [
        {...hostStatus(), 'installSupported': true},
        {...hostStatus(), 'currentVersion': '0.0.1'}
      ]) {
        var sockets = 0;
        final owner = IosUpdateCoordinator(
            directory: () async => root,
            invoke: (_) async => status,
            clientFactory: (_) {
              sockets++;
              throw StateError('Must not create HTTP');
            });
        final session = owner.reserve(AppSettings(), valid);
        await expectLater(session.download((_) {}), throwsStateError);
        session.release();
        expect(sockets, 0);
        expect(root.listSync(), isEmpty);
        expect(owner.busy, isFalse);
      }
      final owner = IosUpdateCoordinator(
          directory: () async => root, invoke: (_) async => hostStatus());
      final ready = Directory('${root.path}/studio-${valid.ipaSha256}.ipa');
      await ready.create();
      final session = owner.reserve(AppSettings(), valid);
      await expectLater(
          session.download((_) {}), throwsA(isA<FileSystemException>()));
      session.release();
      expect(ready.existsSync(), isTrue);
      expect(root.listSync().length, 1);
    } finally {
      await root.delete(recursive: true);
    }
  });
  test(
      'real IPA metadata/download verifies, caches, rehashes, rejects failures, cancels owned stream',
      () async {
    final previous = HttpOverrides.current;
    HttpOverrides.global = null;
    final fixture = await NativeIosUpdateTlsFixture.open();
    fixture.trustInDisposableProcess();
    final root = await Directory.systemTemp.createTemp('ios-update-host-');
    final settings = AppSettings(
        proxyMode: 'custom', proxyUrl: fixture.proxyUrl, proxyForUpdate: true);
    var nativeCalls = 0;
    final coordinator = IosUpdateCoordinator(
        directory: () async => root,
        invoke: (method) async {
          nativeCalls++;
          expect(method, 'status');
          return hostStatus();
        });
    final client = createProxyHttpClient(settings, scope: ProxyScope.update);
    try {
      final info =
          await checkAppUpdateWithClient(client, isAndroid: false, isIOS: true);
      expect(info.error, isNull);
      expect(info.ipaSha256, fixture.artifactDigest);
      expect(info.ipaSize, fixture.artifact.length);
      expect(info.apkSha256, isNull);
      final phases = <String>[], progress = <double>[];
      final session = coordinator.reserve(settings, info);
      expect(() => coordinator.reserve(settings, info), throwsStateError);
      final file = await session.download(progress.add, phase: phases.add);
      session.release();
      expect(await file.readAsBytes(), fixture.artifact);
      expect(phases, ['downloading', 'verifying', 'ready']);
      expect(progress.last, 1);
      final before = fixture.requests.length;
      final cached = coordinator.reserve(settings, info);
      await cached.download((_) {});
      cached.release();
      expect(fixture.requests.length, before);
      await file.writeAsString('corrupt cached bytes');
      final repaired = coordinator.reserve(settings, info);
      await repaired.download((_) {});
      repaired.release();
      expect(await file.readAsBytes(), fixture.artifact);
      await file.delete();
      for (final mode in ['corrupt', 'oversize', 'truncated', 'http-error']) {
        fixture.mode = mode;
        final failed = coordinator.reserve(settings, info);
        try {
          await expectLater(failed.download((_) {}),
              throwsA(anyOf(isA<FormatException>(), isA<HttpException>())));
        } finally {
          failed.release();
        }
        expect(await root.list().toList(), isEmpty);
        expect(coordinator.busy, isFalse);
      }
      final calls = fixture.requests.length, nativeBefore = nativeCalls;
      for (final bad in [
        UpdateInfo(
            hasUpdate: true,
            currentVersion: appVersion,
            latestVersion: '99.0.0',
            ipaUrl: info.ipaUrl!.replaceFirst('github.com', 'github.com:444'),
            ipaSha256: info.ipaSha256,
            ipaSize: info.ipaSize),
        UpdateInfo(
            hasUpdate: true,
            currentVersion: appVersion,
            latestVersion: '99.0.0',
            ipaUrl: 'http://127.0.0.1/not-trusted.ipa',
            ipaSha256: info.ipaSha256,
            ipaSize: info.ipaSize),
        UpdateInfo(
            hasUpdate: true,
            currentVersion: appVersion,
            latestVersion: '99.0.0',
            ipaUrl: info.ipaUrl,
            ipaSha256: '',
            ipaSize: info.ipaSize),
        UpdateInfo(
            hasUpdate: true,
            currentVersion: appVersion,
            latestVersion: '98.0.0',
            ipaUrl: info.ipaUrl,
            ipaSha256: info.ipaSha256,
            ipaSize: info.ipaSize),
      ]) {
        expect(() => coordinator.reserve(settings, bad), throwsFormatException);
      }
      expect(fixture.requests.length, calls);
      expect(nativeCalls, nativeBefore);
      fixture.mode = 'hold';
      final held = coordinator.reserve(settings, info);
      final pending = held.download((_) {});
      final expected = expectLater(pending, throwsStateError);
      while (!fixture.requests
          .skip(calls)
          .any((r) => (r['path'] as String).endsWith('.ipa'))) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      held.release();
      expect(coordinator.busy, isTrue,
          reason: 'Caller cannot release a still-running request');
      await held.cancel();
      await expected;
      expect(coordinator.busy, isFalse);
      expect(await root.list().toList(), isEmpty);
      expect(fixture.errors, isEmpty);
      // ignore: avoid_print
      print(
          'IOS_DOWNLOAD exactBytes=true cacheRehashed=true failures=4 invalidMetadataBeforeRequest=true cancelNoPartial=true installerCalls=0');
    } finally {
      client.close();
      await fixture.close();
      await root.delete(recursive: true);
      HttpOverrides.global = previous;
    }
  });
  test('IPA cache root alias fails before HTTP and cannot write outside',
      () async {
    final root = await Directory.systemTemp.createTemp('ios-root-link-host-');
    final outside = await Directory('${root.path}/outside').create();
    final alias = Link('${root.path}/ios-updates');
    var requests = 0;
    IosUpdateSession? session;
    try {
      await createDirectoryAlias(alias, outside);
      final owner = IosUpdateCoordinator(
          directory: () async => Directory(alias.path),
          invoke: (_) async => hostStatus(),
          clientFactory: (_) {
            requests++;
            throw StateError('No HTTP may start for an alias cache root');
          });
      session = owner.reserve(AppSettings(),
          cacheFixtureInfo(Uint8List.fromList([80, 75, 3, 4, 17, 29])));
      await expectLater(
          session.download((_) {}), throwsA(isA<FileSystemException>()));
      expect(requests, 0);
      expect(outside.listSync(), isEmpty);
    } finally {
      session?.release();
      if (await alias.exists()) await alias.delete();
      await root.delete(recursive: true);
    }
  });
  test('IPA cache permits a canonical system-style parent alias', () async {
    final root = await Directory.systemTemp.createTemp('ios-parent-link-host-');
    final realParent = await Directory('${root.path}/real-parent').create();
    final aliasParent = Link('${root.path}/system-parent-alias');
    final bytes = Uint8List.fromList([80, 75, 3, 4, 31, 47]);
    IosUpdateSession? session;
    try {
      await createDirectoryAlias(aliasParent, realParent);
      final owner = IosUpdateCoordinator(
          directory: () async => Directory('${aliasParent.path}/ios-updates'),
          invoke: (_) async => hostStatus(),
          clientFactory: (_) =>
              MockClient((_) async => http.Response.bytes(bytes, 200)));
      session = owner.reserve(AppSettings(), cacheFixtureInfo(bytes));
      final file = await session.download((_) {});
      expect(await file.readAsBytes(), bytes);
      expect(
          await file.parent.resolveSymbolicLinks(),
          await Directory('${realParent.path}/ios-updates')
              .resolveSymbolicLinks());
      expect(
          FileSystemEntity.identicalSync(file.path,
              '${realParent.path}/ios-updates/${file.uri.pathSegments.last}'),
          isTrue);
    } finally {
      session?.release();
      if (await aliasParent.exists()) await aliasParent.delete();
      await root.delete(recursive: true);
    }
  });
  test('a regular file at IPA cache root is preserved and rejected before HTTP',
      () async {
    final root = await Directory.systemTemp.createTemp('ios-root-file-host-');
    final cache =
        await File('${root.path}/ios-updates').writeAsString('keep original');
    var requests = 0;
    IosUpdateSession? session;
    try {
      final owner = IosUpdateCoordinator(
          directory: () async => Directory(cache.path),
          invoke: (_) async => hostStatus(),
          clientFactory: (_) {
            requests++;
            throw StateError('No HTTP');
          });
      session = owner.reserve(
          AppSettings(), cacheFixtureInfo(Uint8List.fromList([80, 75, 3, 4])));
      await expectLater(
          session.download((_) {}), throwsA(isA<FileSystemException>()));
      expect(requests, 0);
      expect(await cache.readAsString(), 'keep original');
      expect(root.listSync().length, 1);
    } finally {
      session?.release();
      await root.delete(recursive: true);
    }
  });
}

// Genuine iOS download-only preparation: no codesign, installation, fake channel,
// fake HTTP client, user profile or public network. Host compile is not a pass.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/ios_update_card.dart';
import 'package:novelai_mobile/services/ios_update.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/update_service.dart';
import 'native_ios_update_tls_fixture.dart';
import 'native_scenario_support.dart';
import 'native_ui_actions.dart';

final suite = NativeScenarios(2);
Future<void> main() => suite.run(_run);
Future<void> _tap(String key) async {
  await nativeUiWait(
      () => nativeUiElements((w) => w.key == ValueKey(key)).isNotEmpty,
      'iOS production update $key');
  await nativeUiTap(nativeUiElements((w) => w.key == ValueKey(key)).single);
}

Future<void> _idle() async => nativeUiWait(
    () => nativeUiElements((w) => w.key == const ValueKey('ios-update-cancel'))
        .isEmpty,
    'iOS request settled');
Future<Map<String, String>> _snapshot(File source) async => {
      'settings': digest(
          utf8.encode(jsonEncode((await Storage().getSettings()).toJson()))),
      'params': digest(
          utf8.encode(jsonEncode((await Storage().getParams()).toJson()))),
      'history': digest(utf8.encode(jsonEncode(
          (await Storage().getHistory()).map((x) => x.toJson()).toList()))),
      'vault': digest(utf8.encode((await Storage().getToken()) ?? '')),
      'output': digest(await source.readAsBytes()),
    };
Future<void> _run() async {
  require(Platform.isIOS,
      'This entry requires the real iOS engine/Bundle/vault/files');
  final c = await NativeContext.create('ios-update2'),
      fixture = await NativeIosUpdateTlsFixture.open();
  final coordinator = IosUpdateCoordinator();
  try {
    fixture.trustInDisposableProcess();
    c.app.settings = AppSettings.fromJson({
      ...c.app.settings.toJson(),
      'proxyMode': 'custom',
      'proxyUrl': fixture.proxyUrl,
      'proxyForUpdate': true
    });
    await c.storage.setSettings(c.app.settings);
    final nativeBefore = await coordinator.nativeStatus();
    require(
        nativeBefore['documentsVisible'] == true &&
            nativeBefore['openDocumentsInPlace'] == true &&
            nativeBefore['appDisplayName'] == 'Langbai Studio',
        'Actual Bundle Files-sharing flags/display name differ from visible IPA retrieval instructions');
    require(
        nativeBefore['installSupported'] == false &&
            nativeBefore['downloadSupported'] == true &&
            nativeBefore['currentVersion'] == appVersion,
        'Actual native download-only Bundle status differs');
    await nativeUiMount(
        c.app,
        Scaffold(
            body: SingleChildScrollView(
                child: IosUpdateCard(coordinator: coordinator))));
    await _tap('ios-update-check');
    await nativeUiWait(
        () => !c.app.updateChecking && c.app.updateInfo?.hasUpdate == true,
        'real production iOS asset discovery');
    final info = c.app.updateInfo!;
    require(
        info.ipaUrl == NativeIosUpdateTlsFixture.ipaUrl &&
            info.ipaSha256 == fixture.artifactDigest &&
            info.ipaSize == fixture.artifact.length &&
            info.apkSha256 == null,
        'iOS updater bound HTML/APK instead of independent IPA metadata');
    final ready = File(
        '${(await getApplicationDocumentsDirectory()).path}/ios-updates/studio-${info.ipaSha256}.ipa');
    final folder = ready.parent;
    require(!await ready.exists(),
        'Disposable test unexpectedly has a ready fixture cache');
    await _tap('ios-update-download');
    await _idle();
    require(
        await verifyIpaFile(ready, info) &&
            digest(await ready.readAsBytes()) == fixture.artifactDigest,
        'Production visible download did not save exact verified bytes');
    require(
        nativeUiElements(
            (w) => w.key == const ValueKey('ios-update-ready-path')).isNotEmpty,
        'Visible verified-not-installed result missing');
    final count = fixture.requests.length;
    await _tap('ios-update-download');
    await _idle();
    require(fixture.requests.length == count,
        'Verified cache was downloaded again');
    await ready.writeAsString('tampered updater-owned cache');
    await _tap('ios-update-download');
    await _idle();
    require(await verifyIpaFile(ready, info),
        'Cache digest was not rechecked/repaired');
    await ready.delete();
    final failures = <String>[];
    for (final mode in ['corrupt', 'oversize', 'truncated', 'http-error']) {
      fixture.mode = mode;
      await _tap('ios-update-download');
      await _idle();
      require(
          nativeUiElements((w) => w.key == const ValueKey('ios-update-error'))
              .isNotEmpty,
          '$mode failed without visible error');
      require(
          !await ready.exists() &&
              !(await folder.list().toList())
                  .whereType<File>()
                  .any((f) => f.path.endsWith('.part')) &&
              !coordinator.busy,
          '$mode left ready/partial file or lease');
      failures.add(mode);
    }
    final beforeRejected = fixture.requests.length;
    var rejected = false;
    try {
      coordinator.reserve(
          c.app.settings,
          UpdateInfo(
              hasUpdate: true,
              currentVersion: appVersion,
              latestVersion: info.latestVersion,
              ipaUrl: 'http://127.0.0.1/untrusted.ipa',
              ipaSha256: info.ipaSha256,
              ipaSize: info.ipaSize));
    } catch (e) {
      rejected = e is FormatException;
    }
    require(rejected && fixture.requests.length == beforeRejected,
        'Untrusted IPA URL reached transport');
    suite.check('updates', 'download-verify-failure', {
      'actualProductionVisibleCheckDownloadAndVerify': true,
      'ownIpaMetadata': true,
      'realTlsStreamingBytes': fixture.artifact.length,
      'sha256': fixture.artifactDigest,
      'verifiedCacheRehashed': true,
      'failedModes': failures,
      'invalidUrlRejectedBeforeHttp': true,
      'partialAndInvalidReadyAbsent': true,
      'nativeBundleVersion': nativeBefore['currentVersion'],
      'unsignedTestOnlyZipNotInstallable': true,
      'actualApplicationDocumentsFile': true,
      'systemShareOrFilesUiNotExecuted': true,
      'codesignPerformed': false,
      'installerExecuted': false
    });

    final source = await File('${c.root.path}/synthetic-user-output.png')
        .writeAsBytes(png(64, 64));
    await c.storage.setToken(syntheticToken);
    await c.storage.writeHistory([
      HistoryItem(
          id: 'ios-update-owned',
          filePath: source.path,
          date: '2026-10-17',
          createdAt: '2026-10-17T00:00:00.000Z',
          seed: 42,
          model: 'nai-diffusion-5-full',
          width: 64,
          height: 64,
          prompt: 'synthetic preserved output',
          params: c.app.params.toJson())
    ]);
    final before = await _snapshot(source);
    fixture.mode = 'normal';
    await _tap('ios-update-download');
    await _idle();
    require(
        await verifyIpaFile(ready, info) &&
            jsonEncode(await _snapshot(source)) == jsonEncode(before),
        'Verified IPA download changed real native profile');
    await ready.delete();
    fixture.mode = 'hold';
    final start = fixture.requests.length;
    await _tap('ios-update-download');
    await nativeUiWait(
        () => fixture.requests
            .skip(start)
            .any((r) => (r['path'] as String).endsWith('.ipa')),
        'held actual TLS IPA request');
    await _tap('ios-update-cancel');
    await _idle();
    require(
        !coordinator.busy &&
            !await ready.exists() &&
            !(await folder.list().toList())
                .whereType<File>()
                .any((f) => f.path.endsWith('.part')),
        'Cancelled IPA left artifact/lease');
    require(jsonEncode(await _snapshot(source)) == jsonEncode(before),
        'iOS download/cancel changed native vault/preferences/history/output');
    final nativeAfter = await coordinator.nativeStatus();
    require(jsonEncode(nativeAfter) == jsonEncode(nativeBefore),
        'Native installed Bundle version/identity changed at download-only boundary');
    require(
        fixture.errors.isEmpty &&
            fixture.requests.every((r) =>
                r['method'] == 'GET' &&
                r['requestBodyBytes'] == 0 &&
                r['authorizationPresent'] == false),
        'Updater leaked credential/body or escaped TLS fixture');
    suite.check('updates', 'profile-preserved-update-boundary', {
      'actualNativeVaultSettingsParamsHistoryReadback': true,
      'profileHashes': before,
      'ownedOutputBytesPreserved': true,
      'productionDownloadAndVisibleCancel': true,
      'heldRequestObservedBeforeCancel': true,
      'readyAndPartialAbsent': true,
      'nativeBundleBefore': nativeBefore,
      'nativeBundleAfter': nativeAfter,
      'downloadOnlyBoundary': true,
      'postInstallPreservationNotClaimed': true,
      'codesignPerformed': false,
      'installerExecuted': false
    });
  } finally {
    await nativeUiMount(c.app, const SizedBox.shrink());
    await fixture.close();
    await c.close();
  }
}

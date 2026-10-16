// Three complete metadata-import client journeys; device execution is mandatory.
// Stock WebView/WKWebView sandbox, pinned official assets and production widgets.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/images/metadata_recovery.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/metadata_inspector_screen.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/ui/studio_dropdown.dart';
import 'native_scenario_support.dart';
import 'native_ui_actions.dart';
import 'native_metadata_fixture_data.dart';

final suite = NativeScenarios(3);
void _openGenerate() {
  final page = nativeUiElements((w) => w is MetadataInspectorScreen).single;
  unawaited(Navigator.of(page)
      .push(MaterialPageRoute<void>(builder: (_) => const GenerateScreen())));
}

Future<void> _returnToInspector() async {
  await nativeUiWait(
      () => nativeUiElements((w) => w is GenerateScreen).isNotEmpty,
      'actual selected Apply navigation');
  Navigator.of(nativeUiElements((w) => w is GenerateScreen).single).pop();
  await frame();
  await frame();
}

Future<void> main() => suite.run(_run);
Future<Uint8List> _get(String url, List<String> gets) async {
  final client = HttpClient();
  try {
    final r = await client.getUrl(Uri.parse(url));
    r.followRedirects = false;
    gets.add('${r.method} ${r.uri}');
    final response = await r.close();
    require(response.statusCode == 200, 'GET $url HTTP ${response.statusCode}');
    final body = BytesBuilder();
    await for (final b in response) {
      body.add(b);
    }
    return body.takeBytes();
  } finally {
    client.close(force: true);
  }
}

Future<void> _keyTap(String key) async {
  for (var i = 0; i < 30; i++) {
    final target = nativeUiElements((w) => w.key == ValueKey(key));
    if (target.isNotEmpty) {
      await nativeUiTap(target.single);
      return;
    }
    final scrolls = nativeUiElements((w) => w is Scrollable);
    require(scrolls.isNotEmpty, 'No scrollable for $key');
    final state = (scrolls.first as StatefulElement).state as ScrollableState;
    state.position.jumpTo(
        (state.position.pixels + 280).clamp(0, state.position.maxScrollExtent));
    await frame();
  }
  throw StateError('Missing actual metadata control $key');
}

Future<void> _mode(MetadataRecoveryMode mode) async {
  final scroll = nativeUiElements((w) => w is Scrollable);
  if (scroll.isNotEmpty) {
    final state = (scroll.first as StatefulElement).state as ScrollableState;
    state.position.jumpTo(0);
    await frame();
  }
  final selector =
      nativeUiElements((w) => w is StudioDropdownButton<MetadataRecoveryMode>);
  require(selector.length == 1, 'Missing actual mode selector');
  await nativeUiTap(selector.single);
  await nativeUiTextTap(mode == MetadataRecoveryMode.offline
      ? 'Offline: local parser'
      : 'Online: official parser (default)');
}

Future<void> _awaitReport() async {
  for (var i = 0; i < 400; i++) {
    if (nativeUiElements(
            (w) => w.key == const ValueKey('metadata-selection-clear'))
        .isNotEmpty) {
      return;
    }
    final scroll = nativeUiElements((w) => w is Scrollable);
    if (scroll.isNotEmpty) {
      final state = (scroll.first as StatefulElement).state as ScrollableState;
      state.position.jumpTo((state.position.pixels + 200)
          .clamp(0, state.position.maxScrollExtent));
    }
    await frame();
  }
  throw StateError('Production metadata page did not produce report');
}

Future<void> _run() async {
  final c = await NativeContext.create('metadata-import');
  final gets = <String>[], ids = <String>[];
  final reader = MetadataRecoveryReader(fetchAsset: (id) {
    ids.add(id);
    return _get('http://127.0.0.1:18786/assets/$id', gets);
  });
  try {
    final pngBytes =
        await _get('http://127.0.0.1:18786/fixtures/rgba-8-plain.png', gets);
    final webpBytes = await _get(
        'http://127.0.0.1:18786/fixtures/webp-lossless-alpha.webp', gets);
    final conflict = await _get(
        'http://127.0.0.1:18786/fixtures/png-text-plus-stealth.png', gets);
    final source =
        await File('${c.root.path}/original.png').writeAsBytes(pngBytes);
    final originalHash = digest(pngBytes);
    await c.storage.saveMetadataInspectorImage(pngBytes, 'original.png');
    c.app.params.positivePrompt = 'keep before apply';
    c.app.params.negativePrompt = 'preserve negative';
    c.app.params.seed = 98765;
    c.app.params.seedMode = 'fixed';
    c.app.extras.charCaptions = [CharCaptionItem(prompt: 'preserve character')];
    await nativeUiMount(
        c.app,
        MetadataInspectorScreen(
            onBack: () {},
            onOpenGenerate: _openGenerate,
            recoveryReader: reader));
    final selector = nativeUiElements(
            (w) => w is StudioDropdownButtonFormField<MetadataRecoveryMode>)
        .single
        .widget as StudioDropdownButtonFormField<MetadataRecoveryMode>;
    require(selector.value == MetadataRecoveryMode.online,
        'Page does not default online');
    await _awaitReport();
    require(c.app.params.positivePrompt == 'keep before apply',
        'Inspection silently applied fields');
    for (final bytes in [pngBytes, webpBytes]) {
      final report = await reader.read(bytes);
      require(
          report.imported.seed == 424242 &&
              report.imported.positivePrompt == 'blue sky, 白色衣服',
          'Actual official engine PNG/WebP result differs');
    }
    require(ids.length == 10 && ids.toSet().length == 10,
        'Pinned official asset cache not ten GETs');
    final online = await reader.read(conflict);
    require(
        online.software == 'Celsys Studio Tool' &&
            online.imported.seed == null &&
            online.rawMetadata['Comment'] == '{}',
        'Official engine substituted stealth/local output');
    require(digest(await source.readAsBytes()) == originalHash,
        'Original bytes altered');
    suite.check('metadata-import', 'default-online-local-bytes', {
      'actualProductionPageDefault': 'online',
      'stockNativeSandbox': true,
      'officialPngWebpSeed': 424242,
      'tenPinnedAssetGets': ids,
      'originalSha256': originalHash,
      'inspectionDidNotApply': true,
      'uploads': 0
    });

    final before = gets.length;
    await _mode(MetadataRecoveryMode.offline);
    await _awaitReport();
    await _keyTap('metadata-selection-clear');
    final apply = nativeUiElements(
            (w) => w.key == const ValueKey('metadata-apply-selected'))
        .single
        .widget as FilledButton;
    require(apply.onPressed == null, 'No-selection Apply is enabled');
    await _keyTap('metadata-select-positivePrompt');
    await _keyTap('metadata-apply-selected');
    require(
        c.app.params.positivePrompt == 'blue sky, 白色衣服' &&
            c.app.params.negativePrompt == 'preserve negative' &&
            c.app.params.seed == 98765 &&
            c.app.extras.charCaptions.single.prompt == 'preserve character',
        'Unchecked fields overwritten');
    await _returnToInspector();
    require((await c.storage.getParams()).negativePrompt == 'preserve negative',
        'Selected-only state was not persisted');
    require(gets.length == before, 'Explicit offline caused network GET');
    // The visible role-only selection is also usable; no phantom noMetadata early return.
    await _keyTap('metadata-selection-clear');
    await _keyTap('metadata-select-characters');
    await _keyTap('metadata-apply-selected');
    require(
        c.app.extras.charCaptions.single.prompt != 'preserve character' &&
            c.app.params.seed == 98765 &&
            c.app.params.negativePrompt == 'preserve negative',
        'Characters-only apply failed or modified unchecked fields');
    // Complete the production transition after selection (the page callback normally selects this route).
    await nativeUiWait(
        () => nativeUiElements((w) => w is GenerateScreen).isNotEmpty,
        'actual characters-only Apply navigation');
    require(nativeUiElements((w) => w is GenerateScreen).isNotEmpty,
        'Generation workbench transition missing');
    suite.check('metadata-import', 'offline-and-selected-apply', {
      'actualModeDropdown': 'offline',
      'noAssetGets': true,
      'selectedPositiveOnly': true,
      'uncheckedNegativeSeedCharactersPreserved': true,
      'charactersOnlyApply': true,
      'nativeParamsReadback': true,
      'generationWorkbenchMounted': true
    });

    var parsed = 0;
    for (final fixture in nativeMetadataFixtures) {
      final bytes = base64Decode(fixture['base64'] as String);
      require(digest(bytes) == fixture['sha256'],
          'Embedded fixture SHA ${fixture['name']}');
      final report =
          await reader.read(bytes, mode: MetadataRecoveryMode.offline);
      final expected = Map<String, dynamic>.from(fixture['expected'] as Map);
      final actual = {
        ...report.imported.compatibleValuesByKey,
        'characters': report.characterCaptions.length
      };
      for (final entry in expected.entries) {
        require(actual[entry.key] == entry.value,
            'Offline format ${fixture['name']} ${entry.key}: ${actual[entry.key]} != ${entry.value}');
      }
      if (expected.isEmpty) {
        require(report.imported.isEmpty && report.characterCaptions.isEmpty,
            'Parameterless fixture gained metadata');
      }
      parsed++;
    }
    final jpeg =
        Uint8List.fromList(im.encodeJpg(im.Image(width: 64, height: 64)));
    final jpegOffline =
        await reader.read(jpeg, mode: MetadataRecoveryMode.offline);
    require(
        jpegOffline.imported.isEmpty, 'Plain legal JPEG acquired parameters');
    Object? jpegFailure;
    try {
      await reader.read(jpeg);
    } catch (e) {
      jpegFailure = e;
    }
    require(
        jpegFailure is MetadataRecoveryFailure &&
            jpegFailure.code == 'online_png_webp_only' &&
            gets.length == before,
        'Online JPEG guard fetched/uploaded/fell back');
    final local = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final localGets = <String>[],
        arrived = Completer<void>(),
        release = Completer<void>();
    var hold = false;
    local.listen((r) async {
      final body = await r.fold<int>(0, (n, b) => n + b.length);
      require(r.method == 'GET' && body == 0, 'Metadata test attempted upload');
      localGets.add('${r.method} ${r.uri}');
      if (hold) {
        if (!arrived.isCompleted) arrived.complete();
        await release.future;
      }
      r.response.add(Uint8List(
          MetadataRecoveryReader.assetFor(r.uri.pathSegments.last).bytes));
      await r.response.close();
    });
    final bad = MetadataRecoveryReader(
        fetchAsset: (id) =>
            _get('http://127.0.0.1:${local.port}/$id', localGets));
    Object? badFailure;
    try {
      await bad.read(pngBytes);
    } catch (e) {
      badFailure = e;
    }
    require(
        badFailure is MetadataRecoveryFailure &&
            badFailure.code == 'asset_integrity_changed',
        'Actual HTTP bad pinned SHA not refused');
    await bad.cancel();
    hold = true;
    final cancelledReader = MetadataRecoveryReader(
        fetchAsset: (id) =>
            _get('http://127.0.0.1:${local.port}/$id', localGets));
    await c.storage.saveMetadataInspectorImage(pngBytes, 'cancel-source.png');
    await nativeUiMount(
        c.app,
        MetadataInspectorScreen(
            onBack: () {},
            onOpenGenerate: () {},
            recoveryReader: cancelledReader),
        shellKey: UniqueKey());
    await arrived.future.timeout(const Duration(seconds: 15));
    await _mode(MetadataRecoveryMode.offline);
    await _awaitReport();
    release.complete();
    await frame();
    await frame();
    require(
        nativeUiElements(
            (w) => w.key == const ValueKey('metadata-recovery-error')).isEmpty,
        'Cancelled online result overrode explicit offline result');
    require(
        digest(await source.readAsBytes()) == originalHash &&
            gets.length == before,
        'Format/error/cancel modified original or fetched in offline');
    await cancelledReader.cancel();
    await local.close(force: true);
    suite.check('metadata-import', 'formats-error-cancel-no-upload', {
      'actualOfflineFixtureCount': parsed,
      'jpegOnlineRejectedBeforeFetch': true,
      'badShaActualHttpRefused': true,
      'modeChangeCancelledStaleOnlineResult': true,
      'controlledInjectedGetReleasedAfterCancel': true,
      'injectedSocketAbortNotClaimed': true,
      'allTransportGetOnly': true,
      'uploads': 0,
      'originalSha256': originalHash
    });
  } finally {
    await nativeUiMount(c.app, const SizedBox.shrink());
    await reader.cancel();
    await c.close();
  }
}

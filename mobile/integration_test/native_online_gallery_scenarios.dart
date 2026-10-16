// Actual native gallery UI + production API/streaming/file/preset journeys.
// Only the public transport is redirected to isolated loopback TLS; no HTTP fake.
import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/screens/online_gallery_screen.dart';
import 'package:novelai_mobile/services/online_gallery_service.dart';
import 'native_scenario_support.dart';
import 'native_ui_actions.dart';
import 'native_gallery_tls_fixture.dart';

final suite = NativeScenarios(3);
Future<void> main() => suite.run(_run);
Future<Element> _seek(bool Function(Widget) predicate, String name,
    {bool fromTop = false}) async {
  if (fromTop) {
    final scroll = nativeUiElements((w) => w is Scrollable);
    if (scroll.isNotEmpty) {
      final state = (scroll.first as StatefulElement).state as ScrollableState;
      state.position.jumpTo(0);
      await frame();
    }
  }
  for (var i = 0; i < 80; i++) {
    final targets = nativeUiElements(predicate);
    if (targets.isNotEmpty) return targets.first;
    final scroll = nativeUiElements((w) => w is Scrollable);
    if (scroll.isNotEmpty) {
      final state = (scroll.first as StatefulElement).state as ScrollableState;
      state.position.jumpTo((state.position.pixels + 350)
          .clamp(0, state.position.maxScrollExtent));
    }
    await frame();
  }
  throw StateError('Gallery actual widget missing: $name');
}

Future<void> _text(String text, {bool fromTop = false}) async => nativeUiTap(
    await _seek((w) => w is Text && w.data == text, text, fromTop: fromTop));
List<File> _files(Directory root) => root.existsSync()
    ? root
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.contains('Online Gallery'))
        .toList()
    : [];
Future<void> _run() async {
  final c = await NativeContext.create('gallery');
  final tls = await NativeGalleryTlsFixture.open(png(64, 64));
  final priorProvider = debugNetworkImageHttpClientProvider;
  debugNetworkImageHttpClientProvider = tls.ioClient;
  c.app.settings.onlineGalleryDownloadDir = c.root.path;
  await c.storage.setSettings(c.app.settings);
  final service = OnlineGalleryService(client: tls.client());
  try {
    await nativeUiMount(
        c.app,
        OnlineGalleryScreen(
            service: service,
            downloadClientFactory: tls.client,
            initialSource: OnlineGallerySource.danbooru));
    final field = await _seek((w) => w is EditableText, 'gallery query');
    await nativeUiTap(field);
    (field as StatefulElement)
        .state
        .castToEditable()
        .updateEditingValue(const TextEditingValue(text: 'blue_sky'));
    FocusManager.instance.primaryFocus?.unfocus();
    await _text('Search');
    await nativeUiWait(
        () => tls.requests.any((r) => r['path'] == '/posts.json'),
        'real search GET');
    await _text('Next');
    await nativeUiWait(
        () => tls.requests.where((r) => r['path'] == '/posts.json').length == 2,
        'page 2 GET');
    await _text('Next');
    await nativeUiWait(
        () => tls.requests.where((r) => r['path'] == '/posts.json').length == 3,
        'page 3 GET');
    await nativeUiWait(
        () => nativeUiElements((w) => w is CircularProgressIndicator).isEmpty,
        'empty final page');
    final searches =
        tls.requests.where((r) => r['path'] == '/posts.json').toList();
    require(searches.length == 3, 'Unexpected browse request count');
    for (var i = 0; i < 3; i++) {
      final query = searches[i]['query'] as Map;
      require(
          query['page'] == '${i + 1}' &&
              query['tags'] == 'blue_sky rating:g' &&
              query['limit'] == '60',
          'Production search/pagination/safety query mismatch');
    }
    suite.check('online-gallery', 'browse-search-pagination', {
      'actualProductionScreen': true,
      'actualQueryField': 'blue_sky',
      'realTlsGetPages': [1, 2, 3],
      'pageSizes': [24, 1, 0],
      'safeRatingPreserved': true,
      'lastPageDeterminedByEmptyResponse': true
    });

    await _text('Search', fromTop: true);
    await _text('native_character_1');
    await nativeUiWait(
        () => tls.requests.any((r) => r['path'] == '/posts/1.json'),
        'actual detail GET');
    await _text('Use in Generate');
    require(
        c.app.params.positivePrompt.contains('blue_sky') &&
            c.app.params.negativePrompt == 'synthetic negative',
        'Inspected tags not applied or negative unexpectedly replaced');
    for (var i = 1; i <= 2; i++) {
      await _text('Download current image', fromTop: true);
      await nativeUiWait(
          () => _files(c.root).length == i, 'native saved image $i');
      await nativeUiWait(
          () => nativeUiElements((w) =>
                  w.key == const ValueKey('online-gallery-cancel-download'))
              .isEmpty,
          'download finished');
    }
    final saved = _files(c.root);
    require(saved.map((f) => f.path).toSet().length == 2,
        'Repeated download clobbered file');
    for (final f in saved) {
      require(
          f.path.endsWith('.png') &&
              digest(await f.readAsBytes()) == digest(tls.image),
          'Downloaded file differs from original legal PNG');
    }
    final presetError = await c.app.saveReferencePresetFromPath(
        saved.first.path,
        kind: ReferencePresetKind.precise,
        name: 'Native gallery precise');
    require(presetError == null && c.app.referencePresets.length == 1,
        'Downloaded reference preset save failed: $presetError');
    final preset = c.app.referencePresets.single;
    require(
        digest(await File(preset.filePath).readAsBytes()) == digest(tls.image),
        'Preset image differs');
    final library = await c.storage.getReferencePresetLibrary();
    require(library.presets.single.id == preset.id,
        'Native preset readback missing');
    suite.check('online-gallery', 'inspect-download-presets', {
      'productionDetailGet': true,
      'visibleUseInGenerate': true,
      'visibleDownloadButtonTwice': true,
      'nativeFiles': saved.map((f) => f.path).toList(),
      'sha256': digest(tls.image),
      'exactOriginalBytes': true,
      'noClobber': true,
      'productionReferencePresetFileAndPreferences': true,
      'presetEntry': 'saveReferencePresetFromPath (existing production API)'
    });

    final originalPaths = {
      for (final f in saved) f.path: digest(await f.readAsBytes())
    };
    for (final mode in ['error', 'html', 'oversize']) {
      tls.imageMode = mode;
      final count = tls.requests.length;
      await _text('Download current image', fromTop: true);
      await nativeUiWait(
          () =>
              tls.requests.skip(count).any((r) => r['path'] == '/images/1.png'),
          'actual $mode download request');
      await nativeUiWait(
          () => nativeUiElements((w) =>
                  w.key == const ValueKey('online-gallery-cancel-download'))
              .isEmpty,
          '$mode rejected');
      require(
          _files(c.root).length == 2, 'Invalid $mode response written to file');
    }
    tls.holdDownload();
    await _text('Download current image', fromTop: true);
    await tls.heldArrived.future.timeout(const Duration(seconds: 10));
    await nativeUiTap(await _seek(
        (w) => w.key == const ValueKey('online-gallery-cancel-download'),
        'cancel download'));
    await nativeUiWait(
        () => nativeUiElements((w) =>
            w.key == const ValueKey('online-gallery-cancel-download')).isEmpty,
        'cancel closes active transport before release');
    require(tls.held != null && _files(c.root).length == 2,
        'Held request persisted before release');
    await tls.releaseHeld();
    await frame();
    // Navigate out while another held response exists: dispose cancels its owned request.
    tls.holdDownload();
    await _text('Download current image', fromTop: true);
    await tls.heldArrived.future.timeout(const Duration(seconds: 10));
    final context = nativeUiElements((w) => w is Scaffold).last;
    Navigator.of(context).pop();
    await frame();
    await tls.releaseHeld();
    await frame();
    require(_files(c.root).length == 2, 'Disposed download wrote stale file');
    tls.searchMode = 'error';
    await _text('Search', fromTop: true);
    await nativeUiWait(
        () => nativeUiElements(
            (w) => w is Text && (w.data?.contains('503') ?? false)).isNotEmpty,
        'visible network search failure');
    tls.searchMode = 'normal';
    await _text('Search', fromTop: true);
    await _seek(
        (w) => w is Text && w.data == 'native_character_1', 'search recovered');
    for (final e in originalPaths.entries) {
      require(digest(await File(e.key).readAsBytes()) == e.value,
          'Completed file changed after cancel/error');
    }
    require(
        tls.requests.every((r) =>
                r['method'] == 'GET' &&
                r['bodyBytes'] == 0 &&
                r['authorization'] == null) &&
            tls.errors.isEmpty,
        'Unexpected gallery transport: ${tls.errors}');
    suite.check('online-gallery', 'network-error-cancel', {
      'realHttp503VisibleAndRecovered': true,
      'httpHtmlOversizeDownloadNoFiles': true,
      'visibleCancelClosedOwnedRequestBeforeHeldRelease': true,
      'disposeDidNotPersistStaleResponse': true,
      'completedNativeFilesPreserved': true,
      'allRequestsGetOnly': true,
      'noCredentialsOrUpload': true
    });
  } finally {
    await nativeUiMount(c.app, const SizedBox.shrink());
    debugNetworkImageHttpClientProvider = priorProvider;
    PaintingBinding.instance.imageCache
      ..clear()
      ..clearLiveImages();
    await tls.close();
    await c.close();
  }
}

extension on State {
  EditableTextState castToEditable() => this as EditableTextState;
}

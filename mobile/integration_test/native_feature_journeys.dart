// ignore_for_file: avoid_print, prefer_interpolation_to_compose_strings, prefer_const_constructors
// Native Android/iOS component journeys. This is not a 39-row certification.
// No fake platform channels, fake Storage, fake NaiApi, mock preferences,
// credential-bearing accounts, or paid/public generation providers are used.
import 'dart:convert';
import 'native_foreground.dart';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:image/image.dart' as image;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/background_queue_service.dart';
import 'package:novelai_mobile/services/local_favorites.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

const _sourceSha = String.fromEnvironment('FEATURE_SOURCE_SHA', defaultValue: 'uncommitted');
const _syntheticToken = 'acceptance-synthetic-not-a-real-token';

void _checked(String feature, String journey, Map<String, Object?> observed) {
  // Captured by run-mobile-native.mjs, including literal test process streams.
  final check = <String,Object?>{
    'sourceSha': _sourceSha,
    'feature': feature,
    'platform': Platform.isAndroid ? 'android' : Platform.isIOS ? 'ios' : Platform.operatingSystem,
    'kind': 'device',
    'status': 'passed',
    'journey': journey,
    'observed': observed,
    'scope': 'bounded production component journey; whole feature is not certified',
    'mockOnly': false,
    'paidCalls': 0,
  };
  _checks.add(check);
  print('FEATURE_ACCEPTANCE_CHECK:${jsonEncode(check)}');
}

Uint8List _png(int width, int height) => Uint8List.fromList(image.encodePng(image.Image(width: width, height: height)..clear(image.ColorRgb8(80, 120, 160))));

// Fixture authoring only: inject a standard PNG tEXt chunk with a real CRC.
// The implementation under test is the production parser, not this encoder.
Uint8List _metadataPng(Uint8List bytes) {
  final comment = jsonEncode({'prompt': 'acceptance forest 日本語', 'uc': 'acceptance negative', 'steps': 28, 'scale': 6, 'seed': 4000000000, 'width': 64, 'height': 64, 'sampler': 'k_euler_ancestral', 'noise_schedule': 'karras', 'model': 'nai-diffusion-5-full'});
  Uint8List chunk(String key, String value) {
    final body = utf8.encode('$key\u0000$value');
    final typed = <int>[...ascii.encode('tEXt'), ...body];
    var crc = 0xffffffff;
    for (final byte in typed) {
      crc ^= byte;
      for (var bit = 0; bit < 8; bit++) {
        crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xedb88320 : crc >> 1;
      }
    }
    final len = ByteData(4)..setUint32(0, body.length);
    final sum = ByteData(4)..setUint32(0, (crc ^ 0xffffffff) & 0xffffffff);
    return Uint8List.fromList([...len.buffer.asUint8List(), ...typed, ...sum.buffer.asUint8List()]);
  }
  return Uint8List.fromList([...bytes.sublist(0, 33), ...chunk('Software', 'NovelAI'), ...chunk('Comment', comment), ...bytes.sublist(33)]);
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (Platform.isAndroid) FlutterForegroundTask.initCommunicationPort();
  BackgroundQueueService.initialize();
  ui.PlatformDispatcher.instance.onError = (error, stack) {
    _asyncErrors.add(error);
    print('FEATURE_NATIVE_ASYNC_ERROR:$error\n$stack');
    return true;
  };
  try { await _run(); print('FEATURE_ACCEPTANCE_DONE:'+jsonEncode({'sourceSha': const String.fromEnvironment('FEATURE_SOURCE_SHA', defaultValue: 'uncommitted'), 'exitStatus':0,'checks':_checks.length,'platform':Platform.operatingSystem,'paidCalls':0})); }
  catch(error,stack){ print('FEATURE_ACCEPTANCE_FAILURE:$error\n$stack'); print('FEATURE_ACCEPTANCE_DONE:'+jsonEncode({'sourceSha': const String.fromEnvironment('FEATURE_SOURCE_SHA', defaultValue: 'uncommitted'), 'exitStatus':1,'checks':_checks.length,'platform':Platform.operatingSystem,'paidCalls':0})); }
}
final _checks = <Map<String,Object?>>[];
final _asyncErrors = <Object>[];
Future<void> _run() async {
  final cleanup = <Future<void> Function()>[];
  final uiErrors = <FlutterErrorDetails>[];
  FlutterError.onError = (details){uiErrors.add(details);FlutterError.presentError(details);};
    expect(Platform.isAndroid || Platform.isIOS, true, reason: 'Host Flutter is not native mobile acceptance.');
    expect(const bool.fromEnvironment('FEATURE_ISOLATED_DEVICE'), true, reason: 'Run only on a disposable simulator/emulator, never a human device.');
    await nativeForegroundBarrier();
    // Reset only the test app on the explicitly disposable device. No platform
    // interface is replaced, and every subsequent preference write is native.
    await (await SharedPreferences.getInstance()).clear();
    final storage = Storage();
    final docs = await UnifiedStorage.documents();
    final root = await Directory(docs.path).createTemp('feature-acceptance-native-');
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final requests = <Map<String, dynamic>>[];
    final fixtureBytes = _png(64, 64);
    server.listen((request) async {
      try {
        expect(request.connectionInfo!.remoteAddress.isLoopback, true);
        expect(request.headers.value('authorization'), 'Bearer $_syntheticToken');
        final raw = await utf8.decoder.bind(request).join();
        final body = raw.isEmpty ? <String, dynamic>{} : Map<String, dynamic>.from(jsonDecode(raw) as Map);
        requests.add({'method': request.method, 'path': request.uri.path, 'body': body});
        if (request.uri.path == '/user/data') {
          request.response.headers.contentType = ContentType.json;
          request.response.write(jsonEncode({'subscription': {'tier': 3, 'active': true, 'trainingStepsLeft': {'fixedTrainingStepsLeft': 100000, 'purchasedTrainingSteps': 0}}}));
        } else if (request.uri.path.endsWith('/request-price')) {
          request.response.headers.contentType = ContentType.json;
          request.response.write('{"price":10}');
        } else if (request.uri.path == '/ai/generate-image' || request.uri.path == '/ai/augment-image' || request.uri.path == '/ai/upscale') {
          final output = request.uri.path == '/ai/upscale' ? _png(128, 128) : fixtureBytes;
          final archive = Archive()..addFile(ArchiveFile('0.png', output.length, output));
          request.response.headers.contentType = ContentType('application', 'zip');
          request.response.add(ZipEncoder().encode(archive));
        } else {
          request.response.statusCode = 404;
          request.response.write('Unexpected acceptance fixture endpoint');
        }
        await request.response.close();
      } catch (error, stack) {
        // Failures remain visible instead of returning a misleading fake success.
        print('FEATURE_FIXTURE_ERROR:$error\n$stack');
        request.response.statusCode = 500;
        await request.response.close();
      }
    });
    final api = NaiApi();
    final settings = AppSettings(imageBaseUrl: 'http://127.0.0.1:${server.port}', apiBaseUrl: 'http://127.0.0.1:${server.port}', allowCustomEndpoint: true, allowCustomEndpointFallback: false, proxyMode: 'direct', saveToGallery: false, keepImageMetadata: true, streamPreviewEnabled: false, language: 'en-US', imageOutputDir: root.path);
    final params = GenerateParams(width: 64, height: 64, positivePrompt: 'acceptance forest', negativePrompt: 'acceptance negative', qualityPreset: 'none', ucPreset: 0, seed: 4000000000, seedMode: 'fixed');
    final app = AppState(api: api, storage: storage)..settings = settings..params = params;
    cleanup.add(() async { app.dispose(); await server.close(force: true); await storage.clearToken(); });
    try {

    // These are real platform plugin commits to this fresh native app sandbox.
    await storage.setToken(_syntheticToken);
    expect(await Storage().getToken(), _syntheticToken);
    await storage.setSettings(settings);
    await storage.setParams(params);
    expect((await Storage().getParams()).seed, 4000000000);
    expect((await Storage().getSettings()).imageOutputDir, root.path);
    _checked('accounts', 'native secure credential store roundtrip (synthetic only)', {'credentialMatched': true, 'officialLoginUntested': true});
    _checked('settings', 'real preferences persisted and reopened without stubs', {'customEndpointFallback': false, 'proxyMode': 'direct'});
    await Clipboard.setData(const ClipboardData(text: 'acceptance 日本語 clipboard'));
    expect((await Clipboard.getData(Clipboard.kTextPlain))?.text, 'acceptance 日本語 clipboard');
    _checked('clipboard', 'native text clipboard write/read', {'unicodePreserved': true, 'imageClipboardUntested': true});

    await app.generate();
    expect(app.history, _Length(1), reason: app.status);
    final generated = app.history.single;
    expect(await File(generated.filePath).readAsBytes(), fixtureBytes);
    expect((await Storage().getHistory()).single.id, generated.id);
    final firstPayload = (requests.firstWhere((r) => r['path'] == '/ai/generate-image')['body'] as Map);
    expect(firstPayload['action'], 'generate');
    expect((firstPayload['parameters'] as Map)['seed'], 4000000000);
    _checked('generation', 'production AppState.generate → real loopback HTTP → native PNG file/history', {'requests': requests.length, 'historyCount': 1, 'seed': generated.seed, 'pngSha256': sha256.convert(fixtureBytes).toString(), 'paidCalls': 0});
    _checked('works', 'generation outcome durable across fresh Storage instances', {'durableHistoryCount': (await Storage().getHistory()).length});
    _checked('output-management', 'configured native managed output directory honored', {'outputInsideConfiguredDirectory': generated.filePath.startsWith(root.path), 'existingUserDirectoryUsed': false});

    final extras = GenerateExtras(charCaptions: [CharCaptionItem(prompt: 'acceptance character', negativePrompt: 'acceptance character negative', useCoords: true, x: 0.25, y: 0.75)]);
    await api.generate(_syntheticToken, settings, params, extras);
    final characterPayload = requests.last['body'] as Map;
    final characterParameters = characterPayload['parameters'] as Map;
    expect((characterParameters['v4_prompt'] as Map)['caption']['char_captions'][0]['centers'][0], {'x': 0.25, 'y': 0.75});
    expect((characterParameters['v4_negative_prompt'] as Map)['caption']['char_captions'][0]['char_caption'], 'acceptance character negative');
    expect((characterParameters['uc'] as String).contains('acceptance negative'), true);
    _checked('characters', 'production character prompts and coordinates transmitted over real native HTTP', {'positiveCharacters': 1, 'negativeCharacters': 1});
    _checked('negative-prompts', 'base and character negative prompts preserved in transmitted payload', {'baseMatched': true, 'characterMatched': true, 'effectiveUcSha256': sha256.convert(utf8.encode(characterParameters['uc'] as String)).toString(), 'libraryUiUntested': true});
    await api.generate(_syntheticToken, settings, params.copy()..effort = 'medium', GenerateExtras());
    final medium = requests.last['body'] as Map;
    expect(medium['model'], 'nai-diffusion-5-full-medium');
    expect(medium['parameters']['steps'], 14);
    expect(medium['parameters']['uc'], '');
    _checked('effort', 'V5 Medium real request model, steps and UC behavior', {'model': medium['model'], 'steps': 14});

    final i2i = await api.img2img(_syntheticToken, settings, params, GenerateExtras(), fixtureBytes, I2IParams(strength: 0.4));
    expect(i2i.$1.single, fixtureBytes);
    expect(requests.last['body']['action'], 'img2img');
    expect(requests.last['body']['parameters']['strength'], 0.4);
    _checked('image-to-image', 'real image processing/request/ZIP decoding', {'strength': 0.4, 'decodedOutputs': 1});
    final painted = await api.inpaint(_syntheticToken, settings, params, fixtureBytes, _png(64, 64), 'nai-diffusion-5-full-inpainting', 64, 64, 1, 0);
    expect(image.decodeImage(painted.$1.single)?.width, 64);
    expect(requests.last['body']['action'], 'infill');
    expect(requests.last['body']['parameters']['mask'], _stringType);
    _checked('inpaint', 'production assets/mask/request/composite over native loopback', {'width': 64, 'outputs': 1, 'editorGestureUntested': true});
    final colored = await api.augment(_syntheticToken, settings, fixtureBytes, 64, 64, 'colorize', AugmentOptions(defry: 2, colorizePrompt: 'blue'));
    expect(colored.single, fixtureBytes);
    expect(requests.last['body']['req_type'], 'colorize');
    expect(requests.last['body']['defry'], 2);
    _checked('postprocess', 'real colorize director-tool transport and ZIP decoding', {'tool': 'colorize', 'defry': 2, 'otherToolsUntested': true});
    final enlarged = await api.upscale(_syntheticToken, settings, fixtureBytes, 2, params.model);
    expect(image.decodeImage(enlarged)?.width, 128);
    _checked('enhance', 'real upscale preparation, loopback response, dimensional validation', {'input': '64x64', 'output': '128x128', 'multiPassUntested': true});

    final metadataBytes = _metadataPng(fixtureBytes);
    final metadataFile = File('${root.path}/synthetic-metadata.png');
    await metadataFile.writeAsBytes(metadataBytes);
    final beforeHash = sha256.convert(metadataBytes).toString();
    final report = inspectImageMetadata(parseImageTextMetadata(metadataBytes));
    expect(report.imported.seed, 4000000000);
    app.applyImportedMetadata(report.imported.selecting({'positivePrompt', 'seed'}));
    expect(app.params.positivePrompt, 'acceptance forest 日本語');
    expect(app.params.negativePrompt, 'acceptance negative');
    expect(sha256.convert(await metadataFile.readAsBytes()).toString(), beforeHash);
    _checked('metadata-import', 'real offline PNG parser and production selected-field state apply', {'seed': app.params.seed, 'unselectedNegativePreserved': true, 'sourceBytesUnchanged': true, 'onlineModeUntested': true});

    final favorites = MobileLocalFavorites(rootOverride: root);
    cleanup.add(() async {favorites.dispose();});
    final favorite = await favorites.add(generated);
    final favoriteFile = await favorites.file(favorite);
    expect(await favoriteFile.readAsBytes(), fixtureBytes);
    final renamed = await favorites.rename(favorite.id, 'acceptance 日本語');
    expect((await MobileLocalFavorites(rootOverride: root).list()).items.single.fileName, renamed.fileName);
    final renamedCopyPath = (await favorites.file(renamed)).path;
    await favorites.remove(favorite.id);
    expect(await File(generated.filePath).exists(), true);
    expect(await File(renamedCopyPath).exists(), true);
    _checked('favorites', 'real original copy, persistent rename/reopen, remove without deleting source/copy', {'unicodeRename': true, 'sourceAndCopyPreserved': true, 'newTimeSortingUntested': true});

    final backup = DataBackupService(storage);
    final archive = await backup.createBackup({DataBackupCategory.configuration, DataBackupCategory.imageHistory}, prefix: 'acceptance-native');
    final inspected = await backup.inspect(archive.path);
    expect(inspected.categories.map((c) => c.category), _Contains(DataBackupCategory.imageHistory));
    await storage.writeHistory([]);
    await backup.importBackup(archive.path, {DataBackupCategory.imageHistory}, confirmConfigurationOverwrite: false);
    expect((await Storage().getHistory()).length, 1);
    expect(await Storage().getToken(), _syntheticToken);
    _checked('backup', 'native archive export/inspect/restore image history; credentials not overwritten', {'historyCount': 1, 'secureCredentialPreserved': true, 'selectiveRestore': true});

    final restored = (await storage.getHistory()).single;
    await storage.writeGroups([HistoryGroup(id: 'acceptance-group', name: 'acceptance group', createdAt: '2026-10-14T00:00:00Z')]);
    expect((await storage.moveHistoryItems({restored.id}, 'acceptance-group')).single.groupId, 'acceptance-group');
    final second = await storage.saveImage(fixtureBytes, params, 2);
    await File(second.filePath).delete();
    expect(await storage.reconcileMissingHistory(), {second.id});
    expect((await Storage().getHistory()).single.id, restored.id);
    _checked('missing-file-reconciliation', 'production conclusively-missing managed file removes only its record', {'missingRemoved': 1, 'existingRetained': 1});
    final deleted = await storage.deleteHistoryItems({restored.id});
    expect(deleted.failedIds, _empty);
    expect(deleted.removedIds, {restored.id});
    expect((await Storage().getHistory()), _empty);
    _checked('works-batch-edit', 'real group move and managed batch delete persisted', {'groupMoveMatched': true, 'deletedRecords': 1, 'managedFileDeleted': !await File(restored.filePath).exists()});

    // Render the actual generation screen in the native Flutter engine, rather
    // than accepting the existence of its source or a host widget-test screen.
    runApp(ChangeNotifierProvider.value(value: app, child: const MaterialApp(home: GenerateScreen())));
    await WidgetsBinding.instance.endOfFrame;
    await Future<void>.delayed(const Duration(milliseconds: 500));
    var screens=0,editable=0;
    void visit(Element e){if(e.widget is GenerateScreen)screens++;if(e.widget is EditableText)editable++;e.visitChildren(visit);}
    visit(WidgetsBinding.instance.rootElement!);
    expect(screens, 1);expect(editable>0,true);expect(uiErrors.isEmpty,true);
    expect(_asyncErrors, _empty);
    _checked('generation', 'actual production GenerateScreen mounted on target native engine', {'editableControls': editable, 'screenInteractionCoverage': 'mount only; no claim of full navigation'});
    } finally {for(final dispose in cleanup.reversed){await dispose();}}
}

class _Length {final int n;const _Length(this.n);}
class _Contains {final Object value;const _Contains(this.value);}
const _empty = #empty;const _stringType = #string;
void expect(Object? actual,Object? expected,{String? reason}) {
 bool equal(Object? a,Object? b){if(a is Iterable&&b is Iterable)return a.length==b.length&&List.generate(a.length,(i)=>equal(a.elementAt(i),b.elementAt(i))).every((x)=>x);if(a is Map&&b is Map)return a.length==b.length&&a.keys.every((k)=>b.containsKey(k)&&equal(a[k],b[k]));return a==b;}
 final ok=expected is _Length?actual is Iterable&&actual.length==expected.n:expected is _Contains?actual is Iterable&&actual.contains(expected.value):expected==_empty?actual is Iterable&&actual.isEmpty:expected==_stringType?actual is String:equal(actual,expected);
 if(!ok)throw StateError('Native assertion failed: $actual != $expected; ${reason??""}');
}

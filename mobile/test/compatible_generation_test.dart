import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image/image.dart' as image;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:provider/provider.dart';
import 'package:archive/archive.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/openai_images.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/compatible_images.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/i18n/compatible_image_text.dart';

class Paths extends PathProviderPlatform {
  final String root;
  Paths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
}

class FailingStorage extends Storage {
  bool rejectSettings = false, rejectHistory = false;
  @override
  Future<void> setSettings(AppSettings settings) async {
    if (rejectSettings) throw StateError('fixture write denied');
    await super.setSettings(settings);
  }

  @override
  Future<void> writeHistory(List<HistoryItem> items) async {
    if (rejectHistory) throw StateError('fixture history denied');
    await super.writeHistory(items);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late Storage storage;
  late AppState state;
  final servers = <HttpServer>[];
  const key = 'fixture-independent-image-key';
  final bytes = image.encodePng(
      image.Image(width: 8, height: 6)..textData = {'upstream-key': key});
  Map<String, dynamic> config(String url) => {
        'baseUrl': url,
        'model': 'custom-image',
        'size': 'auto',
        'responseFormat': 'auto',
        'extensions': <String, dynamic>{}
      };
  Future<String> serve(FutureOr<void> Function(HttpRequest) handler) async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    servers.add(server);
    server.listen(handler);
    return 'http://127.0.0.1:${server.port}/v1';
  }

  setUp(() async {
    HttpOverrides.global = null;
    root = Directory.systemTemp.createTempSync('issue32-mobile-');
    PathProviderPlatform.instance = Paths(root.path);
    UnifiedStorage.active = null;
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    storage = Storage();
    state = AppState(storage: storage, preloadCompletedImage: (_) async {})
      ..settings = AppSettings(proxyMode: 'direct', saveToGallery: false)
      ..params.positivePrompt = 'quiet forest';
    await storage.setSettings(state.settings);
    await storage.setToken('fixture-native-token');
  });
  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('langbai.novelai/network'), null);
    state.dispose();
    for (final server in servers) {
      await server.close(force: true);
    }
    servers.clear();
    final target = root.absolute.path;
    if (!target.startsWith(
        '${Directory.systemTemp.absolute.path}${Platform.pathSeparator}issue32-mobile-')) {
      throw StateError('invalid fixture path');
    }
    await root.delete(recursive: true);
  });
  test(
      'secure configuration versions survive reopening without keys in settings',
      () async {
    await state.saveCompatibleSettings(config('https://example.test/v1'), key);
    final fresh = Storage(), reopened = await fresh.getSettings();
    expect(reopened.imageProvider, 'openai-images');
    expect(
        await fresh
            .getCompatibleImageKey(reopened.compatibleImage['credentialId']),
        key);
    expect(jsonEncode(reopened.toJson()), isNot(contains(key)));
    expect(await fresh.getToken(), 'fixture-native-token');
    final oldId = reopened.compatibleImage['credentialId'] as String;
    await state.saveCompatibleSettings(
        config('https://another.test/v1'), 'new-key');
    expect(await fresh.getCompatibleImageKey(oldId), key);
    expect(
        await fresh.getCompatibleImageKey(
            state.settings.compatibleImage['credentialId']),
        'new-key');
  });
  test('real AppState POST saves PNG and history without native account calls',
      () async {
    var posts = 0, gets = 0;
    late String url;
    url = await serve((req) async {
      if (req.method == 'POST') {
        posts++;
        expect(req.headers.value('authorization'), 'Bearer $key');
        expect(jsonDecode(await utf8.decoder.bind(req).join()), {
          'model': 'custom-image',
          'prompt': 'quiet forest',
          'size': 'auto',
          'n': 1
        });
        req.response.write(jsonEncode({
          'data': [
            {'url': url.replaceFirst('/v1', '/image')}
          ]
        }));
      } else {
        gets++;
        expect(req.headers.value('authorization'), isNull);
        req.response.add(bytes);
      }
      await req.response.close();
    });
    await state.saveCompatibleSettings(config(url), key);
    expect(posts, 0);
    await state.generate();
    expect(posts, 1);
    expect(gets, 1);
    expect(state.busy, isFalse);
    expect(state.account.hasToken, isFalse);
    expect(state.lastAnlasSpent, isNull);
    final item = state.current!;
    expect(item.width, 8);
    expect(item.height, 6);
    expect(item.seed, -1);
    expect(item.feature, 'openai-images');
    expect(image.decodePng(await File(item.filePath).readAsBytes())!.textData,
        isNull);
    final history = await Storage().getHistory();
    expect(history.single.params['compatibleRequest']['model'], 'custom-image');
    expect(jsonEncode(history.map((i) => i.toJson()).toList()),
        isNot(contains(key)));
    expect(jsonEncode(history.map((i) => i.toJson()).toList()),
        isNot(contains(url)));
  });
  test('partial decode failure saves earlier images and never resubmits',
      () async {
    var posts = 0;
    final url = await serve((req) async {
      posts++;
      req.response.write(jsonEncode({
        'data': [
          {'b64_json': base64Encode(bytes)},
          {'b64_json': 'invalid'}
        ]
      }));
      await req.response.close();
    });
    await state.saveCompatibleSettings(config(url), key);
    state.batchCount = 2;
    await state.generate();
    expect(posts, 1);
    expect(state.history.length, 1);
    expect(state.status, contains('未自动重发'));
    expect(File(state.current!.filePath).existsSync(), isTrue);
  });
  test(
      'mid-request config change keeps original key, model, output root and prompt',
      () async {
    final entered = Completer<void>(), release = Completer<void>();
    final url = await serve((req) async {
      expect(req.headers.value('authorization'), 'Bearer $key');
      entered.complete();
      await release.future;
      req.response.write(jsonEncode({
        'data': [
          {'b64_json': base64Encode(bytes)}
        ]
      }));
      await req.response.close();
    });
    state.settings.imageOutputDir = '${root.path}/original';
    await storage.setSettings(state.settings);
    await state.saveCompatibleSettings(config(url), key);
    final run = state.generate();
    await entered.future;
    await state.saveCompatibleSettings(
        config('https://uncontacted.invalid/v1'), 'new-key');
    state.settings.imageOutputDir = '${root.path}/other';
    state.params.positivePrompt = 'changed';
    release.complete();
    await run;
    expect(state.current!.filePath, contains('original'));
    expect(state.current!.prompt, 'quiet forest');
  });
  test('duplicate clicks and stop do not submit another request', () async {
    var posts = 0;
    final entered = Completer<void>();
    final url = await serve((req) {
      posts++;
      entered.complete();
    });
    await state.saveCompatibleSettings(config(url), key);
    final run = state.generate();
    await entered.future;
    await state.generate();
    expect(posts, 1);
    state.cancelGeneration();
    await run;
    expect(state.busy, isFalse);
    expect(state.history, isEmpty);
    expect(posts, 1);
  });
  test('failed configuration commit preserves prior endpoint/key pair',
      () async {
    await state.saveCompatibleSettings(config('https://old.test/v1'), key);
    final before = await storage.getSettings();
    state.dispose();
    final broken = FailingStorage()..rejectSettings = true;
    state = AppState(storage: broken)..settings = before;
    await expectLater(
        state.saveCompatibleSettings(
            config('https://new.test/v1'), 'replacement'),
        throwsStateError);
    final after = await Storage().getSettings();
    expect(after.compatibleImage, before.compatibleImage);
    expect(
        await storage
            .getCompatibleImageKey(after.compatibleImage['credentialId']),
        key);
    expect((await const FlutterSecureStorage().readAll()).values,
        isNot(contains('replacement')));
  });
  test('history failure retains the saved file and reports incomplete history',
      () async {
    state.dispose();
    final broken = FailingStorage();
    storage = broken;
    state = AppState(storage: storage, preloadCompletedImage: (_) async {})
      ..settings = AppSettings(proxyMode: 'direct', saveToGallery: false)
      ..params.positivePrompt = 'test';
    var posts = 0;
    final url = await serve((req) async {
      posts++;
      req.response.write(jsonEncode({
        'data': [
          {'b64_json': base64Encode(bytes)}
        ]
      }));
      await req.response.close();
    });
    await state.saveCompatibleSettings(config(url), key);
    broken.rejectHistory = true;
    await state.generate();
    expect(posts, 1);
    expect(File(state.current!.filePath).existsSync(), isTrue);
    expect(state.status, contains('历史写入失败'));
    expect(await Storage().getHistory(), isEmpty);
  });
  test(
      'backup configuration excludes key; explicit API export includes independent key',
      () async {
    await state.saveCompatibleSettings(config('https://example.test/v1'), key);
    final service = DataBackupService(storage);
    final normal =
        await service.createBackup({DataBackupCategory.configuration});
    final normalZip = ZipDecoder().decodeBytes(await normal.readAsBytes());
    final normalConfig = utf8.decode(
        normalZip.findFile('data/configuration.json')!.content as List<int>);
    expect(normalConfig, isNot(contains(key)));
    expect(normalConfig, isNot(contains('compatibleImage')));
    final explicit =
        await service.createBackup({DataBackupCategory.apiCredentials});
    final zip = ZipDecoder().decodeBytes(await explicit.readAsBytes());
    final payload = utf8.decode(
        zip.findFile('data/api-credentials.json')!.content as List<int>);
    expect(payload, contains(key));
    expect(payload, contains('imageApiKey'));
    final oldId = state.settings.compatibleImage['credentialId'];
    await state.saveCompatibleSettings(
        config('https://other.test/v1'), 'other-key');
    await service.importBackup(
        explicit.path, {DataBackupCategory.apiCredentials},
        confirmConfigurationOverwrite: true);
    final restored = await Storage().getSettings();
    expect(restored.compatibleImage['baseUrl'], 'https://example.test/v1');
    expect(restored.compatibleImage['credentialId'], isNot(oldId));
    expect(
        await storage
            .getCompatibleImageKey(restored.compatibleImage['credentialId']),
        key);
  });
  test('proxy resolution timeout and five-language labels are complete',
      () async {
    final result = await generateCompatibleImages(
        const CompatibleImageConfig(
            baseUrl: 'https://example.test/v1', model: 'x', apiKey: key),
        prompt: 'x',
        size: 'auto',
        n: 1,
        timeout: const Duration(milliseconds: 15),
        clientForUri: (_) => Completer<Never>().future);
    expect(result.timedOut, isTrue);
    for (final language in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
      final labels = compatibleImageText(language);
      expect(labels.keys, compatibleImageText('zh-CN').keys);
      expect(labels.values.every((v) => v.isNotEmpty), isTrue);
    }
  });
  testWidgets(
      'actual settings card saves profile without generation and offers native switch',
      (tester) async {
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: const MaterialApp(
            home: Scaffold(
                body: SingleChildScrollView(
                    child: CompatibleImageSettingsCard())))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('配置 OpenAI Images 兼容接口 / New API'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('compatible-url')),
        'https://example.test/v1');
    await tester.enterText(find.byKey(const ValueKey('compatible-key')), key);
    await tester.enterText(
        find.byKey(const ValueKey('compatible-model')), 'custom-ui');
    await tester.ensureVisible(find.text('保存并使用兼容图片服务'));
    await tester.tap(find.text('保存并使用兼容图片服务'));
    await tester.pumpAndSettle();
    expect(state.settings.imageProvider, 'openai-images');
    expect(state.settings.compatibleImage['model'], 'custom-ui');
    expect(state.history, isEmpty);
    await tester.ensureVisible(find.text('切回 NovelAI 原生'));
    await tester.tap(find.text('切回 NovelAI 原生'));
    await tester.pumpAndSettle();
    expect(state.settings.imageProvider, 'novelai');
    expect(
        await storage.getCompatibleImageKey(
            state.settings.compatibleImage['credentialId']),
        key);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  test('system proxy routing uses the configured endpoint and image URL',
      () async {
    final routes = <String>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('langbai.novelai/network'), (call) async {
      if (call.method == 'resolveProxy') routes.add(call.arguments as String);
      return '';
    });
    late String url;
    url = await serve((req) async {
      if (req.method == 'POST') {
        req.response.write(jsonEncode({
          'data': [
            {'url': url.replaceFirst('/v1', '/image')}
          ]
        }));
      } else {
        expect(req.headers.value('authorization'), isNull);
        req.response.add(bytes);
      }
      await req.response.close();
    });
    state.settings.proxyMode = 'auto';
    await storage.setSettings(state.settings);
    await state.saveCompatibleSettings(config(url), key);
    await state.generate();
    expect(routes,
        ['$url/images/generations', url.replaceFirst('/v1', '/image')]);
    expect(state.current, isNotNull);
  });
  testWidgets(
      'GenerateScreen button reaches real HTTP and displays its saved result',
      (tester) async {
    var posts = 0;
    final url = await tester.runAsync(() => serve((req) async {
          posts++;
          req.response.write(jsonEncode({
            'data': [
              {'b64_json': base64Encode(bytes)}
            ]
          }));
          await req.response.close();
        }));
    await state.saveCompatibleSettings(config(url!), key);
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: const MaterialApp(home: Scaffold(body: GenerateScreen()))));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('compatible-prompt')), findsOneWidget);
    await tester.ensureVisible(find.text('生成图片'));
    await tester.runAsync(() async {
      await tester.tap(find.text('生成图片'));
      final deadline = DateTime.now().add(const Duration(seconds: 5));
      while (state.busy && DateTime.now().isBefore(deadline)) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    await tester.pumpAndSettle();
    expect(posts, 1);
    expect(state.current, isNotNull);
    expect(state.status, contains('生成完成'));
    await tester.ensureVisible(
        find.byKey(const ValueKey('compatible-generation-status')));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

import 'dart:convert';
import 'dart:io';
import 'package:novelai_mobile/services/online_gallery_download_location.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/models/completion_sound.dart';
import 'package:novelai_mobile/services/completion_sound.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/completion_sound_settings.dart';
import 'package:novelai_mobile/screens/local_agent_screen.dart';
import 'package:novelai_mobile/i18n/local_agent_text.dart';
import 'package:novelai_mobile/prompts/prompt_mode.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';

class _GalleryStorage extends Storage {
  final Directory root;
  final AppSettings config;
  _GalleryStorage(this.root, this.config);
  @override
  Future<Directory> imagesDir() async => root;
  @override
  Future<AppSettings> getSettings() async => config;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('gallery path copy follows unified directory mode in all five locales', () {
    for (final language in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
      final unified = onlineGalleryDownloadPathText(language, unified: true);
      final legacy = onlineGalleryDownloadPathText(language, unified: false);
      expect(unified.defaultLabel, isNot(legacy.defaultLabel));
      expect(unified.hint, isNot(legacy.hint));
      expect(unified.reset, isNot(legacy.reset));
    }
    expect(onlineGalleryDownloadPathText('zh-CN', unified: true).defaultLabel,
        '使用统一文件夹');
  });
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('completion audio shares desktop schema, limits and persistence',
      () async {
    final sound = CompletionSound.fromJson({
      'enabled': true,
      'volume': 4,
      'dataUrl': 'data:audio/wav;base64,${base64Encode([1, 2, 3])}',
      'name': 'sample.wav'
    });
    expect(sound.volume, 1);
    await Storage().setSettings(AppSettings(completionSound: sound));
    expect((await Storage().getSettings()).completionSound.toJson(),
        sound.toJson());
    expect(
        CompletionSound.fromJson({'dataUrl': 'https://untrusted/audio.mp3'})
            .dataUrl,
        '');
    expect(CompletionSound.fromJson({'volume': double.nan}).volume, .5);
    expect(
        CompletionSound.fromJson({'dataUrl': 'data:audio/wav;base64,%%%'})
            .dataUrl,
        '');
  });
  test(
      'completion audio only after saved results, never total failure or cancellation',
      () async {
    expect(CompletionAudio.shouldPlay(cancelled: false, completed: 2), true);
    expect(CompletionAudio.shouldPlay(cancelled: true, completed: 2), false);
    expect(CompletionAudio.shouldPlay(cancelled: false, completed: 0), false);
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(CompletionAudio.channel, (call) async {
      calls.add(call);
      return true;
    });
    expect(await CompletionAudio.play(const CompletionSound()), false);
    expect(calls, isEmpty);
    expect(await CompletionAudio.play(const CompletionSound(), preview: true),
        true);
    final args = calls.single.arguments as Map;
    final bytes = base64Decode((args['dataUrl'] as String).split(',')[1]);
    expect(ascii.decode(bytes.take(4).toList()), 'RIFF');
    expect(bytes.length, lessThan(1048576));
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(CompletionAudio.channel, null);
  });
  test('image-to-image parameters survive restart and honor opt-out', () async {
    final app = AppState();
    app.i2i = I2IParams(
        strength: .42, noise: .23, extraNoiseSeed: 123, upscaledEnhance: true);
    app.i2iSizeMode = 'custom';
    app.i2iSourceMode = 'latest';
    await app.persistToolState();
    app.dispose();
    final next = AppState();
    next.settings = await Storage().getSettings();
    next.restoreI2IState();
    expect(next.i2i.strength, .42);
    expect(next.i2i.noise, .23);
    expect(next.i2i.extraNoiseSeed, 123);
    expect(next.i2i.upscaledEnhance, false);
    expect(next.i2iSizeMode, 'custom');
    next.settings.persistI2IParams = false;
    next.restoreI2IState();
    expect(next.i2i.strength, .7);
    expect(next.i2iSizeMode, 'adaptive');
    next.dispose();
  });
  test('malformed imported image settings are repaired before use', () {
    final app = AppState();
    app.settings = AppSettings.fromJson({
      'lastGenerationState': {
        'i2iParams': {'strength': 'bad', 'noise': 99, 'extraNoiseSeed': -1}
      }
    });
    app.restoreI2IState();
    expect(app.i2i.strength, .7);
    expect(app.i2i.noise, .99);
    expect(app.i2i.extraNoiseSeed, 0);
    app.dispose();
  });
  test(
      'all five languages translate owned Agent logs and preserve raw diagnostics',
      () {
    for (final locale in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
      expect(
          localAgentText(locale, 'officialPrepare'), isNot('officialPrepare'));
      expect(
          localAgentLog(
              locale, 'ANDROID HOME PASS: existing user files preserved.'),
          isNot('ANDROID HOME PASS: existing user files preserved.'));
      expect(localAgentLog(locale, 'plugin.js:7 diagnostic detail'),
          'plugin.js:7 diagnostic detail');
    }
  });
  test(
      'template versions edit and reset independently; V4.5 conversion is bundled',
      () async {
    final app = AppState();
    app.promptTemplates = await PromptTemplateLibrary.load();
    app.settings.convertPromptTemplateVersion = 'v4.5';
    expect(app.resolvedPromptTemplate('convert', ReversePromptMode.mixed),
        isNotEmpty);
    await app.setPromptTemplate(
        'convert', ReversePromptMode.mixed, 'V45 custom');
    app.settings.convertPromptTemplateVersion = 'v5';
    await app.setPromptTemplate(
        'convert', ReversePromptMode.mixed, 'V5 custom');
    app.settings = await Storage().getSettings();
    expect(app.resolvedPromptTemplate('convert', ReversePromptMode.mixed),
        'V5 custom');
    app.settings.convertPromptTemplateVersion = 'v4.5';
    expect(app.resolvedPromptTemplate('convert', ReversePromptMode.mixed),
        'V45 custom');
    await app.resetPromptTemplate('convert', ReversePromptMode.mixed);
    expect(app.settings.convertPromptTemplates['mixed'], 'V5 custom');
    expect(app.settings.convertPromptTemplatesV45.containsKey('mixed'), false);
    app.settings.reversePromptTemplateVersion = 'v4.5';
    await app.setPromptTemplate(
        'reverse', ReversePromptMode.tags, 'Reverse V45');
    expect(app.resolvedPromptTemplate('reverse', ReversePromptMode.tags),
        'Reverse V45');
    await app.setPromptTemplate('comic', ReversePromptMode.tags, 'comic tags');
    await app.setPromptTemplate(
        'comic', ReversePromptMode.natural, 'comic prose');
    expect(app.resolvedPromptTemplate('comic', ReversePromptMode.tags),
        'comic tags');
    expect(app.resolvedPromptTemplate('comic', ReversePromptMode.natural),
        'comic prose');
    app.dispose();
  });
  test(
      'runtime and repair rules use matching version-specific mixed proportions',
      () {
    for (final version in ['v4.5', 'v5']) {
      final ratio = version == 'v4.5' ? '75–85%' : '65–75%';
      expect(
          modeUserInstruction(ReversePromptMode.mixed, 'convert',
              templateVersion: version),
          contains(ratio));
      expect(
          promptRuleRepairSystemPrompt(ReversePromptMode.mixed, false, version),
          contains(ratio));
    }
  });
  test('gallery custom folder is independent of generation image folder',
      () async {
    final root = await Directory.systemTemp.createTemp('parity-gallery-');
    try {
      final gallery = Directory('${root.path}/chosen-gallery');
      final generation = Directory('${root.path}/chosen-generation');
      final store = _GalleryStorage(
          Directory('${root.path}/managed'),
          AppSettings(
              imageOutputDir: generation.path,
              onlineGalleryDownloadDir: gallery.path));
      final file = await store.saveOnlineGalleryImage([1, 2, 3],
          source: 'fixture',
          itemId: '1',
          title: 'sample',
          imageId: 'one',
          extension: 'png');
      expect(file.path, startsWith(gallery.path));
      expect(await generation.exists(), false);
      expect(await file.readAsBytes(), [1, 2, 3]);
    } finally {
      await root.delete(recursive: true);
    }
  });
  for (final size in [
    const Size(320, 640),
    const Size(430, 932),
    const Size(844, 390)
  ]) {
    testWidgets('Agent split channels, re-entry check and layout $size',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(tester.view.reset);
      final app = AppState();
      final visible = ValueNotifier(true);
      final calls = <MethodCall>[];
      const native = MethodChannel('langbai.novelai/local_agent');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(native, (call) async {
        calls.add(call);
        if (call.method == 'status') {
          return {
            'supported': true,
            'phase': 'stopped',
            'busy': false,
            'running': false,
            'installed': '0.1.2',
            'installedUpstream': '0.1.7',
            'official': '0.1.8',
            'candidate': '0.1.3',
            'componentCheckedAt': 1,
            'officialCheckedAt': 1,
            'downloadAvailable': true,
            'logs': ['Agent stopped by user']
          };
        }
        if (call.method == 'backups') return <String>[];
        return null;
      });
      await tester.pumpWidget(ChangeNotifierProvider.value(
          value: app,
          child: MaterialApp(home: LocalAgentScreen(visible: visible))));
      await tester.pumpAndSettle();
      expect(calls.where((c) => c.method == 'check').length, 1);
      expect(calls.where((c) => c.method == 'prepare' || c.method == 'confirm'),
          isEmpty);
      await tester.ensureVisible(find.text('检查官方更新'));
      await tester.tap(find.text('检查官方更新'));
      await tester.pumpAndSettle();
      expect(
          (calls.lastWhere((c) => c.method == 'check').arguments
              as Map)['kind'],
          'official');
      visible.value = false;
      await tester.pump();
      visible.value = true;
      await tester.pumpAndSettle();
      expect(calls.where((c) => c.method == 'check').length, 3);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      visible.dispose();
      app.dispose();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(native, null);
    });
    testWidgets('sound controls fit and remain independent $size',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = size;
      addTearDown(tester.view.reset);
      final app = AppState();
      await tester.pumpWidget(ChangeNotifierProvider.value(
          value: app,
          child: const MaterialApp(
              home: Scaffold(
                  body: SingleChildScrollView(
                      child: CompletionSoundSettings())))));
      await tester.tap(find.text('提示音'));
      await tester.pumpAndSettle();
      expect(find.text('选择音频'), findsOneWidget);
      expect(find.text('主题'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      app.dispose();
    });
  }
}

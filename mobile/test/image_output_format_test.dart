import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image_lib;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/images/webp_output.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/settings_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import '../integration_test/native_settings_disclosure.dart';

class _Paths extends PathProviderPlatform {
  final String root;
  _Paths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
  @override
  Future<String?> getApplicationSupportPath() async => root;
}

/// NovelAI-like PNG: tEXt chunks plus alpha values that vary in the LSB.
Uint8List _novelAiPng() {
  final image = image_lib.Image(width: 96, height: 64, numChannels: 4);
  for (final p in image) {
    p
      ..r = (p.x * 3) % 256
      ..g = (p.y * 5) % 256
      ..b = 40
      ..a = 254 + ((p.x + p.y) % 2);
  }
  final png = image_lib.encodePng(image);
  final comment = jsonEncode({
    'prompt': 'girl', 'uc': 'lowres', 'steps': 28, 'seed': 7, 'sampler': 'k_euler_ancestral',
    'v4_prompt': {'caption': {'base_caption': 'girl', 'char_captions': [{'char_caption': 'red hair', 'centers': [{'x': 0.2, 'y': 0.8}]}]}, 'use_coords': true},
  });
  final ihdrEnd = 8 + 12 + ByteData.sublistView(png).getUint32(8);
  final out = BytesBuilder()..add(png.sublist(0, ihdrEnd));
  for (final entry in {'Title': 'NovelAI generated image', 'Description': 'girl', 'Software': 'NovelAI', 'Source': 'NovelAI Diffusion V4.5 4BDE2A90', 'Comment': comment}.entries) {
    final data = [...latin1.encode(entry.key), 0, ...utf8.encode(entry.value)];
    final body = [...ascii.encode('tEXt'), ...data];
    var c = 0xffffffff;
    for (final b in body) {
      c ^= b;
      for (var k = 0; k < 8; k++) { c = (c & 1) != 0 ? 0xedb88320 ^ (c >> 1) : c >> 1; }
    }
    out
      ..add((ByteData(4)..setUint32(0, data.length)).buffer.asUint8List())
      ..add(body)
      ..add((ByteData(4)..setUint32(0, (c ^ 0xffffffff) & 0xffffffff)).buffer.asUint8List());
  }
  out.add(png.sublist(ihdrEnd));
  return out.toBytes();
}

bool _samePixels(Uint8List png, Uint8List other) {
  final a = image_lib.decodePng(png)!, b = image_lib.decodeImage(other)!;
  if (a.width != b.width || a.height != b.height) return false;
  for (var y = 0; y < a.height; y++) {
    for (var x = 0; x < a.width; x++) {
      final pa = a.getPixel(x, y), pb = b.getPixel(x, y);
      if (pa.r != pb.r || pa.g != pb.g || pa.b != pb.b || pa.a != pb.a) return false;
    }
  }
  return true;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('lossless WebP encoding', () {
    test('PNG choice and non-PNG input are returned unchanged', () {
      final png = _novelAiPng();
      expect(identical(encodeSavedImage(png, format: 'png', keepMetadata: true), png), isTrue);
      expect(savedImageExtension(png), 'png');
    });
    test('metadata on: pixel-exact WebP with NovelAI EXIF readable by the app reader', () {
      final png = _novelAiPng();
      final webp = encodeSavedImage(png, format: 'webp', keepMetadata: true);
      expect(savedImageExtension(webp), 'webp');
      expect(latin1.decode(webp.sublist(12, 16)), 'VP8X');
      expect(webp[20] & 0x08, 0x08, reason: 'VP8X EXIF flag');
      expect(_samePixels(png, webp), isTrue);
      final meta = parseImageTextMetadata(webp);
      expect(meta['Title'], 'NovelAI generated image');
      expect(meta['Artist'], 'NovelAI');
      final report = inspectImageMetadata(meta);
      expect(report.kind, ImageMetadataKind.novelAi);
      expect(report.characterCaptions.single.prompt, 'red hair');
      expect(report.imported.seed, 7);
    });
    test('metadata off: WebP of the privacy-stripped pixels without EXIF', () {
      final stripped = stripPngMetadata(_novelAiPng());
      final webp = encodeSavedImage(stripped, format: 'webp', keepMetadata: false);
      expect(savedImageExtension(webp), 'webp');
      expect(latin1.decode(webp, allowInvalid: true).contains('EXIF'), isFalse);
      expect(parseImageTextMetadata(webp), isEmpty);
      expect(_samePixels(stripped, webp), isTrue);
    });
  });

  group('Storage.saveImage format x metadata', () {
    late Directory root;
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      UnifiedStorage.active = null;
      root = await Directory.systemTemp.createTemp('image-output-format-');
      PathProviderPlatform.instance = _Paths(root.path);
    });
    tearDown(() => root.delete(recursive: true));

    for (final format in ['png', 'webp']) {
      for (final keep in [true, false]) {
        test('$format keepMetadata=$keep', () async {
          final storage = Storage();
          await storage.setSettings(AppSettings(imageOutputDir: root.path, imageNameTemplate: 'probe', saveToGallery: false, keepImageMetadata: keep, imageOutputFormat: format));
          expect((await Storage().getSettings()).imageOutputFormat, format);
          final source = _novelAiPng();
          final item = await storage.saveImage(source, GenerateParams(width: 96, height: 64), 1);
          final saved = await File(item.filePath).readAsBytes();
          expect(item.filePath.endsWith('.$format'), isTrue);
          expect(savedImageExtension(saved), format);
          expect(_samePixels(keep ? source : stripPngMetadata(source), saved), isTrue);
          expect(inspectImageMetadata(parseImageTextMetadata(saved)).kind, keep ? ImageMetadataKind.novelAi : ImageMetadataKind.unknown);
          expect((await Storage().getHistory()).single.filePath, item.filePath);
        });
      }
    }
    test('a failed optional conversion keeps the PNG', () async {
      final storage = Storage();
      await storage.setSettings(AppSettings(imageOutputDir: root.path, imageNameTemplate: 'probe', saveToGallery: false, keepImageMetadata: true, imageOutputFormat: 'webp'));
      final broken = Uint8List.fromList([..._novelAiPng().sublist(0, 60), ...ascii.encode('truncated')]);
      final item = await storage.saveImage(broken, GenerateParams(width: 96, height: 64), 1);
      expect(item.filePath.endsWith('.png'), isTrue);
      expect(await File(item.filePath).readAsBytes(), broken);
    });
    test('older settings without the field keep PNG and invalid values fall back to PNG', () {
      expect(AppSettings.fromJson({}).imageOutputFormat, 'png');
      expect(AppSettings.fromJson({'imageOutputFormat': 'gif'}).imageOutputFormat, 'png');
      expect(AppSettings.fromJson({'imageOutputFormat': 'webp'}).toJson()['imageOutputFormat'], 'webp');
    });
  });

  for (final width in [320.0, 360.0]) {
    testWidgets('settings expose a persistent PNG / WebP choice at ${width.toInt()}dp', (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 800);
      final app = AppState();
      app.settings.language = 'zh-CN';
      addTearDown(() async {
        await tester.pumpWidget(const SizedBox.shrink());
        app.dispose();
        tester.view.reset();
      });
      await tester.pumpWidget(ChangeNotifierProvider.value(value: app, child: const MaterialApp(home: SettingsScreen())));
      await tester.pump();
      const key = ValueKey('image-output-format-setting');
      final control = await nativeSettingsControl(
          sectionTitle: settingsScreenTextFor(app.settings.language).storageSection,
          targetKey: key,
          androidCategory: 'storage',
          waitFrame: () => tester.pump(const Duration(milliseconds: 50)),
          tapDisclosure: (e) async {
            await Scrollable.ensureVisible(e, alignment: .5, duration: Duration.zero);
            await tester.pump();
            final box = e.findRenderObject() as RenderBox;
            await tester.tapAt(box.localToGlobal(box.size.center(Offset.zero)));
            await tester.pump();
          });
      expect(control, isNotNull);
      // Let the disclosure finish expanding before scrolling the real list.
      await tester.pumpAndSettle();
      final webp = find.text('WebP（无损）');
      await tester.ensureVisible(webp);
      await tester.pumpAndSettle();
      expect(find.text('PNG（默认）').hitTestable(), findsOneWidget);
      expect(webp.hitTestable(), findsOneWidget);
      await tester.tap(webp);
      await tester.pumpAndSettle();
      expect(app.settings.imageOutputFormat, 'webp');
      expect((await Storage().getSettings()).imageOutputFormat, 'webp');
      expect(tester.takeException(), isNull);
    }, variant: const TargetPlatformVariant({TargetPlatform.android, TargetPlatform.iOS}));
  }
}

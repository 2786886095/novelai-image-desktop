import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/services/image_clipboard.dart';
import 'package:novelai_mobile/services/composer_transfers.dart';
import 'package:novelai_mobile/i18n/image_actions_text.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  tearDown(() =>
      messenger.setMockMethodCallHandler(ComposerTransfers.channel, null));
  for (final format in ['png', 'jpeg']) {
    for (final original in [false, true]) {
      test(
          '$format clipboard original=$original sends encoded image bytes, not a file path',
          () async {
        final dir = Directory.systemTemp.createTempSync('mobile-copy-');
        addTearDown(() => dir.deleteSync(recursive: true));
        final image = img.Image(width: 8, height: 4, textData: {
          'Software': 'NovelAI',
          'Comment': '{"prompt":"source prompt","seed":123}'
        });
        final source = Uint8List.fromList(
            format == 'png' ? img.encodePng(image) : img.encodeJpg(image));
        // Renamed files must still publish the correct original media type.
        final file = File('${dir.path}/renamed.bin')..writeAsBytesSync(source);
        Map<dynamic, dynamic>? received;
        messenger.setMockMethodCallHandler(ComposerTransfers.channel,
            (call) async {
          expect(call.method, 'copyImage');
          received = call.arguments as Map;
          return true;
        });
        expect(
            await ImageClipboard.copy(file.path,
                withOriginalMetadata: original),
            true);
        final actual = received!['bytes'] as Uint8List;
        if (original) {
          expect(actual, source);
          expect(
              received!['mime'], format == 'png' ? 'image/png' : 'image/jpeg');
        } else {
          expect(actual, isNot(equals(source)));
          expect(received!['mime'], 'image/png');
          expect(parseImageTextMetadata(actual), isEmpty);
        }
        expect(File(file.path).readAsBytesSync(), source);
      });
    }
  }
  test('default copy removes hidden alpha-channel generation metadata too', () {
    final image = img.Image(width: 32, height: 32, numChannels: 4);
    img.fill(image, color: img.ColorRgba8(100, 80, 60, 255));
    final data = utf8.encode(jsonEncode({
      'Software': 'NovelAI',
      'Comment': '{"prompt":"hidden prompt","seed":123}'
    }));
    // Build the real column-major alpha-bit format read by production parsing.
    final length = ByteData(4)..setUint32(0, data.length * 8);
    final encoded = [
      ...utf8.encode('stealth_pnginfo'),
      ...length.buffer.asUint8List(),
      ...data
    ];
    var cursor = 0;
    for (final byte in encoded) {
      for (var bit = 7; bit >= 0; bit--) {
        final pixel =
            image.getPixel(cursor ~/ image.height, cursor % image.height);
        image.setPixelRgba(pixel.x, pixel.y, pixel.r, pixel.g, pixel.b,
            254 | ((byte >> bit) & 1));
        cursor++;
      }
    }
    final source = Uint8List.fromList(img.encodePng(image));
    expect(parseImageTextMetadata(source)['Software'], 'NovelAI');
    expect(parseImageTextMetadata(prepareClipboardImage(source)), isEmpty);
  });
  test('unsupported platform does not claim an image clipboard copy', () async {
    final dir = Directory.systemTemp.createTempSync('mobile-copy-unsupported-');
    addTearDown(() => dir.deleteSync(recursive: true));
    final file = File('${dir.path}/a.png')
      ..writeAsBytesSync(img.encodePng(img.Image(width: 2, height: 2)));
    expect(await ImageClipboard.copy(file.path, withOriginalMetadata: true),
        false);
  });
  test('native clipboard error propagates instead of reporting success',
      () async {
    final dir = Directory.systemTemp.createTempSync('mobile-copy-error-');
    addTearDown(() => dir.deleteSync(recursive: true));
    final file = File('${dir.path}/a.png')..writeAsBytesSync([1, 2, 3]);
    messenger.setMockMethodCallHandler(ComposerTransfers.channel,
        (_) async => throw PlatformException(code: 'image_clipboard'));
    await expectLater(
        ImageClipboard.copy(file.path, withOriginalMetadata: true),
        throwsA(isA<PlatformException>()));
  });
  test('copy/paste controls are translated in all saved languages', () {
    for (final language in ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR']) {
      for (final key in [
        'paste',
        'copy',
        'copied',
        'unsupported',
        'originalTitle',
        'originalHint'
      ]) {
        expect(imageActionsText(language, key), isNot(key));
      }
    }
  });
  test('an inactive composer cannot clear the active generation drop receiver',
      () async {
    final generation = Object(), agent = Object();
    final received = <String>[];
    messenger.setMockMethodCallHandler(
        ComposerTransfers.channel, (_) async => null);
    ComposerTransfers.listenFor(generation, (paths) async {
      received.addAll(paths);
    });
    ComposerTransfers.listenFor(agent, (paths) async {
      received.add('WRONG');
    });
    await ComposerTransfers.regionFor(
        generation, const Rect.fromLTWH(0, 0, 100, 100));
    await ComposerTransfers.regionFor(agent, null);
    await messenger.handlePlatformMessage(
        ComposerTransfers.channel.name,
        const StandardMethodCodec()
            .encodeMethodCall(const MethodCall('drop', ['source.png'])),
        (_) {});
    expect(received, ['source.png']);
    ComposerTransfers.listenFor(generation, null);
    await ComposerTransfers.regionFor(generation, null);
    ComposerTransfers.listenFor(agent, null);
  });
}

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novelai_mobile/images/png_metadata.dart';

Uint8List chunk(String type, List<int> body) {
  final bytes = Uint8List(body.length + 12);
  ByteData.sublistView(bytes).setUint32(0, body.length);
  bytes.setRange(4, 8, ascii.encode(type));
  bytes.setRange(8, 8 + body.length, body);
  return bytes;
}

Uint8List png(List<Uint8List> chunks) => Uint8List.fromList([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
      ...chunks.expand((c) => c),
      ...chunk('IEND', []),
    ]);
void main() {
  test('reads compressed PNG zTXt and iTXt', () {
    const value = '{"prompt":"蓝色衣服", "seed":123}';
    for (final c in [
      chunk('zTXt', [
        ...ascii.encode('Comment'),
        0,
        0,
        ...zlib.encode(utf8.encode(value))
      ]),
      chunk('iTXt', [
        ...ascii.encode('Comment'),
        0,
        1,
        0,
        0,
        0,
        ...zlib.encode(utf8.encode(value))
      ]),
    ]) {
      expect(parseImageTextMetadata(png([c]))['Comment'], value);
    }
  });
  test('malformed compressed chunk does not hide later valid metadata', () {
    final data = png([
      chunk('zTXt', [...ascii.encode('Comment'), 0, 0, 1, 2, 3]),
      chunk('tEXt',
          [...ascii.encode('Description'), 0, ...utf8.encode('valid prompt')]),
    ]);
    expect(parseImageTextMetadata(data)['Description'], 'valid prompt');
  });
  test('oversized compressed metadata is bounded and later text survives', () {
    final data = png([
      chunk('zTXt', [
        ...ascii.encode('Comment'),
        0,
        0,
        ...zlib.encode(List.filled(9 * 1024 * 1024, 65))
      ]),
      chunk(
          'tEXt', [...ascii.encode('Description'), 0, ...ascii.encode('kept')]),
    ]);
    final result = parseImageTextMetadata(data);
    expect(result.containsKey('Comment'), false);
    expect(result['Description'], 'kept');
  });
  test('PNG EXIF JSON UserComment restores NovelAI parameters', () {
    final text = utf8.encode('{"prompt":"blue sky","seed":321}');
    final value = [...ascii.encode('ASCII'), 0, 0, 0, ...text, 0];
    final tiff = Uint8List(26 + value.length);
    final d = ByteData.sublistView(tiff);
    tiff.setRange(0, 2, ascii.encode('II'));
    d.setUint16(2, 42, Endian.little);
    d.setUint32(4, 8, Endian.little);
    d.setUint16(8, 1, Endian.little);
    d.setUint16(10, 0x9286, Endian.little);
    d.setUint16(12, 7, Endian.little);
    d.setUint32(14, value.length, Endian.little);
    d.setUint32(18, 26, Endian.little);
    tiff.setRange(26, tiff.length, value);
    final result = parseImportedGenerateParams(
        parseImageTextMetadata(png([chunk('eXIf', tiff)])));
    expect(result.seed, 321);
    expect(result.positivePrompt, 'blue sky');
  });
  test('reads official alpha-channel stealth_pngcomp without text chunks', () {
    final value = jsonEncode({
      'Software': 'NovelAI',
      'Comment': jsonEncode({'prompt': 'blue sky', 'seed': 123})
    });
    final payload = gzip.encode(utf8.encode(value));
    final length = ByteData(4)..setUint32(0, payload.length * 8);
    final encoded = [
      ...ascii.encode('stealth_pngcomp'),
      ...length.buffer.asUint8List(),
      ...payload
    ];
    final image = img.Image(width: 64, height: 64, numChannels: 4)
      ..clear(img.ColorRgba8(20, 30, 40, 255));
    var bit = 0;
    for (final byte in encoded) {
      for (var shift = 7; shift >= 0; shift--) {
        image.setPixelRgba(
            bit ~/ 64, bit % 64, 20, 30, 40, 254 | ((byte >> shift) & 1));
        bit++;
      }
    }
    final result =
        parseImageTextMetadata(Uint8List.fromList(img.encodePng(image)));
    expect(result['Software'], 'NovelAI');
    expect(parseImportedGenerateParams(result).seed, 123);
    expect(parseImportedGenerateParams(result).positivePrompt, 'blue sky');
  });
}

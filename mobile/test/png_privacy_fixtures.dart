import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:image/image.dart' as img;

int privacyCrc(List<int> bytes) {
  var crc = 0xffffffff;
  for (final value in bytes) {
    crc ^= value;
    for (var bit = 0; bit < 8; bit++) {
      crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xedb88320 : crc >> 1;
    }
  }
  return (crc ^ 0xffffffff) & 0xffffffff;
}

Uint8List privacyChunk(String type, List<int> payload) {
  final bytes = Uint8List(payload.length + 12);
  final data = ByteData.sublistView(bytes);
  data.setUint32(0, payload.length);
  bytes.setRange(4, 8, ascii.encode(type));
  bytes.setRange(8, 8 + payload.length, payload);
  data.setUint32(8 + payload.length, privacyCrc(bytes.sublist(4, 8 + payload.length)));
  return bytes;
}

Uint8List privacyText(Uint8List png) => Uint8List.fromList([
  ...png.sublist(0, 33),
  ...privacyChunk('tEXt', utf8.encode('Description\x00PRIVATE-PROMPT')),
  ...privacyChunk('zTXt', [ ...ascii.encode('Comment'), 0, 0,
    ...zlib.encode(utf8.encode('{"seed":4234567890}'))]),
  ...privacyChunk('iTXt', [ ...ascii.encode('parameters'), 0, 0, 0, 0, 0,
    ...utf8.encode('PRIVATE-PROMPT\nSteps: 28, Seed: 4234567890')]),
  ...privacyChunk('eXIf', utf8.encode('PRIVATE-EXIF')),
  ...png.sublist(33),
  ...utf8.encode('PRIVATE-TRAILER'),
]);

Uint8List privacyFixture(String carrier, {bool compressed = true, bool text = false}) {
  final image = img.Image(width: 64, height: 64, numChannels: 4);
  for (var x = 0; x < image.width; x++) {
    for (var y = 0; y < image.height; y++) {
      image.setPixelRgba(x, y, 60 + x * 2, 80 + y * 2, 130,
          (x + y) % 3 == 0 ? 100 : 254);
    }
  }
  final payload = utf8.encode(jsonEncode({
    'Software': 'NovelAI', 'Description': 'PRIVATE-PROMPT',
    'Comment': jsonEncode({'prompt': 'PRIVATE-PROMPT', 'seed': 4234567890})
  }));
  if (carrier != 'none') {
    final encoded = compressed ? gzip.encode(payload) : payload;
    final signature = 'stealth_${carrier == 'alpha' ? 'png' : 'rgb'}${compressed ? 'comp' : 'info'}';
    final length = Uint8List(4);
    ByteData.sublistView(length).setUint32(0, encoded.length * 8);
    final bits = [ ...ascii.encode(signature), ...length, ...encoded ]
        .expand((v) => List.generate(8, (i) => (v >> (7 - i)) & 1)).toList();
    for (var i = 0; i < bits.length; i++) {
      final index = carrier == 'alpha' ? i : i ~/ 3;
      final pixel = image.getPixel(index ~/ image.height, index % image.height);
      final channel = carrier == 'alpha' ? 3 : i % 3;
      pixel[channel] = (pixel[channel].toInt() & 254) | bits[i];
    }
  }
  final png = img.encodePng(image);
  return text ? privacyText(png) : png;
}

String privacyHeader(Uint8List bytes, String carrier) {
  final image = img.decodePng(bytes)!;
  return String.fromCharCodes(List.generate(15, (b) {
    var value = 0;
    for (var bit = 0; bit < 8; bit++) {
      final i = b * 8 + bit;
      final index = carrier == 'alpha' ? i : i ~/ 3;
      final p = image.getPixel(index ~/ image.height, index % image.height);
      value = value * 2 + (p[carrier == 'alpha' ? 3 : i % 3].toInt() & 1);
    }
    return value;
  }));
}

List<int> privacyIdat(Uint8List bytes) {
  final data = ByteData.sublistView(bytes), output = <int>[];
  for (var offset = 8; offset + 12 <= bytes.length;) {
    final length = data.getUint32(offset), end = offset + length + 12;
    if (end > bytes.length) break;
    if (ascii.decode(bytes.sublist(offset + 4, offset + 8)) == 'IDAT') {
      output.addAll(bytes.sublist(offset + 8, end - 4));
    }
    offset = end;
  }
  return output;
}

Map<String, Uint8List> privacyStrongFixtures() {
  final unknown = img.decodePng(privacyFixture('none'))!;
  var state = 0x5f3759df;
  for (final pixel in unknown) {
    for (var c = 0; c < 4; c++) {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      pixel[c] = (pixel[c].toInt() & 254) | (state >> 24 & 1);
    }
  }
  final badMagic = img.decodePng(privacyFixture('alpha'))!;
  badMagic.getPixel(0, 0).a = badMagic.getPixel(0, 0).a.toInt() ^ 1;
  final plain = img.encodePng(unknown);
  final decorated = Uint8List.fromList([
    ...plain.sublist(0, 33),
    ...privacyChunk('iCCP', [...ascii.encode('PRIVATE-ICC'),0,0,...zlib.encode(utf8.encode('PRIVATE-ICC-PAYLOAD'))]),
    ...privacyChunk('iTXt', [...ascii.encode('XML:com.adobe.xmp'),0,0,0,0,0,...utf8.encode('<x:xmpmeta>PRIVATE-XMP</x:xmpmeta>')]),
    ...privacyChunk('vpAg', utf8.encode('PRIVATE-CUSTOM-PAYLOAD')),
    ...plain.sublist(33), ...utf8.encode('PRIVATE-TRAILER'),
  ]);
  return {
    'ordinary': privacyFixture('none'),
    'bad-magic': img.encodePng(badMagic),
    'unknown-random-lsb': plain,
    'icc-xmp-custom-random-lsb': decorated,
  };
}

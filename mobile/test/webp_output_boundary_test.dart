import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image_lib;
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/images/webp_output.dart';

Uint8List _rgbaPng({bool deep = false}) {
  final image = image_lib.Image(
    width: 17,
    height: 9,
    numChannels: 4,
    format: deep ? image_lib.Format.uint16 : image_lib.Format.uint8,
  );
  for (final pixel in image) {
    if (deep) {
      pixel
        ..r = 513 + pixel.x * 1231
        ..g = 1027 + pixel.y * 2017
        ..b = 65534 - pixel.x * 997
        ..a = [0, 1, 256, 32767, 65534, 65535][(pixel.x + pixel.y) % 6];
    } else {
      pixel
        ..r = (19 + pixel.x * 13) % 256
        ..g = (31 + pixel.y * 23) % 256
        ..b = (91 + pixel.x * 7 + pixel.y * 11) % 256
        ..a = [0, 1, 127, 128, 254, 255][(pixel.x + pixel.y) % 6];
    }
  }
  return image_lib.encodePng(image);
}

void _sameRgba(Uint8List source, Uint8List output) {
  final before = image_lib.decodePng(source)!;
  final after = image_lib.decodeImage(output)!;
  expect([after.width, after.height], [before.width, before.height]);
  for (var y = 0; y < before.height; y++) {
    for (var x = 0; x < before.width; x++) {
      final a = before.getPixel(x, y), b = after.getPixel(x, y);
      expect([b.r, b.g, b.b, b.a], [a.r, a.g, a.b, a.a],
          reason: 'RGBA at $x,$y, including RGB under alpha=0');
    }
  }
}

void _evidence(String stem, Uint8List png, Uint8List output) {
  final path = Platform.environment['WEBP_BOUNDARY_EVIDENCE_DIR'];
  if (path == null) return;
  final directory = Directory(path)..createSync(recursive: true);
  File('${directory.path}/$stem.png').writeAsBytesSync(png);
  File('${directory.path}/$stem.output.${savedImageExtension(output)}')
      .writeAsBytesSync(output);
  File('${directory.path}/$stem.json').writeAsStringSync(jsonEncode({
    'sourceBytes': png.length,
    'outputBytes': output.length,
    'actualFormat': savedImageExtension(output),
    'bitDepth': png[24],
  }));
}

void main() {
  test('8-bit WebP retains transparent RGB, partial alpha and odd dimensions', () {
    final png = _rgbaPng();
    final webp = encodeSavedImage(png, format: 'webp', keepMetadata: true);
    _evidence('rgba8-exact', png, webp);
    expect(savedImageExtension(webp), 'webp');
    _sameRgba(png, webp);
  });

  test('privacy-cleared 8-bit pixels remain exact through WebP encoding', () {
    final cleared = stripPngMetadata(_rgbaPng());
    final webp = encodeSavedImage(cleared, format: 'webp', keepMetadata: false);
    _evidence('rgba8-privacy-cleared', cleared, webp);
    expect(savedImageExtension(webp), 'webp');
    _sameRgba(cleared, webp);
    expect(parseImageTextMetadata(webp), isEmpty);
  });

  test('16-bit PNG is retained byte-for-byte instead of reducing precision', () {
    final png = _rgbaPng(deep: true);
    expect(png[24], 16);
    final output = encodeSavedImage(png, format: 'webp', keepMetadata: true);
    _evidence('rgba16-precision', png, output);
    expect(savedImageExtension(output), 'png');
    expect(output, png);
    _sameRgba(png, output);
  });
}

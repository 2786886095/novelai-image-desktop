import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image_lib;
import 'package:novelai_mobile/images/webp_output.dart';

void main() {
  test('high-bit-depth fallback preserves bytes and exposes a controlled reason', () {
    final image = image_lib.Image(
        width: 3, height: 2, format: image_lib.Format.uint16, numChannels: 4);
    image.setPixelRgba(0, 0, 1234, 4567, 65001, 32767);
    final png = image_lib.encodePng(image);
    final result = encodeSavedImageResult(png, format: 'webp', keepMetadata: true);
    expect(result.fallbackReason, 'png-high-bit-depth');
    expect(result.bytes, same(png));
    expect(savedImageExtension(result.bytes), 'png');
  });

  test('encoding failure preserves the PNG without leaking decoder error text', () {
    final broken = Uint8List.fromList([137, 80, 78, 71, 13, 10, 26, 10, 1]);
    final result = encodeSavedImageResult(broken, format: 'webp', keepMetadata: true);
    expect(result.fallbackReason, 'webp-encoding-failed');
    expect(result.bytes, same(broken));
  });

  test('an already-WebP input or a PNG preference does not report fallback', () {
    final png = image_lib.encodePng(image_lib.Image(width: 3, height: 2));
    final unchanged = encodeSavedImageResult(png, format: 'png', keepMetadata: true);
    expect(unchanged.bytes, same(png));
    expect(unchanged.fallbackReason, isNull);
    final encoded = encodeSavedImageResult(png, format: 'webp', keepMetadata: true);
    expect(encoded.fallbackReason, isNull);
    expect(savedImageExtension(encoded.bytes), 'webp');
    final existing = encodeSavedImageResult(encoded.bytes, format: 'webp', keepMetadata: true);
    expect(existing.bytes, same(encoded.bytes));
    expect(existing.fallbackReason, isNull);
  });
}

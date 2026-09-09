import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image;
import 'package:novelai_mobile/images/image_processing.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final name in ['lossy', 'lossless', 'alpha', 'animated']) {
    test('$name WebP keeps complete size and static PNG processing', () async {
      final input =
          File('../shared/image-input-fixtures/$name.webp').readAsBytesSync();
      final original = Uint8List.fromList(input);
      expect(decodeImageDimensions(input), (96, 64));
      final output = await processingImageBytes(input);
      expect(isWebpImage(output), isFalse);
      final decoded = image.decodePng(output)!;
      expect((decoded.width, decoded.height), (96, 64));
      expect(decoded.numFrames, 1);
      expect(input, original);
      if (name == 'alpha') expect(decoded.getPixel(20, 20).a, lessThan(255));
      final mask = image.Image(width: 96, height: 64, numChannels: 4)
        ..clear(image.ColorRgba8(255, 255, 255, 255));
      final prepared = prepareInpaintAssets(
          output, Uint8List.fromList(image.encodePng(mask)));
      expect(prepared.width, greaterThan(0));
      expect(prepared.height, greaterThan(0));
      expect(isWebpImage(prepareImageWithinPixels(output).bytes), isFalse);
    });
  }
  test(
      'malformed WebP produces a decode error',
      () => expect(
          () => processingImageBytes(
              Uint8List.fromList('RIFF0000WEBPinvalid'.codeUnits)),
          throwsA(isA<FormatException>())));
}

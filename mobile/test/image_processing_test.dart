import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image_lib;
import 'package:novelai_mobile/images/image_processing.dart';

void main() {
  test('decodes PNG and JPEG dimensions', () {
    final image = image_lib.Image(width: 13, height: 17);
    expect(
      decodeImageDimensions(Uint8List.fromList(image_lib.encodePng(image))),
      (13, 17),
    );
    expect(
      decodeImageDimensions(Uint8List.fromList(image_lib.encodeJpg(image))),
      (13, 17),
    );
  });

  test('shrinks upscale input to the configured pixel ceiling', () {
    final image = image_lib.Image(width: 200, height: 100);
    final prepared = prepareImageWithinPixels(
      Uint8List.fromList(image_lib.encodePng(image)),
      maxPixels: 5000,
    );
    expect(prepared.resized, isTrue);
    expect(prepared.width * prepared.height, lessThanOrEqualTo(5000));
    expect(decodeImageDimensions(prepared.bytes),
        (prepared.width, prepared.height));
  });

  test('pads inpaint image and mask to 64 then crops the response', () {
    final source = image_lib.Image(width: 65, height: 67)
      ..setPixelRgba(64, 66, 10, 20, 30, 255);
    final mask = image_lib.Image(width: 65, height: 67)
      ..setPixelRgba(10, 11, 255, 255, 255, 255);
    final prepared = prepareInpaintAssets(
      Uint8List.fromList(image_lib.encodePng(source)),
      Uint8List.fromList(image_lib.encodePng(mask)),
    );
    expect((prepared.width, prepared.height), (128, 128));
    expect(prepared.padded, isTrue);

    final paddedImage = image_lib.decodeImage(prepared.imageBytes)!;
    final edge = paddedImage.getPixel(127, 127);
    expect((edge.r.toInt(), edge.g.toInt(), edge.b.toInt()), (10, 20, 30));
    final cropped = cropImageToSize(prepared.imageBytes, 65, 67);
    expect(decodeImageDimensions(cropped), (65, 67));
  });

  test('director preparation flattens alpha and restores original size', () {
    final source = image_lib.Image(width: 200, height: 100, numChannels: 4)
      ..setPixelRgba(0, 0, 255, 0, 0, 0);
    final prepared = prepareDirectorImage(
      Uint8List.fromList(image_lib.encodePng(source)),
      maxPixels: 5000,
    );
    expect(prepared.resized, isTrue);
    expect(prepared.width * prepared.height, lessThanOrEqualTo(5000));
    final flattened = image_lib.decodeImage(prepared.bytes)!;
    expect(flattened.numChannels, 3);
    final transparentPixel = flattened.getPixel(0, 0);
    expect(
      (
        transparentPixel.r.toInt(),
        transparentPixel.g.toInt(),
        transparentPixel.b.toInt(),
      ),
      (255, 255, 255),
    );

    final restored = resizeImageToSize(prepared.bytes, 200, 100);
    expect(decodeImageDimensions(restored), (200, 100));
  });
}

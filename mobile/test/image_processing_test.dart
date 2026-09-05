import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image_lib;
import 'package:novelai_mobile/images/image_processing.dart';

void main() {
  test('blocks an upscale result above the 4096px edge limit', () {
    expect(resolveUpscaleOutputSize(1024, 1024, 4),
        (width: 4096, height: 4096, exceedsLimit: false));
    expect(resolveUpscaleOutputSize(832, 1216, 4),
        (width: 3328, height: 4864, exceedsLimit: true));
  });

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

  test('resizes inpaint image and mask to the official 64-aligned size', () {
    final source = image_lib.Image(width: 65, height: 67, numChannels: 4)
      ..clear(image_lib.ColorRgba8(10, 20, 30, 255));
    final mask = image_lib.Image(width: 65, height: 67, numChannels: 4)
      ..clear(image_lib.ColorRgba8(255, 255, 255, 255));
    final prepared = prepareInpaintAssets(
      Uint8List.fromList(image_lib.encodePng(source)),
      Uint8List.fromList(image_lib.encodePng(mask)),
    );
    expect((prepared.width, prepared.height), (128, 128));
    expect(prepared.resized, isTrue);
    expect(decodeImageDimensions(prepared.maskBytes), (128, 128));

    final resizedImage = image_lib.decodeImage(prepared.imageBytes)!;
    final edge = resizedImage.getPixel(127, 127);
    expect((edge.r.toInt(), edge.g.toInt(), edge.b.toInt()), (10, 20, 30));
    final generated = image_lib.Image(width: 128, height: 128, numChannels: 4)
      ..clear(image_lib.ColorRgba8(200, 210, 220, 255));
    final output = compositeInpaintResult(
      Uint8List.fromList(image_lib.encodePng(generated)),
      prepared,
    );
    expect(decodeImageDimensions(output), (128, 128));
  });

  test('repairs a mismatched inpaint mask and blocks oversized sources', () {
    final source = image_lib.Image(width: 128, height: 128);
    final smallMask = image_lib.Image(width: 64, height: 64)
      ..setPixelRgba(10, 10, 255, 255, 255, 255);
    final repaired = prepareInpaintAssets(
      Uint8List.fromList(image_lib.encodePng(source)),
      Uint8List.fromList(image_lib.encodePng(smallMask)),
    );
    expect(repaired.resized, isFalse);
    expect(decodeImageDimensions(repaired.maskBytes), (128, 128));

    final oversized = image_lib.Image(width: 1601, height: 64);
    expect(
      () => prepareInpaintAssets(
        Uint8List.fromList(image_lib.encodePng(oversized)),
        Uint8List.fromList(image_lib.encodePng(oversized)),
      ),
      throwsFormatException,
    );
  });

  test('inpaint compositing preserves untouched source pixels', () {
    final source = image_lib.Image(width: 256, height: 256, numChannels: 4)
      ..clear(image_lib.ColorRgba8(220, 10, 10, 255));
    final mask = image_lib.Image(width: 256, height: 256, numChannels: 4)
      ..clear(image_lib.ColorRgba8(0, 0, 0, 255));
    for (var y = 128; y < 136; y++) {
      for (var x = 128; x < 136; x++) {
        mask.setPixelRgba(x, y, 255, 255, 255, 255);
      }
    }
    final prepared = prepareInpaintAssets(
      Uint8List.fromList(image_lib.encodePng(source)),
      Uint8List.fromList(image_lib.encodePng(mask)),
    );
    final generated = image_lib.Image(width: 256, height: 256, numChannels: 4)
      ..clear(image_lib.ColorRgba8(10, 20, 230, 255));
    final output = image_lib.decodeImage(compositeInpaintResult(
      Uint8List.fromList(image_lib.encodePng(generated)),
      prepared,
    ))!;
    final corner = output.getPixel(0, 0);
    final center = output.getPixel(132, 132);
    expect(
      (corner.r.toInt(), corner.g.toInt(), corner.b.toInt()),
      (220, 10, 10),
    );
    expect(center.b.toInt(), greaterThan(center.r.toInt()));
    expect(prepared.blendAlpha[132 * prepared.width + 132], greaterThan(200));
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

  test('director reference preparation pads with white, not black', () {
    // A black letterbox reads as image content to NovelAI and is itself a
    // source of screentone/halftone artifacts on the output — pick a source
    // aspect ratio (tall/thin) that forces real left/right padding against
    // the closest official size (1024x1536) so the corner is untouched fill,
    // not source content.
    final source = image_lib.Image(width: 50, height: 200);
    final prepared = prepareDirectorReferenceImage(
      Uint8List.fromList(image_lib.encodePng(source)),
    );
    final decoded = image_lib.decodeImage(prepared)!;
    expect(decoded.numChannels, 3);
    expect((decoded.width, decoded.height), (1024, 1536));
    final corner = decoded.getPixel(0, 0);
    expect(
      (corner.r.toInt(), corner.g.toInt(), corner.b.toInt()),
      (255, 255, 255),
    );
  });
}

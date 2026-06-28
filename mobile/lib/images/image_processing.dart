import 'dart:math';
import 'dart:typed_data';

import 'package:image/image.dart' as image_lib;

class PreparedImage {
  final Uint8List bytes;
  final int width;
  final int height;
  final bool resized;

  const PreparedImage({
    required this.bytes,
    required this.width,
    required this.height,
    this.resized = false,
  });
}

class PreparedDirectorImage {
  final Uint8List bytes;
  final int width;
  final int height;
  final int originalWidth;
  final int originalHeight;
  final bool resized;

  const PreparedDirectorImage({
    required this.bytes,
    required this.width,
    required this.height,
    required this.originalWidth,
    required this.originalHeight,
    required this.resized,
  });
}

class PreparedInpaintAssets {
  final Uint8List imageBytes;
  final Uint8List maskBytes;
  final int width;
  final int height;
  final int originalWidth;
  final int originalHeight;
  final bool padded;

  const PreparedInpaintAssets({
    required this.imageBytes,
    required this.maskBytes,
    required this.width,
    required this.height,
    required this.originalWidth,
    required this.originalHeight,
    required this.padded,
  });
}

(int, int) decodeImageDimensions(Uint8List bytes) {
  final decoded = image_lib.decodeImage(bytes);
  return decoded == null ? (0, 0) : (decoded.width, decoded.height);
}

PreparedImage prepareImageWithinPixels(
  Uint8List bytes, {
  int maxPixels = 1024 * 1024,
}) {
  final source = image_lib.decodeImage(bytes);
  if (source == null) throw const FormatException('Could not read image data');
  final pixels = source.width * source.height;
  if (pixels <= maxPixels) {
    return PreparedImage(
      bytes: bytes,
      width: source.width,
      height: source.height,
    );
  }
  final ratio = sqrt(maxPixels / pixels);
  final width = max(1, (source.width * ratio).floor());
  final height = max(1, (source.height * ratio).floor());
  final resized = image_lib.copyResize(
    source,
    width: width,
    height: height,
    interpolation: image_lib.Interpolation.average,
  );
  return PreparedImage(
    bytes: Uint8List.fromList(image_lib.encodePng(resized)),
    width: width,
    height: height,
    resized: true,
  );
}

PreparedDirectorImage prepareDirectorImage(
  Uint8List bytes, {
  int maxPixels = 1024 * 1024,
}) {
  final source = image_lib.decodeImage(bytes);
  if (source == null) {
    throw const FormatException('Could not read postprocess image');
  }
  final originalWidth = source.width;
  final originalHeight = source.height;
  final pixels = originalWidth * originalHeight;
  final resized = pixels > maxPixels;
  final ratio = resized ? sqrt(maxPixels / pixels) : 1.0;
  final width = max(1, (originalWidth * ratio).floor());
  final height = max(1, (originalHeight * ratio).floor());
  final working = resized
      ? image_lib.copyResize(
          source,
          width: width,
          height: height,
          interpolation: image_lib.Interpolation.average,
        )
      : source;

  // Director endpoints are substantially more stable with an opaque PNG.
  final flattened = image_lib.Image(width: width, height: height)
    ..clear(image_lib.ColorRgb8(255, 255, 255));
  image_lib.compositeImage(flattened, working);
  return PreparedDirectorImage(
    bytes: Uint8List.fromList(image_lib.encodePng(flattened)),
    width: width,
    height: height,
    originalWidth: originalWidth,
    originalHeight: originalHeight,
    resized: resized,
  );
}

/// Prepares a V4.5 precise (director) reference image the way the reference
/// implementations do: fit the source into the closest official director size
/// (1024x1536 / 1472x1472 / 1536x1024), letterbox onto an opaque BLACK canvas,
/// and drop the alpha channel (RGB, 3 channels). Sending the raw image — wrong
/// size or with an alpha channel — is what produces the screentone / halftone
/// (halftone / hatching) texture on the output.
Uint8List prepareDirectorReferenceImage(Uint8List bytes) {
  final source = image_lib.decodeImage(bytes);
  if (source == null) {
    throw const FormatException('Could not read precise reference image');
  }
  const sizes = <(int, int)>[(1024, 1536), (1472, 1472), (1536, 1024)];
  final aspect = source.width / source.height;
  var target = sizes.first;
  var best = double.infinity;
  for (final size in sizes) {
    final distance = (aspect - size.$1 / size.$2).abs();
    if (distance < best) {
      best = distance;
      target = size;
    }
  }
  final (targetWidth, targetHeight) = target;
  final scale = min(targetWidth / source.width, targetHeight / source.height);
  final fitWidth = max(1, (source.width * scale).round());
  final fitHeight = max(1, (source.height * scale).round());
  final fitted = image_lib.copyResize(
    source,
    width: fitWidth,
    height: fitHeight,
    interpolation: image_lib.Interpolation.cubic,
  );
  // Opaque RGB canvas (3 channels, no alpha) padded black, source centered.
  final canvas = image_lib.Image(
    width: targetWidth,
    height: targetHeight,
    numChannels: 3,
  )..clear(image_lib.ColorRgb8(0, 0, 0));
  image_lib.compositeImage(
    canvas,
    fitted,
    dstX: ((targetWidth - fitWidth) / 2).round(),
    dstY: ((targetHeight - fitHeight) / 2).round(),
  );
  return Uint8List.fromList(image_lib.encodePng(canvas));
}

Uint8List resizeImageToSize(Uint8List bytes, int width, int height) {
  final source = image_lib.decodeImage(bytes);
  if (source == null || width <= 0 || height <= 0) return bytes;
  if (source.width == width && source.height == height) return bytes;
  final resized = image_lib.copyResize(
    source,
    width: width,
    height: height,
    interpolation: image_lib.Interpolation.average,
  );
  return Uint8List.fromList(image_lib.encodePng(resized));
}

PreparedInpaintAssets prepareInpaintAssets(
  Uint8List imageBytes,
  Uint8List maskBytes,
) {
  final source = image_lib.decodeImage(imageBytes);
  final mask = image_lib.decodeImage(maskBytes);
  if (source == null) {
    throw const FormatException('Could not read inpaint source image');
  }
  if (mask == null) {
    throw const FormatException('Could not read inpaint mask');
  }
  final width = max(64, (source.width / 64).ceil() * 64);
  final height = max(64, (source.height / 64).ceil() * 64);
  final padded = width != source.width || height != source.height;
  if (!padded && mask.width == width && mask.height == height) {
    return PreparedInpaintAssets(
      imageBytes: imageBytes,
      maskBytes: maskBytes,
      width: width,
      height: height,
      originalWidth: source.width,
      originalHeight: source.height,
      padded: false,
    );
  }

  final paddedImage = image_lib.Image(width: width, height: height);
  final paddedMask = image_lib.Image(width: width, height: height);
  for (var y = 0; y < height; y++) {
    final sourceY = min(source.height - 1, y);
    for (var x = 0; x < width; x++) {
      final sourceX = min(source.width - 1, x);
      paddedImage.setPixel(x, y, source.getPixel(sourceX, sourceY));
      paddedMask.setPixelRgba(x, y, 0, 0, 0, 255);
    }
  }
  final copyWidth = min(mask.width, width);
  final copyHeight = min(mask.height, height);
  for (var y = 0; y < copyHeight; y++) {
    for (var x = 0; x < copyWidth; x++) {
      paddedMask.setPixel(x, y, mask.getPixel(x, y));
    }
  }
  return PreparedInpaintAssets(
    imageBytes: Uint8List.fromList(image_lib.encodePng(paddedImage)),
    maskBytes: Uint8List.fromList(image_lib.encodePng(paddedMask)),
    width: width,
    height: height,
    originalWidth: source.width,
    originalHeight: source.height,
    padded: true,
  );
}

Uint8List cropImageToSize(Uint8List bytes, int width, int height) {
  final source = image_lib.decodeImage(bytes);
  if (source == null || source.width < width || source.height < height) {
    return bytes;
  }
  if (source.width == width && source.height == height) return bytes;
  final cropped = image_lib.copyCrop(
    source,
    x: 0,
    y: 0,
    width: width,
    height: height,
  );
  return Uint8List.fromList(image_lib.encodePng(cropped));
}

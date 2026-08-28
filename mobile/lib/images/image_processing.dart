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
  final Uint8List blendAlpha;
  final int width;
  final int height;
  final int originalWidth;
  final int originalHeight;
  final bool resized;

  const PreparedInpaintAssets({
    required this.imageBytes,
    required this.maskBytes,
    required this.blendAlpha,
    required this.width,
    required this.height,
    required this.originalWidth,
    required this.originalHeight,
    required this.resized,
  });
}

const int _inpaintGridSize = 8;
const int _inpaintBlendDilateCells = 4;
const int _inpaintBlendBlurRadius = 20;
const int _inpaintBlendBlurPasses = 2;

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
/// (1024x1536 / 1472x1472 / 1536x1024), letterbox onto an opaque WHITE canvas,
/// and drop the alpha channel (RGB, 3 channels). Sending the raw image — wrong
/// size or with an alpha channel — is what produces the screentone / halftone
/// (halftone / hatching) texture on the output; a BLACK letterbox reads as
/// image content and is itself a source of that artifact (matches desktop's
/// electron/ipc/nai.ts prepareDirectorReferenceImage, fixed there for the
/// same reason).
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
  // Opaque RGB canvas (3 channels, no alpha) padded white, source centered.
  final canvas = image_lib.Image(
    width: targetWidth,
    height: targetHeight,
    numChannels: 3,
  )..clear(image_lib.ColorRgb8(255, 255, 255));
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
  if (width > 1600 || height > 1600) {
    throw FormatException(
      'Inpaint source ${source.width}x${source.height} exceeds the NovelAI limit; resize it so the adapted dimensions stay within 1600x1600.',
    );
  }
  final resized = width != source.width || height != source.height;
  final normalizedImage = resized
      ? image_lib.copyResize(
          source,
          width: width,
          height: height,
          interpolation: image_lib.Interpolation.cubic,
        )
      : source;

  // Match the current NovelAI frontend's two-stage path: quantize on the
  // model's 1/8 grid, then expand that binary grid back to full request size
  // with nearest-neighbour sampling before upload. Uploading the tiny latent
  // image itself can make the API reinterpret the mask and produce large flat
  // blobs or unrelated content. A separately dilated/feathered alpha is used
  // only for compositing the response over the source.
  final latentWidth = width ~/ _inpaintGridSize;
  final latentHeight = height ~/ _inpaintGridSize;
  final selected = Uint8List(latentWidth * latentHeight);
  var any = false;
  var usesAlpha = false;
  for (var y = 0; y < mask.height && !usesAlpha; y++) {
    for (var x = 0; x < mask.width; x++) {
      if (mask.getPixel(x, y).a.toInt() != 255) {
        usesAlpha = true;
        break;
      }
    }
  }
  for (var cellY = 0; cellY < latentHeight; cellY++) {
    for (var cellX = 0; cellX < latentWidth; cellX++) {
      // Match the official editor: nearest-resize to the 1/8 latent grid and
      // threshold alpha at 155. Brightness remains a compatibility fallback
      // for masks exported by older builds with fully opaque black pixels.
      final sourceX = min(
        mask.width - 1,
        (((cellX + 0.5) * mask.width) / latentWidth).floor(),
      );
      final sourceY = min(
        mask.height - 1,
        (((cellY + 0.5) * mask.height) / latentHeight).floor(),
      );
      final pixel = mask.getPixel(sourceX, sourceY);
      final alpha = pixel.a.toInt();
      final brightest =
          max(pixel.r.toInt(), max(pixel.g.toInt(), pixel.b.toInt()));
      final active = usesAlpha ? alpha > 155 : alpha > 0 && brightest > 155;
      final index = cellY * latentWidth + cellX;
      selected[index] = active ? 1 : 0;
      any = any || active;
    }
  }
  if (!any) throw const FormatException('Inpaint mask is empty');

  final requestMask = image_lib.Image(
    width: width,
    height: height,
    numChannels: 4,
  );
  for (var y = 0; y < height; y++) {
    final cellY = min(latentHeight - 1, y ~/ _inpaintGridSize);
    for (var x = 0; x < width; x++) {
      final cellX = min(latentWidth - 1, x ~/ _inpaintGridSize);
      final value = selected[cellY * latentWidth + cellX] == 0 ? 0 : 255;
      requestMask.setPixelRgba(x, y, value, value, value, 255);
    }
  }

  return PreparedInpaintAssets(
    imageBytes: Uint8List.fromList(image_lib.encodePng(normalizedImage)),
    maskBytes: Uint8List.fromList(image_lib.encodePng(requestMask)),
    blendAlpha: _buildInpaintBlendAlpha(
      selected,
      latentWidth,
      latentHeight,
      width,
      height,
    ),
    width: width,
    height: height,
    originalWidth: source.width,
    originalHeight: source.height,
    resized: resized,
  );
}

Uint8List _dilateLatentMask(
  Uint8List source,
  int width,
  int height,
  int radius,
) {
  final output = Uint8List(source.length);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var active = false;
      for (var dy = -radius; dy <= radius && !active; dy++) {
        final sourceY = y + dy;
        if (sourceY < 0 || sourceY >= height) continue;
        for (var dx = -radius; dx <= radius; dx++) {
          final sourceX = x + dx;
          if (sourceX >= 0 &&
              sourceX < width &&
              source[sourceY * width + sourceX] != 0) {
            active = true;
            break;
          }
        }
      }
      output[y * width + x] = active ? 1 : 0;
    }
  }
  return output;
}

Uint8List _officialBoxBlurAlpha(
  Uint8List source,
  int width,
  int height,
  int radius,
) {
  final horizontal = Int32List(source.length);
  final output = Uint8List(source.length);
  for (var y = 0; y < height; y++) {
    final row = y * width;
    var sum = source[row] * radius;
    for (var x = 0; x <= radius && x < width; x++) {
      sum += source[row + x];
    }
    for (var x = 0; x < width; x++) {
      horizontal[row + x] = sum;
      final removeX = max(0, x - radius);
      final addX = min(width - 1, x + radius + 1);
      sum -= source[row + removeX];
      sum += source[row + addX];
    }
  }
  for (var x = 0; x < width; x++) {
    var sum = horizontal[x] * radius;
    for (var y = 0; y <= radius && y < height; y++) {
      sum += horizontal[y * width + x];
    }
    for (var y = 0; y < height; y++) {
      output[y * width + x] = ((sum * 39) >> 16).clamp(0, 255).toInt();
      final removeY = max(0, y - radius);
      final addY = min(height - 1, y + radius + 1);
      sum -= horizontal[removeY * width + x];
      sum += horizontal[addY * width + x];
    }
  }
  return output;
}

Uint8List _buildInpaintBlendAlpha(
  Uint8List latentMask,
  int latentWidth,
  int latentHeight,
  int width,
  int height,
) {
  final dilated = _dilateLatentMask(
    latentMask,
    latentWidth,
    latentHeight,
    _inpaintBlendDilateCells,
  );
  var alpha = Uint8List(width * height);
  for (var y = 0; y < height; y++) {
    final cellY = min(latentHeight - 1, y ~/ _inpaintGridSize);
    for (var x = 0; x < width; x++) {
      final cellX = min(latentWidth - 1, x ~/ _inpaintGridSize);
      alpha[y * width + x] =
          dilated[cellY * latentWidth + cellX] == 0 ? 0 : 255;
    }
  }
  for (var pass = 0; pass < _inpaintBlendBlurPasses; pass++) {
    alpha = _officialBoxBlurAlpha(
      alpha,
      width,
      height,
      _inpaintBlendBlurRadius,
    );
  }
  return alpha;
}

Uint8List compositeInpaintResult(
  Uint8List generatedBytes,
  PreparedInpaintAssets prepared,
) {
  var generated = image_lib.decodeImage(generatedBytes);
  final source = image_lib.decodeImage(prepared.imageBytes);
  if (generated == null || source == null) {
    throw const FormatException('Could not decode inpaint response');
  }
  if (generated.width != prepared.width ||
      generated.height != prepared.height) {
    generated = image_lib.copyResize(
      generated,
      width: prepared.width,
      height: prepared.height,
      interpolation: image_lib.Interpolation.cubic,
    );
  }

  final composited = image_lib.Image(
    width: prepared.width,
    height: prepared.height,
    numChannels: 4,
  );
  int mix(num generatedValue, num sourceValue, double alpha) =>
      (generatedValue * alpha + sourceValue * (1 - alpha))
          .round()
          .clamp(0, 255)
          .toInt();
  for (var y = 0; y < prepared.height; y++) {
    for (var x = 0; x < prepared.width; x++) {
      final index = y * prepared.width + x;
      final alpha = prepared.blendAlpha[index] / 255;
      final generatedPixel = generated.getPixel(x, y);
      final sourcePixel = source.getPixel(x, y);
      composited.setPixelRgba(
        x,
        y,
        mix(generatedPixel.r, sourcePixel.r, alpha),
        mix(generatedPixel.g, sourcePixel.g, alpha),
        mix(generatedPixel.b, sourcePixel.b, alpha),
        mix(generatedPixel.a, sourcePixel.a, alpha),
      );
    }
  }

  final encoded = Uint8List.fromList(image_lib.encodePng(composited));
  return _copyPngMetadataChunks(generatedBytes, encoded);
}

const _pngSignature = <int>[137, 80, 78, 71, 13, 10, 26, 10];
const _pngMetadataChunkTypes = <String>{'tEXt', 'iTXt', 'zTXt', 'eXIf'};

bool _isPng(Uint8List bytes) {
  if (bytes.length < _pngSignature.length) return false;
  for (var index = 0; index < _pngSignature.length; index++) {
    if (bytes[index] != _pngSignature[index]) return false;
  }
  return true;
}

int _readPngUint32(Uint8List bytes, int offset) =>
    ByteData.sublistView(bytes, offset, offset + 4).getUint32(0);

String _pngChunkType(Uint8List bytes, int offset) =>
    String.fromCharCodes(bytes.sublist(offset + 4, offset + 8));

Uint8List _copyPngMetadataChunks(Uint8List source, Uint8List target) {
  if (!_isPng(source) || !_isPng(target)) return target;
  final metadata = <Uint8List>[];
  var sourceOffset = 8;
  while (sourceOffset + 12 <= source.length) {
    final length = _readPngUint32(source, sourceOffset);
    final type = _pngChunkType(source, sourceOffset);
    final end = sourceOffset + 12 + length;
    if (end > source.length) break;
    if (_pngMetadataChunkTypes.contains(type)) {
      metadata.add(Uint8List.sublistView(source, sourceOffset, end));
    }
    sourceOffset = end;
    if (type == 'IEND') break;
  }
  if (metadata.isEmpty) return target;

  var insertAt = 8;
  while (insertAt + 12 <= target.length) {
    final length = _readPngUint32(target, insertAt);
    final type = _pngChunkType(target, insertAt);
    if (type == 'IDAT' || type == 'IEND') break;
    final end = insertAt + 12 + length;
    if (end > target.length) return target;
    insertAt = end;
  }
  final builder = BytesBuilder(copy: false)
    ..add(Uint8List.sublistView(target, 0, insertAt));
  for (final chunk in metadata) {
    builder.add(chunk);
  }
  builder.add(Uint8List.sublistView(target, insertAt));
  return builder.toBytes();
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

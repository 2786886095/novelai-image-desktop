import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;

import 'composer_transfers.dart';

/// Original mode never decodes/re-encodes the source or synthesizes parameters.
Uint8List prepareClipboardImage(Uint8List source) {
  final decoded = img.decodeImage(source);
  if (decoded == null) throw const FormatException('Unsupported image');
  // Copy pixels into a fresh image: no EXIF, text, ICC or animation metadata.
  final clean =
      img.Image(width: decoded.width, height: decoded.height, numChannels: 4);
  for (final pixel in decoded) {
    clean.setPixelRgba(pixel.x, pixel.y, pixel.r, pixel.g, pixel.b, pixel.a);
  }
  if (decoded.width * decoded.height >= 120 && decoded.numChannels >= 4) {
    final signature = String.fromCharCodes(List.generate(15, (byte) {
      var value = 0;
      for (var bit = 0; bit < 8; bit++) {
        final cursor = byte * 8 + bit;
        value = (value << 1) |
            (decoded
                    .getPixel(cursor ~/ decoded.height, cursor % decoded.height)
                    .a
                    .toInt() &
                1);
      }
      return value;
    }));
    if (signature == 'stealth_pngcomp' || signature == 'stealth_pnginfo') {
      // Remove the hidden alpha-channel header too (one imperceptible bit).
      final first = clean.getPixel(0, 0);
      clean.setPixelRgba(0, 0, first.r, first.g, first.b, first.a.toInt() ^ 1);
    }
  }
  return Uint8List.fromList(img.encodePng(clean));
}

class ImageClipboard {
  static Future<bool> copy(String path,
      {required bool withOriginalMetadata}) async {
    final source = await File(path).readAsBytes();
    final bytes = withOriginalMetadata
        ? source
        : await compute(prepareClipboardImage, source);
    String mime = 'image/png';
    if (withOriginalMetadata) {
      // Use file signatures rather than a possibly renamed favorite suffix.
      if (source.length >= 3 && source[0] == 0xff && source[1] == 0xd8) {
        mime = 'image/jpeg';
      } else if (source.length >= 12 &&
          String.fromCharCodes(source.take(4)) == 'RIFF' &&
          String.fromCharCodes(source.skip(8).take(4)) == 'WEBP') {
        mime = 'image/webp';
      } else if (source.length >= 6 &&
          String.fromCharCodes(source.take(3)) == 'GIF') {
        mime = 'image/gif';
      } else if (source.length >= 2 && source[0] == 0x42 && source[1] == 0x4d) {
        mime = 'image/bmp';
      } else if (source.length >= 12 &&
          String.fromCharCodes(source.skip(4).take(4)) == 'ftyp') {
        mime = 'image/avif';
      }
    }
    try {
      return await ComposerTransfers.channel.invokeMethod<bool>(
              'copyImage', {'bytes': bytes, 'mime': mime}) ??
          false;
    } on MissingPluginException {
      return false; // Never claim a path/text copy is an image clipboard copy.
    }
  }
}

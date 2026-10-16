import '../images/image_file_access.dart';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;

import 'composer_transfers.dart';
import '../images/png_metadata.dart';

/// Cleaning re-encodes pixels. Original publishing validates a native decode,
/// but never re-encodes its source bytes or synthesizes parameters.
Uint8List prepareClipboardImage(Uint8List source) {
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  if (source.length >= 8 && png.asMap().entries.every((e) => source[e.key] == e.value)) {
    return stripPngMetadata(source);
  }
  // Preserve the existing non-PNG clipboard conversion feature. Its output is
  // PNG and receives the same complete pixel-carrier reset as saved PNGs.
  final decoded = img.decodeImage(source);
  if (decoded == null) throw const FormatException('Unsupported image');
  return stripPngMetadata(Uint8List.fromList(img.encodePng(decoded)));
}

class ImageClipboard {
  static Future<bool> copy(String path,
      {required bool withOriginalMetadata}) async {
    final source = await ImageFiles.read(path, maxBytes: 48*1024*1024);
    if(source.isEmpty || source.length>48*1024*1024)throw const FormatException('Unsupported image size');
    if(withOriginalMetadata){
      final buffer=await ui.ImmutableBuffer.fromUint8List(source);
      ui.ImageDescriptor? descriptor;ui.Codec? codec;ui.FrameInfo? frame;
      try{
        descriptor=await ui.ImageDescriptor.encoded(buffer);
        if(descriptor.width<=0 || descriptor.height<=0 || descriptor.width*descriptor.height>64*1024*1024)throw const FormatException('Unsupported image dimensions');
        codec=await descriptor.instantiateCodec();frame=await codec.getNextFrame();
      }catch(_){throw const FormatException('Unsupported image');}
      finally{frame?.image.dispose();codec?.dispose();descriptor?.dispose();buffer.dispose();}
    }
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

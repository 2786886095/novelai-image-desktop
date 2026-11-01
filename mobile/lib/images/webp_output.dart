import 'dart:convert';
import 'dart:typed_data';

import 'package:image/image.dart' as image_lib;

import 'png_metadata.dart';

/// Saved-image container chosen in settings. WebP preserves the prepared
/// 8-bit pixels exactly; deeper PNGs retain their original precision as PNG.
const savedImageFormats = {'png', 'webp'};

bool _isPng(Uint8List bytes) =>
    bytes.length >= 8 &&
    bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4e && bytes[3] == 0x47 &&
    bytes[4] == 0x0d && bytes[5] == 0x0a && bytes[6] == 0x1a && bytes[7] == 0x0a;

/// File extension for already-encoded image bytes (never derived from intent).
String savedImageExtension(Uint8List bytes) {
  if (_isPng(bytes)) return 'png';
  if (bytes.length >= 12 &&
      latin1.decode(bytes.sublist(0, 4)) == 'RIFF' &&
      latin1.decode(bytes.sublist(8, 12)) == 'WEBP') {
    return 'webp';
  }
  if (bytes.length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff) return 'jpg';
  return 'png';
}

/// Converts an already privacy-processed PNG into the chosen container. With
/// metadata kept, WebP carries NovelAI's EXIF layout (same as desktop).
Uint8List encodeSavedImage(Uint8List png,
    {required String format, required bool keepMetadata}) =>
    encodeSavedImageResult(png, format: format, keepMetadata: keepMetadata).bytes;

/// A controlled, non-sensitive reason lets save callers explain a PNG fallback
/// without exposing decoder errors or losing an already-paid result.
class SavedImageEncodingResult {
  final Uint8List bytes;
  final String? fallbackReason;

  const SavedImageEncodingResult(this.bytes, {this.fallbackReason});
}

SavedImageEncodingResult encodeSavedImageResult(Uint8List png,
    {required String format, required bool keepMetadata}) {
  if (format != 'webp') return SavedImageEncodingResult(png);
  if (!_isPng(png)) {
    if (savedImageExtension(png) == 'webp') return SavedImageEncodingResult(png);
    return SavedImageEncodingResult(png,
        fallbackReason: 'unsupported-source-format');
  }
  try {
    final decoded = image_lib.decodePng(png);
    if (decoded == null) throw const FormatException('PNG could not be decoded');
    // VP8L is 8-bit even when lossless/exact is requested. Never silently
    // quantize a 16-bit PNG or destroy its low-bit pixel metadata.
    if (decoded.maxChannelValue > 255) {
      return SavedImageEncodingResult(png, fallbackReason: 'png-high-bit-depth');
    }
    // EXIF is written below in NovelAI's layout; never duplicate a PNG eXIf.
    decoded.exif = image_lib.ExifData();
    final webp = image_lib.encodeWebP(decoded, lossless: true, exact: true);
    final exif = keepMetadata ? novelAiWebpExif(parsePngTextMetadata(png)) : null;
    return SavedImageEncodingResult(
        exif == null ? webp : withWebpExif(webp, exif));
  } catch (_) {
    return SavedImageEncodingResult(png, fallbackReason: 'webp-encoding-failed');
  }
}

/// NovelAI's WebP EXIF layout (Title, ImageDescription, Software=Source,
/// Artist=Software, ExifIFD UserComment). UserComment carries every PNG text
/// field as one JSON object so unknown chunks survive the format change.
Uint8List? novelAiWebpExif(Map<String, String> meta) {
  if (meta.isEmpty) return null;
  Uint8List text(String value) => Uint8List.fromList([...utf8.encode(value), 0]);
  final ifd0 = <(int, int, Uint8List)>[
    if (meta['Title']?.isNotEmpty == true) (0x010d, 2, text(meta['Title']!)),
    if (meta['Description']?.isNotEmpty == true) (0x010e, 2, text(meta['Description']!)),
    if (meta['Source']?.isNotEmpty == true) (0x0131, 2, text(meta['Source']!)),
    if (meta['Software']?.isNotEmpty == true) (0x013b, 2, text(meta['Software']!)),
  ];
  final userComment = Uint8List.fromList([...latin1.encode('ASCII\x00\x00\x00'), ...utf8.encode(jsonEncode(meta))]);
  final ifd0Size = 2 + (ifd0.length + 1) * 12 + 4;
  const exifIfdSize = 2 + 12 + 4;
  final data = BytesBuilder(copy: false);
  var dataOffset = 8 + ifd0Size + exifIfdSize;
  Uint8List entry(int tag, int type, Uint8List value) {
    final out = ByteData(12)
      ..setUint16(0, tag, Endian.little)
      ..setUint16(2, type, Endian.little)
      ..setUint32(4, value.length, Endian.little);
    final bytes = out.buffer.asUint8List();
    if (value.length <= 4) {
      bytes.setRange(8, 8 + value.length, value);
    } else {
      out.setUint32(8, dataOffset, Endian.little);
      data.add(value);
      if (value.length.isOdd) data.addByte(0);
      dataOffset += value.length + (value.length.isOdd ? 1 : 0);
    }
    return bytes;
  }

  final out = BytesBuilder(copy: false)
    ..add([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00])
    ..add((ByteData(2)..setUint16(0, ifd0.length + 1, Endian.little)).buffer.asUint8List());
  for (final (tag, type, value) in ifd0) {
    out.add(entry(tag, type, value));
  }
  out
    ..add((ByteData(12)
          ..setUint16(0, 0x8769, Endian.little)
          ..setUint16(2, 4, Endian.little)
          ..setUint32(4, 1, Endian.little)
          ..setUint32(8, 8 + ifd0Size, Endian.little))
        .buffer
        .asUint8List())
    ..add(Uint8List(4))
    ..add([1, 0]);
  out
    ..add(entry(0x9286, 7, userComment))
    ..add(Uint8List(4))
    ..add(data.takeBytes());
  return out.takeBytes();
}

/// Wrap a simple or extended WebP into VP8X form carrying an EXIF chunk.
Uint8List withWebpExif(Uint8List webp, Uint8List exif) {
  final view = ByteData.sublistView(webp);
  final chunks = <(String, Uint8List)>[];
  for (var offset = 12; offset + 8 <= webp.length;) {
    final type = latin1.decode(webp.sublist(offset, offset + 4));
    final size = view.getUint32(offset + 4, Endian.little);
    if (offset + 8 + size > webp.length) throw const FormatException('Invalid WebP chunk');
    chunks.add((type, Uint8List.sublistView(webp, offset + 8, offset + 8 + size)));
    offset += 8 + size + (size.isOdd ? 1 : 0);
  }
  final image = chunks.where((c) => c.$1 == 'VP8L' || c.$1 == 'VP8 ').firstOrNull;
  if (image == null) throw const FormatException('WebP image data is missing');
  final existing = chunks.where((c) => c.$1 == 'VP8X').firstOrNull;
  final Uint8List vp8x;
  if (existing != null) {
    vp8x = Uint8List.fromList(existing.$2);
  } else {
    late int width, height;
    var alpha = chunks.any((c) => c.$1 == 'ALPH');
    final d = ByteData.sublistView(image.$2);
    if (image.$1 == 'VP8L') {
      final bits = d.getUint32(1, Endian.little);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
      alpha = alpha || ((bits >> 28) & 1) == 1;
    } else {
      width = d.getUint16(6, Endian.little) & 0x3fff;
      height = d.getUint16(8, Endian.little) & 0x3fff;
    }
    final header = ByteData(10)..setUint8(0, alpha ? 0x10 : 0);
    void put24(int at, int value) {
      header
        ..setUint8(at, value & 0xff)
        ..setUint8(at + 1, (value >> 8) & 0xff)
        ..setUint8(at + 2, (value >> 16) & 0xff);
    }
    put24(4, width - 1);
    put24(7, height - 1);
    vp8x = header.buffer.asUint8List();
  }
  vp8x[0] |= 0x08;
  final body = BytesBuilder(copy: false);
  void add(String type, Uint8List data) {
    body
      ..add(latin1.encode(type))
      ..add((ByteData(4)..setUint32(0, data.length, Endian.little)).buffer.asUint8List())
      ..add(data);
    if (data.length.isOdd) body.addByte(0);
  }
  add('VP8X', vp8x);
  for (final (type, data) in chunks) {
    if (type != 'VP8X' && type != 'EXIF') add(type, data);
  }
  add('EXIF', exif);
  final payload = body.takeBytes();
  return (BytesBuilder(copy: false)
        ..add(latin1.encode('RIFF'))
        ..add((ByteData(4)..setUint32(0, payload.length + 4, Endian.little)).buffer.asUint8List())
        ..add(latin1.encode('WEBP'))
        ..add(payload))
      .takeBytes();
}

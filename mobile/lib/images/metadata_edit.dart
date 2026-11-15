import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'metadata_recovery.dart';

enum MetadataEditKind { remove, novelai, sd }

Map<String, String> editedGenerationMetadata(
    MetadataEditKind kind, String text) {
  if (kind == MetadataEditKind.remove) return {};
  if (text.trim().isEmpty || utf8.encode(text).length > 1024 * 1024) {
    throw const FormatException('Metadata must be between 1 byte and 1 MiB.');
  }
  if (kind == MetadataEditKind.sd) return {'parameters': text};
  final raw = jsonDecode(text);
  if (raw is! Map<String, dynamic>) {
    throw const FormatException('NovelAI Comment must be a JSON object.');
  }
  return {
    'Software': 'NovelAI',
    'Comment': jsonEncode(raw),
    if (raw['prompt'] is String) 'Description': raw['prompt'] as String,
  };
}

final _crcTable = List.generate(256, (i) {
  for (var bit = 0; bit < 8; bit++) {
    i = (i >>> 1) ^ ((i & 1) == 0 ? 0 : 0xedb88320);
  }
  return i;
});

Uint8List _chunk(String type, List<int> data) {
  final bytes = Uint8List(data.length + 12);
  final view = ByteData.sublistView(bytes)..setUint32(0, data.length);
  bytes.setRange(4, 8, ascii.encode(type));
  bytes.setRange(8, bytes.length - 4, data);
  var crc = 0xffffffff;
  for (var i = 4; i < bytes.length - 4; i++) {
    crc = (crc >>> 8) ^ _crcTable[(crc ^ bytes[i]) & 255];
  }
  view.setUint32(bytes.length - 4, crc ^ 0xffffffff);
  return bytes;
}

void _rejectAnimation(Uint8List bytes) {
  final view = ByteData.sublistView(bytes);
  final png = bytes[0] == 137;
  var pos = png ? 8 : 12;
  final end = png ? bytes.length : view.getUint32(4, Endian.little) + 8;
  final min = png ? 12 : 8;
  while (pos + min <= end) {
    final typeStart = pos + (png ? 4 : 0);
    final name = String.fromCharCodes(bytes.sublist(typeStart, typeStart + 4));
    final n =
        view.getUint32(pos + (png ? 0 : 4), png ? Endian.big : Endian.little);
    if (const {'acTL', 'fcTL', 'fdAT', 'ANIM', 'ANMF'}.contains(name)) {
      throw const FormatException('Animated images are not supported.');
    }
    pos += n + min + (png ? 0 : n & 1);
    if (pos > end) break;
    if (png && name == 'IEND') return;
  }
  if (png || pos != end) throw const FormatException('Incomplete image.');
}

void eraseMetadataCarriers(Uint8List image, int width, int height) {
  for (final channels in const [
    [3],
    [0, 1, 2]
  ]) {
    final capacity = width * height * channels.length;
    if (capacity < 152) continue;
    for (final colMajor in const [true, false]) {
      int offset(int bit) {
        final px = bit ~/ channels.length;
        final index = colMajor ? (px % height) * width + px ~/ height : px;
        return index * 4 + channels[bit % channels.length];
      }

      int read(int at, int n) {
        var value = 0;
        for (var i = 0; i < n; i++) {
          value = value * 2 + (image[offset(at + i)] & 1);
        }
        return value;
      }

      final magic =
          String.fromCharCodes(List.generate(15, (i) => read(i * 8, 8)));
      if (!const {
        'stealth_pnginfo',
        'stealth_pngcomp',
        'stealth_rgbinfo',
        'stealth_rgbcomp'
      }.contains(magic)) continue;
      final bits = read(120, 32);
      final end = bits > 0 && bits <= capacity - 152 ? 152 + bits : capacity;
      for (var b = 0; b < end; b++) {
        image[offset(b)] &= 254;
      }
    }
  }
}

Uint8List encodeMetadataPng(
    Uint8List pixels, int width, int height, Map<String, String> metadata) {
  final line = width * 4;
  final scan = Uint8List((line + 1) * height);
  for (var row = 0; row < height; row++) {
    final dest = row * (line + 1) + 1;
    scan.setRange(dest, dest + line, pixels, row * line);
  }
  final ihdr = ByteData(13)
    ..setUint32(0, width)
    ..setUint32(4, height)
    ..setUint8(8, 8)
    ..setUint8(9, 6);
  final out = BytesBuilder(copy: false)
    ..add([137, 80, 78, 71, 13, 10, 26, 10])
    ..add(_chunk('IHDR', ihdr.buffer.asUint8List()));
  for (final entry in metadata.entries) {
    out.add(_chunk('iTXt', [
      ...ascii.encode(entry.key),
      0,
      0,
      0,
      0,
      0,
      ...utf8.encode(entry.value)
    ]));
  }
  out
    ..add(_chunk('IDAT', zlib.encode(scan)))
    ..add(_chunk('IEND', const []));
  return out.takeBytes();
}

Future<Uint8List> readMetadataInput(File file) async {
  final builder = BytesBuilder(copy: false);
  await for (final bytes in file.openRead()) {
    if (builder.length + bytes.length > maxRecoveryImageBytes) {
      throw const FormatException('Image exceeds 64 MiB.');
    }
    builder.add(bytes);
  }
  return builder.takeBytes();
}

Future<Uint8List> rewriteGenerationMetadata(
    Uint8List bytes, MetadataEditKind kind, String text) async {
  final metadata = editedGenerationMetadata(kind, text);
  assertOfficialMetadataImage(bytes);
  _rejectAnimation(bytes);
  final codec = await ui.instantiateImageCodec(bytes);
  try {
    if (codec.frameCount != 1) {
      throw const FormatException('Animated images are not supported.');
    }
    final frame = await codec.getNextFrame();
    try {
      final image = frame.image;
      final pixels =
          await image.toByteData(format: ui.ImageByteFormat.rawStraightRgba);
      if (pixels == null) {
        throw const FormatException('Could not decode image pixels.');
      }
      final rgba =
          pixels.buffer.asUint8List(pixels.offsetInBytes, pixels.lengthInBytes);
      final w = image.width, h = image.height;
      eraseMetadataCarriers(rgba, w, h);
      return encodeMetadataPng(rgba, w, h, metadata);
    } finally {
      frame.image.dispose();
    }
  } finally {
    codec.dispose();
  }
}

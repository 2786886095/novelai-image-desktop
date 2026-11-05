import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'package:archive/archive.dart';

/// Disk-backed ZIP payloads. Limits are checked before inflating any entry;
/// actual output is bounded as well, not just the untrusted directory size.
class BoundedBackupArchive {
  static const maxFileBytes = 2 * 1024 * 1024 * 1024;
  static const maxJsonBytes = 16 * 1024 * 1024;
  static const maxAssetBytes = 64 * 1024 * 1024;
  static const maxEntries = 50000;
  final Archive archive;
  final InputFileStream _input;
  BoundedBackupArchive._(this.archive, this._input);
  static Future<BoundedBackupArchive> open(String path) async {
    final file = File(path);
    final length = await file.length();
    if (length < 22 || length > maxFileBytes) {
      throw const FormatException(
          'Backup exceeds mobile limits (2 GiB). Split the backup into categories; original data was not changed.');
    }
    // Bound the directory allocation before the decoder creates header objects.
    final handle = await file.open();
    try {
      final start = max(0, length - 65557);
      await handle.setPosition(start);
      final tail = await handle.read(length - start);
      final data = ByteData.sublistView(tail);
      var end = -1;
      for (var i = tail.length - 22; i >= 0; i--) {
        if (data.getUint32(i, Endian.little) == 0x06054b50 &&
            i + 22 + data.getUint16(i + 20, Endian.little) == tail.length) {
          end = i;
          break;
        }
      }
      if (end < 0) throw const FormatException('Invalid backup ZIP directory.');
      var entries = data.getUint16(end + 10, Endian.little);
      var size = data.getUint32(end + 12, Endian.little);
      var offset = data.getUint32(end + 16, Endian.little);
      if (data.getUint16(end + 4, Endian.little) != 0 ||
          data.getUint16(end + 6, Endian.little) != 0) {
        throw const FormatException('Split ZIP archives are unsupported.');
      }
      if (entries == 65535 || size == 0xffffffff || offset == 0xffffffff) {
        final locator = start + end - 20;
        if (locator < 0) throw const FormatException('Invalid ZIP64 backup.');
        await handle.setPosition(locator);
        final loc = ByteData.sublistView(await handle.read(20));
        if (loc.getUint32(0, Endian.little) != 0x07064b50 ||
            loc.getUint32(16, Endian.little) != 1) {
          throw const FormatException('Invalid ZIP64 backup.');
        }
        final pos = loc.getUint64(8, Endian.little);
        if (pos < 0 || pos > length - 56) {
          throw const FormatException('Invalid ZIP64 offset.');
        }
        await handle.setPosition(pos);
        final z = ByteData.sublistView(await handle.read(56));
        if (z.getUint32(0, Endian.little) != 0x06064b50) {
          throw const FormatException('Invalid ZIP64 header.');
        }
        entries = z.getUint64(32, Endian.little);
        size = z.getUint64(40, Endian.little);
        offset = z.getUint64(48, Endian.little);
      }
      if (entries > maxEntries ||
          size > 16 * 1024 * 1024 ||
          offset < 0 ||
          offset + size > length) {
        throw const FormatException(
            'Backup directory exceeds mobile limits. Split the backup into categories.');
      }
    } finally {
      await handle.close();
    }
    final input = InputFileStream(path, bufferSize: 64 * 1024);
    try {
      final directory = ZipDirectory()..read(input);
      var jsonTotal = 0, total = 0;
      final names = <String>{};
      if (directory.fileHeaders.length > maxEntries) {
        throw const FormatException('Too many backup entries.');
      }
      for (final header in directory.fileHeaders) {
        final name = header.filename;
        final limit = name.endsWith('.json') ? maxJsonBytes : maxAssetBytes;
        if (!names.add(name) ||
            name.startsWith('/') ||
            name.contains('\\') ||
            name.split('/').contains('..') ||
            name.contains(':') ||
            name.contains('\u0000') ||
            ((header.externalFileAttributes >> 16) & 0xf000) == 0xa000 ||
            header.uncompressedSize < 0 ||
            header.uncompressedSize > limit ||
            ![0, 8].contains(header.compressionMethod) ||
            header.generalPurposeBitFlag & 1 != 0) {
          throw const FormatException(
              'Backup entry exceeds mobile limits or is unsafe (JSON 16 MiB; asset 64 MiB). Original data retained.');
        }
        total += header.uncompressedSize;
        if (name.endsWith('.json')) jsonTotal += header.uncompressedSize;
      }
      if (total > 8 * 1024 * 1024 * 1024 || jsonTotal > 48 * 1024 * 1024) {
        throw const FormatException(
            'Backup metadata exceeds mobile limits. Split the backup into categories.');
      }
      input.setPosition(0);
      return BoundedBackupArchive._(ZipDecoder().decodeStream(input), input);
    } catch (_) {
      input.closeSync();
      rethrow;
    }
  }

  void close() => _input.closeSync();
}

Uint8List readBoundedBackupEntry(ArchiveFile file) {
  final limit = file.name.endsWith('.json')
      ? BoundedBackupArchive.maxJsonBytes
      : BoundedBackupArchive.maxAssetBytes;
  if (file.size < 0 || file.size > limit) {
    throw const FormatException('Backup entry exceeds mobile memory limit.');
  }
  final output = _LimitedOutput(min(limit, file.size));
  file.writeContent(output, freeMemory: true);
  final bytes = output.getBytes();
  if (bytes.length != file.size ||
      (file.crc32 != null && getCrc32(bytes) != file.crc32)) {
    throw const FormatException('Backup entry size or CRC is invalid.');
  }
  return bytes;
}

class _LimitedOutput extends OutputMemoryStream {
  final int limit;
  _LimitedOutput(this.limit) : super(size: min(32768, max(1, limit)));
  void _check(int count) {
    if (count < 0 || length + count > limit) {
      throw const FormatException(
          'Backup decompression exceeds declared size or mobile memory limit.');
    }
  }

  @override
  void writeByte(int value) {
    _check(1);
    super.writeByte(value);
  }

  @override
  void writeBytes(List<int> bytes, {int? length}) {
    _check(length ?? bytes.length);
    super.writeBytes(bytes, length: length);
  }

  @override
  void writeStream(InputStream stream) {
    _check(stream.length);
    while (!stream.isEOS) {
      final chunk = stream.readBytes(min(32768, stream.length));
      writeBytes(chunk.toUint8List());
    }
  }

  @override
  void writeBackReference(int distance, int count) {
    _check(count);
    super.writeBackReference(distance, count);
  }
}

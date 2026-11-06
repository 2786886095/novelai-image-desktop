import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'package:archive/archive.dart';

/// Disk-backed ZIP payloads. Limits are checked before inflating any entry;
/// actual output is bounded as well, not just the untrusted directory size.
class BoundedBackupArchive {
  // Native Dart file offsets are int64; never turn these lengths into a
  // Uint32 or a whole-archive Uint8List (including on a 32-bit Android build).
  static const maxFileBytes = 4 * 1024 * 1024 * 1024;
  static const maxJsonBytes = 16 * 1024 * 1024;
  static const maxAssetBytes = 64 * 1024 * 1024;
  static const maxExpandedBytes = 8 * 1024 * 1024 * 1024;
  static const maxJsonTotalBytes = 48 * 1024 * 1024;
  static const maxDirectoryBytes = 16 * 1024 * 1024;
  static const maxEntries = 50000;
  final Archive archive;
  final InputFileStream _input;
  BoundedBackupArchive._(this.archive, this._input);

  static void validateFileLength(int length) {
    if (length < 22 || length > maxFileBytes) {
      throw const FormatException(
          'Backup exceeds mobile limits (4 GiB compressed ZIP). Split categories; original data was not changed.');
    }
  }

  static bool _range(int offset, int size, int end) =>
      offset >= 0 && size >= 0 && offset <= end && size <= end - offset;

  static Future<ByteData> _readAt(
      RandomAccessFile file, int offset, int length) async {
    await file.setPosition(offset);
    final bytes = await file.read(length);
    if (bytes.length != length) {
      throw const FormatException('Truncated backup ZIP.');
    }
    return ByteData.sublistView(bytes);
  }

  static Future<BoundedBackupArchive> open(String path) async {
    final file = File(path);
    final length = await file.length();
    validateFileLength(length);
    // Bound the directory allocation before the decoder creates header objects.
    final handle = await file.open();
    late int centralOffset, centralSize, entryCount;
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
          data.getUint16(end + 6, Endian.little) != 0 ||
          data.getUint16(end + 8, Endian.little) != entries) {
        throw const FormatException('Split ZIP archives are unsupported.');
      }
      final recordStart = start + end;
      var directoryEnd = recordStart;
      final locator = recordStart - 20;
      final loc = locator >= 0 ? await _readAt(handle, locator, 20) : null;
      final zip64 = loc?.getUint32(0, Endian.little) == 0x07064b50;
      if (zip64) {
        if (loc!.getUint32(4, Endian.little) != 0 ||
            loc.getUint32(16, Endian.little) != 1) {
          throw const FormatException('Invalid ZIP64 backup.');
        }
        final pos = loc.getUint64(8, Endian.little);
        if (!_range(pos, 56, locator)) {
          throw const FormatException('Invalid ZIP64 offset.');
        }
        final z = await _readAt(handle, pos, 56);
        final recordSize = z.getUint64(4, Endian.little);
        if (z.getUint32(0, Endian.little) != 0x06064b50 ||
            recordSize < 44 ||
            recordSize > maxDirectoryBytes ||
            !_range(pos, recordSize + 12, locator) ||
            z.getUint32(16, Endian.little) != 0 ||
            z.getUint32(20, Endian.little) != 0 ||
            z.getUint64(24, Endian.little) != z.getUint64(32, Endian.little)) {
          throw const FormatException('Invalid ZIP64 header.');
        }
        entries = z.getUint64(32, Endian.little);
        size = z.getUint64(40, Endian.little);
        offset = z.getUint64(48, Endian.little);
        directoryEnd = pos;
      } else if (entries == 65535 ||
          size == 0xffffffff ||
          offset == 0xffffffff) {
        throw const FormatException('Missing ZIP64 directory.');
      }
      if (entries < 0 ||
          entries > maxEntries ||
          size > maxDirectoryBytes ||
          !_range(offset, size, directoryEnd)) {
        throw const FormatException(
            'Backup directory exceeds mobile limits. Split the backup into categories.');
      }
      // A forged EOCD count must not let the decoder allocate hundreds of
      // thousands of headers before our count limit gets a chance to run.
      var cursor = offset, actualCount = 0;
      while (cursor < offset + size) {
        if (++actualCount > maxEntries || !_range(cursor, 46, offset + size)) {
          throw const FormatException('Too many or truncated backup entries.');
        }
        final header = await _readAt(handle, cursor, 46);
        final bytes = 46 +
            header.getUint16(28, Endian.little) +
            header.getUint16(30, Endian.little) +
            header.getUint16(32, Endian.little);
        if (header.getUint32(0, Endian.little) != 0x02014b50 ||
            !_range(cursor, bytes, offset + size)) {
          throw const FormatException('Invalid backup central directory.');
        }
        cursor += bytes;
      }
      if (actualCount != entries) {
        throw const FormatException('Backup entry count mismatch.');
      }
      centralOffset = offset;
      centralSize = size;
      entryCount = entries;
    } finally {
      await handle.close();
    }
    final input = InputFileStream(path, bufferSize: 64 * 1024);
    try {
      // Parse only the preflighted directory. Do not let a decoder search
      // untrusted comments for a second, attacker-selected EOCD signature.
      final directory = ZipDirectory()
        ..centralDirectoryOffset = centralOffset
        ..centralDirectorySize = centralSize;
      final central = input.subset(position:centralOffset, length:centralSize);
      for (var i=0; i<entryCount; i++) {
        if (central.readUint32()!=ZipFileHeader.signature) {
          throw const FormatException('Invalid ZIP header after preflight.');
        }
        directory.fileHeaders.add(ZipFileHeader()..read(central,fileBytes:input));
      }
      var jsonTotal = 0, total = 0;
      final names = <String>{};
      if (directory.fileHeaders.length != entryCount ||
          directory.centralDirectoryOffset != centralOffset ||
          directory.centralDirectorySize != centralSize) {
        throw const FormatException('Backup directory changed or is invalid.');
      }
      final archive = Archive();
      final regions = <(int, int)>[];
      for (final header in directory.fileHeaders) {
        final name = header.filename;
        final normalized =
            name.endsWith('/') ? name.substring(0, name.length - 1) : name;
        final limit =
            name.toLowerCase().endsWith('.json') ? maxJsonBytes : maxAssetBytes;
        final local = header.file;
        final kind = (header.externalFileAttributes >> 16) & 0xf000;
        if (name.isEmpty ||
            name.length > 1024 ||
            !names.add(name.toLowerCase()) ||
            name.startsWith('/') ||
            name.contains('\\') ||
            normalized
                .split('/')
                .any((p) => p.isEmpty || p == '.' || p == '..') ||
            name.contains(':') ||
            name.contains(RegExp(r'[\x00-\x1f]')) ||
            ![0, 0x8000, 0x4000].contains(kind) ||
            header.diskNumberStart != 0 ||
            header.uncompressedSize < 0 ||
            header.uncompressedSize > limit ||
            header.compressedSize < 0 ||
            header.compressedSize > limit + 1024 * 1024 ||
            header.localHeaderOffset < 0 ||
            header.localHeaderOffset >= centralOffset ||
            ![0, 8].contains(header.compressionMethod) ||
            header.generalPurposeBitFlag & 0x41 != 0 ||
            local == null ||
            local.filename != name ||
            local.flags & 0x41 != 0 ||
            (local.flags & ~8) != (header.generalPurposeBitFlag & ~8) ||
            (header.generalPurposeBitFlag & 8 != 0 && local.flags & 8 == 0) ||
            local.crc32 != header.crc32 ||
            local.length != header.compressedSize ||
            local.compressionMethod !=
                (header.compressionMethod == 0
                    ? CompressionType.none
                    : CompressionType.deflate)) {
          throw const FormatException(
              'Backup entry exceeds mobile limits or is unsafe (JSON 16 MiB; asset 64 MiB). Original data retained.');
        }
        final payload = local.getStream(decompress: false);
        if (payload is! InputFileStream ||
            payload.fileOffset < header.localHeaderOffset + 30 ||
            !_range(payload.fileOffset, header.compressedSize, centralOffset)) {
          throw const FormatException(
              'Backup payload extends outside its data area.');
        }
        final end = _validateLocal(
            input,
            header.localHeaderOffset,
            payload.fileOffset,
            centralOffset,
            header.compressedSize,
            header.uncompressedSize,
            header.crc32,
            local.flags);
        regions.add((header.localHeaderOffset, end));
        total += header.uncompressedSize;
        if (name.toLowerCase().endsWith('.json')) {
          jsonTotal += header.uncompressedSize;
        }
        final file = name.endsWith('/')
            ? ArchiveFile.directory(name)
            : ArchiveFile.file(name, header.uncompressedSize, local);
        if (!file.isFile && header.uncompressedSize != 0) {
          throw const FormatException('Invalid backup directory payload.');
        }
        file
          ..crc32 = header.crc32
          ..compression = local.compressionMethod;
        archive.addFile(file);
      }
      regions.sort((a, b) => a.$1.compareTo(b.$1));
      for (var i = 1; i < regions.length; i++) {
        if (regions[i].$1 < regions[i - 1].$2) {
          throw const FormatException('Overlapping backup ZIP entries.');
        }
      }
      if (total > maxExpandedBytes || jsonTotal > maxJsonTotalBytes) {
        throw const FormatException(
            'Backup metadata exceeds mobile limits. Split the backup into categories.');
      }
      return BoundedBackupArchive._(archive, input);
    } catch (_) {
      input.closeSync();
      rethrow;
    }
  }

  // archive's streaming encoder legitimately omits bit 3 in the central
  // record. Check the *actual* local sizes / descriptor, not that redundant bit.
  static int _validateLocal(InputFileStream input, int start, int payload,
      int central, int compressed, int expanded, int crc, int flags) {
    ByteData read(int at, int size) {
      if (!_range(at, size, central)) {
        throw const FormatException(
            'Truncated backup local header or descriptor.');
      }
      return ByteData.sublistView(
          input.subset(position: at, length: size).toUint8List());
    }

    final raw = read(start, 30);
    if (raw.getUint32(0, Endian.little) != 0x04034b50) {
      throw const FormatException('Invalid backup local signature.');
    }
    final nameLength = raw.getUint16(26, Endian.little);
    final extraLength = raw.getUint16(28, Endian.little);
    if (payload != start + 30 + nameLength + extraLength) {
      throw const FormatException('Invalid backup payload offset.');
    }
    var localCompressed = raw.getUint32(18, Endian.little);
    var localExpanded = raw.getUint32(22, Endian.little);
    var zip64 = false;
    final extra = read(start + 30 + nameLength, extraLength);
    var cursor = 0;
    while (cursor < extraLength) {
      if (cursor + 4 > extraLength) {
        throw const FormatException('Invalid ZIP extra data.');
      }
      final id = extra.getUint16(cursor, Endian.little);
      final size = extra.getUint16(cursor + 2, Endian.little);
      cursor += 4;
      if (size > extraLength - cursor) {
        throw const FormatException('Invalid ZIP extra size.');
      }
      if (id == 1) {
        zip64 = true;
        var pos = cursor;
        if (localExpanded == 0xffffffff) {
          if (pos + 8 > cursor + size) {
            throw const FormatException('Missing ZIP64 size.');
          }
          localExpanded = extra.getUint64(pos, Endian.little);
          pos += 8;
        }
        if (localCompressed == 0xffffffff) {
          if (pos + 8 > cursor + size) {
            throw const FormatException('Missing ZIP64 size.');
          }
          localCompressed = extra.getUint64(pos, Endian.little);
        }
      }
      cursor += size;
    }
    var end = payload + compressed;
    if (flags & 8 == 0) {
      if (raw.getUint32(14, Endian.little) != crc ||
          localCompressed != compressed ||
          localExpanded != expanded) {
        throw const FormatException('Backup local size or CRC mismatch.');
      }
    } else {
      final signature = read(end, 4).getUint32(0, Endian.little);
      final hasSignature = signature == 0x08074b50;
      final at = end + (hasSignature ? 4 : 0);
      final descriptor = read(at, zip64 ? 20 : 12);
      final c = zip64
          ? descriptor.getUint64(4, Endian.little)
          : descriptor.getUint32(4, Endian.little);
      final u = zip64
          ? descriptor.getUint64(12, Endian.little)
          : descriptor.getUint32(8, Endian.little);
      if (descriptor.getUint32(0, Endian.little) != crc ||
          c != compressed ||
          u != expanded) {
        throw const FormatException('Backup data descriptor mismatch.');
      }
      end = at + (zip64 ? 20 : 12);
    }
    return end;
  }

  void close() => _input.closeSync();
}

Uint8List readBoundedBackupEntry(ArchiveFile file) {
  final limit = file.name.toLowerCase().endsWith('.json')
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

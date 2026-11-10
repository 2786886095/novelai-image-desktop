import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

/// Emergency archive for Android's legacy preferences, not a .naisbackup.
class SegmentedPreferenceArchive {
  static const chunkSize = 256 * 1024;
  static const _names = [
    'FlutterSharedPreferences.xml',
    'FlutterSharedPreferences.xml.bak',
  ];
  static const rescueMagic = 'NAIRSC01';
  static const fullMagic = 'NAIBKP02';
  static const fullBackupEntry = 'backup.naisbackup';
  static const _maxFullBackupBytes = 4 * 1024 * 1024 * 1024;

  static Future<String?> identify(File input) async {
    final file = await input.open();
    try {
      final value = ascii.decode(await file.read(8), allowInvalid: true);
      return value == rescueMagic || value == fullMagic ? value : null;
    } finally {
      await file.close();
    }
  }

  static Future<File> writeFullBackup(File input, File output, String password) {
    return _write(output, password,
        magic: fullMagic, sources: {fullBackupEntry: input});
  }

  static Future<void> extractFullBackup(File input, Directory destination,
      String password) => _extract(input, destination, password, fullMagic);
  static final _cipher = AesGcm.with256bits();
  static final _random = Random.secure();
  static final _kdf =
      Pbkdf2(macAlgorithm: Hmac.sha256(), iterations: 600000, bits: 256);

  static Future<SecretKey> _key(String password, List<int> salt) {
    if (password.runes.length < 12 || utf8.encode(password).length > 512) {
      throw ArgumentError(
          'Use a password of at least 12 characters (at most 512 UTF-8 bytes).');
    }
    return _kdf.deriveKey(
        secretKey: SecretKey(utf8.encode(password)), nonce: salt);
  }

  static String _join(Directory directory, String name) =>
      directory.path + Platform.pathSeparator + name;

  static Uint8List _u32(int n) =>
      (ByteData(4)..setUint32(0, n)).buffer.asUint8List();

  static List<int> _nonce(List<int> prefix, int index) {
    if (index >= 0x100000000) {
      throw const FormatException('Too many rescue records.');
    }
    return [...prefix, ..._u32(index)];
  }

  static Future<Uint8List> _exact(RandomAccessFile file, int length) async {
    final bytes = await file.read(length);
    if (bytes.length != length) {
      throw const FormatException('Incomplete rescue record.');
    }
    return bytes;
  }

  static Future<Map<String, FileStat>> _snapshot(Map<String, File> sources) async {
    final files = <String, FileStat>{};
    for (final entry in sources.entries) {
      final name = entry.key;
      final path = entry.value.path;
      final type = await FileSystemEntity.type(path, followLinks: false);
      if (type == FileSystemEntityType.notFound) continue;
      if (type != FileSystemEntityType.file) {
        throw const FileSystemException('Unexpected preferences file type.');
      }
      files[name] = await File(path).stat();
    }
    return files;
  }

  /// Requires a new app-private output path. The source files are never edited.
  /// The final name is committed only after authenticating a full readback.
  static Future<File> write(
      Directory source, File output, String password) => _write(output, password, magic: rescueMagic,
          sources: {for (final name in _names) name: File(_join(source, name))});

  static Future<File> _write(File output, String password,
      {required String magic, required Map<String, File> sources}) async {
    final before = await _snapshot(sources);
    if (magic == fullMagic && (before[fullBackupEntry]?.size ?? 0) > _maxFullBackupBytes) {
      throw const FormatException('Backup exceeds the segmented file limit.');
    }
    if (before.isEmpty || before.values.every((stat) => stat.size == 0)) {
      throw const FileSystemException('No legacy preferences to rescue.');
    }
    if (await output.exists()) {
      throw const FileSystemException('Rescue output exists.');
    }
    final entropy = List<int>.generate(24, (_) => _random.nextInt(256));
    final key = await _key(password, entropy.sublist(0, 16));
    final prefix = entropy.sublist(16);
    final stage = await output.parent.createTemp('preferences-rescue-stage-');
    final partial = File(_join(stage, 'data.partial'));
    try {
      final sink = await partial.open(mode: FileMode.writeOnly);
      try {
        await sink.writeFrom([...ascii.encode(magic), ...entropy]);
        var index = 0;
        Future<void> emit(List<int> bytes) async {
          final length = _u32(bytes.length);
          final box = await _cipher.encrypt(bytes,
              secretKey: key, nonce: _nonce(prefix, index++),
              aad: magic == fullMagic ? [...ascii.encode(magic), ...length] : length);
          await sink.writeFrom(length);
          await sink.writeFrom(box.cipherText);
          await sink.writeFrom(box.mac.bytes);
        }

        await emit(utf8.encode(jsonEncode({
          for (final e in before.entries) e.key: e.value.size,
        })));
        for (final e in before.entries) {
          final file = await sources[e.key]!.open();
          try {
            var remaining = e.value.size;
            while (remaining > 0) {
              final bytes = await _exact(file, min(chunkSize, remaining));
              await emit(bytes);
              remaining -= bytes.length;
            }
            if (await file.readByte() != -1) {
              throw const FileSystemException(
                  'Preferences changed during rescue.');
            }
          } finally {
            await file.close();
          }
        }
        await emit(const <int>[]);
        await sink.flush();
      } finally {
        await sink.close();
      }
      final after = await _snapshot(sources);
      if (after.length != before.length ||
          before.entries.any((e) =>
              after[e.key]?.size != e.value.size ||
              after[e.key]?.modified != e.value.modified ||
              after[e.key]?.changed != e.value.changed)) {
        throw const FileSystemException('Preferences changed during rescue.');
      }
      await _read(partial, (_) async => key, magic: magic);
      if (await FileSystemEntity.type(output.path, followLinks: false) !=
          FileSystemEntityType.notFound) {
        throw const FileSystemException('Rescue output exists.');
      }
      return await partial.rename(output.path);
    } finally {
      await stage.delete(recursive: true);
    }
  }

  static Future<Map<String, int>> verify(File input, String password) =>
      _read(input, (salt) => _key(password, salt));

  /// Extracts only into a new directory; never restores over live app data.
  static Future<void> extract(
      File input, Directory destination, String password) =>
          _extract(input, destination, password, rescueMagic);

  static Future<void> _extract(File input, Directory destination,
      String password, String magic) async {
    if (await FileSystemEntity.type(destination.path, followLinks: false) !=
        FileSystemEntityType.notFound) {
      throw const FileSystemException('Extraction requires a new directory.');
    }
    final stage = await destination.parent.createTemp('preferences-extract-');
    try {
      await _read(input, (salt) => _key(password, salt), destination: stage, magic: magic);
      if (await FileSystemEntity.type(destination.path, followLinks: false) !=
          FileSystemEntityType.notFound) {
        throw const FileSystemException('Extraction destination exists.');
      }
      await stage.rename(destination.path);
    } finally {
      if (await stage.exists()) await stage.delete(recursive: true);
    }
  }

  static Future<Map<String, int>> _read(
      File input, Future<SecretKey> Function(List<int>) keyForSalt,
      {Directory? destination, String magic = rescueMagic}) async {
    final file = await input.open();
    try {
      final header = await _exact(file, 32);
      if (ascii.decode(header.sublist(0, 8), allowInvalid: true) !=
          magic) {
        throw const FormatException('Not a segmented preferences rescue.');
      }
      final key = await keyForSalt(header.sublist(8, 24));
      final prefix = header.sublist(24);
      var index = 0;
      Future<List<int>> next(int limit) async {
        final encoded = await _exact(file, 4);
        final size = ByteData.sublistView(encoded).getUint32(0);
        if (size > limit) {
          throw const FormatException('Oversized rescue record.');
        }
        final nonce = _nonce(prefix, index++);
        final cipherText = await _exact(file, size);
        final mac = await _exact(file, 16);
        return _cipher.decrypt(
            SecretBox(cipherText, nonce: nonce, mac: Mac(mac)),
            secretKey: key,
            aad: magic == fullMagic ? [...ascii.encode(magic), ...encoded] : encoded);
      }

      final data = jsonDecode(utf8.decode(await next(1024)));
      if (data is! Map ||
          data.isEmpty ||
          data.keys.any((key) => magic == fullMagic ? key != fullBackupEntry : !_names.contains(key)) ||
          data.values.any((size) => size is! int || size < 0 ||
              (magic == fullMagic && (size == 0 || size > _maxFullBackupBytes)))) {
        throw const FormatException('Invalid rescue manifest.');
      }
      final entries = Map<String, int>.from(data);
      for (final e in entries.entries) {
        final sink = destination == null
            ? null
            : await File(_join(destination, e.key))
                .open(mode: FileMode.writeOnly);
        try {
          var remaining = e.value;
          while (remaining > 0) {
            final size = min(chunkSize, remaining);
            final bytes = await next(size);
            if (bytes.length != size) {
              throw const FormatException('Unexpected rescue chunk size.');
            }
            await sink?.writeFrom(bytes);
            remaining -= size;
          }
          await sink?.flush();
        } finally {
          await sink?.close();
        }
      }
      await next(0);
      if (await file.readByte() != -1) {
        throw const FormatException('Extra rescue bytes.');
      }
      return entries;
    } finally {
      await file.close();
    }
  }
}

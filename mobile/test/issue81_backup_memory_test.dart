import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/bounded_backup_archive.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('128 MiB image archive inspection is disk backed; bounded RSS increase',
      () async {
    final root = Directory.systemTemp.createTempSync('issue81-stream-');
    try {
      final payload = File('${root.path}/payload');
      final sink = payload.openSync(mode: FileMode.write);
      final chunk = Uint8List(1024 * 1024)..fillRange(0, 1024 * 1024, 81);
      for (var i = 0; i < 8; i++) {
        sink.writeFromSync(chunk);
      }
      sink.closeSync();
      final file = File('${root.path}/large.naisbackup');
      final out = OutputFileStream(file.path);
      final encoder = ZipEncoder()..startEncode(out);
      encoder.add(ArchiveFile.string(
          'manifest.json',
          jsonEncode({
            'format': DataBackupService.format,
            'version': 1,
            'categories': []
          })));
      for (var i = 0; i < 16; i++) {
        final input = InputFileStream(payload.path, bufferSize: 65536);
        try {
          encoder.add(ArchiveFile.stream('assets/fixture-$i.png', input)
            ..compression = CompressionType.none);
        } finally {
          input.closeSync();
        }
      }
      encoder.endEncode();
      out.closeSync();
      final before = ProcessInfo.currentRss;
      final result = await DataBackupService(Storage()).inspect(file.path);
      final after = ProcessInfo.currentRss;
      expect(result.path, file.path);
      expect(await file.length(), greaterThan(128 * 1024 * 1024));
      expect(after - before, lessThan(96 * 1024 * 1024));
      // Literal diagnostic retained by the command ledger, not a device guarantee.
      // ignore: avoid_print
      print(
          'ISSUE81_DISK_BACKUP_BYTES=${await file.length()} RSS_BEFORE=$before RSS_AFTER=$after DELTA=${after - before}');
      // Handles must be closed; Windows rename/delete would fail otherwise.
      await file.rename('${file.path}.reopened');
    } finally {
      root.deleteSync(recursive: true);
    }
  }, timeout: const Timeout(Duration(minutes: 2)));
  test(
      'actual expansion beyond forged size is rejected before preferences change',
      () async {
    final root = Directory.systemTemp.createTempSync('issue81-expand-');
    SharedPreferences.setMockInitialValues({'sentinel': 'retained'});
    try {
      final a = Archive()
        ..addFile(ArchiveFile.string(
            'manifest.json',
            jsonEncode({
              'format': DataBackupService.format,
              'version': 1,
              'categories': []
            })))
        ..addFile(ArchiveFile.string(
            'data/oversized.json', jsonEncode({'value': 'x' * 1024 * 1024})));
      final bytes = Uint8List.fromList(ZipEncoder().encode(a));
      final data = ByteData.sublistView(bytes);
      for (var i = 0; i < bytes.length - 46; i++) {
        if (data.getUint32(i, Endian.little) == 0x02014b50 &&
            utf8
                .decode(bytes.sublist(
                    i + 46, i + 46 + data.getUint16(i + 28, Endian.little)))
                .contains('oversized')) {
          data.setUint32(i + 24, 32, Endian.little);
        }
        if (data.getUint32(i, Endian.little) == 0x04034b50 &&
            utf8
                .decode(
                    bytes.sublist(
                        i + 30, i + 30 + data.getUint16(i + 26, Endian.little)),
                    allowMalformed: true)
                .contains('oversized')) {
          data.setUint32(i + 22, 32, Endian.little);
        }
      }
      final file = File('${root.path}/forged.naisbackup')
        ..writeAsBytesSync(bytes);
      await expectLater(
          DataBackupService(Storage()).importBackup(
              file.path, {DataBackupCategory.workspaceData},
              confirmConfigurationOverwrite: false),
          throwsA(anyOf(isA<FormatException>(), isA<ArchiveException>())));
      expect((await SharedPreferences.getInstance()).getString('sentinel'),
          'retained');
      expect(root.listSync().length, 1);
    } finally {
      root.deleteSync(recursive: true);
    }
  });
  test(
      'individual memory reader validates size and CRC without retaining decompressed content',
      () {
    final original = Archive()
      ..addFile(ArchiveFile.string('data/fixture.json', '{"ok":true}'));
    final a = ZipDecoder().decodeBytes(ZipEncoder().encode(original));
    final entry = a.files.single;
    expect(utf8.decode(readBoundedBackupEntry(entry)), '{"ok":true}');
    expect(utf8.decode(readBoundedBackupEntry(entry)), '{"ok":true}');
    entry.crc32 = 123;
    expect(() => readBoundedBackupEntry(entry), throwsFormatException);
  });
}

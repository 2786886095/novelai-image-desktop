import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/storage.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
      'issue81 rejects oversized declared assets before reading payload or writing data',
      () async {
    final root = Directory.systemTemp.createTempSync('issue81-boundary-');
    try {
      final a = Archive()
        ..addFile(ArchiveFile.string(
            'manifest.json',
            jsonEncode({
              'format': DataBackupService.format,
              'version': 1,
              'categories': []
            })))
        ..addFile(ArchiveFile.string('assets/oversized.png', 'synthetic'));
      final bytes = Uint8List.fromList(ZipEncoder().encode(a));
      final view = ByteData.sublistView(bytes);
      for (var i = 0; i < bytes.length - 46; i++) {
        if (view.getUint32(i, Endian.little) == 0x02014b50 &&
            utf8
                .decode(bytes.sublist(
                    i + 46, i + 46 + view.getUint16(i + 28, Endian.little)))
                .contains('oversized')) {
          view.setUint32(i + 24, 512 * 1024 * 1024, Endian.little);
        }
        if (view.getUint32(i, Endian.little) == 0x04034b50 &&
            utf8
                .decode(
                    bytes.sublist(
                        i + 30, i + 30 + view.getUint16(i + 26, Endian.little)),
                    allowMalformed: true)
                .contains('oversized')) {
          view.setUint32(i + 22, 512 * 1024 * 1024, Endian.little);
        }
      }
      final f = File('${root.path}/fixture.naisbackup')
        ..writeAsBytesSync(bytes);
      await expectLater(
          DataBackupService(Storage()).inspect(f.path), throwsFormatException);
      expect(root.listSync().length, 1);
    } finally {
      root.deleteSync(recursive: true);
    }
  });
}

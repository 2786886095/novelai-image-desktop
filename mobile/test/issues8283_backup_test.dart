import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/backup_snapshot.dart';
import 'package:novelai_mobile/services/bounded_backup_archive.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/storage.dart';

Uint8List fixture({String name='data/a.json', String content='{}'}) => Uint8List.fromList(ZipEncoder().encode(Archive()
 ..addFile(ArchiveFile.string('manifest.json',jsonEncode({'format':DataBackupService.format,'version':1,'categories':[]})))
 ..addFile(ArchiveFile.string(name,content))));
void main() {
 TestWidgetsFlutterBinding.ensureInitialized();
 late Directory root;
 setUp(()=>root=Directory.systemTemp.createTempSync('issues8283-zip-'));
 tearDown(()=>root.deleteSync(recursive:true));
 File file(List<int> bytes) => File('${root.path}/fixture.zip')..writeAsBytesSync(bytes);
 test('4GiB compressed boundary accepts exact limit but not one byte more',() {
   BoundedBackupArchive.validateFileLength(4*1024*1024*1024);
   expect(()=>BoundedBackupArchive.validateFileLength(4*1024*1024*1024+1),throwsFormatException);
 });
 test('ZIP64 directory reads without allocating archive-sized memory',() async {
   final bytes=fixture(); final d=ByteData.sublistView(bytes); final end=bytes.length-22;
   final z=ByteData(98); z.setUint32(0,0x06064b50,Endian.little);z.setUint64(4,44,Endian.little);
   z.setUint16(12,45,Endian.little);z.setUint16(14,45,Endian.little);
   z.setUint64(24,2,Endian.little);z.setUint64(32,2,Endian.little);
   z.setUint64(40,d.getUint32(end+12,Endian.little),Endian.little);
   z.setUint64(48,d.getUint32(end+16,Endian.little),Endian.little);
   z.setUint32(56,0x07064b50,Endian.little);z.setUint64(64,end,Endian.little);z.setUint32(72,1,Endian.little);
   z.setUint32(76,0x06054b50,Endian.little);z.setUint16(84,65535,Endian.little);z.setUint16(86,65535,Endian.little);
   z.setUint32(88,0xffffffff,Endian.little);z.setUint32(92,0xffffffff,Endian.little);
   final f=file([...bytes.take(end),...z.buffer.asUint8List()]);
   final opened=await BoundedBackupArchive.open(f.path);
   try { expect(opened.archive.files.length,2); expect(utf8.decode(readBoundedBackupEntry(opened.archive.findFile('data/a.json')!)),'{}'); }
   finally {opened.close();}
 });
 test('3GiB file offsets are disk-backed, not signed-32-bit or byte-list offsets',() async {
   final bytes=fixture(); final d=ByteData.sublistView(bytes);final end=bytes.length-22;
   const offset=3*1024*1024*1024;
   final central=d.getUint32(end+16,Endian.little);
   for(var i=central;i<end;) {
     d.setUint32(i+42,d.getUint32(i+42,Endian.little)+offset,Endian.little);
     i+=46+d.getUint16(i+28,Endian.little)+d.getUint16(i+30,Endian.little)+d.getUint16(i+32,Endian.little);
   }
   d.setUint32(end+16,central+offset,Endian.little);
   final f=File('${root.path}/sparse.zip')..createSync();
   if(Platform.isWindows) { Process.runSync('fsutil',['sparse','setflag',f.path]); }
   final handle=f.openSync(mode:FileMode.write);handle.setPositionSync(offset);handle.writeFromSync(bytes);handle.closeSync();
   final before=ProcessInfo.currentRss;
   final opened=await BoundedBackupArchive.open(f.path);
   try {expect(opened.archive.files.length,2);expect(readBoundedBackupEntry(opened.archive.findFile('data/a.json')!),utf8.encode('{}'));}
   finally {opened.close();}
   expect(ProcessInfo.currentRss-before,lessThan(96*1024*1024));
 });
 test('ZIP comment fake signature cannot redirect directory',() async {
   final bytes=fixture();final d=ByteData.sublistView(bytes);d.setUint16(bytes.length-2,30,Endian.little);
   final opened=await BoundedBackupArchive.open(file([...bytes,0x50,0x4b,0x05,0x06,...List.filled(26,0)]).path);
   try {expect(opened.archive.files.length,2);} finally {opened.close();}
 });
 for(final kind in ['local-size','descriptor-size','count','offset','traversal','crc']) {
  test('$kind rejected before preferences/rescue writes; private staging removed',() async {
   final bytes=fixture(name:kind=='traversal'?'../bad.json':'data/a.json');final d=ByteData.sublistView(bytes);
   final end=bytes.length-22, central=d.getUint32(bytes.length-6,Endian.little);
   if(kind=='local-size') {d.setUint32(18,12345,Endian.little); d.setUint16(6,d.getUint16(6,Endian.little)&~8,Endian.little);}
   if(kind=='descriptor-size') {
     final payload=30+d.getUint16(26,Endian.little)+d.getUint16(28,Endian.little);
     final dataEnd=payload+d.getUint32(central+20,Endian.little);
     d.setUint32(dataEnd+8,12345,Endian.little);
   }
   if(kind=='count') {d.setUint16(end+8,1,Endian.little);d.setUint16(end+10,1,Endian.little);}
   if(kind=='offset') d.setUint32(end+16,0xfffffff0,Endian.little);
   if(kind=='crc') d.setUint32(central+16,12345,Endian.little);
   final f=file(bytes); final staging=Directory('${root.path}/private')..createSync();
   final svc=DataBackupService(Storage(),temporaryDirectoryProvider:() async=>staging);
   await expectLater(svc.inspect(f.path),throwsA(anyOf(isA<FormatException>(),isA<ArchiveException>())));
   expect(staging.listSync(),isEmpty);expect(f.readAsBytesSync(),bytes);
  });
 }
 test('snapshot validates SHA before writes and is independent of subsequent source edits',() async {
   final payload=utf8.encode('fixture');final hash=sha256.convert(payload).toString();
   final a=Archive()..addFile(ArchiveFile.string('manifest.json',jsonEncode({'format':DataBackupService.format,'version':1,'categories':[]})))
    ..addFile(ArchiveFile('assets/$hash.png',payload.length,payload))
    ..addFile(ArchiveFile.string('data/ref.json',jsonEncode({'asset':'assets/$hash.png','sha256':hash,'bytes':payload.length})));
   final f=file(ZipEncoder().encode(a));final target='${root.path}/snapshot.zip';
   await prepareBackupSnapshot((f.path,target)); f.writeAsStringSync('changed');
   expect((await validateBackupSnapshot(target))['version'],1);
   final bad=file(fixture(name:'assets/${'0'*64}.png',content:'bad'));
   await expectLater(prepareBackupSnapshot((bad.path,'${root.path}/bad.zip')),throwsFormatException);
 });
}

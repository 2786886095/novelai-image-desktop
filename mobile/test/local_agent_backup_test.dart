import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/portable_projects.dart';
void main(){
  test('native Android home joins existing portable backup contract without runtime',()async{
    final home=await Directory.systemTemp.createTemp('android-home');
    try{
      await Directory('${home.path}/profiles/custom').create(recursive:true);
      await File('${home.path}/profiles/custom/plugin.json').writeAsString('{"userModified":true}');
      await File('${home.path}/session.jsonl').writeAsString('saved conversation');
      await Directory('${home.path}/logs').create();await File('${home.path}/logs/old.log').writeAsString('excluded');
      final bytes=(await PortableProjects.packNativeHome(home))!;
      PortableProjects.validate('agent-${sha256.convert(bytes)}.zip',bytes);
      final zip=ZipDecoder().decodeBytes(bytes);
      final manifest=jsonDecode(utf8.decode(zip.findFile('manifest.json')!.content as List<int>));
      expect((manifest['files'] as List).length,2);
      expect(zip.findFile('files/session.jsonl'),isNotNull);
      expect(zip.findFile('files/profiles/custom/plugin.json'),isNotNull);
      expect(zip.findFile('files/logs/old.log'),isNull);
    }finally{await home.delete(recursive:true);}
  });
}

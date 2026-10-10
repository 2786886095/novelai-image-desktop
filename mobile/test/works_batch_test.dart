import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/works_batch.dart';
import 'package:novelai_mobile/models/nai_models.dart';

HistoryItem item(String id,String path)=>HistoryItem(id:id,filePath:path,date:'2026-10-11',createdAt:'2026-10-11',seed:1,model:'fixture',width:1,height:1,prompt:'blue coat');
void main() {
  test('batch delete is ID-scoped, preserves external/shared originals and keeps failures',() async {
    final root=await Directory.systemTemp.createTemp('works-port-'),external=await Directory.systemTemp.createTemp('works-external-');
    try {
      final owned=File('${root.path}/owned.png')..writeAsBytesSync([1]),shared=File('${root.path}/shared.png')..writeAsBytesSync([2]),foreign=File('${external.path}/foreign.png')..writeAsBytesSync([3]);
      final rows=[item('a',owned.path),item('b',shared.path),item('c',shared.path),item('d',foreign.path),item('e',root.path)];
      final result=await WorksBatchFiles([root]).delete(rows,{'a','b','d','e'});
      expect(result.removedIds,{'a','b','d'});expect(result.failedIds,{'e'});
      expect(await owned.exists(),isFalse);expect(await shared.exists(),isTrue);expect(await foreign.exists(),isTrue);
    } finally {await root.delete(recursive:true);await external.delete(recursive:true);}
  });
  test('external deletion is conclusive only with accessible storage',() async {
    final root=await Directory.systemTemp.createTemp('works-reconcile-');
    try {
      final files=WorksBatchFiles([root]);expect(await files.conclusivelyMissing('${root.path}/removed.png'),isTrue);
      final offline=Directory('${root.path}/offline');
      expect(await WorksBatchFiles([offline]).conclusivelyMissing('${offline.path}/old/date/image.png'),isFalse);
      final alive=File('${root.path}/alive.png')..writeAsBytesSync([1]);expect(await files.conclusivelyMissing(alive.path),isFalse);
    } finally {await root.delete(recursive:true);}
  });
  test('multiple selected rows sharing one file unlink it only once',() async {
    final root=await Directory.systemTemp.createTemp('works-shared-');
    try {final file=File('${root.path}/image.png')..writeAsBytesSync([1]);final rows=[item('a',file.path),item('b',file.path)];
      final result=await WorksBatchFiles([root]).delete(rows,{'a','b'});expect(result.removedIds,{'a','b'});expect(result.removedPaths.length,1);}
    finally {await root.delete(recursive:true);}
  });
  test('OS ancestor alias is accepted but nested file and directory links never unlink originals',() async {
    final temporary=await Directory.systemTemp.createTemp('works-alias-');
    final root=Directory(await temporary.resolveSymbolicLinks());
    try {
      final physical=Directory('${root.path}/container')..createSync(),owned=Directory('${physical.path}/images')..createSync();
      final alias=Link('${root.path}/os-alias');await alias.create(physical.path);
      final viaAlias=Directory('${alias.path}/images'),file=File('${viaAlias.path}/owned.png')..writeAsBytesSync([1]);
      final policy=WorksBatchFiles([viaAlias]);
      final removed=await policy.delete([item('owned',file.path)],{'owned'});
      expect(removed.removedPaths.length,1);expect(await file.exists(),isFalse);
      final outside=Directory('${root.path}/outside')..createSync(),foreign=File('${outside.path}/foreign.png')..writeAsBytesSync([2]);
      await Link('${owned.path}/escape').create(outside.path);
      final retained=await policy.delete([item('foreign','${viaAlias.path}/escape/foreign.png')],{'foreign'});
      expect(retained.removedPaths,isEmpty);expect(await foreign.readAsBytes(),[2]);
      await Link('${owned.path}/file.png').create(foreign.path);
      final fileLink=await policy.delete([item('linked','${viaAlias.path}/file.png')],{'linked'});
      expect(fileLink.failedIds,{'linked'});expect(await foreign.readAsBytes(),[2]);
    } finally {await root.delete(recursive:true);}
  },skip:Platform.isWindows);

}

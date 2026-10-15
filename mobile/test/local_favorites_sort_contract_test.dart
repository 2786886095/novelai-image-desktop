import 'package:flutter/foundation.dart' show debugPrint;
import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/local_favorites.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/services/storage.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late File source;
  late MobileLocalFavorites store;
  final bytes=base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    root=await Directory.systemTemp.createTemp('mobile-sort-goal-');
    UnifiedStorage.active=root;
    await File('${root.path}/storage-manifest.json').writeAsString('{"files":[]}');
    await Directory('${root.path}/presets').create(recursive:true);
    await File('${root.path}/presets/prompt-presets.json').writeAsString('{}');
    source=await File('${root.path}/fixture.png').writeAsBytes(bytes);
    store=MobileLocalFavorites(rootOverride:root);
  });
  tearDown(() async { store.dispose(); UnifiedStorage.active=null; await root.delete(recursive:true); });
  HistoryItem history(String id,{bool completed=false})=>HistoryItem(id:id,filePath:source.path,date:'2026-10-14',createdAt:'2020-01-01T00:00:00Z',seed:0,model:'nai-diffusion-5-full',width:1,height:1,prompt:'fixture',params:completed?{'_langbaiLocalGenerationCompletedAt':'2026-10-14T00:00:00.000Z','_langbaiLocalGenerationCompletedSource':'local-completion'}:{});
  test('records collection instant without fabricating legacy generation time',() async {
    final before=await source.readAsBytes();
    final legacy=await store.add(history('legacy'));
    expect(legacy.toJson()['savedAt'],isA<String>());
    expect(DateTime.tryParse(legacy.toJson()['savedAt'] as String)?.isUtc,isTrue);
    expect(legacy.toJson()['generatedAt'],isNull);
    final known=await store.add(history('completed',completed:true));
    expect(known.toJson()['generatedAt'],'2026-10-14T00:00:00.000Z');
    expect(known.toJson()['generatedAtSource'],'local-completion');
    expect(await source.readAsBytes(),before);
    final renamed=await store.rename(known.id,'kept');
    expect(renamed.toJson()['generatedAt'],known.toJson()['generatedAt']);
    expect(renamed.toJson()['savedAt'],known.toJson()['savedAt']);
  });
  test('four orders, invalid calendar unknown last, and persisted view',() async {
    final entries=<Map<String,dynamic>>[];
    for(final id in ['A','B','C','D']) {
      final index=['A','B','C','D'].indexOf(id);
      final prefix='20261014_1x1_0${index+1}';
      final item=LocalFavorite(id:id,sourceId:id,prefix:prefix,name:'',extension:'.png',fileName:'$prefix.png',sha256:sha256.convert(bytes).toString(),bytes:bytes.length);
      final row=item.toJson();
      row['savedAt']=id=='D'?'2026-02-30T00:00:00Z':'2026-03-0${index+1}T00:00:00Z';
      if(id=='A'||id=='B') {row['generatedAt']=id=='A'?'2026-01-04T00:00:00Z':'2026-01-03T00:00:00Z';row['generatedAtSource']='local-completion';}
      entries.add(row);
    }
    final prefs=await UnifiedStorage.preferences();
    await prefs.setString(localFavoritesKey,jsonEncode({'version':1,'directory':'','items':entries}));
    final originalIndex=prefs.getString(localFavoritesKey);
    final cases=[('savedAt','desc',['C','B','A','D']),('savedAt','asc',['A','B','C','D']),('generatedAt','desc',['A','B','C','D']),('generatedAt','asc',['B','A','C','D'])];
    for(final c in cases) {
      final result=await (store as dynamic).listSorted(sortBy:c.$1,sortDirection:c.$2) as LocalFavoriteLibrary;
      expect(result.items.map((e)=>e.id).toList(),c.$3);
      expect(prefs.getString(localFavoritesKey),originalIndex);
      debugPrint('FAVORITE_ORDER=${c.$1}/${c.$2}/${result.items.map((e)=>e.id).join(',')}');
    }
    await (store as dynamic).saveView(sortBy:'generatedAt',sortDirection:'asc',pageSize:12,layout:'masonry');
    final reopened=await (MobileLocalFavorites(rootOverride:root) as dynamic).listSorted() as LocalFavoriteLibrary;
    expect(reopened.items.map((e)=>e.id).toList(),['B','A','C','D']);
    final view=(reopened as dynamic).view;
    expect(view.sortBy,'generatedAt'); expect(view.sortDirection,'asc'); expect(view.pageSize,12); expect(view.layout,'masonry');
    await (store as dynamic).saveView(layout:'grid');
    final after=await store.list();
    expect((after as dynamic).view.sortBy,'generatedAt');
    expect((after as dynamic).view.sortDirection,'asc');
    expect((after as dynamic).view.pageSize,12);
    expect(after.items.map((e)=>e.id).toList(),['A','B','C','D']);
  });
  test('only recorded native save completion carries generation provenance',() async {
    final storage=Storage();
    final saved=await storage.saveImage(bytes,GenerateParams(),1);
    expect(saved.params['_langbaiLocalGenerationCompletedSource'],'local-completion');
    expect(DateTime.tryParse(saved.params['_langbaiLocalGenerationCompletedAt'] as String)?.isUtc,isTrue);
    final bookmark=await store.add(saved);
    expect(bookmark.toJson()['generatedAt'],saved.params['_langbaiLocalGenerationCompletedAt']);
    expect(await File(saved.filePath).readAsBytes(),bytes);
  });
}

// ignore_for_file: avoid_print
// Bounded REAL native components, not full-feature/195 certification.
// Public pinned JS/WASM bytes arrive over controlled loopback GET. No sandbox,
// algorithm, platform-channel, preferences or storage implementation is mocked.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/images/metadata_recovery.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/local_favorites.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';

const _base = 'http://127.0.0.1:18786';
const _source = String.fromEnvironment('FEATURE_SOURCE_SHA', defaultValue: 'uncommitted');
final _checks = <Map<String, Object?>>[];
final _errors = <Object>[];
void _assert(bool value, String reason) { if (!value) throw StateError(reason); }
void _checked(String feature, String journey, Map<String,Object?> observed) {
  final check = <String,Object?>{'sourceSha':_source,'feature':feature,
    'platform':Platform.operatingSystem,'kind':'device','status':'passed',
    'journey':journey,'observed':observed,'scope':'bounded native component only',
    'mockOnly':false,'paidCalls':0};
  _checks.add(check);print('FEATURE_ACCEPTANCE_CHECK:${jsonEncode(check)}');
}
Future<Uint8List> _get(String path) async {
  final client=HttpClient();
  try {
    final request=await client.getUrl(Uri.parse('$_base/$path'));
    request.followRedirects=false;
    final response=await request.close();_assert(response.statusCode==200,'Fixture GET $path HTTP ${response.statusCode}');
    final bytes=BytesBuilder();await for(final chunk in response){bytes.add(chunk);}
    return bytes.takeBytes();
  } finally { client.close(force:true); }
}
Future<String?> _failure(Future<Object?> Function() call) async {
  try { await call();return null; } on MetadataRecoveryFailure catch(error) { return error.code; }
}
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  ui.PlatformDispatcher.instance.onError=(error,stack){_errors.add(error);print('FEATURE_NATIVE_ASYNC_ERROR:$error\n$stack');return true;};
  FlutterError.onError=(details){_errors.add(details.exception);FlutterError.presentError(details);print('FEATURE_NATIVE_ASYNC_ERROR:${details.exception}');};
  runApp(const MaterialApp(home:Scaffold(body:Center(child:Text('Native metadata / favorites component checks')))));
  await WidgetsBinding.instance.endOfFrame;
  try { await _run();_assert(_errors.isEmpty,'Native async/UI error(s): $_errors');
    print('FEATURE_ACCEPTANCE_DONE:${jsonEncode({'sourceSha': const String.fromEnvironment('FEATURE_SOURCE_SHA', defaultValue: 'uncommitted'), 'exitStatus':0,'checks':_checks.length,'platform':Platform.operatingSystem,'paidCalls':0})}');
  } catch(error,stack) {
    print('FEATURE_ACCEPTANCE_FAILURE:$error\n$stack');
    print('FEATURE_ACCEPTANCE_DONE:${jsonEncode({'sourceSha': const String.fromEnvironment('FEATURE_SOURCE_SHA', defaultValue: 'uncommitted'), 'exitStatus':1,'checks':_checks.length,'platform':Platform.operatingSystem,'paidCalls':0})}');
  }
}
Future<void> _run() async {
  _assert(Platform.isAndroid||Platform.isIOS,'Requires real Android/iOS runtime');
  _assert(const bool.fromEnvironment('FEATURE_ISOLATED_DEVICE'),'Disposable device authorization missing');
  final preferences=await SharedPreferences.getInstance();await preferences.clear();
  final root=await Directory.systemTemp.createTemp('native-metadata-favorites-');
  final ids=<String>[];
  final reader=MetadataRecoveryReader(fetchAsset:(id){ids.add(id);return _get('assets/$id');});
  final png=await _get('fixtures/rgba-8-plain.png');
  final webp=await _get('fixtures/webp-lossless-alpha.webp');
  final conflict=await _get('fixtures/png-text-plus-stealth.png');
  final originals=[png,webp,conflict].map((bytes)=>sha256.convert(bytes).toString()).toList();
  final favorites=MobileLocalFavorites(rootOverride:root);
  try {
    for(final entry in [('PNG',png),('WebP',webp)]) {
      final report=await reader.read(entry.$2); // Default is online, sandbox OMITTED.
      _assert(report.imported.seed==424242,'${entry.$1} actual official seed mismatch');
      _assert(report.imported.positivePrompt=='blue sky, 白色衣服','${entry.$1} official prompt mismatch');
      _checked('metadata-import','${entry.$1} default-online stock WebView / Worker / WASM',
        {'seed':report.imported.seed,'software':report.software,'assetIds':List<String>.from(ids),'sandboxReplacement':false});
    }
    _assert(ids.length==10&&ids.toSet().length==10,'Pinned asset cache did not GET exactly ten IDs');
    final official=await reader.read(conflict);
    _assert(official.software=='Celsys Studio Tool'&&official.imported.seed==null&&official.rawMetadata['Comment']=='{}',
      'Official conflicting PNG must retain Celsys/Comment{} with NO seed, not stealth fallback');
    _checked('metadata-import','conflicting PNG official text differs from local stealth',
      {'onlineSoftware':official.software,'onlineComment':official.rawMetadata['Comment'],'onlineSeed':official.imported.seed,'implicitFallback':false});
    final beforeOffline=ids.length;
    for(final entry in [('conflicting PNG',conflict),('RGBA PNG',png),('WebP',webp)]) {
      final offline=await reader.read(entry.$2,mode:MetadataRecoveryMode.offline);
      _assert(offline.imported.seed==424242,'${entry.$1} offline seed mismatch');
      _assert(ids.length==beforeOffline,'Offline fetched assets');
      _checked('metadata-import','${entry.$1} explicit-offline actual local parser',{'seed':offline.imported.seed,'assetGets':0});
    }
    final jpeg=Uint8List(33)..[0]=255..[1]=216..[2]=255;
    final jpegError=await _failure(()=>reader.read(jpeg));
    _assert(jpegError=='online_png_webp_only'&&ids.length==beforeOffline,'JPEG online guard/fetch boundary');
    _checked('metadata-import','JPEG online rejected before GET/WebView, no silent offline',{'error':jpegError,'assetGets':0});
    final badIds=<String>[];
    final bad=MetadataRecoveryReader(fetchAsset:(id) async {badIds.add(id);return Uint8List(MetadataRecoveryReader.assetFor(id).bytes);});
    final badError=await _failure(()=>bad.read(png));await bad.cancel();
    _assert(badError=='asset_integrity_changed'&&badIds.length==1,'Bad SHA not refused before native Worker');
    _checked('metadata-import','bad pinned SHA refused before native Worker',{'error':badError,'assetIds':badIds,'sandboxReplacement':false});
    final started=Completer<void>(),delayed=Completer<Uint8List>();
    final cancellable=MetadataRecoveryReader(fetchAsset:(id){started.complete();return delayed.future;});
    final cancelled=_failure(()=>cancellable.read(png));await started.future;await cancellable.cancel();delayed.complete(Uint8List(1));
    _assert(await cancelled=='cancelled','Cancelled native read produced stale result');
    _checked('metadata-import','cancel actual reader during controlled pending GET',{'error':'cancelled','staleSuccess':false,'workerExecutionNotClaimed':true});
    _assert(jsonEncode([png,webp,conflict].map((bytes)=>sha256.convert(bytes).toString()).toList())==jsonEncode(originals),'Source encoded bytes changed');
    final image=await File('${root.path}/fixture.png').writeAsBytes(png);
    HistoryItem history(String id,{bool completed=false})=>HistoryItem(id:id,filePath:image.path,date:'2026-10-14',createdAt:'2020-01-01T00:00:00Z',seed:424242,model:'nai-diffusion-5-full',width:64,height:128,prompt:'fixture',params:completed?{'_langbaiLocalGenerationCompletedAt':'2026-10-14T00:00:00.000Z','_langbaiLocalGenerationCompletedSource':'local-completion'}:{});
    final legacy=await favorites.add(history('legacy'));
    _assert(DateTime.tryParse(legacy.savedAt??'')?.isUtc==true&&legacy.generatedAt==null,'Legacy collection/generation provenance');
    final known=await favorites.add(history('known',completed:true));
    final renamed=await favorites.rename(known.id,'native 日本語');
    _assert(renamed.generatedAt==known.generatedAt&&renamed.savedAt==known.savedAt,'Rename changed timestamps');
    _assert(sha256.convert(await (await favorites.file(renamed)).readAsBytes()).toString()==originals.first,'Original copy bytes changed');
    _checked('favorites','native FS original copy, UTC collection, legacy unknown and rename preservation',{'savedAt':legacy.savedAt,'legacyGeneratedAt':legacy.generatedAt,'knownGeneratedAt':known.generatedAt,'bytesUnchanged':true});
    final entries=<Map<String,dynamic>>[];
    for(final id in ['A','B','C','D']) {
      final index=['A','B','C','D'].indexOf(id),prefix='20261014_64x128_0${index+1}';
      final row=LocalFavorite(id:id,sourceId:id,prefix:prefix,name:'',extension:'.png',fileName:'$prefix.png',sha256:originals.first,bytes:png.length).toJson();
      row['savedAt']=id=='D'?'2026-02-30T00:00:00Z':'2026-03-0${index+1}T00:00:00Z';
      if(id=='A'||id=='B'){row['generatedAt']=id=='A'?'2026-01-04T00:00:00Z':'2026-01-03T00:00:00Z';row['generatedAtSource']='local-completion';}
      entries.add(row);
    }
    final prefs=await UnifiedStorage.preferences();
    await prefs.setString(localFavoritesKey,jsonEncode({'version':1,'directory':'','items':entries}));
    final indexBefore=prefs.getString(localFavoritesKey);
    for(final order in [('savedAt','desc','C,B,A,D'),('savedAt','asc','A,B,C,D'),('generatedAt','desc','A,B,C,D'),('generatedAt','asc','B,A,C,D')]) {
      final sorted=await favorites.listSorted(sortBy:order.$1,sortDirection:order.$2);
      _assert(sorted.items.map((item)=>item.id).join(',')==order.$3,'Native order ${order.$1}/${order.$2}');
      _assert(prefs.getString(localFavoritesKey)==indexBefore,'Read-only ordering mutated saved index');
      _checked('favorites','native persistent library ${order.$1}/${order.$2}, unknown last',{'ids':sorted.items.map((item)=>item.id).toList(),'sourceIndexUnchanged':true});
    }
    await favorites.saveView(sortBy:'generatedAt',sortDirection:'asc',layout:'masonry',pageSize:12);
    await preferences.reload();
    final reopenedStore=MobileLocalFavorites(rootOverride:root);
    final reopened=await reopenedStore.listSorted();reopenedStore.dispose();
    _assert(reopened.items.map((item)=>item.id).join(',')=='B,A,C,D'&&reopened.view.layout=='masonry'&&reopened.view.pageSize==12,'Native persisted view reopen');
    _checked('favorites','native preferences reload and new store retain saved view',{'sortBy':reopened.view.sortBy,'direction':reopened.view.sortDirection,'layout':reopened.view.layout,'pageSize':reopened.view.pageSize,'coldProcessRestartUntested':true});
    final storage=Storage();
    await storage.setSettings(AppSettings(imageOutputDir:root.path,saveToGallery:false));
    final saved=await storage.saveImage(png,GenerateParams(width:64,height:128),424242);
    _assert(saved.params['_langbaiLocalGenerationCompletedSource']=='local-completion'&&DateTime.tryParse(saved.params['_langbaiLocalGenerationCompletedAt'] as String)?.isUtc==true,'Actual native save completion provenance');
    _checked('favorites','actual native production image-save completion timestamp',{'generatedAt':saved.params['_langbaiLocalGenerationCompletedAt'],'source':'local-completion','paidGenerationPerformed':false});
  } finally { await reader.cancel();favorites.dispose();await root.delete(recursive:true); }
}

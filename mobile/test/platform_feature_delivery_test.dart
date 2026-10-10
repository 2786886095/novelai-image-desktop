import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image/image.dart' as im;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/mobile_mcp_tools.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/screens/external_mcp_settings.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/state/app_state.dart';

class AccountApp extends AppState {
  final NovelAiAccounts vault;
  AccountApp(this.vault,Storage storage):super(storage:storage,preloadCompletedImage:(_) async {});
  @override NovelAiAccounts get naiAccounts=>vault;
}
class Paths extends PathProviderPlatform {
  final String root;
  Paths(this.root);
  @override Future<String?> getApplicationDocumentsPath() async=>root;
  @override Future<String?> getApplicationSupportPath() async=>root;
  @override Future<String?> getTemporaryPath() async=>root;
}
HistoryItem item(String id,String path)=>HistoryItem(id:id,filePath:path,date:'2026-10-11',createdAt:'2026-10-11',seed:1,model:'fixture',width:32,height:32,prompt:'blue coat');
Map<String,dynamic> data(Map<String,dynamic> reply)=>jsonDecode(reply['content'][0]['text']) as Map<String,dynamic>;

void main(){
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;late Storage storage;late AppState app;
  late File source,mask;final servers=<HttpServer>[];
  setUp(() async {
    HttpOverrides.global=null;
    root=await Directory.systemTemp.createTemp('five-port-delivery-');
    PathProviderPlatform.instance=Paths(root.path);
    UnifiedStorage.active=null;
    SharedPreferences.setMockInitialValues({});FlutterSecureStorage.setMockInitialValues({});
    storage=Storage();app=AppState(storage:storage,preloadCompletedImage:(_) async {})
      ..settings=AppSettings(proxyMode:'direct',saveToGallery:false);
    await storage.setSettings(app.settings);
    final pixels=im.Image(width:32,height:32,numChannels:4);
    im.fill(pixels,color:im.ColorRgba8(220,30,30,255));pixels.textData={'Comment':jsonEncode({'prompt':'blue coat','seed':123})};
    source=File('${root.path}/source.png');await source.writeAsBytes(im.encodePng(pixels));
    final selected=im.Image(width:32,height:32,numChannels:4);
    im.fillRect(selected,x1:12,y1:12,x2:19,y2:19,color:im.ColorRgba8(255,255,255,255));
    mask=File('${root.path}/mask.png');await mask.writeAsBytes(im.encodePng(selected));
  });
  tearDown(() async {
    app.dispose();for(final s in servers){await s.close(force:true);}servers.clear();
    await Future<void>.delayed(const Duration(milliseconds:30));
    await root.delete(recursive:true);
  });
  Future<String> serve(Future<void> Function(HttpRequest) handler) async {
    final s=await HttpServer.bind(InternetAddress.loopbackIPv4,0);servers.add(s);s.listen(handler);return 'http://127.0.0.1:${s.port}/v1';
  }
  Future<void> config(String url) async {
    await app.saveOpenAIEditSettings({'baseUrl':url,'model':'fixture-edit','size':'32x32','quality':'auto','inputFidelity':''},'fixture-edit-secret','');
    app.inpaintEngine='openai';app.inpaintSourceMode='latest';app.inpaintPositivePrompt='blue helmet';
    await app.setWorkbenchPath(source.path);
  }
  test('independent edit secure key survives reopening without changing native provider',() async {
    await config('https://example.test/v1');
    final fresh=await Storage().getSettings();
    expect(fresh.imageProvider,'novelai');expect(fresh.compatibleImage,isEmpty);
    expect(await storage.getOpenAIEditKey(fresh.openAIEdit['credentialId']),'fixture-edit-secret');
    expect(jsonEncode(fresh.toJson()),isNot(contains('fixture-edit-secret')));
    await expectLater(app.saveOpenAIEditSettings(fresh.openAIEdit,'another-key','stale-id'),throwsStateError);
    expect((await storage.getSettings()).openAIEdit['credentialId'],fresh.openAIEdit['credentialId']);
  });
  for(final status in [200,422]){
    test('actual AppState edit $status submits once and never uses a native token',() async {
      var posts=0;
      final url=await serve((r) async {
        expect(r.method,'POST');expect(r.uri.path,'/v1/images/edits');posts++;
        expect(r.headers.value('authorization'),'Bearer fixture-edit-secret');
        await r.drain<void>();r.response.statusCode=status;
        final out=im.Image(width:32,height:32);im.fill(out,color:im.ColorRgb8(0,0,255));
        r.response.write(status==200?jsonEncode({'data':[{'b64_json':base64Encode(im.encodePng(out))}]}):'fixture rejected');await r.response.close();
      });
      await config(url);await app.inpaint(await mask.readAsBytes());
      expect(posts,1);expect(app.busy,isFalse);expect(await storage.getToken(),isNull);
      expect(app.history.length,status==200?1:0);
      if(status==200){final row=app.history.single;expect(row.feature,'openai-inpaint');
        final saved=im.decodePng(await File(row.filePath).readAsBytes())!;
        expect([saved.getPixel(0,0).r,saved.getPixel(0,0).g,saved.getPixel(0,0).b],[220,30,30]);
        expect(jsonEncode(row.toJson()),isNot(contains('fixture-edit-secret')));
        expect(app.comparisonBefore?.filePath,source.path);
      }
    });
  }
  test('Agent explicitly selects independent edit even with compatible generation configured',() async {
    var posts=0;
    final url=await serve((r) async {posts++;await r.drain<void>();r.response.statusCode=422;r.response.write('fixture denied');await r.response.close();});
    await config(url);app.settings.imageProvider='openai-images';
    final tools=AgentToolExecutor(app:app,listMemories:()=>[],upsertMemory:(_) async=>{},deleteMemory:(_) async=>false);
    final files=[AgentAttachment(id:'source',name:'source.png',mime:'image/png',size:await source.length(),kind:'image',filePath:source.path,width:32,height:32),AgentAttachment(id:'mask',name:'mask.png',mime:'image/png',size:await mask.length(),kind:'image',filePath:mask.path,width:32,height:32)];
    final prepared=await tools.prepareImageOperation('langbai_inpaint_image',{'engine':'openai','attachmentId':'source','maskAttachmentId':'mask','positivePrompt':'blue helmet'},files);
    final result=await prepared.execute();expect(posts,1);expect(result.ok,isFalse);expect(app.history,isEmpty);tools.sessions.close();
  });
  test('real Storage batch move/delete/reconcile commits and invalidates another cache',() async {
    final images=await storage.imagesDir(),a=File('${images.path}/a.png'),b=File('${images.path}/b.png');
    await a.writeAsBytes(await source.readAsBytes());await b.writeAsBytes(await source.readAsBytes());
    await storage.writeGroups(const [HistoryGroup(id:'group',name:'Group',createdAt:'2026-10-11')]);
    await storage.writeHistory([item('a',a.path),item('b',b.path),item('external',source.path)]);
    app.history=await storage.getHistory();app.groups=await storage.getGroups();app.current=app.history.first;
    final other=Storage();expect((await other.getHistory()).length,3);
    await app.moveHistoryItems({'a','b'},'group');
    expect((await other.getHistory()).take(2).every((h)=>h.groupId=='group'),isTrue);
    await app.setWorkbenchPath(a.path);
    final removed=await app.deleteHistoryItems({'a','external'});expect(removed.removedIds,{'a','external'});
    expect(await a.exists(),isFalse);expect(await source.exists(),isTrue);expect(app.workbenchImage,isNull);
    await b.delete();app.booted=true;await app.reconcileMissingHistory();
    expect(app.history,isEmpty);expect(await other.getHistory(),isEmpty);
  });
  test('MCP actual import preserves metadata; view, masks and workbench apply use registered IDs',() async {
    final assets=Directory('${root.path}/mcp')..createSync();
    final host=MobileMcpTools(app:app,assets:assets,budget:()=>0);
    try {
      final imported=data(await (await host.prepare('import_image',{'path':source.path})).execute());
      final id=imported['attachmentId'] as String;
      expect(await File(imported['filePath']).readAsBytes(),await source.readAsBytes());
      final view=await (await host.prepare('view_image',{'image':id,'maxSize':64})).execute();
      expect(view['content'][1]['type'],'image');
      final generated=data(await (await host.prepare('make_mask',{'image':id,'shapes':[{'x':.25,'y':.25,'width':.5,'height':.5,'shape':'ellipse'}]})).execute());
      expect(generated['coverage'],greaterThan(0));expect(await File(generated['maskPath']).exists(),isTrue);
      await (await host.prepare('apply_to_workbench',{'image':id})).execute();expect(app.workbenchImage?.filePath,imported['filePath']);
      await expectLater(host.prepare('generate_image',{'positivePrompt':'blue coat'}),throwsStateError);
    } finally {host.dispose();}
  });
  test('MCP approval is invalidated by same-host account switch',() async {
    String? saved;
    final vault=NovelAiAccounts(read:() async=>saved,write:(value) async{saved=value;});
    await vault.load(legacyToken:() async=>null,legacySettings:() async=>AppSettings());
    final a=await vault.add(label:'Fixture A',method:'token',token:'fixture-account-a');
    final b=await vault.add(label:'Fixture B',method:'token',token:'fixture-account-b');
    await vault.activate(a.id);
    final bound=AccountApp(vault,storage)..settings=AppSettings(proxyMode:'direct');
    bound.account=const AccountSummary(hasToken:true,tierLevel:3,anlasBalance:10000,hasActiveSubscription:true);
    final host=MobileMcpTools(app:bound,assets:Directory('${root.path}/account-mcp'),budget:()=>10000);
    try {
      final operation=await host.prepare('generate_image',{'positivePrompt':'blue coat'});
      expect(jsonEncode(operation.summary),isNot(contains('fixture-account-a')));
      await vault.activate(b.id);
      await expectLater(operation.execute(),throwsStateError);
      expect(bound.history,isEmpty);
    } finally {host.dispose();bound.dispose();}
  });
  test('external execution leases the approved native account until completion',() async {
    String? saved;
    final vault=NovelAiAccounts(read:() async=>saved,write:(value) async{saved=value;});
    await vault.load(legacyToken:() async=>null,legacySettings:() async=>AppSettings());
    final a=await vault.add(label:'Fixture A',method:'token',token:'fixture-account-a');
    final b=await vault.add(label:'Fixture B',method:'token',token:'fixture-account-b');
    await vault.activate(a.id);
    final bound=AccountApp(vault,storage),pending=Completer<void>();
    try {
      final running=bound.withExternalAnlasLimit(10,()=>pending.future);
      try {await expectLater(vault.activate(b.id),throwsStateError);}
      finally {pending.complete();await running;}
      expect(vault.active!.profile.id,a.id);
      await vault.activate(b.id);expect(vault.active!.profile.id,b.id);
    } finally {bound.dispose();}
  });
  testWidgets('MCP listener remains alive after settings card is removed', (tester) async {
    await tester.runAsync(()=>app.externalMcp.toggle());final server=app.externalMcp.server!;
    await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:const MaterialApp(home:Scaffold(body:ExternalMcpSettingsCard()))));
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('another page'))));
    expect(app.externalMcp.server,same(server));
    await tester.runAsync(() async {final client=HttpClient();try{final request=await client.postUrl(Uri.parse(server.url));request.headers.contentType=ContentType.json;request.headers.set('authorization','Bearer ${server.token}');request.write(jsonEncode({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-03-26'}}));final response=await request.close();expect(response.statusCode,200);expect(jsonDecode(await utf8.decoder.bind(response).join())['result']['serverInfo']['version'],appVersion);}finally{client.close(force:true);}});
    await tester.runAsync(()=>app.externalMcp.toggle());expect(app.externalMcp.server,isNull);
  });
  for(final width in [360.0,390.0]){
    testWidgets('batch controls fit phone width $width at 200 percent text', (tester) async {
      tester.view.devicePixelRatio=1;tester.view.physicalSize=Size(width,800);addTearDown(tester.view.reset);
      await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(home:MediaQuery(data:MediaQueryData(size:Size(width,800),textScaler:const TextScaler.linear(2)),child:const GalleryScreen()))));
      await tester.tap(find.byKey(const ValueKey('works-batch-edit')));await tester.pump();
      expect(find.text('选择筛选结果'),findsOneWidget);expect(tester.takeException(),isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}

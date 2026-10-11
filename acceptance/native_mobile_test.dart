// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/screens/ai_log_screen.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/tools_screen.dart';

// Native CI-only fresh simulator/emulator. Real plugin channels, storage and
// socket transport; neutral fixtures, no production endpoint and no paid call.
void result(String name,List<String> features) => print('NATIVE_MOBILE_CASE:${jsonEncode({'name':name,'features':features,'pass':true,'platform':Platform.isAndroid?'android':'ios','sourceSha':const String.fromEnvironment('ACCEPTANCE_SOURCE_SHA'),'paidCalls':0})}');
HistoryItem row(String id,String file)=>HistoryItem(id:id,filePath:file,date:'2026-10-11',createdAt:'2026-10-11',seed:123,model:'fixture',width:32,height:32,prompt:'blue square');
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  late Storage storage;late AppState app;late Directory root;late File source,mask;
  final servers=<HttpServer>[];
  setUp(() async {
    HttpOverrides.global=null;UnifiedStorage.active=null;
    final prefs=await SharedPreferences.getInstance();await prefs.clear();
    await const FlutterSecureStorage().deleteAll();
    root=await Directory((await getTemporaryDirectory()).path).createTemp('native-acceptance-');
    storage=Storage();app=AppState(storage:storage,preloadCompletedImage:(_) async {})..settings=AppSettings(proxyMode:'direct',saveToGallery:false);
    await storage.setSettings(app.settings);await storage.writeHistory([]);await storage.writeGroups([]);
    final image=im.Image(width:32,height:32,numChannels:4);im.fill(image,color:im.ColorRgba8(220,30,30,255));
    image.textData={'Comment':jsonEncode({'prompt':'blue square','seed':123})};
    source=File('${root.path}/source.png');await source.writeAsBytes(im.encodePng(image));
    final selected=im.Image(width:32,height:32,numChannels:4);im.fillRect(selected,x1:12,y1:12,x2:19,y2:19,color:im.ColorRgba8(255,255,255,255));
    mask=File('${root.path}/mask.png');await mask.writeAsBytes(im.encodePng(selected));
  });
  tearDown(() async {
    app.dispose();for(final server in servers){await server.close(force:true);}servers.clear();
    await Future<void>.delayed(const Duration(milliseconds:50));if(await root.exists())await root.delete(recursive:true);
  });
  testWidgets('real secure storage and preferences survive reopening', (tester) async {
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Native acceptance'))));
    final docs=await getApplicationDocumentsDirectory();expect(await docs.exists(),true);
    await app.saveOpenAIEditSettings({'baseUrl':'https://example.test/v1','model':'fixture-edit','size':'32x32','quality':'auto','inputFidelity':''},'neutral-fixture-secret','');
    final fresh=await Storage().getSettings();final id=fresh.openAIEdit['credentialId'] as String;
    expect(id,isNotEmpty);expect(await Storage().getOpenAIEditKey(id),'neutral-fixture-secret');
    expect(jsonEncode(fresh.toJson()),isNot(contains('neutral-fixture-secret')));expect(fresh.imageProvider,'novelai');
    await app.setAutomaticComparison('inpaint',false);expect((await Storage().getSettings()).automaticComparison['inpaint'],false);
    result('Real native credential/preferences/path-provider readback',['accounts','settings','openai-inpaint','output-management']);
  });
  for(final status in [200,422]) {
    testWidgets('real OpenAI AppState multipart $status submits once', (tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral edit'))));
      var posts=0;final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);servers.add(server);
      server.listen((request) async {
        expect(request.method,'POST');expect(request.uri.path,'/v1/images/edits');posts++;
        expect(request.headers.value('authorization'),'Bearer neutral-edit-secret');
        await request.drain<void>();request.response.statusCode=status;
        final image=im.Image(width:32,height:32);im.fill(image,color:im.ColorRgb8(0,0,255));
        request.response.write(status==200?jsonEncode({'data':[{'b64_json':base64Encode(im.encodePng(image))}]}):'fixture rejected');await request.response.close();
      });
      await app.saveOpenAIEditSettings({'baseUrl':'http://127.0.0.1:${server.port}/v1','model':'fixture-edit','size':'32x32','quality':'auto','inputFidelity':''},'neutral-edit-secret','');
      app.inpaintEngine='openai';app.inpaintSourceMode='latest';app.inpaintPositivePrompt='blue square';await app.setWorkbenchPath(source.path);
      await app.inpaint(await mask.readAsBytes());expect(posts,1);expect(app.busy,false);expect(app.history.length,status==200?1:0);
      if(status==200) {final saved=im.decodePng(await File(app.history.single.filePath).readAsBytes())!;
        expect([saved.getPixel(0,0).r,saved.getPixel(0,0).g,saved.getPixel(0,0).b],[220,30,30]);
        // Default production compositor deliberately feathers/matches seams;
        // pure blue is not the specified result for this small selected region.
        final center=saved.getPixel(15,15);
        expect(saved.width,32);expect(saved.height,32);
        expect(center.r,lessThan(40));expect(center.g,lessThan(40));expect(center.b,greaterThan(200));expect(center.a,255);
        for(final xy in [[0,31],[31,0],[31,31]]) {
          final corner=saved.getPixel(xy[0],xy[1]);expect([corner.r,corner.g,corner.b],[220,30,30]);
        }
        print('NATIVE_COMPOSITE_PIXELS:${jsonEncode({'center':[center.r,center.g,center.b],'cornersUnchanged':true})}');
        expect(app.history.single.feature,'openai-inpaint');expect(jsonEncode(app.history.single.toJson()),isNot(contains('neutral-edit-secret')));
      }
      result('OpenAI real AppState multipart status $status',['openai-inpaint','inpaint','works']);
    });
  }
  testWidgets('real file deletion/move/reconcile across Storage instances', (tester) async {
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral works'))));
    final images=await storage.imagesDir(),a=File('${images.path}/acceptance-a.png'),b=File('${images.path}/acceptance-b.png');
    await a.writeAsBytes(await source.readAsBytes());await b.writeAsBytes(await source.readAsBytes());
    await storage.writeGroups(const [HistoryGroup(id:'native-group',name:'Group',createdAt:'2026-10-11')]);
    await storage.writeHistory([row('a',a.path),row('b',b.path),row('external',source.path)]);app.history=await storage.getHistory();app.groups=await storage.getGroups();
    final other=Storage();expect((await other.getHistory()).length,3);
    await app.moveHistoryItems({'a','b'},'native-group');expect((await other.getHistory()).take(2).every((h)=>h.groupId=='native-group'),true);
    await app.setWorkbenchPath(a.path);await app.deleteHistoryItems({'a','external'});expect(await a.exists(),false);expect(await source.exists(),true);expect(app.workbenchImage,isNull);
    await b.delete();app.booted=true;await app.reconcileMissingHistory();expect(app.history,isEmpty);expect(await other.getHistory(),isEmpty);
    result('Actual native filesystem/group/index/cache transaction',['works','works-batch-edit','missing-file-reconciliation','output-management']);
  });
  testWidgets('real authenticated loopback MCP rejects unauthenticated callers', (tester) async {
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral MCP'))));
    expect(app.externalMcp.server,isNull);await app.externalMcp.toggle();final server=app.externalMcp.server!;final client=HttpClient();
    try {
      final bad=await client.postUrl(Uri.parse(server.url));bad.headers.contentType=ContentType.json;bad.write('{}');final denied=await bad.close();await denied.drain<void>();expect(denied.statusCode,403);
      final request=await client.postUrl(Uri.parse(server.url));request.headers.contentType=ContentType.json;request.headers.set('authorization','Bearer ${server.token}');
      request.write(jsonEncode({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-03-26'}}));final response=await request.close();expect(response.statusCode,200);
      final reply=jsonDecode(await utf8.decoder.bind(response).join());expect(reply['result']['serverInfo']['version'],appVersion);
    } finally {client.close(force:true);await app.externalMcp.toggle();}
    expect(app.externalMcp.server,isNull);result('Native loopback MCP authentication/lifecycle',['external-mcp-server','settings']);
  });
  testWidgets('actual records expand and scroll past long first entry', (tester) async {
    final text=List.generate(100,(i)=>'Neutral blue square record line $i').join('\n');
    // Populate the read-only log through the real public API and transport.
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);servers.add(server);var posts=0;
    server.listen((request) async {
      expect(request.method,'POST');expect(request.uri.path,'/v1/chat/completions');posts++;
      await request.drain<void>();request.response.headers.contentType=ContentType.json;
      request.response.write(jsonEncode({'choices':[{'message':{'content':text}}]}));await request.response.close();
    });
    for(var i=0;i<24;i++) {
      final response=await app.api.runTextAi(settings:app.settings,apiKey:'neutral-log-secret',apiUrl:'http://127.0.0.1:${server.port}/v1',model:'fixture',system:text,user:text,label:'Neutral record $i');
      expect(response.ok,true);
    }
    expect(posts,24);expect(app.aiCallLog.length,24);expect(app.aiCallLog.first.label,'Neutral record 23');
    await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:const MaterialApp(home:AiLogScreen())));await tester.pumpAndSettle();
    await tester.tap(find.text('Neutral record 23'));await tester.pumpAndSettle();
    final list=find.byType(ListView).first;final scrollable=find.descendant(of:list,matching:find.byType(Scrollable)).first;
    final before=tester.state<ScrollableState>(scrollable).position.pixels;await tester.drag(list,const Offset(0,-500));await tester.pumpAndSettle();
    expect(tester.state<ScrollableState>(scrollable).position.pixels,greaterThan(before));expect(tester.takeException(),isNull);
    result('Native renderer expanded records scroll',['ai-records']);
  });
  testWidgets('real core screens fit portrait/landscape at 200 percent text', (tester) async {
    for(final size in [const Size(390,844),const Size(844,390),const Size(1024,768)]) {
      await tester.binding.setSurfaceSize(size);
      for(final screen in [const GalleryScreen(),const GenerateScreen(),const ToolsScreen(kind:ToolPageKind.inpaint)]) {
        await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(home:MediaQuery(data:MediaQueryData(size:size,textScaler:const TextScaler.linear(2)),child:screen))));
        await tester.pumpAndSettle();expect(tester.takeException(),isNull,reason:'$size ${screen.runtimeType}');
        if(screen is GalleryScreen) {await tester.tap(find.byKey(const ValueKey('works-batch-edit')));await tester.pumpAndSettle();expect(tester.takeException(),isNull);}
        await tester.pumpWidget(const SizedBox.shrink());
      }
    }
    await tester.binding.setSurfaceSize(null);result('Native device core-screen responsive text 200 percent',['typography','works-batch-edit','generation','inpaint']);
  });
}

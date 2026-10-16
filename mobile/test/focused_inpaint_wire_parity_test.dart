import 'package:flutter/foundation.dart';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/billing/anlas.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

const account=AccountSummary(hasToken:true,tierLevel:1,anlasBalance:1000,hasActiveSubscription:true);
class Paths extends PathProviderPlatform {
  final String root;
  Paths(this.root);
  @override Future<String?> getApplicationDocumentsPath() async=>root;
  @override Future<String?> getApplicationSupportPath() async=>root;
  @override Future<String?> getTemporaryPath() async=>root;
}
class LegacyProbeApi extends NaiApi {
  @override Future<AccountSummary> fetchAccount(String token,AppSettings settings) async=>account;
}
class ProbeApp extends AppState {
  final NovelAiAccounts fixtureVault;
  ProbeApp(this.fixtureVault,NaiApi api,Storage storage):super(api:api,storage:storage,preloadCompletedImage:(_)async{});
  @override NovelAiAccounts get naiAccounts=>fixtureVault;
}
void main(){
  TestWidgetsFlutterBinding.ensureInitialized();
  for(final transport in ['legacy','account-bound']){
  for(final variant in ['preserve']){
    test('actual focused 4K AppState wire and return edit: $transport / $variant',()async{
      HttpOverrides.global=null;
      final calls=<String>[];
      final root=await Directory.systemTemp.createTemp('conditioning-audit-');
      PathProviderPlatform.instance=Paths(root.path);
      SharedPreferences.setMockInitialValues({});
      FlutterSecureStorage.setMockInitialValues({});
      UnifiedStorage.active=null;
      final png=Uint8List.fromList(im.encodePng(im.Image(width:3840,height:2160)));
      final mask=Uint8List.fromList(im.encodePng(im.Image(width:3840,height:2160,numChannels:4)..clear(im.ColorRgba8(255,255,255,255))));
      final source=File('${root.path}/source.png');await source.writeAsBytes(png);
      final wires=<Map<String,dynamic>>[];
      final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);
      server.listen((r)async{
        calls.add(r.uri.path);
        if(r.uri.path.endsWith('encode-vibe')) { await r.drain<void>();r.response.add(utf8.encode('synthetic encoding'));await r.response.close();return; }
        wires.add(wire(await r.fold<BytesBuilder>(BytesBuilder(),(b,v)=>b..add(v)).then((b)=>b.takeBytes()),r.headers.contentType.toString()));
        r.response.add(png);await r.response.close();
      });
      String? document;
      final vault=NovelAiAccounts(read:()async=>document,write:(s)async=>document=s);
      await vault.load(legacyToken:()async=>'AUDIT_SYNTHETIC_TOKEN',legacySettings:()async=>AppSettings());
      final NaiApi api=transport=='legacy'?LegacyProbeApi():NovelAiAccountApi(vault,clientFactory:(_,__)=>MockClient((r)async{
        if(r.method=='GET')return http.Response(jsonEncode({'subscription':{'tier':1,'trainingStepsLeft':1000}}),200);
        calls.add(r.url.path);
        if(r.url.path.endsWith('encode-vibe')) return http.Response.bytes(utf8.encode('synthetic encoding'),200);
        wires.add(wire(r.bodyBytes,r.headers['content-type']??''));
        return http.Response.bytes(png,200);
      }));
      final storage=Storage();await storage.setToken('AUDIT_SYNTHETIC_TOKEN');
      final app=ProbeApp(vault,api,storage)
        ..settings=AppSettings(proxyMode:'direct',saveToGallery:false,allowCustomEndpoint:true,allowCustomEndpointFallback:false,streamPreviewEnabled:false,imageBaseUrl:'http://127.0.0.1:${server.port}')
        ..params=GenerateParams(model:'nai-diffusion-5-full',width:64,height:64,positivePrompt:'scene')
        ..inpaintModel='nai-diffusion-4-5-full-inpainting'
        ..inpaintSizeMode='custom'
        ..inpaintCustomSize=(width:64,height:64)
        ..inpaintPositivePrompt='scene'
        ..inpaintSourceMode='latest'
        ..workbenchImage=WorkingImage(filePath:source.path,width:3840,height:2160)
        ..inpaintRegion=(x:1024,y:512,width:768,height:768)
        ..extras=GenerateExtras(charCaptions:[CharCaptionItem(prompt:'red coat',negativePrompt:'blue coat',useCoords:true,x:0.25,y:0.4),CharCaptionItem(prompt:'green hat',negativePrompt:'red hat',useCoords:true,x:0.75,y:0.6)],preciseReferences:[PreciseReferenceItem(base64:base64Encode(png),width:64,height:64,strength:0.8,fidelity:0.7)]);
      try {
        final original=app.extras.toJson();
        if(variant=='unsupported')app.inpaintModel='nai-diffusion-5-full-inpainting';
        if(variant=='mixed')app.extras.vibeImages.add(VibeTransferItem(base64:base64Encode(png)));
        final quote=app.inpaintAnlasQuote;
        await app.inpaint(mask);
        debugPrint('MOBILE_FIX_WIRE=${jsonEncode({'transport':transport,'variant':variant,'calls':calls,'wire':wires.map((w)=>{'action':w['action'],'model':w['model'],'parameters':(w['parameters'] as Map).map((k,v)=>MapEntry(k,k=='image'||k=='mask'?'synthetic image':v))}).toList(),'quote':quote.amount,'status':app.status})}');
        if(variant!='preserve'){expect(calls,isEmpty,reason:'unsupported/mixed references must reject before encoding or generation');return;}
        expect(wires.length,1,reason:'actual local request must have run');
        final request=wires.single,p=request['parameters'] as Map;
        final characters=(((p['v4_prompt'] as Map)['caption'] as Map)['char_captions'] as List);
        final negative=(((p['v4_negative_prompt'] as Map)['caption'] as Map)['char_captions'] as List);
        expect(request['model'],'nai-diffusion-4-5-full-inpainting');expect(request['action'],'infill');
        expect(characters.map((c)=>c['char_caption']).toList(),['red coat','green hat']);
        expect(negative.map((c)=>c['char_caption']).toList(),['blue coat','red hat']);
        expect(characters.map((c)=>c['centers']).toList(),[[{'x':0.0,'y':(0.4*2160-512)/768}],[{'x':1.0,'y':1.0}]]);
        expect(p['director_reference_images_cached'],hasLength(1));
        expect(p['director_reference_strength_values'],[0.8]);expect(p['director_reference_secondary_strength_values'],[0.3]);
        expect(request['_partNames'],contains('director_ref_0'));
        final noRefs=calculateInpaintAnlas(params:GenerateParams(model:'nai-diffusion-4-5-full',width:1024,height:1024),account:account,image:app.workbenchImage,inpaintModel:app.inpaintModel,strength:app.inpaintStrength);
        expect(quote.amount,noRefs.amount!+5);expect(p['width']*p['height'],lessThanOrEqualTo(1048576));expect(p['width'],1024);expect(p['height'],1024);
        expect(app.history.single.width,3840);expect(app.history.single.height,2160);expect(app.inpaintEditSession,isNotNull);final saved=app.history.single.filePath;expect(await app.restoreInpaintEditSession(),true);expect(app.workbenchImage!.filePath,source.path);expect(app.inpaintRegion,(x:1024,y:512,width:768,height:768));expect(app.history.single.filePath,saved);
        expect(app.params.model,'nai-diffusion-5-full');expect(app.extras.toJson(),original);
      } finally {
        app.dispose();await server.close(force:true);
        // Fixture is intentionally retained in the audit-owned system temp folder.
      }
    });
  }
  }
}

Map<String,dynamic> wire(List<int> bytes,String contentType){
 if(!contentType.startsWith('multipart/'))return jsonDecode(utf8.decode(bytes)) as Map<String,dynamic>;
 final boundary=RegExp(r'boundary="?([^";]+)').firstMatch(contentType)!.group(1)!;
 final fields=<String,String>{};
 for(final piece in latin1.decode(bytes).split('--$boundary')){
  final cut=piece.indexOf('\r\n\r\n');if(cut<0)continue;
  final name=RegExp(r'name="([^"]+)"').firstMatch(piece.substring(0,cut))?.group(1);if(name==null)continue;
  fields[name]=piece.substring(cut+4).replaceFirst(RegExp(r'\r\n$'),'');
 }
 final request=jsonDecode(fields['request']!) as Map<String,dynamic>;request['_partNames']=fields.keys.toList();return request;
}

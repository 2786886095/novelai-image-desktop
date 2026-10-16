// Host real-code and real-loopback boundary regression; not native platform certification.
// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
const syntheticToken='SYNTHETIC_NOT_A_REAL_CREDENTIAL';
class LoopbackClient extends http.BaseClient {
 final Uri base;final http.Client inner=http.Client();LoopbackClient(this.base);
 @override Future<http.StreamedResponse> send(http.BaseRequest request)async{
  if(request.url.host!='image.synthetic.invalid')throw StateError('Unexpected adapter authority');
  final bytes=await request.finalize().toBytes();
  final local=http.Request(request.method,base.replace(path:request.url.path))..headers.addAll(request.headers)..bodyBytes=bytes;
  return inner.send(local);
 }
 @override void close()=>inner.close();
}
Uint8List png(int w,int h,[int red=70])=>Uint8List.fromList(im.encodePng(im.Image(width:w,height:h,numChannels:4)..clear(im.ColorRgba8(red,100,130,255))));
String digest(List<int> bytes)=>sha256.convert(bytes).toString();
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 for(final transport in ['legacy','account-bound']){
  for(final withVibe in [false,true]){
   for(final specimen in ['three-invalid-bytes','empty','truncated-png','valid-png-resize']){
    test('$transport / vibe=$withVibe / $specimen validates before any reference or generation POST',()async{
     HttpOverrides.global=null;final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
     final source=switch(specimen){'three-invalid-bytes'=>Uint8List.fromList([1,2,3]),'empty'=>Uint8List(0),'truncated-png'=>Uint8List.fromList(png(128,64).take(16).toList()),_=>png(128,64)};
     final vibeBytes=png(64,64,120),encodedVibe=Uint8List.fromList([7,8,9,10]);
     final params=GenerateParams(model:'nai-diffusion-4-5-full',width:64,height:64,seed:42,seedMode:'fixed',positivePrompt:'synthetic forest',negativePrompt:'synthetic negative',qualityPreset:'none',ucPreset:0);
     final extras=GenerateExtras(vibeImages:withVibe?[VibeTransferItem(base64:base64Encode(vibeBytes),strength:.6,infoExtracted:.7)]:[]);
     final beforeSource=digest(source),beforeExtras=digest(utf8.encode(jsonEncode(extras.toJson()))),beforeParams=digest(utf8.encode(jsonEncode(params.toJson())));
     final requests=<Map<String,dynamic>>[],serverErrors=<String>[];
     server.listen((r)async{
      try{
       if(!r.connectionInfo!.remoteAddress.isLoopback||r.headers.value('authorization')!='Bearer $syntheticToken'||r.method!='POST')throw StateError('Unsafe fixture request');
       final body=Map<String,dynamic>.from(jsonDecode(await utf8.decoder.bind(r).join())as Map);requests.add({'path':r.uri.path,'body':body});
       if(r.uri.path=='/ai/encode-vibe'){
        final input=base64Decode(body['image']as String),decoded=im.decodeImage(input);
        if(decoded==null||decoded.width!=64||decoded.height!=64||digest(input)!=digest(vibeBytes))throw StateError('Vibe did not contain actual valid reference pixels');
        r.response.headers.contentType=ContentType.binary;r.response.add(encodedVibe);
       }else if(r.uri.path=='/ai/generate-image'){
        r.response.headers.contentType=ContentType('image','png');r.response.add(png(64,64,180));
       }else{throw StateError('Unexpected endpoint ${r.uri.path}');}
       await r.response.close();
      }catch(e){serverErrors.add(e.toString());r.response.statusCode=500;await r.response.close();}
     });
     final base=Uri.parse('http://127.0.0.1:${server.port}');
     final settings=AppSettings(imageBaseUrl:base.toString(),allowCustomEndpoint:true,allowCustomEndpointFallback:false,proxyMode:'direct');
     NaiApi api=NaiApi();
     if(transport=='account-bound'){
      String? document;final accounts=NovelAiAccounts(read:()async=>document,write:(s)async{document=s;});await accounts.load(legacyToken:()async=>null,legacySettings:()async=>AppSettings());
      await accounts.addVerified(label:'synthetic relay',method:'relay',token:syntheticToken,apiBaseUrl:'https://api.synthetic.invalid',imageBaseUrl:'https://image.synthetic.invalid',verify:(_)async=>const AccountSummary(hasToken:true,hasActiveSubscription:false));
      api=NovelAiAccountApi(accounts,clientFactory:(_,__)=>LoopbackClient(base));
     }
     Object? error;List<Uint8List>? results;
     try{final value=await api.img2img(syntheticToken,settings,params,extras,source,I2IParams(strength:.4,noise:.1));results=value.$1;}catch(e){error=e;}
     final encoded=requests.where((r)=>r['path']=='/ai/encode-vibe').toList(),generated=requests.where((r)=>r['path']=='/ai/generate-image').toList();
     final body=generated.isEmpty?null:generated.single['body']as Map<String,dynamic>;
     final wire=body?['parameters']as Map<String,dynamic>?,sentImage=wire==null?null:base64Decode(wire['image']as String);
     print('I2I_PREFLIGHT_OBSERVED:${jsonEncode({'kind':'host-real-loopback-not-native','transport':transport,'withVibe':withVibe,'specimen':specimen,'sourceBytes':source.length,'sourceSha256':beforeSource,'sourceUnchanged':digest(source)==beforeSource,'extrasUnchanged':digest(utf8.encode(jsonEncode(extras.toJson())))==beforeExtras,'paramsUnchanged':digest(utf8.encode(jsonEncode(params.toJson())))==beforeParams,'encodePosts':encoded.length,'generationPosts':generated.length,'paths':requests.map((r)=>r['path']).toList(),'errorType':error?.runtimeType.toString(),'error':error?.toString(),'wireImageBytes':sentImage?.length,'wireWidth':wire?['width'],'wireHeight':wire?['height'],'wireNoise':wire?['noise'],'wireStrength':wire?['strength'],'encodedVibeUsed':wire==null?null:!withVibe||(wire['reference_image_multiple']as List).single==base64Encode(encodedVibe),'serverErrors':serverErrors,'accountBoundAdapterOnlyRedirectsToLoopback':transport=='account-bound'})}');
     expect(serverErrors,isEmpty);expect(digest(source),beforeSource);expect(digest(utf8.encode(jsonEncode(extras.toJson()))),beforeExtras);expect(digest(utf8.encode(jsonEncode(params.toJson()))),beforeParams);
     if(specimen=='valid-png-resize'){
      expect(error,isNull);expect(results,hasLength(1));expect(encoded.length,withVibe?1:0);expect(generated.length,1);
      expect(body!['action'],'img2img');expect(body['model'],'nai-diffusion-4-5-full');expect(im.decodeImage(sentImage!)!.width,64);expect(im.decodeImage(sentImage)!.height,64);expect(wire!['width'],64);expect(wire['height'],64);expect(wire['noise'],0);expect(wire['strength'],.4);
      if(withVibe){expect(requests.map((r)=>r['path']).toList(),['/ai/encode-vibe','/ai/generate-image']);expect(wire['reference_image_multiple'],[base64Encode(encodedVibe)]);expect(wire['reference_strength_multiple'],[.6]);expect(wire['reference_information_extracted_multiple'],[.7]);}
     }else{
      expect(error,isNotNull);if(specimen!='truncated-png')expect(error,isA<FormatException>());
      expect(encoded,isEmpty,reason:'Malformed source must fail before even reference encoding');expect(generated,isEmpty,reason:'Malformed source must not submit generation');expect(results,isNull);
     }
    });
   }
  }
 }
}


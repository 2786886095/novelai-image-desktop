// Host-only regression of the production contract used by native entries.
// These are not Android/iOS acceptance proofs.
// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/inpaint/inpaint_mask.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 testWidgets('native fixture contract: 4K selection uses opaque black/white pixels',(tester)async{
  final strokes=[InpaintStroke(brushCells:16,points:[const Offset(.37,.42),const Offset(.39,.44)])];
  final bytes=(await tester.runAsync(()=>renderInpaintMask(strokes:strokes,width:3840,height:2160,inverted:false)))!;
  final image=im.decodePng(bytes)!;
  List<num> rgba(int x,int y){final p=image.getPixel(x,y);return [p.r,p.g,p.b,p.a];}
  final record={'kind':'host-diagnostic-not-Android-native-proof','width':image.width,'height':image.height,'selected1420_907':rgba(1420,907),'unselected0_0':rgba(0,0),'originalFixtureConjunction':image.width==3840&&image.height==2160&&image.getPixel(1420,907).a>155&&image.getPixel(0,0).a==0};
  expect(record['originalFixtureConjunction'],false);expect(rgba(1420,907),[255,255,255,255]);expect(rgba(0,0),[0,0,0,255]);
  print('HOST_MASK_CONTROL:${jsonEncode(record)}');
 });
 test('native fixture contract: stale I2I noise is ignored on the real loopback wire',()async{
  HttpOverrides.global=null;final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
  final png=Uint8List.fromList(im.encodePng(im.Image(width:64,height:64,numChannels:4)..clear(im.ColorRgba8(70,100,130,255))));
  Map<String,dynamic>? wire;var posts=0;
  server.listen((r)async{expect(r.connectionInfo!.remoteAddress.isLoopback,true);expect(r.headers.value('authorization'),'Bearer SYNTHETIC_ONLY');wire=Map<String,dynamic>.from(jsonDecode(await utf8.decoder.bind(r).join()) as Map);posts++;r.response.headers.contentType=ContentType('image','png');r.response.add(png);await r.response.close();});
  final params=GenerateParams(model:'nai-diffusion-4-5-full',width:64,height:64,positivePrompt:'synthetic forest',negativePrompt:'synthetic negative',qualityPreset:'none',ucPreset:0,seed:42,seedMode:'fixed');
  await NaiApi().img2img('SYNTHETIC_ONLY',AppSettings(imageBaseUrl:'http://127.0.0.1:${server.port}',allowCustomEndpoint:true,allowCustomEndpointFallback:false,proxyMode:'direct'),params,GenerateExtras(),png,I2IParams(strength:.4,noise:.1));
  final p=wire!['parameters'];
  final record={'kind':'host-real-loopback-diagnostic-not-Android-native-proof','posts':posts,'action':wire!['action'],'model':wire!['model'],'strength':p['strength'],'noise':p['noise'],'width':p['width'],'height':p['height'],'originalFixtureConjunction':wire!['action']=='img2img'&&p['strength']==.4&&p['noise']==.1};
  expect(posts,1);expect(record['action'],'img2img');expect(record['strength'],.4);expect(record['noise'],0);expect(record['originalFixtureConjunction'],false);
  print('HOST_I2I_CONTROL:${jsonEncode(record)}');
 });
}

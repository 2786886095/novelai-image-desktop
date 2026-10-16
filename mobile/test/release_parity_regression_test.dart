import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/prompts/reverse_template.dart';
import 'package:novelai_mobile/images/image_processing.dart';

void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 test('focused 4K request preserves output canvas rather than resizing whole image',(){
  final src=Uint8List.fromList(im.encodePng(im.Image(width:3840,height:2160,numChannels:4)..clear(im.ColorRgba8(30,40,50,255))));
  final mask=Uint8List.fromList(im.encodePng(im.Image(width:3840,height:2160,numChannels:4)..clear(im.ColorRgba8(255,255,255,255))));
  final p=Function.apply(prepareInpaintAssets,[src,mask],{#region:(x:1024,y:512,width:768,height:768)}) as PreparedInpaintAssets;
  expect(p.width*p.height,lessThanOrEqualTo(1048576));expect(p.width%64,0);expect(p.height%64,0);
  final generated=Uint8List.fromList(im.encodePng(im.Image(width:p.width,height:p.height,numChannels:4)..clear(im.ColorRgba8(230,0,0,255))));
  final out=im.decodePng(compositeInpaintResult(generated,p))!;
  expect((out.width,out.height),(3840,2160));expect(out.getPixel(0,0).r,30);expect(out.getPixel(1400,900).r,greaterThan(200));
 });
 const protocol=ReverseTemplateProtocol(1,3,false,true,tagOnly:true);
 final doc=jsonEncode({'segments':[{'units':[{'kind':'tag','text':'Text: "Sorry, Mom"'}]}]});
 test('strict complete JSON marker does not change literal punctuation',()=>expect(protocol.parse('json $doc').prompt,'Text: "Sorry, Mom"'));
 test('unmatched JSON fence is rejected',()=>expect(()=>protocol.parse('```json\n$doc'),throwsFormatException));
 final cases=<({String name,dynamic message,String finish,bool ok})>[
  (name:'short refusal',message:{'content':"I'm sorry, but I can't assist with this request."},finish:'stop',ok:false),
  (name:'refusal with explanation',message:{'content':"I'm sorry, but I can't assist with this request. I can describe non-sensitive elements instead."},finish:'stop',ok:false),
  (name:'typed refusal beats length',message:{'content':'', 'refusal':'PRIVATE_PAYLOAD'},finish:'length',ok:false),
  (name:'filter nonempty',message:{'content':'A woman stands beside the window.'},finish:'content_filter',ok:false),
  (name:'quoted scene text',message:{'content':'A woman holds a sign reading "I cannot assist with this request.".'},finish:'stop',ok:true),
  (name:'cannot help but notice',message:{'content':"I can't help but notice a blue coat in the image."},finish:'stop',ok:true),
  (name:'text content parts',message:{'content':[{'type':'text','text':'A woman '},{'type':'output_text','text':'stands beside a window.'}]},finish:'stop',ok:true),
 ];
 for(final c in cases){test('real loopback reverse response: ${c.name}',()async{
  HttpOverrides.global=null;final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));var count=0;
  server.listen((r)async{count++;final body=jsonDecode(await utf8.decoder.bind(r).join());expect(body.containsKey('response_format'),false);r.response.headers.contentType=ContentType.json;r.response.write(jsonEncode({'choices':[{'message':c.message,'finish_reason':c.finish}]}));await r.response.close();});
  final settings=AppSettings(proxyMode:'direct',visionApiUrl:'http://127.0.0.1:${server.port}',visionApiModel:'fixture',reversePromptTemplates:{'natural':'Neutral natural caption'},reverseConvertDshEnabled:false,promptCodexEnhanceEnabled:false,promptRuleAutoRepairEnabled:false);
  final result=await NaiApi().reversePrompt(settings:settings,apiKey:'FIXTURE_ONLY',image:Uint8List.fromList([1,2,3]),mode:ReversePromptMode.natural,scope:ReversePromptScope.full,hint:'',knownCharacter:false,systemTemplate:'Neutral natural caption');
  expect(result.ok,c.ok);expect(count,1);expect(result.message, isNot(contains('PRIVATE_PAYLOAD')));
  if(c.name=='text content parts')expect(result.text,'A woman stands beside a window.');
 });}
}

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/services/openai_image_edit.dart';
import 'package:novelai_mobile/services/openai_images.dart';

Uint8List png(int r,int g,int b,{bool mask=false}) {
  final a=im.Image(width:32,height:32,numChannels:4);
  for(final p in a){p..r=r..g=g..b=b..a=255;}
  if(mask){for(var y=12;y<20;y++){for(var x=12;x<20;x++){a.setPixelRgba(x,y,255,255,255,255);}}}
  return im.encodePng(a);
}
void main() {
  test('endpoint normalization and HTTPS policy match desktop',(){
    for(final suffix in ['','/images/generations','/images/edits','/images/edits/']) {
      expect(imageEditEndpoint('https://example.com/v1$suffix').toString(),'https://example.com/v1/images/edits');
    }
    for(final url in ['http://example.com/v1','https://secret@example.com/v1','https://example.com/v1?q=token']) {
      expect(()=>imageEditEndpoint(url),throwsFormatException);
    }
    expect(planEditCanvas(832,1216,'fit').size,'1024x1536');
  });
  for(final status in [200,401,422,500,307]) {
    test('one multipart edit request, status $status, no retry',() async {
      final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);var calls=0;String requestBody='';
      final generated=png(0,0,200);
      server.listen((r) async {
        calls++;expect(r.method,'POST');expect(r.uri.path,'/v1/images/edits');
        expect(r.headers.value('authorization'),'Bearer fixture-key');
        expect(r.headers.contentType?.mimeType,'multipart/form-data');
        requestBody=latin1.decode(await r.fold<List<int>>([], (a,b)=>a..addAll(b)));
        r.response.statusCode=status;r.response.headers.contentType=ContentType.json;
        if(status==307)r.response.headers.set('location','/should-not-follow');
        r.response.write(jsonEncode({'data':[{'b64_json':base64Encode(generated)}]}));await r.response.close();
      });
      try {
        final out=await runOpenAIImageEdit(OpenAIEditConfig(baseUrl:'http://127.0.0.1:${server.port}/v1',size:'auto'),
          apiKey:'fixture-key',source:png(200,0,0),mask:png(0,0,0,mask:true),prompt:'paint selected area blue');
        expect(calls,1);expect(out.batch.submitted,isTrue);expect(out.batch.complete,status==200);
        expect(requestBody,contains('name="mask"'));expect(requestBody,contains('name="image"'));
        expect(requestBody,isNot(contains('input_fidelity')));expect(requestBody,isNot(contains('name="quality"')));
        expect(jsonEncode(out.request),isNot(contains('fixture-key')));
        if(status==200) {
          final result=im.decodePng(out.images.single)!;expect((result.width,result.height),(32,32));
          final original=im.decodePng(png(200,0,0))!;
          for(final point in [(0,0),(31,31),(0,31),(31,0)]) {
            expect(result.getPixel(point.$1,point.$2).toList(),original.getPixel(point.$1,point.$2).toList());
          }
          expect(result.getPixel(16,16).b,greaterThan(100));
        } else {expect(out.images,isEmpty);expect(out.batch.error?.status,status);}
      } finally {await server.close(force:true);}
    });
  }
  test('empty mask and pre-cancellation never submit',() async {
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);var calls=0;
    server.listen((r){calls++;r.response.close();});
    try {
      final config=OpenAIEditConfig(baseUrl:'http://127.0.0.1:${server.port}/v1',size:'auto');
      final empty=await runOpenAIImageEdit(config,apiKey:'fixture-key',source:png(1,2,3),mask:png(0,0,0),prompt:'blue');
      expect(empty.batch.submitted,isFalse);expect(empty.batch.complete,isFalse);
      final cancel=CompatibleImageCancellation()..cancel();
      final stopped=await runOpenAIImageEdit(config,apiKey:'fixture-key',source:png(1,2,3),mask:png(0,0,0,mask:true),prompt:'blue',cancellation:cancel);
      expect(stopped.batch.submitted,isFalse);expect(stopped.batch.cancelled,isTrue);expect(calls,0);
    } finally {await server.close(force:true);}
  });
  test('URL download never receives provider credential',() async {
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);var posts=0,gets=0;
    server.listen((r) async {
      if(r.method=='POST'){posts++;await r.drain<void>();r.response.write(jsonEncode({'data':[{'url':'http://127.0.0.1:${server.port}/image'}]}));}
      else {gets++;expect(r.headers.value('authorization'),isNull);r.response.add(png(0,200,0));}
      await r.response.close();
    });
    try {
      final out=await runOpenAIImageEdit(OpenAIEditConfig(baseUrl:'http://127.0.0.1:${server.port}/v1',size:'auto'),
        apiKey:'fixture-key',source:png(1,2,3),mask:png(0,0,0,mask:true),prompt:'green');
      expect(out.batch.complete,isTrue);expect((posts,gets),(1,1));
    } finally {await server.close(force:true);}
  });
  test('configuration lifecycle invalidation prevents POST',() async {
    var submitted=false;
    final out=await runOpenAIImageEdit(const OpenAIEditConfig(baseUrl:'http://127.0.0.1:9/v1',size:'auto'),
      apiKey:'fixture-key',source:png(1,2,3),mask:png(0,0,0,mask:true),prompt:'green',beforeSubmit:(){
        submitted=true;throw StateError('context changed');
      });
    expect(submitted,isTrue);expect(out.batch.submitted,isFalse);expect(out.batch.complete,isFalse);
  });
}

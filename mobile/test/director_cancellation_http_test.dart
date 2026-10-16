import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/generation_scope.dart';
import 'package:novelai_mobile/services/nai_api.dart';

void main(){
 TestWidgetsFlutterBinding.ensureInitialized();HttpOverrides.global=null;
 test('director request-owned scope closes real in-flight HTTP without response release',()async{
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0),entered=Completer<void>(),release=Completer<void>();
  final png=im.encodePng(im.Image(width:64,height:64));var calls=0;
  server.listen((r)async{try{await utf8.decoder.bind(r).join();calls++;entered.complete();await release.future;r.response.headers.contentType=ContentType('application','zip');r.response.add(ZipEncoder().encode(Archive()..addFile(ArchiveFile('0.png',png.length,png))));await r.response.close();}catch(_){}});
  final scope=GenerationScope(),api=NaiApi(),settings=AppSettings(proxyMode:'direct',allowCustomEndpoint:true,imageBaseUrl:'http://127.0.0.1:${server.port}');
  final pending=scope.run(()=>api.augment('synthetic',settings,png,64,64,'colorize',AugmentOptions()));
  // Observe errors immediately so cancellation cannot become unhandled.
  final captured=pending.then<Object>((v)=>v,onError:(Object e)=>e);
  try{await entered.future.timeout(const Duration(seconds:5));scope.cancel();final outcome=await captured.timeout(const Duration(seconds:1));expect(outcome,anyOf(isA<Exception>(),isA<StateError>()));expect(calls,1);}
  finally{if(!release.isCompleted)release.complete();await captured;await server.close(force:true);}
 });
 test('cancelled scoped director cannot send a transport retry',()async{
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0),entered=Completer<void>();var calls=0;
  server.listen((r)async{await utf8.decoder.bind(r).join();calls++;r.response.statusCode=429;r.response.headers.set('retry-after','1');r.response.write('retry');await r.response.close();if(!entered.isCompleted)entered.complete();});
  final scope=GenerationScope(),api=NaiApi(),settings=AppSettings(proxyMode:'direct',allowCustomEndpoint:true,imageBaseUrl:'http://127.0.0.1:${server.port}'),png=im.encodePng(im.Image(width:64,height:64));
  final captured=scope.run(()=>api.augment('synthetic',settings,png,64,64,'colorize',AugmentOptions())).then<Object>((v)=>v,onError:(Object e)=>e);
  try{await entered.future;scope.cancel();expect(await captured.timeout(const Duration(seconds:3)),anyOf(isA<Exception>(),isA<StateError>()));expect(calls,1);}
  finally{await server.close(force:true);}
 });
}

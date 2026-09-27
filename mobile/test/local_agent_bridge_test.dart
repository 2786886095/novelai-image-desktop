import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/agent_models.dart';

void main(){
  late Directory dir;late LocalAgentBridge bridge;late HttpClient client;
  Future<(int,Map<String,dynamic>)> call(String id,{String? token,String? origin,String tool='langbai_generate_image'})async{
    final request=await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
    request.headers.set('Authorization','Bearer ${token??bridge.token}');
    if(origin!=null)request.headers.set('Origin',origin);
    request.write(jsonEncode({'sessionId':'test-session','callId':id,'tool':tool,'args':<String,dynamic>{}}));
    final response=await request.close();return (response.statusCode,jsonDecode(await utf8.decoder.bind(response).join()) as Map<String,dynamic>);
  }
  setUp(()async{dir=await Directory.systemTemp.createTemp('local-agent-test');client=HttpClient();});
  tearDown(()async{await bridge.close();client.close(force:true);await dir.delete(recursive:true);});
  test('requires bearer and rejects browser Origin',()async{
    var count=0;bridge=LocalAgentBridge(journal:dir,approve:(_,__)async=>true,execute:(_,__)async{count++;return const AgentToolResult(ok:true,title:'ok',output:'done');});await bridge.start();
    expect((await call('a',token:'wrong')).$1,403);expect((await call('b',origin:'https://untrusted.example')).$1,403);expect(count,0);
  });
  test('explicit denial never executes; durable denial is not replayed',()async{
    var count=0;bridge=LocalAgentBridge(journal:dir,approve:(_,__)async=>false,execute:(_,__)async{count++;return const AgentToolResult(ok:true,title:'ok',output:'done');});await bridge.start();
    expect((await call('denied')).$2['ok'],false);await call('denied');expect(count,0);
  });
  test('concurrent duplicate mutation executes once and caches result',()async{
    final permission=Completer<bool>();var count=0;
    bridge=LocalAgentBridge(journal:dir,approve:(_,__)=>permission.future,execute:(_,__)async{count++;return const AgentToolResult(ok:true,title:'ok',output:'saved');});await bridge.start();
    final first=call('same');await Future<void>.delayed(const Duration(milliseconds:40));
    expect((await call('same')).$1,409);permission.complete(true);expect((await first).$2['ok'],true);
    expect((await call('same')).$2['output'],'saved');expect(count,1);
  });
  test('unknown result stays pending across a bridge restart',()async{
    var count=0;bridge=LocalAgentBridge(journal:dir,approve:(_,__)async=>true,execute:(_,__)async{count++;throw StateError('request outcome unknown');});await bridge.start();
    expect((await call('uncertain')).$1,500);await bridge.close();
    bridge=LocalAgentBridge(journal:dir,approve:(_,__)async=>true,execute:(_,__)async{count++;return const AgentToolResult(ok:true,title:'ok',output:'retry');});await bridge.start();
    expect((await call('uncertain')).$1,409);expect(count,1);
  });
}

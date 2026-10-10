import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/external_mcp_server.dart';
import 'package:novelai_mobile/agent/mobile_mcp_tools.dart';

void main() {
  test('MCP offers all 14 desktop tools with bounded schemas',(){
    expect(mobileMcpSchemas().map((s)=>s['name']).toSet(),{
      'get_state','generate_image','img2img','inpaint','upscale','director_tool','estimate_cost',
      'list_history','read_image_metadata','view_image','import_image','make_mask','search_tags','apply_to_workbench'});
    expect(mcpSchemaMatches({'type':'object','properties':{},'additionalProperties':false},{'token':'inject'}),isFalse);
  });
  test('real loopback JSON-RPC auth, initialize, read, approval, durable duplicate and changed ID',() async {
    final directory=await Directory.systemTemp.createTemp('mcp-port-');var writes=0,reads=0;
    final server=ExternalMcpServer(journal:directory,version:'fixture',tools:[for(final name in ['read','write']){
      'name':name,'inputSchema':{'type':'object','properties':{'value':{'type':'integer','minimum':0,'maximum':9}},'additionalProperties':false}}],
      prepare:(name,args) async=>McpOperation(mutating:name=='write',summary:args,execute:() async {
        if(name=='write') {
          writes++;
        } else {
          reads++;
        }
        return {'content':[{'type':'text','text':jsonEncode(args)}]};}));
    await server.start();final client=HttpClient();String? session;
    Future<({int status,Map<String,dynamic>? body})> send(Object body,{String? token,bool origin=false}) async {
      final req=await client.postUrl(Uri.parse(server.url));req.headers.contentType=ContentType.json;
      req.headers.set('Authorization','Bearer ${token??server.token}');if(session!=null)req.headers.set('Mcp-Session-Id',session!);
      if(origin)req.headers.set('Origin','https://untrusted.example');req.write(jsonEncode(body));
      final response=await req.close();session=response.headers.value('mcp-session-id')??session;
      final data=await utf8.decoder.bind(response).join();return (status:response.statusCode,body:data.isEmpty?null:jsonDecode(data) as Map<String,dynamic>);
    }
    Map<String,Object> call(String name,int id,[int value=1])=>{'jsonrpc':'2.0','id':id,'method':'tools/call','params':{'name':name,'arguments':{'value':value}}};
    try {
      expect((await send(call('write',1),token:'wrong')).status,403);expect(writes,0);
      expect((await send(call('write',1),origin:true)).status,403);
      final init=await send({'jsonrpc':'2.0','id':0,'method':'initialize','params':{'protocolVersion':'2025-11-25'}});
      expect(init.body!['result']['protocolVersion'],'2025-11-25');expect(session,isNotNull);
      expect((await send(call('read',2))).body!['result']['isError'],isNull);expect(reads,1);
      final pending=send(call('write',3));
      while(server.approvals.isEmpty){await Future<void>.delayed(const Duration(milliseconds:10));}
      expect(writes,0);final request=server.approvals.single;
      // Only the host UI owns decide; no MCP method can resolve it.
      server.decide(request['session'],request['id'],true);expect((await pending).body!['result']['isError'],isNull);expect(writes,1);
      expect((await send(call('write',3))).body!['result']['isError'],isNull);expect(writes,1);
      expect((await send(call('write',3,2))).body!['result']['isError'],isTrue);expect(writes,1);
      final denied=send(call('write',4));while(server.approvals.isEmpty){await Future<void>.delayed(const Duration(milliseconds:10));}
      final decision=server.approvals.single;server.decide(decision['session'],decision['id'],false);
      expect((await denied).body!['result']['isError'],isTrue);expect(writes,1);
      expect((await send(call('write',5,99))).body!['error']['code'],-32602);expect(writes,1);
    } finally {client.close(force:true);await server.close();await directory.delete(recursive:true);}
  });
}

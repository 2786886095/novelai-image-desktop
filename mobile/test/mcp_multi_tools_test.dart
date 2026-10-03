import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:novelai_mobile/services/mcp_tag_client.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/models/nai_models.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = null;
  test('actual public client discovers pages, calls three slots and preserves a successful slot if another fails',()async{
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0),requests=<Map>[];final client=http.Client();addTearDown(()async{client.close();await server.close(force:true);});
    final tools=[{'name':'search_tags','inputSchema':{'type':'object','properties':{'query':{'type':'string'}}}},{'name':'get_related_tags','inputSchema':{'type':'object','properties':{'tags':{'type':'array','items':{'type':'string'}}},'required':['tags']}},{'name':'get_artist_recommendations','inputSchema':{'type':'object','properties':{'description':{'type':'string'}}}}];
    server.listen((request)async{final body=jsonDecode(await utf8.decoder.bind(request).join()) as Map;requests.add(body);if(body['id']==null){request.response.statusCode=202;await request.response.close();return;}Object result=body['method']=='initialize'?{'protocolVersion':'2024-11-05','capabilities':{}}:body['method']=='tools/list'?{'tools':(body['params'] as Map?)?['cursor']==null?tools.take(1).toList():tools.skip(1).toList(),if((body['params'] as Map?)?['cursor']==null)'nextCursor':'next'}:{if((body['params'] as Map?)?['name']=='get_related_tags')'isError':true,'content':[{'type':'text','text':jsonEncode({'tags':[{'tag':(body['params'] as Map)['name']} ]})}]};request.response.headers.contentType=ContentType.json;if(body['id']==null){request.response.statusCode=202;}else{request.response.write(jsonEncode({'jsonrpc':'2.0','id':body['id'],'result':result}));}await request.response.close();});
    final endpoint='http://127.0.0.1:${server.port}/mcp';final found=await listMcpTagTools(client:client,endpoint:endpoint,transport:'http',apiKey:'');expect(found.map((t)=>t['name']),tools.map((t)=>t['name']));expect(requests.where((r)=>r['method']=='tools/call'),isEmpty);
    final settings=AppSettings(proxyMode:'direct',tagServerEnabled:true,tagServerUrl:endpoint,tagServerType:'http',tagServerTool:'search_tags',tagServerRelatedTool:'get_related_tags',tagServerArtistTool:'get_artist_recommendations');final tags=await NaiApi().searchTags(settings,'rain, blue eyes',12,fallbackLocal:false);expect(tags.map((t)=>t.tag),['search_tags','get_artist_recommendations']);expect(requests.where((r)=>r['method']=='tools/call').map((r)=>(r['params'] as Map)['name']),tools.map((t)=>t['name']));expect(AppSettings.fromJson(settings.toJson()).tagServerArtistTool,'get_artist_recommendations');
  });
  for (final missing in [false, true]) {
    test('selected tool schema / missing tool: $missing', () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final requests = <Map>[];
      final client = http.Client();
      addTearDown(() async { client.close(); await server.close(force: true); });
      server.listen((request) async {
        final body = jsonDecode(await utf8.decoder.bind(request).join()) as Map;
        requests.add(body);
        final result = body['method'] == 'initialize'
            ? {'protocolVersion': '2024-11-05', 'capabilities': <String, dynamic>{}}
            : body['method'] == 'tools/list'
                ? {'tools': [
                    {'name': 'search_tags', 'inputSchema': {'type':'object','properties': {'query': {'type': 'string'}}}},
                    {'name': 'get_related_tags', 'inputSchema': {'type':'object','properties': {'tags': {'type': 'array', 'items': {'type': 'string'}}, 'limit': {'type': 'integer'}},'required':['tags']}}
                  ]}
                : {'content': [{'type': 'text', 'text': 'rain'}]};
        request.response.headers.contentType = ContentType.json;
        if(body['id'] == null) {request.response.statusCode = 202;}
        else {request.response.write(jsonEncode({'jsonrpc': '2.0', 'id': body['id'], 'result': result}));}
        await request.response.close();
      });
      final operation = callMcpTagSearch(client: client, endpoint: 'http://127.0.0.1:${server.port}/mcp', transport: 'http', apiKey: '', preferredTool: missing ? 'missing_tool' : 'get_related_tags', query: 'rain, blue eyes', limit: 7);
      if (missing) { await expectLater(operation, throwsStateError); expect(requests.where((r) => r['method'] == 'tools/call'), isEmpty); }
      else { await operation; expect(requests.last['params'], {'name': 'get_related_tags', 'arguments': {'tags': ['rain', 'blue eyes'], 'limit': 7}}); }
    });
  }
}

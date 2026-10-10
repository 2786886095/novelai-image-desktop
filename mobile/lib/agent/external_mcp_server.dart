import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'operation_approval.dart';

class McpOperation {
  final Map<String,dynamic> summary;
  final Future<Map<String,dynamic>> Function() execute;
  final bool mutating;
  McpOperation({required this.summary,required this.execute,required this.mutating});
}
/// Streamable HTTP JSON-RPC, loopback only, disabled until the human starts it.
/// Mutation identity is durably journaled before approval. MCP clients cannot approve their own calls.
class ExternalMcpServer extends ChangeNotifier {
  final Directory journal;
  final List<Map<String,dynamic>> tools;
  final Future<McpOperation> Function(String,Map<String,dynamic>) prepare;
  final String version;
  final token=List.generate(32,(_)=>Random.secure().nextInt(256).toRadixString(16).padLeft(2,'0')).join();
  final _approvals=AgentOperationApprovals();
  final _sessions=<String>{},_pending=<String>{},_handlers=<Future<void>>{};
  final _approvalSessions=<String>{};
  HttpServer? _server;bool _closed=false,_mutation=false;
  ExternalMcpServer({required this.journal,required this.tools,required this.prepare,required this.version});
  String get url=>'http://127.0.0.1:${_server!.port}/mcp';
  List<Map<String,dynamic>> get approvals=>[for(final s in _approvalSessions)if(_approvals.read(s)!=null){..._approvals.read(s)!,'session':s}];
  void decide(String session,String id,bool approved){_approvals.resolve(session,id,approved);notifyListeners();}
  Future<void> start() async {
    if(_closed || _server!=null)throw StateError('MCP server already started or closed');
    await journal.create(recursive:true);
    _server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);
    _server!.listen((r){late Future<void> task;task=_handle(r).whenComplete(()=>_handlers.remove(task));_handlers.add(task);});
  }
  bool _auth(String? value) {
    final expected='Bearer $token';if(value==null || value.length!=expected.length)return false;
    var diff=0;for(var i=0;i<expected.length;i++){diff|=expected.codeUnitAt(i)^value.codeUnitAt(i);}return diff==0;
  }
  Future<void> _reply(HttpRequest r,int status,Object? body,{String? session}) async {
    r.response.statusCode=status;r.response.headers.contentType=ContentType.json;
    r.response.headers.set('Cache-Control','no-store');if(session!=null)r.response.headers.set('Mcp-Session-Id',session);
    if(body!=null)r.response.write(jsonEncode(body));await r.response.close();
  }
  Map<String,dynamic> _error(Object? id,int code,String message)=>{'jsonrpc':'2.0','id':id,'error':{'code':code,'message':message}};
  Map<String,dynamic> _result(Object? id,Object? value)=>{'jsonrpc':'2.0','id':id,'result':value};
  Future<void> _handle(HttpRequest r) async {
    Object? id;
    try {
      final host=r.headers.value('host');
      if(_closed || r.headers.value('origin')!=null || !_auth(r.headers.value('authorization')) ||
        !['127.0.0.1:${_server?.port}','localhost:${_server?.port}'].contains(host)) {
        await _reply(r,403,{'error':'Unauthorized local MCP request'});return;
      }
      if(r.uri.path!='/mcp' || r.uri.hasQuery){await _reply(r,404,{'error':'MCP endpoint is /mcp'});return;}
      if(r.method!='POST'){await _reply(r,405,{'error':'Use JSON-RPC POST'});return;}
      if(r.headers.contentType?.mimeType!='application/json'){await _reply(r,415,{'error':'JSON required'});return;}
      final bytes=<int>[];
      await for(final chunk in r.timeout(const Duration(seconds:10))) {
        if(bytes.length+chunk.length>4*1024*1024){await _reply(r,413,{'error':'Request too large'});return;}bytes.addAll(chunk);
      }
      final raw=jsonDecode(utf8.decode(bytes));
      if(raw is! Map<String,dynamic> || raw['jsonrpc']!='2.0' || raw['method'] is! String) {
        await _reply(r,200,_error(null,-32600,'Invalid JSON-RPC request'));return;
      }
      id=raw['id'];if(id!=null && id is! String && id is! num){await _reply(r,200,_error(null,-32600,'Invalid ID'));return;}
      final method=raw['method'] as String;
      var session=r.headers.value('mcp-session-id');
      if(method=='initialize') {
        if(id==null || _sessions.length>=32){await _reply(r,429,{'error':'Session limit'});return;}
        final protocol=(raw['params'] as Map?)?['protocolVersion'];
        session=List.generate(24,(_)=>Random.secure().nextInt(256).toRadixString(16).padLeft(2,'0')).join();_sessions.add(session);
        await _reply(r,200,_result(id,{'protocolVersion':['2025-11-25','2025-06-18','2025-03-26','2024-11-05'].contains(protocol)?protocol:'2025-11-25',
          'capabilities':{'tools':{'listChanged':false}},'serverInfo':{'name':'langbai-novelai-studio','version':version}}),session:session);return;
      }
      if(session==null || !_sessions.contains(session)){await _reply(r,404,{'error':'Initialize a session first'});return;}
      if(method.startsWith('notifications/')) {
        if(method=='notifications/cancelled') {
          final cancelled=(raw['params'] as Map?)?['requestId'];
          final callKey=sha256.convert(utf8.encode(jsonEncode([session,cancelled]))).toString();
          final approvalSession='mcp-$callKey',data=_approvals.read('mcp-$callKey');
          if(data!=null)_approvals.resolve(approvalSession,data['id'] as String,false);
        }
        await _reply(r,202,null);return;
      }
      if(id==null){await _reply(r,200,_error(null,-32600,'Request ID required'));return;}
      Object? result;
      switch(method) {
        case 'ping': result={};
        case 'tools/list':result={'tools':tools};
        case 'resources/list':result={'resources':[]};
        case 'resources/templates/list':result={'resourceTemplates':[]};
        case 'prompts/list':result={'prompts':[]};
        case 'logging/setLevel':result={};
        case 'tools/call':
          final params=raw['params'];
          if(params is! Map || params['name'] is! String || (params['arguments']??{}) is! Map<String,dynamic>) {
            await _reply(r,200,_error(id,-32602,'Invalid tool arguments'));return;
          }
          final name=params['name'] as String,args=jsonDecode(jsonEncode(params['arguments']??{})) as Map<String,dynamic>;
          final matches=tools.where((t)=>t['name']==name);
          if(matches.isEmpty || !mcpSchemaMatches(matches.first['inputSchema'] as Map<String,dynamic>,args)) {
            await _reply(r,200,_error(id,-32602,'Unknown tool or invalid arguments'));return;
          }
          result=await _call(session,id,name,args);
        default:await _reply(r,200,_error(id,-32601,'Method not found'));return;
      }
      await _reply(r,200,_result(id,result));
    } catch (_) {try {await _reply(r,200,_error(id,-32603,'Request failed. Inspect history before retrying.'));}catch (_) {}}
  }
  Future<Map<String,dynamic>> _call(String session,Object id,String name,Map<String,dynamic> args) async {
    final key=sha256.convert(utf8.encode(jsonEncode([session,id]))).toString();
    final digest=sha256.convert(utf8.encode(jsonEncode([name,args]))).toString(),file=File('${journal.path}/$key.json');
    Map<String,dynamic> fail(String message)=>{'isError':true,'content':[{'type':'text','text':message}]};
    if(_pending.contains(key))return fail('Call already pending; do not resubmit');
    _pending.add(key);var locked=false;
    try {
      if(await file.exists()) {
        final prior=jsonDecode(await file.readAsString());
        if(prior['digest']==digest && prior['result'] is Map<String,dynamic>)return prior['result'];
        return fail('Call already ran or outcome unknown. No replay.');
      }
      final operation=await prepare(name,args);
      if(operation.mutating) {
        if(_mutation)return fail('Another mutation is running');_mutation=true;locked=true;
        await file.writeAsString(jsonEncode({'digest':digest,'state':'pending'}),flush:true);
        final approvalSession='mcp-$key';_approvalSessions.add(approvalSession);
        final answer=_approvals.wait(approvalSession,name,operation.summary);notifyListeners();
        final approved=await answer;_approvalSessions.remove(approvalSession);notifyListeners();
        if(!approved || _closed) {
          final result=fail('Not approved in Studio. No action performed.');
          await file.writeAsString(jsonEncode({'digest':digest,'result':result}),flush:true);return result;
        }
      }
      if(_closed)return fail('MCP server stopped');
      final result=await operation.execute();
      if(utf8.encode(jsonEncode(result)).length>12*1024*1024)throw StateError('Tool output too large');
      if(operation.mutating)await file.writeAsString(jsonEncode({'digest':digest,'result':result}),flush:true);
      return result;
    } catch (_) {return fail('Tool failed or outcome unknown. Inspect Studio history. No automatic replay.');}
    finally {_pending.remove(key);if(locked)_mutation=false;}
  }
  Future<void> close() async {
    _closed=true;_approvals.close();await _server?.close(force:true);_server=null;
    await Future.wait(_handlers.toList()).timeout(const Duration(seconds:30),onTimeout:()=>[]);
  }
}
bool mcpSchemaMatches(Map<String,dynamic> schema,Object? value) {
  if(schema['enum'] is List && !(schema['enum'] as List).contains(value))return false;
  switch(schema['type']) {
    case 'object':
      if(value is! Map<String,dynamic>)return false;
      final props=schema['properties'] as Map? ?? {};
      if((schema['required'] as List? ?? []).any((k)=>!value.containsKey(k)))return false;
      if(schema['additionalProperties']==false && value.keys.any((k)=>!props.containsKey(k)))return false;
      return value.entries.every((e)=>!props.containsKey(e.key)||mcpSchemaMatches(Map<String,dynamic>.from(props[e.key] as Map),e.value));
    case 'string':return value is String && value.length<=(schema['maxLength'] as int? ?? 32000);
    case 'boolean':return value is bool;
    case 'integer':case 'number':return value is num && value.isFinite &&
      (schema['type']!='integer'||value==value.truncateToDouble()) && value>=(schema['minimum'] as num? ?? -9007199254740991) && value<=(schema['maximum'] as num? ?? 9007199254740991);
    case 'array':return value is List && value.length>=(schema['minItems'] as int? ?? 0) && value.length<=(schema['maxItems'] as int? ?? 32) && value.every((v)=>mcpSchemaMatches(Map<String,dynamic>.from(schema['items'] as Map? ?? {}),v));
    default:return true;
  }
}

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'agent_models.dart';
import 'agent_tools.dart';

typedef LocalToolExecutor = Future<AgentToolResult> Function(String tool, Map<String, dynamic> args);
typedef LocalToolApproval = Future<bool> Function(String tool, Map<String, dynamic> args);

/// Loopback only, secret held in memory. Mutations require an explicit decision
/// and durable call identity; interrupted/ambiguous requests are never replayed.
class LocalAgentBridge {
  final Directory journal;
  final LocalToolExecutor execute;
  final LocalToolApproval approve;
  final String token = List.generate(32, (_) => Random.secure().nextInt(256))
      .map((n) => n.toRadixString(16).padLeft(2, '0')).join();
  HttpServer? _server;
  bool _mutation = false;
  bool _closed = false;
  final Set<String> _pending = {};
  LocalAgentBridge({required this.journal, required this.execute, required this.approve});
  String get url => 'http://127.0.0.1:${_server!.port}';
  Future<void> start() async {
    await journal.create(recursive: true);
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server!.listen(_handle);
  }
  bool _authenticated(String? supplied) {
    final expected='Bearer $token';
    if(supplied == null || supplied.length != expected.length) return false;
    var difference=0;for(var i=0;i<expected.length;i++){difference |= supplied.codeUnitAt(i)^expected.codeUnitAt(i);}
    return difference==0;
  }
  Future<void> _reply(HttpRequest request, int status, Map<String,dynamic> body) async {
    request.response.statusCode=status;
    request.response.headers.contentType=ContentType.json;
    request.response.headers.set('Cache-Control','no-store');
    request.response.write(jsonEncode(body));
    await request.response.close();
  }
  Future<void> _handle(HttpRequest request) async {
    try {
      if(_closed || request.method!='POST' || request.uri.path!='/v1/tool' ||
          request.headers.value('Origin')!=null || !_authenticated(request.headers.value('Authorization'))) {
        await _reply(request,403,{'ok':false,'error':'Unauthorized local bridge request'});return;
      }
      final bytes=<int>[];
      await for(final chunk in request.timeout(const Duration(seconds:10))){
        bytes.addAll(chunk);if(bytes.length>128*1024){await _reply(request,413,{'ok':false});return;}
      }
      final payload=jsonDecode(utf8.decode(bytes));
      if(payload is! Map<String,dynamic> || payload['tool'] is! String || payload['args'] is! Map<String,dynamic>) {
        await _reply(request,400,{'ok':false,'error':'Invalid tool request'});return;
      }
      final tool=payload['tool'] as String,args=payload['args'] as Map<String,dynamic>;
      if(!agentReadTools.contains(tool) && !agentMutatingTools.contains(tool)){
        await _reply(request,400,{'ok':false,'error':'This Studio operation is not supported on Android'});return;
      }
      final identity=RegExp(r'^[a-zA-Z0-9_.:-]{1,160}$');
      final session=payload['sessionId'],call=payload['callId'];
      if(session is! String || call is! String || !identity.hasMatch(session) || !identity.hasMatch(call)){
        await _reply(request,400,{'ok':false,'error':'Stable call identity required'});return;
      }
      final key=sha256.convert(utf8.encode('$session\n$call')).toString();
      final digest=sha256.convert(utf8.encode(jsonEncode({'tool':tool,'args':args}))).toString();
      final file=File('${journal.path}/$key.json');
      final mutating=agentMutatingTools.contains(tool);
      if(_pending.contains(key) || (mutating && _mutation)) {
        await _reply(request,409,{'ok':false,'error':'A tool request is already pending. Do not resubmit.'});return;
      }
      _pending.add(key);if(mutating)_mutation=true;
      try {
      if(mutating && await file.exists()){
        final prior=jsonDecode(await file.readAsString()) as Map<String,dynamic>;
        if(prior['digest']==digest && prior['result'] is Map<String,dynamic>){await _reply(request,200,prior['result']);return;}
        await _reply(request,409,{'ok':false,'error':'This call already ran or has an unknown outcome; inspect history. No replay.'});return;
      }
        if(mutating){
          // Save before approval/execution; disconnect/crash never authorizes retry.
          await file.writeAsString(jsonEncode({'digest':digest,'state':'pending'}),flush:true);
          if(!await approve(tool,args).timeout(const Duration(minutes:2),onTimeout:()=>false) || _closed){
            final result={'ok':false,'error':'Not approved in Studio. No action performed.'};
            await file.writeAsString(jsonEncode({'digest':digest,'result':result}),flush:true);
            await _reply(request,200,result);return;
          }
        }
        if(_closed)throw StateError('Agent stopped before execution');
        final output=await execute(tool,args);
        final result=<String,dynamic>{'ok':output.ok,'title':output.title,'output':output.output,
          'images':output.generatedImages.map((image)=>image.toJson()).toList()};
        if(mutating)await file.writeAsString(jsonEncode({'digest':digest,'result':result}),flush:true);
        await _reply(request,200,result);
      } finally {_pending.remove(key);if(mutating)_mutation=false;}
    } catch (_) {
      // Do not log raw tool payloads, provider tokens, or images.
      try {await _reply(request,500,{'ok':false,'error':'Tool failed or outcome unknown. Inspect Studio history before any new request.'});}catch(_){/* peer disconnected */}
    }
  }
  Future<void> close() async {_closed=true;await _server?.close(force:true);_server=null;}
}

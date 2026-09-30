import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/component_actions.dart';

void main(){
 TestWidgetsFlutterBinding.ensureInitialized();HttpOverrides.global=null;
 for(final approved in [true,false]){
  test('actual HTTP bridge: single host approval, durable reply, safe self-close; approved=$approved',() async {
   final root=await Directory.systemTemp.createTemp('component-http-');
   final client=HttpClient();late LocalAgentBridge bridge;late ComponentActions actions;
   final state=<String,dynamic>{'phase':'running','installed':'1.0.0','busy':false,'supported':true};
   var confirmations=0,stops=0,uninstalls=0;
   final done=Completer<void>();
   actions=ComponentActions(root:Directory('${root.path}/operations'),
    approve:(s,args){confirmations++;return bridge.approveOperation(s,args);},
    invoke:(name,args) async {
     if(name=='status')return {...state};
     if(name=='stop'){
      stops++;
      final receipts=await Directory('${root.path}/journal').list().where((f)=>f.path.endsWith('.json')).toList();
      expect(receipts.length,1);final receipt=jsonDecode(await File(receipts.single.path).readAsString());
      expect(receipt['result']['data']['queued'],true);
      await bridge.close();state['phase']='stopped';state['stopRevision']=1;return {'stopRevision':1};
     }
     if(name=='uninstall'){uninstalls++;state['installed']=null;return {};}
     throw StateError('Unexpected command $name');
    },changed:(){if(actions.operation?['state']=='completed'&&!done.isCompleted)done.complete();});
   bridge=LocalAgentBridge(journal:Directory('${root.path}/journal'),managesApproval:ComponentActions.handles,
     executeScoped:(tool,args,session)=>actions.execute(tool,args,session),
     execute:(tool,args)=>actions.execute(tool,args,'s'),afterResponse:actions.afterResponse);
   await bridge.start();
   Future<Map<String,dynamic>> call(String tool,Map<String,dynamic> args,String id) async {
    final request=await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
    request.headers.set('Authorization','Bearer ${bridge.token}');
    request.write(jsonEncode({'tool':tool,'args':args,'callId':id,'sessionId':'s'}));
    final response=await request.close();expect(response.statusCode,200);
    return jsonDecode(await utf8.decoder.bind(response).join()) as Map<String,dynamic>;
   }
   try{
    final status=await call('langbai_software_action',{'action':'component.status'},'read');
    final mutation=call('langbai_software_action',{'action':'component.uninstall','expectedRevision':status['data']['revision']},'remove');
    Map<String,dynamic>? pending;
    for(var n=0;n<100;n++){
     final reply=await call('studio_image_approval',{},'poll-$n');
     if(reply['data'] is Map){pending=Map<String,dynamic>.from(reply['data']);break;}
     await Future<void>.delayed(const Duration(milliseconds:5));
    }
    expect(pending,isNotNull);expect(pending!['parameters']['keepConversations'],true);
    // A read remains available while the one confirmation is waiting.
    expect((await call('langbai_software_action',{'action':'component.status'},'during'))['ok'],true);
    await call('studio_resolve_image_approval',{'id':pending['id'],'approved':approved},'resolve');
    final reply=await mutation;expect(reply['ok'],approved);expect(confirmations,1);
    if(approved){expect(reply['data']['queued'],true);await done.future.timeout(const Duration(seconds:3));expect(stops,1);expect(uninstalls,1);}
    else {expect(stops,0);expect(uninstalls,0);}
   }finally{client.close(force:true);await actions.cancel();await bridge.close();await root.delete(recursive:true);}
  });
 }
}

import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/component_actions.dart';

void main(){
 late Directory root;late ComponentActions actions;
 late Map<String,dynamic> state;late List<String> calls;int approvals=0;
 Future<Map<String,dynamic>> invoke(String name,Map<String,dynamic> args) async {
  calls.add(name);
  switch(name){
   case 'status':return {...state};
   case 'planDownload':return {'version':'1.1.0','bytes':42,'sha256':'a'*64,'token':'private-consent'};
   case 'stop':state['phase']='stopped';state['stopRevision']=(state['stopRevision'] as int? ?? 0)+1;return {'stopRevision':state['stopRevision']};
   case 'prepare':state['proposal']={'version':'1.1.0','token':'prepared'};return {};
   case 'confirm':state['installed']='1.1.0';return {};
   case 'uninstall':state['installed']=null;return {};
   default:throw StateError('Unexpected command');
  }
 }
 setUp(() async {
  root=await Directory.systemTemp.createTemp('component-actions-');calls=[];approvals=0;
  state={'phase':'running','installed':'1.0.0','busy':false,'supported':true};
  actions=ComponentActions(root:root,invoke:invoke,approve:(session,summary) async {approvals++;expect(summary['keepConversations'],true);expect(summary.containsKey('token'),false);return true;},handoffTimeout:const Duration(milliseconds:40),pollInterval:const Duration(milliseconds:1));
 });
 tearDown(() async {await actions.cancel();await root.delete(recursive:true);});
 Future<Map<String,dynamic>> args(String action) async {
  final read=await actions.execute('langbai_software_action',{'action':'component.check'},'s');
  return {'action':action,'expectedRevision':jsonDecode(read.output)['revision']};
 }
 test('one approval, queued response before stopping, durable completion, replay and restart do not repeat',() async {
  final input=await args('component.update');final result=await actions.execute('langbai_software_action',input,'s');
  expect(result.ok,true);expect(calls.contains('stop'),false);
  final response={'ok':true,'data':jsonDecode(result.output)};
  actions.afterResponse('langbai_software_action',input,'s','one',response,true);
  actions.afterResponse('langbai_software_action',input,'s','one',response,true);
  await actions.settled();expect(actions.operation!['state'],'completed');expect(approvals,1);expect(calls.where((v)=>v=='confirm').length,1);
  final restarted=ComponentActions(root:root,invoke:invoke,approve:(_,__)async=>throw StateError('Unexpected approval'));
  await restarted.initialize();restarted.afterResponse('langbai_software_action',input,'s','one',response,true);
  expect(restarted.operation!['state'],'completed');expect(calls.where((v)=>v=='confirm').length,1);
 });
 test('uninstall retains data contract and does not query or download',() async {
  final read=await actions.execute('langbai_software_action',{'action':'component.status'},'s');
  final input={'action':'component.uninstall','expectedRevision':jsonDecode(read.output)['revision']};
  final result=await actions.execute('langbai_software_action',input,'s');
  actions.afterResponse('langbai_software_action',input,'s','one',{'ok':true,'data':jsonDecode(result.output)},true);await actions.settled();
  expect(actions.operation!['state'],'completed');expect(calls.contains('planDownload'),false);expect(calls.contains('prepare'),false);expect(calls.where((v)=>v=='uninstall').length,1);
 });
 test('lost connection and handoff timeout never stop or modify the runtime',() async {
  var input=await args('component.update');var result=await actions.execute('langbai_software_action',input,'s');
  actions.afterResponse('langbai_software_action',input,'s','one',{'ok':true,'data':jsonDecode(result.output)},false);await actions.settled();
  expect(actions.operation!['state'],'interrupted');
  input=await args('component.update');result=await actions.execute('langbai_software_action',input,'s');
  await Future<void>.delayed(const Duration(milliseconds:65));expect(actions.busy,false);expect(calls.contains('stop'),false);
 });
 test('restart never resumes a pending mutation',() async {
  await actions.execute('langbai_software_action',await args('component.update'),'s');
  final restarted=ComponentActions(root:root,invoke:invoke,approve:(_,__)async=>true);
  await restarted.initialize();expect(restarted.operation!['state'],'interrupted');expect(calls.contains('stop'),false);
 });
 test('rejects stale revisions, unknown paths and concurrent requests',() async {
  final input=await args('component.update');
  expect((await actions.execute('langbai_software_action',{...input,'url':'evil'},'s')).ok,false);
  expect((await actions.execute('langbai_software_action',{...input,'expectedRevision':'stale'},'s')).ok,false);
  await actions.execute('langbai_software_action',input,'s');
  expect((await actions.execute('langbai_software_action',input,'s')).ok,false);
  expect((await actions.execute('langbai_software_action',{'action':'component.status'},'s')).ok,true);
  expect(approvals,1);expect(calls.contains('stop'),false);
 });
 test('native failure after command acknowledgement is a failure, not completed',() async {
  final failing=ComponentActions(root:root,approve:(_,__)async=>true,invoke:(name,input) async {
   final output=await invoke(name,input);if(name=='prepare')state['error']='Compatibility failed';return output;
  });
  final check=await failing.execute('langbai_software_action',{'action':'component.check'},'s');
  final input={'action':'component.update','expectedRevision':jsonDecode(check.output)['revision']};
  final result=await failing.execute('langbai_software_action',input,'s');
  failing.afterResponse('langbai_software_action',input,'s','one',{'ok':true,'data':jsonDecode(result.output)},true);await failing.settled();
  expect(failing.operation!['state'],'failed');expect(calls.contains('confirm'),false);
 });
 test('corrupt receipt stops new operations',() async {
  await File('${root.path}/component-operation.json').writeAsString('{}');
  final result=await actions.execute('langbai_software_action',{'action':'component.status'},'s');
  expect(result.ok,false);expect(calls,isEmpty);
 });
 test('notification stop after preparation prevents activation',() async {
  final stopped=ComponentActions(root:root,approve:(_,__)async=>true,invoke:(name,input) async {
   final result=await invoke(name,input);
   if(name=='prepare')state['stopRevision']=(state['stopRevision'] as int)+1;
   return result;
  });
  final check=await stopped.execute('langbai_software_action',{'action':'component.check'},'s');
  final input={'action':'component.update','expectedRevision':jsonDecode(check.output)['revision']};
  final result=await stopped.execute('langbai_software_action',input,'s');
  stopped.afterResponse('langbai_software_action',input,'s','one',{'ok':true,'data':jsonDecode(result.output)},true);await stopped.settled();
  expect(stopped.operation!['state'],'failed');expect(calls.contains('confirm'),false);
 });
}

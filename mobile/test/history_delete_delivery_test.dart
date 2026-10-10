import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/works_batch.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/agent/software_actions.dart';
import 'package:novelai_mobile/agent/software_action_catalog.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/agent_models.dart';

class DiskHistory extends Storage {
 final Directory root;
 DiskHistory(this.root);
 @override Future<WorksBatchFiles> worksFiles() async => WorksBatchFiles([root]);
 @override Future<List<HistoryItem>> getHistory() async => (jsonDecode(await File('${root.path}/history.json').readAsString()) as List).map((x)=>HistoryItem.fromJson(Map<String,dynamic>.from(x))).toList();
 @override Future<void> writeHistory(List<HistoryItem> items) => File('${root.path}/history.json').writeAsString(jsonEncode(items.map((x)=>x.toJson()).toList()),flush:true).then((_){ });
}
HistoryItem item(String id,String file)=>HistoryItem(id:id,filePath:file,date:'2026-09-28',createdAt:'2026-09-28',seed:0,model:'fixture',width:1,height:1,prompt:'synthetic');
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 late Directory root;late DiskHistory storage;
 setUp(()async{root=Directory.systemTemp.createTempSync('studio-delete-delivery-');storage=DiskHistory(root);await storage.writeHistory([]);});
 tearDown(()=>root.deleteSync(recursive:true));
 test('invalid file type fails without removing the disk record',()async{
  final directory=Directory('${root.path}/not-an-image.png')..createSync();await storage.writeHistory([item('bad',directory.path)]);
  await expectLater(storage.deleteHistory('bad'),throwsA(isA<FileSystemException>()));expect((await storage.getHistory()).single.id,'bad');expect(directory.existsSync(),true);
 });
 test('missing file and valid file delete are both truthful',()async{
  final file=File('${root.path}/normal.png')..writeAsStringSync('synthetic');await storage.writeHistory([item('normal',file.path),item('gone','${root.path}/missing.png')]);
  await storage.deleteHistory('normal');expect(file.existsSync(),false);await storage.deleteHistory('gone');expect(await storage.getHistory(),isEmpty);
 });
 test('shared file is retained until its last record is deleted',()async{
  final file=File('${root.path}/shared.png')..writeAsStringSync('synthetic shared');await storage.writeHistory([item('one',file.path),item('two',file.path)]);
  await storage.deleteHistory('one');expect(file.readAsStringSync(),'synthetic shared');expect((await storage.getHistory()).single.id,'two');
 });
 test('Agent history delete routes to actual app and storage; stale replays fail',()async{
  expect(softwareActionCatalog['history.items.delete']['effect'],'confirm');
  final file=File('${root.path}/agent.png')..writeAsStringSync('synthetic');final rows=[item('agent',file.path)];await storage.writeHistory(rows);final app=AppState(storage:storage);app.history.addAll(rows);final service=SoftwareActions(app);
  try{final state=await service.execute('langbai_software_action',{'action':'history.items.list'});final args={'action':'history.items.delete','id':'agent','expectedRevision':state['revision']};final result=await service.execute('langbai_software_action',args);expect(result['total'],0);expect(file.existsSync(),false);expect(await storage.getHistory(),isEmpty);await expectLater(service.execute('langbai_software_action',args),throwsStateError);}finally{app.dispose();}
 });
 test('failed storage deletion restores current selection and history in AppState',()async{
  final directory=Directory('${root.path}/bad.png')..createSync();final row=item('bad',directory.path);await storage.writeHistory([row]);final app=AppState(storage:storage);app.history.add(row);app.current=row;
  try{await expectLater(app.deleteHistory('bad'),throwsA(isA<FileSystemException>()));expect(app.current?.id,'bad');expect(app.history.single.id,'bad');expect((await storage.getHistory()).single.id,'bad');}finally{app.dispose();}
 });
 test('actual HTTP Agent approval denial, one approval to delete, and journal replay',()async{
  HttpOverrides.global=null;final file=File('${root.path}/http.png')..writeAsStringSync('synthetic');final rows=[item('http',file.path)];await storage.writeHistory(rows);final app=AppState(storage:storage);app.history.addAll(rows);final service=SoftwareActions(app);var executions=0;
  final bridge=LocalAgentBridge(journal:Directory('${root.path}/journal'),execute:(tool,args)async{if(args['action']=='history.items.delete')executions++;return AgentToolResult(ok:true,title:'history',output:jsonEncode(await service.execute(tool,args)));});final client=HttpClient();await bridge.start();
  Future<Map<String,dynamic>> call(String tool,Map<String,dynamic> args,String id)async{final req=await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));req.headers.set('Authorization','Bearer ${bridge.token}');req.write(jsonEncode({'tool':tool,'args':args,'sessionId':'history','callId':id}));final res=await req.close();expect(res.statusCode,200);return jsonDecode(await utf8.decoder.bind(res).join()) as Map<String,dynamic>;}
  try{
   final state=await call('langbai_software_action',{'action':'history.items.list'},'read');final args={'action':'history.items.delete','id':'http','expectedRevision':state['data']['revision']};
   for(final approved in [false,true]){final id='delete-$approved';final pending=call('langbai_software_action',args,id);Map<String,dynamic>? approval;
    for(var i=0;i<100;i++){final r=await call('studio_image_approval',{},'poll-$approved-$i');if(r['data'] is Map){approval=Map<String,dynamic>.from(r['data']);break;}await Future<void>.delayed(const Duration(milliseconds:5));}
    expect(approval,isNotNull);expect(file.existsSync(),true);expect(executions,0);await call('studio_resolve_image_approval',{'id':approval!['id'],'approved':approved},'resolve-$approved');final reply=await pending;expect(reply['ok'],approved);expect(file.existsSync(),!approved);
    final replay=await call('langbai_software_action',args,id);expect(replay['ok'],approved);expect((await call('studio_image_approval',{},'after-$approved'))['data'],isNull);
   }
   expect(executions,1);expect(await storage.getHistory(),isEmpty);
  }finally{client.close(force:true);await bridge.close();app.dispose();}
 });
}

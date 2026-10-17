// Host protocol/state tests only. No iOS scope, picker, cloud provider or Swift pass.
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/works_batch_file_access.dart';
import 'package:novelai_mobile/state/app_state.dart';

HistoryItem row(String id,String path)=>HistoryItem(id:id,filePath:path,date:'2026-10-17',createdAt:'2026-10-17',seed:1,model:'host',width:1,height:1,prompt:'fixture');
class Access implements WorksBatchFileAccess {
 final files=<String,List<int>>{},ids=<String,String>{},events=<String>[];
 final unavailable=<String>{};
 int seq=0;bool replaceBeforeDelete=false;void Function()? onCopy;
 void put(String path,List<int> bytes){files[path]=bytes;ids[path]='identity-${++seq}';}
 @override Future<WorksFileDescription> describe(String path,List<String> roots) async {
  events.add('describe:$path');if(unavailable.contains(path))throw PlatformException(code:'provider_offline');
  return WorksFileDescription(path:path,root:path.startsWith('/provider/')?'/provider':'/imports',state:files.containsKey(path)?'file':'missing',managedRoot:roots.where((r)=>path.startsWith('$r/')).firstOrNull,receipt:ids[path]);
 }
 @override Future<WorksRenameCopy> copyForRename(WorksFileDescription source,String stem) async {
  events.add('copy:${source.path}');
  if(ids[source.path]!=source.receipt)throw StateError('source identity changed');
  final slash=source.path.lastIndexOf('/'),dot=source.path.lastIndexOf('.');
  final ext=dot>slash?source.path.substring(dot):'.png';
  var target='${source.path.substring(0,slash)}/$stem$ext',suffix=2;
  while(files.containsKey(target)){target='${source.path.substring(0,slash)}/$stem-${suffix++}$ext';}
  put(target,List.of(files[source.path]!));
  final dest=WorksFileDescription(path:target,root:source.root,state:'file',managedRoot:source.managedRoot,receipt:ids[target],created:true);
  onCopy?.call();return WorksRenameCopy(source,dest);
 }
 @override Future<void> delete(WorksFileDescription file) async {
  events.add('delete:${file.path}');
  if(replaceBeforeDelete){put(file.path,[9,9]);replaceBeforeDelete=false;}
  if(ids[file.path]!=file.receipt)throw StateError('receipt identity changed');
  if(file.managedRoot==null&&!file.created)throw StateError('permission not ownership');
  files.remove(file.path);ids.remove(file.path);
 }
}
class Memory extends Storage {
 final Access access;List<HistoryItem> rows=[];String configured='/provider';bool failCommit=false,failSettings=false;
 Memory(this.access):super(fileAccess:access);
 @override Future<AppSettings> getSettings()async{if(failSettings)throw StateError('settings unavailable');return AppSettings(imageOutputDir:configured);}
 @override Future<Directory> imagesDir()async=>Directory('/app/images');
 @override Future<List<HistoryItem>> getHistory()async=>List.of(rows);
 @override Future<void> writeHistory(List<HistoryItem> next)async {
  access.events.add('commit');if(failCommit)throw StateError('persist failed');rows=List.of(next);
 }
}
Map<String,dynamic> description(String path,{String? managed='/provider',String receipt='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',bool created=false})=>{'path':path,'root':'/provider','managedRoot':managed,'state':'file','coordinated':true,'available':true,'created':created,'receipt':receipt};
void main(){
 test('actual Storage selected deletion delegates to coordinated identity and preserves shared/imported/partial failures',()async{
  final a=Access()..put('/provider/owned.png',[1])..put('/provider/shared.png',[2])..put('/imports/photo.png',[3]);
  a.unavailable.add('/provider/offline.png');final s=Memory(a)..rows=[row('a','/provider/owned.png'),row('b','/provider/shared.png'),row('c','/provider/shared.png'),row('d','/imports/photo.png'),row('e','/provider/offline.png')];
  final r=await s.deleteHistoryItems({'a','b','d','e'});
  expect(r.removedIds,{'a','b','d'});expect(r.failedIds,{'e'});expect(r.removedPaths,['/provider/owned.png']);
  expect(a.files.keys,containsAll(['/provider/shared.png','/imports/photo.png']));expect(s.rows.map((r)=>r.id),['c','e']);
 });
 test('all selected shared rows unlink once, replacement identity retains row',()async{
  final a=Access()..put('/provider/a.png',[1]);final s=Memory(a)..rows=[row('a','/provider/a.png'),row('b','/provider/a.png')];
  expect((await s.deleteHistoryItems({'a','b'})).removedIds,{'a','b'});expect(a.events.where((e)=>e.startsWith('delete:')),hasLength(1));
  a.put('/provider/new.png',[2]);a.replaceBeforeDelete=true;s.rows=[row('new','/provider/new.png')];
  expect((await s.deleteHistoryItems({'new'})).failedIds,{'new'});expect(s.rows,hasLength(1));expect(a.files['/provider/new.png'],[9,9]);
 });
 test('actual AppState rename commits same ID before deleting old, no clobber and bytes unchanged',()async{
  final a=Access()..put('/provider/original.png',[1,2,3])..put('/provider/New.png',[7]);final s=Memory(a)..rows=[row('a','/provider/original.png')];
  final app=AppState(storage:s)..history=List.of(s.rows)..current=s.rows.first;await app.renameHistory('a','New');
  expect(s.rows.single.id,'a');expect(s.rows.single.filePath,'/provider/New-2.png');expect(app.current!.filePath,s.rows.single.filePath);
  expect(a.files['/provider/New.png'],[7]);expect(a.files['/provider/New-2.png'],[1,2,3]);
  expect(a.events.indexOf('commit'),lessThan(a.events.indexOf('delete:/provider/original.png')));expect(a.files, isNot(contains('/provider/original.png')));app.dispose();
 });
 test('shared and imported originals survive rename after durable commit',()async{
  for(final imported in [false,true]){
   final path=imported?'/imports/a.png':'/provider/a.png';final a=Access()..put(path,[1]);final s=Memory(a)..rows=[row('a',path),if(!imported)row('b',path)];final app=AppState(storage:s)..history=List.of(s.rows);
   await app.renameHistory('a','Renamed');expect(a.files[path],[1]);expect(a.events,isNot(contains('delete:$path')));expect(s.rows.first.filePath,endsWith('/Renamed.png'));app.dispose();
  }
 });
 test('failed history persistence deletes only new creation receipt, preserving source/history/editor',()async{
  final a=Access()..put('/provider/a.png',[1]);final s=Memory(a)..rows=[row('a','/provider/a.png')]..failCommit=true;final app=AppState(storage:s)..history=List.of(s.rows)..current=s.rows.first;
  await expectLater(app.renameHistory('a','New'),throwsStateError);expect(a.files,{'/provider/a.png':[1]});expect(app.current!.filePath,'/provider/a.png');expect(s.rows.single.filePath,'/provider/a.png');app.dispose();
 });
 test('rollback refuses to delete a concurrent replacement of its newly created path',()async{
  final a=Access()..put('/provider/a.png',[1]);final s=Memory(a)..rows=[row('a','/provider/a.png')]..failCommit=true;a.onCopy=()=>a.put('/provider/New.png',[99]);final app=AppState(storage:s)..history=List.of(s.rows);
  await expectLater(app.renameHistory('a','New'),throwsStateError);expect(a.files['/provider/New.png'],[99]);expect(a.files['/provider/a.png'],[1]);expect(s.rows.single.filePath,'/provider/a.png');app.dispose();
 });
 test('concurrent row path change is not overwritten and newly copied output is safely discarded',()async{
  final a=Access()..put('/provider/a.png',[1]);final s=Memory(a)..rows=[row('a','/provider/a.png')];a.onCopy=()=>s.rows=[row('a','/provider/concurrent.png')];final app=AppState(storage:s)..history=List.of(s.rows);
  await expectLater(app.renameHistory('a','New'),throwsStateError);expect(s.rows.single.filePath,'/provider/concurrent.png');expect(a.files, isNot(contains('/provider/New.png')));expect(a.files['/provider/a.png'],[1]);app.dispose();
 });
 test('postcommit cleanup failure is truthful and keeps durable new identity authoritative',()async{
  final a=Access()..put('/provider/a.png',[1]);final s=Memory(a)..rows=[row('a','/provider/a.png')];a.onCopy=()=>a.replaceBeforeDelete=true;final app=AppState(storage:s)..history=List.of(s.rows);
  app.settings.language='en-US';await app.renameHistory('a','New');expect(s.rows.single.filePath,'/provider/New.png');expect(a.files['/provider/a.png'],[9,9]);expect(app.status,contains('cleanup was not confirmed'));app.dispose();
 });
 test('postcommit root-query failure does not report the durable rename itself as failed',()async{
  final a=Access()..put('/provider/a.png',[1]);final s=Memory(a)..rows=[row('a','/provider/a.png')];a.onCopy=()=>s.failSettings=true;final app=AppState(storage:s)..history=List.of(s.rows);app.settings.language='en-US';
  await app.renameHistory('a','New');expect(s.rows.single.filePath,'/provider/New.png');expect(a.files['/provider/a.png'],[1]);expect(app.status,contains('cleanup was not confirmed'));app.dispose();
 });
 test('unavailable provider rename preserves actual history and current input without a copy fallback',()async{
  final a=Access()..put('/provider/a.png',[1]);a.unavailable.add('/provider/a.png');final s=Memory(a)..rows=[row('a','/provider/a.png')];final app=AppState(storage:s)..history=List.of(s.rows)..current=s.rows.first;
  await expectLater(app.renameHistory('a','New'),throwsA(isA<PlatformException>()));expect(s.rows.single.filePath,'/provider/a.png');expect(app.current!.filePath,'/provider/a.png');expect(a.events,isNot(contains('copy:/provider/a.png')));expect(a.files,{'/provider/a.png':[1]});app.dispose();
 });
 test('changed configured root after copy never turns remembered grant into current ownership',()async{
  final a=Access()..put('/provider/a.png',[1]);final s=Memory(a)..rows=[row('a','/provider/a.png')];a.onCopy=()=>s.configured='/other';final app=AppState(storage:s)..history=List.of(s.rows);
  await app.renameHistory('a','New');expect(a.files['/provider/a.png'],[1]);expect(a.events,isNot(contains('delete:/provider/a.png')));app.dispose();
 });
 test('trusted generated delete preflights all paths; unavailable or foreign preserves records and files',()async{
  for(final foreign in [false,true]){
   final a=Access()..put('/provider/a.png',[1])..put('/imports/b.png',[2]);final s=Memory(a)..rows=[row('a','/provider/a.png')];if(!foreign)a.unavailable.add('/provider/offline.png');
   await expectLater(s.deleteHistoryFiles(['/provider/a.png',foreign?'/imports/b.png':'/provider/offline.png']),throwsA(anything));expect(a.files['/provider/a.png'],[1]);expect(s.rows,hasLength(1));expect(a.events.where((e)=>e.startsWith('delete:')),isEmpty);
  }
 });
 test('trusted generated successful delete and unavailable missing distinction use native boundary only',()async{
  final a=Access()..put('/provider/a.png',[1]);final s=Memory(a)..rows=[row('a','/provider/a.png')];await s.deleteHistoryFiles(['/provider/a.png']);expect(s.rows,isEmpty);expect(a.files,isEmpty);
  a.unavailable.add('/provider/offline.png');final policy=await s.worksFiles();expect(await policy.conclusivelyMissing('/provider/offline.png'),isFalse);expect(await policy.conclusivelyMissing('/provider/gone.png'),isTrue);
 });
 test('protocol binds describe exact roots/path, opaque receipt and no failure fallback',()async{
  for(final fault in ['path','root','managed','receipt','coordinated','unavailable']){
   final service=IosWorksBatchFileAccess(invoke:(method,args)async{expect(method,'describe');expect(args,{'path':'/provider/a.png','managedRoots':['/provider']});final value=description('/provider/a.png');switch(fault){case'path':value['path']='/provider/b.png';case'root':value['root']='/elsewhere';case'managed':value['managedRoot']='/old-grant';case'receipt':value['receipt']='fake';case'coordinated':value['coordinated']=false;case'unavailable':throw PlatformException(code:'offline');}return value;});
   await expectLater(service.describe('/provider/a.png',['/provider']),throwsA(anything));
  }
 });
 test('protocol copy binds exclusive same directory and exact source identity',()async{
  const source=WorksFileDescription(path:'/provider/a.png',root:'/provider',state:'file',managedRoot:'/provider',receipt:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  for(final fault in ['none','source','outside','duplicate','not-exclusive']){
   final service=IosWorksBatchFileAccess(invoke:(method,args)async{expect(method,'copyForRename');expect(args['receipt'],source.receipt);final dest=fault=='outside'?'/other/New.png':fault=='duplicate'?'/provider/a.png':'/provider/New.png';return {'sourcePath':source.path,'sourceReceipt':fault=='source'?'other':source.receipt,'coordinated':true,'createdExclusive':fault!='not-exclusive','destination':description(dest,created:true)};});
   if(fault=='none'){expect((await service.copyForRename(source,'New')).destination.path,'/provider/New.png');}else{await expectLater(service.copyForRename(source,'New'),throwsFormatException);}
  }
 });
 test('protocol deletion requires ownership or exact creation; rejects mismatched native identity result',()async{
  for(final owned in [false,true]){var calls=0;final service=IosWorksBatchFileAccess(invoke:(method,args)async{calls++;return {'path':args['path'],'receipt':'different','deleted':true,'identityVerified':true,'coordinated':true};});final file=WorksFileDescription(path:'/provider/a.png',root:'/provider',state:'file',managedRoot:owned?'/provider':null,receipt:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');await expectLater(service.delete(file),throwsFormatException);expect(calls,owned?1:0);}
 });
 test('native source contract uses actual-item coordination and bounded opaque identities without replacing old read/picker behavior',(){
  final swift=File('ios/Runner/OutputFolderBridge.swift').readAsStringSync();
  for(final literal in ['case "describe", "copyForRename", "deleteFile"','options:.forDeleting','readingItemAt:file, options:[], writingItemAt:logical','Mutation identity receipt expired','mutationIdentityValue(before) == expected','options:.withoutOverwriting','mutationOrder.count > 512']){expect(swift,contains(literal));}
  expect(swift,contains('Directory moved; choose it again'));expect(swift,contains('private func read('));
 });
}

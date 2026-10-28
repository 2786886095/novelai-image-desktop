// Host assertion mechanics only: not proof of native Bundle identity or picker acceptance.
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import '../integration_test/native_ios_bundle_snapshot.dart';
const snapshot=<String,dynamic>{'state':'download_only','downloadSupported':true,'installSupported':false,'bundleIdentifier':'com.codex.novelai.novelaiMobile','currentVersion':'2.6.8','currentBuild':'188','appDisplayName':'Langbai Studio','documentsVisible':true,'openDocumentsInPlace':true};
void main(){
 test('all nine identical fields remain equal when MethodChannel map order changes',(){
  final reordered=Map<String,dynamic>.fromEntries(snapshot.entries.toList().reversed);
  expect(jsonEncode(snapshot)==jsonEncode(reordered),false,reason:'old string comparison has a deterministic order-only false alarm');
  expect(nativeIosBundleSnapshotsEqual(snapshot,reordered),true);
 });
 for(final key in snapshot.keys){
  test('changed installed status value is rejected: $key',(){
   final changed=Map<String,dynamic>.from(snapshot)..[key]=snapshot[key] is bool?!(snapshot[key] as bool):'different';
   expect(nativeIosBundleSnapshotsEqual(snapshot,changed),false);
   expect(nativeIosBundleSnapshotsEqual(changed,snapshot),false);
  });
 }
 test('missing status field is rejected even if remaining fields match',(){for(final k in snapshot.keys){expect(nativeIosBundleSnapshotsEqual(snapshot,Map<String,dynamic>.from(snapshot)..remove(k)),false);}});
 test('extra field is not silently omitted even if shared fields match',(){expect(nativeIosBundleSnapshotsEqual(snapshot,{...snapshot,'extra':'value'}),false);expect(nativeIosBundleSnapshotsEqual({...snapshot,'extra':'value'},{...snapshot,'extra':'value'}),false);});
 test('same-size foreign key cannot replace a required Bundle field',(){final changed=Map<String,dynamic>.from(snapshot)..remove('currentBuild')..['foreign']='188';expect(nativeIosBundleSnapshotsEqual(snapshot,changed),false);expect(nativeIosBundleSnapshotsEqual(changed,changed),false);});
 test('actual native boundary uses full semantic comparison and emits both public snapshots',(){
  // Source wiring is additional evidence, not a replacement for the comparisons above.
  final source=File('integration_test/native_ios_update_scenarios.dart').readAsStringSync();
  expect(source,contains('nativeIosBundleSnapshotsEqual(nativeBefore, nativeAfter)'));
  expect(source,contains("'boundary':'before'"));expect(source,contains("'boundary':'after'"));
  expect(source,contains("'iOS download/cancel changed native vault/preferences/history/output'"));
 });
}

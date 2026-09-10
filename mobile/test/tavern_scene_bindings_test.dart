import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/scene_bindings.dart';
import 'package:novelai_mobile/agent/image_continuity.dart';
import 'package:novelai_mobile/agent/tavern_models.dart';
void main() {
 final fixtures=jsonDecode(File('../shared/tavern-scene-fixtures.json').readAsStringSync()) as Map;
 for(final f in fixtures['cases'] as List) {
  test(f['name'],(){
   final scene=readSceneBindings(f['scene'])!;final before=canonicalSceneValue(scene);
   if(f['error']!=null) { expect(()=>applyScenePatch(scene,f['patch'],byUser:f['byUser']==true),throwsA(isA<StateError>().having((e)=>e.message,'code',f['error']))); }
   else {
    final changed=applyScenePatch(scene,f['patch'],byUser:f['byUser']==true);
    final wanted=jsonDecode(jsonEncode(scene)) as Map;
    for(final op in f['patch']['operations'] as List) { final rows=wanted[op['collection']] as List;final at=rows.indexWhere((r)=>r['id']==op['id']);if(op['after']==null){rows.removeAt(at);}else if(at<0){rows.add(op['after']);}else{rows[at]=op['after'];} }
    wanted['revision']=1;expect(changed,wanted);
   }
   expect(canonicalSceneValue(scene),before);
  });
 }
 test('native captions preserve garment ownership and zero position',(){
  final compiled=compileSceneBindings(applyScenePatch(readSceneBindings(fixtures['scene'])!,fixtures['cases'][0]['patch']));
  final people=compiled['characterPrompts'] as List;
  expect(people[0]['prompt'],contains('Wearing coat, black, leather.'));
  expect(people[0]['prompt'],contains('Wearing shirt, white.'));
  expect(people[1]['prompt'],contains('Wearing jacket, blue.'));
  expect(people[1]['prompt'],isNot(contains('red hair')));
  expect(people[0]['x'],0);expect(people[0]['y'],1);
  expect(compiled['positivePrompt'],contains('hat, owned by character 2'));
 });
 test('30 turns and save/load preserve all untouched bindings',(){
  final first=resolveImagePrompt({'scene':fixtures['scene']},null);
  var p=TavernImageProposal(id:'image',positivePrompt:first.positivePrompt,scene:first.scene);
  for(var i=0;i<30;i++) {
   final old=(p.scene!['facts'] as List).firstWhere((f)=>f['id']=='setting') as Map;
   final r=resolveImagePrompt({'baseImageId':p.id,'scenePatch':{'revision':p.scene!['revision'],'operations':[{'collection':'facts','id':'setting','before':old,'after':{...old,'prompt':'lighting $i'}}]}},p);
   expect(r.continuity['reviewRequired'],false);
   p=TavernImageProposal.fromJson(jsonDecode(jsonEncode((p..scene=r.scene..positivePrompt=r.positivePrompt).toJson())));
   expect((p.scene!['facts'] as List).where((f)=>f['id']!='setting').toList(),(fixtures['scene']['facts'] as List).where((f)=>f['id']!='setting').toList());
  }
  expect(imageStateContext(p),contains('wearerId'));
 });
 test('flat rewrite cannot erase a structured scene',(){
  final p=TavernImageProposal(id:'image',positivePrompt:'scene',scene:readSceneBindings(fixtures['scene']));
  final r=resolveImagePrompt({'positivePrompt':'different person'},p);
  expect(r.continuity['reviewRequired'],true);expect(r.scene,p.scene);
 });
 test('first supported-model image requires structure but legacy edits remain literal',(){
  final r=resolveImagePrompt({'positivePrompt':'woman'},null,model:'nai-diffusion-5-full');expect(r.continuity['bindingError'],'SCENE_REQUIRED');
  expect(resolveImagePrompt({'positivePrompt':'landscape'},null,model:'nai-diffusion-3').continuity['reviewRequired'],false);
  final base=TavernImageProposal(id:'old',positivePrompt:'woman, red coat');
  expect(resolveImagePrompt({'baseImageId':'old','promptPatch':{'replacements':[],'append':['daylight']}},base,model:'nai-diffusion-5-full').positivePrompt,'woman, red coat, daylight');
 });
 test('pure scenery does not invent a person to satisfy the schema',(){
  final scene={'version':1,'revision':0,'entities':[],'facts':[{'id':'setting','entityId':'scene','slot':'setting','prompt':'mountain, river, no humans'}],'relations':[]};
  final r=resolveImagePrompt({'scene':scene},null,model:'nai-diffusion-5-full');expect(r.continuity['reviewRequired'],false);expect(compileSceneBindings(r.scene!)['characterPrompts'],isEmpty);
 });

}

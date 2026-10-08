import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/negative_prompt_library.dart';
import 'package:novelai_mobile/ui/negative_prompt_library.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/services/storage.dart';
void main(){
 setUp(()=>SharedPreferences.setMockInitialValues({}));
 test('desktop/mobile builtins preserve the exact user text and JSON schema',(){
  final fixture=jsonDecode(File('../shared/negative-prompt-presets.json').readAsStringSync());
  expect(normalizeNegativePromptPresets(null),fixture);expect(parseNegativeLibrary(exportNegativeLibrary(normalizeNegativePromptPresets(null))),fixture);
  final p=negativeBuiltins.first['prompt']!;expect(applyNegativePreset('keep',p,'append'),'keep, $p');expect(applyNegativePreset('keep',p,'replace'),p);
  expect(()=>parseNegativeLibrary('{}'),throwsFormatException);expect(normalizeNegativePromptPresets([]),isEmpty);
 });
 test('named edits/deletes persist through cold storage and simultaneous writes do not lose entries',()async{
  final s=AppState();addTearDown(s.dispose);
  await Future.wait([s.mutateNegativePresets((old)=>old.map((p)=>p['id']==negativeBuiltins.first['id']?{...p,'name':'Renamed'}:p).toList()),s.mutateNegativePresets((old)=>[...old,{'id':'x','name':'X','prompt':'exact ::','createdAt':'now'}])]);
  final cold=await Storage().getSettings();expect(cold.negativePromptPresets.length,3);expect(cold.negativePromptPresets.first['name'],'Renamed');
  await s.mutateNegativePresets((_)=>[]);expect((await Storage().getSettings()).negativePromptPresets,isEmpty);expect(AppSettings.fromJson({'automaticComparison':{'generate:t2i':true}}).automaticComparison['generate:t2i'],false);
 });
 for(final size in [const Size(360,800),const Size(768,1024)]){for(final scale in [1.0,2.0]){
 testWidgets('preview/append without modifying positive prompt, responsive $size scale=$scale',(tester)async{
  await tester.binding.setSurfaceSize(size);addTearDown(()=>tester.binding.setSurfaceSize(null));
  final s=AppState();s.settings.language='zh-CN';s.params.positivePrompt='keep-positive';addTearDown(s.dispose);String value='original';
  await tester.pumpWidget(ChangeNotifierProvider.value(value:s,child:MaterialApp(builder:(context,child)=>MediaQuery(data:MediaQuery.of(context).copyWith(textScaler:TextScaler.linear(scale)),child:child!),home:Scaffold(body:NegativePromptLibraryButton(value:value,onApply:(prompt,mode)=>value=applyNegativePreset(value,prompt,mode))))));
  expect(find.text('负面提示词库'),findsNothing);expect(find.byType(IconButton),findsOneWidget);
  await tester.tap(find.byTooltip('负面提示词库'));await tester.pumpAndSettle();expect(value,'original');expect(find.text('强化版'),findsWidgets);expect(tester.takeException(),isNull);
  await tester.enterText(find.byType(TextField).first,'轻量版');await tester.pumpAndSettle();final tile=find.widgetWithText(ListTile,'轻量版');await tester.ensureVisible(tile);await tester.tap(find.descendant(of:tile,matching:find.text('轻量版')));await tester.pumpAndSettle();final append=find.text('追加');await tester.ensureVisible(append);await tester.tap(append);await tester.pumpAndSettle();
  expect(value,'original, ${negativeBuiltins[1]['prompt']}');expect(s.params.positivePrompt,'keep-positive');expect(tester.takeException(),isNull);
 });}}
}


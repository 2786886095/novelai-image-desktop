import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/models/automatic_comparison.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/ui/automatic_comparison_control.dart';
import 'package:novelai_mobile/ui/before_after_compare.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
void main(){
 setUp(()=>SharedPreferences.setMockInitialValues({}));
 test('defaults on, old settings migrate safely and each false persists independently',()async{
  for(final key in comparisonSurfaces){final s=AppState();await s.setAutomaticComparison(key,false);expect(s.settings.automaticComparison[key],false);expect(s.settings.automaticComparison.values.where((v)=>v).length,key=='generate:t2i'?5:4);expect((await Storage().getSettings()).automaticComparison[key],false);s.dispose();}
  expect(normalizeAutomaticComparison({'inpaint':'false'}).values.toList(),[false,true,true,true,true,true]);
 });
 test('character name survives storage/deep copy/reorder/preset without modifying prompt',()async{
 final c=CharCaptionItem(name:'芙宁娜',prompt:'exact',negativePrompt:'red',enabled:false,x:0,y:1);final copy=GenerateExtras(charCaptions:[c]).copy().charCaptions.single;expect(copy.name,c.name);await Storage().setCharacterPrompts([copy]);expect((await Storage().getCharacterPrompts()).single.toJson(),c.toJson());expect(PositivePromptPreset.fromJson(PositivePromptPreset(id:'x',name:'X',prompt:'',createdAt:'now',captions:[c]).toJson()).captions.single.name,'芙宁娜');
 });
 for(final surface in comparisonSurfaces){
 testWidgets('$surface completion-only / manual / off / remount', (tester)async{
  final d=Directory.systemTemp.createTempSync('nai-compare-');addTearDown(()=>d.deleteSync(recursive:true));
  final bytes=img.encodePng(img.Image(width:16,height:16));final before=File('${d.path}/before.png')..writeAsBytesSync(bytes),after=File('${d.path}/after.png')..writeAsBytesSync(bytes);
  final s=AppState();addTearDown(s.dispose);s.comparisonSurface=surface;s.comparisonBefore=WorkingImage(filePath:before.path,width:16,height:16);s.comparisonAfter=WorkingImage(filePath:after.path,width:16,height:16);
  s.comparisonAutoOpenPending=automaticComparisonAllowed(surface);
  Widget tree(String key)=>ChangeNotifierProvider.value(value:s,child:MaterialApp(home:Scaffold(body:SingleChildScrollView(child:AutomaticComparisonControl(key:ValueKey(key),surface:surface)))));
  await tester.pumpWidget(tree('first'));await tester.pumpAndSettle();expect(find.byType(BeforeAfterCompare),automaticComparisonAllowed(surface)?findsOneWidget:findsNothing);expect(s.comparisonAutoOpenPending,false);
  await tester.pumpWidget(tree('remounted'));await tester.pumpAndSettle();expect(find.byType(BeforeAfterCompare),findsNothing);
  await tester.tap(find.byKey(ValueKey('manual-compare-$surface')));await tester.pumpAndSettle();expect(find.byType(BeforeAfterCompare),findsOneWidget);
  s.comparisonAfter=WorkingImage(filePath:before.path,width:16,height:16);s.notifyListeners();await tester.pumpAndSettle();expect(find.byType(BeforeAfterCompare),findsNothing);
  await s.setAutomaticComparison(surface,false);s.comparisonAutoOpenPending=true;s.notifyListeners();await tester.pumpAndSettle();expect(find.byType(BeforeAfterCompare),findsNothing);
  await s.setAutomaticComparison(surface,true);await tester.pumpAndSettle();expect(find.byType(BeforeAfterCompare),findsNothing); // toggling a preference is not completion
  s.comparisonSurface='other';s.notifyListeners();await tester.pumpAndSettle();expect(find.byType(BeforeAfterCompare),findsNothing);expect(tester.takeException(),isNull);
 });}
 testWidgets('actual character cards display defaults, edit name and preserve content', (tester)async{
 tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(430,2800);addTearDown(tester.view.reset);
 final s=AppState();addTearDown(s.dispose);s.extras.charCaptions=[CharCaptionItem(prompt:'blue'),CharCaptionItem(prompt:'red')];
 await tester.pumpWidget(ChangeNotifierProvider.value(value:s,child:const MaterialApp(home:GenerateScreen())));await tester.pumpAndSettle();
 final edit=find.byKey(const ValueKey('character-name-edit-0'));
 await tester.scrollUntilVisible(edit,400,scrollable:find.byType(Scrollable).first,maxScrolls:15);await tester.pumpAndSettle();expect(find.byKey(const ValueKey('character-name-input')),findsNothing);
 await tester.tap(edit);await tester.pumpAndSettle();final input=find.byKey(const ValueKey('character-name-input'));await tester.enterText(input,'芙宁娜');expect(s.extras.charCaptions.first.name,isEmpty);
 await tester.tap(find.byKey(const ValueKey('character-name-save')));await tester.pumpAndSettle();expect(s.extras.charCaptions.first.name,'芙宁娜');expect(s.extras.charCaptions.first.prompt,'blue');expect((await Storage().getCharacterPrompts()).first.name,'芙宁娜');expect(tester.takeException(),isNull);
 });
}

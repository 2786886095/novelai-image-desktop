import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/character_name_control.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(()=>SharedPreferences.setMockInitialValues({}));
  testWidgets('real character card opens only on pencil; cancel discards and save persists metadata only', (tester) async {
    tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(430,2800);addTearDown(tester.view.reset);
    final s=AppState();addTearDown(s.dispose);s.settings.language='en-US';
    final c=CharCaptionItem(prompt:'blue coat',negativePrompt:'red',enabled:false,useCoords:true,x:0,y:1);
    s.extras.charCaptions=[c];
    await tester.pumpWidget(ChangeNotifierProvider.value(value:s,child:const MaterialApp(home:GenerateScreen())));await tester.pumpAndSettle();
    final edit=find.byKey(const ValueKey('character-name-edit-0'));
    await tester.scrollUntilVisible(edit,400,scrollable:find.byType(Scrollable).first,maxScrolls:12);await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('character-name-input')),findsNothing);
    await tester.tap(edit);await tester.pumpAndSettle();await tester.enterText(find.byKey(const ValueKey('character-name-input')),'cancel draft');
    expect(c.name,isEmpty);await tester.tap(find.byKey(const ValueKey('character-name-cancel')));await tester.pumpAndSettle();expect(c.name,isEmpty);
    await tester.tap(edit);await tester.pumpAndSettle();await tester.enterText(find.byKey(const ValueKey('character-name-input')),'  芙宁娜  ');
    await tester.tap(find.byKey(const ValueKey('character-name-save')));await tester.pumpAndSettle();
    expect(c.name,'芙宁娜');expect(c.prompt,'blue coat');expect(c.negativePrompt,'red');expect(c.enabled,isFalse);expect(c.x,0);expect(c.y,1);
    expect((await Storage().getCharacterPrompts()).single.name,'芙宁娜');expect(find.byKey(const ValueKey('character-name-input')),findsNothing);
  });
  for(final platform in [TargetPlatform.android,TargetPlatform.iOS]) {
    testWidgets('$platform large text phone dialog, keyboard submit and blank reset', (tester) async {
      tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(390,844);addTearDown(tester.view.reset);
      String name='Existing';
      await tester.pumpWidget(MaterialApp(theme:ThemeData(platform:platform),builder:(context,child)=>MediaQuery(data:MediaQuery.of(context).copyWith(textScaler:const TextScaler.linear(2.6)),child:child!),home:Scaffold(body:Padding(padding:const EdgeInsets.all(12),child:CharacterNameControl(name:name,fallback:'角色 1',language:'zh-CN',onSave:(v)=>name=v)))));await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('character-name-edit')));await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const ValueKey('character-name-input')),'New');await tester.testTextInput.receiveAction(TextInputAction.done);await tester.pumpAndSettle();expect(name,'New');
      await tester.tap(find.byKey(const ValueKey('character-name-edit')));await tester.pumpAndSettle();await tester.enterText(find.byKey(const ValueKey('character-name-input')),'   ');await tester.tap(find.byKey(const ValueKey('character-name-save')));await tester.pumpAndSettle();expect(name,isEmpty);expect(tester.takeException(),isNull);
    });
  }
}

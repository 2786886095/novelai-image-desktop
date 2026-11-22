// Offline, debug-only acceptance entry; never import from the product.
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';

Future<void> main() async {
 final binding=WidgetsFlutterBinding.ensureInitialized();
 final t=LiveWidgetController(binding);
 final state=AppState();state.settings.language='en-US';state.settings.autoComplete=false;
 state.params.positivePrompt='global anchor';
 state.addCharacter();final role=state.extras.charCaptions.last;
 role.prompt='solo'; role.negativePrompt='fog';
 final steps=<String>[];
 final proof=File('${(await getApplicationDocumentsDirectory()).path}/FIELD_QA.json');
 final stopwatch=Stopwatch()..start();
 Future<void> tap(Finder f) async {
  await t.ensureVisible(f);
  await t.pump(const Duration(milliseconds:120));
  if(f.hitTestable().evaluate().isEmpty)throw StateError('Not hittable: '+f.toString());
  await t.tap(f);await t.pump(const Duration(milliseconds:440));
 }
 void check(bool yes,String msg){if(!yes)throw StateError(msg);steps.add(msg);}
 Future<void> openRole(String key)async{
  final f=find.byKey(ValueKey(key));
  if(f.evaluate().isEmpty)await t.scrollUntilVisible(f,220,scrollable:find.byType(Scrollable).first,maxScrolls:70);
  await t.ensureVisible(f);await t.pump(const Duration(milliseconds:200));
  if(Platform.isIOS)await tap(find.descendant(of:f,matching:find.byKey(const ValueKey('prompt-expand'))));else await tap(f);
  check(find.byKey(const ValueKey('android-fullscreen-prompt-text')).evaluate().length==1,'fullscreen:'+key);
 }
 final Map<String,dynamic> result={'os':Platform.operatingSystem,'steps':steps};
 try{
  runApp(ChangeNotifierProvider.value(value:state,child:const MaterialApp(home:GenerateScreen())));
  await t.pump(const Duration(seconds:1));await t.pump();
  final i=state.extras.charCaptions.length-1;
  await openRole('character-prompt-field-'+i.toString());
  await tap(find.byKey(const ValueKey('android-editor-capsule')));
  await tap(find.byWidgetPredicate((w)=>w is ChoiceChip && w.label is Text && (w.label as Text).data=='Tops'));
  await tap(find.byKey(const ValueKey('capsule-tag:shirt')));
  check(role.prompt.contains('shirt')&&role.negativePrompt=='fog'&&state.params.positivePrompt=='global anchor','capsule-to-selected-role-only');
  Navigator.of(t.element(find.byKey(const ValueKey('capsule-tag:shirt')))).pop();await t.pump(const Duration(milliseconds:450));
  await tap(find.text('Done'));
  await openRole('character-negative-field-'+i.toString());
  await tap(find.text('More tools'));await tap(find.text(generateScreenTextFor('en-US').weight));
  await tap(find.byIcon(Icons.add).last);await tap(find.widgetWithText(FilledButton,'Apply'));
  check(role.negativePrompt=='{fog}'&&role.prompt.contains('shirt')&&state.params.positivePrompt=='global anchor','weight-to-selected-role-negative-only');
  await tap(find.text('Done'));result['passed']=true;
 }catch(e,s){result['passed']=false;result['error']=e.toString();result['stack']=s.toString();}
 result['ms']=stopwatch.elapsedMilliseconds;
 await proof.writeAsString(jsonEncode(result),flush:true);print('FIELD_QA '+jsonEncode(result));
}


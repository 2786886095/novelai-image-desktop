import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';

void main() {
 for(final platform in [TargetPlatform.android,TargetPlatform.iOS]) {
 testWidgets('scoped weights and fullscreen: '+platform.name,(t) async {
  final original=debugDefaultTargetPlatformOverride;
  debugDefaultTargetPlatformOverride=platform;
  final state=AppState(); state.settings.language='en-US'; state.settings.autoComplete=false;
  final text=generateScreenTextFor('en-US');
  var negative='fog'; state.params.positivePrompt='anchor';
  try {
   await t.pumpWidget(ChangeNotifierProvider.value(value:state,child:MaterialApp(home:Scaffold(
    body:PromptEditor(label:'QA negative',value:negative,lockKind:'negative',onChanged:(v)=>negative=v)))));
   if(platform==TargetPlatform.android){await t.tap(find.text('QA negative'));}
   else {await t.tap(find.byKey(const ValueKey('prompt-expand')));}
   await t.pumpAndSettle();
   expect(find.byKey(const ValueKey('android-fullscreen-prompt-text')),findsOneWidget);
   await t.tap(find.text('More tools'));await t.pumpAndSettle();
   expect(find.text(text.normalize),findsOneWidget);
   await t.tap(find.text(text.weight));await t.pumpAndSettle();
   await t.tap(find.byIcon(Icons.add).last);await t.pumpAndSettle();
   await t.tap(find.widgetWithText(FilledButton,'Apply'));await t.pumpAndSettle();
   expect(negative,'{fog}');expect(state.params.positivePrompt,'anchor');
  }finally{await t.pumpWidget(const SizedBox.shrink());await t.pump();debugDefaultTargetPlatformOverride=original;}
 });
 }
}


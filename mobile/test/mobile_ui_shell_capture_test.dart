import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/main.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/android/android_destination_groups.dart';
import 'package:provider/provider.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'mobile_ui_theme_consistency_test.dart' show capture;
class _FixturePaths extends PathProviderPlatform {
 final String root;_FixturePaths(this.root);
 @override Future<String?> getApplicationSupportPath() async=>root;
 @override Future<String?> getApplicationDocumentsPath() async=>root;
 @override Future<String?> getTemporaryPath() async=>root;
 @override Future<String?> getDownloadsPath() async=>root;
}
Future<void> settle(WidgetTester tester) async {
 await tester.runAsync(()=>Future<void>.delayed(const Duration(milliseconds:80)));
 await tester.pumpAndSettle(const Duration(milliseconds:100),EnginePhase.sendSemanticsUpdate,const Duration(seconds:15));
}
void main(){
 setUpAll(()async{
  await (FontLoader('Roboto')..addFont(rootBundle.load('assets/ui-fonts/LXGWWenKaiLite-Regular.ttf'))).load();
  await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
 });
 testWidgets('actual Android shell fifteen routes in light and dark',(tester)async{
 for(final dark in [false,true]){
  tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(420,900);addTearDown(tester.view.reset);
  final previous=debugDefaultTargetPlatformOverride;debugDefaultTargetPlatformOverride=TargetPlatform.android;
  SharedPreferences.setMockInitialValues({});
  final oldPaths=PathProviderPlatform.instance;
  final fixture=await tester.runAsync(()=>Directory.systemTemp.createTemp('langbai-mobile-ui-fixture-'));
  PathProviderPlatform.instance=_FixturePaths(fixture!.path);
  final state=AppState();
  state.booted=true;state.settings.theme=dark?'dark':'light';state.settings.reduceMotion=true;
  state.settings.allowCustomEndpoint=true;state.settings.allowCustomEndpointFallback=false;
  state.settings.apiBaseUrl='http://127.0.0.1:1';state.settings.imageBaseUrl='http://127.0.0.1:1';
  state.params.model='nai-diffusion-5-full';state.needsNetworkOnboarding=false;
  final phase=dark?'dark':'light';
  try{
   await tester.pumpWidget(RepaintBoundary(key:const ValueKey('capture'),child:ChangeNotifierProvider.value(value:state,child:const NovelAIApp())));
   await settle(tester);
   for(var group=0;group<androidDestinationGroups.length;group++){
    await tester.tap(find.byKey(ValueKey('android-group-$group')));await settle(tester);
    for(final index in androidDestinationGroups[group]){
     await tester.tap(find.byKey(const ValueKey('android-member-selector')));await settle(tester);
     final option=find.byKey(ValueKey('android-member-option-$index'));await tester.ensureVisible(option);
     await tester.tap(option);await settle(tester);
     expect(tester.takeException(),isNull,reason:'route $index $phase');
     await capture(tester,'android-$phase-route-$index');
    }
   }
  }finally{
   await tester.pumpWidget(const SizedBox());await tester.pump();state.dispose();PathProviderPlatform.instance=oldPaths;debugDefaultTargetPlatformOverride=previous;
  }
 }
 });
}

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/main.dart';
import 'package:novelai_mobile/screens/settings/android_settings_hub.dart';
import 'package:novelai_mobile/screens/settings/settings_search_index.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/ui/android/android_studio_shell.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'compact_chrome_test.dart' show capture;

Future<void> mount(WidgetTester t, AppState app, {double scale=1,bool dark=false}) async {
 final theme=androidStudioTheme(dark?StudioTheme.dark():StudioTheme.light());
 await t.pumpWidget(ChangeNotifierProvider.value(value:app,child:RepaintBoundary(key:const ValueKey('capture'),child:MaterialApp(
   theme:theme.copyWith(textTheme:theme.textTheme.apply(fontFamily:'AuditZh')),
   builder:(c,child)=>MediaQuery(data:MediaQuery.of(c).copyWith(textScaler:TextScaler.linear(scale),disableAnimations:true),child:child!),
   home:const HomeShell()))));
 await t.pumpAndSettle();
}
void main(){
 setUp(()=>SharedPreferences.setMockInitialValues({'langbai.notice.v5-model-migration.seen':true}));
 setUpAll(()async{await PromptTemplateLibrary.load();final f=FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));await f.load();final zh=FontLoader('AuditZh')..addFont(rootBundle.load('assets/ui-fonts/LXGWMarkerGothic-Regular.ttf'));await zh.load();});
 for(final size in [const Size(320,640),const Size(390,844),const Size(800,360),const Size(800,1280)]){
  for(final scale in [1.0,2.0]){
   testWidgets('real shell compact height, scrolling and search $size scale=$scale',(t)async{
    debugDefaultTargetPlatformOverride=TargetPlatform.android;t.view.physicalSize=size;t.view.devicePixelRatio=1;
    final app=AppState()..booted=true;app.settings.language='en-US';app.settings.autoComplete=false;
    try{
     await mount(t,app,scale:scale,dark:scale==2);
     final shell=t.widget<AndroidStudioShell>(find.byType(AndroidStudioShell));shell.onDestinationSelected(12);await t.pumpAndSettle();
     final bar=find.byKey(const ValueKey('compact-workbench-bar'));final before=t.getRect(bar);
     expect(before.height,56);expect(find.byType(AppBar),findsNothing);
     final category=find.byKey(const ValueKey('android-settings-category-access'));
     await t.ensureVisible(category);await t.tap(category);await t.pumpAndSettle();
     expect(t.widget<AndroidSettingsHub>(find.byType(AndroidSettingsHub)).category,AndroidSettingsCategory.access);
     final detail=find.byKey(const ValueKey('android-settings-detail-scroll'));
     await t.drag(detail,const Offset(0,-300));await t.pumpAndSettle();expect(t.getRect(bar),before);
     await t.tap(find.byKey(const ValueKey('compact-workbench-search')));await t.pumpAndSettle();
     final search=find.byKey(const ValueKey('android-settings-search'));expect(t.getRect(search).bottom,lessThanOrEqualTo(56));
     await t.enterText(search,'backup');await t.pumpAndSettle();expect(find.byKey(const ValueKey('android-settings-search-backup')),findsOneWidget);
     await capture(t,'settings-${size.width.toInt()}-${size.height.toInt()}-scale$scale');
     await t.tap(find.byKey(const ValueKey('compact-workbench-close-search')));await t.pumpAndSettle();
     shell.onDestinationSelected(0);await t.pumpAndSettle();
     expect(t.getRect(find.byKey(const ValueKey('android-create-operation-dock'))).height,lessThanOrEqualTo(80));
     expect(t.takeException(),isNull);
    }finally{await t.pumpWidget(const SizedBox.shrink());await t.pump();app.dispose();t.view.reset();debugDefaultTargetPlatformOverride=null;}
   });
  }
 }
 testWidgets('compact menu retains account, page actions, feature search and nested comic route',(t)async{
  debugDefaultTargetPlatformOverride=TargetPlatform.android;t.view.physicalSize=const Size(390,844);t.view.devicePixelRatio=1;
  final app=AppState()..booted=true;app.settings.language='zh-CN';app.settings.autoComplete=false;
  await app.japaneseComic.load();
  await t.runAsync(() => app.templateLibrary.load());
  try{
   await mount(t,app);
   await t.tap(find.byKey(const ValueKey('android-all-features')));await t.pumpAndSettle();
   expect(find.byIcon(Icons.manage_accounts_outlined),findsOneWidget);
   Navigator.of(t.element(find.byType(AndroidStudioShell))).pop();await t.pumpAndSettle();
   await t.tap(find.byKey(const ValueKey('compact-workbench-search')));await t.pumpAndSettle();
   await t.enterText(find.byKey(const ValueKey('workbench-feature-search')),'预设');await t.pumpAndSettle();
   expect(find.byKey(const ValueKey('android-catalog-7')),findsOneWidget);
   Navigator.of(t.element(find.byType(AndroidStudioShell))).pop();await t.pumpAndSettle();
   await t.tap(find.byKey(const ValueKey('android-group-3')));await t.pumpAndSettle();
   await t.tap(find.text('日式漫画生成器'));await t.pump(const Duration(milliseconds:400));
   await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds:200)));await t.pump(const Duration(milliseconds:400));
   // ignore: avoid_print
   print('TOOL_DIAGNOSTIC loaded=${app.japaneseComic.loaded} circular=${find.byType(CircularProgressIndicator).evaluate().length} linear=${find.byType(LinearProgressIndicator).evaluate().length} focus=${FocusManager.instance.primaryFocus?.debugLabel} scheduled=${t.binding.hasScheduledFrame}');
   expect(find.byType(ComicScreen),findsOneWidget);
   expect(find.byType(AppBar),findsNothing);
   final bar=find.byKey(const ValueKey('compact-tool-bar'));expect(t.getRect(bar).height,56);
   expect(t.getRect(find.byKey(const ValueKey('comic-step-3'))).height,lessThanOrEqualTo(52));
   final scroller=find.descendant(of:find.byType(ComicScreen),matching:find.byType(Scrollable)).first;
   final before=t.getRect(bar);await t.drag(scroller,const Offset(0,-400));await t.pumpAndSettle();expect(t.getRect(bar),before);
   await capture(t,'comic-after-scroll');
   await t.tap(find.byIcon(Icons.arrow_back).first);await t.pumpAndSettle();
   expect(find.byType(ComicScreen),findsNothing);expect(find.byKey(const ValueKey('compact-workbench-bar')),findsOneWidget);
   expect(t.takeException(),isNull);
  }finally{await t.pumpWidget(const SizedBox.shrink());await t.pump();app.dispose();t.view.reset();debugDefaultTargetPlatformOverride=null;}
 });
}

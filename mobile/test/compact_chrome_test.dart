import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/main.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';

Future<void> capture(WidgetTester t,String name) async {
 final dir=const String.fromEnvironment('COMPACT_CAPTURE_DIR');
 if(dir.isEmpty)return;
 await t.pump();
 final boundary=t.renderObject<RenderRepaintBoundary>(find.byKey(const ValueKey('capture')));
 await t.runAsync(()async{final image=await boundary.toImage(pixelRatio:2);final bytes=await image.toByteData(format:ui.ImageByteFormat.png);Directory(dir).createSync(recursive:true);File('$dir/$name.png').writeAsBytesSync(bytes!.buffer.asUint8List());image.dispose();});
}
Future<void> select(WidgetTester t,int i) async {
 final selector=find.byKey(const ValueKey('android-member-selector'));
 if(selector.evaluate().isNotEmpty){
  final drop=t.widget<DropdownButton<int>>(selector);drop.onChanged!(i);
 }else{final chip=find.byKey(ValueKey('android-member-$i'));await t.ensureVisible(chip);await t.tap(chip);}
 await t.pumpAndSettle();
}
void main(){
 setUp(()=>SharedPreferences.setMockInitialValues({'langbai.notice.v5-model-migration.seen':true}));
 testWidgets('real HomeShell keeps only compact fixed chrome above scrolling settings and creation',(t)async{
  debugDefaultTargetPlatformOverride=TargetPlatform.android;
  t.view.physicalSize=const Size(390,844);t.view.devicePixelRatio=1;
  final app=AppState()..booted=true;app.settings.language='zh-CN';app.settings.autoComplete=false;
  final fonts=FontLoader('AuditZh')..addFont(Future.value(ByteData.sublistView(File('C:/Windows/Fonts/msyh.ttc').readAsBytesSync())));
  await fonts.load();
  final icons=FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(File('F:/flutter/bin/cache/artifacts/material_fonts/materialicons-regular.otf').readAsBytesSync())));
  await icons.load();
  try{
   await t.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(theme:androidStudioTheme(StudioTheme.light()).copyWith(textTheme:StudioTheme.light().textTheme.apply(fontFamily:'AuditZh')),home:RepaintBoundary(key:const ValueKey('capture'),child:const HomeShell()))));await t.pumpAndSettle();
   await t.runAsync(() => precacheImage(const AssetImage('assets/relay-brand/logo.png'),t.element(find.byType(HomeShell))));await t.pumpAndSettle();
   await t.tap(find.byKey(const ValueKey('android-group-4')));await t.pumpAndSettle();
   await capture(t,'settings-before-scroll');
   final category=find.byKey(const ValueKey('android-settings-category-access'));
   final content=find.ancestor(of:category,matching:find.byType(SingleChildScrollView)).first;
   final top=t.getRect(content).top;
   final header=find.byKey(const ValueKey('compact-workbench-bar'));
   final headerRect=header.evaluate().isEmpty?null:t.getRect(header);
   await t.drag(content,const Offset(0,-520));await t.pumpAndSettle();
   await capture(t,'settings-after-scroll');
   final pinned=headerRect!=null && t.getRect(header)==headerRect;
   final bottom=t.getRect(find.byKey(const ValueKey('android-main-navigation')));
   print('COMPACT_METRICS '+jsonEncode({'settingsContentTop':top,'headerHeight':headerRect?.height,'headerPinned':pinned,'bottomNavigationTop':bottom.top}));
   expect(top,lessThanOrEqualTo(64),reason:'The real shell must not stack page tabs + My title + recommendation card + search field.');
   expect(pinned,isTrue);
   expect(headerRect!.height,lessThanOrEqualTo(56));
   await t.tap(find.byKey(const ValueKey('compact-workbench-search')));await t.pumpAndSettle();
   final search=find.byKey(const ValueKey('android-settings-search'));
   expect(t.getRect(search).bottom,lessThanOrEqualTo(64));
   await t.enterText(search,'备份');await t.pumpAndSettle();
   expect(find.byKey(const ValueKey('android-settings-search-backup')),findsOneWidget);
   await capture(t,'settings-search');
   await t.tap(find.byKey(const ValueKey('compact-workbench-close-search')));await t.pumpAndSettle();
   await t.tap(find.byKey(const ValueKey('android-group-0')));await t.pumpAndSettle();await select(t,0);
   final workspace=find.byKey(const ValueKey('android-create-workspace'));
   final dock=find.byKey(const ValueKey('android-create-operation-dock'));
   final list=find.byKey(const ValueKey('android-create-single-layout'));
   final dockRect=t.getRect(dock),listRect=t.getRect(list),bar=t.getRect(header);
   await capture(t,'create-before-scroll');await t.drag(list,const Offset(0,-420));await t.pumpAndSettle();await capture(t,'create-after-scroll');
   expect(t.getRect(header),bar);expect(t.getRect(dock),dockRect);
   expect(t.getRect(workspace).top,lessThanOrEqualTo(64));
   expect(dockRect.height,lessThanOrEqualTo(80));
   expect(listRect.height,greaterThan(590));
   expect(app.params.positivePrompt,isEmpty);
   expect(t.takeException(),isNull);
  }finally{await t.pumpWidget(const SizedBox.shrink());await t.pump();app.dispose();t.view.reset();debugDefaultTargetPlatformOverride=null;}
 });
}

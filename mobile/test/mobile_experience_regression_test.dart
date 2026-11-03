import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/comic/comic_controller.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

Future<void> mount(WidgetTester t, AppState app, Widget page, {double scale=1}) async {
  await t.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(
    theme:androidStudioTheme(StudioTheme.light()),builder:(c,child)=>MediaQuery(
      data:MediaQuery.of(c).copyWith(textScaler:TextScaler.linear(scale)),child:child!),home:page)));
  await t.pump(); await t.pump(const Duration(milliseconds:300));
}
void main(){
  setUp(()=>SharedPreferences.setMockInitialValues({}));
  testWidgets('image import actions do not cover painted generation viewport',(t) async {
    debugDefaultTargetPlatformOverride=TargetPlatform.android;
    final dir=Directory.systemTemp.createTempSync('langbai-preview-fixture-');
    final file=File('${dir.path}/fixture.png')..writeAsBytesSync(base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5N8AAAAASUVORK5CYII='));
    final app=AppState()..settings.autoComplete=false;app.settings.language='zh-CN';
    app.current=HistoryItem(id:'fixture',filePath:file.path,date:'2026-11-03',createdAt:'2026-11-03T00:00:00Z',seed:1,model:'fixture',width:1,height:1,prompt:'fixture');
    try {
      t.view.physicalSize=const Size(390,844);t.view.devicePixelRatio=1;
      await mount(t,app,const GenerateScreen());
      final image=find.byType(InteractiveViewer).first;
      final load=find.text('加载图片');
      expect(load,findsOneWidget);
      expect(t.getTopLeft(load).dy,greaterThanOrEqualTo(t.getBottomRight(image).dy),reason:'Image actions must be outside image viewport');
      expect(t.takeException(),isNull);
    } finally { await t.pumpWidget(const SizedBox.shrink()); await t.pump();app.dispose();dir.deleteSync(recursive:true);t.view.reset();debugDefaultTargetPlatformOverride=null; }
  });
  testWidgets('comic title remains single line and all four steps visible on phone',(t) async {
    final app=AppState();app.settings.language='zh-CN';final comic=ComicController(app,workspace:'japanese');await comic.load();
    try {
      t.view.physicalSize=const Size(360,800);t.view.devicePixelRatio=1;
      await mount(t,app,ComicScreen(controller:comic,onBack:(){}),scale:1.3);
      final title=find.text(comic.displayTitle);
      expect(t.widget<Text>(title).maxLines,1,reason:'Header title must not wrap behind status bar');
      final step=find.text('4');
      expect(step,findsOneWidget);
      expect(t.getRect(step).right,lessThanOrEqualTo(360));
      expect(t.takeException(),isNull);
    } finally { await t.pumpWidget(const SizedBox.shrink());await t.pump();comic.dispose();app.dispose();t.view.reset(); }
  });
}

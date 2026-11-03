import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/screens/settings_screen.dart';
import 'package:novelai_mobile/screens/aitag_gallery_screen.dart';
import 'package:novelai_mobile/screens/online_gallery_screen.dart';
import 'package:novelai_mobile/screens/settings/android_settings_hub.dart';
import 'package:novelai_mobile/services/aitag_service.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

class RecoveringGallery extends AitagService {
  int calls=0;String? selected;String? keyword;String? rank;
  @override Future<void> loadConfig() async {
    calls++;
    if(calls==1)throw StateError('fixture unavailable');
    availableMonths=['2026-10','2026-09'];availableYears=[2026];
  }
  @override Future<AitagSearchResult> search({int page=1,String query='',String prompt='',String sort='new',String? timeRange}) async {
    selected=timeRange;
    keyword=query;rank=sort;
    return AitagSearchResult(page:page,total:0,items:[]);
  }
}
void main(){
  setUp(()=>SharedPreferences.setMockInitialValues({}));
  for(final platform in [TargetPlatform.android,TargetPlatform.iOS]) {
    for(final size in [const Size(390,844),const Size(800,360)]) {
      testWidgets('settings banner stays pinned on scroll/details $platform $size',(t) async {
        debugDefaultTargetPlatformOverride=platform;
        final app=AppState();app.settings.language='zh-CN';
        t.view.physicalSize=size;t.view.devicePixelRatio=1;
        try {
          await t.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(theme:androidStudioTheme(StudioTheme.light()),home:const SettingsScreen())));
          await t.pumpAndSettle();
          final banner=find.byKey(const ValueKey('novelai-relay-recommendation'));
          final before=t.getRect(banner);
          if(platform==TargetPlatform.android){
            final search=find.byKey(const ValueKey('android-settings-search'));
            final searchBefore=t.getRect(search);
            final scroller=find.descendant(of:find.byType(SettingsScreen),matching:find.byType(SingleChildScrollView)).first;
            await t.drag(scroller,const Offset(0,-500));await t.pumpAndSettle();
            expect(t.getRect(search),searchBefore);expect(t.getRect(banner),before);
            await t.drag(scroller,const Offset(0,1000));await t.pumpAndSettle();
            final category=find.byKey(const ValueKey('android-settings-category-access'));
            await t.ensureVisible(category);await t.pumpAndSettle();await t.tap(category);await t.pumpAndSettle();
            expect(t.widget<AndroidSettingsHub>(find.byType(AndroidSettingsHub)).category,isNotNull);
            expect(t.getRect(banner),before);expect(t.getRect(search),searchBefore);
          }else{
            await t.drag(find.byType(ListView).first,const Offset(0,-500));await t.pumpAndSettle();
            expect(t.getRect(banner),before);
          }
          expect(t.takeException(),isNull);
        } finally {await t.pumpWidget(const SizedBox.shrink());await t.pump();app.dispose();t.view.reset();debugDefaultTargetPlatformOverride=null;}
      });
    }
  }
  testWidgets('monthly tab recovers a failed first config load and selects actual month',(t) async {
    final app=AppState();app.settings.language='zh-CN';final service=RecoveringGallery();
    try {
      await t.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(home:AitagGalleryScreen(service:service))));await t.pumpAndSettle();
      expect(service.calls,1);
      await t.tap(find.text('本月排行'));await t.pumpAndSettle();
      expect(service.calls,2);expect(service.availableMonths,['2026-10','2026-09']);
      expect(find.byKey(const ValueKey('aitag-months-load-error')),findsNothing);
      await t.tap(find.text('当前月份'));await t.pumpAndSettle();
      expect(find.text('2026-10'),findsOneWidget);
      await t.tap(find.text('2026-09'));await t.pumpAndSettle();
      expect(service.selected,'m2026-09');expect(t.takeException(),isNull);
    } finally {await t.pumpWidget(const SizedBox.shrink());await t.pump();app.dispose();}
  });
  testWidgets('real gallery shell refresh preserves selected monthly filter and draft query',(t) async {
    final app=AppState();app.settings.language='zh-CN';final service=RecoveringGallery();
    try {
      await t.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(home:OnlineGalleryScreen(aitagService:service))));await t.pumpAndSettle();
      await t.enterText(find.byType(TextField).first,'fixture query');
      await t.tap(find.text('本月排行'));await t.pumpAndSettle();
      await t.tap(find.text('当前月份'));await t.pumpAndSettle();await t.tap(find.text('2026-09'));await t.pumpAndSettle();
      final before=t.state(find.byType(AitagGalleryScreen));
      final refresh=find.descendant(of:find.byType(AppBar).first,matching:find.byIcon(Icons.refresh));
      await t.tap(refresh);await t.pumpAndSettle();
      expect(t.state(find.byType(AitagGalleryScreen)),same(before));
      expect(service.selected,'m2026-09');expect(service.keyword,'fixture query');expect(service.rank,'monthly');
      expect(t.widget<TextField>(find.byType(TextField).first).controller!.text,'fixture query');
      expect(t.takeException(),isNull);
    } finally {await t.pumpWidget(const SizedBox.shrink());await t.pump();app.dispose();}
  });
}

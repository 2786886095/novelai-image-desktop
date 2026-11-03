import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/settings_screen.dart';
import 'package:novelai_mobile/screens/novelai_accounts_screen.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
void main() {
 for(final platform in [TargetPlatform.android,TargetPlatform.iOS]) {
  testWidgets('settings top recommendation on ${platform.name}',(tester) async {
   final previous=debugDefaultTargetPlatformOverride;debugDefaultTargetPlatformOverride=platform;addTearDown(()=>debugDefaultTargetPlatformOverride=previous);
   tester.view.physicalSize=const Size(390,844);tester.view.devicePixelRatio=1;addTearDown(tester.view.reset);
   SharedPreferences.setMockInitialValues({});final state=AppState();state.settings.language='zh-CN';addTearDown(state.dispose);
   const channel=MethodChannel('plugins.flutter.io/url_launcher');final calls=<MethodCall>[];
   tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel,(c)async{calls.add(c);return true;});
   addTearDown(()=>tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel,null));
   final before=jsonEncode(state.settings.toJson());
   await tester.pumpWidget(ChangeNotifierProvider.value(value:state,child:MaterialApp(theme:androidStudioTheme(StudioTheme.light()),home:const SettingsScreen())));await tester.pumpAndSettle();
   final link=find.byKey(const ValueKey('novelai-relay-recommendation'));expect(link,findsOneWidget);
   expect(tester.getTopLeft(link).dy,lessThan(130));
   if(platform==TargetPlatform.android)expect(tester.getBottomLeft(link).dy,lessThanOrEqualTo(tester.getTopLeft(find.byKey(const ValueKey('android-settings-search'))).dy));
   else expect(tester.getTopLeft(link).dy,lessThan(tester.getTopLeft(find.byType(NovelAiAccountSelector)).dy));
   expect(find.byKey(const ValueKey('novelai-relay-logo')),findsOneWidget);
   await tester.tap(link);await tester.pumpAndSettle();expect(calls,hasLength(1));expect(calls.single.method,'launch');expect((calls.single.arguments as Map)['url'],'https://nai.langbai.cc');expect((calls.single.arguments as Map)['useWebView'],false);expect(jsonEncode(state.settings.toJson()),before);expect(tester.takeException(),isNull);
   await tester.pumpWidget(const SizedBox());await tester.pump();
  });
 }
}

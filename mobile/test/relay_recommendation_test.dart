import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/screens/novelai_accounts_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';

void main() {
  for (final succeeds in [true, false]) {
    testWidgets('account-page browser recommendation handoff $succeeds', (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final calls = <MethodCall>[];
      const channel = MethodChannel('plugins.flutter.io/url_launcher');
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {calls.add(call);return succeeds;});
      addTearDown(()=>tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel,null));
      final state = AppState();
      state.settings.language = 'zh-CN';
      final before = jsonEncode(state.settings.toJson());
      addTearDown(state.dispose);
      await tester.pumpWidget(ChangeNotifierProvider.value(value:state,child:const MaterialApp(home:NovelAiAccountsScreen())));
      await tester.pump();
      final link=find.byKey(const ValueKey('novelai-relay-recommendation'));
      expect(link,findsOneWidget);
      final logo = find.byKey(const ValueKey('novelai-relay-logo'));
      expect(logo,findsOneWidget);
      final image = tester.widget<Image>(logo);
      expect((image.image as AssetImage).assetName,'assets/relay-brand/logo.png');
      expect(image.width,24);
      expect(image.height,24);
      expect(tester.getTopLeft(link).dy,lessThan(170));
      await tester.tap(link);await tester.pumpAndSettle();
      expect(calls,hasLength(1));expect(calls.single.method,'launch');
      final args=calls.single.arguments as Map;
      expect(args['url'],'https://nai.langbai.cc');expect(args['useWebView'],false);expect(args['useSafariVC'],false);
      expect(jsonEncode(state.settings.toJson()),before);
      if(!succeeds) expect(find.byType(SnackBar),findsOneWidget);
      expect(tester.takeException(),isNull);
      await tester.pumpWidget(const SizedBox.shrink());await tester.pump();
    });
  }
}

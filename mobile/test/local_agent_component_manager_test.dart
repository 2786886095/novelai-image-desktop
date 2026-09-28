import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/local_agent_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 testWidgets('opening only checks metadata; first download shows size and cancel makes no prepare call', (tester) async {
  tester.view.physicalSize=const Size(390,844);tester.view.devicePixelRatio=1;
  addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
  final calls=<String>[];final visible=ValueNotifier(true);final app=AppState(storage:Storage())..settings=AppSettings(language:'zh-CN');
  const channel=MethodChannel('langbai.novelai/local_agent');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,(call) async {
   calls.add(call.method);
   if(call.method=='status')return {'supported':true,'phase':'not_installed','busy':false,'componentCheckedAt':1,'downloadAvailable':true,'candidate':'0.1.7','runtimeBytes':406534178,'dataDirectory':'fixture'};
   if(call.method=='backups')return <String>[];
   if(call.method=='planDownload')return {'token':'quote','bytes':406534178,'version':'0.1.7'};
   if(call.method=='prepare')expect((call.arguments as Map)['downloadToken'],'quote');return null;
  });
  await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(value:app,child:MaterialApp(home:LocalAgentScreen(visible:visible))));for(var tick=0;tick<5;tick++){await tester.pump(const Duration(milliseconds:100));}
  expect(calls,contains('check'));expect(calls, isNot(contains('prepare')));
  await tester.tap(find.text('安装组件'));for(var tick=0;tick<5;tick++){await tester.pump(const Duration(milliseconds:100));}expect(find.byType(AlertDialog),findsOneWidget);expect(find.textContaining('387.7 MiB'),findsOneWidget);expect(calls,isNot(contains('prepare')));
  await tester.tap(find.text('取消'));for(var tick=0;tick<5;tick++){await tester.pump(const Duration(milliseconds:100));}expect(calls,isNot(contains('prepare')));
  await tester.tap(find.text('安装组件'));for(var tick=0;tick<5;tick++){await tester.pump(const Duration(milliseconds:100));}await tester.tap(find.descendant(of:find.byType(AlertDialog),matching:find.byType(FilledButton)));for(var tick=0;tick<5;tick++){await tester.pump(const Duration(milliseconds:100));}expect(calls.where((c)=>c=='prepare').length,1);
  expect(tester.takeException(),isNull);
  await tester.pumpWidget(const SizedBox());for(var tick=0;tick<5;tick++){await tester.pump(const Duration(milliseconds:100));}visible.dispose();app.dispose();
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,null);
 });
 testWidgets('uninstall cancellation is inert and confirmation passes the explicit native flag', (tester) async {
  final calls=<String>[];var installed=true;final visible=ValueNotifier(true);final app=AppState(storage:Storage())..settings=AppSettings(language:'zh-CN');
  const channel=MethodChannel('langbai.novelai/local_agent');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,(call) async {
   calls.add(call.method);
   if(call.method=='status')return {'supported':true,'phase':'stopped','busy':false,'installed':installed?'0.1.7':null,'componentCheckedAt':1,'downloadAvailable':true,'candidate':'0.1.7','dataDirectory':'fixture'};
   if(call.method=='backups')return <String>[];
   if(call.method=='uninstall'){expect((call.arguments as Map)['confirmed'],true);installed=false;}return null;
  });
  Future<void> flush()async {for(var i=0;i<5;i++){await tester.pump(const Duration(milliseconds:100));}}
  await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(value:app,child:MaterialApp(home:LocalAgentScreen(visible:visible))));await flush();
  final button=find.widgetWithText(OutlinedButton,'卸载组件');await tester.ensureVisible(button);await tester.tap(button);await flush();
  expect(find.textContaining('卸载仅移除运行组件'),findsWidgets);await tester.tap(find.text('取消'));await flush();expect(calls,isNot(contains('uninstall')));
  await tester.tap(button);await flush();await tester.tap(find.descendant(of:find.byType(AlertDialog),matching:find.byType(FilledButton)));await flush();expect(calls.where((c)=>c=='uninstall').length,1);expect(installed,false);expect(tester.takeException(),isNull);
  await tester.pumpWidget(const SizedBox());await flush();visible.dispose();app.dispose();TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel,null);
 });

}

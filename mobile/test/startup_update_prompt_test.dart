import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/services/update_service.dart';
import 'package:novelai_mobile/services/update_prompt_gate.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/startup_update_prompt.dart';
import 'package:novelai_mobile/main.dart';

const newer=UpdateInfo(hasUpdate:true,currentVersion:'2.7.2',latestVersion:'2.7.3');
class FakeApp extends AppState {
  int installs=0;
  bool simulatedBusy=false;
  @override bool get updateTaskBusy => simulatedBusy;
  @override Future<void> installAppUpdate() async { installs++; }
  void emit(){notifyListeners();}
}
void main(){
  setUp(()=>SharedPreferences.setMockInitialValues({}));
  test('claim is once across repeated checks/restarts but allows next version',() async {
    final gate=UpdatePromptGate();
    expect(await gate.claim(newer),true);
    expect(await gate.claim(newer),false);
    expect(await UpdatePromptGate().claim(newer),false);
    expect(await gate.claim(const UpdateInfo(hasUpdate:true,currentVersion:'2.7.2',latestVersion:'2.7.4')),true);
    expect(await gate.claim(const UpdateInfo(hasUpdate:true,currentVersion:'2.7.2',latestVersion:'2.7.2')),false);
    expect(await gate.claim(const UpdateInfo(hasUpdate:true,currentVersion:'2.7.2',latestVersion:'2.7.5',error:'offline')),false);
  });
  test('concurrent automatic checks cannot claim two dialogs',() async {
    final gate=UpdatePromptGate();
    expect((await Future.wait([gate.claim(newer),gate.claim(newer)])).where((v)=>v).length,1);
  });
  for(final action in ['cancel','install','browser']) {
    testWidgets('startup update $action is explicit and never repeats',(t) async {
      final app=FakeApp()..booted=true..updateInfo=newer;app.settings.language='zh-CN';
      final calls=<MethodCall>[];
      const channel=MethodChannel('plugins.flutter.io/url_launcher');
      t.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel,(c) async {calls.add(c);return true;});
      try {
        Widget root()=>ChangeNotifierProvider<AppState>.value(value:app,child:MaterialApp(theme:ThemeData(platform:TargetPlatform.android),home:const StartupUpdatePrompt(child:Scaffold(body:Text('fixture')))));
        await t.pumpWidget(root());await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('startup-update-dialog')),findsOneWidget);
        expect(app.installs,0);expect(calls,isEmpty);
        await t.tap(find.byKey(ValueKey('startup-update-$action')));await t.pumpAndSettle();
        expect(app.installs,action=='install'?1:0);
        expect(calls.length,action=='browser'?1:0);
        if(calls.isNotEmpty)expect((calls.single.arguments as Map)['url'],'https://github.com/2786886095/novelai-image-desktop/releases/latest');
        app.emit();await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('startup-update-dialog')),findsNothing);
        await t.pumpWidget(const SizedBox.shrink());await t.pump();
        await t.pumpWidget(root());await t.pumpAndSettle();
        expect(find.byKey(const ValueKey('startup-update-dialog')),findsNothing);
        expect(t.takeException(),isNull);
      } finally {await t.pumpWidget(const SizedBox.shrink());await t.pump();app.dispose();t.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel,null);}
    });
  }
  testWidgets('onboarding gate prevents automatic prompt until ready',(t) async {
    final app=FakeApp()..booted=true..updateInfo=newer;
    Widget root(bool ready)=>ChangeNotifierProvider<AppState>.value(value:app,child:MaterialApp(home:StartupUpdatePrompt(ready:ready,child:const Scaffold())));
    await t.pumpWidget(root(false));await t.pumpAndSettle();expect(find.byType(AlertDialog),findsNothing);
    await t.pumpWidget(root(true));await t.pumpAndSettle();expect(find.byType(AlertDialog),findsOneWidget);
    await t.pumpWidget(const SizedBox.shrink());await t.pump();app.dispose();
  });
  testWidgets('running tasks defer the prompt and a later task blocks installation',(t) async {
    final app=FakeApp()..booted=true..updateInfo=newer..simulatedBusy=true;
    await t.pumpWidget(ChangeNotifierProvider<AppState>.value(value:app,child:MaterialApp(theme:ThemeData(platform:TargetPlatform.android),home:const StartupUpdatePrompt(child:Scaffold()))));
    await t.pumpAndSettle();expect(find.byType(AlertDialog),findsNothing);
    app.simulatedBusy=false;app.emit();await t.pumpAndSettle();expect(find.byType(AlertDialog),findsOneWidget);
    app.simulatedBusy=true;app.emit();await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('startup-update-install')));await t.pumpAndSettle();expect(app.installs,0);
    await t.pumpWidget(const SizedBox.shrink());await t.pump();app.dispose();
  });
  testWidgets('V5 migration notice finishes before startup update is presented',(t) async {
    final app=FakeApp()..booted=true..needsNetworkOnboarding=false..updateInfo=newer;
    app.settings.language='zh-CN';app.params.model='nai-diffusion-4-5-full';
    await t.pumpWidget(ChangeNotifierProvider<AppState>.value(value:app,child:const MaterialApp(home:HomeShell())));
    await t.pumpAndSettle();
    expect(find.text('NovelAI V5 Full 已上线'),findsOneWidget);
    expect(find.byKey(const ValueKey('startup-update-dialog')),findsNothing);
    expect(find.byType(AlertDialog),findsOneWidget);
    await t.tap(find.text('保持当前模型'));await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('startup-update-dialog')),findsOneWidget);
    expect(find.byType(AlertDialog),findsOneWidget);
    expect(t.takeException(),isNull);
    await t.pumpWidget(const SizedBox.shrink());await t.pump();app.dispose();
  });
}

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/screens/studio_agent_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/android/android_studio_shell.dart';
import 'package:novelai_mobile/ui/studio_shell.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'studio_agent_screen_ux_test.dart' show UxStorage,UxController;
void main(){
 testWidgets('moved Agent resource action dismisses menu before opening the actual drawer',(t)async{
  debugDefaultTargetPlatformOverride=TargetPlatform.android;t.view.physicalSize=const Size(390,844);t.view.devicePixelRatio=1;
  final storage=UxStorage(),app=AppState(storage:UxStorage());
  final controller=UxController(app:app)..workspace=storage.fixture..loaded=true;
  try{
   await t.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(theme:StudioTheme.light(),home:AndroidStudioShell(
    selectedIndex:9,onDestinationSelected:(_){},language:'zh-CN',
    destinations:[for(var i=0;i<15;i++)StudioDestination(label:'Page $i',icon:Icons.apps,selectedIcon:Icons.apps)],
    pages:[for(var i=0;i<15;i++)i==9?StudioAgentScreen(controller:controller):const SizedBox()]))));await t.pumpAndSettle();
   await t.tap(find.byKey(const ValueKey('android-all-features')));await t.pumpAndSettle();
   await t.tap(find.byIcon(Icons.menu_book_outlined).last);await t.pumpAndSettle();
   expect(find.byType(BottomSheet),findsNothing,reason:'A drawer opened behind the action sheet is not usable.');
   final scaffold=find.descendant(of:find.byType(StudioAgentScreen),matching:find.byType(Scaffold)).first;
   expect(t.state<ScaffoldState>(scaffold).isEndDrawerOpen,isTrue);
   expect(t.takeException(),isNull);
  }finally{await t.pumpWidget(const SizedBox.shrink());await t.pump();controller.dispose();app.dispose();t.view.reset();debugDefaultTargetPlatformOverride=null;}
 });
}

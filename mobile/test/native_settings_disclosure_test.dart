// Host UI/source-wiring contracts only. Windows does not have the Android
// chooser; no fake platform, FilePicker response, MethodChannel or OS driver.
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/screens/settings_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/settings_section.dart';
import '../integration_test/native_settings_disclosure.dart';
import '../integration_test/native_ui_actions.dart';

const childKey = ValueKey('copy-original-metadata-setting');
const chooserKey = ValueKey('image-output-choose');
Future<void> hostTap(WidgetTester tester, Element heading) async {
  await Scrollable.ensureVisible(heading, alignment: .5, duration: Duration.zero);
  await tester.pump();
  final box = heading.findRenderObject() as RenderBox;
  await tester.tapAt(box.localToGlobal(box.size.center(Offset.zero)));
  await tester.pump();
}
Future<void> originalScrollOnly(WidgetTester tester, Key key) async {
  for (var i = 0; i < 100; i++) {
    if (nativeUiElements((w) => w.key == key).isNotEmpty) {
      return;
    }
    final scroll = nativeUiElements((w) => w is Scrollable);
    final p = ((scroll.first as StatefulElement).state as ScrollableState).position;
    p.jumpTo((p.pixels + 400).clamp(p.minScrollExtent, p.maxScrollExtent));
    await tester.pump(const Duration(milliseconds: 50));
  }
}
void main() {
  test('real Android entry expands disclosure before the unchanged picker handshake', () {
    final entry = File('integration_test/native_android_output_folder_scenario.dart').readAsStringSync();
    expect(entry,contains("import 'native_settings_disclosure.dart';"));
    expect(entry,contains('await nativeSettingsControl('));
    expect(entry,contains('settingsScreenTextFor(c.app.settings.language).storageSection'));
    expect(entry,contains("require(choose != null, 'Actual generated-output chooser was not exposed')"));
    expect(entry.indexOf('await nativeSettingsControl('),lessThan(entry.indexOf("print('NATIVE_FOLDER_PICKER_REQUEST:")));
    for(final unchanged in ["await nativeUiTap(choose!)", "'deadlineSeconds': 180", "StoragePermission.hasAllFilesAccess()", "Driver did not choose the nonce-scoped disposable folder", "An app-managed folder cannot substitute for external native selection", "Generated output did not use selected date/group layout", "Fresh persisted history lost the actual selected output association"]){expect(entry,contains(unchanged));}
  });
  testWidgets('real SettingsScreen scroll-only misses collapsed child; helper exposes it by actual header tap',(tester)async{
    tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(360,800);
    final app=AppState();app.settings.language='en-US';
    addTearDown(()async{await tester.pumpWidget(const SizedBox.shrink());app.dispose();tester.view.reset();});
    await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:const MaterialApp(home:SettingsScreen())));await tester.pump();
    await originalScrollOnly(tester,childKey);expect(find.byKey(childKey,skipOffstage:false),findsNothing);
    final p=((nativeUiElements((w)=>w is Scrollable).first as StatefulElement).state as ScrollableState).position;p.jumpTo(0);await tester.pump();
    var taps=0;
    final result=await nativeSettingsControl(sectionTitle:'Storage & History',targetKey:childKey,waitFrame:()=>tester.pump(const Duration(milliseconds:50)),tapDisclosure:(e)async{taps++;await hostTap(tester,e);});
    expect(result,isNotNull);expect(result!.widget.key,childKey);expect(taps,1);expect(find.byKey(childKey),findsOneWidget);expect(tester.takeException(),isNull);
  });
  testWidgets('production SettingsSection keyed fixture action mounts only after one real disclosure tap',(tester)async{
    var actionCalls=0,taps=0;
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:SettingsSection(title:'Storage & History',children:[OutlinedButton(key:chooserKey,onPressed:(){actionCalls++;},child:const Text('Host fixture action; not an OS picker'))]))));
    expect(find.byKey(chooserKey,skipOffstage:false),findsNothing);
    final result=await nativeSettingsControl(sectionTitle:'Storage & History',targetKey:chooserKey,waitFrame:()=>tester.pump(const Duration(milliseconds:50)),tapDisclosure:(e)async{taps++;await hostTap(tester,e);});
    expect(result,isNotNull);expect(result!.widget,isA<OutlinedButton>());expect(taps,1);expect(actionCalls,0);expect(tester.takeException(),isNull);
  });
  testWidgets('already exposed target does not toggle its production disclosure closed',(tester)async{
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:SettingsSection(title:'Storage & History',children:[OutlinedButton(key:chooserKey,onPressed:(){},child:const Text('Host fixture only'))]))));
    await tester.tap(find.byType(ExpansionTile));await tester.pumpAndSettle();
    final result=await nativeSettingsControl(sectionTitle:'Storage & History',targetKey:chooserKey,waitFrame:()=>tester.pump(),tapDisclosure:(_)async{fail('Existing target must not toggle disclosure');});
    expect(result,isNotNull);expect(find.byKey(chooserKey),findsOneWidget);
  });
  testWidgets('unknown disclosure/target is bounded and never invents a result',(tester)async{
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:SingleChildScrollView(child:Text('Actual empty scrollable')))));
    var frames=0,taps=0;
    final result=await nativeSettingsControl(sectionTitle:'Missing disclosure',targetKey:chooserKey,waitFrame:()async{frames++;await tester.pump();},tapDisclosure:(_)async{taps++;});
    expect(result,isNull);expect(frames,100);expect(taps,0);
  });
}

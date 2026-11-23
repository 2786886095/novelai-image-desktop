import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/batch/batch_redraw_models.dart';
import 'package:novelai_mobile/screens/batch_redraw_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:image/image.dart' as img;
import 'batch_shared_queue_test.dart' show MemoryStorage, QueueApi, until;
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 setUp(()=>SharedPreferences.setMockInitialValues({}));
 testWidgets('move B before A in the import UI, then reopen the project', (t) async {
 t.view.physicalSize=const Size(800,1100);t.view.devicePixelRatio=1;
 addTearDown((){t.view.resetPhysicalSize();t.view.resetDevicePixelRatio();});
 final storage=MemoryStorage(), app=AppState(storage:storage,api:QueueApi());
 final c=app.batchRedraw;await c.load();
 final bytes=base64Encode(img.encodePng(img.Image(width:3,height:3)));
 c.project=BatchRedrawProject.empty(app.params)..items=[for(final id in ['A','B','C'])BatchRedrawItem(id:id,name:'$id.png',base64:bytes,prompt:'role-$id')];
 await t.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(home:BatchRedrawScreen(controller:c))));
 await t.pumpAndSettle();final menu=find.byKey(const ValueKey('batch-input-actions-B'));
 // Old builds only offer removal, so the working order remains ABC.
 if(menu.evaluate().isNotEmpty){await t.ensureVisible(menu);await t.tap(menu);await t.pumpAndSettle();
 await t.tap(find.byWidgetPredicate((w)=>w is PopupMenuItem<String> && w.value=='up'));await t.pumpAndSettle();}
 await c.flush();final result=(await storage.getBatchRedrawProject(app.params)).items.map((v)=>v.id).join();
 await t.pumpWidget(const SizedBox());app.dispose();debugPrint('UI queue order: $result');
 expect(result,'BAC');
 });
 test('worker consumes ordered images with their own prompts and refuses an in-flight move',() async{
 final api=QueueApi(),storage=MemoryStorage(),app=AppState(api:api,storage:storage);
 final c=app.batchRedraw;await c.load();c.project=BatchRedrawProject.empty(app.params)..items=[
 for(final id in ['A','B','C'])BatchRedrawItem(id:id,name:'$id.png',base64:base64Encode(id.codeUnits),prompt:'subject-$id')];
 expect(c.moveInput('A',-1),isFalse);expect(c.moveInput('B',-1),isTrue);expect(c.moveInput('A',1),isTrue);
 final gate=Completer<(List<Uint8List>,int)>();api.handler=()=>gate.future;
 final work=c.startQueue(c.project.items);await until(()=>api.calls==1);expect(c.moveInput('A',-1),isFalse);
 gate.complete(([Uint8List.fromList([2])],42));await work;
 final ids=api.sources.map(String.fromCharCodes).join();final prompts=api.paramsSeen.map((p)=>p.positivePrompt).join(',');
 debugPrint('Worker: $ids; $prompts');expect(ids,'BCA');expect(prompts,'subject-B,subject-C,subject-A');expect(c.runPhase,'completed');app.dispose();
 });
}


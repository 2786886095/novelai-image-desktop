import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/inpaint/focused_inpaint.dart';
import 'package:novelai_mobile/inpaint/inpaint_edit_session.dart';
import 'package:novelai_mobile/inpaint/inpaint_mask.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/inpaint_mask_editor.dart';
import 'package:novelai_mobile/screens/tools_screen.dart';

Uint8List png(int w,int h)=>Uint8List.fromList(im.encodePng(im.Image(width:w,height:h,numChannels:4)..clear(im.ColorRgba8(40,50,60,255))));
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 setUp(()=>SharedPreferences.setMockInitialValues({}));
 for(final sign in [(1,1),(-1,1),(1,-1),(-1,-1)]){
  test('source-pixel cap preserves drag anchor in direction $sign',(){
   final r=clampFocusedInpaintDrag(1920,1080,1920+sign.$1*1800,1080+sign.$2*1000,3840,2160);
   expect(r.width*r.height,lessThanOrEqualTo(589824));expect(r.width,greaterThanOrEqualTo(32));
   expect(sign.$1<0?r.x+r.width:r.x,1920);expect(sign.$2<0?r.y+r.height:r.y,1080);
   final p=focusedInpaintPlan(r,3840,2160);expect(p.size.width*p.size.height,lessThanOrEqualTo(1048576));expect(p.size.width%64,0);expect(p.size.height%64,0);
  });
 }
 test('engine switch clamps immediately without changing mask/custom dimensions',(){
  final a=AppState()..workbenchImage=const WorkingImage(filePath:'synthetic',width:3840,height:2160)..inpaintEngine='openai'..inpaintCustomSize=(width:704,height:1408);
  addTearDown(a.dispose);a.setInpaintRegion((x:0,y:0,width:1600,height:900));expect(a.inpaintRegion!.width*a.inpaintRegion!.height,1440000);
  a.setInpaintEditorData([InpaintStroke(brushCells:4,points:[const Offset(.5,.5)])],false);a.setInpaintEngine('novelai');
  expect(a.inpaintRegion!.width*a.inpaintRegion!.height,lessThanOrEqualTo(589824));expect(a.inpaintCustomSize,(width:704,height:1408));expect(a.inpaintEditorStrokes,hasLength(1));
  expect((a.inpaintOutputParams.width,a.inpaintOutputParams.height),(1344,768));
 });
 for(final mode in ['latest','original']){
  test('return to edit restores original/mask/ROI atomically in $mode mode',()async{
   final root=await Directory.systemTemp.createTemp('return-edit-mobile-');final file=File('${root.path}/source.png')..writeAsBytesSync(png(512,512));
   final strokes=[InpaintStroke(brushCells:4,points:[const Offset(.3,.4),const Offset(.5,.6)])];
   final mask=await renderInpaintMask(strokes:strokes,width:512,height:512,inverted:false);
   final original=WorkingImage(filePath:file.path,width:512,height:512);
   final a=AppState()..workbenchImage=const WorkingImage(filePath:'latest-result',width:512,height:512)..inpaintEditSession=InpaintEditSession(source:original,original:original,sourceMode:mode,engine:'novelai',sizeMode:'custom',customSize:(width:704,height:1408),region:(x:64,y:64,width:256,height:256),maskBytes:mask,strokes:strokes,inverted:false)..comparisonSurface='inpaint'..comparisonAfter=const WorkingImage(filePath:'latest-result',width:512,height:512)..comparisonBefore=original;
   addTearDown(a.dispose);final history=a.history.toList();expect(await a.restoreInpaintEditSession(),true);
   expect(a.workbenchImage!.filePath,file.path);expect(a.inpaintSourceMode,mode);expect(a.inpaintRegion,(x:64,y:64,width:256,height:256));expect(a.inpaintCustomSize,(width:704,height:1408));
   final restored=await renderInpaintMask(strokes:a.inpaintEditorStrokes,width:512,height:512,inverted:a.inpaintEditorInverted);expect(restored,mask);
   expect(a.comparisonSurface,isNull);expect(a.history,history);a.inpaintEditorStrokes.add(InpaintStroke(brushCells:4,points:[const Offset(.8,.8)]));expect(a.inpaintEditorStrokes,hasLength(2));
  });
 }
 for(final fault in ['missing-original','corrupt-mask']){
  test('restore $fault keeps current editor and recovery snapshot',()async{
   final root=await Directory.systemTemp.createTemp('return-edit-mobile-error-');final f=File('${root.path}/source.png');if(fault!='missing-original')f.writeAsBytesSync(png(64,64));
   final old=const WorkingImage(filePath:'current-safe',width:64,height:64),source=WorkingImage(filePath:f.path,width:64,height:64);
   final a=AppState()..workbenchImage=old..inpaintRegion=(x:0,y:0,width:32,height:32)..inpaintEditSession=InpaintEditSession(source:source,original:source,sourceMode:'latest',engine:'novelai',sizeMode:'original',customSize:(width:1024,height:1024),region:null,maskBytes:fault=='corrupt-mask'?Uint8List.fromList([1,2]):png(64,64),strokes:[],inverted:false);
   addTearDown(a.dispose);final session=a.inpaintEditSession;expect(await a.restoreInpaintEditSession(),false);expect(a.workbenchImage,same(old));expect(a.inpaintRegion,(x:0,y:0,width:32,height:32));expect(a.inpaintEditSession,same(session));expect(a.isRestoringInpaintEditSession,false);
  });
 }
 testWidgets('actual 4K editor shows capped rectangle and cancels <32 source-pixel draft',(tester)async{
  tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(1100,800);addTearDown(tester.view.reset);
  await tester.pumpWidget(const MaterialApp(home:InpaintMaskEditor(image:WorkingImage(filePath:'synthetic',width:3840,height:2160),language:'en-US',imageProvider:AssetImage('assets/icon/app_icon.png'))));await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('select-inpaint-region')));await tester.pump();final rect=tester.getRect(find.byKey(const ValueKey('inpaint-mask-canvas')));
  var g=await tester.startGesture(rect.topLeft+const Offset(2,2));await g.moveTo(rect.bottomRight-const Offset(2,2));await g.up();await tester.pump();
  final label=tester.widget<Text>(find.descendant(of:find.byKey(const ValueKey('focused-inpaint-region')),matching:find.byType(Text))).data!;
  final dims=label.split('×').map(int.parse).toList();expect(dims[0]*dims[1],lessThanOrEqualTo(589824));
  g=await tester.startGesture(rect.center);await g.moveBy(Offset(rect.width/3840*24,rect.height/2160*24));await g.up();await tester.pump();expect(find.byKey(const ValueKey('focused-inpaint-region')),findsNothing);expect(tester.takeException(),isNull);
 });
 testWidgets('actual return-edit button restores mask and keeps it editable',(tester)async{
  tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(900,900);addTearDown(tester.view.reset);
  final root=Directory.systemTemp.createTempSync('return-edit-widget-');final file=File('${root.path}/source.png')..writeAsBytesSync(png(512,512));final result=File('${root.path}/result.png')..writeAsBytesSync(png(512,512));
  final source=WorkingImage(filePath:file.path,width:512,height:512),strokes=[InpaintStroke(brushCells:4,points:[const Offset(.4,.4)])];final mask=(await tester.runAsync(()=>renderInpaintMask(strokes:strokes,width:512,height:512,inverted:false)))!;
  final a=AppState()..workbenchImage=WorkingImage(filePath:result.path,width:512,height:512)..inpaintEditSession=InpaintEditSession(source:source,original:source,sourceMode:'latest',engine:'novelai',sizeMode:'original',customSize:(width:1024,height:1024),region:(x:64,y:64,width:256,height:256),maskBytes:mask,strokes:strokes,inverted:false);addTearDown(a.dispose);
  await tester.pumpWidget(ChangeNotifierProvider.value(value:a,child:const MaterialApp(home:ToolsScreen(kind:ToolPageKind.inpaint))));await tester.pumpAndSettle();
  await tester.scrollUntilVisible(find.byKey(const ValueKey('inpaint-return-edit')),450,scrollable:find.byType(Scrollable).first);await tester.pumpAndSettle();await tester.runAsync(()async{await tester.tap(find.byKey(const ValueKey('inpaint-return-edit')));for(var i=0;i<100&&a.isRestoringInpaintEditSession;i++){await Future<void>.delayed(const Duration(milliseconds:10));}});await tester.pumpAndSettle();
  expect(a.workbenchImage!.filePath,file.path);expect(a.inpaintEditorStrokes,hasLength(1));
  await tester.ensureVisible(find.byKey(const ValueKey('edit-inpaint-mask')));await tester.pumpAndSettle();await tester.tap(find.byKey(const ValueKey('edit-inpaint-mask')));await tester.pumpAndSettle();
  final rect=tester.getRect(find.byKey(const ValueKey('inpaint-mask-canvas')));await tester.dragFrom(rect.center,const Offset(40,20));await tester.tap(find.byKey(const ValueKey('inpaint-mask-done')));await tester.pumpAndSettle();expect(a.inpaintEditorStrokes,hasLength(2));expect(tester.takeException(),isNull);
 });
}

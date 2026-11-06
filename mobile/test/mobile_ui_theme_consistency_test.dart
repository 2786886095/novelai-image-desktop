import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
Future<void> capture(WidgetTester tester,String name) async {
 final dir=Platform.environment['RESULT_SCREENSHOTS'];if(dir==null)return;
 final phase=Platform.environment['UI_CAPTURE_PHASE']??'TRANSACTION';
 await tester.runAsync(() async {
  final image=await tester.renderObject<RenderRepaintBoundary>(find.byKey(const ValueKey('capture'))).toImage();
  final bytes=await image.toByteData(format:ui.ImageByteFormat.png);
  await Directory(dir).create(recursive:true);await File('$dir/$phase-$name.png').writeAsBytes(bytes!.buffer.asUint8List());image.dispose();
 });
}
void main(){
 setUpAll(()async{
  await (FontLoader('Roboto')..addFont(rootBundle.load('assets/ui-fonts/LXGWWenKaiLite-Regular.ttf'))).load();
  await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
 });
 for(final dark in [false,true]) {
 final name=dark?'dark':'light';
 ThemeData theme()=>androidStudioTheme(dark?StudioTheme.dark():StudioTheme.light());
 testWidgets('$name actual fields keep control radius when disabled or invalid',(tester)async{
  await tester.pumpWidget(MaterialApp(debugShowCheckedModeBanner:false,theme:theme(),home:const Scaffold(body:Column(children:[
   TextField(key:ValueKey('disabled'),enabled:false,decoration:InputDecoration(labelText:'禁用',border:OutlineInputBorder())),
   TextField(key:ValueKey('invalid'),decoration:InputDecoration(labelText:'错误',errorText:'错误示例',border:OutlineInputBorder())),
  ]))));await tester.pumpAndSettle();
  final disabled=tester.widget<InputDecorator>(find.descendant(of:find.byKey(const ValueKey('disabled')),matching:find.byType(InputDecorator)));
  final invalid=tester.widget<InputDecorator>(find.descendant(of:find.byKey(const ValueKey('invalid')),matching:find.byType(InputDecorator)));
  final disabledBorder=(disabled.decoration.disabledBorder??disabled.decoration.border) as OutlineInputBorder;
  final errorBorder=(invalid.decoration.errorBorder??invalid.decoration.border) as OutlineInputBorder;
  expect(disabledBorder.borderRadius,BorderRadius.circular(StudioRadii.control));
  expect(errorBorder.borderRadius,BorderRadius.circular(StudioRadii.control));
  expect(theme().inputDecorationTheme.focusedErrorBorder,isA<OutlineInputBorder>());
 });
 test('$name dialog uses shared surface token',(){final shape=theme().dialogTheme.shape;expect(shape,isA<RoundedRectangleBorder>());expect((shape as RoundedRectangleBorder).borderRadius,BorderRadius.circular(StudioRadii.dialog));});
 test('$name bottom sheet uses shared surface token',(){final shape=theme().bottomSheetTheme.shape;expect(shape,isA<RoundedRectangleBorder>());expect((shape as RoundedRectangleBorder).borderRadius,const BorderRadius.vertical(top:Radius.circular(StudioRadii.sheet)));});
 test('$name popup uses shared control token',(){final shape=theme().popupMenuTheme.shape;expect(shape,isA<RoundedRectangleBorder>());expect((shape as RoundedRectangleBorder).borderRadius,BorderRadius.circular(StudioRadii.control));});
 testWidgets('$name shared controls and surfaces render with real widgets',(tester)async{
  tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(420,900);addTearDown(tester.view.reset);
  await tester.pumpWidget(RepaintBoundary(key:const ValueKey('capture'),child:MaterialApp(debugShowCheckedModeBanner:false,theme:theme().copyWith(platform:TargetPlatform.android),home:Scaffold(
   appBar:AppBar(title:const Text('移动端共享控件')),
   body:Builder(builder:(context)=>ListView(padding:const EdgeInsets.all(16),children:[
    const TextField(decoration:InputDecoration(labelText:'正常输入',hintText:'填写内容',border:OutlineInputBorder())),const SizedBox(height:12),
    const TextField(enabled:false,decoration:InputDecoration(labelText:'禁用输入',hintText:'当前不可编辑',border:OutlineInputBorder())),const SizedBox(height:12),
    const TextField(decoration:InputDecoration(labelText:'错误输入',errorText:'请检查当前数值',border:OutlineInputBorder())),const SizedBox(height:12),
    const TextField(autofocus:true,decoration:InputDecoration(labelText:'聚焦错误输入',errorText:'保持统一圆角与错误边框',border:OutlineInputBorder())),const SizedBox(height:12),
    Wrap(spacing:8,runSpacing:8,children:[FilledButton(onPressed:(){},child:const Text('主要操作')),OutlinedButton(onPressed:(){},child:const Text('次要操作')),const FilledButton(onPressed:null,child:Text('禁用操作'))]),
    const SizedBox(height:12),OutlinedButton(onPressed:()=>showDialog<void>(context:context,builder:(c)=>AlertDialog(title:const Text('统一确认弹窗'),content:const Text('保留内容、焦点和返回操作，使用共享圆角与主题颜色。'),actions:[TextButton(onPressed:()=>Navigator.pop(c),child:const Text('返回'))])),child:const Text('打开确认弹窗')),
    OutlinedButton(onPressed:()=>showModalBottomSheet<void>(context:context,builder:(c)=>SafeArea(child:Padding(padding:const EdgeInsets.all(24),child:Column(mainAxisSize:MainAxisSize.min,children:[const Text('统一底部面板'),const SizedBox(height:16),TextButton(onPressed:()=>Navigator.pop(c),child:const Text('返回'))])))),child:const Text('打开底部面板')),
   ]))))));await tester.pumpAndSettle();await capture(tester,'$name-controls');
  await tester.tap(find.text('打开确认弹窗'));await tester.pumpAndSettle();await capture(tester,'$name-dialog');await tester.tap(find.text('返回'));await tester.pumpAndSettle();
  await tester.tap(find.text('打开底部面板'));await tester.pumpAndSettle();await capture(tester,'$name-sheet');await tester.tap(find.text('返回'));await tester.pumpAndSettle();expect(tester.takeException(),isNull);
 });
 }
}

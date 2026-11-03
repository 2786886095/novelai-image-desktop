import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/android/android_studio_shell.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/ui/studio_shell.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

const labels=['生成','重绘','后期','反推','转换','原数据','工具','预设','在线画廊','生图智能体','图库','记录','设置','风格','收藏夹'];
Finder option(int value)=>find.byWidgetPredicate((w)=>(w is PopupMenuItem<int> && w.value==value)||(w is DropdownMenuItem<int> && w.value==value));
Future<void> capture(WidgetTester t,String name) async {
 const path=String.fromEnvironment('MENU_CAPTURE_DIR');if(path.isEmpty)return;
 await t.pump();final box=t.renderObject<RenderRepaintBoundary>(find.byKey(const ValueKey('capture')));
 await t.runAsync(()async{final image=await box.toImage(pixelRatio:2);final bytes=await image.toByteData(format:ui.ImageByteFormat.png);Directory(path).createSync(recursive:true);File('$path/$name.png').writeAsBytesSync(bytes!.buffer.asUint8List());image.dispose();});
}
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 setUpAll(()async{final zh=FontLoader('MenuZh')..addFont(rootBundle.load('assets/ui-fonts/LXGWMarkerGothic-Regular.ttf'));await zh.load();final icons=FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));await icons.load();});
 for(final size in [const Size(390,844),const Size(320,640),const Size(800,360)]){
  for(final scale in [1.0,2.0]){
   testWidgets('third selected member popup stays below fixed toolbar $size scale=$scale',(t)async{
    t.view.physicalSize=size;t.view.devicePixelRatio=1;final host=GlobalKey<_HostState>();
    final previousShadows=debugDisableShadows;debugDisableShadows=false;
    try{
     await t.pumpWidget(_Host(key:host,scale:scale));await t.pumpAndSettle();
     final bar=find.byKey(const ValueKey('compact-workbench-bar'));final before=t.getRect(bar);
     final trigger=find.byKey(const ValueKey('android-member-selector'));final triggerRect=t.getRect(trigger);
     await t.tap(trigger);await t.pumpAndSettle();
     final first=option(10);expect(first,findsOneWidget);
     Element? surface;
     t.element(first).visitAncestorElements((element){if(element.widget is Material){surface=element;return false;}return true;});
     expect(surface,isNotNull);
     final box=surface!.findRenderObject()! as RenderBox;
     final menu=box.localToGlobal(Offset.zero)&box.size;
     // The selected third item used to align to the button and move the whole
     // dropdown upwards. The popup surface, not just its first text, must clear it.
     // ignore: avoid_print
     print('MENU_METRICS ${jsonEncode({'toolbarBottom':before.bottom,'menuTop':menu.top,'triggerLeft':triggerRect.left,'menuLeft':menu.left,'overlapsToolbar':menu.top<before.bottom})}');
     await capture(t,'popup-${size.width.toInt()}-${size.height.toInt()}-scale$scale');
     expect(menu.top,greaterThanOrEqualTo(before.bottom),reason:'Popup must open below the fixed toolbar, not align the selected row over it.');
     expect((menu.left-triggerRect.left).abs(),lessThanOrEqualTo(8));
     expect(menu.left,greaterThanOrEqualTo(8));expect(menu.right,lessThanOrEqualTo(size.width-8));
     expect(menu.bottom,lessThanOrEqualTo(size.height-8));
     expect(t.getRect(bar),before);
     await t.ensureVisible(option(5));await t.tap(option(5));await t.pumpAndSettle();expect(host.currentState!.index,5);
     await t.tap(trigger);await t.pumpAndSettle();await t.sendKeyEvent(LogicalKeyboardKey.escape);await t.pumpAndSettle();expect(host.currentState!.index,5);
     expect(t.takeException(),isNull);
    }finally{await t.pumpWidget(const SizedBox.shrink());await t.pump();t.view.reset();debugDisableShadows=previousShadows;}
   });
  }
 }
}
class _Host extends StatefulWidget{
 final double scale;const _Host({super.key,required this.scale});
 @override State<_Host> createState()=>_HostState();
}
class _HostState extends State<_Host>{
 int index=8;
 @override Widget build(BuildContext context){
  final theme=androidStudioTheme(StudioTheme.light());
  return RepaintBoundary(key:const ValueKey('capture'),child:MaterialApp(debugShowCheckedModeBanner:false,
   theme:theme.copyWith(textTheme:theme.textTheme.apply(fontFamily:'MenuZh')),
   builder:(c,child)=>MediaQuery(data:MediaQuery.of(c).copyWith(textScaler:TextScaler.linear(widget.scale),padding:const EdgeInsets.only(top:24,bottom:16),disableAnimations:true),child:child!),
   home:AndroidStudioShell(selectedIndex:index,onDestinationSelected:(i)=>setState(()=>index=i),language:'zh-CN',
    recommendation:const IconButton(onPressed:null,icon:Icon(Icons.public)),
    destinations:[for(final label in labels)StudioDestination(label:label,icon:Icons.apps,selectedIcon:Icons.apps)],
    pages:[for(var i=0;i<15;i++)ListView(children:[for(var j=0;j<30;j++)ListTile(title:Text('内容 $i / $j'))])])));
 }
}

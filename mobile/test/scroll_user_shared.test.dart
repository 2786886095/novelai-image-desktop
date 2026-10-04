import 'dart:convert';import 'dart:io';
import 'package:flutter/material.dart';import 'package:flutter/gestures.dart';import 'package:flutter_test/flutter_test.dart';import 'package:provider/provider.dart';
import 'package:novelai_mobile/agent/agent_models.dart';import 'package:novelai_mobile/agent/agent_controller.dart';import 'package:novelai_mobile/models/nai_models.dart';import 'package:novelai_mobile/screens/studio_agent_screen.dart';import 'package:novelai_mobile/state/app_state.dart';import 'package:novelai_mobile/services/storage.dart';import 'package:novelai_mobile/i18n/studio_agent_text.dart';
class ScrollStorage extends Storage{ @override Future<void> setAgentWorkspace(AgentWorkspace value)async{} }
class Mounted{final AgentController controller;final Directory temp;final Finder list;final ScrollController scroll;Mounted(this.controller,this.temp,this.list,this.scroll);}
Future<Mounted> mount(WidgetTester tester,Size size,{bool empty=false})async{
 tester.view.physicalSize=size;tester.view.devicePixelRatio=1;addTearDown((){tester.view.resetPhysicalSize();tester.view.resetDevicePixelRatio();});
 final temp=Directory.systemTemp.createTempSync('studio-scroll-user-');/* PNG lives for the test process: Windows image codec may retain a file handle. */final file=File('${temp.path}/fixture.png')..writeAsBytesSync(base64Decode('iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAIAAACwpMoFAAAA60lEQVR4nO3RAQkAIBDAQNtZx7gfxxQijIMLMNg6ewhb3wt4yuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjM4zuA4g+MMjjN42i7VmrDaaTLlNAAAAABJRU5ErkJggg=='));
 final image=AgentAttachment(id:'fixture-image',name:'fixture.png',mime:'image/png',kind:'image',size:file.lengthSync(),filePath:file.path,width:160,height:90);
 final messages=empty?<AgentMessage>[]:List.generate(25,(i)=>AgentMessage(id:'m$i',role:'assistant',content:'Fixture prose $i.\n\n${List.filled(8,'Scrollable text.').join(' ')}',attachments:i==24?[image]:[]));
 final workspace=AgentWorkspace(conversations:[AgentConversation(id:'chat-a',title:'Synthetic existing chat',messages:messages),AgentConversation(id:'chat-b',title:'Second synthetic chat')],selectedConversationId:'chat-a');
 final app=AppState(storage:ScrollStorage())..settings=AppSettings(language:'en-US');final controller=AgentController(app:app)..workspace=workspace..loaded=true;
 await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(home:StudioAgentScreen(controller:controller))));await tester.pumpAndSettle();await tester.runAsync(()=>Future<void>.delayed(const Duration(milliseconds:30)));await tester.pumpAndSettle();final list=find.byType(ListView).first;final scroll=tester.widget<ListView>(list).controller!;return Mounted(controller,temp,list,scroll);
}
Offset target(WidgetTester tester,Mounted m,String where){final rect=tester.getRect(m.list);if(where=='image'){final images=find.byType(Image);expect(images,findsWidgets);final imageRect=tester.getRect(images.last);expect(rect.contains(imageRect.center),isTrue,reason:'real decoded attachment image must be visible for pointer target');return imageRect.center;}return Offset(rect.left+4,rect.center.dy);}
Future<void> wheel(WidgetTester t,Mounted m,Offset point,double delta)async{await t.sendEventToBinding(PointerScrollEvent(position:point,scrollDelta:Offset(0,delta)));await t.pumpAndSettle();}
Future<void> finish(WidgetTester t,Mounted m)async{await t.pumpWidget(const SizedBox());await t.pumpAndSettle();m.controller.dispose();}
void main(){for(final size in [const Size(411,914),const Size(834,1194)]){
 for(final where in ['image','outside']) {for(final delta in [40.0,240.0]) {
    {
   testWidgets('wheel ${size.width} $where delta$delta preserves reading growth and Latest',(t)async{
  final m=await mount(t,size);final before=m.scroll.offset;final point=target(t,m,where);await wheel(t,m,point,-delta);final after=m.scroll.offset;m.controller.notifyListeners();await t.pumpAndSettle();final notified=m.scroll.offset;
  debugPrint('WHEEL size=${size.width} target=$where delta=$delta before=$before after=$after notified=$notified max=${m.scroll.position.maxScrollExtent}');expect(after,lessThan(before-10));expect(notified,closeTo(after,1));
  // Keep input at the original native pointer position: outside point always stays within list.
  for(var n=0;n<3;n++){await wheel(t,m,testerPoint(t,m),-40);}final reading=m.scroll.offset;expect(reading,lessThan(after-80));
  m.controller.workspace.conversations.first.messages.last.content+='\n\n${List.filled(50,'Controlled growth.').join(' ')}';m.controller.notifyListeners();await t.pumpAndSettle();expect(m.scroll.offset,closeTo(reading,1));
  final latest=studioAgentText('en-US','latest');expect(find.text(latest),findsOneWidget);await t.tap(find.text(latest));await t.pumpAndSettle();expect(m.scroll.offset,closeTo(m.scroll.position.maxScrollExtent,1));
  m.controller.workspace.conversations.first.messages.last.content+='\n\n${List.filled(50,'More growth.').join(' ')}';m.controller.notifyListeners();await t.pumpAndSettle();expect(m.scroll.offset,closeTo(m.scroll.position.maxScrollExtent,1));expect(t.takeException(),isNull);await finish(t,m);
 });
 }
 }
 }
 testWidgets('touch ${size.width} small upward drag remains away; explicit downward bottom resumes',(t)async{
  final m=await mount(t,size);final before=m.scroll.offset;final p=testerPoint(t,m);final gesture=await t.startGesture(p);await gesture.moveBy(const Offset(0,24));await t.pump(const Duration(milliseconds:16));await gesture.moveBy(const Offset(0,24));await t.pump(const Duration(milliseconds:300));await gesture.up();await t.pumpAndSettle();final after=m.scroll.offset;debugPrint('TOUCH size=${size.width} before=$before after=$after');expect(after,lessThan(before-10));m.controller.notifyListeners();await t.pumpAndSettle();expect(m.scroll.offset,closeTo(after,1));
  await wheel(t,m,testerPoint(t,m),10000);expect(m.scroll.offset,closeTo(m.scroll.position.maxScrollExtent,1));m.controller.workspace.conversations.first.messages.last.content+='\n\n${List.filled(50,'After downward arrival.').join(' ')}';m.controller.notifyListeners();await t.pumpAndSettle();expect(m.scroll.offset,closeTo(m.scroll.position.maxScrollExtent,1));await finish(t,m);
 });
 testWidgets('switch ${size.width} saves small-wheel reading; empty chat stays following',(t)async{
  final m=await mount(t,size);await wheel(t,m,testerPoint(t,m),-40);final reading=m.scroll.offset;expect(reading,lessThan(m.scroll.position.maxScrollExtent-10));m.controller.selectConversation('chat-b');await t.pumpAndSettle();expect(find.text(studioAgentText('en-US','latest')),findsNothing);m.controller.selectConversation('chat-a');await t.pumpAndSettle();debugPrint('SWITCH saved=$reading restored=${m.scroll.offset} max=${m.scroll.position.maxScrollExtent}');expect(m.scroll.offset,closeTo(reading,1));expect(find.text(studioAgentText('en-US','latest')),findsOneWidget);await finish(t,m);
 });
 testWidgets('empty ${size.width} upward wheel does not expose Latest',(t)async{final m=await mount(t,size,empty:true);await wheel(t,m,testerPoint(t,m),-40);expect(m.scroll.offset,0);expect(find.text(studioAgentText('en-US','latest')),findsNothing);await finish(t,m);});
}}
Offset testerPoint(WidgetTester t,Mounted m){final rect=t.getRect(m.list);return Offset(rect.left+4,rect.center.dy);}

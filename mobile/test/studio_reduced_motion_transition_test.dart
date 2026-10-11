import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
void main(){
 for(final reduced in [false,true]) {
  testWidgets('cross-fade and size transitions honor reduced motion=$reduced',(tester)async{
   for(final expanded in [false,true,false,true]) {
    await tester.pumpWidget(MaterialApp(home:MediaQuery(data:MediaQueryData(disableAnimations:reduced),child:Builder(builder:(context)=>Column(children:[
     studioCrossFadeTransition(context,firstChild:const Text('Collapsed'),secondChild:const Text('Expanded'),showSecond:expanded),
     studioSizeTransition(context,child:SizedBox(height:expanded?200:24,width:100))
    ])))));await tester.pumpAndSettle();expect(tester.takeException(),isNull);
    expect(find.byType(AnimatedSize),reduced?findsNothing:findsNWidgets(2));
    expect(find.text(expanded?'Expanded':'Collapsed').hitTestable(),findsOneWidget);
   }
  });
 }
}

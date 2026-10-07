import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/ui/global_typography.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
void main(){
 test('same user role coefficients, no user-role plateau, OS scaler stays full',(){
  final raw=StudioTheme.light();final base=raw.copyWith(textTheme:ThemeData(useMaterial3:true).textTheme.merge(raw.textTheme));
  for(final factor in [.8,1.0,1.25,1.5,1.75,2.0]){
   final scaler=StudioTextScaler(const TextScaler.linear(1.3),factor);
   final t=withUiTextLayout(base,scaler);
   expect(scaler.scale((t.textTheme.bodyMedium!.fontSize??14)),closeTo(1.3*factor*(base.textTheme.bodyMedium!.fontSize??14),.001));
   expect(scaler.scale((t.textTheme.titleLarge!.fontSize??22)),closeTo(1.3*studioRoleFactor(factor,.55)*(base.textTheme.titleLarge!.fontSize??22),.001));
   expect(scaler.scale((t.textTheme.labelLarge!.fontSize??14)),closeTo(1.3*studioRoleFactor(factor,.45)*(base.textTheme.labelLarge!.fontSize??14),.001));
  }
  final osOnly=withUiTextLayout(base,const TextScaler.linear(2));
  expect(osOnly.textTheme.bodyMedium!.fontSize,base.textTheme.bodyMedium!.fontSize);
  expect(osOnly.textTheme.labelLarge!.fontSize,base.textTheme.labelLarge!.fontSize);
 });
 testWidgets('actual heading button and prompt use full OS but distinct user growth',(tester)async{
  const scaler=StudioTextScaler(TextScaler.linear(1.3),2);
  final raw=StudioTheme.light();final base=raw.copyWith(textTheme:ThemeData(useMaterial3:true).textTheme.merge(raw.textTheme));final theme=withUiTextLayout(withUiFont(base,'serif'),scaler);
  await tester.pumpWidget(MaterialApp(theme:theme,builder:(context,child)=>MediaQuery(data:MediaQuery.of(context).copyWith(textScaler:scaler),child:child!),home:Scaffold(body:SingleChildScrollView(child:Column(children:[Text('title',style:theme.textTheme.titleLarge),const Text('body'),const TextField(decoration:InputDecoration(labelText:'prompt')),FilledButton(onPressed:(){},child:const Text('apply'))])))));
  await tester.pumpAndSettle();expect(tester.takeException(),isNull);
  expect(theme.textTheme.bodyMedium!.fontSize,base.textTheme.bodyMedium!.fontSize);
  expect(theme.textTheme.labelLarge!.fontSize!*2,closeTo((base.textTheme.labelLarge!.fontSize??14)*1.45,.001));
  await tester.pumpWidget(const SizedBox());await tester.pump();
 });
}

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/main.dart';
import 'package:novelai_mobile/models/ui_typography.dart';
import 'package:novelai_mobile/services/ui_fonts.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/typography_settings.dart';
import 'package:novelai_mobile/ui/global_typography.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:novelai_mobile/ui/studio_shell.dart';
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 test('default, malformed input and independent persisted scale',(){
  expect(UiTypography.fromJson(null).toJson(),{'font':'default','scale':100});
  expect(UiTypography.fromJson({'font':'../private','scale':double.nan}).toJson(),{'font':'default','scale':100});
  final settings=AppSettings(uiTypography:const UiTypography(font:'serif',scale:200));
  expect(AppSettings.fromJson(settings.toJson()).uiTypography.toJson(),settings.uiTypography.toJson());
  expect(const StudioTextScaler(TextScaler.linear(1.3),2).scale(10),26);
 });
 test('managed import, engine acceptance, dedupe, restart, invalid input, remove',()async{
  final dir=await Directory.systemTemp.createTemp('studio-fonts-');try{
   final repo=UiFontRepository(dir),file=File('test/fixtures/typography-roboto.ttf'),before=await file.readAsBytes(),entry=await repo.importFile(file.path);
   expect(await file.readAsBytes(),before);expect(await repo.read(entry.id),before);expect((await repo.importFile(file.path)).id,entry.id);
   expect((await UiFontRepository(dir).list()).single.id,entry.id);expect(uiFontLoaded(entry.id),isTrue);
   final bad=File('${dir.path}/bad.otf');await bad.writeAsString('invalid');await expectLater(repo.importFile(bad.path),throwsFormatException);expect((await repo.list()).length,1);
   await expectLater(repo.read('../private'),throwsFormatException);await repo.remove(entry.id);expect(await repo.list(),isEmpty);
  }finally{await dir.delete(recursive:true);}
 });
 for(final size in [const Size(360,800),const Size(390,844),const Size(768,1024),const Size(844,390)]){
  testWidgets('global font panel responsive $size with user200 and OS130', (tester)async{
   tester.view.physicalSize=size;tester.view.devicePixelRatio=1;addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
   SharedPreferences.setMockInitialValues({});final state=AppState();state.settings.uiTypography=const UiTypography(font:'serif',scale:200);
   await tester.pumpWidget(ChangeNotifierProvider.value(value:state,child:MaterialApp(theme:withUiFont(StudioTheme.light(),'serif'),builder:(context,child)=>UiTypographyScope(family:'serif',child:MediaQuery(data:MediaQuery.of(context).copyWith(textScaler:const StudioTextScaler(TextScaler.linear(1.3),2)),child:child!)),home:const Scaffold(body:SingleChildScrollView(padding:EdgeInsets.all(16),child:TypographySettings())))));
   await tester.pumpAndSettle();expect(tester.takeException(),isNull);expect(find.byKey(const ValueKey('typography-settings')),findsOneWidget);
   final text=tester.renderObject<RenderParagraph>(find.text('全局字体与字号').first);expect(text.textScaler.scale(10),26);expect(text.text.style?.fontFamily,'serif');
   await tester.pumpWidget(const SizedBox());await tester.pump();state.dispose();
  });
 }
 testWidgets('phone navigation enlarged text is not silently clamped', (tester)async{
  tester.view.physicalSize=const Size(360,800);tester.view.devicePixelRatio=1;addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
  final destinations=List.generate(6,(i)=>StudioDestination(label:'功能$i',icon:Icons.star,selectedIcon:Icons.star));
  await tester.pumpWidget(MaterialApp(theme:withUiFont(StudioTheme.light(),'serif'),builder:(context,child)=>MediaQuery(data:MediaQuery.of(context).copyWith(textScaler:const TextScaler.linear(2)),child:child!),home:StudioAdaptiveShell(selectedIndex:0,onDestinationSelected:(_){},destinations:destinations,pages:List.generate(6,(_)=>const Center(child:Text('body'))),moreLabel:'更多',allFeaturesLabel:'全部功能')));
  await tester.pumpAndSettle();expect(tester.takeException(),isNull);final p=tester.renderObject<RenderParagraph>(find.text('功能0'));expect(p.textScaler.scale(10),20);
 });
 testWidgets('actual NovelAIApp applies setting globally and preserves OS scale', (tester)async{
  tester.view.physicalSize=const Size(390,844);tester.view.devicePixelRatio=1;tester.platformDispatcher.textScaleFactorTestValue=1.3;
  addTearDown(tester.view.reset);addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  SharedPreferences.setMockInitialValues({});final state=AppState()..booted=true;state.settings.uiTypography=const UiTypography(font:'serif',scale:200);
  await tester.pumpWidget(ChangeNotifierProvider.value(value:state,child:const NovelAIApp()));await tester.pumpAndSettle();expect(tester.takeException(),isNull);
  var count=0;
  for(final e in find.byType(RichText).evaluate()){
   final paragraph=e.findRenderObject();if(paragraph is! RenderParagraph)continue;
   final family=paragraph.text.style?.fontFamily;if(family=='MaterialIcons'||family=='CupertinoIcons')continue;
   expect(family,'serif');expect(paragraph.textScaler.scale(10),26,reason:paragraph.text.toPlainText());count++;
  }
  expect(count,greaterThan(10));await tester.pumpWidget(const SizedBox());await tester.pump();state.dispose();
 });

}

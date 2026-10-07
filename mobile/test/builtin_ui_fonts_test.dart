import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/main.dart';
import 'package:novelai_mobile/models/ui_typography.dart';
import 'package:novelai_mobile/models/builtin_ui_fonts.dart';
import 'package:novelai_mobile/services/ui_fonts.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/typography_settings.dart';
import 'package:novelai_mobile/ui/global_typography.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
const sample='春风花月山水画师角色提示词生成预览字体设置';
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 test('six bundled IDs preserve defaults, existing selection and scalar',(){
  expect(builtinUiFonts.length,6);expect(builtinUiFonts.map((f)=>f.id).toSet().length,6);
  expect(const UiTypography().toJson(),{'font':'default','scale':100});
  expect(UiTypography.fromJson({'font':'serif','scale':150}).toJson(),{'font':'serif','scale':150});
  for(final f in builtinUiFonts){expect(UiTypography.fromJson({'font':f.id,'scale':150}).toJson(),{'font':f.id,'scale':150});expect(UiTypography.isImported(f.id),isFalse);}
  expect(UiTypography.fromJson({'font':'builtin-unknown'}).font,'default');
 });
 test('bundled asset engine loads six real Chinese fonts and renders six distinct rasters offline',()async{
  final raw=await rootBundle.loadString('assets/ui-fonts/catalog.json'),catalog=jsonDecode(raw) as List;
  final hashes=<String>{};
  for(final f in builtinUiFonts){
   final entry=catalog.cast<Map>().singleWhere((e)=>e['id']==f.id),data=await rootBundle.load('assets/ui-fonts/${f.file}');
   expect(sha256.convert(data.buffer.asUint8List()).toString(),entry['sha256']);
   expect(await rootBundle.loadString('assets/ui-fonts/${entry['licenseFile']}'),contains('SIL OPEN FONT LICENSE'));
   await Future.wait([ensureUiFont(f.id),ensureUiFont(f.id)]);expect(uiFontLoaded(f.id),isTrue);expect(uiFontFamily(f.id),'Studio-${f.id}');
   final builder=ui.ParagraphBuilder(ui.ParagraphStyle(fontFamily:uiFontFamily(f.id),fontSize:28))..addText(sample);
   final paragraph=builder.build()..layout(const ui.ParagraphConstraints(width:950));
   final recorder=ui.PictureRecorder();ui.Canvas(recorder).drawParagraph(paragraph,ui.Offset.zero);
   final picture=recorder.endRecording(),image=await picture.toImage(950,80),png=await image.toByteData(format:ui.ImageByteFormat.png);expect(png,isNotNull);
   hashes.add(sha256.convert(png!.buffer.asUint8List()).toString());image.dispose();picture.dispose();paragraph.dispose();
  }
  expect(hashes.length,6,reason:'Reject identical fallback rasters');
  expect(File('assets/ui-fonts/catalog.json').readAsStringSync(),File('../public/ui-fonts/catalog.json').readAsStringSync());
 });
 for(final size in [const Size(360,800),const Size(390,844),const Size(768,1024),const Size(844,390)]){
  for(final f in builtinUiFonts){
   testWidgets('actual global app ${f.id} at $size and 200%',(tester)async{
    await tester.runAsync(()=>ensureUiFont(f.id));
    tester.view.physicalSize=size;tester.view.devicePixelRatio=1;addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({});final state=AppState()..booted=true;state.settings.uiTypography=UiTypography(font:f.id,scale:200);
    await tester.pumpWidget(ChangeNotifierProvider.value(value:state,child:const NovelAIApp()));await tester.pumpAndSettle();expect(tester.takeException(),isNull);
    var texts=0;for(final e in find.byType(RichText).evaluate()){
      final rich=e.widget as RichText;final font=rich.text.style?.fontFamily;if(font=='MaterialIcons'||font=='CupertinoIcons')continue;
      expect(font,'Studio-${f.id}');texts++;
    }expect(texts,greaterThan(10));
    final family=uiFontFamily(f.id);const scaler=StudioTextScaler(TextScaler.noScaling,2);
    await tester.pumpWidget(ChangeNotifierProvider.value(value:state,child:MaterialApp(theme:withUiTextLayout(withUiFont(StudioTheme.light(),family),scaler),builder:(context,child)=>UiTypographyScope(family:family,child:MediaQuery(data:MediaQuery.of(context).copyWith(textScaler:scaler),child:child!)),home:const Scaffold(body:SingleChildScrollView(padding:EdgeInsets.all(16),child:TypographySettings())))));
    await tester.pumpAndSettle();expect(tester.takeException(),isNull);
    await tester.tap(find.text(f.label('zh-CN')).first);await tester.pumpAndSettle();expect(tester.takeException(),isNull);
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);await tester.pumpAndSettle();expect(tester.takeException(),isNull);
    expect(state.settings.uiTypography.toJson(),{'font':f.id,'scale':200});
    await tester.pumpWidget(const SizedBox());await tester.pump();state.dispose();
   });
  }
 }
}

import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/inpaint/inpaint_size.dart';
import 'package:novelai_mobile/ui/inpaint_size_controls.dart';
import 'package:novelai_mobile/ui/resolution_tiers.dart';

void main() {
  test('all 65 mobile presets exactly match desktop dimensions and disabled choices',(){
    final fixture=jsonDecode(File('test/fixtures/resolution-picker-desktop.json').readAsStringSync()) as List;
    expect(fixture.length,65);
    for(final raw in fixture) {
      final row=raw as Map<String,dynamic>;
      final size=resolutionForTier((row['tier'] as num).toDouble(),row['ratio'] as String);
      expect(size,(width:row['width'],height:row['height']));
      expect(resolutionSizeAllowed(size,1600),row['allowedInpaint']);
    }
  });
  test('blank and invalid sizes recover safely without losing manual editing',(){
    for(final size in [(width:0,height:0),(width:-1,height:1024),(width:64,height:100000)]) {
      expect(resolutionSizeAllowed(resolutionForTier(1,resolutionPickerRatio(size)),1600),isTrue);
    }
    expect(nearestResolutionTier((width:832,height:1216)),1);
    expect(nearestResolutionRatio((width:832,height:1216)),'2:3');
  });
  testWidgets('phone/iPad preset controls update width/height, MP and preserve independent size', (tester) async {
    for(final screen in [const Size(360,800),const Size(768,1024)]) {
      await tester.binding.setSurfaceSize(screen);
      String mode='custom';InpaintSize custom=(width:1024,height:1024);
      await tester.pumpWidget(MaterialApp(home:Scaffold(body:SingleChildScrollView(child:StatefulBuilder(builder:(context,setState)=>Padding(
        padding:const EdgeInsets.all(12),child:InpaintSizeControls(mode:mode,language:'zh-CN',custom:custom,source:(width:896,height:1152),
          onMode:(v)=>setState(()=>mode=v),onSize:(v)=>setState(()=>custom=v))))))));
      expect(find.text('总分辨率'),findsOneWidget);expect(find.text('画面比例'),findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('inpaint-resolution-ratio')));await tester.pumpAndSettle();
      await tester.tap(find.text('2:3').last);await tester.pumpAndSettle();
      expect(custom,(width:832,height:1216));expect(find.text('832 × 1216 · 1.012 MP'),findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('inpaint-resolution-tier')));await tester.pumpAndSettle();
      final big=tester.widgetList<DropdownMenuItem<String>>(find.byWidgetPredicate((w)=>w is DropdownMenuItem<String> && w.value=='3'));
      expect(big.every((item)=>!item.enabled),isTrue);
      await tester.tap(find.text('1 MP · 普通').last);await tester.pumpAndSettle();
      await tester.tap(find.text('原图尺寸'));await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('inpaint-resolution-tier')),findsNothing);expect(custom,(width:832,height:1216));
      await tester.tap(find.text('自定义尺寸'));await tester.pumpAndSettle();
      expect(custom,(width:832,height:1216));
      await tester.enterText(find.byKey(const ValueKey('inpaint-width')),'704');await tester.pump();
      await tester.enterText(find.byKey(const ValueKey('inpaint-height')),'1408');await tester.pump();
      expect(custom,(width:704,height:1408));expect(find.text('704 × 1408 · 0.991 MP'),findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('inpaint-width')),'705');await tester.pump();
      expect(find.textContaining('705×1408:'),findsOneWidget);
      expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox());
    }
    await tester.binding.setSurfaceSize(null);
  });
}

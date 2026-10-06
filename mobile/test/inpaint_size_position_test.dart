import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image;
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/generate_screen.dart' show PromptEditor;
import 'package:novelai_mobile/screens/tools_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/inpaint_size_controls.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(()=>SharedPreferences.setMockInitialValues({}));
  for(final fixture in [
    (platform:TargetPlatform.android,size:const Size(360,800)),
    (platform:TargetPlatform.iOS,size:const Size(390,844)),
    (platform:TargetPlatform.iOS,size:const Size(768,1024)),
  ]) {
    testWidgets('actual redraw page prompt/size/seed order ${fixture.platform} ${fixture.size}',(tester) async {
      tester.view.devicePixelRatio=1;tester.view.physicalSize=fixture.size;addTearDown(tester.view.reset);
      final temp=Directory.systemTemp.createTempSync('inpaint-position-');addTearDown(()=>temp.deleteSync(recursive:true));
      final file=File('${temp.path}/fixture.png')..writeAsBytesSync(image.encodePng(image.Image(width:64,height:64)));
      final state=AppState();addTearDown(state.dispose);
      state.settings.language='zh-CN';state.params.width=640;state.params.height=1024;
      state.workbenchImage=WorkingImage(filePath:file.path,width:896,height:1152);
      state.inpaintSizeMode='custom';state.inpaintCustomSize=(width:832,height:1216);
      await tester.pumpWidget(ChangeNotifierProvider.value(value:state,child:MaterialApp(
        theme:StudioTheme.light().copyWith(platform:fixture.platform),home:const ToolsScreen(kind:ToolPageKind.inpaint))));
      await tester.pump();await tester.pump(const Duration(milliseconds:300));
      final negative=find.byWidgetPredicate((w)=>w is PromptEditor && w.label==mobileUiTextFor('zh-CN','tools.negativePrompt'));
      final size=find.byType(InpaintSizeControls);
      expect(negative,findsOneWidget);expect(size,findsOneWidget);
      final gap=tester.getTopLeft(size).dy-tester.getBottomLeft(negative).dy;
      expect(gap,closeTo(12,.1),reason:'Size follows prompt editors directly, not strength/source controls');
      final advanced=find.text(mobileUiTextFor('zh-CN','tools.advancedParams'));
      await tester.ensureVisible(advanced);await tester.pump();await tester.tap(advanced);await tester.pumpAndSettle();
      final seed=find.byWidgetPredicate((w)=>w is SegmentedButton<String> && w.segments.any((s)=>s.value=='random'));
      expect(seed,findsOneWidget);expect(tester.getTopLeft(seed).dy,greaterThan(tester.getBottomLeft(size).dy));
      await tester.ensureVisible(find.text('原图尺寸'));await tester.pump();await tester.tap(find.text('原图尺寸'));await tester.pump();
      expect(state.inpaintSizeMode,'original');expect(state.inpaintCustomSize,(width:832,height:1216));
      await tester.ensureVisible(find.text('自定义尺寸'));await tester.pump();await tester.tap(find.text('自定义尺寸'));await tester.pump();
      expect(state.inpaintSizeMode,'custom');expect(state.inpaintCustomSize,(width:832,height:1216));
      expect((state.params.width,state.params.height),(640,1024));expect(tester.takeException(),isNull);
      // ignore: avoid_print
      print('ACTUAL_PAGE_${fixture.platform}_${fixture.size}: prompt-gap=$gap; prompt<size<seed; independent832x1216; main640x1024;0network/0credits');
      await tester.pumpWidget(const SizedBox());
    });
  }
}

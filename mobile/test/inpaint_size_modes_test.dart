import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/inpaint/inpaint_size.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/inpaint_size_controls.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('exact original/custom, rejection, migration and independent saved values', () {
    const original=(width:896,height:1152),custom=(width:704,height:1408);
    expect(resolveInpaintSize('original',custom,original),original);
    expect(resolveInpaintSize('custom',custom,original),custom);
    expect(() => resolveInpaintSize('custom',(width:705,height:1408),original),throwsFormatException);
    expect(() => resolveInpaintSize('original',custom,(width:2048,height:2048)),throwsFormatException);
    expect(restoreInpaintSizeState({}).mode,'original');
    expect(restoreInpaintSizeState({'inpaintSizeMode':'original','inpaintCustomSize':{'width':704,'height':1408}}).custom,custom);
  });
  test('persists mode/custom in lastGenerationState without changing main params', () async {
    final state=AppState();addTearDown(state.dispose);
    final before=(state.params.width,state.params.height);
    state.setInpaintCustomSize((width:704,height:1408));state.setInpaintSizeMode('custom');
    await state.persistToolState();
    expect(state.settings.lastGenerationState['inpaintSizeMode'],'custom');
    expect(restoreInpaintSizeState(state.settings.lastGenerationState).custom,(width:704,height:1408));
    state.setInpaintSizeMode('original');expect(state.inpaintCustomSize,(width:704,height:1408));
    expect((state.params.width,state.params.height),before);
  });
  testWidgets('narrow mobile and iPad layouts switch modes, edit and retain custom size', (tester) async {
    for(final size in [const Size(360,800),const Size(768,1024)]) {
      await tester.binding.setSurfaceSize(size);
      String mode='original';InpaintSize custom=(width:1024,height:1024);
      await tester.pumpWidget(MaterialApp(home:Scaffold(body:StatefulBuilder(builder:(context,setState)=>Padding(
        padding:const EdgeInsets.all(12),child:InpaintSizeControls(mode:mode,language:'zh-CN',custom:custom,source:(width:896,height:1152),
          onMode:(v)=>setState(()=>mode=v),onSize:(v)=>setState(()=>custom=v)))))));
      expect(find.byKey(const ValueKey('inpaint-width')),findsNothing);
      await tester.tap(find.text('自定义尺寸'));await tester.pump();
      await tester.enterText(find.byKey(const ValueKey('inpaint-width')),'704');await tester.pump();
      await tester.enterText(find.byKey(const ValueKey('inpaint-height')),'1408');await tester.pump();
      expect(custom,(width:704,height:1408));
      await tester.tap(find.text('原图尺寸'));await tester.pump();
      await tester.tap(find.text('自定义尺寸'));await tester.pump();
      expect(custom,(width:704,height:1408));expect(tester.takeException(),isNull);
      await tester.pumpWidget(const SizedBox());
    }
    await tester.binding.setSurfaceSize(null);
  });
}

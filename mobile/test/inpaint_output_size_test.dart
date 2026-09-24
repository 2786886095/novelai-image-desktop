import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/billing/anlas.dart';
import 'package:novelai_mobile/images/image_processing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/tools_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';

Uint8List png(img.Image image) => Uint8List.fromList(img.encodePng(image));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('source, mask and composited output follow selected 704x1408 size', () {
    final source = img.Image(width: 1024, height: 2048, numChannels: 4)
      ..clear(img.ColorRgba8(40, 0, 0, 255));
    final mask = img.Image(width: 1024, height: 2048, numChannels: 4)
      ..clear(img.ColorRgba8(0, 0, 0, 255));
    for (var y = 1024; y < 1536; y++) {
      for (var x = 512; x < 768; x++) {
        mask.setPixelRgba(x, y, 255, 255, 255, 255);
      }
    }
    // Dynamic invocation also permits running this regression against the old
    // two-argument implementation before the optional dimensions are added.
    final prepared = Function.apply(
        prepareInpaintAssets,
        [png(source), png(mask)],
        {#targetWidth: 704, #targetHeight: 1408}) as PreparedInpaintAssets;
    expect(decodeImageDimensions(prepared.imageBytes), (704, 1408));
    final uploadedMask = img.decodeImage(prepared.maskBytes)!;
    expect((uploadedMask.width, uploadedMask.height), (704, 1408));
    expect(uploadedMask.getPixel(440, 880).r.toInt(), 255);
    expect(uploadedMask.getPixel(0, 0).r.toInt(), 0);
    final generated = img.Image(width: 704, height: 1408, numChannels: 4)
      ..clear(img.ColorRgba8(220, 0, 0, 255));
    final output =
        img.decodeImage(compositeInpaintResult(png(generated), prepared))!;
    expect((output.width, output.height), (704, 1408));
    expect(output.getPixel(0, 0).r.toInt(), 40);
    expect(output.getPixel(440, 880).r.toInt(), greaterThan(200));
  });

  test('quote follows selected dimensions rather than original image', () {
    const account = AccountSummary(
        hasToken: true,
        tierLevel: 1,
        hasActiveSubscription: true,
        anlasBalance: 1000);
    final params = GenerateParams()
      ..width = 704
      ..height = 1408;
    AnlasQuote quote(int width, int height) => calculateInpaintAnlas(
        params: params,
        account: account,
        image: WorkingImage(filePath: 'fixture', width: width, height: height),
        inpaintModel: 'nai-diffusion-5-full-inpainting');
    expect(quote(1024, 2048).amount, quote(704, 1408).amount);
  });

  testWidgets('inpaint reuses editable dimensions and preset choices',
      (tester) async {
    final state = AppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child:
            const MaterialApp(home: ToolsScreen(kind: ToolPageKind.inpaint))));
    await tester.pump();
    final width = find.byKey(const ValueKey('output-width'));
    final height = find.byKey(const ValueKey('output-height'));
    await tester.scrollUntilVisible(width, 350,
        scrollable: find.byType(Scrollable).first);
    await tester.enterText(
        find.descendant(of: width, matching: find.byType(TextField)), '704');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    await tester.enterText(
        find.descendant(of: height, matching: find.byType(TextField)), '1408');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pump();
    expect((state.params.width, state.params.height), (704, 1408));
    expect(find.byType(ChoiceChip), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}

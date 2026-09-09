import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/style_tag_picker.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

void main() {
  for (final size in [
    const Size(320, 640),
    const Size(800, 360),
    const Size(1280, 800)
  ]) {
    for (final dark in [false, true]) {
      testWidgets('native style picker fits $size dark=$dark', (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = size;
        addTearDown(tester.view.reset);
        final app = AppState();
        addTearDown(app.dispose);
        await tester.pumpWidget(MaterialApp(
            theme: dark ? StudioTheme.dark() : StudioTheme.light(),
            home: Scaffold(body: TavernStyleTagPicker(app: app))));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.tap(find.byType(CheckboxListTile).first);
        await tester.pump();
        expect(tester.takeException(), isNull);
        expect(
            tester
                .widget<CheckboxListTile>(find.byType(CheckboxListTile).first)
                .value,
            isTrue);
      });
    }
  }
}

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image_lib;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/tools_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('mask actions and exact preview remain available after editing',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);

    final temp = Directory.systemTemp.createTempSync('inpaint-tools-test-');
    addTearDown(() => temp.deleteSync(recursive: true));
    final source = File('${temp.path}${Platform.pathSeparator}source.png');
    source.writeAsBytesSync(
      image_lib.encodePng(image_lib.Image(width: 512, height: 288)),
    );

    final state = AppState()
      ..workbenchImage = WorkingImage(
        filePath: source.path,
        width: 512,
        height: 288,
      );
    addTearDown(state.dispose);
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: const ToolsScreen(kind: ToolPageKind.inpaint),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    final pageList = find.byKey(const ValueKey('tools-page-scroll'));
    for (var index = 0; index < 4; index++) {
      await tester.drag(pageList, const Offset(0, -500));
      await tester.pump();
    }
    await tester.tap(find.byKey(const ValueKey('edit-inpaint-mask')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    final canvas = find.byKey(const ValueKey('inpaint-mask-canvas'));
    final rect = tester.getRect(canvas);
    for (var index = 0; index < 12; index++) {
      final start = Offset(
        rect.left + 24 + (index % 4) * (rect.width - 48) / 3,
        rect.top + 24 + (index ~/ 4) * (rect.height - 48) / 2,
      );
      await tester.dragFrom(start, const Offset(12, 6));
      await tester.pump(const Duration(milliseconds: 16));
    }
    await tester.tap(find.byKey(const ValueKey('inpaint-mask-done')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    for (var index = 0; index < 3; index++) {
      await tester.drag(pageList, const Offset(0, -300));
      await tester.pump();
    }
    expect(find.byKey(const ValueKey('edit-inpaint-mask')), findsOneWidget);
    expect(find.byKey(const ValueKey('preview-inpaint-mask')), findsOneWidget);
    expect(find.byKey(const ValueKey('clear-inpaint-mask')), findsOneWidget);
    expect(find.byKey(const ValueKey('run-inpaint')), findsOneWidget);
    final preview = tester.widget<OutlinedButton>(
      find.byKey(const ValueKey('preview-inpaint-mask')),
    );
    expect(preview.onPressed, isNotNull);

    final comparisonToggle =
        find.byKey(const ValueKey('toggle-inpaint-summary-preview'));
    expect(comparisonToggle, findsOneWidget);
    expect(
      find.byKey(const ValueKey('inpaint-mask-summary-preview')),
      findsOneWidget,
    );
    await tester.tap(comparisonToggle);
    await tester.pump();
    expect(
      find.byKey(const ValueKey('inpaint-mask-summary-preview')),
      findsNothing,
    );

    await tester.tap(find.byKey(const ValueKey('preview-inpaint-mask')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(
      find.byKey(const ValueKey('inpaint-mask-exact-preview')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  }, timeout: const Timeout(Duration(seconds: 10)));
}

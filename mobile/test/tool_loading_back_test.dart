import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/batch/batch_redraw_controller.dart';
import 'package:novelai_mobile/comic/comic_controller.dart';
import 'package:novelai_mobile/screens/batch_redraw_screen.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';

void main() {
  for (final tool in ['tag', 'japanese', 'batch']) {
    for (final loadError in [false, true]) {
      final state = loadError ? 'error' : 'loading';
      testWidgets('$tool keeps one tappable route Back during $state',
          (tester) async {
        final app = AppState();
        final batch = tool == 'batch' ? BatchRedrawController(app) : null;
        final comic = tool == 'batch' ? null : ComicController(app, workspace: tool);
        if (loadError) {
          if (batch != null) {
            batch.loaded = true;
            batch.loadError = 'isolated load failure';
          } else {
            comic!.loaded = true;
            comic.loadError = 'isolated load failure';
          }
        }
        addTearDown(() {
          comic?.dispose();
          batch?.dispose();
          app.dispose();
        });
        await tester.pumpWidget(ChangeNotifierProvider.value(
          value: app,
          child: MaterialApp(
            theme: ThemeData(platform: TargetPlatform.iOS),
            home: Builder(builder: (context) {
              return Scaffold(body: TextButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
                  builder: (route) {
                    void back() => Navigator.of(route).pop();
                    return batch != null
                        ? BatchRedrawScreen(controller: batch, onBack: back)
                        : ComicScreen(controller: comic, onBack: back);
                  },
                )),
                child: const Text('open actual tool'),
              ));
            }),
          ),
        ));
        await tester.tap(find.text('open actual tool'));
        await tester.pumpAndSettle();
        if (loadError) expect(find.text('isolated load failure'), findsOneWidget);
        expect(find.byIcon(Icons.arrow_back).hitTestable(), findsOneWidget);
        await tester.tap(find.byIcon(Icons.arrow_back));
        await tester.pumpAndSettle();
        expect(find.text('open actual tool').hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/zoomable_image.dart';

void main() {
  testWidgets(
      'gallery navigation updates caption, action target and zoom together',
      (tester) async {
    final state = AppState();
    addTearDown(state.dispose);
    int? actionIndex;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
            home: Builder(
                builder: (context) => Scaffold(
                    body: TextButton(
                        onPressed: () => showGalleryImagePreview(context,
                            images: const [Text('image A'), Text('image B')],
                            captions: const ['file A', 'file B'],
                            actionsBuilder: (_, index) => IconButton(
                                icon: const Icon(Icons.download),
                                onPressed: () => actionIndex = index)),
                        child: const Text('open')))))));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    final controller = tester
        .widget<InteractiveViewer>(find.byType(InteractiveViewer))
        .transformationController!;
    controller.value = Matrix4.diagonal3Values(3, 3, 1);
    await tester.tap(find.byIcon(Icons.chevron_right));
    await tester.pumpAndSettle();
    expect(find.text('file B'), findsOneWidget);
    expect(find.text('image B'), findsOneWidget);
    expect(controller.value.getMaxScaleOnAxis(), 1);
    await tester.tap(find.byIcon(Icons.download));
    expect(actionIndex, 1);
    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
  });

  testWidgets('fullscreen preview navigates by keyboard and retains pinch/pan',
      (tester) async {
    final state = AppState();
    addTearDown(state.dispose);
    const first =
        ColoredBox(color: Colors.purple, key: ValueKey('first-image'));
    const second =
        ColoredBox(color: Colors.green, key: ValueKey('second-image'));
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: const MaterialApp(
            home: Scaffold(
                body: SizedBox(
                    height: 500,
                    child: ZoomableImage(
                        image: first, gallery: [first, second]))))));
    await tester.tap(find.byIcon(Icons.fullscreen));
    await tester.pumpAndSettle();
    expect(find.text('1 / 2'), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pumpAndSettle();
    expect(find.text('2 / 2'), findsOneWidget);
    final viewer = tester
        .widgetList<InteractiveViewer>(find.byType(InteractiveViewer))
        .last;
    expect(viewer.panEnabled, isTrue);
    expect(viewer.maxScale, 10);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
    await tester.pumpAndSettle();
    expect(find.text('1 / 2'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    expect(find.text('1 / 2'), findsNothing);
  });
}

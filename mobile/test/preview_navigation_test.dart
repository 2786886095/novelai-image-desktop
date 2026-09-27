import 'dart:ui' as ui;
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
  testWidgets('blank letterbox closes; image, controls, pan and pinch do not',
      (tester) async {
    final state = AppState();
    addTearDown(state.dispose);
    final bytes = (await tester.runAsync(() async {
      final recorder = ui.PictureRecorder();
      final canvas = ui.Canvas(recorder);
      canvas.drawRect(
          const Rect.fromLTWH(0, 0, 80, 40), Paint()..color = Colors.purple);
      final picture = recorder.endRecording();
      final image = await picture.toImage(80, 40);
      final bytes = (await image.toByteData(format: ui.ImageByteFormat.png))!
          .buffer
          .asUint8List();
      image.dispose();
      picture.dispose();
      return bytes;
    }))!;
    int actions = 0;
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
            home: Builder(
                builder: (context) => Scaffold(
                    body: TextButton(
                        child: const Text('open'),
                        onPressed: () => showGalleryImagePreview(
                              context,
                              images: [
                                SizedBox(
                                    width: 400,
                                    height: 400,
                                    child: Image.memory(bytes,
                                        fit: BoxFit.contain))
                              ],
                              actionsBuilder: (_, index) => IconButton(
                                  icon: const Icon(Icons.download),
                                  onPressed: () => actions++),
                            )))))));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.runAsync(() => precacheImage(
        MemoryImage(bytes), tester.element(find.byType(InteractiveViewer))));
    await tester.pumpAndSettle();
    await tester.tapAt(const Offset(400, 300));
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsOneWidget);
    await tester.tap(find.byIcon(Icons.download));
    await tester.pumpAndSettle();
    expect(actions, 1);
    expect(find.byType(InteractiveViewer), findsOneWidget);
    await tester.dragFrom(const Offset(100, 300), const Offset(80, 0));
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsOneWidget);
    final one = await tester.startGesture(const Offset(350, 300), pointer: 1);
    final two = await tester.startGesture(const Offset(450, 300), pointer: 2);
    await one.moveTo(const Offset(290, 300));
    await two.moveTo(const Offset(510, 300));
    await one.up();
    await two.up();
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsOneWidget);
    tester
        .widget<InteractiveViewer>(find.byType(InteractiveViewer))
        .transformationController!
        .value = Matrix4.identity();
    await tester.pumpAndSettle();
    // Inside the 400x400 image widget, but OUTSIDE its 400x200 painted pixels.
    await tester.tapAt(const Offset(400, 130));
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsNothing);
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    expect(find.byType(InteractiveViewer), findsNothing);
  });

  testWidgets('double tap opens shared preview and empty backdrop closes it',
      (tester) async {
    final state = AppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: const MaterialApp(
            home: Scaffold(
                body: SizedBox(
                    height: 400,
                    child: ZoomableImage(image: Text('thumbnail')))))));
    await tester.tap(find.text('thumbnail'));
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.text('thumbnail'));
    await tester.pumpAndSettle();
    expect(find.byType(Dialog), findsOneWidget);
    await tester.tapAt(const Offset(20, 200));
    await tester.pumpAndSettle();
    expect(find.byType(Dialog), findsNothing);
  });
}

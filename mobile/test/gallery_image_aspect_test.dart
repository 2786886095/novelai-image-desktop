import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/gallery_image_aspect.dart';

Future<MemoryImage> testImage(int width, int height) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawRect(Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
      Paint()..color = Colors.blue);
  final picture = recorder.endRecording();
  final image = await picture.toImage(width, height);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  picture.dispose();
  return MemoryImage(bytes!.buffer.asUint8List());
}

void main() {
  for (final width in [320.0, 800.0]) {
    testWidgets(
        'decoded portrait, landscape and square replace placeholder at width $width',
        (tester) async {
      tester.view.physicalSize = Size(width, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      for (final dims in [(80, 160), (160, 80), (80, 80)]) {
        final provider =
            await tester.runAsync(() => testImage(dims.$1, dims.$2));
        await tester.pumpWidget(MaterialApp(
            home: Scaffold(
                body: Align(
                    alignment: Alignment.topLeft,
                    child: SizedBox(
                        width: 200,
                        child: GalleryImageAspect(
                            provider: provider!,
                            fallback: 4 / 3,
                            builder: (context, ratio) => AspectRatio(
                                key: const Key('stage'),
                                aspectRatio: ratio,
                                child: Image(
                                    image: provider,
                                    fit: BoxFit.contain))))))));
        await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 80)));
        await tester.pumpAndSettle();
        final size = tester.getSize(find.byKey(const Key('stage')));
        expect(size.width / size.height, closeTo(dims.$1 / dims.$2, 0.001));
        expect(tester.takeException(), isNull);
      }
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  }
}

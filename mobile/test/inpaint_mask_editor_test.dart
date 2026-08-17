import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/inpaint_mask_editor.dart';

class _EditorLauncher extends StatelessWidget {
  final ValueNotifier<InpaintMaskEditResult?> result;
  const _EditorLauncher(this.result);

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: FilledButton(
            key: const ValueKey('launch-mask-editor'),
            onPressed: () async {
              result.value = await Navigator.push<InpaintMaskEditResult>(
                context,
                MaterialPageRoute(
                  builder: (_) => const InpaintMaskEditor(
                    image: WorkingImage(
                      filePath: 'Z:/isolated-ui-audit.png',
                      width: 512,
                      height: 512,
                    ),
                    language: 'zh-CN',
                    imageProvider: AssetImage('assets/icon/app_icon.png'),
                  ),
                ),
              );
            },
            child: const Text('Open'),
          ),
        ),
      );
}

Future<void> _pump(
  WidgetTester tester,
  Size size, {
  String language = 'zh-CN',
  double textScale = 1,
}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  await tester.pumpWidget(
    MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: TextScaler.linear(textScale),
        ),
        child: child!,
      ),
      home: InpaintMaskEditor(
        image: const WorkingImage(
          filePath: 'Z:/isolated-ui-audit.png',
          width: 512,
          height: 512,
        ),
        language: language,
        imageProvider: const AssetImage('assets/icon/app_icon.png'),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  testWidgets('single-finger drawing is committed and enables Done',
      (tester) async {
    addTearDown(tester.view.reset);
    await _pump(tester, const Size(390, 844));

    final canvas = find.byKey(const ValueKey('inpaint-mask-canvas'));
    final rect = tester.getRect(canvas);
    final gesture =
        await tester.startGesture(rect.centerLeft + const Offset(40, 0));
    await gesture.moveBy(const Offset(80, 40));
    await gesture.up();
    await tester.pump();

    expect(find.textContaining('1 笔'), findsOneWidget);
    expect(find.byKey(const ValueKey('inpaint-brush-size')), findsOneWidget);
    final done = tester.widget<TextButton>(
      find.byKey(const ValueKey('inpaint-mask-done')),
    );
    expect(done.onPressed, isNotNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('adding a second pointer pans or zooms without leaving a stroke',
      (tester) async {
    addTearDown(tester.view.reset);
    await _pump(tester, const Size(390, 844));

    final canvas = find.byKey(const ValueKey('inpaint-mask-canvas'));
    final center = tester.getCenter(canvas);
    final first = await tester.startGesture(center - const Offset(30, 0));
    final second = await tester.startGesture(center + const Offset(30, 0));
    await first.moveBy(const Offset(-25, 0));
    await second.moveBy(const Offset(25, 0));
    await first.up();
    await second.up();
    await tester.pump();

    expect(find.textContaining('0 笔'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Done returns ordered brush and eraser strokes', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    final result = ValueNotifier<InpaintMaskEditResult?>(null);
    addTearDown(result.dispose);
    await tester.pumpWidget(MaterialApp(home: _EditorLauncher(result)));
    await tester.tap(find.byKey(const ValueKey('launch-mask-editor')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    final canvas = find.byKey(const ValueKey('inpaint-mask-canvas'));
    final rect = tester.getRect(canvas);
    await tester.dragFrom(
        rect.center - const Offset(50, 0), const Offset(60, 0));
    await tester.pump();
    await tester.tap(find.text('橡皮'));
    await tester.pump();
    await tester.dragFrom(
        rect.center + const Offset(30, 0), const Offset(40, 20));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('inpaint-mask-done')));
    await tester.pump();

    expect(result.value, isNotNull);
    expect(result.value!.strokes, hasLength(2));
    expect(result.value!.strokes.first.erase, isFalse);
    expect(result.value!.strokes.last.erase, isTrue);
    expect(tester.takeException(), isNull);
  });

  for (final target in <(String, Size)>[
    ('tiny portrait phone', const Size(320, 640)),
    ('compact portrait phone', const Size(360, 800)),
    ('landscape phone', const Size(800, 360)),
    ('portrait tablet', const Size(800, 1280)),
    ('landscape tablet', const Size(1280, 800)),
  ]) {
    testWidgets('full-screen editor fits ${target.$1}', (tester) async {
      addTearDown(tester.view.reset);
      await _pump(tester, target.$2);
      expect(find.byKey(const ValueKey('inpaint-mask-canvas')), findsOneWidget);
      expect(find.byKey(const ValueKey('inpaint-mask-done')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  for (final language in const ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
    testWidgets('editor fits a tiny phone in $language with larger text',
        (tester) async {
      addTearDown(tester.view.reset);
      await _pump(
        tester,
        const Size(320, 640),
        language: language,
        textScale: 1.2,
      );
      expect(find.byKey(const ValueKey('inpaint-mask-canvas')), findsOneWidget);
      expect(find.byKey(const ValueKey('inpaint-mask-done')), findsOneWidget);
      expect(tester.takeException(), isNull, reason: language);
    });
  }

  for (final language in const ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
    testWidgets('editor fits landscape in $language with larger text',
        (tester) async {
      addTearDown(tester.view.reset);
      await _pump(
        tester,
        const Size(800, 360),
        language: language,
        textScale: 1.2,
      );
      expect(find.byKey(const ValueKey('inpaint-mask-canvas')), findsOneWidget);
      expect(find.byKey(const ValueKey('inpaint-mask-done')), findsOneWidget);
      expect(tester.takeException(), isNull, reason: language);
    });
  }
}

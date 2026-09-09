import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/widgets/image_save_feedback.dart';

void main() {
  Future<ImageSaveFeedback> open(WidgetTester tester) async {
    late ImageSaveFeedback feedback;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Builder(
                builder: (context) => TextButton(
                      onPressed: () {
                        feedback = ImageSaveFeedback.show(context, 'zh-CN');
                      },
                      child: const Text('保存'),
                    )))));
    await tester.tap(find.text('保存'));
    await tester.pump();
    return feedback;
  }

  testWidgets(
      'download remains visible, success includes actual path then dismisses',
      (tester) async {
    final feedback = await open(tester);
    expect(find.text('正在准备下载…'), findsOneWidget);
    await tester.pump(const Duration(seconds: 30));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    feedback.downloading('正在下载…', 3);
    await tester.pump();
    expect(find.text('正在下载… (3)'), findsOneWidget);
    feedback.finish(saved: 3, path: '/actual/saved/folder');
    await tester.pump();
    expect(find.text('图片保存成功'), findsOneWidget);
    expect(find.textContaining('/actual/saved/folder'), findsOneWidget);
    await tester.pump(const Duration(seconds: 9));
    expect(find.text('图片保存成功'), findsNothing);
  });

  testWidgets('partial failure stays visible until explicitly dismissed',
      (tester) async {
    final feedback = await open(tester);
    feedback.finish(saved: 2, failed: 1, path: '/saved');
    await tester.pump();
    expect(find.text('部分图片保存成功'), findsOneWidget);
    expect(find.textContaining('已保存 2 · 失败 1'), findsOneWidget);
    await tester.pump(const Duration(minutes: 1));
    expect(find.text('部分图片保存成功'), findsOneWidget);
    await tester.tap(find.byTooltip('关闭提示'));
    await tester.pump();
    expect(find.text('部分图片保存成功'), findsNothing);
  });

  testWidgets('cancel is not reported as failure or success', (tester) async {
    final feedback = await open(tester);
    feedback.finish(saved: 0, cancelled: true);
    await tester.pump();
    expect(find.text('已取消保存'), findsOneWidget);
    expect(find.text('图片保存成功'), findsNothing);
    expect(find.text('图片保存失败'), findsNothing);
    feedback.close();
    await tester.pump();
  });

  testWidgets(
      'long paths fit a narrow screen and closed feedback ignores late updates',
      (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final feedback = await open(tester);
    feedback.finish(saved: 0, failed: 3, path: '/${'long folder/' * 50}');
    await tester.pump();
    expect(tester.takeException(), isNull);
    feedback.close();
    feedback.finish(saved: 1);
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}

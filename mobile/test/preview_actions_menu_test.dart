import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image;
import 'package:provider/provider.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/image_actions_menu.dart';
import 'package:novelai_mobile/ui/zoomable_image.dart';

class MenuState extends AppState {
  final applied = <String>[];
  @override
  Future<void> importGenerationImage(String path) async { applied.add(path); }
}

Future<ui.Image> fixtureBitmap(WidgetTester tester) async {
  return (await tester.runAsync(() async {
    final recorder=ui.PictureRecorder();
    ui.Canvas(recorder).drawRect(const Rect.fromLTWH(0,0,128,64),Paint()..color=Colors.purple);
    final picture=recorder.endRecording();final bitmap=await picture.toImage(128,64);picture.dispose();return bitmap;
  }))!;
}

void main() {
  late Directory temp;
  late File file;
  setUp(() async {
    temp = await Directory.systemTemp.createTemp('preview-actions-');
    file = File('${temp.path}/fixture.png');
    await file.writeAsBytes(image.encodePng(image.Image(width: 128, height: 64)));
  });
  tearDown(() async {
    final root=await Directory.systemTemp.resolveSymbolicLinks();final resolved=await temp.resolveSymbolicLinks();
    expect(resolved.toLowerCase(),startsWith('${root.toLowerCase()}${Platform.pathSeparator}preview-actions-'));
    await temp.delete(recursive: true);
  });

  testWidgets('long press opens shared actions read-only; only explicit apply dispatches', (tester) async {
    final state = MenuState();
    final bitmap=await fixtureBitmap(tester);
    await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(value: state,
      child: MaterialApp(home: Scaffold(body: SizedBox(width: 480, height: 600,
        child: ZoomableImage(image: RawImage(image: bitmap, fit: BoxFit.contain), imagePaths: [file.path]))))));
    await tester.pumpAndSettle();
    final before = state.params;
    await tester.longPressAt(tester.getCenter(find.byType(InteractiveViewer)));
    await tester.pumpAndSettle();
    expect(find.text('复制图片'), findsOneWidget);expect(find.text('应用到生成'), findsOneWidget);
    expect(state.applied, isEmpty);expect(identical(state.params,before), isTrue);
    await tester.tap(find.text('应用到生成'));await tester.pumpAndSettle();
    expect(state.applied, [file.path]);await tester.pumpWidget(const SizedBox.shrink());bitmap.dispose();state.dispose();
  });
  testWidgets('missing original disables actions, cancel never applies', (tester) async {
    final state = MenuState();
    late BuildContext context;
    await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(value: state,
      child: MaterialApp(home: Scaffold(body: Builder(builder: (value) { context=value; return const Text('fixture'); })))));
    final future=showLocalImageActions(context, '${temp.path}/missing.png');await tester.pumpAndSettle();
    for (final tile in tester.widgetList<ListTile>(find.byType(ListTile))) { expect(tile.enabled,isFalse); }
    Navigator.pop(context);await tester.pumpAndSettle();await future;
    expect(state.applied,isEmpty);state.dispose();
  });
  testWidgets('long press outside painted image does not open actions', (tester) async {
    final state = MenuState();
    final bitmap=await fixtureBitmap(tester);
    await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(value: state,
      child: MaterialApp(home: Scaffold(body: SizedBox(width: 480, height: 600,
        child: ZoomableImage(image: RawImage(image: bitmap, fit: BoxFit.contain), imagePaths: [file.path]))))));
    await tester.pumpAndSettle();
    await tester.longPressAt(tester.getTopLeft(find.byType(InteractiveViewer))+const Offset(8,8));await tester.pumpAndSettle();
    expect(find.byType(ListTile),findsNothing);expect(state.applied,isEmpty);await tester.pumpWidget(const SizedBox.shrink());bitmap.dispose();state.dispose();
  });
}

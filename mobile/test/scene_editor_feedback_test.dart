import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/scene_bindings_editor.dart';

void main() {
  Map<String, dynamic> base() => jsonDecode(
      File('../shared/tavern-scene-fixtures.json').readAsStringSync())['scene'];
  Future<void> open(WidgetTester tester,
      {Future<void> Function(Map<String, dynamic>)? onSave}) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: Builder(
            builder: (context) => Scaffold(
                body: TextButton(
                    onPressed: () => showSceneBindingsEditor(
                        context, base(), 'zh-CN',
                        onSave: onSave),
                    child: const Text('open'))))));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets(
      'delete requires confirmation, preserves belongings, supports undo',
      (tester) async {
    Map<String, dynamic>? saved;
    await open(tester, onSave: (scene) async {
      saved = scene;
    });
    await tester.tap(find.text('红发男子'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('remove-a')));
    await tester.tap(find.byKey(const ValueKey('remove-a')));
    await tester.pumpAndSettle();
    expect(find.textContaining('保留并解除绑定:'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, '删除'));
    await tester.pumpAndSettle();
    expect(find.text('红发男子'), findsNothing);
    expect(find.text('A 的外套'), findsOneWidget);
    await tester.ensureVisible(find.text('撤销修改'));
    await tester.tap(find.text('撤销修改'));
    await tester.pumpAndSettle();
    expect(find.text('红发男子'), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, '保存'));
    await tester.pumpAndSettle();
    expect(saved!['entities'], base()['entities']);
    expect(saved!['revision'], 2);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
      'save is single-flight; failure preserves editor and permits retry',
      (tester) async {
    final gate = Completer<void>();
    var calls = 0;
    await open(tester, onSave: (scene) {
      calls++;
      return calls == 1 ? gate.future : Future.value();
    });
    await tester.tap(find.widgetWithText(TextButton, '保存'));
    await tester.pump();
    expect(find.text('正在保存…'), findsOneWidget);
    await tester.tap(find.text('正在保存…'));
    await tester.pump();
    expect(calls, 1);
    gate.completeError(StateError('disk'));
    await tester.pumpAndSettle();
    expect(find.text('保存失败，输入已保留。'), findsOneWidget);
    expect(find.byType(SceneBindingsEditor), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, '保存'));
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(find.byType(SceneBindingsEditor), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('dirty close offers keep editing and explicit discard',
      (tester) async {
    await open(tester);
    await tester.tap(find.byTooltip('固定: 红发男子'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('取消'));
    await tester.pumpAndSettle();
    expect(find.text('放弃未保存的修改？'), findsOneWidget);
    await tester.tap(find.text('继续编辑'));
    await tester.pumpAndSettle();
    expect(find.byType(SceneBindingsEditor), findsOneWidget);
    await tester.tap(find.byTooltip('取消'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('放弃修改'));
    await tester.pumpAndSettle();
    expect(find.byType(SceneBindingsEditor), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

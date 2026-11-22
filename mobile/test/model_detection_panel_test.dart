import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/settings/model_detection_panel.dart';
import 'package:novelai_mobile/services/model_list_error.dart';

void main() {
  late TextEditingController key;
  setUp(() => key = TextEditingController(text: 'test-only'));
  tearDown(() => key.dispose());
  Future<void> show(
      WidgetTester t, Future<List<String>> Function(String, String) fetch,
      {String url = 'https://example.invalid'}) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ModelDetectionPanel(
                language: 'zh-CN',
                url: url,
                keyController: key,
                keyField: const SizedBox(),
                modelField: (items) => Text(items.join(',')),
                fetch: fetch))));
  }

  Future<void> tap(WidgetTester t) async {
    await t.tap(find.text('检测模型'));
    await t.pump();
  }

  testWidgets(
      'instant busy state prevents duplicate calls; successful options stay local',
      (t) async {
    final pending = Completer<List<String>>();
    var calls = 0;
    await show(t, (u, k) {
      calls++;
      expect(k, 'test-only');
      return pending.future;
    });
    await tap(t);
    expect(find.text('正在检测模型…'), findsOneWidget);
    expect(t.widget<OutlinedButton>(find.byType(OutlinedButton)).onPressed,
        isNull);
    await t.tap(find.byType(OutlinedButton));
    expect(calls, 1);
    pending.complete(['example-a', 'example-b']);
    await t.pump();
    expect(find.text('example-a,example-b'), findsOneWidget);
    expect(find.textContaining('已检测到 2 个模型'), findsOneWidget);
  });
  testWidgets(
      'timeout and auth distinguishable, no secret or global snackbar, retry works',
      (t) async {
    var n = 0;
    await show(t, (u, k) async {
      n++;
      if (n == 1) throw TimeoutException('secret');
      if (n == 2) throw const ModelListHttpError(401);
      return [];
    });
    await tap(t);
    expect(find.textContaining('20 秒'), findsOneWidget);
    expect(find.textContaining('secret'), findsNothing);
    await tap(t);
    expect(find.textContaining('401'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
    await tap(t);
    expect(find.text('未返回模型列表'), findsOneWidget);
  });
  testWidgets(
      'changed credentials invalidate old responses; missing credentials do not send',
      (t) async {
    final pending = Completer<List<String>>();
    var calls = 0;
    await show(t, (u, k) {
      calls++;
      return pending.future;
    });
    await tap(t);
    key.clear();
    await t.pump();
    pending.complete(['stale']);
    await t.pump();
    expect(find.textContaining('stale'), findsNothing);
    await tap(t);
    expect(find.textContaining('有效的 API'), findsOneWidget);
    expect(calls, 1);
  });
  testWidgets('leaving page while waiting does not show errors on next page',
      (t) async {
    final pending = Completer<List<String>>();
    await show(t, (u, k) => pending.future);
    await tap(t);
    await t.pumpWidget(const MaterialApp(home: Scaffold(body: Text('home'))));
    pending.completeError(TimeoutException('late'));
    await t.pump();
    expect(find.text('home'), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing);
    expect(t.takeException(), isNull);
  });
}

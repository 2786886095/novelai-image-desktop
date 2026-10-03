import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/inspect_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';

void main() {
  final titles = <String, (String, String)>{
    'zh-CN': ('反推模板版本', '转换模板版本'),
    'zh-TW': ('反推範本版本', '轉換範本版本'),
    'en-US': ('Reverse template version', 'Conversion template version'),
    'ja-JP': ('解析テンプレート版', '変換テンプレート版'),
    'ko-KR': ('분석 템플릿 버전', '변환 템플릿 버전'),
  };
  for (final entry in titles.entries) {
    for (final kind in InspectPageKind.values) {
      testWidgets('correct ${kind.name} version title in ${entry.key}',
          (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(420, 1000);
        addTearDown(tester.view.reset);
        final state = AppState();
        state.settings.language = entry.key;
        addTearDown(state.dispose);
        await tester.pumpWidget(ChangeNotifierProvider.value(
          value: state,
          child: MaterialApp(home: InspectScreen(kind: kind)),
        ));
        await tester.pump();
        expect(tester.takeException(), isNull);
        final expected = kind == InspectPageKind.reverse
            ? entry.value.$1
            : entry.value.$2;
        final wrong = kind == InspectPageKind.reverse
            ? entry.value.$2
            : entry.value.$1;
        expect(find.text(expected), findsOneWidget);
        expect(find.text(wrong), findsNothing);
      });
    }
  }
  test('conversion settings use conversion title, reverse binding is retained', () {
    final source = File('lib/screens/settings_screen.dart').readAsStringSync();
    expect(source.contains("value:s.convertPromptTemplateVersion,decoration:InputDecoration(labelText:mobileUiTextFor(s.language,'convert.templateVersionTitle')"), isTrue);
    expect(source.contains("value:s.reversePromptTemplateVersion,decoration:InputDecoration(labelText:mobileUiTextFor(s.language,'inspect.templateVersionTitle')"), isTrue);
  });
}

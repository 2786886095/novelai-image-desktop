import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/prompts/capsule_data.dart';
import 'package:novelai_mobile/screens/capsule_picker_sheet.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/tags/multilingual_tag_packs.dart';

class _Pack extends MultilingualTagPacks {
  @override
  Future<List<TagPackExactHit>?> lookupExact(Iterable<String> terms,
          {bool translations = false}) async =>
      null;
  @override
  Future<({int total, List<TagPackHit> rows})?> capsulePage(String q,
          {required int page,
          required String sort,
          Iterable<String> topic = const []}) async =>
      (
        total: 1,
        rows: [
          (tag: 'qa_global', description: 'global', category: 0, count: 18)
        ]
      );
}

void main() {
  testWidgets(
      'role directory offers body/clothing/eyes/accessories without horizontal swipe; global search returns to last subgroup',
      (t) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final raw =
        jsonDecode(File('assets/capsule_taxonomy.json').readAsStringSync())
            as List;
    final cats = raw
        .map((e) => CapsuleCategory.fromJson(e as Map<String, dynamic>))
        .toList();
    final app = AppState(multilingualTags: _Pack()..active = 'zh-CN');
    app.settings.language = 'zh-CN';
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(
            home: Scaffold(
                body: CapsulePickerSheet(
                    categories: cats, onPick: (_, __) {})))));
    await t.pumpAndSettle();
    for (final n in ['体型', '上衣', '下装', '眼睛', '饰品']) {
      final x = find.widgetWithText(ChoiceChip, n);
      expect(x, findsOneWidget, reason: n);
      expect(x.hitTestable(), findsOneWidget,
          reason: 'visible without sideways swiping: $n');
    }
    await t.tap(find.widgetWithText(ChoiceChip, '上衣'));
    await t.pumpAndSettle();
    final tops = cats
        .firstWhere((c) => c.name == '服饰')
        .subgroups
        .firstWhere((g) => g.name == '上衣');
    final first = find.byKey(ValueKey('capsule-tag:${tops.tags.first.tag}'));
    expect(first, findsOneWidget);
    expect(find.byKey(const ValueKey('capsule-tag:1girl')), findsNothing);
    await t.enterText(find.byType(TextField).first, 'qa_global');
    await t.pump(const Duration(milliseconds: 210));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('capsule-tag:qa_global')), findsOneWidget);
    await t.tap(find.byIcon(Icons.clear));
    await t.pumpAndSettle();
    expect(t.widget<ChoiceChip>(find.widgetWithText(ChoiceChip, '上衣')).selected,
        isTrue);
    expect(first, findsOneWidget);
    await t.tap(find.widgetWithText(ChoiceChip, '全库列表'));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('capsule-tag:qa_global')), findsOneWidget);
    await t.tap(find.widgetWithText(ChoiceChip, '分类浏览'));
    await t.pumpAndSettle();
    expect(first, findsOneWidget);
    await t.tap(find.byKey(const ValueKey('capsule-subgroups-more')));
    await t.pumpAndSettle();
    expect(find.widgetWithText(ChoiceChip, '鞋靴'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('capsule-main-category')));
    await t.pumpAndSettle();
    await t.tap(find.text('服饰').last);
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(ChoiceChip, '下装'));
    await t.pumpAndSettle();
    final bottom = cats
        .firstWhere((c) => c.name == '服饰')
        .subgroups
        .firstWhere((g) => g.name == '下装');
    expect(find.byKey(ValueKey('capsule-tag:${bottom.tags.first.tag}')),
        findsOneWidget);
    expect(find.byKey(const ValueKey('capsule-tag:1girl')), findsNothing);
  });
}

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    testWidgets('$platform: all real categories, subcategories and pages',
        (t) async {
      final old = debugDefaultTargetPlatformOverride;
      debugDefaultTargetPlatformOverride = platform;
      t.view.physicalSize = const Size(390, 1800);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      final cats =
          (jsonDecode(File('assets/capsule_taxonomy.json').readAsStringSync())
                  as List)
              .map((x) => CapsuleCategory.fromJson(x))
              .toList();
      final state = AppState(multilingualTags: _Pack());
      state.settings.language = 'zh-CN';
      int checked = 0, pages = 0, rendered = 0;
      Future<void> tap(Finder f) async {
        await t.ensureVisible(f);
        await t.tap(f);
        await t.pumpAndSettle();
      }

      try {
        await t.pumpWidget(ChangeNotifierProvider.value(
            value: state,
            child: MaterialApp(
                home: Scaffold(
                    body: CapsulePickerSheet(
                        categories: cats, onPick: (_, __) {})))));
        await t.pumpAndSettle();
        for (final c in cats) {
          await tap(find.byKey(const ValueKey('capsule-main-category')));
          await tap(find.text(c.name == '人物' ? '角色' : c.name).last);
          final groups = {for (final g in c.subgroups) g.name: g};
          if (c.name == '人物')
            for (final g in cats.firstWhere((c) => c.name == '服饰').subgroups) {
              groups.putIfAbsent(g.name, () => g);
            }
          for (final group in groups.values) {
            final btn = find.byKey(
                ValueKey('capsule-subgroup:' + c.name + ':' + group.name));
            if (btn.evaluate().isEmpty)
              await tap(find.byKey(const ValueKey('capsule-subgroups-more')));
            await tap(btn);
            final terms = <String, String>{};
            for (final tag in group.tags) {
              terms.putIfAbsent(
                  MultilingualTagPacks.key(tag.tag), () => tag.tag);
            }
            final expected = terms.values.toList();
            for (var start = 0; start < expected.length; start += 24) {
              if (start != 0) await tap(find.byTooltip('下一页'));
              final seen = t
                  .widgetList<ActionChip>(find.byType(ActionChip))
                  .map((w) => w.key)
                  .whereType<ValueKey<String>>()
                  .where((k) => k.value.startsWith('capsule-tag:'))
                  .map((k) => k.value.substring(12))
                  .toList();
              expect(seen, expected.skip(start).take(24).toList(),
                  reason: c.name + '/' + group.name + ' offset $start');
              pages++;
              rendered += seen.length;
            }
            checked++;
          }
        }
        print('PASS $platform categories=' +
            cats.length.toString() +
            ' paths=$checked pages=$pages tag placements=$rendered');
      } finally {
        await t.pumpWidget(const SizedBox.shrink());
        await t.pump();
        debugDefaultTargetPlatformOverride = old;
      }
    }, timeout: const Timeout(Duration(minutes: 6)));
  }
  testWidgets(
      'iOS GenerateScreen opens directory and applies to current positive prompt',
      (t) async {
    final old = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    t.view.physicalSize = const Size(390, 1100);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    SharedPreferences.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMessageHandler('flutter/assets', (msg) async {
      final key = utf8.decode(
          msg!.buffer.asUint8List(msg.offsetInBytes, msg.lengthInBytes));
      if (key == 'assets/capsule_taxonomy.json')
        return ByteData.sublistView(utf8.encode(
            '[{"name":"人物","subgroups":[{"name":"对象","tags":[{"en":"solo","zh":"单人"}]}]},{"name":"服饰","subgroups":[{"name":"上衣","tags":[{"en":"shirt","zh":"衬衫"}]}]}]'));
      final f = File(key);
      return f.existsSync() ? ByteData.sublistView(f.readAsBytesSync()) : null;
    });
    final state = AppState(multilingualTags: _Pack());
    state.settings.language = 'zh-CN';
    state.settings.autoComplete = false;
    try {
      await t.pumpWidget(ChangeNotifierProvider.value(
          value: state, child: const MaterialApp(home: GenerateScreen())));
      await t.pumpAndSettle();
      final open = find.text('灵感胶囊').first;
      await t.ensureVisible(open);
      await t.tap(open);
      await t.pumpAndSettle();
      await t.tap(find.widgetWithText(ChoiceChip, '上衣'));
      await t.pumpAndSettle();
      final tag = find.byKey(const ValueKey('capsule-tag:shirt'));
      await t.ensureVisible(tag);
      await t.tap(tag);
      await t.pumpAndSettle();
      expect(state.params.positivePrompt, contains('shirt'));
      expect(state.params.negativePrompt, isNot(contains('shirt')));
    } finally {
      await t.pumpWidget(const SizedBox.shrink());
      await t.pump();
      debugDefaultTargetPlatformOverride = old;
    }
  });
}

import 'dart:ui' show SemanticsAction;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_mode.dart';
import 'package:novelai_mobile/screens/inspect_screen.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

final layouts = <String, (Size, TargetPlatform, ReversePromptMode, bool)>{
  'Android phone': (const Size(420, 920), TargetPlatform.android, ReversePromptMode.tags, false),
  'iPhone layout': (const Size(390, 844), TargetPlatform.iOS, ReversePromptMode.natural, false),
  'iPad layout': (const Size(834, 1112), TargetPlatform.iOS, ReversePromptMode.tags, true),
  'large shared Flutter layout': (const Size(1024, 768), TargetPlatform.android, ReversePromptMode.natural, true),
};
Future<void> reveal(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 300, scrollable: find.byType(Scrollable).first, maxScrolls: 25);
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
}
TextToolHistoryItem record(String id, ReversePromptMode mode, {bool variants = false, bool empty = false}) =>
    TextToolHistoryItem(id: id, mode: mode, knownCharacter: variants, input: 'QA history $id',
      result: empty ? '' : mode == ReversePromptMode.tags ? '1girl, solo, qa history $id' : 'The person carries the original prop on the stated side for $id.',
      variants: variants ? PromptVariants(namePrompt: '1girl, qa named character $id', featurePrompt: 'The same person retains visible features and original prop for $id.') : null,
      createdAt: '2026-10-03T00:00:00.000');
void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    UnifiedStorage.active = null;
  });
  for (final kind in InspectPageKind.values) {
    for (final entry in layouts.entries) {
      testWidgets('${kind.name} history single-click reuse, semantics, delete isolation: ${entry.key}', (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = entry.value.$1;
        debugDefaultTargetPlatformOverride = entry.value.$2;
        addTearDown(() {tester.view.reset(); debugDefaultTargetPlatformOverride = null;});
        final state = AppState();
        state.settings.language = 'en-US';
        state.settings.promptCodexEnhanceEnabled = false;
        state.params..positivePrompt = 'ORIGINAL_POSITIVE_QA'..stylePrompt = 'STYLE_KEEP_QA'..negativePrompt = 'NEGATIVE_KEEP_QA'..seed = 345678;
        final first = record('first', entry.value.$3, variants: entry.value.$4);
        final second = record('second', entry.value.$3);
        if (kind == InspectPageKind.reverse) {state.reverseHistory = [first, second];} else {state.convertHistory = [first, second];}
        final before = state.params.toJson();
        final semantics = tester.ensureSemantics();
        await tester.pumpWidget(ChangeNotifierProvider.value(value: state, child: MaterialApp(home: InspectScreen(kind: kind))));
        await tester.pumpAndSettle();
        await reveal(tester, find.text('History · 2'));
        await tester.tap(find.widgetWithIcon(IconButton, Icons.expand_more).last);
        await tester.pumpAndSettle();
        await reveal(tester, find.text('QA history first'));
        await tester.tap(find.text('QA history first'));
        await tester.pumpAndSettle();
        if (entry.value.$4) {
          final use = find.byWidgetPredicate((w) => w is OutlinedButton && w.onPressed != null);
          expect(use, findsNWidgets(2));
          await reveal(tester, use.first);
          await tester.tap(use.first);await tester.pumpAndSettle();
          expect(state.params.positivePrompt, first.variants!.namePrompt, reason: 'Name variant history action promises Generate, not merely tool preview');
          await reveal(tester, use.last);
          await tester.tap(use.last);await tester.pumpAndSettle();
          expect(state.params.positivePrompt, first.variants!.featurePrompt, reason: 'Feature variant must independently apply exactly');
        } else {
          final use = find.byWidgetPredicate((w) => w is IconButton && w.icon is Icon && (w.icon as Icon).icon == Icons.send_outlined && w.onPressed != null);
          expect(use, findsOneWidget);
          await reveal(tester, use);await tester.tap(use);await tester.pumpAndSettle();
          expect(state.params.positivePrompt, first.result, reason: 'Single history icon action must update the actual Generate positive prompt');
        }
        final expected = entry.value.$4 ? first.variants!.featurePrompt : first.result;
        expect(kind == InspectPageKind.reverse ? state.reverseResult : state.convertResult, expected);
        final after = state.params.toJson();
        before.remove('positivePrompt');after.remove('positivePrompt');
        expect(after, before, reason: 'Style, negative, dimensions, model, seed and other params must remain unchanged');
        expect(kind == InspectPageKind.reverse ? state.reverseHistory : state.convertHistory, [first, second]);
        await reveal(tester, find.byTooltip('Collapse history'));
        expect(tester.getSemantics(find.bySemanticsLabel('Collapse history')).getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
        expect(find.byTooltip('Delete this history record'), findsNWidgets(2));
        await reveal(tester, find.byTooltip('Delete this history record').last);
        await tester.tap(find.byTooltip('Delete this history record').last);await tester.pumpAndSettle();
        expect(kind == InspectPageKind.reverse ? state.reverseHistory : state.convertHistory, [first]);
        expect(state.params.positivePrompt, expected);
        await reveal(tester, find.byTooltip('Collapse history'));
        await tester.tap(find.byTooltip('Collapse history'));await tester.pumpAndSettle();
        expect(find.text('QA history first'), findsNothing);
        expect(find.byTooltip('Expand history'), findsOneWidget);
        final stored = await SharedPreferences.getInstance();
        expect(stored.getString('gen_params'), contains(expected));
        await tester.pumpWidget(const SizedBox.shrink());await tester.pumpAndSettle();
        state.dispose();semantics.dispose();
        debugDefaultTargetPlatformOverride = null;
        expect(tester.takeException(), isNull);
      });
    }
  }
  testWidgets('empty historical outputs cannot erase either tool or Generate prompt', (tester) async {
    tester.view.devicePixelRatio = 1;tester.view.physicalSize = const Size(420, 920);addTearDown(tester.view.reset);
    for (final kind in InspectPageKind.values) {
      final state = AppState();state.settings.language='en-US';state.params.positivePrompt='KEEP_ORIGINAL';
      final item=record('empty',ReversePromptMode.tags,empty:true);
      if(kind==InspectPageKind.reverse){state.reverseHistory=[item];}else{state.convertHistory=[item];}
      await tester.pumpWidget(ChangeNotifierProvider.value(value:state,child:MaterialApp(home:InspectScreen(kind:kind))));await tester.pumpAndSettle();
      await reveal(tester,find.text('History · 1'));await tester.tap(find.widgetWithIcon(IconButton,Icons.expand_more).last);await tester.pumpAndSettle();
      await reveal(tester,find.text('QA history empty'));await tester.tap(find.text('QA history empty'));await tester.pumpAndSettle();
      final use=find.byWidgetPredicate((w)=>w is IconButton && w.icon is Icon && (w.icon as Icon).icon==Icons.send_outlined);
      expect(use,findsOneWidget);expect(tester.widget<IconButton>(use).onPressed,isNull);
      expect(state.params.positivePrompt,'KEEP_ORIGINAL');
      await tester.pumpWidget(const SizedBox.shrink());await tester.pumpAndSettle();state.dispose();
    }
    expect(tester.takeException(),isNull);
  });
  test('history action labels are localized in all five saved languages', () {
    for(final language in ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']) {
      for(final key in ['textTool.historyExpand','textTool.historyCollapse','textTool.historyDelete']) {
        final label=mobileUiTextFor(language,key);
        expect(label,isNotEmpty);expect(label,isNot(key));
      }
    }
  });
}

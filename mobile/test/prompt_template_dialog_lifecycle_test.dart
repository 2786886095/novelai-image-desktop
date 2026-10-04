import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/screens/settings_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';

// The real settings screen/dialog/resolver is rendered. Only persistence and
// generation quoting are suppressed in this focused lifecycle fixture.
class _DialogState extends AppState {
  @override
  Future<void> setSettings(void Function(AppSettings) update) async {
    update(settings);
    notifyListeners();
  }
}

void main() {
  for (final kind in ['reverse', 'convert']) {
    for (final action in ['保存', '取消', '恢复默认']) {
      testWidgets('$kind focused mixed editor closes safely with $action',
          (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(420, 1000);
        addTearDown(tester.view.reset);
        final state = _DialogState();
        state.settings.language = 'zh-CN';
        state.settings.reversePromptTemplateVersion = 'v5';
        state.settings.convertPromptTemplateVersion = 'v5';
        state.promptTemplates =
            (await tester.runAsync(PromptTemplateLibrary.load))!;
        addTearDown(state.dispose);
        await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
          value: state,
          child: const MaterialApp(home: SettingsScreen()),
        ));
        await tester.pumpAndSettle();
        final section = find.text('提示词模板');
        // ListView lazily builds distant settings sections. Scrolling is a real
        // user action; ensureVisible alone cannot materialize an absent element.
        final settingsList = find.descendant(of: find.byType(SettingsScreen), matching: find.byType(ListView)).first;
        final scrollable = find.descendant(of: settingsList, matching: find.byType(Scrollable)).first;
        await tester.scrollUntilVisible(section, 400, scrollable: scrollable, maxScrolls: 30);
        expect(section, findsOneWidget);
        await tester.ensureVisible(section);
        await tester.pumpAndSettle();
        await tester.tap(section);
        await tester.pumpAndSettle();
        final tiles = find.ancestor(
            of: find.text('Mixed'), matching: find.byType(ListTile));
        expect(tiles, findsNWidgets(2));
        final tile = tiles.at(kind == 'reverse' ? 0 : 1);
        await tester.ensureVisible(tile);
        await tester.pumpAndSettle();
        await tester.tap(tile);
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsOneWidget);
        final field = find.descendant(
            of: find.byType(AlertDialog), matching: find.byType(TextField));
        final original = tester.widget<TextField>(field).controller!.text;
        final edited = '$original\nQA_NATIVE_DIALOG_LIFECYCLE_KEEP';
        await tester.tap(field);
        await tester.enterText(field, edited);
        await tester.pump();
        await tester.tap(find.descendant(
            of: find.byType(AlertDialog), matching: find.text(action)));
        // Inspect the dismissal transition, not only the settled end state.
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
        expect(tester.takeException(), isNull,
            reason: 'A focused TextField controller must outlive route animation');
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byType(AlertDialog), findsNothing);
        expect(state.promptOverrides(kind)['mixed'],
            action == '保存' ? edited : null);
        final other = kind == 'reverse' ? 'convert' : 'reverse';
        expect(state.promptOverrides(other), isEmpty);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  }
}

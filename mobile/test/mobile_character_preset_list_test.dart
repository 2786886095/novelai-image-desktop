import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/positive_prompt_preset_sheet.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('phone role presets scroll vertically and preserve selection',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 810);
    addTearDown(tester.view.reset);
    final state = AppState();
    addTearDown(state.dispose);
    state.settings.language = 'en-US';
    state.settings.positivePromptPresets = List.generate(40, (i) {
      final n = (i + 1).toString().padLeft(2, '0');
      return PositivePromptPreset(
        id: 'role$n',
        name: 'Role $n',
        prompt: 'prompt$n',
        createdAt: 'now',
        captions: [
          CharCaptionItem(
              prompt: 'prompt$n',
              negativePrompt: 'negative$n',
              x: .25,
              y: .75,
              useCoords: true)
        ],
      );
    });
    var main = 'unchanged';
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
            home: Scaffold(
                body: PositivePromptPresetButton(
          currentPrompt: main,
          onApply: (next) => main = next,
        )))));
    await tester.tap(find.text('Prompt presets'));
    await tester.pumpAndSettle();

    final first = find.text('Role 01').first;
    final scrollable =
        find.ancestor(of: first, matching: find.byType(Scrollable)).first;
    final direction = tester.widget<Scrollable>(scrollable).axisDirection;
    debugPrint('ROLE_LIST_AXIS=$direction');
    debugPrint(
        'REFERENCE_ADD_VISIBLE=${find.text("Add images 0/3").evaluate().isNotEmpty}');
    expect(direction, AxisDirection.down);
    expect(tester.getTopLeft(find.text('Role 02')).dy,
        greaterThan(tester.getTopLeft(first).dy));
    expect(find.text('Add images 0/3'), findsNothing);
    expect(find.text('Role 06'), findsWidgets);
    await tester.scrollUntilVisible(find.text('Role 40'), 350,
        scrollable: find.descendant(
            of: find.byKey(const ValueKey('positive-preset-list')),
            matching: find.byType(Scrollable)),
        maxScrolls: 35);
    await tester.tap(find.text('Role 40'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Details'));
    await tester.pumpAndSettle();
    expect(find.text('Reference images · 0/3'), findsOneWidget);
    expect(find.text('Add images 0/3'), findsNothing);
    await tester.tap(find.text('Reference images · 0/3'));
    await tester.pumpAndSettle();
    expect(find.text('Add images 0/3'), findsOneWidget);
    expect(find.byIcon(Icons.image_outlined), findsNothing);
    await tester.tap(find.text('Back to presets'));
    await tester.pumpAndSettle();
    expect(find.text('Role 40').hitTestable(), findsOneWidget);
    debugPrint(
        'ROLE_40_VERTICAL_SCROLL=pass; REFERENCES_COLLAPSED=pass; LIST_POSITION_RESTORED=pass');
    final search = find.widgetWithText(TextField, 'Search names or prompts');
    await tester.enterText(search, 'prompt07');
    await tester.pumpAndSettle();
    expect(find.text('Role 07').hitTestable(), findsOneWidget);
    expect(find.text('Role 40'), findsNothing);
    expect(find.byKey(const ValueKey('positive-preset-apply')), findsNothing);
    await tester.tap(find.text('Role 07'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Apply · 1'));
    await tester.pumpAndSettle();
    expect(state.extras.charCaptions.single.prompt, 'prompt07');
    expect(state.extras.charCaptions.single.negativePrompt, 'negative07');
    expect(state.extras.charCaptions.single.x, .25);
    expect(state.extras.charCaptions.single.y, .75);
    expect(main, 'unchanged');
    expect(tester.takeException(), isNull);
    debugPrint(
        'SEARCH_AND_APPLY_CORRECT_ROLE=pass; GLOBAL_PROMPT_UNCHANGED=pass');
  });

  testWidgets('narrow phone keeps search results usable above the keyboard',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 640);
    addTearDown(tester.view.reset);
    final state = AppState();
    addTearDown(state.dispose);
    state.settings.language = 'en-US';
    state.settings.positivePromptPresets = [
      PositivePromptPreset(
        id: 'alpha',
        name: 'A very long character preset name',
        prompt: 'alpha',
        createdAt: 'now',
      ),
    ];
    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: state,
      child: MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: const TextScaler.linear(1.25)),
          child: child!,
        ),
        home: Scaffold(
            body:
                PositivePromptPresetButton(currentPrompt: '', onApply: (_) {})),
      ),
    ));
    await tester.tap(find.text('Prompt presets'));
    await tester.pumpAndSettle();
    final search = find.widgetWithText(TextField, 'Search names or prompts');
    expect(tester.takeException(), isNull, reason: 'before keyboard');
    tester.view.viewInsets = const FakeViewPadding(bottom: 270);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull, reason: 'keyboard open');
    await tester.enterText(search, 'no-match');
    await tester.pumpAndSettle();
    expect(find.text('No matching presets').hitTestable(), findsOneWidget);
    expect(find.byKey(const ValueKey('positive-preset-apply')), findsNothing);
    expect(tester.takeException(), isNull, reason: 'no matches');
    await tester.enterText(search, 'alpha');
    await tester.pumpAndSettle();
    expect(find.text('A very long character preset name').hitTestable(),
        findsOneWidget);
    expect(tester.takeException(), isNull, reason: 'one match');
    await tester.tap(find.text('A very long character preset name'));
    tester.view.resetViewInsets();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('positive-preset-apply')).hitTestable(),
        findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

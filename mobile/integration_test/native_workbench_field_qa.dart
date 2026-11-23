// Offline, debug-only acceptance entry; never import from the product.
import 'dart:convert';
import 'dart:io';
import 'package:novelai_mobile/main.dart' show HomeShell;
import 'package:novelai_mobile/ui/studio_shell.dart';
import 'package:novelai_mobile/ui/android/android_studio_shell.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';

Future<void> main() async {
  final binding = WidgetsFlutterBinding.ensureInitialized();
  final t = LiveWidgetController(binding);
  final state = AppState();
  state.settings.language = 'en-US';
  state.settings.autoComplete = false;
  state.params.positivePrompt = 'global anchor';
  state.addCharacter();
  final role = state.extras.charCaptions.last;
  role.prompt = 'solo';
  const rawNegative =
      'fog, 1.5::red, blue::, poster "A, B"\nText: Keep,  spacing';
  const adjustedNegative =
      '{fog}, 1.5::red::, 1.4::blue::, poster "A, B"\nText: Keep,  spacing';
  role.negativePrompt = rawNegative;
  final steps = <String>[];
  final proof =
      File('${(await getApplicationDocumentsDirectory()).path}/FIELD_QA.json');
  if (await proof.exists()) await proof.delete();
  final stopwatch = Stopwatch()..start();
  Future<void> tap(Finder f) async {
    await t.ensureVisible(f);
    await t.pump(const Duration(milliseconds: 120));
    if (f.hitTestable().evaluate().isEmpty) {
      throw StateError('Not hittable: $f');
    }
    await t.tap(f);
    await t.pump(const Duration(milliseconds: 440));
  }

  void check(bool yes, String msg) {
    if (!yes) throw StateError(msg);
    steps.add(msg);
  }

  Future<void> openRole(String key) async {
    final f = find.byKey(ValueKey(key));
    if (f.evaluate().isEmpty) {
      await t.scrollUntilVisible(f, 220,
          scrollable: find.byType(Scrollable).first, maxScrolls: 70);
    }
    await t.ensureVisible(f);
    await t.pump(const Duration(milliseconds: 200));
    if (Platform.isIOS) {
      await tap(find.descendant(
          of: f, matching: find.byKey(const ValueKey('prompt-expand'))));
    } else {
      await tap(f);
    }
    check(
        find
                .byKey(const ValueKey('android-fullscreen-prompt-text'))
                .evaluate()
                .length ==
            1,
        'fullscreen:$key');
  }

  final Map<String, dynamic> result = {
    'os': Platform.operatingSystem,
    'steps': steps
  };
  try {
    runApp(ChangeNotifierProvider.value(
        value: state, child: const MaterialApp(home: GenerateScreen())));
    await t.pump(const Duration(seconds: 1));
    await t.pump();
    final i = state.extras.charCaptions.length - 1;
    await openRole('character-prompt-field-$i');
    await tap(find.byKey(const ValueKey('android-editor-capsule')));
    await tap(find.byWidgetPredicate((w) =>
        w is ChoiceChip &&
        w.label is Text &&
        (w.label as Text).data == 'Tops'));
    await tap(find.byKey(const ValueKey('capsule-tag:shirt')));
    check(
        role.prompt.contains('shirt') &&
            role.negativePrompt == rawNegative &&
            state.params.positivePrompt == 'global anchor',
        'capsule-to-selected-role-only');
    Navigator.of(t.element(find.byKey(const ValueKey('capsule-tag:shirt'))))
        .pop();
    await t.pump(const Duration(milliseconds: 450));
    await tap(find.text('Done'));
    await openRole('character-negative-field-$i');
    await tap(find.text('More tools'));
    await tap(find.text(generateScreenTextFor('en-US').weight));
    await tap(find.descendant(
        of: find.widgetWithText(ListTile, 'fog'),
        matching: find.byIcon(Icons.add)));
    await tap(find.descendant(
        of: find.widgetWithText(ListTile, 'blue'),
        matching: find.byIcon(Icons.remove)));
    await tap(find.widgetWithText(FilledButton, 'Apply'));
    check(
        role.negativePrompt == adjustedNegative &&
            role.prompt.contains('shirt') &&
            state.params.positivePrompt == 'global anchor',
        'weight-to-selected-role-negative-only');
    await tap(find.text('Done'));
    await tap(find.byKey(const ValueKey('mobile-role-bulk')));
    await tap(find.text('Read current characters'));
    await tap(find.text('Group presets and format'));
    await tap(find.byKey(const ValueKey('bulk-format')));
    final name = find.byKey(const ValueKey('bulk-preset-name'));
    await tap(name);
    final control =
        find.descendant(of: name, matching: find.byType(EditableText));
    final edit = (control.evaluate().single as StatefulElement).state
        as EditableTextState;
    edit.updateEditingValue(const TextEditingValue(
        text: 'QA duo', selection: TextSelection.collapsed(offset: 6)));
    FocusManager.instance.primaryFocus?.unfocus();
    await t.pump(const Duration(milliseconds: 450));
    await tap(find.byKey(const ValueKey('bulk-preset-save')));
    check(
        state.settings.positivePromptPresets.any((p) =>
            p.name == 'QA duo' &&
            p.captions.last.negativePrompt == adjustedNegative),
        'save-named-group-without-changing-role');
    await tap(find.text('QA duo').first);
    await tap(find.widgetWithText(FilledButton, 'Apply'));
    check(
        state.extras.charCaptions.last.prompt.contains('shirt') &&
            state.extras.charCaptions.last.negativePrompt == adjustedNegative &&
            state.params.positivePrompt == 'global anchor',
        'read-format-save-load-apply-group');
    final navState = AppState();
    await navState.storage.markNetworkOnboardingSeen();
    await navState.load();
    navState.settings.language = 'en-US';
    runApp(ChangeNotifierProvider.value(
        value: navState, child: const MaterialApp(home: HomeShell())));
    await t.pump(const Duration(milliseconds: 850));
    Finder key(String k) => find.byKey(ValueKey(k));
    final android = Platform.isAndroid;
    final shell =
        find.byType(android ? AndroidStudioShell : StudioAdaptiveShell);
    List<StudioDestination> destinations() => android
        ? (t.widget(shell) as AndroidStudioShell).destinations
        : (t.widget(shell) as StudioAdaptiveShell).destinations;
    int active() => android
        ? (t.widget(shell) as AndroidStudioShell).selectedIndex
        : (t.widget(shell) as StudioAdaptiveShell).selectedIndex;
    for (var i = 0; i < 50 && shell.evaluate().isEmpty; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
    final names = destinations().map((d) => d.label).toList();
    for (final index in [...List.generate(names.length - 1, (i) => i + 1), 0]) {
      if (android) {
        await tap(key('android-all-features'));
        await tap(key('android-open-feature-catalog'));
      } else {
        await tap(key('phone-open-more'));
      }
      final target = key((android ? 'android-catalog-' : 'classic-catalog-') +
          index.toString());
      if (!android) {
        final search = key('workbench-feature-search');
        await tap(search);
        final element = find
            .descendant(of: search, matching: find.byType(EditableText))
            .evaluate()
            .single as StatefulElement;
        (element.state as EditableTextState)
            .updateEditingValue(TextEditingValue(text: names[index]));
        FocusManager.instance.primaryFocus?.unfocus();
        await t.pump(const Duration(milliseconds: 300));
      }
      if (target.evaluate().isEmpty) {
        final list = find
            .descendant(
                of: find.byType(BottomSheet).last,
                matching: find.byType(Scrollable))
            .last;
        await t.scrollUntilVisible(target, 200,
            scrollable: list, maxScrolls: 40);
      }
      await tap(target);
      check(active() == index, 'open:${names[index]}');
    }
    result['passed'] = true;
  } catch (e, s) {
    result['passed'] = false;
    result['error'] = e.toString();
    result['stack'] = s.toString();
  }
  result['ms'] = stopwatch.elapsedMilliseconds;
  await proof.writeAsString(jsonEncode(result), flush: true);
  debugPrint('FIELD_QA ${jsonEncode(result)}');
}

import 'package:novelai_mobile/screens/capsule_picker_sheet.dart';
import 'package:novelai_mobile/screens/mobile_bulk_controls.dart';
import 'package:novelai_mobile/screens/positive_prompt_preset_sheet.dart';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';

import 'package:novelai_mobile/models/nai_models.dart';

import 'package:novelai_mobile/screens/generate_screen.dart';

import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

Future<void> main() async {
  final binding = WidgetsFlutterBinding.ensureInitialized(), app = AppState();
  final t = LiveWidgetController(binding);
  final file = File(
      '${(await getApplicationDocumentsDirectory()).path}/PROMPT_ROLE_QA.json');
  if (file.existsSync()) file.deleteSync();
  final output = <String, dynamic>{'os': Platform.operatingSystem},
      steps = <String>[];
  output['steps'] = steps;
  void check(bool v, String msg) {
    if (!v) throw StateError(msg);
    steps.add(msg);
  }

  Finder key(String k) => find.byKey(ValueKey(k));
  Future<void> tick([int ms = 400]) async {
    await t.pump(Duration(milliseconds: ms));
    await t.pump();
  }

  Future<void> until(bool Function() ready, String description) async {
    final clock = Stopwatch()..start();
    while (!ready()) {
      if (clock.elapsed > const Duration(seconds: 18)) {
        throw StateError(
            'Waiting for $description; steps=${steps.join(',')}');
      }
      await tick(100);
    }
  }

  Future<void> locate(Finder f) async {
    if (f.evaluate().isEmpty) {
      final scroll = t.state<ScrollableState>(find.byType(Scrollable).first);
      scroll.position.jumpTo(0);
      await tick(90);
      for (var i = 0; i < 55 && f.evaluate().isEmpty; i++) {
        final next = (scroll.position.pixels + 240)
            .clamp(0.0, scroll.position.maxScrollExtent)
            .toDouble();
        if (next == scroll.position.pixels) break;
        scroll.position.jumpTo(next);
        await tick(60);
      }
    }
    if (f.evaluate().isEmpty) throw StateError('missing $f');
    await t.ensureVisible(f.first);
    await tick(170);
  }

  Future<void> tap(Finder f) async {
    await locate(f);
    await until(() => f.hitTestable().evaluate().isNotEmpty,
        'visible touch target $f');
    await t.tap(f.hitTestable().first);
    await tick();
  }

  Future<void> type(Finder f, String v) async {
    await locate(f);
    await t.tap(f.first);
    await tick(100);
    final e = find.descendant(of: f.first, matching: find.byType(EditableText));
    (t.state(e) as EditableTextState).updateEditingValue(TextEditingValue(
        text: v, selection: TextSelection.collapsed(offset: v.length)));
    FocusManager.instance.primaryFocus?.unfocus();
    await tick();
  }

  void mount(Widget w) => runApp(ChangeNotifierProvider<AppState>.value(
      value: app,
      child:
          MaterialApp(key: UniqueKey(), theme: StudioTheme.light(), home: w)));
  try {
    app.settings.language = 'zh-CN';
    app.settings.autoComplete = false;
    app.params.model = 'nai-diffusion-5-full';
    app.params.positivePrompt = 'global';
    app.extras.charCaptions = [
      CharCaptionItem(
          name: 'A',
          prompt: 'aaa',
          negativePrompt: 'keep',
          x: .2,
          y: .7,
          useCoords: true),
      CharCaptionItem(prompt: 'bbb'),
      CharCaptionItem(prompt: 'tail')
    ];
    void editor() => mount(const Scaffold(
        body: SafeArea(
            child: SingleChildScrollView(child: WorkbenchCharacterEditor()))));
    editor();
    await tick(800);
    final target = key('character-prompt-field-0');
    final expand = find.descendant(of: target, matching: key('prompt-expand'));
    await tap(expand.evaluate().isEmpty ? target : expand);
    await until(() => key('android-editor-capsule').evaluate().isNotEmpty,
        'expanded prompt editor');
    await tap(key('android-editor-capsule'));
    final chips = find.descendant(
        of: find.byType(CapsulePickerSheet), matching: find.byType(ActionChip));
    await until(() => chips.evaluate().isNotEmpty, 'capsule options');
    final chip = chips.first,
        tag = ((t.widget(chip).key as ValueKey<String>)
                .value
                .substring('capsule-tag:'.length))
            .replaceAll('_', ' ');
    await tap(chip);
    check(
        app.extras.charCaptions.first.prompt.contains(tag) &&
            app.extras.charCaptions[1].prompt == 'bbb' &&
            app.params.positivePrompt == 'global',
        'capsule-updated-only-active-role');
    await tap(find.descendant(
        of: find.byType(CapsulePickerSheet), matching: find.text('完成')));
    await tap(find.text('完成').last);
    final labels = mobileBulkLabels('zh-CN');
    final data = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == 'JSON / TXT');
    Future<void> openBulk() async {
      await tap(find.text(labels[0]).first);
      await until(() => data.evaluate().isNotEmpty, 'bulk input');
    }

    final duo = jsonEncode({
      'characters': [
        {'name': 'Luna', 'prompt': 'silver scarf'},
        {'name': 'Sol', 'prompt': 'green coat', 'negativePrompt': 'sunhat'}
      ]
    });
    await openBulk();
    await type(data, duo);
    await tap(find.text(labels[4]));
    check(app.extras.charCaptions.first.prompt != 'silver scarf',
        'preview-not-applied');
    await tap(key('bulk-extra'));
    await type(key('bulk-preset-name'), 'QA Duo');
    await tap(key('bulk-preset-save'));
    await until(
        () => app.settings.positivePromptPresets.any((v) => v.name == 'QA Duo'),
        'saved duo');
    final stored = (await app.storage.getSettings())
        .positivePromptPresets
        .firstWhere((p) => p.name == 'QA Duo');
    check(
        stored.captions.length == 2 &&
            stored.prompt == 'silver scarf\ngreen coat' &&
            stored.captions.last.negativePrompt == 'sunhat',
        'saved-group-roundtrip');
    await tap(find.text(labels[5]).last);
    check(
        app.extras.charCaptions.length == 3 &&
            app.extras.charCaptions.first.negativePrompt == 'keep' &&
            app.extras.charCaptions.first.x == .2 &&
            app.extras.charCaptions.last.prompt == 'tail',
        'default-fill-preserves-tail-and-fields');
    await openBulk();
    await tap(key('bulk-extra'));
    await tap(find.text('QA Duo').first);
    final remove = key('bulk-remove-trailing');
    check(!(t.widget(remove) as CheckboxListTile).value!,
        'removal-not-preapproved');
    await tap(remove);
    await tap(find.text(labels[5]).last);
    check(
        app.extras.charCaptions.length == 2 &&
            app.extras.charCaptions.last.prompt == 'green coat',
        'explicit-trim-applied');
    final save = find.text('保存到正面预设');
    await tap(save);
    await tap(find.textContaining('1 · silver scarf').first);
    final dialog = find.byType(AlertDialog);
    await type(
        find.descendant(of: dialog, matching: find.byType(TextField)).first,
        'QA Single');
    await tap(find.descendant(of: dialog, matching: find.text('保存')));
    await until(
        () => app.settings.positivePromptPresets
            .any((v) => v.name == 'QA Single'),
        'saved single');
    final single = (await app.storage.getSettings())
        .positivePromptPresets
        .firstWhere((v) => v.name == 'QA Single');
    check(single.captions.length == 1 && single.prompt == 'silver scarf',
        'saved-single-roundtrip');
    final b = app.extras.charCaptions.last;
    b.negativePrompt = 'target negative';
    b.x = .8;
    b.y = .1;
    b.useCoords = true;
    app.markCharacterChanged();
    await tick();
    final buttons = find.byType(PositivePromptPresetButton);
    await tap(buttons.last);
    await tap(key('positive-preset-row-${single.id}'));
    await until(() => b.prompt == 'silver scarf', 'single applied');
    check(
        b.negativePrompt == 'target negative' &&
            b.x == .8 &&
            app.params.positivePrompt == 'global',
        'single-applied-only-positive-to-chosen-role');
    await tap(buttons.last);
    await tap(key('positive-preset-row-${stored.id}'));
    await tap(key('positive-preset-apply'));
    await until(() => app.extras.charCaptions.last.prompt == 'green coat',
        'combo applied');
    check(
        app.extras.charCaptions.map((c) => c.name).join(',') == 'Luna,Sol' &&
            app.extras.charCaptions.last.negativePrompt == 'sunhat' &&
            app.params.positivePrompt == 'global',
        'explicit-apply-saved-duo-preserves-order-and-negatives');
    output['passed'] = true;
  } catch (e, s) {
    output['passed'] = false;
    output['error'] = e.toString();
    output['stack'] = s.toString();
  }
  await file.writeAsString(jsonEncode(output), flush: true);
  debugPrint('PROMPT_ROLE_QA ${jsonEncode(output)}');
}

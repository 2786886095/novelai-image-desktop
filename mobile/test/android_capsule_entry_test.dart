import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:novelai_mobile/tags/multilingual_tag_packs.dart';
import 'dart:io';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:novelai_mobile/screens/capsule_picker_sheet.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _OfflinePacks extends MultilingualTagPacks {
  @override
  Future<List<TagPackExactHit>?> lookupExact(Iterable<String> terms,
          {bool translations = false}) async =>
      null;
}

void main() {
  testWidgets(
      'Android inspiration capsule appends only to the active character and remembers picked tags on reopen',
      (t) async {
    // Keep asset delivery synchronous in the fake clock. The separate data
    // test checks the real full taxonomy, as does the emulator smoke test.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMessageHandler('flutter/assets', (message) async {
      final key = utf8.decode(message!.buffer
          .asUint8List(message.offsetInBytes, message.lengthInBytes));
      if (key == 'assets/capsule_taxonomy.json') {
        return ByteData.sublistView(const Utf8Encoder().convert(
            '[{"name":"人物","subgroups":[{"name":"对象","tags":[{"en":"1girl","zh":"一人"}]}]}]'));
      }
      final f = File(key);
      return f.existsSync() ? ByteData.sublistView(f.readAsBytesSync()) : null;
    });
    final old = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    t.view.physicalSize = const Size(412, 3200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    SharedPreferences.setMockInitialValues({});
    final app = AppState(multilingualTags: _OfflinePacks());
    app.settings.language = 'zh-CN';
    app.settings.autoComplete = false;
    app.addCharacter();
    app.addCharacter();
    final a = app.extras.charCaptions.first, b = app.extras.charCaptions.last;
    a.prompt = 'first unchanged';
    a.negativePrompt = 'first negative';
    b.prompt = List.filled(90, 'long description').join(', ');
    b.negativePrompt = 'second negative';
    b.useCoords = true;
    b.x = .25;
    b.y = .75;
    app.params.positivePrompt = 'global unchanged';
    try {
      await t.pumpWidget(ChangeNotifierProvider.value(
          value: app, child: const MaterialApp(home: GenerateScreen())));
      await t.pumpAndSettle();
      final homeCapsule = find.byKey(const ValueKey('android-create-capsule'));
      expect(homeCapsule, findsOneWidget);
      await t.ensureVisible(homeCapsule);
      await t.tap(homeCapsule);
      await t.pumpAndSettle();
      expect(find.byType(CapsulePickerSheet), findsOneWidget);
      await t.tap(find.descendant(
          of: find.byType(CapsulePickerSheet), matching: find.text('完成')));
      await t.pumpAndSettle();
      expect(app.params.positivePrompt, 'global unchanged');
      final field = find.byKey(const ValueKey('character-prompt-field-1'));
      await t.scrollUntilVisible(field, 200,
          scrollable: find.byType(Scrollable).first, maxScrolls: 60);
      await t.ensureVisible(field);
      await t.tap(field);
      await t.pumpAndSettle();
      final editor =
          find.byKey(const ValueKey('android-fullscreen-prompt-text'));
      expect(editor, findsOneWidget);
      final input = t.widget<TextField>(editor);
      expect(input.controller!.text, b.prompt);
      expect(input.maxLines, isNull);
      final before = b.prompt;
      final open = find.byKey(const ValueKey('android-editor-capsule'));
      expect(open, findsOneWidget);
      await t.tap(open);
      await t.pumpAndSettle();
      final chips = find.descendant(
          of: find.byType(CapsulePickerSheet),
          matching: find.byType(ActionChip));
      expect(chips, findsWidgets);
      final key = t.widget<ActionChip>(chips.first).key as ValueKey<String>;
      final tag =
          key.value.substring('capsule-tag:'.length).replaceAll('_', ' ');
      await t.ensureVisible(chips.first);
      await t.tap(chips.first);
      await t.pumpAndSettle();
      final edited = '$before, $tag, ';
      expect(b.prompt, edited);
      await t.tap(find.descendant(
          of: find.byType(CapsulePickerSheet), matching: find.text('完成')));
      await t.pumpAndSettle();
      await t.tap(open);
      await t.pumpAndSettle();
      final hit = find.byKey(key);
      expect(t.widget<ActionChip>(hit).avatar, isNotNull);
      await t.ensureVisible(hit);
      await t.tap(hit);
      await t.pumpAndSettle();
      expect(b.prompt, edited);
      await t.tap(find.descendant(
          of: find.byType(CapsulePickerSheet), matching: find.text('完成')));
      await t.pumpAndSettle();
      await t.tap(find.text('完成'));
      await t.pumpAndSettle();
      expect(a.prompt, 'first unchanged');
      expect(a.negativePrompt, 'first negative');
      expect(b.prompt, edited);
      expect(b.negativePrompt, 'second negative');
      expect(b.x, .25);
      expect(b.y, .75);
      expect(app.params.positivePrompt, 'global unchanged');
      await t.tap(field);
      await t.pumpAndSettle();
      expect(t.widget<TextField>(editor).controller!.text, edited);
      await t.pageBack();
      await t.pumpAndSettle();
    } finally {
      debugDefaultTargetPlatformOverride = old;
    }
  });
}

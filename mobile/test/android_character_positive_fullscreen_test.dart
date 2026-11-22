import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets(
      'Android character positive opens full screen; multiline edits go to the correct character only',
      (t) async {
    final old = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    t.view.physicalSize = const Size(412, 3200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    SharedPreferences.setMockInitialValues({});
    final app = AppState();
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
      final edited = b.prompt + '\nEND';
      await t.enterText(editor, edited);
      await t.pump();
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

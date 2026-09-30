import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/api_catalog.dart';
import 'package:novelai_mobile/agent/api_tools.dart';
import 'package:novelai_mobile/state/app_state.dart';

void main() {
  test('mobile uses the existing NovelAI API instead of a second image model', () {
    final settings = File('lib/screens/settings_screen.dart').readAsStringSync();
    final generate = File('lib/screens/generate_screen.dart').readAsStringSync();
    final state = File('lib/state/app_state.dart').readAsStringSync();
    expect(settings, isNot(contains('const CompatibleImageSettingsCard()')));
    expect(generate, isNot(contains('return CompatibleGenerateScreen(')));
    expect(state, contains("settings.imageProvider = 'novelai';"));
    expect(apiProfiles.containsKey('compatible-image'), isFalse);
  });

  test('Agent does not offer or accept the retired independent image profile', () async {
    final state = AppState();
    addTearDown(state.dispose);
    final tools = AgentApiTools(state);
    expect(tools.profiles, contains('novelai'));
    expect(tools.profiles, isNot(contains('compatible-image')));
    await expectLater(tools.execute('langbai_api',
        {'action': 'read', 'profile': 'compatible-image'}, 'retired'),
        throwsStateError);
  });
}

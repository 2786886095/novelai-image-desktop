import 'dart:convert';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/library_tools.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
      'Android local source preserves 70 entries and excludes private metadata',
      () async {
    SharedPreferences.setMockInitialValues({});
    final storage = Storage();
    final app = AppState(storage: storage);
    addTearDown(app.dispose);
    final workspace = await storage.getAgentWorkspaceStrict();
    final raw = workspace.toJson();
    raw['lorebooks'] = [
      {
        'id': 'book',
        'name': 'rain',
        'apiKey': 'secret',
        'avatarPath': 'private',
        'entries': List.generate(
            70,
            (i) => {
                  'id': 'e$i',
                  'keys': ['rain'],
                  'content': 'world',
                  'position': 'before-character',
                  'insertionOrder': 42
                })
      }
    ];
    // Native parsing/persistence, not a mocked source endpoint.
    await storage.setAgentWorkspace(AgentWorkspace.fromJson(raw));
    final tools = AgentLibraryTools(app);
    final result =
        await tools.materialSource({'collection': 'lorebooks', 'id': 'book'});
    expect((result['item']['entries'] as List).length, 70);
    expect(jsonEncode(result), isNot(contains('secret')));
    expect(jsonEncode(result), isNot(contains('avatarPath')));
    await expectLater(
        tools.materialSource(
            {'collection': 'lorebooks', 'id': 'book', 'path': 'other'}),
        throwsStateError);
  });
}

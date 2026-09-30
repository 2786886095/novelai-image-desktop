import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/i18n/local_agent_text.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/local_agent_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('five locales explain bundled versus user-managed plugin updates', () {
    for (final locale in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
      expect(localAgentText(locale, 'pluginUpdateTitle'), isNotEmpty);
      expect(localAgentText(locale, 'pluginUpdateDetails'), isNotEmpty);
    }
    expect(localAgentText('en-US', 'pluginUpdateDetails'),
        contains('Custom or edited plugins are not overwritten'));
  });

  testWidgets('plugin update guidance is collapsed and never starts a download',
      (tester) async {
    final visible = ValueNotifier(true);
    final app = AppState(storage: Storage())
      ..settings = AppSettings(language: 'zh-CN');
    final calls = <String>[];
    const channel = MethodChannel('langbai.novelai/local_agent');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call.method);
      if (call.method == 'status') {
        return {
          'supported': true,
          'phase': 'not_installed',
          'busy': false,
          'componentCheckedAt': 1,
          'officialCheckedAt': 1,
          'downloadAvailable': false,
          'dataDirectory': 'fixture',
        };
      }
      if (call.method == 'backups') return <String>[];
      return null;
    });
    await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
      value: app,
      child: MaterialApp(home: LocalAgentScreen(visible: visible)),
    ));
    await tester.pump(const Duration(milliseconds: 500));
    final tile = find.byKey(const ValueKey('agent-plugin-update-details'));
    await tester.ensureVisible(tile);
    expect(find.textContaining('自定义或改动过的插件'), findsNothing);
    await tester.tap(tile);
    await tester.pumpAndSettle();
    expect(find.textContaining('自定义或改动过的插件'), findsOneWidget);
    expect(calls, isNot(contains('prepare')));
    expect(calls, isNot(contains('confirm')));
    await tester.pumpWidget(const SizedBox());
    visible.dispose();
    app.dispose();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });
}

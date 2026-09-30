import 'dart:convert';
import 'package:novelai_mobile/prompts/prompt_mode.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/tags/offline_tag_store.dart';

class _Storage extends Storage {
  final config = AppSettings(
    persistGenerateParams: false, lockStylePrompt: true, lockNegativePrompt: true,
    savedStylePrompt: 'obsolete style', savedNegativePrompt: 'obsolete negative',
  );
  @override Future<AppSettings> getSettings() async => config;
  @override Future<void> setSettings(AppSettings value) async {}
  @override Future<String?> getToken() async => null;
  @override Future<List<HistoryItem>> getHistory() async => [];
  @override Future<List<TextToolHistoryItem>> getConvertHistory() async => [];
  @override Future<List<TextToolHistoryItem>> getReverseHistory() async => [];
  @override Future<List<HistoryGroup>> getGroups() async => [];
  @override Future<bool> hasSeenNetworkOnboarding() async => true;
}
class _Tags extends OfflineTagStore {
  @override Future<OfflineTagStatus> status() async => const OfflineTagStatus();
}
class _App extends AppState {
  _App(Storage storage):super(storage:storage,offlineTags:_Tags());
  @override Future<void> checkUpdate({bool manual=false}) async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final empty in [false,true]) {
    test('saved current text beats legacy locks (empty=$empty)',() async {
      final style=empty?'':'current style', negative=empty?'':'current negative';
      SharedPreferences.setMockInitialValues({'gen_params':jsonEncode(GenerateParams(stylePrompt:style,negativePrompt:negative).toJson())});
      final storage=_Storage();final restored=await storage.getParams();
      expect(restored.stylePrompt,style);expect(restored.negativePrompt,negative);
      final second=await storage.getParams();
      expect(second.stylePrompt,style);expect(second.negativePrompt,negative);
    });
  }
  for (final raw in [null,'{}','not json','[]']) {
    test('legacy prompt migration is durable for raw=$raw',() async {
      SharedPreferences.setMockInitialValues({if(raw!=null)'gen_params':raw});
      final storage=_Storage();final restored=await storage.getParams();
      expect(restored.stylePrompt,'obsolete style');expect(restored.negativePrompt,'obsolete negative');
      restored.stylePrompt='';restored.negativePrompt='edited';await storage.setParams(restored);
      final next=await storage.getParams();expect(next.stylePrompt,'');expect(next.negativePrompt,'edited');
    });
  }
  test('real AppState restart retains text with numeric persistence disabled',() async {
    SharedPreferences.setMockInitialValues({'gen_params':jsonEncode(GenerateParams(stylePrompt:'my style',negativePrompt:'',steps:44).toJson())});
    final storage=_Storage(),app=_App(_Storage());addTearDown(app.dispose);
    await app.load();expect(app.booted,true);expect(app.params.stylePrompt,'my style');expect(app.params.negativePrompt,'');
    expect(app.params.steps,GenerateParams().steps);
    app.setParam((p){p.stylePrompt='new style';p.negativePrompt='new negative';});
    // Drain the real asynchronous preferences write, then instantiate a new app.
    for(var i=0;i<20&&(await storage.getParams()).stylePrompt!='new style';i++) {
      await Future<void>.delayed(const Duration(milliseconds:10));
    }
    final reopened=_App(storage);addTearDown(reopened.dispose);await reopened.load();
    expect(reopened.params.stylePrompt,'new style');expect(reopened.params.negativePrompt,'new negative');
  });
}

import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/agent/template_generation.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class Vault extends Storage {
  @override
  Future<String?> getConvertKey() async => 'fixture-no-network';
}
class Api extends NaiApi {
  Completer<void>? gate;
  final entered = Completer<void>();
  bool fail = false;
  String? template;
  @override
  Future<AiTextResult> convertPrompt({required AppSettings settings, required String apiKey,
    required String text, required ReversePromptMode mode, required bool knownCharacter, required String systemTemplate}) async {
    template = systemTemplate;
    if(!entered.isCompleted) entered.complete();
    await gate?.future;
    return AiTextResult(ok:!fail,message:'fixture',text:fail?'':'1girl, rain');
  }
}
class App extends AppState {
  int generations=0;String? submitted;
  App(Api api):super(api:api,storage:Vault());
  @override
  Future<void> generate() async {
    generations++;submitted=params.positivePrompt;
    history.add(HistoryItem(id:'fixture-$generations',filePath:'/fixture/not-a-real-generation.png',
      date:'2026-09-28',createdAt:'fixture',seed:1,model:params.model,width:832,height:1216,prompt:submitted!));
  }
}
void main(){
  TestWidgetsFlutterBinding.ensureInitialized();
  test('validates workflow inputs before consuming authorization',(){
    for(final input in [<String,dynamic>{}, {'text':'scene','generate':{'count':0}},
      {'text':'scene','mode':'wrong'}, {'text':'scene','generate':{'positivePrompt':'bypass'}},
      {'text':'scene','imageAttachmentId':4}]) {
      expect(()=>templateGenerationArgs(input),throwsStateError);
    }
  });
  test('reverse workflow forwards selected template and exact output without another approval',() async {
    final calls=<String>[];
    final result=await runTemplateGeneration({'imageAttachmentId':'ref','text':'hat','mode':'mixed','templateVersion':'v4.5'},(tool,args) async {
      calls.add(tool);
      if(calls.length==1){expect(args['templateVersion'],'v4.5');expect(args['hint'],'hat');return const AgentToolResult(ok:true,title:'reverse',output:'exact template result');}
      expect(args['positivePrompt'],'exact template result');return const AgentToolResult(ok:true,title:'generate',output:'{}');
    },(){});
    expect(result.ok,true);expect(calls,['langbai_reverse_prompt','langbai_generate_image']);
  });
  for(final action in ['success','failure','stop','changed-template']) {
    test('real executor pipeline: $action; saved template, draft restoration and no extra generation',() async {
      SharedPreferences.setMockInitialValues({});final api=Api();
      final actual=App(api);addTearDown(actual.dispose);
      actual.promptTemplates=await PromptTemplateLibrary.load();
      actual.settings.convertPromptTemplates={'mixed':'CUSTOM TEMPLATE {{input}}'};
      await actual.storage.setSettings(actual.settings);
      actual.params.positivePrompt='user draft';actual.convertInput='unsubmitted draft';
      final executor=AgentToolExecutor(app:actual,listMemories:()=>[],upsertMemory:(_) async=>throw UnimplementedError(),deleteMemory:(_) async=>false);
      if(action=='failure') api.fail=true;
      if(action=='stop'||action=='changed-template') api.gate=Completer<void>();
      final task=executor.execute(templateGenerationTool,{'text':'scene','generate':{'count':1}},[],sessionId:'fixture');
      await api.entered.future;
      if(action=='stop') await executor.sessions.execute('studio_stop_generation',{},'fixture');
      if(action=='changed-template') actual.settings.convertPromptTemplates={'mixed':'CHANGED {{input}}'};
      api.gate?.complete();final result=await task;
      expect(result.ok,action=='success',reason:result.output);
      expect(actual.generations,action=='success'?1:0);
      expect(api.template,'CUSTOM TEMPLATE {{input}}');
      expect(actual.params.positivePrompt,'user draft');expect(actual.convertInput,'unsubmitted draft');
      if(result.ok){expect(actual.submitted,'1girl, rain');expect(jsonDecode(result.output)['positivePrompt'],'1girl, rain');expect(result.generatedImages,hasLength(1));}
      // Completion or failure releases the reservation for a subsequent task.
      executor.sessions.begin('next');executor.sessions.end('next');
    });
  }
}

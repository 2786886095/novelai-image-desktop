import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/comic/comic_controller.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
class Vault extends Storage {
 @override Future<String?> getConvertKey()async=>'synthetic';
 @override Future<void> setComicProject(ComicProject value)async{}
 @override Future<void> setComicRun(Map<String,dynamic> value)async{}
}
class WaitingApi extends NaiApi {
 final entered=Completer<void>(),gate=Completer<AiTextResult>();
 AppSettings? captured;String? template;ReversePromptMode? mode;
 @override Future<AiTextResult> convertPrompt({required AppSettings settings,required String apiKey,required String text,required ReversePromptMode mode,required bool knownCharacter,required String systemTemplate}){captured=settings;template=systemTemplate;this.mode=mode;entered.complete();return gate.future;}
}
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();setUp(()=>SharedPreferences.setMockInitialValues({}));
 for(final change in ['success','mode','edition','input','template','failed']){
  test('comic production conversion snapshots all axes and $change preserves intended slot',()async{
   final api=WaitingApi(),app=AppState(api:api,storage:Vault());addTearDown(app.dispose);app.promptTemplates=await PromptTemplateLibrary.load();app.convertMode=ReversePromptMode.tags;
   final c=ComicController(app)..loaded=true;addTearDown(c.dispose);c.project=ComicProject.empty(app.params)..panels=[ComicPanel(id:'p',index:1,title:'P',prompt:'Original scene')];final panel=c.project.panels.single;
   final pending=c.convertPanelPrompt(panel);await api.entered.future;expect(c.convertingPanel('p'),true);expect(api.captured!.convertPromptSkillVersion,'2.0.0');expect(api.captured!.convertPromptTemplateVersion,'v5');expect(api.mode,ReversePromptMode.tags);expect(api.template,app.resolvedPromptTemplate('convert',ReversePromptMode.tags));
   if(change=='mode')app.convertMode=ReversePromptMode.mixed;
   if(change=='edition')app.settings.convertPromptSkillVersion='1.0.0';
   if(change=='input'){panel.prompt='Newer input';c.changed();}
   if(change=='template')app.settings.convertPromptTemplatesV2['tags']='NEW BODY';
   api.gate.complete(AiTextResult(ok:change!='failed',message:'Synthetic controlled test',text:change=='failed'?'':'Converted actual response'));
   if(change=='success'){await pending;expect(c.project.panels.single.prompt,'Converted actual response');}
   else{await expectLater(pending,throwsStateError);expect(c.project.panels.single.prompt,change=='input'?'Newer input':'Original scene');}
   expect(c.convertingPanel('p'),false);expect(app.params.positivePrompt,isNot('Converted actual response'));
  });
 }
 test('empty panel rejects before API and leaves project intact',()async{
  final api=WaitingApi(),app=AppState(api:api,storage:Vault());addTearDown(app.dispose);final c=ComicController(app)..loaded=true;addTearDown(c.dispose);c.project=ComicProject.empty(app.params)..panels=[ComicPanel(id:'p',index:1,title:'P')];await expectLater(c.convertPanelPrompt(c.project.panels.single),throwsStateError);expect(api.entered.isCompleted,false);
 });
}

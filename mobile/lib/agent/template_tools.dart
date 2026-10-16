import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../state/app_state.dart';
import '../models/nai_models.dart';
import '../prompts/prompt_templates.dart';
import '../prompts/prompt_skill_selection.dart';

class AgentTemplateTools {
 static final _writes=Expando<Future<void>>('template settings writes');
 static const tools={'studio_prompt_template','studio_save_prompt_template'};
 final AppState app;
 AgentTemplateTools(this.app);
 Future<Map<String,dynamic>> _selection(AppSettings s,Map<String,dynamic> args) async {
  final kind=args['kind']??'convert';
  if(!['reverse','convert','optimize','assistant'].contains(kind))throw StateError('请选择模板用途');
  final mode=args['mode']??s.agentPromptTemplateMode;
  final model=args['templateVersion']??promptSkillModel(s,kind);
  final edition=args['skillVersion']??(model=='v4.5'?'1.0.0':promptSkillEdition(s,kind));
  if(!['mixed','tags','natural'].contains(mode)||edition is! String||model is! String)throw StateError('模板选择无效');
  checkPromptSkillSelection(edition,model);
  final lib=await PromptTemplateLibrary.load();
  final extra=kind=='optimize'||kind=='assistant';
  final key=extra?promptSkillOverlayKey(kind,edition):'${kind}PromptTemplates${edition=='2.0.0'?'V2':model=='v4.5'?'V45':''}';
  final saved=extra?<String,String>{'body':promptSkillOverlay(s,kind,edition)}:Map<String,String>.from(promptSkillOverrides(s,kind,edition,model));
  final custom=(saved[extra?'body':mode]??'').trim();
  final body=extra?(custom.isNotEmpty?custom:(edition=='2.0.0'?lib.promptEditDefaultsV2:lib.promptEditDefaults)[kind=='optimize'?'optimize':'custom']??''):
    lib.resolve(kind,ReversePromptMode.values.byName(mode),saved,templateVersion:model,skillVersion:edition);
  return {'kind':kind,'mode':mode,'templateVersion':model,'skillVersion':edition,'key':key,'body':body,
    'source':custom.isNotEmpty&&body==custom?'custom':!extra&&edition=='1.0.0'&&(saved['mixed']??'').trim().isNotEmpty?'derived':'builtin',
    'revision':sha256.convert(utf8.encode(jsonEncode([key,mode,model,edition,saved,s.agentPromptTemplateMode,promptSkillEdition(s,kind),promptSkillModel(s,kind)]))).toString()};
 }
 Future<Map<String,dynamic>> execute(String tool,Map<String,dynamic> args) async {
  final previous=_writes[app]??Future<void>.value();final work=previous.then((_)=>_execute(tool,args));
  _writes[app]=work.then<void>((_) {},onError:(Object _,StackTrace __){});return work;
 }
 Future<Map<String,dynamic>> _execute(String tool,Map<String,dynamic> args) async {
  if(!tools.contains(tool))throw StateError('模板操作无效');
  final allowed={'kind','mode','templateVersion','skillVersion',if(tool=='studio_save_prompt_template')...['expectedRevision','body','restoreDefault']};
  if(args.keys.any((k)=>!allowed.contains(k)))throw StateError('未知模板参数');
  final selected=await _selection(await app.storage.getSettings(),args);
  if(tool=='studio_prompt_template')return selected;
  if(args['expectedRevision']!=selected['revision'])throw StateError('软件模板已变化，请重新读取后再保存');
  final body=args['body'];
  if(body!=null&&(body is! String||body.length>60000||(body.trim().isEmpty&&args['restoreDefault']!=true)))throw StateError('模板应为不超过60000字的文本；恢复默认请使用恢复按钮');
  final current=await app.storage.getSettings();
  if((await _selection(current,args))['revision']!=selected['revision'])throw StateError('保存前模板已变化');
  final kind=selected['kind'] as String,mode=selected['mode'] as String,edition=selected['skillVersion'] as String,model=selected['templateVersion'] as String,key=selected['key'] as String;
  final raw=current.toJson();
  if(kind=='optimize'||kind=='assistant'){
   if(body!=null||args['restoreDefault']==true)raw[key]=args['restoreDefault']==true?'':(body as String).trim();
  }else{
   final map=Map<String,dynamic>.from(raw[key]??{});
   if(args['restoreDefault']==true){map.remove(mode);}else if(body!=null){map[mode]=body;}
   raw[key]=map;
  }
  final next=AppSettings.fromJson(raw)..agentPromptTemplateMode=mode;selectPromptSkill(next,kind,edition,model);
  await app.storage.setSettings(next);
  final after=await _selection(await app.storage.getSettings(),args);
  if(after['mode']!=mode||after['skillVersion']!=edition||after['templateVersion']!=model||(body is String&&body.trim().isNotEmpty&&after['body']!=body.trim()))throw StateError('模板保存后回读不符');
  final live=app.settings.toJson()..[key]=next.toJson()[key];
  app.settings=AppSettings.fromJson(live)..agentPromptTemplateMode=mode;
  selectPromptSkill(app.settings,kind,edition,model);app.markChanged();return after;
 }
}

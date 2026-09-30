import {createHash} from 'node:crypto';
import type {AppSettings,SettingKey,ReversePromptMode} from '../../src/types';
import {resolveModePrompt} from '../../src/prompt-mode';
import {CONVERT_SYSTEM_PROMPTS,REVERSE_SYSTEM_PROMPTS} from '../../src/data/prompt-templates';
import {V45_CONVERT_SYSTEM_PROMPTS,V45_REVERSE_SYSTEM_PROMPTS} from '../../src/data/prompt-templates-v45';
import {PROMPT_OPTIMIZE_TEMPLATE,PROMPT_CUSTOM_TEMPLATE} from '../../src/data/prompt-edit-templates';

// The editor and the image tools address the SAME Studio settings, not a plugin copy.
export const TEMPLATE_UI_TOOLS=['studio_prompt_template','studio_save_prompt_template'] as const;
type Args=Record<string,unknown>;
export function templateSelection(settings:AppSettings,args:Args={}) {
  const kind=args.kind??'convert';
  if(!['convert','reverse','optimize','assistant'].includes(String(kind)))throw Error('模板类别需要 convert/reverse/optimize/assistant');
  const mode=args.mode??settings.agentPromptTemplateMode??'mixed';
  if(!['mixed','tags','natural'].includes(String(mode)))throw Error('请选择混合、标签或自然语言模式');
  const version=args.templateVersion??(kind==='convert'?settings.convertPromptTemplateVersion:settings.reversePromptTemplateVersion)??'v5';
  if(version!=='v5'&&version!=='v4.5')throw Error('模板版本需要 v5 或 v4.5');
  if(kind==='optimize'||kind==='assistant') {
    const key=kind==='optimize'?'promptOptimizeTemplate':'promptAssistantTemplate';
    const saved=settings[key],body=saved?.trim()||(kind==='optimize'?PROMPT_OPTIMIZE_TEMPLATE:PROMPT_CUSTOM_TEMPLATE);
    const revision=createHash('sha256').update(JSON.stringify([key,saved??null])).digest('hex');
    return {kind,mode:mode as ReversePromptMode,templateVersion:version,key,body,revision,
      bodySha256:createHash('sha256').update(body).digest('hex'),source:saved?.trim()?'custom':'builtin'};
  }
  const key=(kind==='convert'?'convertPromptTemplates':'reversePromptTemplates')+(version==='v4.5'?'V45':'');
  const saved=settings[key as keyof AppSettings] as Record<string,string>|undefined;
  const defaults=kind==='convert'?(version==='v5'?CONVERT_SYSTEM_PROMPTS:V45_CONVERT_SYSTEM_PROMPTS):(version==='v5'?REVERSE_SYSTEM_PROMPTS:V45_REVERSE_SYSTEM_PROMPTS);
  const body=resolveModePrompt(mode as ReversePromptMode,saved,undefined,defaults);
  const revision=createHash('sha256').update(JSON.stringify([key,saved??null,settings.agentPromptTemplateMode??'mixed',settings.convertPromptTemplateVersion,settings.reversePromptTemplateVersion])).digest('hex');
  const bodySha256=createHash('sha256').update(body).digest('hex');
  return {kind,mode:mode as ReversePromptMode,templateVersion:version,key,body,bodySha256,revision,source:saved?.[String(mode)]?.trim()?'custom':'builtin'};
}
export function createPromptTemplateTools(read:()=>AppSettings,write:(key:SettingKey,value:any)=>unknown,commit?:(patch:Partial<AppSettings>)=>void) {
  return {
    handles:(tool:string)=>(TEMPLATE_UI_TOOLS as readonly string[]).includes(tool),
    execute(request:{tool:string;args:Args}) {
      try {
        if(!(TEMPLATE_UI_TOOLS as readonly string[]).includes(request.tool))throw Error('模板操作无效');
        const allowed=['kind','mode','templateVersion',...(request.tool==='studio_save_prompt_template'?['expectedRevision','body','restoreDefault']:[])];
        if(Object.keys(request.args).some(k=>!allowed.includes(k)))throw Error('未知模板参数');
        const selected=templateSelection(read(),request.args);
        if(request.tool==='studio_save_prompt_template') {
          if(request.args.expectedRevision!==selected.revision)throw Error('软件模板已变化，请重新读取后再保存');
          const editing=selected.kind==='optimize'||selected.kind==='assistant';
          const patch:Partial<AppSettings>=editing?{}:{agentPromptTemplateMode:selected.mode,[selected.kind==='convert'?'convertPromptTemplateVersion':'reversePromptTemplateVersion']:selected.templateVersion};
          if(request.args.body!==undefined) {
            if(typeof request.args.body!=='string'||request.args.body.length>60000)throw Error('模板应为不超过 60000 字的文本');
            if(!request.args.body.trim()&&request.args.restoreDefault!==true)throw Error('模板为空；恢复内置模板请使用恢复默认按钮');
            const key=selected.key as SettingKey;
            Object.assign(patch,{[key]:editing?request.args.body:{...(read()[key] as object),[selected.mode]:request.args.body}});
          }
          if(commit)commit(patch);
          else for(const [key,value] of Object.entries(patch))write(key as SettingKey,value);
        }
        const data=templateSelection(read(),request.args);
        return {ok:true,title:'软件共用提示词模板',output:JSON.stringify(data),data};
      }catch(error){return {ok:false,title:'模板未应用',output:error instanceof Error?error.message:String(error)};}
    }
  };
}

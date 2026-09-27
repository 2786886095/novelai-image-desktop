import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
export const name='studio-tools';
export const inject=['tools','workspaceRegistry'];
const descriptions={
  get_generation_state:'Read current Studio generation parameters, locked style and negative prompt. Call before generating; retain user locks.',
  search_tags:'Search mature image tags. args: query:string, limit?:number.',
  search_artist_styles:'Search artist/style catalog. args: query?:string, scope?:string, limit?:number.',
  search_online_gallery:'Search public gallery. args: source:danbooru|safebooru|gelbooru|quicktag, query:string, page?:number, safeOnly?:boolean.',
  list_prompt_presets:'Read saved styles/positive presets. args: kind:all|positive|style, query?:string, limit?:number.',
  list_reference_presets:'List reusable reference images and attachment IDs. args: query?:string, limit?:number.',
  read_image_metadata:'Read image generation metadata. args: attachmentId:string from Studio history/reference tools.',
  list_history:'List generated images with attachment IDs for redraw, inpaint and metadata. args: limit?:number.',
  generate_image:'Generate via NovelAI, consumes Anlas. For natural-language requests use langbai_prepare_image_prompt with text and optional generate:{count:1}; it reads the software templates live (default mixed). A direct call also uses the software conversion template unless it exactly matches a prompt already prepared in this session. Show each generatedImages.filePath as inline code in the final response so the user can click to reveal the file. Do not reconstruct candidates/evidence for routine image requests. The advanced Jev compiler is opt-in and retains its saved setting. args: positivePrompt:string, model?:string, width?:number, height?:number, steps?:number, cfgScale?:number, count?:number. Preserve locked style and negative prompt; use get_generation_state first. Do not repeat a successful or uncertain paid call just to display the image.',
  redraw_image:'Image-to-image via NovelAI, consumes Anlas. args: attachmentId:string, positivePrompt:string, width?:number, height?:number, strength?:number, noise?:number.',
  inpaint_image:'Masked inpainting, consumes Anlas. args: attachmentId:string, maskAttachmentId:string, positivePrompt:string, width?:number, height?:number, strength?:number.',
  upscale_image:'Upscale an existing Studio attachment, consumes Anlas. args: attachmentId:string, scale:2|4.',
  director:'Post-process image, consumes Anlas. args: attachmentId:string, tool:bg-removal|lineart|sketch|colorize|emotion|declutter, defry?:number, colorizePrompt?:string.',
  reverse_prompt:'Read the current software reverse template and inspect an existing Studio image with vision. Omitted mode uses the user-selected Agent template mode (default mixed); omitted version uses the software setting. args: attachmentId:string, mode:natural|mixed|tags, scope:full|character|object|scene, hint?:string, templateVersion:v5. Never invent unseen details. Do not send normal template output through the advanced candidate compiler.',
  convert_prompt:'Convert using current software conversion templates. Omitted mode uses the user-selected Agent template mode (default mixed); omitted version uses the software setting. args: text:string, mode:mixed|natural|tags, templateVersion:v5. For a natural-language image request prefer langbai_prepare_image_prompt; do not use the advanced candidate compiler unless the user explicitly asks for Jev candidate analysis.',
  save_prompt_preset:'Save a positive prompt preset. args: name:string, prompt:string.',
  apply_prompt:'Apply image parameters to the Studio workbench. args: positivePrompt:string; optional model,width,height.',
  memory_list:'List legacy Studio memories. args: query?:string.',
  memory_upsert:'Save Studio memory. args: title:string, content:string, scope:string.',
  memory_delete:'Delete a Studio memory. args: memoryId:string.',
};
export async function apply(ctx) {
  const modulePath=process.env.STUDIO_DSH_TOOLS;
  const endpoint=process.env.STUDIO_BRIDGE_URL;
  const token=process.env.STUDIO_BRIDGE_TOKEN;
  if(!modulePath || !endpoint || !token)throw new Error('Studio tool bridge is not connected');
  const {defineTool}=await import(pathToFileURL(modulePath).href);
  const templatePrompts=new Map();
  const failedTurns=new Map();
  const sceneText=(text,exec)=>{
    const messages=exec.agent?.session?.deriveMessages?.()??[];
    const history=messages.filter(m=>m.role==='user').slice(-8).map(m=>(m.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('')).filter(Boolean).join('\n').slice(-6000);
    return String(text??'')+(history?'\n\n原始用户消息（时间顺序；明确的新要求覆盖旧要求；只继承仍适用的人物约束，忽略无关话题）：\n'+history:'');
  };
  const rememberTemplate=(session,prompt,template)=>{const key=session+'\0'+prompt;templatePrompts.delete(key);templatePrompts.set(key,template);if(templatePrompts.size>128)templatePrompts.delete(templatePrompts.keys().next().value)};
  const render=(_args,value)=>[{type:'text',text:JSON.stringify(value)},...(value.studioImageAttachments??[]).map(attachment=>({type:'image',attachment,offloaded:true}))];
  async function attachImages(result){
    if(!result.generatedImages?.length)return result;
    const refs=[],warnings=[];
    const attachments=ctx.get?.('attachments');
    for(const item of result.generatedImages){
      try{
        if(!attachments)throw Error('图像附件服务未就绪');
        if(typeof item.filePath!=='string')throw Error('生图结果缺少本机图片路径');
        const info=await fs.stat(item.filePath);
        if(!info.isFile()||info.size>48*1024*1024)throw Error('图片文件无效或超过附件大小');
        refs.push(await attachments.saveImage({data:await fs.readFile(item.filePath),mediaType:item.mime??'image/png',name:item.name}));
      }catch(error){warnings.push('图片已保存，但会话预览未载入：'+error.message+'。不要因此重复收费生图。');}
    }
    return {...result,studioImageAttachments:refs,...(warnings.length?{previewWarnings:warnings}:{})};
  }
  async function callStudio(tool,args,callId,exec){
    const user=exec.agent?.session?.deriveMessages?.().filter(m=>m.role==='user').at(-1);
    const failureKey=user?.id?String(exec.agent.session.id)+'\0'+user.id:null;
    const pipeline=tool==='studio_generate_from_description'||tool==='langbai_convert_prompt'||tool==='langbai_reverse_prompt';
    if(pipeline&&failureKey&&failedTurns.has(failureKey))return failedTurns.get(failureKey);
    const response=await fetch(`${endpoint}/v1/tool`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({tool,args,callId,sessionId:String(exec.agent?.session?.id??'studio')}),signal:exec.signal});
    const result=await response.json();if(!response.ok)throw Error(result.error??`Studio bridge HTTP ${response.status}`);
    if(pipeline&&failureKey&&!result.ok){failedTurns.set(failureKey,{...result,automaticRetryStopped:true});if(failedTurns.size>128)failedTurns.delete(failedTurns.keys().next().value);}
    return result;
  }
  // Reuse existing Studio workspaces across portable/review build directories.
  if(process.env.STUDIO_WORKSPACE&&!ctx.workspaceRegistry.list().some(w=>w.title==='NovelAI Studio'))await ctx.workspaceRegistry.create(process.env.STUDIO_WORKSPACE,'NovelAI Studio');
  for(const [shortName,description] of Object.entries(descriptions)) {
    const tool=`langbai_${shortName}`;
    ctx.tools.register(defineTool({
      name:tool,description,
      parameters:{args:{type:'object',additionalProperties:true,required:true,description:'Tool arguments described above. Use {} for no arguments.'}},
      output:{schema:{type:'json'},render},
      async execute({args},exec) {
        const callId=String(exec.callId ?? '');
        if(!callId)throw new Error('Missing stable Harness call identity');
        const sessionId=String(exec.agent?.session?.id ?? 'studio');
        let selectedTemplate;
        if(shortName==='generate_image'){
          const input=args.positivePrompt;
          if(typeof input!=='string'||!input.trim())throw Error('请提供完整画面描述，先通过软件模板生成提示词');
          const cacheKey=sessionId+'\0'+input;
          if(templatePrompts.has(cacheKey)){
            const saved=templatePrompts.get(cacheKey);
            const fresh=await callStudio('studio_prompt_template',{},callId+'-template-state',exec);
            if(fresh.ok&&saved?.bodySha256&&saved.bodySha256===fresh.data?.bodySha256&&saved.mode===fresh.data?.mode&&saved.version===fresh.data?.templateVersion)selectedTemplate=saved;
          }
          if(!selectedTemplate){
            const {positivePrompt,...generate}=args;
            return attachImages(await callStudio('studio_generate_from_description',{text:sceneText(input,exec),generate},callId+'-workflow',exec));
          }
          exec.signal?.throwIfAborted();
        }
        const response=await fetch(`${endpoint}/v1/tool`,{
          method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
          body:JSON.stringify({tool,args,callId,sessionId}),signal:exec.signal,
        });
        const result=await response.json();
        if(!response.ok)throw new Error(result.error ?? `Studio bridge HTTP ${response.status}`);
        return attachImages(selectedTemplate?{...result,template:selectedTemplate}:result);
      },
    }));
  }
  const peers=createRequire(process.env.DSH_HOME?process.env.DSH_HOME+'/profiles/package.json':modulePath);
  const libraryModule=specifier=>specifier.startsWith('file:')?specifier:pathToFileURL(peers.resolve(specifier)).href;
  const {decidePrompt,HYBRID_INSTRUCTIONS,PROMPT_ARGUMENTS}=await import(libraryModule('@langbai/dsh-studio-library/jev'));
  const {readJevConfig,jevStatus}=await import(libraryModule('@langbai/dsh-studio-library/jev-config'));
  ctx.tools.register(defineTool({name:'langbai_jev_status',description:'ADVANCED OPT-IN: inspect Jev configuration only when the user asks about Jev. Ordinary image requests MUST use langbai_prepare_image_prompt and the software template; this status tool is not an image workflow prerequisite. Returns no key.',parameters:{},output:{schema:{type:'json'},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},execute:()=>jevStatus()}));
  const prepared=new Map();let prepareImagePrompt;
  ctx.tools.register(prepareImagePrompt=defineTool({name:'langbai_prepare_image_prompt',description:'DEFAULT image-prompt workflow. When the user requests an image, use generate:{count:1} IN THIS CALL: the current session policy covers conversion, bounded repair and generation; automatic mode requires no extra confirmation. Do not request standalone conversion first. If a workflow returns failure, report it and stop; never repeatedly request confirmation under new call IDs. Reads the SAME live software templates: text -> conversion template; imageAttachmentId -> reverse template. Defaults to the saved Agent template mode (mixed initially); users may choose tags/natural/mixed and v4.5/v5. Provide the complete user scene request in text, not only the latest short message. Do not invent candidates/evidence. With generate omitted this only prepares a prompt and never generates an image. With generate it forwards to the existing session-policy-controlled paid image tool. Do not repeat successful or uncertain generation. Advanced Jev analysis is a separate opt-in tool; this route does not change its setting.',
   parameters:{args:{type:'object',required:true,additionalProperties:false,properties:{text:{type:'string',description:'Complete user scene description; for an image, optional reverse hint.'},imageAttachmentId:{type:'string',description:'Existing Studio attachment ID when reversing an image.'},mode:{type:'string',enum:['mixed','tags','natural']},templateVersion:{type:'string',enum:['v5','v4.5']},generate:{type:'object',additionalProperties:false,properties:{count:{type:'integer'},width:{type:'integer'},height:{type:'integer'},steps:{type:'integer'},cfgScale:{type:'number'},model:{type:'string'}}}}}},output:{schema:{type:'json'},render},
   async execute({args},exec){
    const id=String(exec.callId??'');if(!id)throw Error('Missing stable call identity');
    const key=String(exec.agent?.session?.id??'studio')+':'+id,fingerprint=JSON.stringify(args);
    if(prepared.has(key)){const entry=prepared.get(key);if(entry.fingerprint!==fingerprint)throw Error('同一调用标识的参数已变化，请使用新调用');return entry.pending;}
    if(prepared.size>=128)throw Error('本次调用记录已满，请重启 Agent 后继续');
    const pending=(async()=>{
     if(exec.signal?.aborted)throw Error('提示词任务已取消；未调用生图');
     const image=args.imageAttachmentId;
     if(image!==undefined&&(typeof image!=='string'||!image.trim()))throw Error('请选择有效参考图');
     if(!image&&(typeof args.text!=='string'||!args.text.trim()||args.text.length>8000))throw Error('请提供完整画面描述');
     if(args.mode!==undefined&&!['mixed','tags','natural'].includes(args.mode))throw Error('提示词模式无效');
     if(args.templateVersion!==undefined&&!['v5','v4.5'].includes(args.templateVersion))throw Error('模板版本无效');
     if(args.generate!==undefined&&(!args.generate||typeof args.generate!=='object'||Array.isArray(args.generate)))throw Error('生成参数需要对象');
     if(args.generate){
       const generated=await attachImages(await callStudio('studio_generate_from_description',{...args,text:sceneText(args.text,exec)},id+'-workflow',exec));
       return {...generated,positivePrompt:generated.data?.positivePrompt,template:generated.data?.template,validation:generated.data?.validation,generation:generated};
     }
     const preparedPrompt=await callStudio(image?'langbai_reverse_prompt':'langbai_convert_prompt',{...(image?{attachmentId:image,hint:args.text??'',scope:'full'}:{text:sceneText(args.text,exec)}),...(args.mode?{mode:args.mode}:{}),...(args.templateVersion?{templateVersion:args.templateVersion}:{})},id+'-template',exec);
     if(!preparedPrompt.ok)return preparedPrompt;
     const positivePrompt=preparedPrompt.data?.result??preparedPrompt.data?.prompt??(preparedPrompt.data==null&&typeof preparedPrompt.output==='string'?preparedPrompt.output:'');
     if(typeof positivePrompt!=='string'||!positivePrompt.trim())throw Error('软件模板未返回有效提示词；未调用生图');
     if(exec.signal?.aborted)throw Error('提示词任务已取消；未调用生图');
     const prompt={ok:true,positivePrompt,template:preparedPrompt.data?.template,instruction:'Use this exact software-template output for generation; do not shorten, recompile through Jev or replace it. Describe reasonable elaborations as elaborations, not explicit user facts.',styleChanged:false,negativeChanged:false};
     rememberTemplate(String(exec.agent?.session?.id??'studio'),positivePrompt,prompt.template);
     if(!args.generate)return prompt;
     const generated=await attachImages(await callStudio('langbai_generate_image',{...args.generate,positivePrompt},id+'-generate',exec));
     return {...prompt,ok:generated.ok,generation:generated,studioImageAttachments:generated.studioImageAttachments??[]};
    })();prepared.set(key,{fingerprint,pending});return pending;
   }
  }));
  const decisions=new Map();
  ctx.tools.register(defineTool({name:'langbai_decide_prompt',description:'ADVANCED OPT-IN Jev candidate analysis only; requires workflow:"advanced-jev" and an explicit user request. Old calls without this flag are routed to the software template, not the candidate compiler. For ordinary requests, use langbai_prepare_image_prompt, which reads the software templates. Do not loop on evidence errors or replace the software templates with this compiler. ',parameters:{args:{...PROMPT_ARGUMENTS,properties:{...PROMPT_ARGUMENTS.properties,workflow:{type:'string',enum:['advanced-jev'],description:'Set only when the user explicitly requests advanced Jev analysis; omitted means the software template workflow.'}}}},output:{schema:{type:'json'},render},
   async execute({args},exec){
    if(args.workflow!=='advanced-jev')return prepareImagePrompt.execute({args:{text:args.description,...(args.generate?{generate:args.generate}:{})}},exec);
    const id=String(exec.callId??'');if(!id)throw Error('Missing stable call identity');const key=String(exec.agent?.session?.id??'studio')+':'+id;
    if(decisions.has(key))return decisions.get(key);
    if(decisions.size>=128)throw Error('Jev 本次运行调用记录已满，请重启 Agent 后继续');
    const pending=(async()=>{let lookupSequence=0;const prompt=await decidePrompt({...args,format:'hybrid'},{config:await readJevConfig(),signal:exec.signal,lookup:async(tag,signal)=>{
     const r=await fetch(endpoint+'/v1/tool',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({tool:'langbai_search_tags',args:{query:tag,limit:100},callId:id+'-tag-'+(++lookupSequence),sessionId:String(exec.agent?.session?.id??'studio')}),signal});
     const data=await r.json();if(!r.ok||!data.ok)throw Error('Studio Tag 词典读取失败');return data.data;
    }});
    if(!args.generate)return prompt;
    // The native bridge still owns confirmation, per-session limits, style locks and idempotence.
    // Stable child call ID means reopening a result cannot submit a second paid job.
    const generated=await attachImages(await callStudio('langbai_generate_image',{...args.generate,positivePrompt:prompt.positivePrompt},id+'-generate',exec));
    return {...prompt,generation:generated,studioImageAttachments:generated.studioImageAttachments??[]};
    })();decisions.set(key,pending);return pending;
   }
  }));
  console.info('[Studio] Image tool plugin registered; general Harness tools remain enabled.');
}

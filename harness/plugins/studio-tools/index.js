import {pathToFileURL} from 'node:url';
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
  generate_image:'Generate via NovelAI, consumes Anlas. For natural-language requests call langbai_jev_status, organize mature content candidates, then langbai_decide_prompt whether Jev is enabled or disabled. The saved user setting determines whether scoring calls are made. Never claim Jev ran when disabled or failed. args: positivePrompt:string, model?:string, width?:number, height?:number, steps?:number, scale?:number, count?:number. Preserve locked style and negative prompt; use get_generation_state first.',
  redraw_image:'Image-to-image via NovelAI, consumes Anlas. args: attachmentId:string, positivePrompt:string, width?:number, height?:number, strength?:number, noise?:number.',
  inpaint_image:'Masked inpainting, consumes Anlas. args: attachmentId:string, maskAttachmentId:string, positivePrompt:string, width?:number, height?:number, strength?:number.',
  upscale_image:'Upscale an existing Studio attachment, consumes Anlas. args: attachmentId:string, scale:2|4.',
  director:'Post-process image, consumes Anlas. args: attachmentId:string, tool:bg-removal|lineart|sketch|colorize|emotion|declutter, defry?:number, colorizePrompt?:string.',
  reverse_prompt:'Inspect an existing Studio image with vision. args: attachmentId:string, mode:natural|mixed|tags, scope:full|character|object|scene, hint?:string, templateVersion:v5. For hybrid Jev reverse prompting use mode:natural, extract only visible observations, then langbai_decide_prompt with mode:image and the same imageAttachmentId. Never invent unseen details.',
  convert_prompt:'Standalone conversion tool. args: text:string, mode:mixed|natural|tags, templateVersion:v5. For the intelligent moderate-completion pipeline prefer langbai_decide_prompt with mode:text; do not replace its hybrid result with tags-only conversion.',
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
  if(process.env.STUDIO_WORKSPACE)await ctx.workspaceRegistry.create(process.env.STUDIO_WORKSPACE,'NovelAI Studio');
  for(const [shortName,description] of Object.entries(descriptions)) {
    const tool=`langbai_${shortName}`;
    ctx.tools.register(defineTool({
      name:tool,description,
      parameters:{args:{type:'object',additionalProperties:true,required:true,description:'Tool arguments described above. Use {} for no arguments.'}},
      output:{schema:{type:'json'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
      async execute({args},exec) {
        const callId=String(exec.callId ?? '');
        if(!callId)throw new Error('Missing stable Harness call identity');
        const sessionId=String(exec.agent?.session?.id ?? 'studio');
        const response=await fetch(`${endpoint}/v1/tool`,{
          method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
          body:JSON.stringify({tool,args,callId,sessionId}),signal:exec.signal,
        });
        const result=await response.json();
        if(!response.ok)throw new Error(result.error ?? `Studio bridge HTTP ${response.status}`);
        return result;
      },
    }));
  }
  const {decidePrompt,HYBRID_INSTRUCTIONS}=await import('@langbai/dsh-studio-library/jev');
  const {readJevConfig,jevStatus}=await import('@langbai/dsh-studio-library/jev-config');
  ctx.tools.register(defineTool({name:'langbai_jev_status',description:'Check whether Jev positive-prompt decisions are configured. Returns no key. For natural-language image requests call this first, then read Studio generation state.',parameters:{},output:{schema:{type:'json'},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},execute:()=>jevStatus()}));
  const decisions=new Map();
  ctx.tools.register(defineTool({name:'langbai_decide_prompt',description:HYBRID_INSTRUCTIONS,parameters:{args:{type:'object',additionalProperties:true,required:true}},output:{schema:{type:'json'},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},
   async execute({args},exec){
    const id=String(exec.callId??'');if(!id)throw Error('Missing stable call identity');const key=String(exec.agent?.session?.id??'studio')+':'+id;
    if(decisions.has(key))return decisions.get(key);
    if(decisions.size>=128)throw Error('Jev 本次运行调用记录已满，请重启 Agent 后继续');
    const pending=(async()=>{let lookupSequence=0;return decidePrompt({...args,format:'hybrid'},{config:await readJevConfig(),signal:exec.signal,lookup:async(tag,signal)=>{
     const r=await fetch(endpoint+'/v1/tool',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({tool:'langbai_search_tags',args:{query:tag,limit:100},callId:id+'-tag-'+(++lookupSequence),sessionId:String(exec.agent?.session?.id??'studio')}),signal});
     const data=await r.json();if(!r.ok||!data.ok)throw Error('Studio Tag 词典读取失败');return data.data;
    }});})();decisions.set(key,pending);return pending;
   }
  }));
  console.info('[Studio] Image tool plugin registered; general Harness tools remain enabled.');
}

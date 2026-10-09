type Schema=Record<string,unknown>;
const text=(maxLength=30_000):Schema=>({type:'string',maxLength});
const requiredText=(maxLength=30_000):Schema=>({...text(maxLength),minLength:1});
const number=(minimum:number,maximum:number):Schema=>({type:'number',minimum,maximum});
const integer=(minimum:number,maximum:number):Schema=>({type:'integer',minimum,maximum});
const choice=(...values:(string|number)[]):Schema=>({enum:values});
const flag:Schema={type:'boolean'};
const id=requiredText(200);
const refs:Schema={type:'array',maxItems:16,items:{type:'object',additionalProperties:true}};
const template={kind:choice('convert','reverse','optimize','assistant'),mode:choice('mixed','tags','natural'),templateVersion:choice('v5','v4.5')};
const generation={positivePrompt:requiredText(20_000),negativePrompt:text(20_000),stylePrompt:text(20_000),count:integer(1,8),model:text(120),
  width:integer(64,4096),height:integer(64,4096),steps:integer(1,50),cfgScale:number(0,20),scale:number(0,20),cfgRescale:number(0,1),
  seed:integer(0,4294967295),seedMode:choice('random','fixed'),sampler:text(100),noiseSchedule:text(100),smea:flag,smeaDyn:flag,variety:flag,
  effort:{...choice('medium','high'),description:'V5 Full/inpainting only. Medium fixes 14 steps/Euler Ancestral, heavy UC, zero CFG Rescale; cannot use custom negative prompts. Never alter count when changing effort.'},qualityToggle:flag,qualityPreset:choice('standard','light','none'),ucPreset:integer(0,3),transparentBackground:flag,
  vibeReferences:refs,preciseReferences:refs,characterPrompts:refs};
/** Schemas are for the fields inside Pi's {args:{...}} envelope. */
export function studioPiToolSchema(name:string):Schema {
  let properties:Record<string,Schema>={},required:string[]=[];
  switch(name) {
    case 'langbai_prepare_generation':properties=generation;required=['positivePrompt'];break;
    case 'langbai_search_web':properties={query:requiredText(800),limit:integer(1,8)};required=['query'];break;
    case 'studio_prompt_template':properties=template;break;
    case 'langbai_templates':properties={...template,action:choice('read','select','save','restore'),expectedRevision:text(128),body:text(60_000)};required=['action'];break;
    case 'langbai_edit_prompt':properties={kind:choice('optimize','custom'),currentPrompt:text(24_000),instruction:text(8_000),mode:template.mode,templateVersion:template.templateVersion};required=['kind','currentPrompt'];break;
    case 'langbai_search_tags':properties={query:requiredText(1000),limit:integer(1,100)};required=['query'];break;
    case 'langbai_search_artist_styles':properties={query:text(1000),limit:integer(1,100)};break;
    case 'langbai_search_online_gallery':properties={source:choice('aitag','artist-ranking','danbooru','safebooru','gelbooru','quicktag','tags-gallery'),query:text(2000),page:integer(1,1000),pageSize:integer(1,100),sort:text(50)};required=['source','query'];break;
    case 'langbai_list_prompt_presets':properties={kind:choice('positive','style','negative','all'),query:text(1000)};break;
    case 'langbai_list_reference_presets':properties={query:text(1000),kind:text(50)};break;
    case 'langbai_read_image_metadata':properties={attachmentId:id};required=['attachmentId'];break;
    case 'langbai_list_history':properties={limit:integer(1,100),date:text(20),groupId:text(100)};break;
    case 'langbai_memory_list':properties={query:text(1000)};break;
    case 'langbai_generate_image':properties={preparationId:id};required=['preparationId'];break;
    case 'langbai_redraw_image':properties={...generation,attachmentId:id,strength:number(0,1),noise:number(0,1)};required=['attachmentId','positivePrompt'];break;
    case 'langbai_inpaint_image':properties={...generation,attachmentId:id,maskAttachmentId:id,strength:number(0,1),noise:number(0,1)};required=['attachmentId','maskAttachmentId','positivePrompt'];break;
    case 'langbai_upscale_image':properties={attachmentId:id,scale:choice(2,4)};required=['attachmentId','scale'];break;
    case 'langbai_director':properties={attachmentId:id,tool:text(100),prompt:text(20_000),emotion:text(50),emotionLevel:number(0,1),defry:integer(0,5)};required=['attachmentId','tool'];break;
    case 'langbai_reverse_prompt':properties={attachmentId:id,scope:choice('full','character','object','scene'),hint:text(1000),knownCharacter:flag,mode:template.mode,templateVersion:template.templateVersion};required=['attachmentId'];break;
    case 'langbai_convert_prompt':properties={text:requiredText(24_000),knownCharacter:flag,mode:template.mode,templateVersion:template.templateVersion};required=['text'];break;
    case 'langbai_save_prompt_preset':properties={name:requiredText(100),prompt:requiredText()};required=['name','prompt'];break;
    case 'langbai_apply_prompt':properties={positivePrompt:text(),negativePrompt:text(),stylePrompt:text(),append:flag};required=['positivePrompt'];break;
    case 'langbai_memory_upsert':properties={memoryId:text(200),title:requiredText(200),content:requiredText(),scope:choice('global','conversation'),tags:{type:'array',items:text(100),maxItems:20}};required=['title','content'];break;
    case 'langbai_memory_delete':properties={memoryId:id};required=['memoryId'];break;
    case 'langbai_software_capabilities':case 'langbai_get_generation_state':break;
    default:throw Error('未声明的软件工具 schema：'+name);
  }
  return {type:'object',properties,required,additionalProperties:false};
}

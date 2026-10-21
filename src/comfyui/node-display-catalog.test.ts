import {describe,expect,it,vi} from 'vitest';
import {COMFY_NODE_DISPLAY_CATALOG,COMFY_NODE_DISPLAY_SOURCES} from './node-display-catalog';
import rows from './node-display-locales.json';
import {COMFY_DISPLAY_LABEL_KEYS,NODE_DISPLAY_LANGUAGES,comfyDisplayAdvancedLabel,comfyDisplayNodeTitle,comfyNodeDisplayText} from './display-labels';
import type {ComfySlot} from './contract';

const dictionary=rows as Record<string,string[]>;
const generatedSlot=(classType:string,input:string):ComfySlot=>({id:`parameter:71:${input}`,kind:'parameter',nodeId:'71',classType,input,label:`${classType} · ${input}`,valueType:'combo',defaultValue:'default',options:['default','auto','simple',false,0,'0','checkpoint.safetensors']});
describe('verified node-display catalog integrity',()=>{
  it('has unique registered ids, shared schema mappings and pinned primary-source provenance',()=>{
    expect(COMFY_NODE_DISPLAY_CATALOG).toHaveLength(116);expect(new Set(COMFY_NODE_DISPLAY_CATALOG.map(x=>x.classType)).size).toBe(116);
    for(const entry of COMFY_NODE_DISPLAY_CATALOG){expect(entry.classType).toBeTruthy();expect(entry.titleKey).toBeTruthy();expect(COMFY_NODE_DISPLAY_SOURCES[entry.source]).toMatch(/^https:\/\/raw\.githubusercontent\.com\/(Comfy-Org\/ComfyUI|city96\/ComfyUI-GGUF|kijai\/ComfyUI-KJNodes|cubiq\/ComfyUI_IPAdapter_plus|ltdrdata\/ComfyUI-Impact-Pack|ssitu\/ComfyUI_UltimateSDUpscale)\/[a-f0-9]{40}\//);expect(new Set(entry.aliases).size).toBe(entry.aliases.length);}
    expect(COMFY_NODE_DISPLAY_CATALOG.reduce((sum,x)=>sum+Object.keys(x.inputs).length,0)).toBeGreaterThanOrEqual(430);
  });
  it('covers verified common image-generation families without inventing family-specific node ids',()=>{
    const ids=COMFY_NODE_DISPLAY_CATALOG.map(x=>x.classType);
    for(const id of ['CheckpointLoaderSimple','DualCLIPLoader','CLIPTextEncodeSDXL','CLIPTextEncodeSD3','CLIPTextEncodeFlux','EmptyFlux2LatentImage','TextEncodeQwenImageEdit','TextEncodeZImageOmni','EmptyChromaRadianceLatentImage','CLIPTextEncodeHiDream','CLIPTextEncodeHunyuanDiT','CLIPTextEncodeLumina2','CLIPTextEncodePixArtAlpha','ModelSamplingAuraFlow','AnimaLLLiteApply','MOSSImageLayoutPrompt','MossImagePromptWeight','Krea2PromptWeight','UnetLoaderGGUFAdvanced','GGUFLoaderKJ'])expect(ids).toContain(id);
    expect(ids).not.toContain('AnimaLoader');expect(ids).not.toContain('NovelAILoader');
  });
  it('every display key has five nonempty rows, identical placeholders and zh-CN fallback',()=>{
    expect(NODE_DISPLAY_LANGUAGES).toEqual(['zh-CN','zh-TW','en-US','ja-JP','ko-KR']);
    const tokens=(text:string)=>(text.match(/\{[^{}]+\}/g)??[]).sort();
    for(const key of COMFY_DISPLAY_LABEL_KEYS){const row=dictionary[key];expect(row,key).toHaveLength(5);expect(row[0],key).toBe(key);for(const [i,value] of row.entries()){expect(value.trim(),`${key}:${i}`).toBeTruthy();expect(tokens(value),`${key}:${i}`).toEqual(tokens(key));expect(comfyNodeDisplayText(NODE_DISPLAY_LANGUAGES[i],key)).toBe(value);}expect(comfyNodeDisplayText('unknown',key)).toBe(row[0]);}
  });
  it('unknown messages, prototype names and raw protocol tokens pass through or use the supplied fallback only',()=>{
    for(const raw of ['UnknownCustomNode','constructor','__proto__','default','simple','euler','float16','anima.safetensors'])expect(comfyNodeDisplayText('ja-JP',raw)).toBe(raw);
    const fallback=vi.fn((x:string)=>`fallback:${x}`);expect(comfyNodeDisplayText('en-US','unknown label',fallback)).toBe('fallback:unknown label');expect(fallback).toHaveBeenCalledExactlyOnceWith('unknown label');
  });
  it('does not leak Chinese display strings into the English or Korean catalog',()=>{
    for(const [key,row] of Object.entries(dictionary)){expect(row[2],`${key}:en-US`).not.toMatch(/[\u3400-\u9fff]/);expect(row[4],`${key}:ko-KR`).not.toMatch(/[\u3400-\u9fff]/);}
  });
  it('uses real registered adapter/detailer/upscale ids rather than internal implementation class names',()=>{
    const ids=COMFY_NODE_DISPLAY_CATALOG.map(x=>x.classType);for(const id of ['IPAdapter','IPAdapterAdvanced','IPAdapterStyleComposition','FaceDetailer','FaceDetailerPipe','ToBasicPipe','ToDetailerPipe','UltimateSDUpscale','UltimateSDUpscaleNoUpscale'])expect(ids).toContain(id);expect(ids).not.toContain('IPAdapterSimple');
  });
});

describe.each(NODE_DISPLAY_LANGUAGES)('node display in %s',language=>{
  it('translates every known raw class and verified default display alias, while preserving arbitrary custom titles',()=>{
    for(const entry of COMFY_NODE_DISPLAY_CATALOG){
      const expected=comfyNodeDisplayText(language,entry.titleKey),ft=vi.fn((x:string)=>x);
      expect(comfyDisplayNodeTitle({classType:entry.classType},ft,language),entry.classType).toBe(expected);
      for(const alias of entry.aliases){const knownOverride=entry.classType==='CLIPLoader'&&alias==='Text encoder (match model family)'?'文本编码器（匹配模型家族）':entry.classType==='CLIPTextEncode'&&alias==='Positive prompt'?'正面提示词':entry.classType==='CLIPTextEncode'&&alias==='Negative prompt'?'负面提示词':entry.classType==='ConditioningZeroOut'&&alias==='Zeroed negative (Krea 2)'?'清零负面条件（Krea 2）':entry.titleKey;expect(comfyDisplayNodeTitle({classType:entry.classType,nodeTitle:alias},ft,language),`${entry.classType}:${alias}`).toBe(comfyNodeDisplayText(language,knownOverride));}
      for(const nodeTitle of ['My title / 自定义',' '+entry.classType+' ',entry.classType.toLowerCase()]){if(nodeTitle===entry.classType)continue;expect(comfyDisplayNodeTitle({classType:entry.classType,nodeTitle},ft,language)).toBe(nodeTitle);}
      expect(ft).not.toHaveBeenCalled();
    }
  });
  it('translates all class/input pairs without changing ids, values, options, filenames or unknown scalar types',()=>{
    for(const entry of COMFY_NODE_DISPLAY_CATALOG)for(const [input,key] of Object.entries(entry.inputs)){
      const item=generatedSlot(entry.classType,input),before=JSON.stringify(item);Object.freeze(item.options);Object.freeze(item);
      expect(comfyDisplayAdvancedLabel(item,x=>x,language),`${entry.classType}.${input}`).toBe(comfyNodeDisplayText(language,key));expect(JSON.stringify(item)).toBe(before);
    }
  });
  it('does not relabel explicit hints or unrelated custom classes that happen to reuse a core display name',()=>{
    const item=generatedSlot('UNETLoader','weight_dtype');for(const label of ['weight_dtype','My precision label','My title · custom'])expect(comfyDisplayAdvancedLabel({...item,label},x=>x,language)).toBe(label);
    expect(comfyDisplayNodeTitle({classType:'MyPrivateNode',nodeTitle:'Load CLIP (Triple)'},x=>x,language)).toBe('Load CLIP (Triple)');
    expect(comfyDisplayAdvancedLabel(generatedSlot('MyPrivateNode','patch_dtype'),x=>x,language)).toBe('patch_dtype');
  });
});

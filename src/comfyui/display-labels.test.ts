import {describe,expect,it,vi} from 'vitest';
import type {ComfySlot} from './contract';
import {COMFY_DISPLAY_LABEL_KEYS,comfyDisplayAdvancedLabel,comfyDisplayNodeTitle} from './display-labels';

const text=(key:string)=>`translated:${key}`;
function slot(extra:Partial<ComfySlot>={}):ComfySlot {
  const item:ComfySlot={id:'model-option:1:weight_dtype',kind:'model-option',nodeId:'1',classType:'UNETLoader',nodeTitle:'Diffusion model',input:'weight_dtype',label:'Diffusion model · weight_dtype',valueType:'combo',defaultValue:'default',options:['default','fp8_e4m3fn'],...extra};
  return item;
}

describe('ComfyUI presentation-only node titles',()=>{
  it.each([
    ['UNETLoader','Diffusion model','扩散模型'],
    ['CLIPLoader','Text encoder (match model family)','文本编码器（匹配模型家族）'],
    ['CLIPLoader','Text encoder','文本编码器'],
    ['VAELoader','VAE','VAE 加载器'],
    ['CLIPTextEncode','Positive prompt','正面提示词'],
    ['CLIPTextEncode','Negative prompt','负面提示词'],
    ['ConditioningZeroOut','Zeroed negative (Krea 2)','清零负面条件（Krea 2）'],
  ])('translates the exact declared %s preset alias %s',(classType,nodeTitle,key)=>expect(comfyDisplayNodeTitle({classType,nodeTitle},text)).toBe(text(key)));
  it.each([
    ['KSampler','采样器'],['KSamplerAdvanced','高级采样器'],['VAEDecode','VAE 解码'],
    ['SaveImage','保存图像'],['EmptyLatentImage','空潜空间图像'],['EmptySD3LatentImage','空潜空间图像（SD3）'],
  ])('translates a missing title falling back to known class %s',(classType,key)=>expect(comfyDisplayNodeTitle({classType},text)).toBe(text(key)));
  it('does not translate a known English title on an unrelated custom class',()=>{
    const ft=vi.fn(text);expect(comfyDisplayNodeTitle({classType:'MyCustomLoader',nodeTitle:'Diffusion model'},ft)).toBe('Diffusion model');expect(ft).not.toHaveBeenCalled();
  });
  it.each(['My sampler','采样器A',' KSampler ','ksampler'])('preserves custom core-node title %s byte-for-byte',nodeTitle=>{
    const ft=vi.fn(text);expect(comfyDisplayNodeTitle({classType:'KSampler',nodeTitle},ft)).toBe(nodeTitle);expect(ft).not.toHaveBeenCalled();
  });
  it('does not accidentally treat Object prototype names as translation keys',()=>{
    const ft=vi.fn(text);expect(comfyDisplayNodeTitle({classType:'constructor',nodeTitle:'toString'},ft)).toBe('toString');expect(ft).not.toHaveBeenCalled();
  });
  it('keeps the caller node descriptor unchanged',()=>{
    const node=Object.freeze({classType:'CLIPLoader',nodeTitle:'Text encoder (match model family)'});comfyDisplayNodeTitle(node,text);expect(node).toEqual({classType:'CLIPLoader',nodeTitle:'Text encoder (match model family)'});
  });
});

describe('ComfyUI generated advanced field labels',()=>{
  it('uses the independent catalog for an explicit UI language, not a Chinese-only fallback callback',()=>{
    const fallback=vi.fn((key:string)=>key);
    expect(comfyDisplayNodeTitle({classType:'DualCLIPLoader'},fallback,'en-US')).toBe('Dual text encoder loader');
    expect(comfyDisplayAdvancedLabel(slot({classType:'UnetLoaderGGUFAdvanced',nodeTitle:undefined,input:'patch_dtype',label:'UnetLoaderGGUFAdvanced · patch_dtype'}),fallback,'ja-JP')).toBe('パッチのデータ型');
    expect(fallback).not.toHaveBeenCalled();
  });
  it('uses zh-CN for an explicitly unknown UI language while preserving an explicit user hint',()=>{
    expect(comfyDisplayNodeTitle({classType:'DualCLIPLoader'},text,'not-a-locale')).toBe('双文本编码器加载器');
    expect(comfyDisplayAdvancedLabel(slot({label:'My datatype / 自定义'}),text,'en-US')).toBe('My datatype / 自定义');
  });
  it.each([
    ['weight_dtype','权重数据类型'],['device','运行设备'],['type','类型'],
    ['scheduler','调度器'],['denoise','重绘强度'],['strength_model','模型强度'],['strength_clip','文本编码器强度'],
  ])('translates a default %s label without changing protocol values',(input,key)=>{
    const item=slot({input,label:`Diffusion model · ${input}`});expect(comfyDisplayAdvancedLabel(item,text)).toBe(text(key));
  });
  it('does not let default scheduler labels bypass the existing kind translation',()=>expect(comfyDisplayAdvancedLabel(slot({kind:'scheduler',classType:'KSampler',nodeTitle:undefined,input:'scheduler',label:'KSampler · scheduler'}),text)).toBe(text('调度器')));
  it('uses existing denoise presentation wording',()=>expect(comfyDisplayAdvancedLabel(slot({kind:'denoise',classType:'KSampler',nodeTitle:undefined,input:'denoise',label:'KSampler · denoise'}),text)).toBe(text('重绘强度')));
  it.each([
    ['diffusion','主模型'],['checkpoint','主模型'],['text-encoder','文本编码器'],['vae','VAE 文件'],
  ] as const)('translates only the known model role %s',(role,key)=>expect(comfyDisplayAdvancedLabel(slot({kind:'model',role}),text)).toBe(text(key)));
  it('uses a neutral type label for custom-node type inputs, not an invented model family',()=>expect(comfyDisplayAdvancedLabel(slot({kind:'parameter',classType:'CustomTransform',nodeTitle:'Custom transform',input:'type',label:'Custom transform · type'}),text)).toBe(text('类型')));
  it('keeps an unknown generated input token for schema lookup',()=>{
    const ft=vi.fn(text);expect(comfyDisplayAdvancedLabel(slot({input:'my_shift_override',label:'Diffusion model · my_shift_override'}),ft)).toBe('my_shift_override');expect(ft).not.toHaveBeenCalled();
  });
  it.each(['User hint label','scheduler','强度（我的别名）','Long custom label / 自定义标签'])('preserves an explicit label %s even for a known semantic kind',label=>{
    const ft=vi.fn(text);expect(comfyDisplayAdvancedLabel(slot({kind:'scheduler',label}),ft)).toBe(label);expect(ft).not.toHaveBeenCalled();
  });
  it('does not treat a class-type label as generated when a different custom title is present',()=>{
    const item=slot({nodeTitle:'My custom title',label:'UNETLoader · weight_dtype'});expect(comfyDisplayAdvancedLabel(item,text)).toBe(item.label);
  });
  it('leaves ids, raw class/input mapping, defaults, typed options and source unchanged',()=>{
    const item=slot({options:[false,0,'0','default','simple','fp8_e4m3fn'],linkedFrom:{nodeId:'upstream',classType:'MyCustomNode'}}),before=JSON.stringify(item);
    Object.freeze(item.options);Object.freeze(item.linkedFrom);Object.freeze(item);
    expect(comfyDisplayAdvancedLabel(item,text)).toBe(text('权重数据类型'));
    expect(JSON.stringify(item)).toBe(before);
  });
  it('exposes a unique list of Chinese catalog keys for the root five-language integration',()=>{
    expect(new Set(COMFY_DISPLAY_LABEL_KEYS).size).toBe(COMFY_DISPLAY_LABEL_KEYS.length);
    for(const key of ['扩散模型','文本编码器（匹配模型家族）','权重数据类型','运行设备','类型','调度器','重绘强度'])expect(COMFY_DISPLAY_LABEL_KEYS).toContain(key);
  });
});

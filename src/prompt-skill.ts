import catalog from '../shared/prompt-skill-catalog.json';
import catalogV3 from '../shared/prompt-skill-catalog-v3.json';
import comicCatalog from '../shared/comic-template-catalog.json';
import type {ModePromptTemplates, PromptSkillVersion, ReversePromptMode, ReversePromptTemplateVersion} from './types';

/** Template edition and target image model are independent axes. */
export const PROMPT_SKILL_VERSIONS = ['1.0.0', '2.0.0', '3.0.0'] as const;
export const PROMPT_SKILL_CATALOG_V2 = catalog;
export const PROMPT_SKILL_CATALOG_V3 = catalogV3;
export type PromptSkillTask = 'reverse' | 'convert';

export function normalizePromptSkillVersion(value: unknown, fallback: PromptSkillVersion = '1.0.0'): PromptSkillVersion {
  return value === '1.0.0' || value === '2.0.0' || value === '3.0.0' ? value : fallback;
}

export function defaultPromptSkillVersion(targetModel: ReversePromptTemplateVersion): PromptSkillVersion {
  return targetModel === 'v4.5' ? '1.0.0' : '2.0.0';
}

export function supportsPromptSkillModel(edition: unknown, targetModel: unknown): boolean {
  if (targetModel !== 'v5' && targetModel !== 'v4.5') return false;
  if (edition === '2.0.0' || edition === '3.0.0') return targetModel === 'v5';
  return edition === '1.0.0';
}

/** v1 is resolved by the unchanged legacy resolver, including its custom data.
 * v2 selects exactly ONE supplied independent body; it never derives pure modes
 * from mixed, concatenates the other five skills, or edits the source document. */
export function selectPromptSkillTemplate(options: {
  edition?: unknown;
  targetModel: ReversePromptTemplateVersion;
  task: PromptSkillTask;
  mode: ReversePromptMode;
  legacyTemplate: string;
  overrides?: Partial<ModePromptTemplates>;
  librarySlot?: {body:string};
  library?: {body:string};
}): string {
  const edition = normalizePromptSkillVersion(options.edition);
  if (!supportsPromptSkillModel(edition, options.targetModel)) {
    throw new Error('技能模板 2.0.0 / 3.0.0 仅提供 NovelAI V5 Full 原稿；V4.5 请使用 1.0.0，不能把 V5 专属规则直接套用。');
  }
  if (edition === '1.0.0') return options.legacyTemplate;
  if (edition === '3.0.0') {
    const custom=options.librarySlot??options.library;
    if(custom){if(typeof custom.body!=='string'||!custom.body.trim())throw Error('自定义模板正文无效，未回退内置');return custom.body;}
    const entry=catalogV3.templates.find(item=>item.task===options.task&&item.mode===options.mode);
    if(!entry)throw Error('所选3.0.0模板不存在');
    return entry.body;
  }
  const custom = options.overrides?.[options.mode];
  if (typeof custom === 'string' && custom.trim()) return custom;
  const entry = catalog.templates.find(item => item.task === options.task && item.mode === options.mode);
  if (!entry) throw new Error('所选默认技能模板不存在');
  return entry.body;
}

/** A replacement callback keeps $&, $1 and similar user text literal. */
export function renderPromptSkillTemplate(template: string, input: string, imageAttached = false): string {
  return template.replace(/\{\{input\}\}/g, () => input)
    .replace(/\{\{image\}\}/g, () => imageAttached ? '<actual attached image>' : '<no image attached>');
}

/** Comic source editions stay 4.1/1.0; they are not image skill 3.0.0. */
export function selectComicTemplate(format:'jp-page'|'single-panel',librarySlot?:{body:string;name?:string;sha256?:string;revision?:string}) {
 const item=comicCatalog.templates.find(row=>row.comicFormat===format);
 if(!item)throw Error('漫画模板不存在');
 return {...item,body:librarySlot?.body??item.body,name:librarySlot?.name??item.title,sha256:librarySlot?.sha256??item.sha256,revision:librarySlot?.revision??item.sha256};
}
/** V3 has no v2 fixed density audit. Preserve the supplied template's own rules. */
export function parsePromptSkillV3Response(raw:string,knownCharacter=false) {
 const input=raw.trim(),fence=/^```(?:json|text|txt)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(input);
 if(input.startsWith('```')&&!fence)throw Error('提示词代码围栏未完整闭合');
 const text=fence?fence[1].trim():input;
 const validate=(value:unknown)=>{if(typeof value!=='string'||!value.trim())throw Error('提示词为空');if(/^(?:信息不足|模式能力不足|无法完成|我无法|抱歉)/.test(value.trim()))throw Error(value.trim());const body=value.split(/\r?\n/).filter(line=>!/^\s*#/.test(line)).join('\n').trim();if(!body)throw Error('结果只有元信息，没有提示词');return body;};
 if(!knownCharacter)return {prompt:validate(text),variants:undefined,warnings:[] as string[]};
 const value=JSON.parse(text);const namePrompt=validate(value.namePrompt),featurePrompt=validate(value.featurePrompt);
 return {prompt:namePrompt,variants:{namePrompt,featurePrompt},warnings:[] as string[]};
}
export const PROMPT_SKILL_V3_RUNTIME='本次为普通转换/视觉模型调用，不提供模板中提到的MCP或任何生图工具；不得声称已检索、核验工具或出图。只按照所选原稿与实际输入生成提示词，不推断收费/能力。信息不足时明确说明，不用固定单元数量杜撰。';

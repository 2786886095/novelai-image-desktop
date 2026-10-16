import catalog from '../shared/prompt-skill-catalog.json';
import type {ModePromptTemplates, PromptSkillVersion, ReversePromptMode, ReversePromptTemplateVersion} from './types';

/** Template edition and target image model are independent axes. */
export const PROMPT_SKILL_VERSIONS = ['1.0.0', '2.0.0'] as const;
export const PROMPT_SKILL_CATALOG_V2 = catalog;
export type PromptSkillTask = 'reverse' | 'convert';

export function normalizePromptSkillVersion(value: unknown, fallback: PromptSkillVersion = '1.0.0'): PromptSkillVersion {
  return value === '1.0.0' || value === '2.0.0' ? value : fallback;
}

export function defaultPromptSkillVersion(targetModel: ReversePromptTemplateVersion): PromptSkillVersion {
  return targetModel === 'v4.5' ? '1.0.0' : '2.0.0';
}

export function supportsPromptSkillModel(edition: unknown, targetModel: unknown): boolean {
  if (targetModel !== 'v5' && targetModel !== 'v4.5') return false;
  if (edition === '2.0.0') return targetModel === 'v5';
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
}): string {
  const edition = normalizePromptSkillVersion(options.edition);
  if (!supportsPromptSkillModel(edition, options.targetModel)) {
    throw new Error('技能模板 2.0.0 仅提供 NovelAI V5 Full 原稿；V4.5 请使用 1.0.0，不能把 V5 专属规则直接套用。');
  }
  if (edition === '1.0.0') return options.legacyTemplate;
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

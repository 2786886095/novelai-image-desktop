import type {CharCaption, CharCaptionItem} from './types';

export interface CharacterPromptPreset {
  id: string;
  name: string;
  captions: CharCaptionItem[];
  createdAt: string;
}

/** Keep text and zero-valued coordinates exactly; repair only invalid storage data. */
export function normalizeCharacterCaptions(value: unknown): CharCaption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const coordinate = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
  return value.filter(v => v && typeof v === 'object').slice(0, 32).map(v => {
    const id = typeof v.id === 'string' && v.id && !seen.has(v.id) ? v.id : crypto.randomUUID();
    seen.add(id);
    return {id, ...(typeof v.name==='string' && v.name.trim() ? {name:v.name.trim().slice(0,64)} : {}), ...(typeof v.enabled === 'boolean' ? {enabled: v.enabled} : {}), prompt: typeof v.prompt === 'string' ? v.prompt : '',
      negativePrompt: typeof v.negativePrompt === 'string' ? v.negativePrompt : '',
      useCoords: v.useCoords === true, x: coordinate(v.x), y: coordinate(v.y)};
  });
}

export function characterPresetText(language: unknown) {
  const labels = {
    'zh-CN': ['角色预设', '保存当前角色', '应用', '重命名', '删除', '名称', '保存', '取消', '已保存', '预设角色数量超过当前模型上限，请先切换模型。'],
  };
  const [title, create, apply, rename, remove, name, save, cancel, saved, capacity] = labels[String(language) as keyof typeof labels] ?? labels['zh-CN'];
  return {title, create, apply, rename, remove, name, save, cancel, saved, capacity};
}

export function normalizeCharacterPresets(value: unknown): CharacterPromptPreset[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap(p => {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.name !== 'string' || !Array.isArray(p.captions)) return [];
    ids.add(p.id);
    return [{id: p.id, name: p.name, createdAt: typeof p.createdAt === 'string' ? p.createdAt : '', captions: normalizeCharacterCaptions(p.captions).map(({id: _, ...caption}) => caption)}];
  });
}

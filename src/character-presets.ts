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
    return {id, prompt: typeof v.prompt === 'string' ? v.prompt : '',
      negativePrompt: typeof v.negativePrompt === 'string' ? v.negativePrompt : '',
      useCoords: v.useCoords === true, x: coordinate(v.x), y: coordinate(v.y)};
  });
}

export function characterPresetText(language: unknown) {
  const labels = {
    'zh-CN': ['角色预设', '保存当前角色', '应用', '重命名', '删除', '名称', '保存', '取消', '已保存', '预设角色数量超过当前模型上限，请先切换模型。'],
    'zh-TW': ['角色預設', '儲存目前角色', '套用', '重新命名', '刪除', '名稱', '儲存', '取消', '已儲存', '預設角色數量超過目前模型上限，請先切換模型。'],
    'en-US': ['Character presets', 'Save current characters', 'Apply', 'Rename', 'Delete', 'Name', 'Save', 'Cancel', 'Saved', 'Too many characters for this model. Switch models first.'],
    'ja-JP': ['キャラクタープリセット', '現在のキャラクターを保存', '適用', '名前を変更', '削除', '名前', '保存', 'キャンセル', '保存しました', '現在のモデルの人数上限を超えています。モデルを変更してください。'],
    'ko-KR': ['캐릭터 프리셋', '현재 캐릭터 저장', '적용', '이름 변경', '삭제', '이름', '저장', '취소', '저장됨', '현재 모델의 캐릭터 수 제한을 초과합니다. 모델을 변경하세요.'],
  };
  const [title, create, apply, rename, remove, name, save, cancel, saved, capacity] = labels[String(language) as keyof typeof labels] ?? labels['en-US'];
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

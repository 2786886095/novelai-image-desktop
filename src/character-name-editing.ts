/** Names are display metadata. Drafts never update a character until explicit save. */
export const CHARACTER_NAME_EDIT_MODE = 'explicit-editor' as const;
export function normalizeCharacterNameDraft(value: string): string | undefined {
  return value.trim().slice(0, 64) || undefined;
}
export function characterNameEditText(language: unknown) {
  const labels: Record<string, string[]> = {
    'zh-CN': ['编辑角色名称', '角色名称', '保存', '取消'],
    'zh-TW': ['編輯角色名稱', '角色名稱', '儲存', '取消'],
    'en-US': ['Edit character name', 'Character name', 'Save', 'Cancel'],
    'ja-JP': ['キャラクター名を編集', 'キャラクター名', '保存', 'キャンセル'],
    'ko-KR': ['캐릭터 이름 편집', '캐릭터 이름', '저장', '취소'],
  };
  const [edit, name, save, cancel] = labels[String(language)] ?? labels['en-US'];
  return {edit, name, save, cancel};
}

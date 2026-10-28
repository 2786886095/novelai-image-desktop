/** Names are display metadata. Drafts never update a character until explicit save. */
export const CHARACTER_NAME_EDIT_MODE = 'explicit-editor' as const;
export function normalizeCharacterNameDraft(value: string): string | undefined {
  return value.trim().slice(0, 64) || undefined;
}
export function characterNameEditText(language: unknown) {
  const labels: Record<string, string[]> = {
    'zh-CN': ['编辑角色名称', '角色名称', '保存', '取消'],
  };
  const [edit, name, save, cancel] = labels[String(language)] ?? labels['zh-CN'];
  return {edit, name, save, cancel};
}

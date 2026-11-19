import {useAppStore} from '../store';
import type {AppSettings, ReversePromptMode} from '../types';

/** The same persisted reverse preference is available at every inline caller. */
export function reversePromptSelection(settings: AppSettings | null | undefined) {
  return {model:'v5' as const,edition:'3.0.0' as const};
}
export function reversePromptSelectionIdentity(settings: AppSettings | null | undefined): string {
  return JSON.stringify([reversePromptSelection(settings), settings?.reversePromptTemplates,
    settings?.reversePromptTemplatesV45, settings?.reversePromptTemplatesV2, settings?.templateLibraryRevision,
    settings?.reverseConvertPromptPresetId,settings?.reverseSystemPromptPresetId,settings?.reverseConvertPromptPresets,
    settings?.reverseConvertDshEnabled,settings?.reverseConvertDshMode,
    settings?.visionApiUrl,settings?.visionApiModel,settings?.visionApiKey]);
}
export function callSelectedInlineReverse(image: string, mode: ReversePromptMode, hint = '', known = false) {
  const settings = useAppStore.getState().settings;
  const selection = reversePromptSelection(settings);
  const args = [image,mode,'full',hint,known,selection.model] as const;
  return selection.edition === undefined ? window.naiDesktop.reversePrompt(...args)
    : window.naiDesktop.reversePrompt(...args,selection.edition);
}
export function InlineReversePromptSkillControls({disabled=false}:{disabled?:boolean}) {
  return <span className="comic-composer-text-only">NovelAI V5 Full · 3.0.0</span>;
}

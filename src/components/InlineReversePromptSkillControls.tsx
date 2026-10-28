import {useState} from 'react';
import {errorText} from '../error-message';
import {useAppStore} from '../store';
import {normalizePromptSkillVersion} from '../prompt-skill';
import type {AppSettings, PromptSkillVersion, ReversePromptMode, ReversePromptTemplateVersion} from '../types';
import {PromptSkillControls} from './PromptSkillControls';

/** The same persisted reverse preference is available at every inline caller. */
export function reversePromptSelection(settings: AppSettings | null | undefined) {
  return {model:settings?.reversePromptTemplateVersion === 'v4.5' ? 'v4.5' as const : 'v5' as const,
    edition:settings?.reversePromptSkillVersion};
}
export function reversePromptSelectionIdentity(settings: AppSettings | null | undefined): string {
  return JSON.stringify([reversePromptSelection(settings), settings?.reversePromptTemplates,
    settings?.reversePromptTemplatesV45, settings?.reversePromptTemplatesV2,
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
  const settings = useAppStore(state=>state.settings);
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const selection=reversePromptSelection(settings);
  async function change(model:ReversePromptTemplateVersion,edition:PromptSkillVersion) {
    if(disabled||saving)return;setSaving(true);setError('');
    try {
      await window.naiDesktop.setSetting('reversePromptTemplateVersion',model);
      await window.naiDesktop.setSetting('reversePromptSkillVersion',edition);
      await useAppStore.getState().refreshSettings();
    } catch(e) {setError(errorText(e));}
    finally {setSaving(false);}
  }
  return <><PromptSkillControls model={selection.model} edition={normalizePromptSkillVersion(selection.edition)}
    language={settings?.language} disabled={disabled||saving} onChange={(model,edition)=>void change(model,edition)}/>
    {error&&<p role="alert">{error}</p>}</>;
}

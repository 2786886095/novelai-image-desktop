import {useRef,useState} from 'react';
import {useAppStore} from '../store';
import {convertedHistoryText} from '../converted-history-text';
import {confirmAction} from './confirm';
import {Button} from './ui';

/** Explicit history-only merge; never runs during startup or normal refresh. */
export function ConvertedHistoryRestoreButton({disabled=false,onRestored}: {disabled?:boolean;onRestored?:()=>void|Promise<void>}) {
  const language=useAppStore(s=>s.settings?.language),text=convertedHistoryText(language);
  const [busy,setBusy]=useState(false),pending=useRef(false);
  if(!window.naiDesktop?.restoreConvertedWebpHistory)return null;
  async function restore() {
    if(disabled||pending.current)return;
    pending.current=true;setBusy(true);
    try {
      if(!await confirmAction(text.confirm,text.restore))return;
      const result=await window.naiDesktop.restoreConvertedWebpHistory!();
      if(!Number.isInteger(result.restored)||result.restored<0)throw Error('Invalid recovery result');
      await useAppStore.getState().refreshHistory();
      if(result.restored)await onRestored?.();
      const partial=result.limited||result.backupErrors>0||result.unavailable>0;
      useAppStore.getState().setToast((result.restored?text.restored.replace('{count}',String(result.restored)):text.none)+(partial?' '+text.partial:''));
    } catch {useAppStore.getState().setToast(text.error);}
    finally {pending.current=false;setBusy(false);}
  }
  return <Button type="button" disabled={disabled} loading={busy} aria-busy={busy} title={text.confirm} onClick={()=>void restore()}>{busy?text.busy:text.restore}</Button>;
}

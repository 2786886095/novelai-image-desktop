import { useEffect, useState } from 'react';
import { useAppStore } from '../store';

/** Never persist a half-typed path. A rejected location remains editable with an inline error. */
export function StorageDirectoryInput({ settingKey, value, placeholder, disabled = false }: { settingKey: 'outputDir' | 'onlineGalleryDownloadDir' | 'logDir'; value: string; placeholder?: string; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(value); setError(''); }, [value]);
  const save = async () => {
    if (busy || disabled || draft === value) return;
    setBusy(true); setError('');
    try { await window.naiDesktop.setSetting(settingKey, draft); await useAppStore.getState().refreshSettings(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  return <div className="storage-directory-input"><input disabled={disabled} placeholder={placeholder} value={draft} readOnly={busy} aria-invalid={!!error}
    onChange={event => setDraft(event.target.value)} onBlur={() => void save()}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape') { setDraft(value); setError(''); } }} />{error && <p role="alert">{error}</p>}</div>;
}

import '../typography.css';
import {useRef, useState} from 'react';
import {characterNameEditText, normalizeCharacterNameDraft} from '../character-name-editing';
import {AppPortal, Button} from './ui';
import {Icon} from './icons';

export function CharacterNameControl({name, fallback, language, onSave}: {
  name?: string; fallback: string; language: unknown; onSave: (name: string | undefined) => void;
}) {
  const text = characterNameEditText(language), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState('');
  const close = () => {setOpen(false); requestAnimationFrame(() => trigger.current?.focus());};
  return <div className="character-name-control">
    <strong className="character-name-display" title={name?.trim() || fallback}>{name?.trim() || fallback}</strong>
    <button ref={trigger} type="button" className="character-name-edit" title={text.edit} aria-label={`${text.edit} · ${name?.trim() || fallback}`} onClick={() => {setDraft(name ?? ''); setOpen(true);}}><Icon name="draw" /></button>
    {open && <AppPortal><div className="modal-backdrop character-name-backdrop" onClick={close}>
      <form className="modal character-name-dialog" role="dialog" aria-modal="true" aria-label={text.edit} onClick={e => e.stopPropagation()} onSubmit={e => {e.preventDefault(); onSave(normalizeCharacterNameDraft(draft)); close();}} onKeyDown={e => {if(e.key === 'Escape') {e.preventDefault(); e.stopPropagation(); close();}}}>
        <header><h2>{text.edit}</h2><button type="button" aria-label={text.cancel} onClick={close}><Icon name="close" /></button></header>
        <div className="character-name-dialog-body"><label className="field"><span>{text.name}</span><input className="character-name-input" autoFocus aria-label={text.name} placeholder={fallback} value={draft} maxLength={64} onChange={e => setDraft(e.target.value)} /></label></div>
        <footer><Button type="button" className="character-name-cancel" onClick={close}>{text.cancel}</Button><Button type="submit" variant="primary" className="character-name-save">{text.save}</Button></footer>
      </form>
    </div></AppPortal>}
  </div>;
}

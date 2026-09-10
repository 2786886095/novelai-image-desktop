import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from 'react';
import { SelectMenu } from '../components/ui';
import { AddIcon, DeleteIcon, LockIcon, RefreshIcon } from './MaterialIcons';
import type { SceneBindings, SceneEntity, SceneOperation } from './scene-bindings';
import { applyScenePatch, readSceneBindings } from './scene-bindings';
import { sceneErrorMessage, sceneUiText } from './scene-errors';
import { sceneEntityRemoval } from './scene-user-actions';
import { canonicalSceneValue } from './scene-bindings';

export function ValueInput({ value, label, disabled, onCommit, text }: {
  value: string; label: string; disabled: boolean; onCommit: (value: string) => boolean; text: ReturnType<typeof sceneUiText>;
}) {
  const [draft, setDraft] = useState(value);
  const [failed, setFailed] = useState(false);
  const base = useRef(value);
  const dirty = useRef(false);
  const cancelBlur = useRef(false);
  useEffect(() => {
    if (!dirty.current || draft === value) {
      base.current = value; dirty.current = false; setDraft(value); setFailed(false);
    }
  }, [value, draft]);
  const conflict = dirty.current && base.current !== value;
  const save = () => {
    if (disabled || conflict || !dirty.current) return;
    const ok = onCommit(draft); setFailed(!ok);
    if (ok) { dirty.current = false; base.current = draft; }
  };
  return <div className="tavern-binding-input">
    <input aria-label={label} value={draft} disabled={disabled} aria-invalid={conflict || failed || undefined}
      onFocus={() => { cancelBlur.current = false; }}
      onChange={event => { dirty.current = true; setDraft(event.target.value); }}
      onBlur={() => { if (cancelBlur.current) { cancelBlur.current = false; return; } save(); }}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === 'Escape') {
          event.preventDefault(); cancelBlur.current = true; dirty.current = false; base.current = value;
          setDraft(value); setFailed(false); event.currentTarget.blur();
        }
      }} />
    {(conflict || failed) && <div className="tavern-binding-conflict" role="status">
      <span>{conflict ? text.conflict : text.saveFailed}</span>
      <button type="button" className="btn" onClick={() => { dirty.current = false; base.current = value; setDraft(value); setFailed(false); }}>{text.reload}</button>
      {conflict && <button type="button" className="btn" disabled={disabled} onClick={() => {
        const ok = onCommit(draft); setFailed(!ok);
        if (ok) { dirty.current = false; base.current = draft; }
      }}>{text.useDraft}</button>}
    </div>}
  </div>;
}

function LockButton({ checked, disabled, label, name, onChange }: {
  checked: boolean; disabled?: boolean; label: string; name: string; onChange: (value: boolean) => void;
}) {
  return <button type="button" className="btn tavern-binding-lock" aria-label={`${label}: ${name}`}
    aria-pressed={checked} disabled={disabled} onClick={() => onChange(!checked)}>
    <LockIcon aria-hidden="true" /><span>{label}</span>
  </button>;
}

export function SceneBindingsEditor({ scene, onChange, language, disabled = false, onLayoutChange }: {
  scene?: SceneBindings; onChange?: (scene: SceneBindings) => void; language: unknown;
  disabled?: boolean; onLayoutChange?: () => void;
}) {
  const text = sceneUiText(language);
  const [history, setHistory] = useState<SceneBindings[]>([]);
  const [error, setError] = useState('');
  const [resetDrafts, setResetDrafts] = useState(0);
  const [removing, setRemoving] = useState<{ id: string; revision: number } | null>(null);
  const removalTitle = useId();
  const removalDialog = useRef<HTMLElement>(null);
  const removalTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!removing) return;
    removalDialog.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll: true});
    return () => { if (removalTrigger.current?.isConnected) removalTrigger.current.focus({preventScroll: true}); };
  }, [removing?.id]);
  const lastApplied = useRef(scene ? canonicalSceneValue(scene) : '');
  useEffect(() => {
    const value = scene ? canonicalSceneValue(scene) : '';
    if (value !== lastApplied.current) setHistory([]);
    lastApplied.current = value;
  }, [scene]);
  const [adding, setAdding] = useState<string | null>(null);
  const [slot, setSlot] = useState('');
  const [prompt, setPrompt] = useState('');
  const readonly = disabled || !onChange;
  if (!scene) return <details className="tavern-scene-bindings" open onToggle={onLayoutChange}>
    <summary>{text.title}</summary><p className="muted">{text.empty}</p>
  </details>;
  if (!readSceneBindings(scene)) return <p role="alert">{text.error}</p>;
  const characters = scene.entities.filter(entity => entity.kind === 'character');
  const locked = (id: string) => {
    const entity = scene.entities.find(item => item.id === id);
    return !!entity?.locked || [entity?.ownerId, entity?.wearerId]
      .some(ownerId => ownerId && scene.entities.find(item => item.id === ownerId)?.locked);
  };
  const commit = (collection: SceneOperation['collection'], before: unknown, after: unknown, id: string) => {
    try {
      const next = applyScenePatch(scene, { revision: scene.revision, operations: [{ collection, id, before, after }] }, true);
      setHistory(items => [...items, structuredClone(scene)].slice(-20));
      lastApplied.current = canonicalSceneValue(next);
      onChange?.(next); setError(''); return true;
    } catch (error) { setError(sceneErrorMessage(error, language)); return false; }
  };
  const facts = (id: string) => scene.facts.filter(fact => fact.entityId === id).map(fact => (
    <div className="tavern-binding-row" key={fact.id}>
      <label className="field"><span>{fact.slot}</span>
        <ValueInput text={text} key={resetDrafts} value={fact.prompt} label={`${scene.entities.find(entity => entity.id === id)?.name ?? text.scene} / ${fact.slot}`}
          disabled={readonly || !!fact.locked || locked(id)}
          onCommit={prompt => commit('facts', fact, { ...fact, prompt }, fact.id)} />
      </label>
      {!readonly && <div className="tavern-binding-actions">
        <LockButton label={text.locked} name={fact.slot} checked={!!fact.locked} disabled={locked(id)}
          onChange={locked => commit('facts', fact, { ...fact, locked }, fact.id)} />
        <button type="button" className="btn" disabled={!!fact.locked || locked(id)}
          onClick={() => commit('facts', fact, null, fact.id)}><DeleteIcon aria-hidden="true" />{text.remove}</button>
      </div>}
    </div>
  ));
  const add = (id: string) => <>
    {!readonly && !locked(id) && <button type="button" className="btn btn-ghost" onClick={() => {
      setAdding(id); setSlot(''); setPrompt('');
    }}><AddIcon aria-hidden="true" />{text.add}</button>}
    {adding === id && <form className="tavern-binding-add" onSubmit={event => {
      event.preventDefault(); const fact = { id: `fact_${crypto.randomUUID()}`, entityId: id, slot, prompt };
      if (commit('facts', null, fact, fact.id)) setAdding(null);
    }}>
      <label className="field"><span>{text.slot}</span><input required maxLength={80} aria-label={text.slot}
        value={slot} onChange={event => setSlot(event.target.value)} /></label>
      <label className="field"><span>{text.prompt}</span><input aria-label={text.prompt}
        value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
      <div className="tavern-binding-actions"><button className="btn btn-primary">{text.save}</button>
        <button type="button" className="btn" onClick={() => setAdding(null)}>{text.cancel}</button></div>
    </form>}
  </>;
  const entity = (item: SceneEntity) => <details key={item.id} className="tavern-binding-entity" open onToggle={onLayoutChange}>
    <summary>{item.name}{item.locked ? ` · ${text.locked}` : ''}
      <small> · {scene.facts.filter(fact => fact.entityId === item.id).length}</small>
    </summary>
    <div className="tavern-binding-row">
      <label className="field"><span>{text.name}</span>
        <ValueInput text={text} key={resetDrafts} value={item.name} label={`${text.name}: ${item.name}`} disabled={readonly || locked(item.id)}
          onCommit={name => commit('entities', item, { ...item, name }, item.id)} />
      </label>
      {!readonly && <LockButton label={text.locked} name={item.name} checked={!!item.locked}
        onChange={locked => commit('entities', item, { ...item, locked }, item.id)} />}
    </div>
    <label className="field"><span>{text.prompt}</span>
      <ValueInput text={text} key={resetDrafts} value={item.prompt} label={`${text.prompt}: ${item.name}`} disabled={readonly || locked(item.id)}
        onCommit={prompt => commit('entities', item, { ...item, prompt }, item.id)} />
    </label>
    {item.kind !== 'character' && <div className="tavern-binding-row">
      {(['ownerId', ...(item.kind === 'garment' ? ['wearerId'] : [])] as ('ownerId' | 'wearerId')[]).map(key => (
        <div className="field" key={key}><span>{key === 'ownerId' ? text.owner : text.wearer}</span>
          <SelectMenu ariaLabel={`${key === 'ownerId' ? text.owner : text.wearer}: ${item.name}`}
            disabled={readonly || locked(item.id)} value={item[key] ?? ''}
            options={[{ value: '', label: '—' }, ...characters.map(person => ({ value: person.id, label: person.name }))]}
            onChange={value => {
              const next = { ...item };
              if (value) next[key] = value; else delete next[key];
              commit('entities', item, next, item.id);
            }} />
        </div>
      ))}
    </div>}
    {facts(item.id)}{add(item.id)}
    {!readonly && <button type="button" className="btn tavern-binding-remove" disabled={locked(item.id)} onClick={event => {
      removalTrigger.current = event.currentTarget;
      try { sceneEntityRemoval(scene, item.id); setRemoving({id: item.id, revision: scene.revision}); setError(''); }
      catch (error) { setError(sceneErrorMessage(error, language)); }
    }}><DeleteIcon aria-hidden="true" />{text.removeEntity}</button>}
    {item.kind === 'character' && scene.entities.filter(garment => garment.wearerId === item.id).map(entity)}
  </details>;
  return <details className="tavern-scene-bindings" open onToggle={onLayoutChange}>
    <summary>{text.title} · {characters.map(entity => entity.name).join(' / ')}</summary>
    <p className="muted">{text.source}</p>
    {error && <div role="alert" className="tavern-binding-conflict"><p>{error}</p>
      <button type="button" className="btn" onClick={() => { setResetDrafts(n => n + 1); setError(''); }}>{text.reload}</button>
    </div>}
    {removing && createPortal(<div className="app-confirm-backdrop is-visible" onClick={event => { if (event.target === event.currentTarget) setRemoving(null); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); setRemoving(null); }
        if (event.key === 'Tab') {
          const buttons = removalDialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
          if (!buttons?.length) return;
          const first = buttons[0], last = buttons[buttons.length-1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}><section ref={removalDialog} className="app-confirm-dialog tavern-binding-removal" role="alertdialog" aria-modal="true" aria-labelledby={removalTitle}>
      <strong id={removalTitle}>{text.removeEntity}: {scene.entities.find(e => e.id === removing.id)?.name}</strong><p>{text.removeHint}</p>
      <p>{text.removeCounts}: {scene.facts.filter(f => f.entityId === removing.id).length} / {scene.relations.filter(r => r.actorId === removing.id || r.targetId === removing.id).length}</p>
      <p>{text.detachItems}: {scene.entities.filter(e => e.ownerId === removing.id || e.wearerId === removing.id).map(e => e.name).join(', ') || '—'}</p>
      <div className="tavern-binding-actions"><button type="button" className="btn" onClick={() => setRemoving(null)}>{text.cancel}</button>
        <button type="button" className="btn btn-danger" onClick={() => {
          try {
            if (removing.revision !== scene.revision) throw Error('SCENE_STALE');
            const {next} = sceneEntityRemoval(scene, removing.id);
            setHistory(items => [...items, structuredClone(scene)].slice(-20)); lastApplied.current = canonicalSceneValue(next);
            onChange?.(next); setRemoving(null); setError('');
          } catch(error) { setError(sceneErrorMessage(error, language)); setRemoving(null); }
        }}>{text.remove}</button></div>
    </section></div>, document.body)}
    {!readonly && history.length > 0 && <button type="button" className="btn" onClick={() => {
      const old = history.at(-1)!; setHistory(items => items.slice(0, -1));
      const next = { ...structuredClone(old), revision: scene.revision + 1 };
      lastApplied.current = canonicalSceneValue(next); onChange?.(next);
    }}><RefreshIcon aria-hidden="true" />{text.undo}</button>}
    {scene.entities.filter(item => item.kind === 'character' || !item.wearerId).map(entity)}
    <details className="tavern-binding-entity" onToggle={onLayoutChange}>
      <summary>{text.scene}</summary>{facts('scene')}{add('scene')}
    </details>
    {scene.relations.length > 0 && <details className="tavern-binding-entity" onToggle={onLayoutChange}>
      <summary>{text.relations}</summary>{scene.relations.map(relation => (
        <div key={relation.id} className="tavern-binding-row">
          <label className="field"><span>{scene.entities.find(item => item.id === relation.actorId)?.name}{relation.actorPart?.trim() ? ` (${relation.actorPart})` : ''} → {scene.entities.find(item => item.id === relation.targetId)?.name}{relation.targetPart?.trim() ? ` (${relation.targetPart})` : ''}</span>
            <ValueInput text={text} key={resetDrafts} value={relation.action} label={`${text.relations}: ${relation.id}`}
              disabled={readonly || !!relation.locked || locked(relation.actorId) || locked(relation.targetId)}
              onCommit={action => commit('relations', relation, { ...relation, action }, relation.id)} />
          </label>
          {!readonly && <LockButton label={text.locked} name={relation.id} checked={!!relation.locked}
            disabled={locked(relation.actorId) || locked(relation.targetId)}
            onChange={locked => commit('relations', relation, { ...relation, locked }, relation.id)} />}
        </div>
      ))}
    </details>}
  </details>;
}

import { useEffect, useMemo, useState } from "react";
import type { ComparisonTag } from "../model";
import type { ComparisonStrings } from "../strings";
import { Button } from "../../components/ui";

function newTagId() {
  const randomUUID = globalThis.crypto?.randomUUID;
  return typeof randomUUID === "function"
    ? `tag-${randomUUID.call(globalThis.crypto)}`
    : `tag-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sameLabel(left: string, right: string) {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

export interface TagPickerProps {
  text: ComparisonStrings;
  tags: ComparisonTag[];
  value: string[];
  onChange: (tagIds: string[]) => void;
}

export function TagPicker({ text, tags, value, onChange }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedTags = tags.filter((tag) => value.includes(tag.id));
  const filteredTags = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? tags.filter((tag) => tag.label.toLocaleLowerCase().includes(needle)) : tags;
  }, [query, tags]);
  const toggle = (tagId: string) => {
    onChange(value.includes(tagId) ? value.filter((id) => id !== tagId) : [...value, tagId]);
  };
  return <div className="comparison-tag-picker">
    <div className="comparison-tag-picker-summary">
      {selectedTags.length > 0 ? selectedTags.map((tag) => <span className="comparison-tag-chip" key={tag.id}>{tag.label}</span>) : <span className="comparison-tag-empty">{text.noTagsSelected}</span>}
      <Button variant="ghost" className="comparison-tag-picker-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{open ? text.closeTags : text.chooseTags}</Button>
    </div>
    {open && <div className="comparison-tag-picker-menu">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.tagSearch} aria-label={text.tagSearch} />
      {filteredTags.length > 0 ? <div className="comparison-tag-picker-options">{filteredTags.map((tag) => <label key={tag.id}><input type="checkbox" checked={value.includes(tag.id)} onChange={() => toggle(tag.id)} /><span>{tag.label}</span></label>)}</div> : <p className="comparison-muted">{tags.length ? text.noTagResults : text.noTags}</p>}
    </div>}
  </div>;
}

export interface ComparisonTagManagerProps {
  text: ComparisonStrings;
  tags: ComparisonTag[];
  onChange: (tags: ComparisonTag[]) => void;
  busy: boolean;
}

export function ComparisonTagManager({ text, tags, onChange, busy }: ComparisonTagManagerProps) {
  const [draft, setDraft] = useState(tags);
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const incomingSignature = JSON.stringify(tags);
  useEffect(() => {
    if (!dirty) setDraft(tags);
  }, [dirty, incomingSignature, tags]);
  const duplicate = (label: string, ignoreId?: string) => draft.some((tag) => tag.id !== ignoreId && sameLabel(tag.label, label));
  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    if (label.length > 80) { setError(text.tagNameTooLong); return; }
    if (draft.length >= 100) { setError(text.tagLimit); return; }
    if (duplicate(label)) { setError(text.duplicateTag); return; }
    const next = [...draft, { id: newTagId(), label }];
    setDraft(next);
    setNewLabel("");
    setError("");
    setDirty(false);
    onChange(next);
  };
  const update = (id: string, label: string) => {
    setDraft((current) => current.map((tag) => tag.id === id ? { ...tag, label } : tag));
    setDirty(true);
    setError("");
  };
  const commit = () => {
    const next = draft.map((tag) => ({ ...tag, label: tag.label.trim() }));
    if (next.some((tag) => !tag.label)) { setError(text.tagNameRequired); return; }
    if (next.some((tag) => tag.label.length > 80)) { setError(text.tagNameTooLong); return; }
    if (next.some((tag, index) => next.some((other, otherIndex) => otherIndex < index && sameLabel(tag.label, other.label)))) { setError(text.duplicateTag); return; }
    setDraft(next);
    setDirty(false);
    setError("");
    onChange(next);
  };
  const remove = (id: string) => {
    const next = draft.filter((tag) => tag.id !== id);
    setDraft(next);
    setDirty(false);
    setError("");
    onChange(next);
  };
  return <section className="comparison-tag-manager">
    <div className="comparison-section-heading"><div><h3>{text.projectTags}</h3><p>{text.projectTagsHint}</p></div><span className="comparison-tag-limit">{draft.length}/100</span></div>
    <div className="comparison-tag-manager-list">{draft.map((tag) => <div className="comparison-tag-manager-row" key={tag.id}><input value={tag.label} maxLength={80} aria-label={text.tagName} onChange={(event) => update(tag.id, event.target.value)} /><Button variant="ghost" disabled={busy} title={text.deleteTag} aria-label={text.deleteTag} onClick={() => remove(tag.id)}>×</Button></div>)}</div>
    <div className="comparison-tag-add"><input value={newLabel} maxLength={80} placeholder={text.newTagPlaceholder} aria-label={text.newTagPlaceholder} onChange={(event) => setNewLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} /><Button variant="ghost" disabled={busy || !newLabel.trim() || draft.length >= 100} onClick={add}>{text.addTag}</Button></div>
    {error && <p className="comparison-field-error" role="alert">{error}</p>}
    {draft.length > 0 && <Button variant="primary" disabled={busy} onClick={commit}>{text.saveTags}</Button>}
  </section>;
}

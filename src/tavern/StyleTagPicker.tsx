import { useEffect, useMemo, useRef, useState } from "react";
import { SelectMenuCompat } from "../components/ui";
import { RANDOM_CUSTOM_TAG_LIBRARY, matchesCustomTagSearch, customTagMeaning, customTagCategoryLabel } from "../random-custom-tag-library";
import type { AppLanguage, TagSuggestion } from "../types";
import { imageUi } from "./image-ui";
import { appendStylePrompt, drawStyleTags } from "./style-draw";

export function StyleTagPicker({ value, onChange, language }: { value: string; onChange: (value: string) => void; language: unknown }) {
  const ui = imageUi(language);
  const locale = language as AppLanguage;
  const [open, setOpen] = useState(false), [scope, setScope] = useState("builtin"), [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [pinned, setPinned] = useState<string[]>([]);
  const [items, setItems] = useState<TagSuggestion[]>([]), [total, setTotal] = useState(0), [limit, setLimit] = useState(80);
  const [loading, setLoading] = useState(false), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  const [count, setCount] = useState(3), [min, setMin] = useState(0.2), [max, setMax] = useState(1.2), [seed, setSeed] = useState(1);
  const [preview, setPreview] = useState(""), [undo, setUndo] = useState<{ before: string; after: string }>();
  const revision = useRef(0);
  const catalog = useRef<{ key: string; items: TagSuggestion[]; total: number }>({ key: "", items: [], total: 0 });
  const dynamic = scope === "style" || scope === "copyright";
  useEffect(() => {
    const id = ++revision.current;
    if (!open || !dynamic) { setLoading(false); return; }
    const key = JSON.stringify([scope, query]);
    if (catalog.current.key !== key) catalog.current = { key, items: [], total: 0 };
    const cached = catalog.current;
    if (cached.items.length >= limit || (cached.items.length > 0 && cached.items.length >= cached.total)) {
      setItems(cached.items); setTotal(cached.total); setLoading(false); return;
    }
    setLoading(true); setError(false);
    const timer = window.setTimeout(() => {
      void window.naiDesktop.artistStyleCatalog(scope, query, cached.items.length, 80).then((result) => {
        if (revision.current !== id) return;
        const next = [...cached.items, ...result.items];
        catalog.current = { key, items: next, total: result.total };
        setItems(next); setTotal(result.total); setLoading(false);
      }).catch(() => { if (revision.current === id) { setError(true); setLoading(false); } });
    }, 180);
    return () => { window.clearTimeout(timer); if (revision.current === id) revision.current++; };
  }, [open, dynamic, scope, query, limit, retry]);
  const builtin = useMemo(() => RANDOM_CUSTOM_TAG_LIBRARY.filter((c) => scope === "builtin" || scope === c.id).flatMap((c) => c.tags.filter((t) => matchesCustomTagSearch(c, t, locale, query)).map((t) => ({ tag: t.tag, description: customTagMeaning(t, locale), count: 0, category: 0 }))), [scope, query, language]);
  const visible = dynamic ? items : builtin.slice(0, limit);
  const toggle = (tag: string) => { setPreview(""); setSelected((s) => s.includes(tag) ? s.filter((t) => t !== tag) : [...s, tag]); setPinned((s) => s.filter((t) => t !== tag)); };
  const add = (text: string) => { const after = appendStylePrompt(value, text); setUndo({ before: value, after }); onChange(after); };
  return <details className="tavern-style-library" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{ui.library} · {ui.selected} {selected.length}</summary>
    {open && <div className="tavern-style-library-body">
      <small>{ui.hint}</small>
      <SelectMenuCompat aria-label={ui.library} value={scope} onChange={(e) => { setScope(e.target.value); setLimit(80); setItems([]); }}>
        <option value="builtin">{ui.all}</option>
        {RANDOM_CUSTOM_TAG_LIBRARY.map((c) => <option value={c.id} key={c.id}>{customTagCategoryLabel(c, locale)}</option>)}
        <option value="style">{ui.local}</option><option value="copyright">{ui.works}</option>
      </SelectMenuCompat>
      {scope === "copyright" && <small>{ui.worksHint}</small>}
      <input type="search" aria-label={ui.search} placeholder={ui.search} value={query} onChange={(e) => { setQuery(e.target.value); setLimit(80); setItems([]); }} />
      <div className="tavern-style-library-list" aria-busy={loading}>
        {loading && <small role="status">{ui.loading}</small>}
        {error ? <button type="button" className="btn secondary" onClick={() => setRetry((n) => n + 1)}>{ui.error}</button> : visible.map((entry) => <label key={entry.tag}>
          <input type="checkbox" checked={selected.includes(entry.tag)} onChange={() => toggle(entry.tag)} />
          <span><strong>{entry.tag}</strong><small>{entry.description}</small></span>
        </label>)}
        {!loading && !error && !visible.length && <small>{ui.empty}</small>}
        {visible.length < (dynamic ? total : builtin.length) && <button type="button" className="btn secondary" disabled={loading} onClick={() => setLimit((n) => n + 80)}>{ui.more} ({visible.length}/{dynamic ? total : builtin.length})</button>}
      </div>
      {selected.length > 0 && <details><summary>{ui.selected} {selected.length} · {ui.pin}</summary><div className="tavern-style-library-list">{selected.map((tag) => <label key={tag}><input type="checkbox" checked={pinned.includes(tag)} onChange={() => { setPinned((s) => s.includes(tag) ? s.filter((t) => t !== tag) : [...s, tag]); setPreview(""); }} /><span>{tag}</span><button type="button" aria-label={`${ui.clear}: ${tag}`} onClick={() => toggle(tag)}>×</button></label>)}</div></details>}
      <div className="tavern-style-library-fields">
        <label>{ui.count}<input type="number" min={0} max={50} value={count} onChange={(e) => { setCount(Math.max(0, Math.min(50, Number(e.target.value)))); setPreview(""); }} /></label>
        <label>{ui.seed}<input type="number" min={0} max={4294967295} value={seed} onChange={(e) => { setSeed(Number(e.target.value) >>> 0); setPreview(""); }} /></label>
        <label>{ui.min}<input type="number" min={0} max={3} step={0.1} value={min} onChange={(e) => { setMin(Number(e.target.value)); setPreview(""); }} /></label>
        <label>{ui.max}<input type="number" min={0} max={3} step={0.1} value={max} onChange={(e) => { setMax(Number(e.target.value)); setPreview(""); }} /></label>
      </div>
      <div className="tavern-style-library-actions">
        <button className="btn secondary" type="button" disabled={!selected.length} onClick={() => add(selected.join(", "))}>{ui.add}</button>
        <button className="btn secondary" type="button" disabled={!selected.length} onClick={() => setPreview(drawStyleTags(selected, pinned, count, min, max, seed))}>{ui.draw}</button>
        <button className="btn secondary" type="button" disabled={!selected.length} onClick={() => { const next = crypto.getRandomValues(new Uint32Array(1))[0]; setSeed(next); setPreview(drawStyleTags(selected, pinned, count, min, max, next)); }}>↻ {ui.reroll}</button>
        <button className="btn secondary" type="button" disabled={!undo || value !== undo.after} onClick={() => { if (undo) onChange(undo.before); setUndo(undefined); }}>{ui.undo}</button>
      </div>
      {preview && <div><textarea readOnly aria-label={ui.draw} value={preview} rows={3} /><button className="btn primary" type="button" onClick={() => { add(preview); setPreview(""); }}>{ui.apply}</button></div>}
    </div>}
  </details>;
}

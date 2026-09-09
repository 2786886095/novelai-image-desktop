import { useEffect, useState } from "react";
import type { QuickNavigation } from "./quicktag";
import { SelectMenu } from "./components/ui";
import { Icon } from "./components/icons";
import { normalizeAppLanguage } from "./i18n";
import labels from "../shared/quicktag-ui.json";
export function QuickTagNavigation({navigation, collectionId, searchAll, loading, language, onSelect, onScope, onGroup}: {
  navigation?: QuickNavigation; collectionId: string; searchAll: boolean; loading: boolean; language: unknown;
  onSelect: (collection:string,path:string[])=>void; onScope:(all:boolean)=>void; onGroup?: (type:string)=>void;
}) {
  const text = labels[normalizeAppLanguage(language)];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  useEffect(() => { setExpanded(new Set()); setFilter(""); }, [collectionId]);
  const active = navigation?.categoryPath ?? [];
  const type = navigation?.collectionType ?? "";
  const collections = (navigation?.collections ?? []).filter(c => !type || c.type === type);
  const all = navigation?.categories ?? [];
  const query = filter.trim().toLocaleLowerCase();
  const matches = all.filter(c => c.path.join(" › ").toLocaleLowerCase().includes(query));
  const prefix = (a: string[], b: string[]) => a.length <= b.length && a.every((p,i) => p === b[i]);
  const isOpen = (path: string[]) => expanded.has(JSON.stringify(path)) || (path.length < active.length && prefix(path, active));
  const visible = all.filter(c => query ? matches.some(m => prefix(c.path, m.path)) : c.path.slice(0,-1).every((_, i) => isOpen(c.path.slice(0,i+1))));
  const groupName = (id: string) => (text as Record<string,string>)[id] ?? id;
  const fill = (value: string, fields: Record<string, number>) => Object.entries(fields).reduce((s,[k,v]) => s.replace(`{${k}}`, v.toLocaleString()),value);
  return <div className="quicktag-navigation">
    <nav className="quicktag-groups" aria-label={text.sections}>
      <button type="button" className="btn secondary" aria-pressed={!type} disabled={loading} onClick={()=>onGroup?.("")}>{text.sections}</button>
      {navigation?.groups?.map(g => <button type="button" key={g.id} className="btn secondary" aria-pressed={type===g.id} disabled={loading} onClick={()=>onGroup?.(g.id)}>{groupName(g.id)} <small>{g.visible === g.count ? g.count : `${g.visible}/${g.count}`}</small></button>)}
    </nav>
    {navigation?.catalogTotal != null && <small>{fill(text.inventory,{books:navigation.catalogTotal,entries:navigation.catalogEntries ?? 0})} · {text.version}: {navigation.release}</small>}
    {!!navigation?.hiddenCollections && <p className="quicktag-filter-notice" role="status">{fill(text.hidden,{count:navigation.hiddenCollections})}</p>}
    <SelectMenu ariaLabel={text.catalog} label={collectionId ? text.catalog : undefined} value={collectionId} disabled={loading} options={[{value:"",label:text.catalog},...collections.map(c=>({value:c.id,label:`${c.title} (${c.count.toLocaleString()})`}))]} onChange={id=>onSelect(id,[])} />
    {collectionId && <section className="quicktag-directory" aria-label={text.category}>
      <nav className="quicktag-breadcrumbs" aria-label={text.category}>
        <button type="button" className="btn secondary" disabled={loading} onClick={()=>onSelect(collectionId,[])}>{text.all}</button>
        {active.map((part,i) => <button type="button" key={i} className="btn secondary" disabled={loading} onClick={()=>onSelect(collectionId,active.slice(0,i+1))}>{part}</button>)}
      </nav>
      {navigation?.loadedCount != null && <small>{fill(text.loaded,{declared:navigation.declaredCount ?? 0,loaded:navigation.loadedCount})}</small>}
      <input type="search" aria-label={text.findCategory} placeholder={text.findCategory} value={filter} onChange={e=>setFilter(e.target.value)} />
      <div className="quicktag-directory-tree" role="group" aria-label={text.category}>
        {visible.map(c => {
          const key=JSON.stringify(c.path), hasChildren=all.some(n=>n.path.length===c.path.length+1&&prefix(c.path,n.path));
          return <div className="quicktag-directory-row" key={key} style={{paddingInlineStart: Math.min(c.path.length-1,8)*14}}>
            {hasChildren ? <button type="button" className="quicktag-tree-toggle" aria-label={c.path.join(" › ")} aria-expanded={isOpen(c.path)||!!query} onClick={()=>setExpanded(old=>{const next=new Set(old);next.has(key)?next.delete(key):next.add(key);return next;})}><Icon name="chevronDown" /></button> : <span className="quicktag-tree-leaf" />}
            <button type="button" className="quicktag-category" disabled={loading} aria-current={key===JSON.stringify(active)?"page":undefined} title={c.path.join(" › ")} onClick={()=>onSelect(collectionId,c.path)}><span>{c.path.at(-1)}</span><small>{c.count.toLocaleString()}</small></button>
          </div>;
        })}
        {!visible.length && <small>{text.emptyCategory}</small>}
      </div>
    </section>}
    <label className="online-gallery-safe-toggle"><input type="checkbox" checked={searchAll} disabled={loading} onChange={e=>onScope(e.target.checked)} />{text.scope}</label>
    <small>{text.hint}</small>
    {navigation?.failedCollections.length ? <div role="alert">{text.partial}{navigation.failedCollections.join(" · ")}</div>:null}
  </div>;
}

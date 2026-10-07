import {useState} from 'react';
import {useAppStore} from '../store';
import {comparisonText,normalizeAutomaticComparison,type ComparisonSurface} from '../automatic-comparison';
// Serialize whole-map writes across mounted surfaces so rapid changes never overwrite each other.
let pending:Promise<unknown>=Promise.resolve();
export function AutomaticComparisonControl({surface}:{surface:ComparisonSurface}) {
 const settings=useAppStore(s=>s.settings),t=comparisonText(settings?.language),[saving,setSaving]=useState(false);
 const value=normalizeAutomaticComparison(settings?.automaticComparison)[surface];
 function change(enabled:boolean){setSaving(true);
  const operation=pending.catch(()=>undefined).then(async()=>{
   const previous=normalizeAutomaticComparison(useAppStore.getState().settings?.automaticComparison);
   const next={...previous,[surface]:enabled};
   const saved=normalizeAutomaticComparison(await window.naiDesktop.setSetting('automaticComparison',next));
   useAppStore.setState(s=>({settings:s.settings?{...s.settings,automaticComparison:saved}:s.settings}));
  });pending=operation;
  void operation.catch(e=>useAppStore.getState().setToast(String(e))).finally(()=>setSaving(false));
 }
 return <label className="automatic-comparison-control" data-auto-compare={surface}>
  <span><input type="checkbox" checked={value} disabled={saving} onChange={e=>change(e.target.checked)}/>{t.label}</span><small>{t.hint}</small>
 </label>;
}

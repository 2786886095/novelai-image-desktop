import { supportsNAIMediumEffort, type NAIEffort } from '../types';

const labels = {
  'zh-CN': {title:'生成档位（Effort）', medium:'Medium · 中', high:'High · 高', remaining:'预计可生成张数'},
};
export function effortText(language: unknown) { return labels[language as keyof typeof labels] ?? labels['zh-CN']; }
export function EffortControl({model,value,language,onChange}: {model:string;value:NAIEffort;language:unknown;onChange:(value:NAIEffort)=>void}) {
  if (!supportsNAIMediumEffort(model)) return null;
  const text=effortText(language);
  return <div className="quality-preset-control effort-control">
    <span className="quality-preset-title">{text.title}</span>
    <div className="quality-preset-segments" role="radiogroup" aria-label={text.title}>
      {(['medium','high'] as const).map(effort => <button key={effort} type="button" role="radio" aria-checked={value===effort} className={value===effort?'active':''} onClick={()=>onChange(effort)}>{text[effort]}</button>)}
    </div>
  </div>;
}

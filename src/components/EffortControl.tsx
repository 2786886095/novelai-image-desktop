import { supportsNAIMediumEffort, type NAIEffort } from '../types';

const labels = {
  'zh-CN': {title:'生成档位（Effort）', medium:'Medium · 中', high:'High · 高', remaining:'预计可生成张数'},
  'zh-TW': {title:'生成檔位（Effort）', medium:'Medium · 中', high:'High · 高', remaining:'預計可生成張數'},
  'en-US': {title:'Generation effort', medium:'Medium', high:'High', remaining:'Estimated remaining images'},
  'ja-JP': {title:'生成 Effort', medium:'Medium · 中', high:'High · 高', remaining:'生成可能枚数の目安'},
  'ko-KR': {title:'생성 Effort', medium:'Medium · 중', high:'High · 높음', remaining:'예상 잔여 이미지 수'},
  'ru-RU': {title:'Усилие генерации', medium:'Medium', high:'High', remaining:'Осталось изображений (оценка)'},
};
export function effortText(language: unknown) { return labels[language as keyof typeof labels] ?? labels['en-US']; }
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

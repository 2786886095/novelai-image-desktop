import {useState,type CSSProperties,type InputHTMLAttributes} from 'react';
export function rangePercent(value:unknown,min:unknown=0,max:unknown=100){
 const low=Number(min),high=Number(max),n=Number(value);
 if(!Number.isFinite(low)||!Number.isFinite(high)||high<=low)return 0;
 return Math.max(0,Math.min(100,((Number.isFinite(n)?n:(low+high)/2)-low)/(high-low)*100));
}
/** Native keyboard, pointer and min/max/step behavior, shared theme and value fill. */
export function RangeInput({value,defaultValue,min=0,max=100,onChange,className,style,...props}:InputHTMLAttributes<HTMLInputElement>){
 const [draft,setDraft]=useState(defaultValue??(Number(min)+Number(max))/2);
 return <input {...props} type="range" min={min} max={max} value={value??draft}
  className={`studio-range ${className??''}`} style={{...style,'--range-progress':`${rangePercent(value??draft,min,max)}%`} as CSSProperties}
  onChange={e=>{setDraft(e.target.value);onChange?.(e);}}/>;
}

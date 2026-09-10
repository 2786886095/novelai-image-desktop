import {useEffect,useState} from 'react';
import {Button} from './ui';
import {useAppStore} from '../store';
import type {HistoryItem} from '../types';
export function historyPickerText(language: unknown) {
 const labels:Record<string,string[]>={'zh-CN':['从历史记录选择','上一页','下一页','关闭'],'zh-TW':['從歷史記錄選擇','上一頁','下一頁','關閉'],'en-US':['Choose from history','Previous','Next','Close'],'ja-JP':['履歴から選択','前へ','次へ','閉じる'],'ko-KR':['기록에서 선택','이전','다음','닫기']};
 return labels[String(language)]??labels['en-US'];
}
export function HistoryImagePicker({onChoose,onClose}:{onChoose:(paths:string[])=>void;onClose:()=>void}) {
 const language=useAppStore(s=>s.settings?.language),text=historyPickerText(language);
 const [items,setItems]=useState<HistoryItem[]>([]),[page,setPage]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;window.naiDesktop.getHistory().then(items=>{if(active)setItems(items);},e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const total=Math.max(1,Math.ceil(items.length/24));
 return <section aria-label={text[0]} aria-busy={loading}>
 <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><strong>{text[0]} · {items.length}</strong><Button onClick={onClose}>{text[3]}</Button></div>
 {error&&<p role="alert">{error}</p>}
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:8,maxHeight:'45vh',overflowY:'auto'}}>{items.slice(page*24,(page+1)*24).map(item=><button type="button" key={item.id} aria-label={item.id} onClick={()=>{onChoose([item.filePath]);onClose();}}><img loading="lazy" src={item.fileUrl} alt={item.id} style={{width:'100%',height:100,objectFit:'contain'}}/></button>)}</div>
 <div style={{display:'flex',gap:8,alignItems:'center'}}><Button disabled={page===0} onClick={()=>setPage(p=>p-1)}>{text[1]}</Button><span>{page+1} / {total}</span><Button disabled={page+1>=total} onClick={()=>setPage(p=>p+1)}>{text[2]}</Button></div>
 </section>;
}

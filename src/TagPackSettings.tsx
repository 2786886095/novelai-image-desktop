import {useEffect,useState} from "react";
import {TAG_PACK_LANGUAGES,TAG_PACK_MANIFEST,TAG_PACK_NAMES,tagPackLanguage,type TagPackLanguage,type TagPackStatus} from "../shared/multilingual-tag-pack-contract";
import {Button} from "./components/ui";
import {useAppStore} from "./store";
const labels={
 "zh-CN":["离线 Tag 词库","数据更新","当前词库","未安装","下载并启用","导入已下载词包","启用已安装词包","正在安装…","安装未完成，原词库不变。请检查网络后重试。"],
 "zh-TW":["離線 Tag 詞庫","資料更新","目前詞庫","未安裝","下載並啟用","匯入已下載詞包","啟用已安裝詞包","正在安裝…","安裝未完成，原詞庫不變。請檢查網路後重試。"],
 "en-US":["Offline Tag dictionary","Dataset updated","Active dictionary","Not installed","Download and activate","Import downloaded pack","Activate installed pack","Installing…","Installation did not finish; the original dictionary is unchanged. Check your connection and retry."],
 "ja-JP":["オフラインタグ辞書","データ更新日","有効な辞書","未インストール","ダウンロードして有効化","ダウンロード済みパックを読み込む","インストール済みパックを有効化","インストール中…","インストールは完了していません。接続を確認して再試行してください。"],
 "ko-KR":["오프라인 태그 사전","데이터 업데이트","사용 중인 사전","설치되지 않음","다운로드 및 활성화","다운로드한 팩 가져오기","설치된 팩 활성화","설치 중…","설치를 완료하지 못했습니다. 네트워크를 확인하고 다시 시도하세요."]
} as const;
export function tagPackSelectorTitle(language:unknown){
 return (labels[language as keyof typeof labels]??labels["zh-CN"])[0];
}
export default function TagPackSettings({onChanged}:{onChanged?:()=>void}){
 const language=useAppStore(s=>s.settings?.language);
 const l=labels[language as keyof typeof labels]??labels["zh-CN"];
 const [chosen,choose]=useState<TagPackLanguage>(()=>tagPackLanguage(language)??"zh-CN");
 const [state,setState]=useState<TagPackStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{let active=true;void window.naiDesktop.multilingualTagStatus?.().then(s=>{if(active){setState(s);if(s.active)choose(s.active);}}).catch(()=>{});return()=>{active=false;};},[]);
 async function apply(action:"download"|"use"){
  setBusy(true);setError(false);
  try{
   setState(await window.naiDesktop.installMultilingualTagPack(chosen,action));
   onChanged?.();
   window.dispatchEvent(new Event("langbai:multilingual-tags-changed"));
  }catch{setError(true);}finally{setBusy(false);}
 }
 return <section className="settings-form"><label className="field">{l[0]}
  <select value={chosen} disabled={busy} onChange={e=>choose(e.target.value as TagPackLanguage)}>{TAG_PACK_LANGUAGES.map(x=><option key={x} value={x}>{TAG_PACK_NAMES[x]}</option>)}</select></label>
  <p className="field-hint">{l[1]}: {TAG_PACK_MANIFEST.updatedAt} · {TAG_PACK_MANIFEST.packs[chosen].count.toLocaleString()} · {(TAG_PACK_MANIFEST.packs[chosen].size/1024**2).toFixed(1)} MiB</p>
  <p role="status">{l[2]}: {state?.active?TAG_PACK_NAMES[state.active]:l[3]}</p>
  <div className="row-actions"><Button disabled={busy} onClick={()=>void apply(state?.installed.includes(chosen)?"use":"download")}>{busy?l[7]:state?.installed.includes(chosen)?l[6]:l[4]}</Button>
  </div>{error&&<p role="alert">{l[8]}</p>}
 </section>;
}

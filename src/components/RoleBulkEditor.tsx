import {useId,useLayoutEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Icon} from "./icons";
import {Button,SelectMenu} from "./ui";
import {useAppStore} from "../store";
import {bulkAiInstructions,formatBulkRoles,mergeBulkRoles,parseBulkRoles,makeBulkPreset} from "../role-bulk";

import type {CharCaption,CharCaptionItem} from "../types";
import "./role-bulk.css";

const translations:Record<string,string[]> = {
 "zh-CN":["批量填充","复制 AI 生成指令","读取当前角色","复制 AI 修改指令","粘贴 AI 返回的 JSON 或按角色分段的文本。先预览，再按顺序填充；同位置角色的坐标和启用状态不变。","导入文件","规范化为 JSON","填充角色","角色组合预设","选择已保存的组合","组合名称","保存组合","已复制","角色","将移除末尾角色：","确认移除","当前模型最多支持","格式无效，请检查字段、角色编号或文本长度。","已填充","已保存","负面","未填写时保留原负面词","将在确认时替换相同位置的提示词。","关闭","新建描述或修改要求（可选）"],
 "zh-TW":["批次填入","複製 AI 生成指令","讀取目前角色","複製 AI 修改指令","貼上 AI 回傳的 JSON 或角色段落，先預覽再依序填入；保留原位置與啟用狀態。","匯入檔案","轉為標準 JSON","填入角色","角色組合預設","選擇已儲存的組合","組合名稱","儲存組合","已複製","角色","將移除末尾角色：","確認移除","目前模型上限","格式無效，請檢查欄位、角色編號或文字長度。","已填入","已儲存","負面","未填寫時保留原負面詞","確認時替換相同位置的提示詞。","關閉","描述或修改要求（選填）"],
 "en-US":["Bulk fill","Copy AI creation prompt","Read current characters","Copy AI revision prompt","Paste AI JSON or character blocks. Preview before applying in slot order; existing positions and enabled states stay intact.","Import file","Normalize to JSON","Apply characters","Character group presets","Choose a saved group","Group name","Save group","Copied","Characters","Trailing slots to remove:","Confirm removal","Model limit:","Invalid input. Check fields, numbering and text length.","Applied","Saved","Negative","Omitted: keep existing negative","Applying replaces prompt text in matching slots.","Close","Description or revision request (optional)"],
 "ja-JP":["一括入力","AI 作成指示をコピー","現在のキャラを読む","AI 修正指示をコピー","JSON またはキャラ別の文章を貼り付け、確認してから順番に反映します。位置と有効状態は保持します。","ファイル読込","JSON に整形","キャラに反映","キャラセット","保存済みセットを選択","セット名","セットを保存","コピー済み","キャラ","削除する末尾の枠：","削除を確認","モデルの上限：","書式・番号・文字数を確認してください。","反映済み","保存済み","ネガティブ","未指定：元の値を保持","同じ枠のプロンプトを置き換えます。","閉じる","説明または修正指示（任意）"],
 "ko-KR":["일괄 입력","AI 생성 지시 복사","현재 캐릭터 읽기","AI 수정 지시 복사","JSON 또는 캐릭터별 텍스트를 붙여 넣고 미리 본 뒤 순서대로 적용합니다. 위치와 활성 상태는 유지됩니다.","파일 가져오기","JSON으로 정리","캐릭터 적용","캐릭터 그룹 프리셋","저장된 그룹 선택","그룹 이름","그룹 저장","복사됨","캐릭터","삭제할 마지막 슬롯:","삭제 확인","모델 제한:","필드, 번호, 텍스트 길이를 확인하세요.","적용됨","저장됨","부정","생략하면 기존 부정 프롬프트 유지","같은 슬롯의 프롬프트가 교체됩니다.","닫기","설명 또는 수정 요청 (선택)"]
};
const keys = 'title generate read revise hint file normalize apply presets select name save copied characters remove confirm limit error applied saved negative omitted replace collapse brief'.split(' ');
function bulkLabels(lang:string){const words=translations[lang]??translations['en-US'];return Object.fromEntries(keys.map((key,i)=>[key,words[i]])) as Record<string,string>;}
const draftKey="langbai-role-bulk-filler-draft";
export function RoleBulkEditor({current,limit,apply}:{current:CharCaption[];limit:number;apply:(rows:CharCaptionItem[])=>void}){
 const settings=useAppStore(s=>s.settings),refresh=useAppStore(s=>s.refreshSettings);
 const t=bulkLabels(settings?.language??"zh-CN");
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(()=>{try{return localStorage.getItem(draftKey)??""}catch{return ""}});
 const [brief,setBrief]=useState(""),[name,setName]=useState(""),[msg,setMsg]=useState(""),[okDelete,setOkDelete]=useState(false),[busy,setBusy]=useState(false);
 const file=useRef<HTMLInputElement>(null),dialog=useRef<HTMLDialogElement>(null),launcher=useRef<HTMLElement>(null);
 const titleId=useId(),dialogId=useId();
 const dismiss=()=>{dialog.current?.close();setOkDelete(false);setMsg("");setOpen(false);launcher.current?.querySelector("button")?.focus({preventScroll:true});};
 useLayoutEffect(()=>{
   if(!open||!dialog.current)return;
   const el=dialog.current;
   el.showModal(); // Browser owns background inertness and restores the opener's focus on close.
   return ()=>el.close();
 },[open]);
 const result=useMemo(()=>{try{return {rows:parseBulkRoles(draft,limit),error:""}}catch(e){return {rows:null,error:(e as Error).message}}},[draft,limit]);
 const rows=result.rows;const extra=rows?Math.max(0,current.length-rows.length):0;
 const presets=(settings?.positivePromptPresets??[]).filter(p=>p.captions?.length);
 const edit=(s:string)=>{setDraft(s);setOkDelete(false);setMsg("");try{localStorage.setItem(draftKey,s)}catch{/* session draft still available */}};
 async function copy(revise:boolean){try{await navigator.clipboard.writeText(bulkAiInstructions(limit,brief,revise?(rows??current):undefined));setMsg(t.copied);}catch(e){setMsg(String(e));}}
 async function save(){if(!rows||!name.trim()||busy)return;setBusy(true);try{
   const all=(await window.naiDesktop.getSettings()).positivePromptPresets??[];
   const preset=makeBulkPreset(all,name,rows);
   await window.naiDesktop.setSetting("positivePromptPresets",[...all,preset]);
   await refresh();setName("");setMsg(t.saved+": "+preset.name);
 }catch(e){setMsg(String(e))}finally{setBusy(false)}}
 return <section ref={launcher} className="role-bulk-launcher" aria-label={t.title}>
 <Button aria-haspopup="dialog" aria-expanded={open} aria-controls={open?dialogId:undefined} disabled={!limit} onClick={()=>setOpen(true)}>{t.title}</Button>
 {open&&createPortal(<dialog ref={dialog} id={dialogId} data-studio-portal className="modal role-bulk role-bulk-dialog" aria-modal="true" aria-labelledby={titleId}
   onCancel={e=>{e.preventDefault();dismiss();}}
   onKeyDown={e=>{
     if(e.key==="Tab") e.stopPropagation(); // Do not let the parent dialog run its own focus trap.
     if(e.key==="Escape" && !e.defaultPrevented && !e.nativeEvent.isComposing){e.preventDefault();e.stopPropagation();dismiss();}
   }}>
 <header><h2 id={titleId}>{t.title}</h2><button type="button" aria-label={t.collapse} onClick={dismiss}><Icon name="close"/></button></header>
 <div className="role-bulk-panel role-bulk-scroll">
 <p>{t.hint}</p><label className="field"><span>{t.brief}</span><input value={brief} maxLength={5000} onChange={e=>setBrief(e.target.value)}/></label>
 <div className="role-bulk-actions"><Button onClick={()=>void copy(false)}>{t.generate}</Button><Button disabled={!current.length} onClick={()=>edit(formatBulkRoles(current))}>{t.read}</Button><Button disabled={draft.trim() ? !rows?.length : !current.length} onClick={()=>void copy(true)}>{t.revise}</Button></div>
 <label className="field"><span>{t.title} · JSON / TXT</span><textarea rows={6} spellCheck={false} value={draft} onChange={e=>edit(e.target.value)} placeholder={'【角色1】silver hair\n负面1：hat'}/></label>
 <div className="role-bulk-actions"><input hidden type="file" ref={file} accept=".txt,.json,text/plain,application/json" onChange={async e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value="";if(!f)return;try{if(f.size>512000)throw Error(t.error);edit(await f.text());}catch(err){setMsg(String(err));}}}/><Button onClick={()=>file.current?.click()}>{t.file}</Button><Button disabled={!rows} onClick={()=>rows&&edit(formatBulkRoles(rows))}>{t.normalize}</Button></div>
 {draft.trim()&&!rows&&<p role="alert">{result.error==="limit"?t.limit+" "+limit:t.error}</p>}
 {rows&&<><strong>{t.characters} · {rows.length}/{limit}</strong><ol className="role-bulk-preview">{rows.map((r,i)=><li key={i}>{r.name&&<b>{r.name} · </b>}{r.prompt||"—"}<small>{t.negative}: {r.negativePrompt??t.omitted}</small></li>)}</ol>
 <small>{t.replace}</small>{extra>0&&<label><input type="checkbox" checked={okDelete} onChange={e=>setOkDelete(e.target.checked)}/> {t.remove}{extra} · {t.confirm}</label>}
 </>}
 <details><summary>{t.presets}</summary><div className="role-bulk-panel">
 <SelectMenu ariaLabel={t.select} value="" options={[{value:"",label:t.select},...presets.map(p=>({value:p.id,label:p.name}))]} onChange={id=>{const p=presets.find(p=>p.id===id);if(p?.captions)edit(formatBulkRoles(p.captions));}}/>
 <label className="field"><span>{t.name}</span><input value={name} maxLength={120} onChange={e=>setName(e.target.value)}/></label><Button disabled={busy||!rows||!name.trim()} onClick={()=>void save()}>{t.save}</Button>
 </div></details></div>
 <footer><small role="status" aria-live="polite">{msg}</small><Button variant="primary" disabled={!rows||(extra>0&&!okDelete)} onClick={()=>{if(!rows||(extra>0&&!okDelete))return;apply(mergeBulkRoles(rows,current));dismiss();}}>{t.apply}</Button></footer>
 </dialog>,document.body)}</section>;
}

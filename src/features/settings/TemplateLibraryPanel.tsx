import {useEffect, useRef, useState} from 'react';
import {Button, SelectMenuCompat} from '../../components/ui';
import {confirmAction} from '../../components/confirm';
import {getBuiltinTemplates, parseTemplateImport, resolveTemplateSlot, type TemplateLibraryState, type TemplateLibraryMutation, type TemplateSlot, type TemplateRef, type TemplateImportEntry} from '../../../shared/template-library';
import type {AppSettings} from '../../types';
import './template-library.css';

const COPY = {
 'zh-CN': ['提示词模板库','图片模板 · 6 套','漫画模板 · 2 套','反推','文字转换','纯 Tag','自然语言','混合','日式整页','单分镜','内置原稿只读；修改时另存为自定义副本。旧版与已有自定义不会被覆盖。','查看的模板','内置','自定义','使用此模板','恢复默认','另存为自定义','名称','保存修改','导入模板','选择 TXT / MD / JSON','导入预览','导入并保存','导入后立即选用','取消','已选用','导入不会覆盖已有模板。图片选用后会启用 V5 Full / 3.0.0。','当前生效','页数口径：两种漫画均为一行一页；单分镜是一张单格图算一页。','读取中…','重新读取','旧版模板与提示词助手','生成目标','图片提示词','漫画提示词','保存成功','尚未读取模板库，请稍候。','删除自定义','删除这份自定义模板？当前选用将恢复内置，其他模板不变。','编辑正文','字','图片技能 3.0.0；漫画显示原稿版本，不混用图片三模式。','文件为空或超过 2 MiB。','导入目标','无自定义模板','已保存；旧版设置保留。','当前图片使用旧版；点击“使用此模板”启用 3.0.0。'],
 'zh-TW': ['提示詞範本庫','圖片範本 · 6 套','漫畫範本 · 2 套','反推','文字轉換','純 Tag','自然語言','混合','日式整頁','單分鏡','內建原稿唯讀；修改時另存自訂副本。舊版與既有自訂不會被覆蓋。','檢視的範本','內建','自訂','使用此範本','恢復預設','另存為自訂','名稱','儲存修改','匯入範本','選擇 TXT / MD / JSON','匯入預覽','匯入並儲存','匯入後立即選用','取消','已選用','匯入不會覆蓋既有範本。圖片選用後會啟用 V5 Full / 3.0.0。','目前生效','頁數口徑：兩種漫畫皆一行一頁；單分鏡的一張單格圖算一頁。','讀取中…','重新讀取','舊版範本與提示詞助手','生成目標','圖片提示詞','漫畫提示詞','儲存成功','範本庫尚在讀取，請稍候。','刪除自訂','刪除此自訂範本？目前選用將恢復內建，其他範本不變。','編輯正文','字','圖片技能 3.0.0；漫畫顯示原稿版本，不混用圖片三模式。','檔案為空或超過 2 MiB。','匯入目標','無自訂範本','已儲存；舊版設定保留。','目前圖片使用舊版；點擊「使用此範本」啟用 3.0.0。'],
 'en-US': ['Prompt template library','Image templates · 6','Comic templates · 2','Reverse','Text conversion','Tags','Natural language','Mixed','Japanese full page','Single panel','Built-ins are read-only. Save a custom copy to edit; older versions and custom templates are preserved.','Preview template','Built-in','Custom','Use this template','Restore default','Save a custom copy','Name','Save changes','Import templates','Choose TXT / MD / JSON','Import preview','Import and save','Use after importing','Cancel','Selected','Imports never overwrite records. Selecting an image template enables V5 Full / 3.0.0.','Currently active','Both formats count pages: one line per page; one single-panel image also counts as one page.','Loading…','Reload','Older templates and prompt assistant','Output target','Image prompt','Comic prompt','Saved','Please wait for the library to load.','Delete custom','Delete this custom template? Its active slot returns to the built-in; other templates are unchanged.','Template body','characters','Image skill 3.0.0; comics retain original versions and do not use the three image modes.','The file is empty or exceeds 2 MiB.','Import destination','No custom templates','Saved; older settings retained.','This image task uses an older edition; choose Use this template to enable 3.0.0.'],
 'ja-JP': ['プロンプトテンプレート','画像テンプレート · 6','漫画テンプレート · 2','画像解析','文章変換','タグ','自然言語','混合','日本式の全ページ','単一コマ','内蔵原稿は読み取り専用です。編集はカスタムコピーに保存し、旧版と既存設定を保持します。','プレビュー','内蔵','カスタム','このテンプレートを使用','既定に戻す','カスタムコピーを保存','名前','変更を保存','テンプレートを読み込む','TXT / MD / JSON を選択','読み込みプレビュー','読み込んで保存','読み込み後に使用','キャンセル','選択中','既存テンプレートを上書きしません。画像を選択すると V5 Full / 3.0.0 を使用します。','使用中','両形式とも1行1ページです。単一コマ画像1枚も1ページとして数えます。','読み込み中…','再読み込み','旧版とプロンプト助手','出力対象','画像プロンプト','漫画プロンプト','保存しました','読み込み完了をお待ちください。','カスタムを削除','削除しますか？選択中のスロットは内蔵に戻り、他は変更しません。','本文','文字','画像スキルは3.0.0、漫画は原稿版を保持し、画像の3モードは使用しません。','空のファイル、または2 MiBを超えています。','読み込み先','カスタムなし','保存しました。旧版設定は保持されています。','画像は旧版を使用中です。「使用」で3.0.0を有効にします。'],
 'ko-KR': ['프롬프트 템플릿 라이브러리','이미지 템플릿 · 6개','만화 템플릿 · 2개','이미지 분석','텍스트 변환','태그','자연어','혼합','일본식 전체 페이지','단일 컷','기본 원문은 읽기 전용입니다. 수정하려면 사용자 사본을 저장하며 기존 설정은 유지됩니다.','미리 보기','기본','사용자','이 템플릿 사용','기본값 복원','사용자 사본 저장','이름','변경 저장','템플릿 가져오기','TXT / MD / JSON 선택','가져오기 미리 보기','가져와 저장','가져온 후 사용','취소','선택됨','기존 템플릿을 덮어쓰지 않습니다. 이미지 선택 시 V5 Full / 3.0.0을 사용합니다.','현재 사용','두 형식 모두 한 줄당 한 페이지입니다. 단일 컷 이미지 한 장도 한 페이지입니다.','불러오는 중…','새로 읽기','이전 템플릿 및 프롬프트 도우미','출력 대상','이미지 프롬프트','만화 프롬프트','저장됨','라이브러리가 로드될 때까지 기다려 주세요.','사용자 템플릿 삭제','삭제할까요? 사용 중인 슬롯은 기본으로 복원되며 다른 템플릿은 유지됩니다.','템플릿 본문','자','이미지 스킬은 3.0.0이며 만화 원본 버전을 유지하고 이미지 3모드를 섞지 않습니다.','파일이 비어 있거나 2 MiB를 초과합니다.','가져올 위치','사용자 템플릿 없음','저장했으며 이전 설정은 유지됩니다.','이 이미지 작업은 이전 버전입니다. 사용 버튼으로 3.0.0을 선택하세요.'],
} as const;
export function templateLibraryCopy(language:unknown) {return COPY[language as keyof typeof COPY] ?? COPY['zh-CN'];}
const IMAGE_SLOTS:TemplateSlot[]=['image.reverse.tags','image.reverse.natural','image.reverse.mixed','image.convert.tags','image.convert.natural','image.convert.mixed'];
const COMIC_SLOTS:TemplateSlot[]=['comic.jp-page','comic.single-panel'];
export function templateSlotLabel(slot:TemplateSlot,language:unknown) {
 const t=templateLibraryCopy(language);if(slot==='comic.jp-page')return t[8];if(slot==='comic.single-panel')return t[9];
 const [,task,mode]=slot.split('.');return `${task==='reverse'?t[3]:t[4]} · ${mode==='tags'?t[5]:mode==='natural'?t[6]:t[7]}`;
}
const refValue=(ref:TemplateRef)=>`${ref.kind}:${ref.id}`;
const EXTRA = {
 'zh-CN':['导出自定义 JSON','已导出自定义模板；请妥善保管此文件。','模板已保存，但启用或同步失败。请重新读取后点“使用此模板”，不要重复导入。','请先保存修改，再选用这份模板。'],
 'zh-TW':['匯出自訂 JSON','已匯出自訂範本，請妥善保存。','範本已儲存，但啟用或同步失敗。請重新讀取後選用，不要重複匯入。','請先儲存修改再選用。'],
 'en-US':['Export custom JSON','Custom templates exported. Keep this file safe.','Templates were saved, but activation or synchronization failed. Reload and select the template; do not import it again.','Save your changes before selecting this template.'],
 'ja-JP':['カスタム JSON を書き出す','カスタムを書き出しました。ファイルを保管してください。','保存済みですが有効化・同期に失敗しました。再読み込みして選択してください。再度読み込まないでください。','選択する前に変更を保存してください。'],
 'ko-KR':['사용자 JSON 내보내기','사용자 템플릿을 내보냈습니다. 파일을 보관하세요.','저장했지만 활성화 또는 동기화에 실패했습니다. 다시 불러와 선택하세요. 중복 가져오기를 하지 마세요.','변경 사항을 저장한 뒤 선택하세요.'],
} as const;
export function TemplateLibraryPanel({settings,onSettingsChanged}:{settings:AppSettings;onSettingsChanged:()=>Promise<void>}) {
 const t=templateLibraryCopy(settings.language),fileRef=useRef<HTMLInputElement>(null);
 const extra=EXTRA[settings.language as keyof typeof EXTRA]??EXTRA['zh-CN'];
 const [library,setLibrary]=useState<TemplateLibraryState>(()=>({revision:'',custom:[],selection:{},builtins:getBuiltinTemplates(),warnings:[]}));
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [family,setFamily]=useState<'image'|'comic'>('image'),[slot,setSlot]=useState<TemplateSlot>('image.reverse.tags');
 const [preview,setPreview]=useState<TemplateRef|null>(null),[drafts,setDrafts]=useState<Record<string,{name:string;body:string}>>({});
 const [copyName,setCopyName]=useState(''),[imports,setImports]=useState<TemplateImportEntry[]>([]),[importWarnings,setImportWarnings]=useState<string[]>([]),[activateImport,setActivateImport]=useState(true);
 const effective=resolveTemplateSlot(slot,library),viewRef=preview??effective.ref;
 const custom=viewRef.kind==='custom'?library.custom.find(row=>row.id===viewRef.id&&row.slot===slot):undefined;
 const builtin=library.builtins.find(row=>row.slot===slot);
 const display=custom??builtin,body=custom?(drafts[custom.id]?.body??custom.body):(display?.body??'');
 const name=custom?(drafts[custom.id]?.name??custom.name):copyName;
 const hasUnsaved=Boolean(custom&&(body!==custom.body||name!==custom.name));
 const slots=family==='image'?IMAGE_SLOTS:COMIC_SLOTS;
 const task=slot.startsWith('image.reverse.')?'reverse':'convert';
 const oldEdition=slot.startsWith('image.')&&settings[task==='reverse'?'reversePromptSkillVersion':'convertPromptSkillVersion']!=='3.0.0';
 async function load() {setBusy(true);setError('');try{setLibrary(await window.naiDesktop.templateLibraryGet());setLoaded(true);}catch(e){setError(String(e));}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 async function enableImageVersion(chosenSlot:TemplateSlot) {
  if(!chosenSlot.startsWith('image.'))return;
  const kind=chosenSlot.startsWith('image.reverse.')?'reverse':'convert';
  await window.naiDesktop.setSetting(kind==='reverse'?'reversePromptTemplateVersion':'convertPromptTemplateVersion','v5');
  await window.naiDesktop.setSetting(kind==='reverse'?'reversePromptSkillVersion':'convertPromptSkillVersion','3.0.0');
 }
 async function mutate(request:Omit<TemplateLibraryMutation,'expectedRevision'>|Record<string,unknown>,enableSlot?:TemplateSlot|TemplateSlot[]) {
  if(!loaded){setError(t[36]);return false;}setBusy(true);setError('');setNotice('');
  let committed=false;
  try{
   const result=await window.naiDesktop.templateLibraryMutate({...request,expectedRevision:library.revision} as TemplateLibraryMutation);
   if(!result.ok){if(result.state)setLibrary(result.state);setError(result.message);return false;}
   committed=true;setLibrary(result.state);if(enableSlot){for(const key of Array.isArray(enableSlot)?enableSlot:[enableSlot])await enableImageVersion(key);}await onSettingsChanged();
   window.dispatchEvent(new Event('langbai:template-library-changed'));setNotice(t[35]);return true;
  }catch(e){setError((committed?extra[2]+'\n':'')+String(e));return committed;}finally{setBusy(false);}
 }
 function selectSlot(next:TemplateSlot){setSlot(next);setPreview(null);setCopyName('');setError('');setNotice('');setImports([]);}
 async function readFile(file?:File) {
  if(!file)return;setError('');setNotice('');
  try{if(!file.size||file.size>2*1024*1024)throw Error(t[42]);const parsed=parseTemplateImport(await file.text(),file.name,slot);setImports(parsed.entries);setImportWarnings(parsed.warnings);}catch(e){setError(String(e));}
 }
 function updateDraft(patch:Partial<{name:string;body:string}>){if(custom)setDrafts(old=>({...old,[custom.id]:{...(old[custom.id]??{name:custom.name,body:custom.body}),...patch}}));}
 function exportCustom(){
  const data={schema:'langbai.prompt-template-export/1',templates:library.custom.map(row=>({slot:row.slot,name:row.name,body:row.body}))};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'})),anchor=document.createElement('a');
  anchor.href=url;anchor.download='langbai-custom-prompt-templates.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setNotice(extra[1]);
 }
 async function importAll(){
  if(await mutate({action:'import',entries:imports,activate:activateImport},activateImport?[...new Set(imports.map(row=>row.slot))]:undefined)){setImports([]);setPreview(null);}
 }
 return <section className="template-library" aria-label={t[0]}>
  <header className="template-library__header"><div><h3>{t[0]}</h3><p>{t[41]}</p></div><div className="template-library__actions"><Button disabled={busy||!loaded||!library.custom.length} onClick={exportCustom}>{extra[0]}</Button><Button disabled={busy} onClick={()=>void load()}>{busy?t[29]:t[30]}</Button></div></header>
  <div className="template-library__families" role="group" aria-label={t[0]}>{(['image','comic'] as const).map((kind,i)=><button type="button" key={kind} aria-pressed={family===kind} onClick={()=>{setFamily(kind);selectSlot(kind==='image'?IMAGE_SLOTS[0]:COMIC_SLOTS[0]);}}>{t[i+1]}</button>)}</div>
  <p className="template-library__hint">{t[10]} {family==='comic'?t[28]:''}</p>
  <div className="template-library__layout">
   <nav className="template-library__slots" aria-label={t[43]}>{slots.map(key=><button type="button" key={key} aria-current={slot===key?'true':undefined} onClick={()=>selectSlot(key)}><strong>{templateSlotLabel(key,settings.language)}</strong><small>{key.startsWith('image.')?'3.0.0':key==='comic.jp-page'?'v4.1':'v1.0'}</small></button>)}</nav>
   <div className="template-library__detail">
    <h4>{templateSlotLabel(slot,settings.language)}</h4>
    <p className="template-library__active">{t[27]}：{effective.name}{oldEdition?` · ${t[46]}`:''}</p>
    <label className="field"><span>{t[11]}</span><SelectMenuCompat disabled={busy} value={refValue(viewRef)} onChange={e=>{const [kind,...ids]=e.target.value.split(':');setPreview({kind:kind as 'builtin'|'custom',id:ids.join(':')});setCopyName('');}}>
     {builtin&&<option value={refValue({kind:'builtin',id:builtin.id})}>{t[12]} · {templateSlotLabel(slot,settings.language)}</option>}
     {library.custom.filter(row=>row.slot===slot).map(row=><option key={row.id} value={refValue({kind:'custom',id:row.id})}>{t[13]} · {row.name}</option>)}
    </SelectMenuCompat></label>
    <label className="field"><span>{t[39]} · {body.length.toLocaleString()} {t[40]}</span><textarea className="template-library__body" aria-label={t[39]} spellCheck={false} readOnly={!custom||busy} value={body} onChange={e=>updateDraft({body:e.target.value})}/></label>
    <label className="field"><span>{t[17]}</span><input maxLength={60} value={name} onChange={e=>custom?updateDraft({name:e.target.value}):setCopyName(e.target.value)} placeholder={templateSlotLabel(slot,settings.language)}/></label>
    <div className="template-library__actions">
     <Button variant="primary" disabled={busy||!loaded||library.readOnly||hasUnsaved} title={hasUnsaved?extra[3]:undefined} onClick={()=>void mutate({action:'select',slot,ref:viewRef},slot)}>{t[14]}</Button>
     {custom?<Button disabled={busy||!name.trim()||!body.trim()||library.readOnly} onClick={()=>void mutate({action:'update',id:custom.id,name,body})}>{t[18]}</Button>:<Button disabled={busy||!loaded||!name.trim()||library.readOnly} onClick={()=>void mutate({action:'create',slot,name:copyName,body,fromBuiltinId:builtin?.id}).then(ok=>{if(ok){setCopyName('');setPreview(null);}})}>{t[16]}</Button>}
     <Button disabled={busy||!loaded||library.readOnly} onClick={()=>void mutate({action:'reset',slot}).then(ok=>{if(ok)setPreview(null);})}>{t[15]}</Button>
     {custom&&<Button disabled={busy||library.readOnly} onClick={()=>void (async()=>{if(await confirmAction(t[38]))if(await mutate({action:'remove',id:custom.id}))setPreview(null);})()}>{t[37]}</Button>}
    </div>
    <div className="template-library__import"><strong>{t[19]}</strong><p>{t[26]}</p><input ref={fileRef} hidden type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" onChange={e=>{void readFile(e.target.files?.[0]);e.target.value='';}}/><Button disabled={busy||!loaded||library.readOnly} onClick={()=>fileRef.current?.click()}>{t[20]}</Button></div>
    {!!imports.length&&<section className="template-library__preview" aria-label={t[21]}><h4>{t[21]} · {imports.length}</h4><ul>{imports.map((row,i)=><li key={i}>{row.name} · {templateSlotLabel(row.slot,settings.language)} · {row.body.length} {t[40]}</li>)}</ul>{importWarnings.map((w,i)=><p key={i}>{w}</p>)}<label className="checkbox-line"><input type="checkbox" checked={activateImport} onChange={e=>setActivateImport(e.target.checked)}/>{t[23]}</label><div className="template-library__actions"><Button variant="primary" disabled={busy} onClick={()=>void importAll()}>{t[22]}</Button><Button disabled={busy} onClick={()=>setImports([])}>{t[24]}</Button></div></section>}
   </div>
  </div>
  {library.warnings.map((w,i)=><p role="status" key={i}>{w}</p>)}
  {error&&<p role="alert" className="status-box error">{error}</p>}<p role="status" aria-live="polite">{notice}</p>
 </section>;
}

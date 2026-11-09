import {Fragment,useId,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {Button} from './ui';
import {CompactIconButton} from './CompactPromptControls';
import {PromptToolsPopover} from './PromptToolsPopover';
import {PromptWeightPanel} from './PromptWeightPanel';
import {Icon} from './icons';
import {getGeneratePanelText} from '../i18n';
import {promptEditorText} from '../prompt-editor-text';
import {movePromptTool,normalizePromptToolLayout,readGlobalPromptToolLayout,replacePromptTool,PROMPT_MAIN_TOOL_LIMIT,promptToolZones,type PromptToolLayout,type PromptToolZone} from '../prompt-toolbar-layout';
import './prompt-toolbar-arrangement.css';

export type PromptToolbarScope = 'positive' | 'negative' | 'character-positive' | 'character-negative';
export type PromptToolbarAction = {id: string; label: string; control: ReactNode};
export const promptAction = (id: string, label: string, control: ReactNode): PromptToolbarAction => ({id, label, control});
const KEY = 'studio.prompt-toolbar-layout.v2.global';
const LEGACY_KEY = 'studio.prompt-toolbar-layout.v1.';
const CHANGE = 'studio:prompt-toolbar-layout';
const volatile = new Map<string,string>();
function subscribe(callback:()=>void) {
  window.addEventListener(CHANGE,callback);
  window.addEventListener('storage',callback);
  return () => {window.removeEventListener(CHANGE,callback);window.removeEventListener('storage',callback);};
}
function getRaw(key: string) {
  if (volatile.has(key)) return volatile.get(key) ?? '';
  try {return window.localStorage.getItem(key) ?? '';} catch {return '';}
}
function save(key: string, layout: PromptToolLayout) {
  const raw=JSON.stringify(layout);
  try {window.localStorage.setItem(key,raw);volatile.delete(key);} catch {volatile.set(key,raw);}
  window.dispatchEvent(new Event(CHANGE));
}
const copy = {
  'zh-CN': ['自定义工具栏','主工具栏','更多菜单','拖动调整顺序，也可使用按钮移动。撤回和重做固定在最左侧。','上移','下移','移到','恢复默认','取消','保存'],
  'zh-TW': ['自訂工具列','主工具列','更多選單','拖曳調整順序，也可使用按鈕移動。復原和重做固定在最左側。','上移','下移','移至','還原預設','取消','儲存'],
  'en-US': ['Customize toolbar','Main toolbar','More menu','Drag to reorder, or use the move buttons. Undo and redo stay at the far left.','Move up','Move down','Move to','Restore defaults','Cancel','Save'],
  'ja-JP': ['ツールバーをカスタマイズ','メインツールバー','その他のメニュー','ドラッグまたはボタンで並べ替えます。元に戻す／やり直すは左端に固定されます。','上へ','下へ','移動先','初期設定に戻す','キャンセル','保存'],
  'ko-KR': ['도구 모음 사용자 설정','기본 도구 모음','더 보기 메뉴','끌거나 버튼을 눌러 순서를 바꿉니다. 실행 취소와 다시 실행은 왼쪽에 고정됩니다.','위로','아래로','이동 대상','기본값 복원','취소','저장'],
} as const;

const capacityCopy = {
  'zh-CN': ['布局全局共用。主栏满时，把更多菜单中的工具拖到要替换的工具上，或点击「替换」。','替换','选择主栏中要换出的工具：','换出','仅在支持此工具的编辑器中显示'],
  'zh-TW': ['版面全域共用。主列已滿時，把更多選單的工具拖到要替換的工具上，或點選「替換」。','替換','選擇主列中要換出的工具：','換出','僅在支援此工具的編輯器中顯示'],
  'en-US': ['All editors share this layout. When full, drop a tool onto a main toolbar tool or choose Swap.','Swap','Choose a main toolbar tool to swap out:','Swap out','Shown only in supported editors'],
  'ja-JP': ['配置はすべてのエディターで共通です。満杯のときは入れ替えるツールにドロップするか「入れ替え」を選んでください。','入れ替え','外すメインツールを選択：','外す','対応するエディターのみ表示'],
  'ko-KR': ['모든 편집기가 배치를 공유합니다. 꽉 차면 교체할 도구 위에 놓거나 교체를 누르세요.','교체','기본 도구 모음에서 교체할 도구 선택:','교체 대상','지원하는 편집기에서만 표시'],
} as const;

const extraNames = {
  'zh-CN': ['正面预设','负面词库','自定义提词'],
  'zh-TW': ['正面預設','負面詞庫','自訂提詞'],
  'en-US': ['Prompt presets','Negative prompt library','Custom chunks'],
  'ja-JP': ['正面プリセット','ネガティブプロンプトライブラリ','カスタム提詞'],
  'ko-KR': ['긍정 프리셋','네거티브 프롬프트 라이브러리','사용자 구문'],
} as const;
export function promptToolExtraLabel(language:unknown,id:'presets'|'negative-library'|'chunks') {
  return (extraNames[language as keyof typeof extraNames]??extraNames['zh-CN'])[['presets','negative-library','chunks'].indexOf(id)];
}

export function PromptToolbarArrangement({scope,language,label,toolbarLabel=label,fixed,bar,overflow,open,onOpenChange,inDialog=false}:{
  scope:PromptToolbarScope; language:unknown; label:string; toolbarLabel?:string; fixed:ReactNode;
  bar:PromptToolbarAction[]; overflow:PromptToolbarAction[]; open:boolean; onOpenChange:(open:boolean)=>void; inDialog?:boolean;
}) {
  const raw=useSyncExternalStore(subscribe,()=>getRaw(KEY),()=>'');
  const [draft,setDraft]=useState<PromptToolLayout|null>(null),[dropZone,setDropZone]=useState<PromptToolZone|null>(null);
  const [replacement,setReplacement]=useState<string|null>(null);
  const hintId=useId(), drag=useRef<string|null>(null),row=useRef<HTMLDivElement>(null);
  const locale=language as keyof typeof copy;
  const labels=copy[locale]??copy['zh-CN'], capacity=capacityCopy[locale]??capacityCopy['zh-CN'];
  const promptText=getGeneratePanelText(language).prompt, editorText=promptEditorText(language);
  const fallbackNames: Record<string,string> = {
    optimize:editorText.optimize, custom:editorText.custom,
    presets:promptToolExtraLabel(language,'presets'),
    'negative-library':promptToolExtraLabel(language,'negative-library'),
    chunks:promptToolExtraLabel(language,'chunks'),
  };
  const actions=new Map([...bar,...overflow].map(item=>[item.id,item]));
  const actionName=(id:string)=>id==='restore'?promptText.restore:actions.get(id)?.label??fallbackNames[id]??id;
  const current=readGlobalPromptToolLayout(raw,scope=>getRaw(LEGACY_KEY+scope));
  const full=!!draft && draft.bar.length>=PROMPT_MAIN_TOOL_LIMIT;
  const zoneLabel=(zone:PromptToolZone)=>labels[zone==='bar'?1:2];
  const render=(zone:PromptToolZone)=>current[zone].map(id=><Fragment key={id}>{actions.get(id)?.control}</Fragment>);
  function openEditor(){onOpenChange(false);setReplacement(null);setDraft(current);}
  function closeEditor(){drag.current=null;setDropZone(null);setReplacement(null);setDraft(null);requestAnimationFrame(()=>row.current?.querySelector<HTMLButtonElement>('button:last-child')?.focus({preventScroll:true}));}
  function move(id:string,zone:PromptToolZone,index:number) {
    setReplacement(null);
    setDraft(value=>value?movePromptTool(value,id,zone,index):value);
  }
  function replace(incoming:string,outgoing:string) {
    setDraft(value=>value?replacePromptTool(value,incoming,outgoing):value);
    setReplacement(null);
    requestAnimationFrame(()=>document.getElementById(hintId)?.focus({preventScroll:true}));
  }
  function drop(zone:PromptToolZone,index:number,target?:string) {
    const id=drag.current;
    if(id && draft && full && zone==='bar' && draft.more.includes(id)) {
      if(target) replace(id,target);
    } else if(id) move(id,zone,index);
    drag.current=null;setDropZone(null);
  }
  return <>
    <div ref={row} className="prompt-toolbar-row compact-prompt-toolbar" role="toolbar" aria-label={toolbarLabel}>
      {fixed}{render('bar')}
      <PromptToolsPopover label={label} open={open} onOpenChange={onOpenChange} inDialog={inDialog}>
        {render('more')}
        <CompactIconButton label={labels[0]} icon="settings" aria-haspopup="dialog" onClick={openEditor}/>
      </PromptToolsPopover>
    </div>
    {draft && <PromptWeightPanel title={labels[0]} closeLabel={labels[8]} onClose={closeEditor}>
      <div className="prompt-arrange" data-scope={scope}>
        <p>{labels[3]} {capacity[0]}</p>
        <p id={hintId} tabIndex={-1} aria-live="polite">{replacement?capacity[2]+' '+actionName(replacement):''}</p>
        <div className="prompt-arrange-groups">
          {promptToolZones.map(zone=><section key={zone} aria-label={zoneLabel(zone)} data-prompt-zone={zone} data-drop={dropZone===zone}
            onDragOver={event=>{if(!drag.current)return;event.preventDefault();event.dataTransfer.dropEffect='move';setDropZone(zone);}}
            onDrop={event=>{if(!drag.current)return;event.preventDefault();drop(zone,draft[zone].length);}}>
            <h3>{zoneLabel(zone)} {zone==='bar' && <span>{draft.bar.length} / {PROMPT_MAIN_TOOL_LIMIT}</span>}</h3>
            <ol>{draft[zone].map((id,index)=>{
              const name=actionName(id), other=zone==='bar'?'more':'bar', canSwap=zone==='more' && full;
              return <li key={id} data-prompt-action={id} data-replace-source={replacement===id||undefined} draggable
                onDragStart={event=>{drag.current=id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);}}
                onDragEnd={()=>{drag.current=null;setDropZone(null);}}
                onDrop={event=>{if(!drag.current)return;event.preventDefault();event.stopPropagation();const rect=event.currentTarget.getBoundingClientRect();drop(zone,index+Number(event.clientY>=rect.top+rect.height/2),id);}}>
                <span><Icon name="sliders"/>{name}{!actions.has(id) && <small title={capacity[4]} aria-label={capacity[4]}>*</small>}</span>
                <div className="prompt-arrange-controls">
                  <CompactIconButton label={name+' · '+labels[4]} icon="chevronDown" className="prompt-arrange-up" disabled={index===0} onClick={()=>move(id,zone,index-1)}/>
                  <CompactIconButton label={name+' · '+labels[5]} icon="chevronDown" disabled={index===draft[zone].length-1} onClick={()=>move(id,zone,index+2)}/>
                  {zone==='bar' && replacement
                    ? <CompactIconButton label={capacity[3]+' · '+name} icon="swap" onClick={()=>replace(replacement,id)}/>
                    : canSwap
                      ? <CompactIconButton label={capacity[1]+' · '+name} icon="swap" aria-pressed={replacement===id} onClick={()=>setReplacement(value=>value===id?null:id)}/>
                      : <CompactIconButton label={name+' · '+labels[6]+' '+zoneLabel(other)} icon="swap" onClick={()=>move(id,other,draft[other].length)}/>}
                </div>
              </li>;
            })}</ol>
          </section>)}
        </div>
        <footer>
          <Button onClick={()=>{setReplacement(null);setDraft(normalizePromptToolLayout(null));}}>{labels[7]}</Button>
          <Button onClick={closeEditor}>{labels[8]}</Button>
          <Button variant="primary" onClick={()=>{save(KEY,draft);closeEditor();}}>{labels[9]}</Button>
        </footer>
      </div>
    </PromptWeightPanel>}
  </>;
}

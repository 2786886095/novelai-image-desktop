import {useState,type ReactNode} from 'react';
import {LuBookOpen,LuCheck,LuFileText,LuUserRound,LuImport,LuChevronDown} from 'react-icons/lu';
import type {AgentConversation,AgentWorkspaceData} from '../agent/types';
import {STUDIO_BUILTIN_PRESETS,STUDIO_LYRA_PRESET_ID,studioSessionOptions,type StudioConversationOptions} from '../agent/workspace-controls';
import {studioUxText} from '../agent/ux';

/** All resource types share one compact row; descriptive content is opt-in. */
function ResourceRow({name,icon,selected,disabled,onSelect,detailsLabel,multiple=false,children}:{name:string;icon:ReactNode;selected:boolean;disabled:boolean;onSelect:()=>void;detailsLabel:string;multiple?:boolean;children:ReactNode}){
 const [expanded,setExpanded]=useState(false);
 return <article className="pi-resource-item" role="listitem">
  <div className="pi-resource-row"><button className="pi-resource-select" disabled={disabled} role={multiple?'checkbox':undefined} aria-checked={multiple?selected:undefined} aria-pressed={multiple?undefined:selected} onClick={onSelect}>{icon}<span>{name}</span><LuCheck className={selected?'pi-resource-selected':'pi-resource-unselected'} aria-hidden/></button><button className="pi-resource-details-toggle" aria-label={`${detailsLabel}: ${name}`} title={detailsLabel} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}><LuChevronDown aria-hidden/></button></div>
  {expanded&&<div className="pi-resource-details">{children}</div>}
 </article>;
}
export function AgentResourcePanel({workspace,chat,language,disabled,onChange,onImport}:{workspace?:AgentWorkspaceData;chat?:AgentConversation;language:unknown;disabled:boolean;onChange:(patch:Partial<StudioConversationOptions>)=>void;onImport:(kind:'presets'|'worldbooks'|'characters')=>void}){
 const [tab,setTab]=useState<'presets'|'worldbooks'|'characters'>('presets');
 const t=(key:string)=>studioUxText(language,key),options=studioSessionOptions(chat);
 const customPresets=workspace?.samplerPresets.filter(preset=>preset.id!==STUDIO_LYRA_PRESET_ID)??[];
 return <aside id="pi-creative-resources" className="pi-resource-panel" aria-label={t('resources')}>
  <header><strong><LuBookOpen/>{t('resources')}</strong></header>
  <div className="pi-resource-tabs" role="tablist" aria-label={t('resources')}>{(['presets','worldbooks','characters'] as const).map(value=><button key={value} id={'pi-resource-tab-'+value} role="tab" aria-selected={tab===value} aria-controls={'pi-resource-'+value} onClick={()=>setTab(value)}>{value==='presets'?<LuFileText/>:value==='worldbooks'?<LuBookOpen/>:<LuUserRound/>}{t('resource_'+value)}</button>)}</div>
  <section className="pi-resource-body" role="tabpanel" id={'pi-resource-'+tab} aria-labelledby={'pi-resource-tab-'+tab}>
   <button className="pi-resource-import" disabled={disabled} onClick={()=>onImport(tab)}><LuImport/>{t('import_'+tab)}</button>
   <div className="pi-resource-list" role="list">
    {tab==='presets'&&<>{STUDIO_BUILTIN_PRESETS.map(preset=><ResourceRow key={preset.id} name={t(preset.name)} icon={<LuFileText/>} selected={options.presetId===preset.id} disabled={disabled} onSelect={()=>onChange({studioPresetId:preset.id})} detailsLabel={t('details')}><p>{t(preset.name+'Body')}</p><pre>{preset.body}</pre>{preset.id==='dsh-infinite-gen-4'&&<a href="https://github.com/Minglink/dsh-infinite-gen-4" onClick={event=>{event.preventDefault();void window.naiDesktop.openExternal('https://github.com/Minglink/dsh-infinite-gen-4')}}>Minglink · CC BY-NC-SA 4.0</a>}</ResourceRow>)}{customPresets.map(preset=><ResourceRow key={preset.id} name={preset.name} icon={<LuFileText/>} selected={options.presetId==='tavern:'+preset.id} disabled={disabled} onSelect={()=>onChange({studioPresetId:'tavern:'+preset.id})} detailsLabel={t('details')}><pre>{preset.systemPrompt}</pre>{preset.jailbreakPrompt&&<pre>{preset.jailbreakPrompt}</pre>}</ResourceRow>)}</>}
    {tab==='worldbooks'&&workspace?.lorebooks.map(book=><ResourceRow key={book.id} name={book.name} icon={<LuBookOpen/>} multiple selected={chat?.lorebookIds.includes(book.id)??false} disabled={disabled} onSelect={()=>onChange({lorebookIds:chat?.lorebookIds.includes(book.id)?chat.lorebookIds.filter(id=>id!==book.id):[...(chat?.lorebookIds??[]),book.id]})} detailsLabel={t('details')}><p>{book.description}</p>{book.entries.map(entry=><details key={entry.id}><summary>{entry.comment||entry.keys.join(', ')||t('worldEntry')}</summary><pre>{entry.content}</pre></details>)}</ResourceRow>)}
    {tab==='characters'&&workspace?.characters.map(card=><ResourceRow key={card.id} name={card.nickname||card.name} icon={card.avatarDataUrl?<img className="pi-resource-avatar" src={card.avatarDataUrl} alt=""/>:<LuUserRound/>} selected={chat?.characterIds.includes(card.id)??false} disabled={disabled} onSelect={()=>onChange({characterIds:[card.id],activeCharacterId:card.id})} detailsLabel={t('details')}><p>{card.description}</p>{card.personality&&<p>{card.personality}</p>}{card.scenario&&<p>{card.scenario}</p>}{card.systemPrompt&&<pre>{card.systemPrompt}</pre>}</ResourceRow>)}
   </div>
   {(tab==='worldbooks'&&!workspace?.lorebooks.length||tab==='characters'&&!workspace?.characters.length)&&<p className="pi-muted">{t('noResources')}</p>}
  </section>
 </aside>;
}

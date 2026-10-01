import {useState} from 'react';
import {LuBookOpen,LuCheck,LuFileText,LuUserRound,LuX} from 'react-icons/lu';
import type {AgentConversation,AgentWorkspaceData} from '../agent/types';
import {STUDIO_BUILTIN_PRESETS,studioSessionOptions,type StudioConversationOptions} from '../agent/workspace-controls';
import {studioUxText} from '../agent/ux';

export function AgentResourcePanel({workspace,chat,language,disabled,onChange,onClose}:{workspace?:AgentWorkspaceData;chat?:AgentConversation;language:unknown;disabled:boolean;onChange:(patch:Partial<StudioConversationOptions>)=>void;onClose:()=>void}){
 const [tab,setTab]=useState<'presets'|'worldbooks'|'characters'>('presets');
 const t=(key:string)=>studioUxText(language,key),options=studioSessionOptions(chat);
 return <aside className="pi-resource-panel" aria-label={t('resources')}>
  <header><strong><LuBookOpen/>{t('resources')}</strong><button className="pi-icon" aria-label={t('close')} onClick={onClose}><LuX/></button></header>
  <div className="pi-resource-tabs" role="tablist" aria-label={t('resources')}>{(['presets','worldbooks','characters'] as const).map(value=><button key={value} id={'pi-resource-tab-'+value} role="tab" aria-selected={tab===value} aria-controls={'pi-resource-'+value} onClick={()=>setTab(value)}>{value==='presets'?<LuFileText/>:value==='worldbooks'?<LuBookOpen/>:<LuUserRound/>}{t('resource_'+value)}</button>)}</div>
  <section className="pi-resource-body" role="tabpanel" id={'pi-resource-'+tab} aria-labelledby={'pi-resource-tab-'+tab}>
   {tab==='presets'&&<><p className="pi-muted">{t('presetSwitchHint')}</p>{STUDIO_BUILTIN_PRESETS.map(preset=><article className="pi-resource-item" key={preset.id}><button disabled={disabled} aria-pressed={options.presetId===preset.id} onClick={()=>onChange({studioPresetId:preset.id})}><LuFileText/><span>{t(preset.name)}</span>{options.presetId===preset.id&&<LuCheck/>}</button><p>{t(preset.name+'Body')}</p></article>)}
    {!!workspace?.samplerPresets.length&&<><h4>{t('tavernPresets')}</h4>{workspace.samplerPresets.map(preset=><article className="pi-resource-item" key={preset.id}><button disabled={disabled} aria-pressed={options.presetId==='tavern:'+preset.id} onClick={()=>onChange({studioPresetId:'tavern:'+preset.id})}><LuFileText/><span>{preset.name}</span>{options.presetId==='tavern:'+preset.id&&<LuCheck/>}</button><details><summary>{t('readTemplate')}</summary><pre>{preset.systemPrompt}</pre>{preset.jailbreakPrompt&&<pre>{preset.jailbreakPrompt}</pre>}</details></article>)}</>}
   </>}
   {tab==='worldbooks'&&<>{workspace?.lorebooks.map(book=><article className="pi-resource-item" key={book.id}><label className="pi-resource-check"><input type="checkbox" disabled={disabled} checked={chat?.lorebookIds.includes(book.id)??false} onChange={e=>onChange({lorebookIds:e.target.checked?[...(chat?.lorebookIds??[]),book.id]:(chat?.lorebookIds??[]).filter(id=>id!==book.id)})}/><LuBookOpen/><span>{book.name}</span></label>{book.description&&<p>{book.description}</p>}<details><summary>{t('details')} · {book.entries.length}</summary>{book.entries.map(entry=><details key={entry.id}><summary>{entry.comment||entry.keys.join(', ')||t('worldEntry')}</summary><pre>{entry.content}</pre></details>)}</details></article>)}{!workspace?.lorebooks.length&&<p>{t('noResources')}</p>}</>}
   {tab==='characters'&&<>{workspace?.characters.map(card=><article className="pi-resource-item" key={card.id}><button disabled={disabled} aria-pressed={chat?.characterIds.includes(card.id)} onClick={()=>onChange({characterIds:[card.id],activeCharacterId:card.id})}>{card.avatarDataUrl?<img className="pi-resource-avatar" src={card.avatarDataUrl} alt=""/>:<LuUserRound/>}<span>{card.nickname||card.name}</span>{chat?.characterIds.includes(card.id)&&<LuCheck/>}</button><p>{card.description}</p><details><summary>{t('details')}</summary>{card.personality&&<p>{card.personality}</p>}{card.scenario&&<p>{card.scenario}</p>}{card.systemPrompt&&<pre>{card.systemPrompt}</pre>}</details></article>)}{!workspace?.characters.length&&<p>{t('noResources')}</p>}</>}
  </section>
 </aside>;
}

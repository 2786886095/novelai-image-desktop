import {useEffect,useRef,useState} from 'react';
import {Button,SelectMenuCompat} from './ui';
import {mcpToolsText,type McpDiscoveredTool} from '../mcp-tools';
import type {AppSettings,TagSuggestion} from '../types';
import {useAppStore} from '../store';
export function McpToolSettings({settings,onChange}:{settings:AppSettings;onChange:(key:'tagServerTool'|'tagServerRelatedTool'|'tagServerArtistTool',value:string)=>void}) {
 const [tools,setTools]=useState<McpDiscoveredTool[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef(0),text=mcpToolsText(settings.language);
 useEffect(()=>{request.current++;setTools([]);setBusy(false);setError('');const valid=settings.tagServerEnabled&&(settings.tagServerType==='stdio'?!!settings.tagServerCommand?.trim():!!settings.tagServerUrl?.trim());const timer=valid?setTimeout(()=>void discover(),400):undefined;return()=>{request.current++;clearTimeout(timer);};},[settings.tagServerEnabled,settings.tagServerType,settings.tagServerUrl,settings.tagServerCommand,settings.tagServerArgs,settings.tagServerApiKey]);
 async function discover(){const id=++request.current;setBusy(true);setError('');try{const found=await window.naiDesktop.listMcpTools();if(id===request.current)setTools(found);}catch{if(id===request.current)setError(text.error);}finally{if(id===request.current)setBusy(false);}}
 return <section className="mcp-tool-settings"><Button disabled={busy} onClick={()=>void discover()}>{busy?text.busy:text.discover}</Button><p className="settings-hint">{text.hint}</p>{error&&<p role="alert">{error}</p>}
 {(['tagServerTool','tagServerRelatedTool','tagServerArtistTool'] as const).map((key,index)=>{const value=settings[key]??(index===0?'search_tags':'');const options=[...tools];if(value&&!tools.some(t=>t.name===value))options.unshift({name:value,inputSchema:{}});return <label className="field" key={key}><span>{[text.search,text.related,text.artist][index]}</span>{tools.length?<SelectMenuCompat aria-label={[text.search,text.related,text.artist][index]} disabled={busy} value={value} onChange={e=>onChange(key,e.target.value)}>{index>0&&<option value="">{text.none}</option>}{options.map(tool=><option value={tool.name} key={tool.name}>{tool.name}{tool.description?' — '+tool.description:''}</option>)}</SelectMenuCompat>:<input aria-label={[text.search,text.related,text.artist][index]} disabled={busy} value={value} placeholder={index===0?'search_tags':''} onChange={e=>onChange(key,e.target.value)}/>}</label>;})}
 </section>;
}
export function McpTagSuggestions({query,onPick}:{query:string;onPick:(tag:string)=>void}) {
 const settings=useAppStore(s=>s.settings),[tags,setTags]=useState<TagSuggestion[]>([]),[busy,setBusy]=useState(false);
 const enabled=!!settings?.tagServerEnabled&&!!settings.mcpForCapsule, text=mcpToolsText(settings?.language);
 useEffect(()=>{let alive=true;setTags([]);setBusy(false);if(!enabled||!query.trim())return;setBusy(true);const timer=setTimeout(()=>{void window.naiDesktop.searchTagServer(query,24).then(items=>{if(alive)setTags(items);}).catch(()=>{}).finally(()=>{if(alive)setBusy(false);});},250);return()=>{alive=false;clearTimeout(timer);};},[enabled,query,settings?.tagServerTool,settings?.tagServerRelatedTool,settings?.tagServerArtistTool,settings?.tagServerUrl,settings?.tagServerType]);
 if(!enabled||!query.trim())return null;
 return <section className="mcp-tag-suggestions"><strong>{text.suggestions}</strong>{busy?<p role="status">{text.busy}</p>:<div className="capsule-browser-list">{tags.map(tag=><button type="button" className="capsule-tax-chip" key={tag.tag} onClick={()=>onPick(tag.tag)} title={tag.description}><span>{tag.tag}</span></button>)}{!tags.length&&<p>{text.empty}</p>}</div>}</section>;
}

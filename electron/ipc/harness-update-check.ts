import {isNewerBundle} from './harness-policy';
export interface HarnessUpdateCheck { checkedAt:string; component:string|null; official:string|null; plugins:Record<string,string>; errors:string[]; componentFailed?:boolean; officialFailed?:boolean }
const headers={'Accept':'application/vnd.github+json','User-Agent':'Langbai-Tavern-Agent'};
export function chooseComponent(releases:unknown, platform=process.platform, arch=process.arch):string|null {
 if(!Array.isArray(releases))throw Error('Invalid release list');
 const candidates=releases.filter(r=>!r.draft&&!r.prerelease&&/^agent-v\d+\.\d+\.\d+$/.test(r.tag_name)&&Array.isArray(r.assets)&&r.assets.some((a:{name:string})=>a.name===`tavern-agent-${platform}-${arch}-protocol1.zip`));
 candidates.sort((a,b)=>isNewerBundle(a.tag_name.slice(7),b.tag_name.slice(7))?-1:isNewerBundle(b.tag_name.slice(7),a.tag_name.slice(7))?1:0);
 return candidates[0]?.tag_name.slice(7)??null;
}
/** Metadata-only. Official releases never bypass Studio compatibility testing. */
export async function checkHarnessUpdates():Promise<HarnessUpdateCheck>{
 const result:HarnessUpdateCheck={checkedAt:new Date().toISOString(),component:null,official:null,plugins:{},errors:[]};
 async function json(url:string){const r=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}
 await Promise.all([
  (async()=>{try{const meta=await json('https://raw.githubusercontent.com/Spirtxiaoqi7/mindspace-dsh-session-memory/main/package.json');if(typeof meta.version!=='string'||!/^\d+\.\d+\.\d+$/.test(meta.version))throw Error('Invalid version');result.plugins['mindspace-dsh-session-memory (source)']=meta.version;}catch(e){result.errors.push('Memory 源码版本：'+String(e));}})(),
  (async()=>{try{const all=[];for(let page=1;page<=5;page++){const rows=await json(`https://api.github.com/repos/2786886095/novelai-image-desktop/releases?per_page=100&page=${page}`);if(!Array.isArray(rows))throw Error('Invalid release list');all.push(...rows);if(rows.length<100)break;}result.component=chooseComponent(all);}catch(e){result.componentFailed=true;result.errors.push('Studio 更新源：'+String(e));}})(),
  ...['@deepseek-ai/dsh','@lutrodev/dsh-roleplay','dsh-plugin-mgr','dshmarket'].map(async name=>{try{const meta=await json('https://registry.npmjs.org/'+encodeURIComponent(name));const tags=meta['dist-tags']??{};let version=tags.latest;if(name==='@deepseek-ai/dsh' && typeof tags.next==='string' && (!version||isNewerBundle(tags.next,version)))version=tags.next;if(typeof version!=='string'||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(version))throw Error('Invalid version');if(name==='@deepseek-ai/dsh')result.official=version;else result.plugins[name]=version;}catch(e){if(name==='@deepseek-ai/dsh')result.officialFailed=true;result.errors.push(name+'：'+String(e));}})
 ]);
 return result;
}

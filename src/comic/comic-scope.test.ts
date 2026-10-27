import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DEFAULT_PARAMS} from '../types';
import {createComicProjectStore} from './project-store';
import {createTagComicPanel,TAG_COMIC_STORAGE_KEY} from './tag-comic';
import {COMIC_RUN_KEY,createComicGenerationQueue} from './generation-queue';
import {comicScopeProjectKey,comicScopeRunKey,JAPANESE_COMIC_PROJECT_KEY,JAPANESE_COMIC_RUN_KEY} from './comic-scope';
const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
beforeEach(()=>{values.clear();});afterEach(()=>vi.unstubAllGlobals());
it('preserves exact original keys and allocates separate Japanese project and queue keys',()=>{expect(comicScopeProjectKey('tag-comic')).toBe(TAG_COMIC_STORAGE_KEY);expect(comicScopeRunKey('tag-comic')).toBe(COMIC_RUN_KEY);expect(comicScopeProjectKey('jp-comic')).toBe(JAPANESE_COMIC_PROJECT_KEY);expect(comicScopeRunKey('jp-comic')).toBe(JAPANESE_COMIC_RUN_KEY);});
it('new scope update and backup never replace existing Tag project or backup',()=>{
 const tag=createComicProjectStore({storage,params:()=>DEFAULT_PARAMS}),jp=createComicProjectStore({storage,params:()=>DEFAULT_PARAMS,storageKey:JAPANESE_COMIC_PROJECT_KEY});
 tag.update(p=>({...p,title:'keep tag',panels:[createTagComicPanel('1girl, original',1)]}),{backup:true});const raw=values.get(TAG_COMIC_STORAGE_KEY),backup=values.get(TAG_COMIC_STORAGE_KEY+'.before-agent-change');
 jp.update(p=>({...p,title:'jp first'}));jp.update(p=>({...p,title:'jp changed'}),{expectedRevision:jp.read().revision,backup:true});
 expect(values.get(TAG_COMIC_STORAGE_KEY)).toBe(raw);expect(values.get(TAG_COMIC_STORAGE_KEY+'.before-agent-change')).toBe(backup);expect(JSON.parse(values.get(JAPANESE_COMIC_PROJECT_KEY+'.before-agent-change')!).title).toBe('jp first');expect(tag.read().project.title).toBe('keep tag');
});
it('Japanese project stale revision fails without writing either project',()=>{
 const jp=createComicProjectStore({storage,params:()=>DEFAULT_PARAMS,storageKey:JAPANESE_COMIC_PROJECT_KEY});const before=jp.read().revision;jp.update(p=>({...p,title:'newer'}));const raw=values.get(JAPANESE_COMIC_PROJECT_KEY);expect(()=>jp.update(p=>({...p,title:'lost'}),{expectedRevision:before})).toThrow('已变化');expect(values.get(JAPANESE_COMIC_PROJECT_KEY)).toBe(raw);expect(values.has(TAG_COMIC_STORAGE_KEY)).toBe(false);
});
it('new queue journal stays separate and cannot launch while global scope guard refuses',async()=>{
 const jp=createComicProjectStore({storage,params:()=>DEFAULT_PARAMS,storageKey:JAPANESE_COMIC_PROJECT_KEY});jp.update(p=>({...p,panels:[createTagComicPanel('1girl, forest',1)]}));values.set(COMIC_RUN_KEY,'original journal');const guard=vi.fn(()=>{throw Error('other scope busy');}),generate=vi.fn();
 const queue=createComicGenerationQueue({store:jp,storage,runStorageKey:JAPANESE_COMIC_RUN_KEY,beforeLaunch:guard,hasToken:async()=>true,quote:async()=>0,generate,cancel:async()=>{}});
 expect(()=>queue.launch([{panelId:jp.read().project.panels[0].id,ordinal:0}],{expectedRevision:jp.read().revision,confirm:async()=>true})).toThrow('other scope busy');expect(values.get(COMIC_RUN_KEY)).toBe('original journal');expect(values.has(JAPANESE_COMIC_RUN_KEY)).toBe(false);expect(generate).not.toHaveBeenCalled();
});
it('actual application scope queues serialize launches while the other project remains editable',async()=>{
 vi.resetModules();vi.stubGlobal('localStorage',storage);
 let resolve!:()=>void;const gate=new Promise<void>(r=>resolve=r);
 const api={hasToken:vi.fn(async()=>({hasToken:true})),tagComicPrepareImageService:vi.fn(async()=>({provider:'openai-images',binding:'fixture',model:'fixture',size:'1024x1024'})),tagComicGenerateCandidate:vi.fn(async()=>{await gate;return {ok:true,items:[],message:'fixture'};}),tagComicCancelGeneration:vi.fn(async()=>({ok:true}))};vi.stubGlobal('window',{naiDesktop:api});
 const {getComicProjectStore}=await import('./use-comic-project');const {getComicGenerationQueue}=await import('./use-comic-generation');
 const tag=getComicProjectStore('tag-comic'),jp=getComicProjectStore('jp-comic');tag.update(p=>({...p,panels:[createTagComicPanel('forest',1)]}));jp.update(p=>({...p,panels:[createTagComicPanel('city',1)]}));const a=getComicGenerationQueue('tag-comic'),b=getComicGenerationQueue('jp-comic');
 a.launch([{panelId:tag.read().project.panels[0].id,ordinal:0}],{expectedRevision:tag.read().revision,confirm:async()=>true});await vi.waitFor(()=>expect(api.tagComicGenerateCandidate).toHaveBeenCalledOnce());
 jp.update(p=>({...p,title:'editable while other scope works'}));expect(jp.read().project.title).toContain('editable');expect(()=>b.launch([{panelId:jp.read().project.panels[0].id,ordinal:0}],{expectedRevision:jp.read().revision,confirm:async()=>true})).toThrow('另一个漫画队列');
 resolve();await a.settled();expect(values.has(JAPANESE_COMIC_RUN_KEY)).toBe(false);expect(values.has(COMIC_RUN_KEY)).toBe(true);
});

import {expect,it} from 'vitest';
import {createComicProjectStore,COMIC_BACKUP_KEY} from './project-store';
import {TAG_COMIC_STORAGE_KEY} from './tag-comic';
import {DEFAULT_PARAMS} from '../types';
function fixture(){const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};const create=()=>createComicProjectStore({storage,params:()=>DEFAULT_PARAMS});return {values,storage,create};}
it('commits synchronously to the actual project key and reopens the saved project',()=>{
 const f=fixture(),s=f.create();let notifications=0;s.subscribe(()=>notifications++);const before=s.read();
 s.update(p=>({...p,title:'Agent漫画'}),{expectedRevision:before.revision});
 expect(JSON.parse(f.values.get(TAG_COMIC_STORAGE_KEY)!).title).toBe('Agent漫画');expect(f.create().read().project.title).toBe('Agent漫画');expect(notifications).toBe(1);
});
it('UI edits and external imports invalidate stale Agent revision',()=>{
 const f=fixture(),s=f.create(),before=s.read();s.update(p=>({...p,title:'UI'}));
 expect(()=>s.update(p=>({...p,title:'stale'}),{expectedRevision:before.revision})).toThrow('已变化');
 const fresh=s.read();f.values.set(TAG_COMIC_STORAGE_KEY,JSON.stringify({...fresh.project,title:'import'}));expect(s.read().project.title).toBe('import');
 expect(()=>s.update(p=>p,{expectedRevision:fresh.revision})).toThrow('已变化');
});
it('failed persistence leaves both current project and existing saved bytes unchanged',()=>{
 const f=fixture(),s=f.create();s.update(p=>({...p,title:'saved'}));const raw=f.values.get(TAG_COMIC_STORAGE_KEY);
 f.storage.setItem=()=>{throw Error('quota');};expect(()=>s.update(p=>({...p,title:'lost'}))).toThrow('quota');expect(s.getSnapshot().project.title).toBe('saved');expect(s.getSnapshot().error).toBe('quota');expect(f.values.get(TAG_COMIC_STORAGE_KEY)).toBe(raw);
});
it('corrupt storage is not silently replaced with a blank project',()=>{
 const f=fixture();f.values.set(TAG_COMIC_STORAGE_KEY,'{broken');const s=f.create();expect(()=>s.read()).toThrow();expect(()=>s.update(p=>p)).toThrow();expect(f.values.get(TAG_COMIC_STORAGE_KEY)).toBe('{broken');
});
it('busy queue rejects Agent mutation and destructive mutation preserves previous snapshot',()=>{
 const f=fixture(),s=f.create();s.update(p=>({...p,title:'keep'}));s.setBusy(true);expect(()=>s.update(p=>p,{expectedRevision:s.read().revision})).toThrow('任务');s.setBusy(false);
 s.update(p=>({...p,title:'new'}),{expectedRevision:s.read().revision,backup:true});expect(JSON.parse(f.values.get(COMIC_BACKUP_KEY)!).title).toBe('keep');
});

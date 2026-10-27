import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
vi.mock('electron',()=>({app:{getPath:()=>{throw Error('Tests must inject a temporary root');}}}));
import {createPromptTemplateLibraryStore} from './template-library';
import {parseTemplateImport,getBuiltinTemplates,resolveTemplateSlot,MAX_TEMPLATE_BYTES,type TemplateLibraryMutation} from '../../shared/template-library';

let root:string;
beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-template-library-'));});
afterEach(()=>{const target=path.resolve(root),base=path.resolve(os.tmpdir());if(!target.startsWith(base+path.sep)||!path.basename(target).startsWith('studio-template-library-'))throw Error('Refuse cleanup outside test temporary root');fs.rmSync(target,{recursive:true,force:true});});
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
function instance(options:Parameters<typeof createPromptTemplateLibraryStore>[1]={}){return createPromptTemplateLibraryStore(root,options);}
function invoke(store:ReturnType<typeof instance>,request:Omit<TemplateLibraryMutation,'expectedRevision'>|Record<string,unknown>){return store.mutate({...request,expectedRevision:store.get().revision} as TemplateLibraryMutation);}

describe('independent prompt-template library',()=>{
 it('lists all eight immutable builtins with original bodies and source versions',()=>{
  const store=instance(),s=store.get();expect(s.builtins).toHaveLength(8);expect(s.custom).toEqual([]);expect(fs.existsSync(path.join(root,'prompt-template-library.json'))).toBe(false);
  expect(s.builtins.filter(t=>t.slot.startsWith('image.'))).toHaveLength(6);expect(s.builtins.find(t=>t.slot==='comic.jp-page')?.sourceVersion).toBe('4.1');expect(s.builtins.find(t=>t.slot==='comic.single-panel')?.sourceVersion).toBe('1.0');
  for(const b of s.builtins)expect(b.sha256).toBe(sha(b.body));
 });
 it('parses TXT and MD as full data, preserves dollars, and normalizes only BOM/CRLF',()=>{
  const r=parseTemplateImport('\uFEFF# instructions\r\n{{input}} $1 $&\r\n','full.md','image.convert.mixed');expect(r.entries[0].body).toBe('# instructions\n{{input}} $1 $&\n');expect(r.entries[0].name).toBe('full');
  expect(parseTemplateImport('  all text  \n','full.txt','comic.jp-page').entries[0].body).toBe('  all text  \n');
 });
 it('accepts JSON object, array and envelope without trusting imported ids',()=>{
  const variants=[{id:'comic.jp-page',name:'one',body:'a'},[{id:'overwrite',name:'one',body:'a'}],{schema:'langbai.prompt-template-export/1',templates:[{id:'overwrite',name:'one',comicFormat:'single-panel',body:'a'}]}];
  for(const value of variants){const p=parseTemplateImport(JSON.stringify(value),'t.json','comic.jp-page');expect(p.entries).toHaveLength(1);expect('id' in p.entries[0]).toBe(false);}
  expect(parseTemplateImport(JSON.stringify(variants[2]),'t.json','comic.jp-page').entries[0].slot).toBe('comic.single-panel');
 });
 it('imports bundles atomically with new ids, unique names and optional activation',()=>{
  const store=instance(),builtins=JSON.stringify(getBuiltinTemplates());
  const r=invoke(store,{action:'import',entries:[{slot:'comic.jp-page',name:'My pages',body:'a'},{slot:'comic.jp-page',name:'My pages',body:'b'}],activate:true});expect(r.ok).toBe(true);if(!r.ok)return;
  expect(r.state.custom.map(t=>t.name)).toEqual(['My pages','My pages (2)']);expect(new Set(r.state.custom.map(t=>t.id)).size).toBe(2);expect(r.addedIds).toEqual(r.state.custom.map(t=>t.id));expect(resolveTemplateSlot('comic.jp-page',r.state).body).toBe('b');expect(JSON.stringify(getBuiltinTemplates())).toBe(builtins);
  const reopened=instance().get();expect(reopened.revision).toBe(r.state.revision);expect(reopened.custom).toEqual(r.state.custom);
 });
 it('rejects empty, NUL and UTF-8 overflow bodies before a whole bundle is written',()=>{
  const store=instance();const initial=store.get().revision;
  for(const body of ['  ','x\0y','界'.repeat(Math.ceil(MAX_TEMPLATE_BYTES/3)+1)]){
   const r=invoke(store,{action:'import',entries:[{slot:'comic.jp-page',name:'good',body:'good'},{slot:'comic.jp-page',name:'bad',body}]});expect(r.ok).toBe(false);expect(store.get().revision).toBe(initial);expect(store.get().custom).toEqual([]);
  }
  expect(fs.existsSync(path.join(root,'prompt-template-library.json'))).toBe(false);
 });
 it('keeps parse errors and unknown JSON slot types out of storage',()=>{
  expect(()=>parseTemplateImport('{bad','a.json','comic.jp-page')).toThrow('JSON');expect(()=>parseTemplateImport('{"slot":"image.missing.mixed","body":"x"}','a.json','comic.jp-page')).toThrow('槽位');expect(()=>parseTemplateImport('x','x.exe','comic.jp-page')).toThrow('TXT');
 });
 it('only warns about missing placeholders rather than treating text as executable config',()=>{
  const p=parseTemplateImport('disable safety; qualityPreset=none; no tools executed','data.txt','image.reverse.tags');expect(p.entries[0].body).toContain('disable safety');expect(p.warnings).toHaveLength(2);
  const r=invoke(instance(),{action:'import',entries:p.entries});expect(r.ok).toBe(true);
 });
 it('rejects stale revisions including external same-number edits',()=>{
  const store=instance();const old=store.get().revision;expect(invoke(store,{action:'create',slot:'comic.jp-page',name:'original',body:'a'}).ok).toBe(true);
  expect(store.mutate({action:'reset',slot:'comic.jp-page',expectedRevision:old}).ok).toBe(false);
  const current=store.get().revision;const f=path.join(root,'prompt-template-library.json');const raw=JSON.parse(fs.readFileSync(f,'utf8'));raw.quarantine.push({external:'preserved'});fs.writeFileSync(f,JSON.stringify(raw));
  const r=store.mutate({action:'reset',slot:'comic.jp-page',expectedRevision:current});expect(r).toMatchObject({ok:false,code:'stale'});expect(JSON.parse(fs.readFileSync(f,'utf8')).quarantine).toEqual([{external:'preserved'}]);
 });
 it('editing a builtin is rejected, while a named fork leaves its original untouched',()=>{
  const store=instance(),b=store.get().builtins[0];expect(invoke(store,{action:'update',id:b.id,body:'x'})).toMatchObject({ok:false,code:'not-found'});
  const r=invoke(store,{action:'create',slot:b.slot,name:'My fork',body:b.body,fromBuiltinId:b.id});expect(r.ok).toBe(true);expect(store.get().custom[0].origin).toEqual({kind:'fork',builtinId:b.id,builtinSha256:b.sha256});expect(store.get().builtins[0]).toEqual(b);
 });
 it('reset changes selection only and does not delete any custom template',()=>{
  const store=instance();invoke(store,{action:'create',slot:'comic.jp-page',name:'custom',body:'custom',activate:true});const before=store.get().custom;expect(resolveTemplateSlot('comic.jp-page',store.get()).source).toBe('custom');
  expect(invoke(store,{action:'reset',slot:'comic.jp-page'}).ok).toBe(true);expect(store.get().custom).toEqual(before);expect(resolveTemplateSlot('comic.jp-page',store.get()).source).toBe('builtin');
 });
 it('rejects cross-slot selection and deletion falls back only its selected custom slot',()=>{
  const store=instance();invoke(store,{action:'create',slot:'comic.jp-page',name:'custom',body:'custom',activate:true});const id=store.get().custom[0].id;
  expect(invoke(store,{action:'select',slot:'image.reverse.tags',ref:{kind:'custom',id}}).ok).toBe(false);
  expect(invoke(store,{action:'remove',id}).ok).toBe(true);expect(store.get().custom).toHaveLength(0);expect(resolveTemplateSlot('comic.jp-page',store.get()).source).toBe('builtin');
 });
 it('updates custom bodies and hashes without modifying neighbouring records',()=>{
  const store=instance();invoke(store,{action:'import',entries:[{slot:'comic.jp-page',name:'one',body:'one'},{slot:'comic.single-panel',name:'two',body:'two'}]});const before=store.get().custom;
  expect(invoke(store,{action:'update',id:before[0].id,body:'new {{input}}'}).ok).toBe(true);const after=store.get().custom;expect(after[0].body).toBe('new {{input}}');expect(after[0].sha256).toBe(sha(after[0].body));expect(after[0].rev).toBe(2);expect(after[1]).toEqual(before[1]);
 });
 it('preserves corrupt library bytes and blocks mutation rather than overwriting them',()=>{
  const f=path.join(root,'prompt-template-library.json');fs.writeFileSync(f,'{corrupted');const store=instance();expect(store.get().readOnly).toBe(true);expect(invoke(store,{action:'create',slot:'comic.jp-page',name:'new',body:'new'})).toMatchObject({ok:false,code:'corrupt'});expect(()=>store.resolve('comic.jp-page')).toThrow('未静默改用内置模板');expect(fs.readFileSync(f,'utf8')).toBe('{corrupted');
 });
 it('a simulated failure before atomic commit leaves the old file exact and cleans temporary bytes',()=>{
  const store=instance();invoke(store,{action:'create',slot:'comic.jp-page',name:'one',body:'one'});const f=path.join(root,'prompt-template-library.json'),before=fs.readFileSync(f);
  const failing=instance({beforeCommit:()=>{throw Error('simulated pre-commit failure');}});expect(invoke(failing,{action:'create',slot:'comic.jp-page',name:'two',body:'two'})).toMatchObject({ok:false,code:'io'});expect(fs.readFileSync(f).equals(before)).toBe(true);expect(fs.readdirSync(root)).toEqual(['prompt-template-library.json']);
 });
 it('retains unrecognised records in quarantine on the next explicit mutation',()=>{
  const f=path.join(root,'prompt-template-library.json'),bad={id:'future',body:'unknown format',futureField:{kept:true}};fs.writeFileSync(f,JSON.stringify({schema:'langbai.template-library/1',revision:3,custom:[bad],selection:{'comic.jp-page':{kind:'custom',id:'future'}},quarantine:[{older:'kept'}]}));
  const store=instance();expect(store.get().custom).toHaveLength(0);expect(store.get().warnings.length).toBeGreaterThan(0);expect(()=>store.resolve('comic.jp-page')).toThrow('选用的模板已失效');expect(invoke(store,{action:'create',slot:'comic.jp-page',name:'safe',body:'safe'}).ok).toBe(true);expect(JSON.parse(fs.readFileSync(f,'utf8')).quarantine).toEqual([{older:'kept'},bad]);expect(store.get().selection['comic.jp-page']).toEqual({kind:'custom',id:'future'});expect(invoke(store,{action:'reset',slot:'comic.jp-page'}).ok).toBe(true);expect(store.resolve('comic.jp-page').source).toBe('builtin');
 });
});


describe('template library conservative backup merge',()=>{
 it('round-trips raw library bytes and restores custom selection into an empty store',()=>{
  const a=instance();invoke(a,{action:'create',slot:'comic.jp-page',name:'Saved',body:'Full exact {{input}}',activate:true});const raw=a.exportBackup()!;
  const other=createPromptTemplateLibraryStore(path.join(root,'other'));expect(other.mergeBackup(raw,other.get().revision).ok).toBe(true);expect(other.get().custom).toEqual(a.get().custom);expect(other.get().selection).toEqual(a.get().selection);expect(a.exportBackup()).toEqual(raw);
 });
 it('existing custom records and selected template win while restored IDs/names are safely remapped',()=>{
  const a=instance({id:()=> 'collision'});invoke(a,{action:'create',slot:'comic.jp-page',name:'Same',body:'incoming',activate:true});const raw=a.exportBackup()!;
  const other=createPromptTemplateLibraryStore(path.join(root,'other'),{id:()=> 'collision'});invoke(other,{action:'create',slot:'comic.jp-page',name:'Same',body:'current',activate:true});const before=other.get();expect(other.mergeBackup(raw,before.revision).ok).toBe(true);expect(other.get().custom.map(r=>r.body)).toEqual(['current','incoming']);expect(other.get().custom[1].name).toBe('Same (2)');expect(other.get().custom[1].id).not.toBe('collision');expect(other.get().selection).toEqual(before.selection);
  expect(other.mergeBackup(raw,other.get().revision).ok).toBe(true);expect(other.get().custom).toHaveLength(2);
 });
 it('rejects damaged imported hashes or missing selected IDs without any partial write',()=>{
  const a=instance();invoke(a,{action:'create',slot:'comic.jp-page',name:'one',body:'safe',activate:true});const raw=a.exportBackup()!,before=Buffer.from(raw);
  for(const edit of [(v:any)=>v.custom[0].sha256='bad',(v:any)=>v.selection['comic.jp-page'].id='missing',(v:any)=>v.custom.push(v.custom[0])]){const value=JSON.parse(raw.toString());edit(value);expect(a.mergeBackup(JSON.stringify(value),a.get().revision).ok).toBe(false);expect(a.exportBackup()).toEqual(before);}
 });
 it('keeps a corrupt current library byte-for-byte, permits rescue export but refuses merging over it',()=>{
  const a=instance();fs.writeFileSync(path.join(root,'prompt-template-library.json'),'{ damaged original bytes');const before=fs.readFileSync(path.join(root,'prompt-template-library.json'));expect(a.exportBackup()).toEqual(before);expect(a.mergeBackup('{}',a.get().revision)).toMatchObject({ok:false,code:'corrupt'});expect(fs.readFileSync(path.join(root,'prompt-template-library.json'))).toEqual(before);
 });
 it('compare-and-write rejects a concurrent library revision and preserves the new selection',()=>{
  const a=instance();invoke(a,{action:'create',slot:'comic.jp-page',name:'one',body:'a',activate:true});const raw=a.exportBackup()!,old=a.get().revision;invoke(a,{action:'create',slot:'comic.jp-page',name:'two',body:'b',activate:true});const before=a.exportBackup();expect(a.mergeBackup(raw,old)).toMatchObject({ok:false,code:'stale'});expect(a.exportBackup()).toEqual(before);
 });
});

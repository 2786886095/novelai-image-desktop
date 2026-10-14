import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createImageFavorites} from './image-favorites';
import {createHash} from 'node:crypto';
import {createFavoriteHistoryTimeResolver,type FavoriteHistoryReference} from './favorite-history-time';
let root:string,bytes:Buffer,source:string;
const service=()=>createImageFavorites({indexPath:path.join(root,'profile','favorites.json'),defaultDirectory:path.join(root,'favorites'),now:()=>new Date('2026-09-28T12:00:00Z')});
beforeEach(async()=>{root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'studio-favorites-')));source=path.join(root,'original.png');bytes=await sharp({create:{width:10,height:15,channels:4,background:'#7367aa'}}).withMetadata({exif:{IFD0:{ImageDescription:'NovelAI prompt fixture'}}}).png().toBuffer();await fs.writeFile(source,bytes);});
afterEach(()=>fs.rm(root,{recursive:true,force:true}));
it('copies original bytes and metadata into a flat directory, persists and deduplicates',async()=>{
 const api=service();const added=await api.add(source);expect(added.item.prefix).toBe('20260928_10x15_01');expect(await fs.readFile(added.item.filePath)).toEqual(bytes);expect(path.dirname(added.item.filePath)).toBe(path.join(root,'favorites'));
 expect((await service().list()).items[0].id).toBe(added.item.id);expect((await api.add(source)).duplicate).toBe(true);expect((await api.list()).items).toHaveLength(1);
 await fs.unlink(source);expect(await fs.readFile(added.item.filePath)).toEqual(bytes);
});
it('preserves the immutable prefix and rejects paths/unknown identities when renaming',async()=>{
 const api=service(),{item}=await api.add(source);const renamed=await api.rename(item.id,'黄昏海边');expect(path.basename(renamed.filePath)).toBe('20260928_10x15_01_黄昏海边.png');expect(renamed.prefix).toBe(item.prefix);expect(await fs.readFile(renamed.filePath)).toEqual(bytes);
 await expect(api.rename(item.id,'../outside')).rejects.toThrow();await expect(api.rename('unknown','name')).rejects.toThrow();
 const reset=await api.rename(item.id,'');expect(path.basename(reset.filePath)).toBe(item.prefix+'.png');
});
it('serializes additions, never overwrites collisions and keeps old favorites after changing directory',async()=>{
 const api=service();await fs.mkdir(path.join(root,'favorites'));const occupied=path.join(root,'favorites','20260928_10x15_01.png');await fs.writeFile(occupied,'unrelated');
 const results=await Promise.all([api.add(source),api.add(source)]);expect(results[0].item.prefix).toBe('20260928_10x15_02');expect(results[1].duplicate).toBe(true);expect(await fs.readFile(occupied,'utf8')).toBe('unrelated');
 const other=path.join(root,'custom');await api.setDirectory(other);const moved=await service().list();expect(moved.directory).toBe(other);expect(moved.items).toHaveLength(1);expect(path.dirname(moved.items[0].filePath)).toBe(other);expect(await fs.readFile(results[0].item.filePath)).toEqual(bytes);expect(await fs.readFile(moved.items[0].filePath)).toEqual(bytes);
});
it('missing files can be restored from the original; corrupt indexes and symlinks fail closed',async()=>{
 const api=service();const {item}=await api.add(source);await fs.unlink(item.filePath);expect((await api.list()).items[0].missing).toBe(true);const repaired=await api.add(source);expect(await fs.readFile(repaired.item.filePath)).toEqual(bytes);expect((await api.list()).items).toHaveLength(1);
 await fs.writeFile(path.join(root,'profile','favorites.json'),'{bad');await expect(service().add(source)).rejects.toThrow();expect(await fs.readFile(source)).toEqual(bytes);
});
it('removing a bookmark retains its original and archived image',async()=>{
 const api=service();const {item}=await api.add(source);await api.remove(item.id);expect((await api.list()).items).toHaveLength(0);expect(await fs.readFile(item.filePath)).toEqual(bytes);expect(await fs.readFile(source)).toEqual(bytes);
});
it('rolls back an unindexed copy if persistence fails, without touching source bytes',async()=>{
 const api=service();const rename=vi.spyOn(fs,'rename').mockRejectedValueOnce(Error('index write denied'));
 try{await expect(api.add(source)).rejects.toThrow('index write denied');}finally{rename.mockRestore();}
 expect(await fs.readFile(source)).toEqual(bytes);expect(await fs.readdir(path.join(root,'favorites'))).toEqual([]);expect((await api.list()).items).toEqual([]);
});
it('does not overwrite another file when suffix rename collides',async()=>{
 const api=service(),{item}=await api.add(source);const occupied=path.join(path.dirname(item.filePath),item.prefix+'_occupied.png');await fs.writeFile(occupied,'other');
 await expect(api.rename(item.id,'occupied')).rejects.toThrow();expect(await fs.readFile(occupied,'utf8')).toBe('other');expect((await api.list()).items[0].filePath).toBe(item.filePath);expect(await fs.readFile(item.filePath)).toEqual(bytes);
});
it('rejects linked destinations and non-image input',async()=>{
 const api=service(),outside=path.join(root,'elsewhere'),link=path.join(root,'linked');await fs.mkdir(outside);await fs.symlink(outside,link,'junction');
 await expect(api.setDirectory(link)).rejects.toThrow();const invalid=path.join(root,'bad.png');await fs.writeFile(invalid,'not an image');await expect(api.add(invalid)).rejects.toThrow();expect((await api.list()).items).toHaveLength(0);
});
it('keeps the old directory and index when relocation meets a conflicting file',async()=>{
 const api=service(),{item}=await api.add(source),other=path.join(root,'collision');await fs.mkdir(other);await fs.writeFile(path.join(other,path.basename(item.filePath)),'different image');
 await expect(api.setDirectory(other)).rejects.toThrow('同名');const state=await api.list();expect(state.directory).toBe(path.join(root,'favorites'));expect(state.items[0].filePath).toBe(item.filePath);expect(await fs.readFile(item.filePath)).toEqual(bytes);expect(await fs.readFile(path.join(other,path.basename(item.filePath)),'utf8')).toBe('different image');
});
it('never reuses a fixed sequence after suffix rename, bookmark removal or external files',async()=>{
 const api=service(),{item}=await api.add(source);
 const renamed=await api.rename(item.id,'黄昏海边');
 await fs.writeFile(source,await sharp({create:{width:10,height:15,channels:4,background:'#446688'}}).png().toBuffer());
 const next=await api.add(source);expect(next.item.prefix).toBe('20260928_10x15_02');
 await api.remove(item.id);await api.remove(next.item.id);
 await fs.writeFile(path.join(root,'favorites','20260928_10x15_03_外部文件.jpg'),'external');
 await fs.writeFile(source,await sharp({create:{width:10,height:15,channels:4,background:'#aa6688'}}).png().toBuffer());
 expect((await api.add(source)).item.prefix).toBe('20260928_10x15_04');
 expect(await fs.readFile(renamed.filePath)).toEqual(bytes);
});
it('resolves saved state by original content and copied archive, then survives unbookmark/re-add',async()=>{
 const api=service();expect(await api.status(source)).toBeNull();const {item}=await api.add(source);
 expect((await api.status(source))?.id).toBe(item.id);expect((await api.status(item.filePath))?.id).toBe(item.id);
 const copy=path.join(root,'copy.png');await fs.copyFile(source,copy);expect((await service().status(copy))?.id).toBe(item.id);
 const renamed=await api.rename(item.id,'new');expect((await api.status(source))?.filePath).toBe(renamed.filePath);
 await api.remove(item.id);expect(await api.status(source)).toBeNull();expect(await fs.readFile(renamed.filePath)).toEqual(bytes);
 expect((await api.add(source)).duplicate).toBe(false);expect(await fs.readFile(source)).toEqual(bytes);
});
it('missing archives are not marked saved, and failed removal retains saved state',async()=>{
 const api=service(),{item}=await api.add(source);const failure=vi.spyOn(fs,'rename').mockRejectedValueOnce(Error('disk denied'));
 try{await expect(api.remove(item.id)).rejects.toThrow('disk denied');}finally{failure.mockRestore();}
 expect((await api.status(source))?.id).toBe(item.id);await fs.unlink(item.filePath);expect(await api.status(source)).toBeNull();
});

const generatedTimestamp='2026-09-20T10:20:30.000Z';
const reference=():FavoriteHistoryReference=>({id:'history-fixture',filePath:source,generatedAt:generatedTimestamp,generatedAtSource:'local-completion',generatedImageSha256:createHash('sha256').update(bytes).digest('hex')});
const generatedService=(refs:FavoriteHistoryReference[])=>createImageFavorites({indexPath:path.join(root,'profile','favorites.json'),defaultDirectory:path.join(root,'favorites'),now:()=>new Date('2026-09-28T12:00:00Z'),resolveGeneratedAt:createFavoriteHistoryTimeResolver({references:()=>refs})});
it('persists verified completion independently of favorite time, rename, relocation and duplicate collection',async()=>{
 const refs=[reference()],api=generatedService(refs),{item}=await api.add(source);
 expect(item.generatedAt).toBe(generatedTimestamp);expect(item.savedAt).toBe('2026-09-28T12:00:00.000Z');expect(item.generatedAtSource).toBe('local-completion');expect(item.generatedAtHistoryId).toBe('history-fixture');
 const persisted=JSON.parse(await fs.readFile(path.join(root,'profile','favorites.json'),'utf8'));expect(persisted.items[0].generatedAt).toBe(generatedTimestamp);
 const renamed=await api.rename(item.id,'fixture');await api.setDirectory(path.join(root,'moved-favorites'));
 refs[0]={...refs[0],generatedAt:'2026-10-01T00:00:00.000Z'};
 const duplicate=await api.add(source);expect(duplicate.duplicate).toBe(true);expect(duplicate.item.generatedAt).toBe(generatedTimestamp);expect(duplicate.item.savedAt).toBe(item.savedAt);expect(duplicate.item.name).toBe('fixture');
 expect((await generatedService(refs).list()).items[0].generatedAt).toBe(generatedTimestamp);expect(await fs.readFile(renamed.filePath)).toEqual(bytes);
});
it('preserves known completion and original collection time when repairing a missing archive',async()=>{
 const refs=[reference()],api=generatedService(refs),{item}=await api.add(source);await fs.unlink(item.filePath);refs.length=0;
 const later=createImageFavorites({indexPath:path.join(root,'profile','favorites.json'),defaultDirectory:path.join(root,'favorites'),now:()=>new Date('2026-10-14T00:00:00Z')});
 const repaired=await later.add(source);expect(repaired.item.generatedAt).toBe(item.generatedAt);expect(repaired.item.savedAt).toBe(item.savedAt);expect(repaired.item.id).toBe(item.id);expect(await fs.readFile(repaired.item.filePath)).toEqual(bytes);
});
it('legacy indexes remain unknown on normal list and safely hash-backfill only on explicit request',async()=>{
 const {item}=await service().add(source),refs=[reference()],resolver=vi.fn(createFavoriteHistoryTimeResolver({references:()=>refs}));
 const api=createImageFavorites({indexPath:path.join(root,'profile','favorites.json'),defaultDirectory:path.join(root,'favorites'),resolveGeneratedAt:resolver});
 expect((await api.list()).items[0].generatedAt).toBeUndefined();expect(resolver).not.toHaveBeenCalled();
 const before=await fs.readFile(path.join(root,'profile','favorites.json'),'utf8');const state=await api.list({resolveGeneratedAt:true});
 expect(state.items[0].generatedAt).toBe(generatedTimestamp);expect(state.items[0].savedAt).toBe(item.savedAt);expect(resolver).toHaveBeenCalledTimes(1);
 expect(await fs.readFile(path.join(root,'profile','favorites.json'),'utf8')).not.toBe(before);expect((await service().list()).items[0].generatedAt).toBe(generatedTimestamp);
 await api.list({resolveGeneratedAt:true});expect(resolver).toHaveBeenCalledTimes(1);
});
it('legacy history createdAt, image metadata duration and file mtime never become generation time',async()=>{
 const refs=[{id:'legacy',filePath:source,createdAt:generatedTimestamp} as FavoriteHistoryReference],api=generatedService(refs);
 bytes=await sharp(bytes).withMetadata({exif:{IFD0:{ImageDescription:'{"Generation time":"3.42 seconds"}'}}}).png().toBuffer();await fs.writeFile(source,bytes);
 await fs.utimes(source,new Date('2020-01-01'),new Date('2020-01-01'));const {item}=await api.add(source);expect(item.generatedAt).toBeUndefined();
 expect((await api.list({resolveGeneratedAt:true})).items[0].generatedAt).toBeUndefined();
 const raw=JSON.parse(await fs.readFile(path.join(root,'profile','favorites.json'),'utf8'));expect(raw.items[0]).not.toHaveProperty('generatedAt');
});
it('changed archives cannot hash-backfill from their old indexed digest',async()=>{
 const {item}=await service().add(source),api=generatedService([reference()]);await fs.writeFile(item.filePath,Buffer.from('different bytes'));
 expect((await api.list({resolveGeneratedAt:true})).items[0].generatedAt).toBeUndefined();
});
it('duplicate old favorite can acquire verified completion without rewriting its identity or favorite time',async()=>{
 const {item}=await service().add(source),api=generatedService([reference()]),copy=path.join(root,'source-copy.png');await fs.copyFile(source,copy);
 const result=await api.add(copy);expect(result.duplicate).toBe(true);expect(result.item.id).toBe(item.id);expect(result.item.savedAt).toBe(item.savedAt);expect(result.item.generatedAt).toBe(generatedTimestamp);expect((await service().list()).items).toHaveLength(1);
});
it('rejects malformed optional generation time without corrupting legacy favorite records',async()=>{
 await service().add(source);const file=path.join(root,'profile','favorites.json'),raw=JSON.parse(await fs.readFile(file,'utf8'));
 raw.items[0].generatedAt='2026-02-30T10:00:00Z';raw.items[0].generatedAtSource='local-completion';raw.items[0].generatedAtHistoryId='bad';await fs.writeFile(file,JSON.stringify(raw));
 const item=(await service().list()).items[0];expect(item.generatedAt).toBeUndefined();expect(item.generatedAtHistoryId).toBeUndefined();expect(item.savedAt).toBe('2026-09-28T12:00:00.000Z');
});
it('an optional time resolver error does not block original-byte collection or legacy listing',async()=>{
 const api=createImageFavorites({indexPath:path.join(root,'profile','favorites.json'),defaultDirectory:path.join(root,'favorites'),resolveGeneratedAt:()=>{throw Error('optional history read failed');}});
 const {item}=await api.add(source);expect(item.generatedAt).toBeUndefined();expect(await fs.readFile(item.filePath)).toEqual(bytes);
 expect((await api.list({resolveGeneratedAt:true})).items[0].id).toBe(item.id);expect((await api.add(source)).duplicate).toBe(true);
});

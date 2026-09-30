import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createImageFavorites} from './image-favorites';
let root:string,bytes:Buffer,source:string;
const service=()=>createImageFavorites({indexPath:path.join(root,'profile','favorites.json'),defaultDirectory:path.join(root,'favorites'),now:()=>new Date('2026-09-28T12:00:00Z')});
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-favorites-'));source=path.join(root,'original.png');bytes=await sharp({create:{width:10,height:15,channels:4,background:'#7367aa'}}).withMetadata({exif:{IFD0:{ImageDescription:'NovelAI prompt fixture'}}}).png().toBuffer();await fs.writeFile(source,bytes);});
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

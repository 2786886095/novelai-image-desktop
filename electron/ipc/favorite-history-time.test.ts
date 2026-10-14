import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createFavoriteHistoryTimeResolver,hashFavoriteFile,normalizeFavoriteGenerationTime,type FavoriteHistoryReference} from './favorite-history-time';

let root:string,file:string,bytes:Buffer,sha256:string;
const timestamp='2026-09-20T10:20:30.000Z';
const record=():FavoriteHistoryReference=>({id:'generated-1',filePath:file,generatedAt:timestamp,generatedAtSource:'local-completion',generatedImageSha256:sha256});
beforeEach(async()=>{root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'favorite-time-')));file=path.join(root,'generated.png');bytes=Buffer.from('neutral image fixture bytes');sha256=createHash('sha256').update(bytes).digest('hex');await fs.writeFile(file,bytes);});
afterEach(async()=>{vi.restoreAllMocks();await fs.rm(root,{recursive:true,force:true});});

it('normalizes zoned instants and rejects durations, invalid calendar dates and unzoned values',()=>{
 expect(normalizeFavoriteGenerationTime('2026-09-20T18:20:30+08:00')).toBe(timestamp);
 for(const value of ['3.42 seconds','2026-09-20','2026-09-20T10:20:30','2026-02-30T10:20:30Z','2026-09-20T24:00:00Z','2026-09-20T10:60:00Z',NaN,null])expect(normalizeFavoriteGenerationTime(value)).toBeUndefined();
});
it('requires a completion marker, original generated digest and present matching bytes',async()=>{
 const refs=[record()];const resolve=createFavoriteHistoryTimeResolver({references:()=>refs});
 expect(await resolve(file,sha256,bytes.length)).toEqual({generatedAt:timestamp,generatedAtSource:'local-completion',generatedAtHistoryId:'generated-1'});
 for(const patch of [{generatedAtSource:undefined},{generatedImageSha256:undefined},{generatedImageSha256:'a'.repeat(64)},{generatedAt:'2.3 seconds'}]){
  refs[0]={...record(),...patch};expect(await resolve(file,sha256,bytes.length)).toBeUndefined();
 }
 refs[0]={id:'legacy',filePath:file,createdAt:timestamp} as FavoriteHistoryReference;
 expect(await resolve(file,sha256,bytes.length)).toBeUndefined();
 refs[0]=record();await fs.unlink(file);expect(await resolve(file,sha256,bytes.length)).toBeUndefined();
});
it('does not let an overwritten same-path image inherit the historical completion time',async()=>{
 const resolve=createFavoriteHistoryTimeResolver({references:()=>[record()]});
 const replaced=Buffer.from(bytes);replaced[0]^=1;await fs.writeFile(file,replaced);
 const newHash=createHash('sha256').update(replaced).digest('hex');
 expect(await resolve(file,newHash,replaced.length)).toBeUndefined();
 expect(await resolve(file,sha256,bytes.length)).toBeUndefined();
});
it('hash-matches a copy and follows an explicitly updated moved history path',async()=>{
 const refs=[record()],resolve=createFavoriteHistoryTimeResolver({references:()=>refs});
 const copy=path.join(root,'favorite.png');await fs.copyFile(file,copy);
 expect((await resolve(copy,sha256,bytes.length))?.generatedAt).toBe(timestamp);
 const moved=path.join(root,'moved.png');await fs.rename(file,moved);refs[0]={...refs[0],filePath:moved};
 expect((await resolve(copy,sha256,bytes.length))?.generatedAtHistoryId).toBe('generated-1');
});
it('ambiguous generation times for identical bytes stay unknown, equivalent offsets are not ambiguous',async()=>{
 const refs=[record(),{...record(),id:'other',generatedAt:'2026-09-21T10:20:30Z'}];const resolve=createFavoriteHistoryTimeResolver({references:()=>refs});
 const open=vi.spyOn(fs,'open');expect(await resolve(file,sha256,bytes.length)).toBeUndefined();expect(open).not.toHaveBeenCalled();
 refs[1].generatedAt='2026-09-20T18:20:30+08:00';expect((await resolve(file,sha256,bytes.length))?.generatedAt).toBe(timestamp);
});
it('filters unrelated history by recorded hash before any stat/open and bounds matching candidates',async()=>{
 const refs=Array.from({length:1000},(_,i)=>({...record(),id:String(i),filePath:path.join(root,'unrelated-'+i+'.png'),generatedImageSha256:'a'.repeat(64)}));refs.push(record());
 const open=vi.spyOn(fs,'open'),stat=vi.spyOn(fs,'lstat');const resolve=createFavoriteHistoryTimeResolver({references:()=>refs});
 expect((await resolve(file,sha256,bytes.length))?.generatedAt).toBe(timestamp);expect(open).toHaveBeenCalledTimes(1);expect(stat.mock.calls.every(call=>call[0]===file)).toBe(true);
 const capped=createFavoriteHistoryTimeResolver({references:()=>[record(),record()],maxCandidates:1});open.mockClear();expect(await capped(file,sha256,bytes.length)).toBeUndefined();expect(open).not.toHaveBeenCalled();
});
it('bounds bytes and verifies a cache hit without reopening, then invalidates changed content',async()=>{
 const bounded=createFavoriteHistoryTimeResolver({references:()=>[record()],maxReadBytes:bytes.length-1}),open=vi.spyOn(fs,'open');
 expect(await bounded(file,sha256,bytes.length)).toBeUndefined();expect(open).not.toHaveBeenCalled();
 const resolve=createFavoriteHistoryTimeResolver({references:()=>[record()]});await resolve(file,sha256,bytes.length);await resolve(file,sha256,bytes.length);expect(open).toHaveBeenCalledTimes(1);
 const changed=Buffer.from(bytes);changed[0]^=1;await fs.writeFile(file,changed);await fs.utimes(file,new Date('2020-01-01'),new Date('2020-01-01'));
 expect(await resolve(file,sha256,bytes.length)).toBeUndefined();expect(open).toHaveBeenCalledTimes(2);
});
it('does not cache a transient missing path and retries after restoration',async()=>{
 const resolve=createFavoriteHistoryTimeResolver({references:()=>[record()]});await fs.unlink(file);expect(await resolve(file,sha256,bytes.length)).toBeUndefined();
 await fs.writeFile(file,bytes);expect((await resolve(file,sha256,bytes.length))?.generatedAt).toBe(timestamp);
});
it('unavailable or corrupt optional history snapshots produce unknown rather than fail collection',async()=>{
 const failed=createFavoriteHistoryTimeResolver({references:()=>{throw Error('history unavailable');}});
 expect(await failed(file,sha256,bytes.length)).toBeUndefined();
 const malformed=createFavoriteHistoryTimeResolver({references:()=>null as any});expect(await malformed(file,sha256,bytes.length)).toBeUndefined();
});
it('bounded archive hashing does not read a growing file beyond the declared bound',async()=>{
 const realOpen=fs.open.bind(fs);let readCount=0;
 vi.spyOn(fs,'open').mockImplementation(async(...args:Parameters<typeof fs.open>)=>{
  const handle=await realOpen(...args),read=handle.read.bind(handle);
  vi.spyOn(handle,'read').mockImplementation(async(...readArgs:any[])=>{
   readCount++;if(readCount===1)await fs.appendFile(file,Buffer.alloc(1024*1024,42));
   expect(readArgs[2]).toBeLessThanOrEqual(bytes.length);
   return (read as any)(...readArgs);
  });return handle;
 });
 expect(await hashFavoriteFile(file,bytes.length)).toBeUndefined();expect(readCount).toBe(2);
});

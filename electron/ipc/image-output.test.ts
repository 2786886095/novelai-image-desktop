import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {writeUniqueImageFile} from './image-output';
let dir:string;
beforeEach(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'nai-write-test-'))});
afterEach(async()=>{vi.restoreAllMocks();if(!path.basename(dir).startsWith('nai-write-test-')||path.dirname(dir)!==os.tmpdir())throw Error('Unexpected test directory');await fs.rm(dir,{recursive:true,force:true})});

it('preserves every concurrently saved image and returns distinct filenames',async()=>{
  const inputs=Array.from({length:16},(_,i)=>Buffer.from(`result-${i}`));
  const paths=await Promise.all(inputs.map(bytes=>writeUniqueImageFile(dir,'same','png',bytes)));
  expect(new Set(paths).size).toBe(inputs.length);
  for(let i=0;i<paths.length;i++)expect(await fs.readFile(paths[i])).toEqual(inputs[i]);
});
it('does not overwrite an existing image, including Unicode names',async()=>{
  const file=path.join(dir,'角色.png');await fs.writeFile(file,'original');
  const next=await writeUniqueImageFile(dir,'角色','png',Buffer.from('new'));
  expect(path.basename(next)).toBe('角色-1.png');expect(await fs.readFile(file,'utf8')).toBe('original');
});
it('propagates a directory error rather than retrying forever',async()=>{
  const file=path.join(dir,'not-directory');await fs.writeFile(file,'sentinel');
  await expect(writeUniqueImageFile(file,'image','png',Buffer.from('new'))).rejects.toBeTruthy();
  expect(await fs.readFile(file,'utf8')).toBe('sentinel');
});
it('rejects directory traversal in names and extensions',async()=>{
  for(const [name,ext] of [['../outside','png'],['image','../png'],['..','png']])await expect(writeUniqueImageFile(dir,name,ext,Buffer.from('new'))).rejects.toThrow('Invalid image filename');
  expect(await fs.readdir(dir)).toEqual([]);
});
it('closes and removes only the newly reserved partial file after a write failure',async()=>{
  const failure=Object.assign(new Error('full'),{code:'ENOSPC'});
  const close=vi.fn().mockResolvedValue(undefined);
  vi.spyOn(fs,'open').mockResolvedValueOnce({writeFile:vi.fn().mockRejectedValue(failure),close} as any);
  const unlink=vi.spyOn(fs,'unlink').mockResolvedValue(undefined);
  await expect(writeUniqueImageFile(dir,'image','png',Buffer.from('new'))).rejects.toBe(failure);
  expect(close).toHaveBeenCalledTimes(1);expect(unlink).toHaveBeenCalledWith(path.join(dir,'image.png'));
});

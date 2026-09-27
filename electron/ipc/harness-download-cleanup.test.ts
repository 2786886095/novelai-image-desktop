import {it,expect} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {discardHarnessDownload} from './harness-update';
it('cleans only a receipted, unchanged, owned download; never installed engines or user data',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-download-clean-'));
 try{
  const source=path.join(root,'downloads/0123456789abcdef');await fs.mkdir(source,{recursive:true});await fs.writeFile(path.join(source,'manifest.json'),'{}');
  expect(await discardHarnessDownload(root,source)).toBe(false);
  await fs.writeFile(path.join(source,'.studio-download.json'),JSON.stringify({manifestSha256:crypto.createHash('sha256').update('{}').digest('hex')}));
  await fs.writeFile(path.join(source,'manifest.json'),'changed');expect(await discardHarnessDownload(root,source)).toBe(false);
  expect(await discardHarnessDownload(root,path.join(root,'user-home'))).toBe(false);
  expect(await discardHarnessDownload(root,path.join(root,'versions/0123456789abcdef'))).toBe(false);
  await fs.writeFile(path.join(source,'manifest.json'),'{}');expect(await discardHarnessDownload(root,source)).toBe(true);
  await expect(fs.access(source)).rejects.toThrow();
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

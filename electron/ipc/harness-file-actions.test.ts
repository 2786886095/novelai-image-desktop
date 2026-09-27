import {it,expect} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createFileActions} from './harness-file-actions';
it('reveals only existing history images; no arbitrary paths, URLs, directories or missing files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-file-test-'));
 const file=path.join(dir,'中文 image.png'),other=path.join(dir,'other.png');await fs.writeFile(file,'fixture');await fs.writeFile(other,'fixture');
 const opened:string[]=[];const handle=createFileActions(()=>[{filePath:file},{filePath:dir},{filePath:path.join(dir,'missing.png')}],f=>opened.push(f));
 expect((await handle({args:{action:'capabilities'}})).data).toEqual({reveal:true});
 expect((await handle({args:{action:'reveal',filePath:file}})).ok).toBe(true);expect(opened).toEqual([file]);
 for(const bad of [other,dir,path.join(dir,'missing.png'),'https://example.test/a.png','file:///C:/x.png','../image.png','cmd /c start x'])expect((await handle({args:{action:'reveal',filePath:bad}})).ok).toBe(false);
 expect((await handle({args:{action:'reveal',filePath:file,command:'ignored'}})).ok).toBe(false);expect(opened).toEqual([file]);
 await fs.unlink(file);expect((await handle({args:{action:'reveal',filePath:file}})).ok).toBe(false);
});

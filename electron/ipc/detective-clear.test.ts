import {beforeEach, afterEach, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const mock=vi.hoisted(()=>({root:'',trash:vi.fn()}));
vi.mock('electron',()=>({app:{getPath:()=>mock.root},dialog:{},shell:{trashItem:mock.trash}}));
vi.mock('./store',()=>({getToken:()=>'',getSetting:()=> 'zh-CN',atomicWriteFileSync:(p:string,s:string)=>fs.writeFileSync(p,s)}));
vi.mock('./local-media-protocol',()=>({toLocalMediaUrl:(p:string)=>p}));
import {detectiveClearResults,detectiveStatus} from './artist-detective';
let run:string, image:string,configPath:string;
beforeEach(()=>{
 mock.root=fs.mkdtempSync(path.join(os.tmpdir(),'detective-clear-'));run=path.join(mock.root,'run');
 fs.mkdirSync(path.join(run,'spool/results/ab'),{recursive:true});
 image=path.join(run,'spool/results/ab', 'a'.repeat(64)+'.png');
 fs.writeFileSync(image,'image');fs.writeFileSync(image.replace('.png','.json'),JSON.stringify({image}));
 fs.writeFileSync(path.join(mock.root,'reference.png'),'reference');
 configPath=path.join(mock.root,'artist-detective-runtime.json');
 fs.writeFileSync(configPath,JSON.stringify({directory:run,image:path.join(mock.root,'reference.png'),assets:'unchanged-assets',python:'unchanged-python'}));
 mock.trash.mockReset().mockImplementation(async(p:string)=>{fs.unlinkSync(p);});
});
afterEach(()=>fs.rmSync(mock.root,{recursive:true,force:true}));
it('clears only the displayed run by default and persists after polling',async()=>{
 await detectiveClearResults({directory:run,deleteImages:false});
 expect(fs.existsSync(image)).toBe(true);expect(mock.trash).not.toHaveBeenCalled();
 expect(detectiveStatus().directory).toBeUndefined();expect(detectiveStatus().completed).toBe(0);
 expect(JSON.parse(fs.readFileSync(configPath,'utf8'))).toMatchObject({assets:'unchanged-assets',python:'unchanged-python',image:path.join(mock.root,'reference.png')});
});
it('trashes all generated spool images including unranked images, but no reference or metadata',async()=>{
 const canonicalImage=fs.realpathSync(image); // macOS resolves /var through /private/var.
 await detectiveClearResults({directory:run,deleteImages:true});
 expect(mock.trash).toHaveBeenCalledWith(canonicalImage);expect(fs.existsSync(image)).toBe(false);
 expect(fs.existsSync(image.replace('.png','.json'))).toBe(true);expect(fs.existsSync(path.join(mock.root,'reference.png'))).toBe(true);
});
it('rejects stale run IDs and non-boolean deletion choices',async()=>{
 await expect(detectiveClearResults({directory:mock.root,deleteImages:true})).rejects.toThrow();
 await expect(detectiveClearResults({directory:run,deleteImages:'yes'} as never)).rejects.toThrow();
 expect(mock.trash).not.toHaveBeenCalled();
});
it('rejects clearing a running process',async()=>{
 const c=JSON.parse(fs.readFileSync(configPath,'utf8'));fs.writeFileSync(configPath,JSON.stringify({...c,pid:process.pid}));
 await expect(detectiveClearResults({directory:run,deleteImages:true})).rejects.toThrow();
 expect(mock.trash).not.toHaveBeenCalled();
});
it('retains the run when trashing fails, allowing retry',async()=>{
 mock.trash.mockRejectedValueOnce(new Error('fixture locked'));
 await expect(detectiveClearResults({directory:run,deleteImages:true})).rejects.toThrow('fixture locked');
 expect(detectiveStatus().directory).toBe(run);expect(fs.existsSync(image)).toBe(true);
});
it('does not traverse a junction outside the run',async()=>{
 const external=path.join(mock.root,'external');fs.mkdirSync(external);
 fs.symlinkSync(external,path.join(run,'spool/results/escape'),'junction');
 await expect(detectiveClearResults({directory:run,deleteImages:true})).rejects.toThrow();
 expect(mock.trash).not.toHaveBeenCalled();
});

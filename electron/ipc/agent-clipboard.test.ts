import {it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const fixture=vi.hoisted(()=>({paths:'',formats:['FileNameW']}));
vi.mock('electron',()=>({clipboard:{availableFormats:()=>fixture.formats,readBuffer:()=>Buffer.from(fixture.paths,'utf16le')}}));
vi.mock('./image-clipboard',()=>({readClipboardImageFiles:async()=>[{name:'clipboard.png',bytes:Buffer.from('owned image fixture')}]}));
import {readAgentClipboardFiles} from './agent-clipboard';
it('copies explicit native document clipboard bytes and refuses text-as-path or unsupported files',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'owned-clipboard-'));
  try{const pdf=path.join(root,'owned.pdf');fs.writeFileSync(pdf,'owned PDF bytes');const exe=path.join(root,'no.exe');fs.writeFileSync(exe,'not an attachment');fixture.paths=[pdf,exe,'https://example.invalid/image.png','relative.txt'].join('\0')+'\0';
    if(process.platform==='win32'){const result=await readAgentClipboardFiles();expect(result).toHaveLength(1);expect(result[0].name).toBe('owned.pdf');expect(Buffer.from(result[0].bytes).toString()).toBe('owned PDF bytes');}
    fixture.formats=[];expect((await readAgentClipboardFiles())[0].name).toBe('clipboard.png');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

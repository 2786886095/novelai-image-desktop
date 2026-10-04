import {clipboard} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {readClipboardImageFiles} from './image-clipboard';

const allowed=/\.(png|jpe?g|webp|gif|bmp|avif|pdf|txt|md|jsonl?|csv|tsv|ya?ml)$/i;
/** Explicit composer gesture only; never interpret ordinary pasted text as a file. */
export async function readAgentClipboardFiles():Promise<Array<{name:string;bytes:Uint8Array}>> {
  const formats=clipboard.availableFormats();
  if(process.platform==='win32'&&formats.includes('FileNameW')) {
    const paths=clipboard.readBuffer('FileNameW').toString('utf16le').split('\0').filter(Boolean);
    const result:Array<{name:string;bytes:Uint8Array}>=[];let total=0;
    for(const file of [...new Set(paths)].slice(0,64)) {
      if(!path.isAbsolute(file)||!allowed.test(file))continue;
      const stat=await fs.stat(file);
      if(!stat.isFile()||stat.size<=0||stat.size>48*1024*1024||total+stat.size>192*1024*1024)continue;
      const bytes=await fs.readFile(file);
      if(bytes.length!==stat.size)throw Error('Clipboard file changed during import');
      total+=bytes.length;result.push({name:path.basename(file),bytes});
    }
    return result;
  }
  return readClipboardImageFiles();
}

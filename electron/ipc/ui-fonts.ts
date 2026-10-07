import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {FONT_LIMIT,FONT_MAX_BYTES,isImportedFont,validateFont,type UiFont} from '../../src/typography';
/** Only hashed managed files can be read through IPC. No font paths leave this repository. */
export class UiFontRepository {
  constructor(private readonly directory: string) {}
  private file(id:string) {if(!isImportedFont(id))throw Error('FONT_ID');return path.join(this.directory,id+'.font');}
  list(): UiFont[] {
    const file=path.join(this.directory,'catalog.json');
    if(!fs.existsSync(file))return [];
    const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||stat.size>64*1024)throw Error('FONT_CATALOG');
    const raw:unknown=JSON.parse(fs.readFileSync(file,'utf8'));
    if(!Array.isArray(raw))throw Error('FONT_CATALOG');
    return raw.filter((x):x is UiFont=>x && isImportedFont(x.id) && typeof x.name==='string' && x.name.length<=180).slice(0,FONT_LIMIT).map(x=>({id:x.id,name:x.name}));
  }
  private save(items:UiFont[]) {
    fs.mkdirSync(this.directory,{recursive:true});
    if(fs.lstatSync(this.directory).isSymbolicLink())throw Error('FONT_DIRECTORY');
    const target=path.join(this.directory,'catalog.json'),tmp=target+'.'+crypto.randomUUID()+'.tmp';
    try{fs.writeFileSync(tmp,JSON.stringify(items),{flag:'wx',mode:0o600});fs.renameSync(tmp,target);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
  }
  read(id:string): Buffer {
    const file=this.file(id);if(!this.list().some(x=>x.id===id))throw Error('FONT_MISSING');
    const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>FONT_MAX_BYTES)throw Error('FONT_SIZE');
    const bytes=fs.readFileSync(file);validateFont(bytes);
    if('font-'+crypto.createHash('sha256').update(bytes).digest('hex')!==id)throw Error('FONT_HASH');
    return bytes;
  }
  importFile(source:string):UiFont {
    if(!/\.(ttf|otf)$/i.test(source))throw Error('FONT_FORMAT');
    const stat=fs.statSync(source);if(!stat.isFile()||stat.size>FONT_MAX_BYTES)throw Error('FONT_SIZE');
    const bytes=fs.readFileSync(source);validateFont(bytes);
    const id='font-'+crypto.createHash('sha256').update(bytes).digest('hex'),items=this.list(),existing=items.find(x=>x.id===id);
    if(existing){this.read(id);return existing;}
    if(items.length>=FONT_LIMIT)throw Error('FONT_LIMIT');
    const entry={id,name:path.basename(source).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,180)};
    fs.mkdirSync(this.directory,{recursive:true});if(fs.lstatSync(this.directory).isSymbolicLink())throw Error('FONT_DIRECTORY');
    const file=this.file(id);fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
    try{this.save([...items,entry]);}catch(e){fs.unlinkSync(file);throw e;}return entry;
  }
  remove(id:string) {
    const file=this.file(id),items=this.list();this.save(items.filter(x=>x.id!==id));
    if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink())throw Error('FONT_LINK');fs.unlinkSync(file);}
  }
}

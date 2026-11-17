import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe,expect,it} from "vitest";
import {TAG_BROWSE_GROUPS,TAG_PACK_MANIFEST} from "../shared/multilingual-tag-pack-contract";
import {browseTagPackDatabase,closeTagPackReader} from "../electron/ipc/tag-pack-reader";
import {matchSettingsSection} from "./settings-search";
describe("paged search and settings",()=>{
 it("jumps beyond the first 96 terms and searches within source categories",()=>{
  const temp=mkdtempSync(join(tmpdir(),"studio-tag-browser-"));
  const terms=join(temp,"terms.sqlite"),index=join(temp,"groups.bin");
  try{
   const db=new DatabaseSync(terms);
   db.exec("CREATE TABLE terms(tag TEXT PRIMARY KEY,key TEXT,translated TEXT,translated_key TEXT,category INTEGER,count INTEGER); CREATE INDEX idx ON terms(key,count); CREATE INDEX idx2 ON terms(translated_key,count);");
   const insert=db.prepare("INSERT INTO terms VALUES(?,?,?,?,0,?)");
   for(let n=1;n<=160;n++){const tag="item"+String(n).padStart(3,"0");insert.run(tag,tag,"词"+n,"词"+n,1000-n);}
   db.close();
   const entries=Array.from({length:160},(_,i)=>i+1);
   const data=TAG_BROWSE_GROUPS.map(group=>group==="all"?entries:group==="00"?entries.slice(0,145):[]);
   const meta=Buffer.from(JSON.stringify({version:TAG_PACK_MANIFEST.updatedAt,rows:160,counts:Object.fromEntries(TAG_BROWSE_GROUPS.map((k,i)=>[k,data[i].length]))}));
   const header=Buffer.from("LBT1\0\0\0\0");header.writeUInt32LE(meta.length,4);
   const packed=Buffer.alloc(data.flat().length*4);data.flat().forEach((rowid,i)=>packed.writeUInt32LE(rowid,4*i));
   writeFileSync(index,Buffer.concat([header,meta,packed]));
   const browse=browseTagPackDatabase(terms,index,"00","",5);
   expect(browse).toMatchObject({page:5,total:145});
   expect(browse.rows[0].tag).toBe("item121");
   expect(browseTagPackDatabase(terms,index,"all","词160",0).rows[0].tag).toBe("item160");
   expect(browseTagPackDatabase(terms,index,"00","item160",0).total).toBe(0);
   expect(browseTagPackDatabase(terms,index,"all","item",999)).toMatchObject({page:6,total:160});
  }finally{closeTagPackReader(terms);rmSync(temp,{recursive:true,force:true});}
 });
 it("finds settings by real common terms, not merely category names",()=>{
  expect(matchSettingsSection("appearance","外观","托盘")).toBe(true);
  expect(matchSettingsSection("api","API 配置","代理")).toBe(true);
  expect(matchSettingsSection("backup","Backup","復元")).toBe(true);
  expect(matchSettingsSection("sound","声音","代理")).toBe(false);
 });
});

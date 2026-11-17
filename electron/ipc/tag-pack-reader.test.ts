import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {afterEach,expect,it} from "vitest";
import {browseTagPackDatabase,closeTagPackReader,lookupTagPackDatabase,searchTagPackDatabase} from "./tag-pack-reader";

import {TAG_PACK_MANIFEST} from "../../shared/multilingual-tag-pack-contract";
const directories:string[]=[];
afterEach(()=>{
  closeTagPackReader();
  for(const dir of directories.splice(0))fs.rmSync(dir,{recursive:true,force:true});
});
type Row = [string,string,string,string,number,number];
function createDb(rows:Row[]) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"studio-tag-reader-"));directories.push(dir);
  const file=path.join(dir,"fixture.sqlite");
  const db=new DatabaseSync(file);
  db.exec("CREATE TABLE terms(tag TEXT PRIMARY KEY,key TEXT,translated TEXT,translated_key TEXT,category INTEGER,count INTEGER); CREATE INDEX terms_key ON terms(key,count DESC); CREATE INDEX terms_translation ON terms(translated_key,count DESC);");
  const insert=db.prepare("INSERT INTO terms VALUES (?,?,?,?,?,?)");
  for(const row of rows)insert.run(...row);
  db.close();
  return file;
}

it("preserves exact-first prefix ranking, overlap and deterministic ties in both indexes",()=>{
  const file=createDb([
    ["blue_eye_note","blue eye note","蓝眼注记","蓝眼注记",0,2],
    ["blue","blue","蓝色","蓝色",0,3],
    ["blue_flower","blue flower","蓝花","蓝花",0,42],
    ["blue_ant","blue ant","蓝色蚂蚁","蓝色蚂蚁",0,42],
    ["cute","cute","蓝色","蓝色",0,80],
    ["blue eyes","blue eyes","蓝眼","蓝眼",0,120],
    ["Blue_eyes_second","blue eyes","另一种","另一种",0,15],
  ]);
  expect(searchTagPackDatabase(file,"blue",3).map(x=>x.tag)).toEqual(["blue","blue eyes","blue_ant"]);
  expect(searchTagPackDatabase(file,"蓝色",3).map(x=>x.tag)).toEqual(["cute","blue","blue_ant"]);
  expect(searchTagPackDatabase(file,"ＢＬＵＥ_eyes",1)[0].description).toBe("蓝眼");
  expect(lookupTagPackDatabase(file,["蓝色"],true)).toEqual([]); // homonym
  expect(lookupTagPackDatabase(file,["蓝眼"],true)[0].tag).toBe("blue eyes");
  expect(lookupTagPackDatabase(file,["蓝眼"],false)).toEqual([]);
  expect(lookupTagPackDatabase(file,["蓝眼"],true)[0].tag).toBe("blue eyes");
});

it("does not share cached objects or cached translations between packs, and drops negative hits on replacement",()=>{
  const zh=createDb([["solo","solo","单人","单人",0,1]]);
  const ja=createDb([["solo","solo","一人","一人",0,2]]);
  const first=searchTagPackDatabase(zh,"solo",5);
  first[0].description="tampered";
  expect(searchTagPackDatabase(zh,"solo",5)[0].description).toBe("单人");
  expect(lookupTagPackDatabase(zh,["other"])).toEqual([]);
  expect(searchTagPackDatabase(ja,"solo",5)[0].description).toBe("一人");
  expect(lookupTagPackDatabase(zh,["solo"])[0].description).toBe("单人");
  closeTagPackReader(zh);
  const updated=createDb([["other","other","其他","其他",0,5]]);
  fs.copyFileSync(updated,zh);
  expect(searchTagPackDatabase(zh,"solo",5)).toEqual([]);
  expect(lookupTagPackDatabase(zh,["other"])[0].description).toBe("其他");
});

it("sorts before pagination and keeps translated prefix and category constraints",()=>{
 const file=createDb([
  ["blue_z","blue z","蓝色","蓝色",0,80],
  ["blue","blue","蓝","蓝",0,2],
  ["blue_a","blue a","蓝啊","蓝啊",0,20],
  ...Array.from({length:25},(_,i):Row=>["blue q"+String(i).padStart(2,"0"),"blue q"+String(i).padStart(2,"0"),"测试"+i,"测试"+i,0,9]),
 ]);
 const index=path.join(path.dirname(file),"groups.bin");
 const ids=Array.from({length:28},(_,i)=>i+1);
 const meta=Buffer.from(JSON.stringify({version:TAG_PACK_MANIFEST.updatedAt,rows:28,counts:Object.fromEntries([["all",28],...Array.from({length:17},(_,i)=>[String(i).padStart(2,"0"),i===0?2:0])])}));
 const header=Buffer.alloc(8);header.write("LBT1");header.writeUInt32LE(meta.length,4);
 const records=Buffer.alloc(30*4);[...ids,1,3].forEach((id,i)=>records.writeUInt32LE(id,4*i));fs.writeFileSync(index,Buffer.concat([header,meta,records]));
 expect(browseTagPackDatabase(file,index,"all","blue",0).rows[0].tag).toBe("blue");
 expect(browseTagPackDatabase(file,index,"all","blue",0,"popular").rows[0].tag).toBe("blue_z");
 const first=browseTagPackDatabase(file,index,"all","",0,"alphabetical");
 const second=browseTagPackDatabase(file,index,"all","",1,"alphabetical");
 expect(first.total).toBe(28);expect(first.rows.slice(0,2).map(x=>x.tag)).toEqual(["blue","blue_a"]);
 expect(second.rows.at(-1)?.tag).toBe("blue_z");expect(new Set([...first.rows,...second.rows].map(x=>x.tag)).size).toBe(28);
 expect(browseTagPackDatabase(file,index,"00","蓝",0,"alphabetical").rows.map(x=>x.tag)).toEqual(["blue_a","blue_z"]);
 expect(searchTagPackDatabase(file,"blue",3,"popular").map(x=>x.tag)).toEqual(["blue_z","blue_a","blue q00"]);
 expect(searchTagPackDatabase(file,"blue",3,"alphabetical").map(x=>x.tag)).toEqual(["blue","blue_a","blue q00"]);
});

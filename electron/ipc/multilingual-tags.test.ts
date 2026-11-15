import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {DatabaseSync} from "node:sqlite";
import {afterAll,expect,it,vi} from "vitest";
const fixture=vi.hoisted(()=>({dir:"",input:"",network:vi.fn()}));
vi.mock("electron",()=>({
 app:{isPackaged:false,getPath:()=>fixture.dir,getAppPath:()=>fixture.dir},
 safeStorage:{isEncryptionAvailable:()=>false},
 dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[fixture.input]})},
}));
vi.mock("axios",async original=>{
 const m=await original<typeof import("axios")>();
 return {...m,default:Object.assign(m.default,{get:fixture.network})};
});
vi.mock("./agent-tools",()=>({executeAgentTool:vi.fn(),agentGenerationInput:vi.fn(),agentInpaintInput:vi.fn()}));
vi.mock("./nai",()=>({quoteAnlasCost:vi.fn(),refreshStoredAccount:vi.fn()}));
import {installMultilingualTagPack,multilingualTagStatus} from "./multilingual-tags";
import {TAG_PACK_MANIFEST} from "../../shared/multilingual-tag-pack-contract";
import {startMcpServer} from "./mcp-server";
afterAll(()=>{if(path.dirname(fixture.dir)===os.tmpdir()&&path.basename(fixture.dir).startsWith("studio-tagpack-"))fs.rmSync(fixture.dir,{recursive:true,force:true});});
it("verifies the pack before activation and returns translated offline results over real MCP tools/list and tools/call",async()=>{
 fixture.dir=fs.mkdtempSync(path.join(os.tmpdir(),"studio-tagpack-"));
 fixture.input=path.join(fixture.dir,"zh.sqlite.gz");
 const sqlite=path.join(fixture.dir,"fixture.sqlite");
 const db=new DatabaseSync(sqlite);
 db.exec("CREATE TABLE info(language, updated_at); CREATE TABLE terms(tag,key,translated,translated_key,category,count);");
 db.prepare("INSERT INTO info VALUES (?,?)").run("zh-CN",TAG_PACK_MANIFEST.updatedAt);
 db.prepare("INSERT INTO terms VALUES (?,?,?,?,?,?)").run("blue_eyes","blue eyes","蓝色眼睛","蓝色眼睛",0,1234);
 db.close();
 const raw=fs.readFileSync(sqlite),good=gzipSync(raw),sha=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
 const pack=TAG_PACK_MANIFEST.packs["zh-CN"], original={...pack};
 Object.assign(pack,{size:good.length,sha256:sha(good),databaseSize:raw.length,databaseSha256:sha(raw),count:1});
 const token="fixture-only-local-auth";
 const mcp=await startMcpServer({port:0,token,window:()=>null});
 try{
  const bad=Buffer.from(good);bad[10]^=255;fs.writeFileSync(fixture.input,bad);
  await expect(installMultilingualTagPack("zh-CN","file")).rejects.toThrow("checksum");
  expect(multilingualTagStatus().active).toBeNull();
  fs.writeFileSync(fixture.input,good);
  expect((await installMultilingualTagPack("zh-CN","file")).active).toBe("zh-CN");
  async function rpc(method:string,params:unknown){
   const response=await fetch("http://127.0.0.1:"+mcp.port+"/mcp",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
   expect(response.ok).toBe(true);return (await response.json()).result;
  }
  const list=(await rpc("tools/list",{})).tools;
  expect(list.find((t:{name:string})=>t.name==="search_tags").annotations.openWorldHint).toBe(false);
  for(const query of ["blue_eyes","蓝色"]){
   const result=await rpc("tools/call",{name:"search_tags",arguments:{query,limit:1}});
   expect(JSON.parse(result.content[0].text)).toEqual([{tag:"blue_eyes",description:"蓝色眼睛",category:0,count:1234,localizedDescription:true}]);
  }
  const miss=await rpc("tools/call",{name:"search_tags",arguments:{query:"unknown"}});
  expect(JSON.parse(miss.content[0].text)).toEqual([]);
  expect(list.find((t:{name:string})=>t.name==="search_nax_collections").annotations.openWorldHint).toBe(false);
  const nax=await rpc("tools/call",{name:"search_nax_collections",arguments:{query:"Hair Tags"}});
  const collections=JSON.parse(nax.content[0].text);
  expect(collections.source.author).toBe("u/Carlyone");
  expect(collections.items.map((x:{model:string})=>x.model)).toEqual(["V5","V4.5"]);
  expect(fixture.network).not.toHaveBeenCalled();
 }finally{Object.assign(pack,original);await mcp.close();}
});

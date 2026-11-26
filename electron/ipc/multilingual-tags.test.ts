import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {Readable} from "node:stream";
import {resumeTagPack} from "./multilingual-tags";
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
import {installMultilingualTagPack,multilingualTagStatus,lookupMultilingualTags} from "./multilingual-tags";
import {TAG_PACK_MANIFEST} from "../../shared/multilingual-tag-pack-contract";
import {startMcpServer} from "./mcp-server";
import {closeTagPackReader} from "./tag-pack-reader";
afterAll(()=>{closeTagPackReader();if(path.dirname(fixture.dir)===os.tmpdir()&&path.basename(fixture.dir).startsWith("studio-tagpack-"))fs.rmSync(fixture.dir,{recursive:true,force:true});});
it("verifies the pack before activation and returns translated offline results over real MCP tools/list and tools/call",async()=>{
 fixture.dir=fs.mkdtempSync(path.join(os.tmpdir(),"studio-tagpack-"));
 fixture.input=path.join(fixture.dir,"zh.sqlite.gz");
 const sqlite=path.join(fixture.dir,"fixture.sqlite");
 const db=new DatabaseSync(sqlite);
 db.exec("CREATE TABLE info(language, updated_at); CREATE TABLE terms(tag,key,translated,translated_key,category,count);");
 db.prepare("INSERT INTO info VALUES (?,?)").run("zh-CN",TAG_PACK_MANIFEST.updatedAt);
 db.prepare("INSERT INTO terms VALUES (?,?,?,?,?,?)").run("blue_eyes","blue eyes","蓝色眼睛","蓝色眼睛",0,1234);
 const insert=db.prepare("INSERT INTO terms VALUES (?,?,?,?,?,?)");
 insert.run("maid","maid","女仆","女仆",0,5);
 insert.run("maid_alpha","maid alpha","女仆甲","女仆甲",0,20);
 insert.run("maid_zeta","maid zeta","女仆乙","女仆乙",0,60);
 insert.run("from_above","from above","俯视","俯视",0,12);
 insert.run("apron","apron","围裙","围裙",0,42);
 db.close();
 const raw=fs.readFileSync(sqlite),good=gzipSync(raw),sha=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
 const pack=TAG_PACK_MANIFEST.packs["zh-CN"], original={...pack};
 Object.assign(pack,{size:good.length,sha256:sha(good),databaseSize:raw.length,databaseSha256:sha(raw),count:6});
 const token="fixture-only-local-auth";
 const mcp=await startMcpServer({port:0,token,window:()=>null});
  async function rpc(method:string,params:unknown){
   const response=await fetch("http://127.0.0.1:"+mcp.port+"/mcp",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
   expect(response.ok).toBe(true);return (await response.json()).result;
  }
 try{
  const bad=Buffer.from(good);bad[10]^=255;fs.writeFileSync(fixture.input,bad);
  await expect(installMultilingualTagPack("zh-CN","file")).rejects.toThrow("checksum");
  expect(multilingualTagStatus().active).toBeNull();
  const unavailable=await rpc("tools/call",{name:"search_tags",arguments:{query:"blue_eyes"}});
  expect(unavailable.isError).toBe(true);
  expect(unavailable.content[0].text).toContain("No active offline Tag pack");
  fs.writeFileSync(fixture.input,good);
  expect((await installMultilingualTagPack("zh-CN","file")).active).toBe("zh-CN");
  expect(lookupMultilingualTags(["blue eyes","blue"])).toEqual([{query:"blue eyes",tag:"blue_eyes",description:"蓝色眼睛",category:0,count:1234,localizedDescription:true}]);
  expect(lookupMultilingualTags(["蓝色眼睛"],true)[0]?.tag).toBe("blue_eyes");
  const list=(await rpc("tools/list",{})).tools;
  expect(list.find((t:{name:string})=>t.name==="search_tags").annotations.openWorldHint).toBe(false);
  for(const query of ["blue_eyes","蓝色","眼睛","ue_ey"]){
   const result=await rpc("tools/call",{name:"search_tags",arguments:{query,limit:1}});
   expect(JSON.parse(result.content[0].text)).toEqual([{tag:"blue_eyes",description:"蓝色眼睛",category:0,count:1234,localizedDescription:true}]);
  }
  expect(list.find((t:{name:string})=>t.name==="search_tags").inputSchema.properties.sort.enum).toEqual(["relevance","popular","alphabetical"]);
  expect(list.find((t:{name:string})=>t.name==="related_offline_tags").annotations.openWorldHint).toBe(false);
  for(const [sort,first] of [["relevance","maid"],["popular","maid_zeta"],["alphabetical","maid"]]){
   const result=await rpc("tools/call",{name:"search_tags",arguments:{query:"女仆",sort,limit:1}});
   expect(JSON.parse(result.content[0].text)[0].tag).toBe(first);
  }
  const related=await rpc("tools/call",{name:"related_offline_tags",arguments:{tags:["女仆"],limit:8}});
  expect(JSON.parse(related.content[0].text)).toEqual([{tag:"apron",description:"围裙",category:0,count:42,localizedDescription:true}]);
  const selected=await rpc("tools/call",{name:"related_offline_tags",arguments:{tags:["maid","apron"]}});
  expect(JSON.parse(selected.content[0].text)).toEqual([]);
  // Reinstall while a cached read connection is active (important on Windows).
  expect((await installMultilingualTagPack("zh-CN","file")).active).toBe("zh-CN");
  const miss=await rpc("tools/call",{name:"search_tags",arguments:{query:"unknown"}});
  expect(JSON.parse(miss.content[0].text)).toEqual([]);
  expect(list.find((t:{name:string})=>t.name==="search_nax_collections").annotations.openWorldHint).toBe(false);
  const nax=await rpc("tools/call",{name:"search_nax_collections",arguments:{query:"Hair Tags"}});
  const collections=JSON.parse(nax.content[0].text);
  expect(collections.source.author).toBe("u/Carlyone");
  expect(collections.items.map((x:{model:string})=>x.model)).toEqual(["V5","V4.5"]);
  expect(fixture.network).not.toHaveBeenCalled();
  const topicResult=await rpc("tools/call",{name:"search_tags",arguments:{query:"构图",limit:10}});
  expect(JSON.parse(topicResult.content[0].text)).toEqual([{tag:"from_above",description:"俯视",category:0,count:12,localizedDescription:true}]);
  const browseNax=list.find((t:{name:string})=>t.name==="browse_nax_collection");
  expect(browseNax.annotations.openWorldHint).toBe(true);
  const invalid=await rpc("tools/call",{name:"browse_nax_collection",arguments:{collectionId:"unknown"}});
  expect(invalid.isError).toBe(true);
  expect(fixture.network).not.toHaveBeenCalled();
  const id="danbooru-hair-tags-v5",url="https://cdn.zele.st/data/NAX/Images/"+id+"/bob.webp";
  fixture.network.mockResolvedValueOnce({data:'<img src="'+url+'" alt="An image depicting bob cut">'});
  const album=await rpc("tools/call",{name:"browse_nax_collection",arguments:{collectionId:id,chapter:2}});
  expect(JSON.parse(album.content[0].text)).toMatchObject({source:{author:"u/Carlyone"},chapter:2,page:1,images:[{tag:"bob cut",url}]});
  expect(fixture.network).toHaveBeenCalledExactlyOnceWith("https://nax.moe/?gallery="+id+"&sort=date&page=2",expect.any(Object));
 }finally{Object.assign(pack,original);await mcp.close();}
});

it("keeps verified archive offline and resumes without another full transfer",async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-resume-'));
 const file=path.join(dir,'pack.part'),url='https://github.com/example/repo/releases/download/tag/tag_catalog.db';
 const hash=createHash('sha256').update('abcd').digest('hex');
 try {
  fs.writeFileSync(file,'ab');
  fixture.network.mockReset().mockResolvedValueOnce({status:206,headers:{'content-range':'bytes 2-3/4'},data:Readable.from([Buffer.from('cd')])});
  await resumeTagPack(url,file,4,hash);
  expect(fixture.network.mock.calls[0][1].headers.Range).toBe('bytes=2-');
  await resumeTagPack(url,file,4,hash);
  expect(fixture.network).toHaveBeenCalledTimes(1);
  expect(fs.readFileSync(file,'utf8')).toBe('abcd');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

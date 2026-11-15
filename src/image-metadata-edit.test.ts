import {expect,it} from "vitest";
import {PNG} from "pngjs";
import {readFileSync} from "node:fs";
import {rewriteGenerationMetadata} from "./image-metadata-edit";
import {parsePngMeta} from "./png-meta";
import {readStealthMetadataPixels} from "./png-metadata-codecs";
const decode=async (bytes:Uint8Array)=>{
 const p=PNG.sync.read(Buffer.from(bytes));
 return {data:new Uint8Array(p.data),width:p.width,height:p.height,channels:4};
};
const folder=new URL("../shared/image-metadata-compat-fixtures/",import.meta.url);
function read(name:string){return Uint8Array.from(readFileSync(new URL(name,folder)));}
it("strips container and known alpha-pixel metadata without changing the original",async()=>{
 const image=read("stealth-gzip.png"),original=Uint8Array.from(image);
 const before=await decode(image);
 expect(readStealthMetadataPixels(before.data,before.width,before.height)).not.toEqual({});
 const cleaned=await rewriteGenerationMetadata(image,{kind:"remove"},decode);
 const after=await decode(cleaned);
 expect(readStealthMetadataPixels(after.data,after.width,after.height)).toEqual({});
 expect(parsePngMeta(cleaned.buffer)).toEqual({});
 expect(image).toEqual(original);
 expect([after.width,after.height]).toEqual([before.width,before.height]);
});
it("writes NovelAI JSON, SD parameters and then removes them on a second pass",async()=>{
 const seed=read("compressed-itxt.png");
 const novel=await rewriteGenerationMetadata(seed,{kind:"novelai",text:JSON.stringify({prompt:"青空",seed:123})},decode);
 const meta=parsePngMeta(novel.buffer);
 expect(meta.Software).toBe("NovelAI");
 expect(JSON.parse(meta.Comment)).toEqual({prompt:"青空",seed:123});
 const sd=await rewriteGenerationMetadata(novel,{kind:"sd",text:"blue sky\nNegative prompt: rain\nSteps: 22, Seed: 42"},decode);
 const parsed=parsePngMeta(sd.buffer);
 expect(parsed).toEqual({parameters:"blue sky\nNegative prompt: rain\nSteps: 22, Seed: 42"});
 expect(parsePngMeta((await rewriteGenerationMetadata(sd,{kind:"remove"},decode)).buffer)).toEqual({});
});
it("rejects unsupported and corrupt images, and invalid JSON edits",async()=>{
 const png=read("stealth-gzip.png");
 await expect(rewriteGenerationMetadata(png.slice(0,-15),{kind:"remove"},decode)).rejects.toThrow();
 await expect(rewriteGenerationMetadata(png,{kind:"novelai",text:"[]"},decode)).rejects.toThrow("JSON object");
 await expect(rewriteGenerationMetadata(new Uint8Array(50),{kind:"remove"},decode)).rejects.toThrow("PNG");
});

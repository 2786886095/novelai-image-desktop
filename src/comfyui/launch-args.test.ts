import { describe,it,expect } from "vitest";
import { buildComfyArgs,parseExtraArgs,tokenizeArgs } from "./launch-args";
import type { ComfyLaunchOptions } from "./contract";
const options:ComfyLaunchOptions={port:8188,readyTimeoutSec:300,disableApiNodes:true,safeMode:false,extraArgs:[]};
describe("shell-free static launch allow-list",()=>{
  it("tokenizes quoted absolute Windows paths without destroying backslashes",()=>{
    expect(tokenizeArgs('--extra-model-paths-config "C:\\Models Folder\\extra.yaml" --lowvram')).toEqual(["--extra-model-paths-config","C:\\Models Folder\\extra.yaml","--lowvram"]);
    expect(tokenizeArgs('--output-directory "C:\\Models Folder\\"')).toEqual(["--output-directory","C:\\Models Folder\\"]);
    expect(parseExtraArgs('--cuda-device=0 --preview-method auto --reserve-vram 1.5')).toEqual(["--cuda-device","0","--preview-method","auto","--reserve-vram","1.5"]);
  });
  it.each(["--listen 0.0.0.0","--port=9000","--tls-keyfile key","--enable-manager","--enable-manager-legacy","--front-end-root C:/evil","--database-url sqlite://x","--auto-launch","--disable-auto-launch","--dont-print-server","--unknown"])("rejects reserved/unknown flag %s",text=>expect(()=>parseExtraArgs(text)).toThrow());
  it("rejects shell syntax, unterminated quotes, duplicate/conflicting or invalid values",()=>{
    for(const text of ['--lowvram & calc','--preview-method "auto','--lowvram --lowvram','--cpu --gpu-only','--verbose ERROR','--cuda-device -1','--reserve-vram Infinity','--cache-lru 2.5','--preview-method nope','--output-directory ../outside'])expect(()=>parseExtraArgs(text)).toThrow();
    expect(()=>parseExtraArgs(["--lowvram\n--port", "2"])).toThrow();
  });
  it("enforces installed flags only when live help flags are supplied",()=>{
    expect(parseExtraArgs("--disable-dynamic-vram")).toEqual(["--disable-dynamic-vram"]);
    expect(()=>parseExtraArgs("--disable-dynamic-vram",["--lowvram"])).toThrow("--help");
  });
  it("returns SERVER FLAGS ONLY, fixes loopback and never duplicates Python/main.py",()=>{
    const args=buildComfyArgs(null,options);expect(args).toEqual(["--listen","127.0.0.1","--port","8188","--disable-auto-launch"]);
    const supported=["--listen","--port","--disable-auto-launch","--disable-api-nodes","--disable-all-custom-nodes","--lowvram"];
    expect(buildComfyArgs(null,{...options,safeMode:true,extraArgs:["--lowvram"]},supported)).toEqual([...args,"--disable-api-nodes","--disable-all-custom-nodes","--lowvram"]);
    expect(args.some(arg=>arg.endsWith("main.py")||arg==="-s")).toBe(false);
    expect(()=>buildComfyArgs(null,{...options,port:0})).toThrow();expect(()=>buildComfyArgs(null,options,[])).toThrow("required");
    expect(()=>buildComfyArgs(null,{...options,safeMode:true},supported.filter(flag=>flag!=="--disable-all-custom-nodes"))).toThrow("safe mode");
  });
});

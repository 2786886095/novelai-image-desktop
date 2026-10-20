import { COMFY_LIMITS } from "./contract";
import type { ComfyInstallConfig, ComfyInstallInspection, ComfyLaunchOptions } from "./contract";
import { ComfyValidationError } from "./format-detect";

type Rule = {kind:"flag"|"int"|"number"|"enum"|"path";min?:number;max?:number;choices?:readonly string[];group?:string};
const flag = (group?:string):Rule => ({kind:"flag",...(group ? {group} : {})});
export const EXTRA_PATH_FLAGS: Readonly<Record<string,"file"|"directory">> = {"--extra-model-paths-config":"file","--output-directory":"directory","--input-directory":"directory","--temp-directory":"directory","--user-directory":"directory","--base-directory":"directory"};
export const ALLOWED_EXTRA_FLAGS: Readonly<Record<string,Rule>> = {
  "--cpu":flag("vram"),"--gpu-only":flag("vram"),"--highvram":flag("vram"),"--normalvram":flag("vram"),"--lowvram":flag("vram"),"--novram":flag("vram"),
  "--disable-smart-memory":flag(),"--disable-dynamic-vram":flag(),"--force-fp32":flag("precision"),"--force-fp16":flag("precision"),
  "--fp32-unet":flag("unet-precision"),"--fp64-unet":flag("unet-precision"),"--bf16-unet":flag("unet-precision"),"--fp16-unet":flag("unet-precision"),"--fp8_e4m3fn-unet":flag("unet-precision"),"--fp8_e5m2-unet":flag("unet-precision"),
  "--fp16-vae":flag("vae-precision"),"--fp32-vae":flag("vae-precision"),"--bf16-vae":flag("vae-precision"),"--cpu-vae":flag(),
  "--fp8_e4m3fn-text-enc":flag("clip-precision"),"--fp8_e5m2-text-enc":flag("clip-precision"),"--fp16-text-enc":flag("clip-precision"),"--fp32-text-enc":flag("clip-precision"),"--bf16-text-enc":flag("clip-precision"),
  "--use-split-cross-attention":flag("attention"),"--use-quad-cross-attention":flag("attention"),"--use-pytorch-cross-attention":flag("attention"),"--use-sage-attention":flag("attention"),"--use-flash-attention":flag("attention"),"--disable-xformers":flag(),
  "--force-upcast-attention":flag("upcast"),"--dont-upcast-attention":flag("upcast"),"--disable-ipex-optimize":flag(),"--disable-mmap":flag(),"--mmap-torch-files":flag(),"--fast":flag(),"--deterministic":flag(),
  "--cache-classic":flag("cache"),"--cache-none":flag("cache"),"--cache-lru":{kind:"int",min:0,max:10000,group:"cache"},
  "--cuda-device":{kind:"int",min:0,max:255},"--default-device":{kind:"int",min:0,max:255},"--reserve-vram":{kind:"number",min:0,max:1024},
  "--preview-method":{kind:"enum",choices:["none","auto","latent2rgb","taesd"]},"--preview-size":{kind:"int",min:64,max:4096},"--verbose":{kind:"enum",choices:["DEBUG","INFO"]},
  ...Object.fromEntries(Object.keys(EXTRA_PATH_FLAGS).map((key)=>[key,{kind:"path" as const}])),
};
export const FORBIDDEN_FLAGS = ["--listen","--port","--tls-keyfile","--tls-certfile","--enable-cors-header","--auto-launch","--disable-auto-launch","--windows-standalone-build","--front-end-version","--front-end-root","--comfy-api-base","--multi-user","--dont-print-server","--quick-test-for-ci","--database-url","--disable-api-nodes","--disable-all-custom-nodes"] as const;
function fail(message:string):never { throw new ComfyValidationError(`COMFY_LAUNCH_ARGS: ${message}`,"value-type"); }
export function tokenizeArgs(text:string):string[] {
  if (typeof text !== "string" || text.length > COMFY_LIMITS.extraArgChars || /[\0\r\n;&|<>`$]/.test(text)) fail("Unsafe or oversized argument text");
  const tokens:string[] = []; let token="", quote="", started=false;
  for (let index=0;index<text.length;index++) {
    const char=text[index];
    // This is a grouping tokenizer, not a shell. Preserve Windows backslashes,
    // including a directory separator immediately before the closing quote.
    if (quote) { if (char===quote) {quote="";started=true;} else token+=char; }
    else if (char==='"' || char==="'") {quote=char;started=true;}
    else if (/\s/.test(char)) {if(started || token){tokens.push(token);token="";started=false;}}
    else {token+=char;started=true;}
  }
  if(quote) fail("Unterminated quoted argument"); if(started||token)tokens.push(token);
  return tokens;
}
export function parseExtraArgs(input:string|readonly string[],supportedFlags?:readonly string[]):string[] {
  const raw=typeof input==="string"?tokenizeArgs(input):Array.isArray(input)?[...input]:fail("Expected token array or argument text");
  if(raw.length>COMFY_LIMITS.extraArgTokens || raw.some((value)=>typeof value!=="string" || !value || /[\0\r\n;&|<>`$]/.test(value)) || raw.join(" ").length>COMFY_LIMITS.extraArgChars) fail("Unsafe or oversized argument list");
  const tokens=raw.flatMap((token)=>token.startsWith("--")&&token.includes("=")?[token.slice(0,token.indexOf("=")),token.slice(token.indexOf("=")+1)]:[token]);
  const result:string[]=[],seen=new Set<string>(),groups=new Set<string>();
  for(let index=0;index<tokens.length;index++){
    const name=tokens[index];
    if((FORBIDDEN_FLAGS as readonly string[]).includes(name) || /^--(?:tls-|enable-manager)/.test(name))fail(`Reserved flag: ${name}`);
    const rule=ALLOWED_EXTRA_FLAGS[name]; if(!rule)fail(`Flag is not allow-listed: ${name}`);
    if(seen.has(name))fail(`Duplicate flag: ${name}`);seen.add(name);
    if(rule.group&&groups.has(rule.group))fail(`Conflicting ${rule.group} flags`);if(rule.group)groups.add(rule.group);
    if(supportedFlags&&!supportedFlags.includes(name))fail(`Installed ComfyUI --help does not report ${name}`);
    result.push(name);if(rule.kind==="flag")continue;
    const value=tokens[++index];if(!value||value.startsWith("--"))fail(`Missing value for ${name}`);
    if(rule.kind==="enum"&&!rule.choices?.includes(value))fail(`Invalid value for ${name}`);
    if(rule.kind==="int"||rule.kind==="number"){
      const number=Number(value);if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)||!Number.isFinite(number)||(rule.kind==="int"&&!Number.isSafeInteger(number))||(rule.min!==undefined&&number<rule.min)||(rule.max!==undefined&&number>rule.max))fail(`Out-of-range value for ${name}`);
    }
    if(rule.kind==="path"&&(!/^(?:[A-Za-z]:[\\/]|\/(?!\/))/.test(value)||value.split(/[\\/]/).includes("..")||/^\\\\/.test(value)))fail(`Path for ${name} must be an absolute local path; main process must also verify existence`);
    result.push(value);
  }
  if(result.length>COMFY_LIMITS.extraArgTokens)fail("Too many expanded argument tokens");return result;
}
/** Server flags ONLY. buildLaunchSpec owns Python args and the single main.py. */
export function buildComfyArgs(install:ComfyInstallConfig|null,launch:ComfyLaunchOptions,supportedFlags?:readonly string[]):string[]{
  if(!Number.isInteger(launch.port)||launch.port<1||launch.port>65535||!Number.isFinite(launch.readyTimeoutSec)||launch.readyTimeoutSec<COMFY_LIMITS.readyTimeoutSecMin||launch.readyTimeoutSec>COMFY_LIMITS.readyTimeoutSecMax||typeof launch.disableApiNodes!=="boolean"||typeof launch.safeMode!=="boolean")fail("Invalid launch settings");
  const inspection=install as ComfyInstallInspection|null;
  const supported=supportedFlags??(inspection?.helpProbe==="passed"?inspection.supportedFlags:undefined);
  for(const required of ["--listen","--port","--disable-auto-launch"])if(supported&&!supported.includes(required))fail(`Missing required installed flag: ${required}`);
  if(launch.safeMode&&supported&&!supported.includes("--disable-all-custom-nodes"))fail("Installed ComfyUI cannot enforce the requested safe mode");
  const args=["--listen","127.0.0.1","--port",String(launch.port),"--disable-auto-launch"];
  if(launch.disableApiNodes&&supported?.includes("--disable-api-nodes"))args.push("--disable-api-nodes");
  if(launch.safeMode&&supported?.includes("--disable-all-custom-nodes"))args.push("--disable-all-custom-nodes");
  return [...args,...parseExtraArgs(launch.extraArgs,supported)];
}

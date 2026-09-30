import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
// Compile the actual exports, including composed/derived templates. Regex
// extraction silently went stale once V4.5 exports became expressions.
function exportsOf(name){
  const code=ts.transpileModule(fs.readFileSync(path.join(root,"src/data",name),"utf8"),{compilerOptions:{esModuleInterop:true,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};
  Function("module","exports","require",code)(module,module.exports,createRequire(path.join(root,"src/data",name)));
  return module.exports;
}
const current=exportsOf("prompt-templates.ts"),legacy=exportsOf("prompt-templates-v45.ts");
const output={reverse:current.REVERSE_SYSTEM_PROMPTS,reverseV45:legacy.V45_REVERSE_SYSTEM_PROMPTS,convert:current.CONVERT_SYSTEM_PROMPTS,convertV45:legacy.V45_CONVERT_SYSTEM_PROMPTS,scopedReverse:current.SCOPED_REVERSE_SYSTEM_PROMPTS,scopedReverseV45:legacy.V45_SCOPED_REVERSE_SYSTEM_PROMPTS,comic:current.COMIC_ANALYZE_SYSTEM_PROMPTS,comicLegacy:current.COMIC_ANALYZE_SYSTEM_PROMPT};
for(const [key,modes] of Object.entries(output)){
  if(key==="comicLegacy")continue;
  for(const mode of ["tags","natural","mixed"])if(typeof modes?.[mode]!=="string"||!modes[mode].trim())throw new Error(`${key}.${mode} is empty`);
}
const target=path.join(root,"mobile/assets/prompt_templates.json");
if(process.argv.includes("--check")){
  if(JSON.stringify(JSON.parse(fs.readFileSync(target,"utf8")))!==JSON.stringify(output))throw new Error("Mobile prompt templates are stale; run sync-mobile-prompt-templates.mjs");
  console.log("TEMPLATE PARITY PASS: 21 mode/version templates match desktop exports.");
}else{
  fs.writeFileSync(target,JSON.stringify(output,null,2)+"\n","utf8");
  console.log("Synced 21 mode/version templates from desktop exports.");
}

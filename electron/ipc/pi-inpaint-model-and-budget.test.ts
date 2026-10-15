import { expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { studioPiToolSchema } from "./pi-studio-tool-schema";
import { buildAgentInpaintInput, defaultAgentInpaintModel } from "../../src/agent/generation-input";
import { DEFAULT_PARAMS, NAI_INPAINT_MODELS } from "../../src/types";

const defaults = { params: { ...DEFAULT_PARAMS, model: "nai-diffusion-5-full" as const } };
const base = { attachmentId: "fixture-source", maskAttachmentId: "fixture-mask", positivePrompt: "fixture only" };

async function validated(args: Record<string, unknown>) {
  // Load only Pi's installed validator, not provider discovery or user settings.
  const code = String.raw`
import {createRequire} from 'node:module';import path from 'node:path';import {pathToFileURL} from 'node:url';
const req=createRequire(path.join(process.cwd(),'package.json')),payload=JSON.parse(process.argv[1]);
const [{Type},{validateToolArguments}]=await Promise.all([import(pathToFileURL(req.resolve('typebox')).href),import(pathToFileURL(path.resolve('node_modules/@earendil-works/pi-ai/dist/utils/validation.js')).href)]);
try{const tool={name:'langbai_inpaint_image',description:'fixture only',parameters:Type.Object({args:Type.Unsafe(payload.schema)},{additionalProperties:false})};console.log(JSON.stringify({ok:true,args:validateToolArguments(tool,{type:'toolCall',id:'fixture',name:tool.name,arguments:{args:payload.args}}).args}));}
catch(e){console.log(JSON.stringify({ok:false,error:e.message}));process.exitCode=2;}
`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code,
    JSON.stringify({ schema: studioPiToolSchema("langbai_inpaint_image"), args }),
  ], { encoding: "utf8", timeout: 10_000 });
  if (!result.stdout.trim()) throw new Error(result.stderr || "Pi validator returned no output");
  const response = JSON.parse(result.stdout);
  if (result.status !== 0 || !response.ok) throw new Error(response.error || result.stderr);
  return response.args;
}

it("Pi accepts explicit V4.5 inpaint on a V5 workbench and the actual builder preserves it", async () => {
  const args = { ...base, inpaintModel: "nai-diffusion-4-5-full-inpainting", preciseReferences: [{ attachmentId: "fixture-ref" }] };
  const accepted = await validated(args);
  const input = buildAgentInpaintInput(accepted, defaults, () => "fixture-reference-bytes");
  expect(input.inpaintModel).toBe(args.inpaintModel);
  expect(input.params.model).toBe("nai-diffusion-4-5-full");
  expect(input.extras.preciseReferences).toHaveLength(1);
  expect(studioPiToolSchema("langbai_inpaint_image")).toMatchObject({ additionalProperties: false,
    properties: { inpaintModel: { enum: NAI_INPAINT_MODELS.map(item => item.value) } } });
});

it("Pi rejects an invalid explicit inpaint enum instead of forwarding it", async () => {
  await expect(validated({ ...base, inpaintModel: "fixture-not-a-model" })).rejects.toThrow("Validation failed");
});

it("Pi explicit curated input agrees with the direct builder without changing the existing fallback", async () => {
  const explicit = { ...base, inpaintModel: "nai-diffusion-4-5-curated-inpainting" };
  const fromSchema = buildAgentInpaintInput(await validated(explicit), defaults);
  expect(fromSchema).toEqual(buildAgentInpaintInput(explicit, defaults));
  expect(fromSchema.params.model).toBe("nai-diffusion-4-5-curated");
  const inherited = { ...base, model: "nai-diffusion-4-5-curated" };
  const fallback = buildAgentInpaintInput(await validated(inherited), defaults);
  expect(fallback).toEqual(buildAgentInpaintInput(inherited, defaults));
  expect(fallback.inpaintModel).toBe(defaultAgentInpaintModel("nai-diffusion-4-5-curated"));
  expect(fallback.inpaintModel).toBe("nai-diffusion-4-5-full-inpainting");
});

it("Pi omission still uses the unchanged V5 workbench default resolver", async () => {
  const input = buildAgentInpaintInput(await validated(base), defaults);
  expect(input.inpaintModel).toBe(defaultAgentInpaintModel(defaults.params.model));
});

it("MCP uses complete canonical totals once for both formula and official quotes", () => {
  // Reuse the isolated authority loader, without changing its frozen 15 cases.
  // This supplemental runner executes eight separate production-flow cases.
  const original = fs.readFileSync(path.resolve("scripts/check-agent-inpaint-parameters.cjs"), "utf8");
  const boundary = original.indexOf("(async()=>{\n await check(");
  expect(boundary).toBeGreaterThan(0);
  let prefix = original.slice(0, boundary);
  expect(prefix).toContain("let settings;");
  expect(prefix).toContain("quotes.push(clean(input));return load(");
  prefix = prefix.replace("let settings;", "let settings; let quoteOverride;")
    .replace("quotes.push(clean(input));return load(", "quotes.push(clean(input));if(quoteOverride)return {...quoteOverride};return load(")
    .replace("calls.length=0;quotes.length=0;", "calls.length=0;quotes.length=0;quoteOverride=undefined;");
  const cases = String.raw`
(async()=>{
 for(const refs of [2,3])await check('formula-inpaint-reference-count-'+refs,async()=>{
  reset();settings.mcpMaxAnlasPerCall=5+5*refs;
  const result=await runMcp('inpaint',{image:'mcp-fixture:image',mask:'mcp-fixture:mask',positivePrompt:'fixture',preciseReferences:Array.from({length:refs},()=>({image:'mcp-fixture:ref'}))});
  const amount=JSON.parse(resultText(result)).anlas.amount;assert.equal(amount,5+5*refs);assert.equal(calls.length,1);return {refs,amount,cap:settings.mcpMaxAnlasPerCall,backendCalls:1};
 });
 await check('formula-inpaint-cap-below-real-total-blocks',async()=>{
  reset();settings.mcpMaxAnlasPerCall=14;let error;try{await runMcp('inpaint',{image:'mcp-fixture:image',mask:'mcp-fixture:mask',positivePrompt:'fixture',preciseReferences:[{image:'mcp-fixture:ref'},{image:'mcp-fixture:ref'}]});}catch(e){error=e.message;}
  assert.match(error||'',/15 Anlas/);assert.equal(calls.length,0);return {amount:15,cap:14,backendCalls:0};
 });
 await check('formula-generate-reference-count-times-samples-once',async()=>{
  reset();settings.mcpMaxAnlasPerCall=20;const result=await runMcp('generate_image',{positivePrompt:'fixture',count:2,preciseReferences:[{image:'mcp-fixture:ref'},{image:'mcp-fixture:ref'}]});
  assert.equal(JSON.parse(resultText(result)).anlas.amount,20);assert.equal(calls.length,2);return {refs:2,samples:2,amount:20,backendCalls:2};
 });
 await check('official-complete-two-references-cap-exact-total-allows',async()=>{
  reset();settings.mcpMaxAnlasPerCall=15;quoteOverride={ok:true,source:'official-api',amount:15,balance:100,message:'fixture official complete reference-inclusive total'};
  const result=await runMcp('generate_image',{positivePrompt:'fixture',preciseReferences:[{image:'mcp-fixture:ref'},{image:'mcp-fixture:ref'}]});assert.equal(JSON.parse(resultText(result)).anlas.amount,15);assert.equal(calls.length,1);return {canonicalTotal:15,refs:2,amount:15,backendCalls:1};
 });
 await check('official-complete-reference-inclusive-cap-still-blocks',async()=>{
  reset();settings.mcpMaxAnlasPerCall=14;quoteOverride={ok:true,source:'official-api',amount:15,balance:100,message:'fixture official complete reference-inclusive total'};let error;
  try{await runMcp('generate_image',{positivePrompt:'fixture',preciseReferences:[{image:'mcp-fixture:ref'},{image:'mcp-fixture:ref'}]});}catch(e){error=e.message;}
  assert.match(error||'',/15 Anlas/);assert.equal(calls.length,0);return {canonicalTotal:15,refs:2,amount:15,cap:14,backendCalls:0};
 });
 await check('official-complete-reference-count-times-samples-retained',async()=>{
  reset();settings.mcpMaxAnlasPerCall=40;quoteOverride={ok:true,source:'official-api',amount:40,balance:100,message:'fixture official complete total for two outputs'};
  const result=await runMcp('generate_image',{positivePrompt:'fixture',count:2,preciseReferences:Array.from({length:3},()=>({image:'mcp-fixture:ref'}))});assert.equal(JSON.parse(resultText(result)).anlas.amount,40);assert.equal(calls.length,2);return {canonicalTotal:40,refs:3,samples:2,amount:40,backendCalls:2};
 });
 await check('plain-inpaint-quote-stays-unchanged',async()=>{
  reset();settings.mcpMaxAnlasPerCall=5;const result=await runMcp('inpaint',{image:'mcp-fixture:image',mask:'mcp-fixture:mask',positivePrompt:'fixture'});assert.equal(JSON.parse(resultText(result)).anlas.amount,5);assert.equal(calls.length,1);return {amount:5,backendCalls:1};
 });
 const report={scope:'supplemental actual production MCP flow; fixture account/backend; formula amounts are not real paid debits',checks,allPass:checks.every(x=>x.pass)};
 fs.writeFileSync(path.join(out,'RESULTS.json'),JSON.stringify(report,null,2)+'\n');console.log('SUPPLEMENT '+checks.filter(x=>x.pass).length+'/'+checks.length);if(!report.allPass)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=2;});
`;
  const tempRoot = path.resolve(os.tmpdir());
  const output = fs.mkdtempSync(path.join(tempRoot, "langbai-pi-inpaint-budget-"));
  try {
    const runner = path.join(output, "supplement.cjs");
    fs.writeFileSync(runner, prefix + cases);
    const result = spawnSync(process.execPath, [runner, process.cwd(), output], { encoding: "utf8", timeout: 20_000 });
    if (process.env.AGENT_INPAINT_FOLLOWUP_EVIDENCE_DIR) {
      const evidence = path.resolve(process.env.AGENT_INPAINT_FOLLOWUP_EVIDENCE_DIR);
      fs.mkdirSync(evidence, { recursive: true });
      fs.writeFileSync(path.join(evidence, "child.stdout.txt"), result.stdout);
      fs.writeFileSync(path.join(evidence, "child.stderr.txt"), result.stderr);
      fs.copyFileSync(runner, path.join(evidence, "supplement.cjs"));
      if (fs.existsSync(path.join(output, "RESULTS.json"))) fs.copyFileSync(path.join(output, "RESULTS.json"), path.join(evidence, "RESULTS.json"));
    }
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const report = JSON.parse(fs.readFileSync(path.join(output, "RESULTS.json"), "utf8"));
    expect(report.checks).toHaveLength(8);
    expect(report.allPass).toBe(true);
  } finally {
    if (path.dirname(path.resolve(output)) !== tempRoot || !path.basename(output).startsWith("langbai-pi-inpaint-budget-")) throw new Error("Unsafe supplemental fixture path");
    fs.rmSync(output, { recursive: true, force: true });
  }
});

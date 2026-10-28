import { expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Supplemental MCP budget cases executed through the actual production MCP
// flow loaded by scripts/check-agent-inpaint-parameters.cjs.
it.each(["LF", "CRLF"] as const)("MCP uses complete canonical totals once with a real %s fixture file", (lineEnding) => {
  // Reuse the isolated authority loader, without changing its frozen 15 cases.
  // Execute all eight production-flow cases after reading each real newline variant.
  const tempRoot = path.resolve(os.tmpdir());
  const output = fs.mkdtempSync(path.join(tempRoot, "langbai-pi-inpaint-budget-"));
  try {
  const normalized = fs.readFileSync(path.resolve("scripts/check-agent-inpaint-parameters.cjs"), "utf8").replace(/\r\n/g, "\n");
  const fixture = path.join(output, `source-fixture-${lineEnding}.cjs`);
  fs.writeFileSync(fixture, lineEnding === "CRLF" ? normalized.replace(/\n/g, "\r\n") : normalized);
  const original = fs.readFileSync(fixture, "utf8");
  expect(original.includes("\r\n")).toBe(lineEnding === "CRLF");
  const boundary = original.search(/\(async\(\)=>\{\r?\n await check\(/);
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
    const runner = path.join(output, "supplement.cjs");
    fs.writeFileSync(runner, prefix + cases);
    const result = spawnSync(process.execPath, [runner, process.cwd(), output], { encoding: "utf8", timeout: 20_000 });
    if (process.env.AGENT_INPAINT_FOLLOWUP_EVIDENCE_DIR) {
      const evidence = path.join(path.resolve(process.env.AGENT_INPAINT_FOLLOWUP_EVIDENCE_DIR), lineEnding);
      fs.mkdirSync(evidence, { recursive: true });
      fs.writeFileSync(path.join(evidence, "child.stdout.txt"), result.stdout);
      fs.writeFileSync(path.join(evidence, "child.stderr.txt"), result.stderr);
      fs.copyFileSync(runner, path.join(evidence, "supplement.cjs"));
      fs.copyFileSync(fixture, path.join(evidence, `source-fixture-${lineEnding}.cjs`));
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

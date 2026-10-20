import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseComfyWorkflow, analyzeComfyWorkflow } from './comfyui-analysis';
import { builtinComfyGraphs, builtinComfyWorkflows } from './comfyui-presets';
import { corePrompt, rawCoreCatalog, coreCatalog } from '../../src/comfyui/core.test-fixtures';
import { stableStringify } from '../../src/comfyui/canonical';
import type { ComfySlotValue } from '../../src/comfyui/contract';
import type { ComfyApiPrompt } from '../../src/comfyui/api-prompt';
import type { StoredComfyWorkflow } from './comfyui-service';

// Intentionally NO mocked parser/compiler. These are the production Electron
// adapter's imports; synthetic catalog names never claim installed model files.
const sha = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
const catalogRevision = (input: unknown) => sha(stableStringify(input));
const catalogSha = catalogRevision(rawCoreCatalog);
function record(payload: unknown = corePrompt(), format: 'api' | 'ui' = 'api', extra: Partial<StoredComfyWorkflow> = {}): StoredComfyWorkflow {
  return { id: 'analysis-fixture', name: 'Production compiler test fixture', createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z',
    sourceKind: format === 'api' ? 'api-json' : 'ui-json', sourceFormat: format, sourceSha256: sha(JSON.stringify(payload)), fileName: null,
    templateName: null, familyLabel: null, lastAnalysis: null, savedValues: {}, payload, ...extra };
}
function check(source: StoredComfyWorkflow, values: Record<string, ComfySlotValue> = {}, catalog: unknown = rawCoreCatalog, revision = catalogRevision(catalog)) {
  return analyzeComfyWorkflow(source, catalog, revision, values);
}
function evidence(name: string, value: unknown) {
  const directory = process.env.COMFY_ANALYSIS_EVIDENCE_DIR;
  if (!directory) return;
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, name + '.json'), JSON.stringify(value, null, 2));
}
function uiFromCore() {
  const prompt = corePrompt(), links: unknown[][] = []; let nextLink = 1;
  const nodes = Object.entries(prompt).map(([id, node]) => {
    const def = coreCatalog[node.class_type];
    const inputs = Object.entries(node.inputs).map(([name, value], inputIndex) => {
      let link: number | null = null;
      if (Array.isArray(value)) { link = nextLink++; links.push([link, Number(value[0]), value[1], Number(id), inputIndex, def.inputs[name].type]); }
      return { name, type: def.inputs[name].type, link };
    });
    return { id: Number(id), type: node.class_type, mode: 0, inputs,
      outputs: def.outputs.map(type => ({ type })),
      widgets_values_named: Object.fromEntries(Object.entries(node.inputs).filter(([, value]) => !Array.isArray(value))) };
  });
  return { nodes, links };
}
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64');
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngMetadata(entries: Record<string, unknown>) {
  const chunks = Object.entries(entries).map(([key, value]) => {
    const payload = Buffer.from(key + '\0' + (typeof value === 'string' ? value : JSON.stringify(value)), 'utf8');
    const typeAndData = Buffer.concat([Buffer.from('tEXt'), payload]), header = Buffer.alloc(4), crc = Buffer.alloc(4);
    header.writeUInt32BE(payload.length); crc.writeUInt32BE(crc32(typeAndData)); return Buffer.concat([header, typeAndData, crc]);
  });
  return Buffer.concat([tinyPng.subarray(0, tinyPng.length - 12), ...chunks, tinyPng.subarray(tinyPng.length - 12)]);
}

describe('production ComfyUI parser and main-process compiler (not service stubs)', () => {
  it('parses direct/wrapped/history API and UI imports, validates core graph and leaves every source byte unchanged', () => {
    const prompt = corePrompt(), before = JSON.stringify(prompt);
    for (const value of [prompt, { prompt: JSON.stringify(prompt) }, { item: { prompt: [4, 'fixture-id', prompt, {}, []] } }]) {
      const parsed = parseComfyWorkflow(JSON.stringify(value)); expect(parsed.format).toBe('api'); expect(parsed.sourceKind).toBe('api-json'); expect(parsed.payload).toEqual(prompt);
      const compiled = check(record(parsed.payload)); expect(compiled.analysis.ok).toBe(true); expect(compiled.analysis.nodeCount).toBe(9); expect(compiled.analysis.outputNodes).toEqual(['9']);
      expect(compiled.prompt).toEqual(prompt); expect(compiled.analysis.issues.filter(issue => issue.severity === 'block')).toEqual([]);
    }
    expect(parseComfyWorkflow(JSON.stringify(uiFromCore())).format).toBe('ui'); expect(JSON.stringify(prompt)).toBe(before);
  });
  it('rejects invalid/unsafe JSON and non-workflow imports without treating prose as executable data', () => {
    for (const text of ['json {"x":1}', '{', '{}', '[]', '{"prompt":"not JSON"}']) expect(() => parseComfyWorkflow(text)).toThrow();
    expect(() => parseComfyWorkflow('{"__proto__":{}}')).toThrow('Forbidden JSON key');
    expect(() => parseComfyWorkflow(JSON.stringify({ a: { class_type: 'SaveImage', inputs: {}, exec: 'not data' } }))).not.toThrow();
    const malicious = parseComfyWorkflow(JSON.stringify({ a: { class_type: 'SaveImage', inputs: {}, exec: 'not data' } }));
    expect(check(record(malicious.payload)).analysis.ok).toBe(false);
  });
  it('PNG captured API prompt takes priority over UI workflow, with UI-only fallback and no-metadata rejection', () => {
    const api = corePrompt(), ui = uiFromCore();
    const both = pngMetadata({ workflow: ui, prompt: api }), before = sha(both);
    const parsed = parseComfyWorkflow('ignored when image is supplied', both);
    expect(parsed).toEqual({ payload: api, format: 'api', sourceKind: 'image-metadata' }); expect(sha(both)).toBe(before);
    const fallback = parseComfyWorkflow('', pngMetadata({ workflow: ui })); expect(fallback.format).toBe('ui'); expect(fallback.payload).toEqual(ui);
    expect(() => parseComfyWorkflow('', tinyPng)).toThrow('No ComfyUI');
    evidence('png-metadata-priority', { sha256: before, parsedFormat: parsed.format, sourceKind: parsed.sourceKind, sourceImageUnchanged: sha(both) === before, uiFallback: fallback.format });
  });
  it('keeps missing model slots repairable and applies safe scalar model/prompt/size/seed values immutably', () => {
    const prompt = corePrompt(); prompt['1'].inputs.unet_name = 'not-installed.safetensors'; const source = record(prompt), before = JSON.stringify(source);
    const initial = check(source); expect(initial.analysis.ok).toBe(false); expect(initial.analysis.missingModels).toContainEqual(expect.objectContaining({ nodeId: '1', value: 'not-installed.safetensors' }));
    expect(initial.analysis.slots.find(slot => slot.id === 'model:1:unet_name')).toMatchObject({ defaultValue: 'not-installed.safetensors', options: ['model.safetensors', 'other.safetensors'] });
    const chosen = { 'model:1:unet_name': 'other.safetensors', 'positive:4:text': 'short precise tags', 'width:6:width': 512, 'seed:7:seed': 9876 };
    const fixed = check(source, chosen); expect(fixed.analysis.ok).toBe(true); expect(fixed.analysis.missingModels).toEqual([]);
    expect(fixed.prompt['1'].inputs.unet_name).toBe('other.safetensors'); expect(fixed.prompt['4'].inputs.text).toBe('short precise tags'); expect(fixed.prompt['6'].inputs.width).toBe(512); expect(fixed.prompt['7'].inputs.seed).toBe(9876);
    expect(fixed.values).toMatchObject(chosen); expect(fixed.values['negative:5:text']).toBe('negative text'); expect(fixed.values['steps:7:steps']).toBe(25); expect(JSON.stringify(source)).toBe(before);
  });
  it('blocks stale slot keys and invalid scalar model values rather than patching arbitrary graph fields', () => {
    const source = record(), stale = check(source, { 'filename:9:filename_prefix': 'injected', 'seed:deleted:seed': 42 });
    expect(stale.analysis.ok).toBe(false); expect(stale.analysis.issues.filter(issue => issue.code === 'stale-slot')).toHaveLength(2); expect(stale.prompt['9'].inputs.filename_prefix).toBe('ComfyUI');
    const invalidValues: Array<Record<string, ComfySlotValue>> = [{ 'model:1:unet_name': 'not-installed' }, { 'seed:7:seed': Number.MAX_SAFE_INTEGER + 1 }, { 'steps:7:steps': 0 }];
    for (const values of invalidValues) {
      const result = check(source, values); expect(result.analysis.ok).toBe(false); expect(result.prompt).toEqual(corePrompt());
    }
  });
  it('revisions are stable for equivalent inputs/default scalar echoes and change with values/catalog/source provenance', () => {
    const source = record(), first = check(source), again = check(structuredClone(source));
    const reordered = Object.fromEntries(Object.entries(first.values).reverse());
    expect(again.analysis.revision).toBe(first.analysis.revision); expect(check(source, first.values).analysis.revision).toBe(first.analysis.revision); expect(check(source, reordered).analysis.revision).toBe(first.analysis.revision);
    expect(check(source, { 'positive:4:text': 'different' }).analysis.revision).not.toBe(first.analysis.revision);
    expect(check(source, {}, rawCoreCatalog, sha('changed catalog')).analysis.revision).not.toBe(first.analysis.revision);
    expect(check({ ...source, sourceSha256: sha('different source bytes') }).analysis.revision).not.toBe(first.analysis.revision);
    expect(check({ ...source, name: 'Only renamed', updatedAt: '2026-10-21T00:00:00.000Z' }).analysis.revision).toBe(first.analysis.revision);
    evidence('revision-stability', { catalogSha, revision: first.analysis.revision, stableDefaultEcho: true, changesOnValuesCatalogSource: true });
  });
  it('third-party confirmations fingerprint exact source/catalog/classes and change after an origin edit', () => {
    const raw = { ...structuredClone(rawCoreCatalog), AuditOutput: { input: { required: {} }, input_order: { required: [] }, output: [], output_node: true, python_module: 'custom_nodes.fixture_vendor' } };
    const prompt = corePrompt(); prompt.audit = { class_type: 'AuditOutput', inputs: {} }; const source = record(prompt), first = check(source, {}, raw);
    expect(first.analysis.ok).toBe(true); expect(first.analysis.issues).toContainEqual(expect.objectContaining({ code: 'third-party-node', severity: 'confirm' })); expect(first.analysis.thirdPartyFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(check(source, {}, raw).analysis.thirdPartyFingerprint).toBe(first.analysis.thirdPartyFingerprint);
    const changed = structuredClone(raw); changed.AuditOutput.python_module = 'custom_nodes.changed_vendor';
    expect(check(source, {}, changed).analysis.thirdPartyFingerprint).not.toBe(first.analysis.thirdPartyFingerprint);
    expect(check({ ...source, sourceSha256: sha('new source') }, {}, raw).analysis.thirdPartyFingerprint).not.toBe(first.analysis.thirdPartyFingerprint);
    expect(check(source).analysis.thirdPartyFingerprint).toBeNull();
  });
  it('blocks cloud/API nodes regardless of an otherwise valid local graph', () => {
    const raw = { ...rawCoreCatalog, CloudOutput: { input: { required: {} }, output: [], output_node: true, python_module: 'comfy_api_nodes.fixture_vendor', api_node: true } };
    const prompt = corePrompt(); prompt.cloud = { class_type: 'CloudOutput', inputs: {} }; const result = check(record(prompt), {}, raw);
    expect(result.analysis.ok).toBe(false); expect(result.analysis.cloudNodes).toEqual([{ nodeId: 'cloud', classType: 'CloudOutput' }]); expect(result.analysis.issues).toContainEqual(expect.objectContaining({ code: 'cloud-node', severity: 'block' }));
  });
  it('valid converted UI graph always remains unverified and requires explicit confirmation', () => {
    const ui = uiFromCore(), before = JSON.stringify(ui), parsed = parseComfyWorkflow(JSON.stringify(ui)), result = check(record(parsed.payload, parsed.format));
    expect(result.analysis.ok).toBe(true); expect(result.analysis.unverifiedConversion).toBe(true); expect(result.analysis.conversion?.verified).toBe(false);
    expect(result.analysis.issues).toContainEqual(expect.objectContaining({ code: 'conversion-unverified', severity: 'confirm' })); expect(result.analysis.conversion?.totals).toEqual({ input: 9, accounted: 9 }); expect(result.prompt).toEqual(corePrompt()); expect(JSON.stringify(ui)).toBe(before);
  });
  it('full resolved values from a linked primitive seed do not flatten a default graph or create a false stale revision', () => {
    const prompt = corePrompt(); prompt.seed = { class_type: 'PrimitiveInt', inputs: { value: 4321 } }; prompt['7'].inputs.seed = ['seed', 0];
    const source = record(prompt), before = JSON.stringify(source), first = check(source); expect(first.analysis.ok).toBe(true); expect(first.values['seed:7:seed']).toBe(4321);
    expect(first.prompt['7'].inputs.seed).toEqual(['seed', 0]);
    const echoed = check(source, first.values); expect(echoed.analysis.ok).toBe(true); expect(echoed.values).toEqual(first.values);
    evidence('linked-seed-full-values', { importedSeed: prompt['7'].inputs.seed, initialSeed: first.prompt['7'].inputs.seed, echoedSeed: echoed.prompt['7'].inputs.seed,
      initialRevision: first.analysis.revision, echoedRevision: echoed.analysis.revision, fullValues: first.values, originalUnchanged: JSON.stringify(source) === before });
    expect(echoed.prompt['7'].inputs.seed).toEqual(['seed', 0]); expect(echoed.analysis.revision).toBe(first.analysis.revision); expect(JSON.stringify(source)).toBe(before);
    const overridden = check(source, { ...first.values, 'seed:7:seed': 5678 }); expect(overridden.analysis.ok).toBe(true); expect(overridden.prompt['7'].inputs.seed).toBe(5678); expect(overridden.analysis.revision).not.toBe(first.analysis.revision);
  });
  it('all builtin API recipes go through actual parser/compiler, retain family semantics and offer repair for suggested missing files', () => {
    const recipes = builtinComfyGraphs(), presets = builtinComfyWorkflows();
    const raw = structuredClone(rawCoreCatalog);
    raw.UNETLoader.input.required.unet_name[0].push(...recipes.map(recipe => recipe.graph['1'].inputs.unet_name as string));
    const clipOptions = raw.CLIPLoader.input.required.clip_name.find(item => typeof item === 'object') as { options: string[] };
    clipOptions.options.push(...recipes.map(recipe => recipe.graph['2'].inputs.clip_name as string));
    raw.VAELoader.input.required.vae_name[0].push(...recipes.map(recipe => recipe.graph['3'].inputs.vae_name as string));
    const withFlux = { ...raw, EmptyFlux2LatentImage: structuredClone(raw.EmptyLatentImage) };
    for (const [index, recipe] of recipes.entries()) {
      const parsed = parseComfyWorkflow(presets[index].text), source = record(parsed.payload, parsed.format, { templateName: recipe.sourceFile });
      const missing = check(source); expect(missing.analysis.ok).toBe(false); expect(missing.analysis.missingModels.length).toBeGreaterThan(0);
      const result = check(source, {}, withFlux); expect(result.analysis.ok).toBe(true); expect(result.analysis.family?.family).toBe(recipe.family); expect(result.analysis.outputNodes).toEqual(['9']); expect(result.prompt).toEqual(recipe.graph);
      expect(result.analysis.unverifiedConversion).toBe(false); expect(result.analysis.conversion).toBeNull(); expect(presets[index].provenance.officialFrontendExportVerified).toBe(false);
      if (recipe.family === 'krea2') { expect(result.analysis.slots.filter(slot => slot.kind === 'negative')).toEqual([]); expect(result.analysis.issues.some(issue => issue.code === 'negative-zeroed')).toBe(true); }
      evidence('builtin-' + recipe.family, { name: recipe.name, provenance: presets[index].provenance, analysis: result.analysis, resolvedValues: result.values });
    }
  });
});

// Explicit opt-in to already-recorded local files. No HTTP, spawn, model load,
// or copy of private catalog/weights into the repository occurs here.
const realRoot = process.env.COMFY_ANALYSIS_REAL_ROOT;
if (realRoot) for (const [family, directory] of [
  ['anima', 'real-model-anima-c5e49d1d'], ['moss-image', 'real-model-moss-0604f223'], ['krea2', 'real-model-krea2-ac437071'],
]) it('read-only production analysis of recorded real catalog/prompt: ' + family, () => {
  const catalogFile = path.join(realRoot, directory, 'object_info.json'), promptFile = path.join(realRoot, directory, 'compiled-prompt.json');
  const catalogBytes = fs.readFileSync(catalogFile), promptBytes = fs.readFileSync(promptFile), raw = JSON.parse(catalogBytes.toString('utf8'));
  const parsed = parseComfyWorkflow(promptBytes.toString('utf8')), source = record(parsed.payload, parsed.format, { sourceSha256: sha(promptBytes) });
  const before = sha(catalogBytes), result = check(source, {}, raw, catalogRevision(raw));
  expect(result.analysis.ok).toBe(true); expect(result.analysis.missingModels).toEqual([]); expect(result.analysis.cloudNodes).toEqual([]); expect(result.analysis.outputNodes.length).toBeGreaterThan(0);
  expect(sha(fs.readFileSync(catalogFile))).toBe(before); expect(sha(fs.readFileSync(promptFile))).toBe(source.sourceSha256);
  evidence('real-readonly-' + family, { readOnly: true, inferenceExecutedByThisTest: false, catalogFile, catalogSha256: before, catalogNodeTypes: Object.keys(raw).length, promptFile, promptSha256: source.sourceSha256,
    analysis: result.analysis, resolvedValues: result.values, compiledPromptSha256: sha(stableStringify(result.prompt)), sourceFilesUnchanged: true });
});

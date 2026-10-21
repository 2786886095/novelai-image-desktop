import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { detectSlots, applySlotValues } from './slots';
import * as SlotsModule from './slots';
import { normalizeObjectInfoWithDiagnostics } from './object-info';
import { compatibleTypes, validateApiPrompt, type ComfyApiPrompt } from './api-prompt';
import { convertUiWorkflow } from './ui-workflow';
import { rawCoreCatalog, corePrompt } from './core.test-fixtures';
import { stableStringify } from './canonical';
import { COMFY_LIMITS, type ComfySlotValue } from './contract';
import { analyzeComfyWorkflow, parseComfyWorkflow } from '../../electron/ipc/comfyui-analysis';
import type { StoredComfyWorkflow } from '../../electron/ipc/comfyui-service';

// Synthetic definitions, names and local filenames are not claims about any
// installed extension or real model. No service, network, upload or inference.
const digest = (value: unknown) => createHash('sha256').update(stableStringify(value)).digest('hex');
const definition = (required: Record<string, unknown>, optional: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  input: { required, optional }, input_order: { required: Object.keys(required), optional: Object.keys(optional) },
  output: ['IMAGE'], python_module: 'nodes', ...extra,
});
const raw = (required: Record<string, unknown>, optional: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  ...rawCoreCatalog, GenericImage: definition(required, optional, extra),
});
const imagePrompt = (inputs: Record<string, unknown> = {}): ComfyApiPrompt => ({
  one: { class_type: 'GenericImage', inputs },
  out: { class_type: 'SaveImage', inputs: { images: ['one', 0], filename_prefix: 'fixture' } },
});
function compile(payload: unknown, catalog: unknown, values: Record<string, ComfySlotValue> = {}) {
  const text = JSON.stringify(payload), parsed = parseComfyWorkflow(text);
  const record: StoredComfyWorkflow = { id: 'generic-contract-fixture', name: 'Synthetic generic adaptation contract',
    createdAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-10-21T00:00:00.000Z', sourceKind: parsed.sourceKind,
    sourceFormat: parsed.format, sourceSha256: digest(parsed.payload), fileName: null, templateName: null,
    familyLabel: null, lastAnalysis: null, savedValues: {}, payload: parsed.payload };
  const result = analyzeComfyWorkflow(record, catalog, digest(catalog), values);
  expect(JSON.stringify(payload)).toBe(text);
  return result;
}
function apiSlots(payload: ComfyApiPrompt, schema: unknown) {
  return detectSlots(payload, normalizeObjectInfoWithDiagnostics(schema).catalog);
}
function slot(payload: ComfyApiPrompt, schema: unknown, input: string, nodeId = 'one') {
  const found = apiSlots(payload, schema).find(item => item.nodeId === nodeId && item.input === input);
  expect(found, `expected exact-site control ${nodeId}.${input}`).toBeDefined();
  return found!;
}

describe('generic schema adaptation frozen contract', () => {
  it('G01 exposes ordinary bounded INT widgets through the real main compiler', () => {
    const schema = raw({ start_at_step: ['INT', { min: 0, max: 10000, step: 1 }] }), prompt = imagePrompt({ start_at_step: 2 });
    const compiled = compile(prompt, schema), control = compiled.analysis.slots.find(item => item.input === 'start_at_step');
    expect(compiled.analysis.ok).toBe(true); expect(control).toMatchObject({ kind: 'parameter', valueType: 'int', defaultValue: 2, min: 0, max: 10000, step: 1 });
  });
  it('G02 exposes ordinary bounded FLOAT widgets and applies only that API site', () => {
    const schema = raw({ strength: ['FLOAT', { min: 0, max: 1, step: 0.01 }] }), prompt = imagePrompt({ strength: 0.5 });
    const control = slot(prompt, schema, 'strength'), compiled = compile(prompt, schema, { [control.id]: 0.75 });
    expect(compiled.analysis.ok).toBe(true); expect(compiled.prompt.one.inputs.strength).toBe(0.75);
    expect(compiled.prompt.out.inputs).toEqual(prompt.out.inputs); expect(prompt.one.inputs.strength).toBe(0.5);
  });
  it('G03 preserves BOOLEAN false rather than treating it as an absent value', () => {
    const schema = raw({ enabled: ['BOOLEAN', { default: true }] }), prompt = imagePrompt({ enabled: false });
    const control = slot(prompt, schema, 'enabled'); expect(control).toMatchObject({ valueType: 'boolean', defaultValue: false });
    expect(compile(prompt, schema, { [control.id]: false }).prompt.one.inputs.enabled).toBe(false);
  });
  it('G04 preserves numeric zero as a literal generic default and override', () => {
    const schema = raw({ shift: ['FLOAT', { min: -2, max: 2 }] }), prompt = imagePrompt({ shift: 0 });
    const control = slot(prompt, schema, 'shift'); expect(control.defaultValue).toBe(0);
    expect(compile(prompt, schema, { [control.id]: 0 }).prompt.one.inputs.shift).toBe(0);
  });
  it('G05 keeps prompt-like STRING widgets outside generic adaptation', () => {
    const schema = raw({ prompt: ['STRING', { multiline: true }] }), prompt = imagePrompt({ prompt: 'synthetic text' });
    expect(apiSlots(prompt, schema).some(item => item.input === 'prompt')).toBe(false);
    expect(compile(prompt, schema).prompt.one.inputs.prompt).toBe('synthetic text');
  });
  it('G06 preserves an empty STRING literally without exposing a generic text control', () => {
    const schema = raw({ text: ['STRING', { multiline: true }] }), prompt = imagePrompt({ text: '' });
    expect(apiSlots(prompt, schema).some(item => item.input === 'text')).toBe(false);
    expect(compile(prompt, schema).prompt.one.inputs.text).toBe('');
  });
  it('G07 keeps ordinary typed COMBO values false numeric zero and string distinct', () => {
    const schema = raw({ mode: [[false, 0, '0', 'false']] }), prompt = imagePrompt({ mode: false });
    const control = slot(prompt, schema, 'mode'); expect(control.options).toEqual([false, 0, '0', 'false']);
    for (const value of [false, 0, '0', 'false']) expect(compile(prompt, schema, { [control.id]: value }).prompt.one.inputs.mode).toBe(value);
    expect(compile(prompt, schema, { [control.id]: true }).analysis.ok).toBe(false);
  });
  it('G08 keeps omitted optional defaults absent with no generic control', () => {
    const schema = raw({}, { threshold: ['FLOAT', { default: 0.25, min: 0, max: 1 }] }), prompt = imagePrompt();
    expect(apiSlots(prompt, schema).some(item => item.input === 'threshold')).toBe(false);
    const unchanged = compile(prompt, schema); expect(unchanged.analysis.ok).toBe(true); expect(unchanged.prompt.one.inputs).not.toHaveProperty('threshold');
  });
  it('G09 does not invent a control or value for an absent optional scalar without a default', () => {
    const schema = raw({}, { threshold: ['FLOAT', {}] }), prompt = imagePrompt();
    expect(apiSlots(prompt, schema).some(item => item.input === 'threshold')).toBe(false);
    expect(compile(prompt, schema).prompt.one.inputs).not.toHaveProperty('threshold');
  });
  it('G10 exposes a supplied optional scalar and does not fill a missing required scalar', () => {
    const schema = raw({ threshold: ['FLOAT', {}] }, { strength: ['FLOAT', {}] });
    const result = compile(imagePrompt({ strength: 0.5 }), schema);
    expect(result.analysis.slots.some(item => item.input === 'strength')).toBe(true);
    expect(result.analysis.ok).toBe(false); expect(result.analysis.issues).toContainEqual(expect.objectContaining({ code: 'missing-input', input: 'threshold' }));
  });
  it('G11 leaves linked generic widgets untouched instead of flattening computed data', () => {
    const schema = { ...raw({ threshold: ['FLOAT', {}] }), ScalarSource: definition({ value: ['FLOAT', {}] }, {}, { output: ['FLOAT'] }) };
    const prompt = imagePrompt({ threshold: ['source', 0] }); prompt.source = { class_type: 'ScalarSource', inputs: { value: 0.5 } };
    const result = compile(prompt, schema); expect(result.analysis.ok).toBe(true);
    expect(result.analysis.slots.some(item => item.nodeId === 'one' && item.input === 'threshold')).toBe(false);
    expect(result.prompt.one.inputs.threshold).toEqual(['source', 0]);
  });
  it('G12 retains semantic primitive-backed seed links when full saved defaults are echoed', () => {
    const prompt = corePrompt(); prompt.seed = { class_type: 'PrimitiveInt', inputs: { value: 123 } }; prompt['7'].inputs.seed = ['seed', 0];
    const first = compile(prompt, rawCoreCatalog), control = first.analysis.slots.find(item => item.kind === 'seed')!;
    const echo = compile(prompt, rawCoreCatalog, { [control.id]: 123 });
    expect(echo.prompt['7'].inputs.seed).toEqual(['seed', 0]); expect(echo.analysis.revision).toBe(first.analysis.revision);
  });
  it('G13 does not expose sensitive arbitrary STRING paths tokens URLs or output prefixes', () => {
    const names = ['filename_prefix', 'path', 'output_path', 'directory', 'api_key', 'token', 'url', 'script', 'arbitrary_text'];
    const schema = raw(Object.fromEntries(names.map(name => [name, ['STRING', {}]])));
    const prompt = imagePrompt(Object.fromEntries(names.map(name => [name, 'synthetic-not-a-secret'])));
    expect(apiSlots(prompt, schema).filter(item => item.nodeId === 'one')).toEqual([]);
  });
  it('G14 does not expose forceInput sockets as generic editable controls', () => {
    const schema = raw({ threshold: ['FLOAT', { forceInput: true }] }), prompt = imagePrompt({ threshold: 0.5 });
    expect(apiSlots(prompt, schema).some(item => item.input === 'threshold')).toBe(false);
  });
  it('G15 does not expose remote generic widgets or fetch their untrusted routes', () => {
    const schema = raw({ threshold: ['FLOAT', { remote: { route: '/synthetic-untrusted' } }], prompt: ['STRING', { remote: '/synthetic-untrusted' }] });
    expect(apiSlots(imagePrompt({ threshold: 0.5, prompt: 'fixture' }), schema).filter(item => item.nodeId === 'one')).toEqual([]);
  });
  it('G16 leaves dynamic multiselect and unsupported option encodings outside scalar controls', () => {
    const schema = raw({ dynamic_mode: ['COMFY_DYNAMICCOMBO_V3', { options: [{ key: 'off', inputs: { required: {} } }] }], many: [['a', 'b'], { multiselect: true }], complex: [[{ custom: true }]] });
    const prompt = imagePrompt({ dynamic_mode: 'off', many: ['a'], complex: { custom: true } });
    expect(apiSlots(prompt, schema).filter(item => item.nodeId === 'one')).toEqual([]);
    expect(compile(prompt, schema).analysis.ok).toBe(false);
  });
  it('G17 keeps model files restricted to enumerated local string choices', () => {
    const schema = { ...rawCoreCatalog, UNETLoader: definition({ unet_name: ['STRING', {}] }, {}, { output: ['MODEL'] }) }, prompt = corePrompt();
    expect(apiSlots(prompt, schema).some(item => item.nodeId === '1')).toBe(false);
    expect(compile(prompt, schema).analysis.issues).toContainEqual(expect.objectContaining({ code: 'node-unverified', nodeId: '1', input: 'unet_name' }));
  });
  it('G18 rejects stale unknown slot dictionaries and class changes', () => {
    const schema = raw({ strength: ['FLOAT', { min: 0, max: 1 }] }), prompt = imagePrompt({ strength: 0.5 });
    const control = slot(prompt, schema, 'strength'), catalog = normalizeObjectInfoWithDiagnostics(schema).catalog;
    expect(() => applySlotValues(prompt, [], { [control.id]: 0.5 }, catalog)).toThrow();
    const changed = structuredClone(prompt); changed.one.class_type = 'SaveImage';
    expect(() => applySlotValues(changed, [control], { [control.id]: 0.5 }, catalog)).toThrow();
  });
  it('G19 rejects unsafe integers through the actual scalar slot validator', () => {
    const schema = raw({ start_at_step: ['INT', {}] }), prompt = imagePrompt({ start_at_step: 2 });
    const control = slot(prompt, schema, 'start_at_step'), catalog = normalizeObjectInfoWithDiagnostics(schema).catalog;
    expect(() => applySlotValues(prompt, [control], { [control.id]: Number.MAX_SAFE_INTEGER + 1 }, catalog)).toThrow();
  });
  it('G20 rejects nonfinite scalar edits rather than coercing or clipping them', () => {
    const schema = raw({ strength: ['FLOAT', {}] }), prompt = imagePrompt({ strength: 0.5 });
    const control = slot(prompt, schema, 'strength'), catalog = normalizeObjectInfoWithDiagnostics(schema).catalog;
    for (const value of [NaN, Infinity, -Infinity]) expect(() => applySlotValues(prompt, [control], { [control.id]: value }, catalog)).toThrow();
  });
  it('G21 rejects out-of-range generic values and preserves the source', () => {
    const schema = raw({ strength: ['FLOAT', { min: 0, max: 1 }] }), prompt = imagePrompt({ strength: 0.5 }), before = stableStringify(prompt);
    const control = slot(prompt, schema, 'strength'), catalog = normalizeObjectInfoWithDiagnostics(schema).catalog;
    for (const value of [-0.1, 1.1]) expect(() => applySlotValues(prompt, [control], { [control.id]: value }, catalog)).toThrow();
    expect(stableStringify(prompt)).toBe(before);
  });
  it('G22 caps generic controls deterministically after semantic controls and reports omissions', () => {
    const semanticNames = ['width', 'height', 'batch_size', 'batch', 'seed', 'noise_seed', 'steps', 'cfg', 'cfg_scale', 'guidance'];
    const inputs = { ...Object.fromEntries(semanticNames.map(name => [name, ['INT', {}]])), ...Object.fromEntries(Array.from({ length: 300 }, (_, index) => [`threshold_${index}`, ['FLOAT', {}]])) };
    const schema = raw(inputs), prompt = imagePrompt(Object.fromEntries(Object.keys(inputs).map(name => [name, 1])));
    const reports = [slotReport(prompt, schema), slotReport(prompt, schema)];
    expect(reports[0]).toEqual(reports[1]); expect(reports[0].slots).toHaveLength(COMFY_LIMITS.slotCount); expect(reports[0].omittedGeneric).toBe(182);
    for (const input of semanticNames) expect(reports[0].slots.some(item => item.input === input && item.kind !== 'parameter')).toBe(true);
  });
  it('G23 retains every conventional slot for two samplers and two resolutions', () => {
    const prompt = corePrompt(); prompt['16'] = structuredClone(prompt['6']); prompt['17'] = structuredClone(prompt['7']); prompt['17'].inputs.latent_image = ['16', 0]; prompt['8'].inputs.samples = ['17', 0];
    const result = compile(prompt, rawCoreCatalog); expect(result.analysis.ok).toBe(true);
    for (const kind of ['seed', 'steps', 'width', 'height']) expect(result.analysis.slots.filter(item => item.kind === kind)).toHaveLength(2);
  });
  it('G24 keeps generic scalar controls independent across repeated node instances', () => {
    const schema = raw({ strength: ['FLOAT', { min: 0, max: 1 }] }), prompt = imagePrompt({ strength: 0.2 });
    prompt.two = { class_type: 'GenericImage', inputs: { strength: 0.8 } };
    prompt.out_two = { class_type: 'SaveImage', inputs: { images: ['two', 0], filename_prefix: 'fixture-two' } };
    const first = slot(prompt, schema, 'strength'), second = slot(prompt, schema, 'strength', 'two'); expect(first.id).not.toBe(second.id);
    const result = compile(prompt, schema, { [first.id]: 0.3 });
    expect(result.prompt.one.inputs.strength).toBe(0.3); expect(result.prompt.two.inputs.strength).toBe(0.8);
  });
  it('G25 changes analysis revisions after generic edits while preserving provenance confirmations', () => {
    const schema = raw({ strength: ['FLOAT', { min: 0, max: 1 }] }, {}, { python_module: 'custom_nodes.synthetic_generic' }), prompt = imagePrompt({ strength: 0.5 });
    const first = compile(prompt, schema), control = first.analysis.slots.find(item => item.input === 'strength'); expect(control).toBeDefined();
    const edited = compile(prompt, schema, { [control!.id]: 0.75 });
    expect(edited.analysis.revision).not.toBe(first.analysis.revision); expect(edited.analysis.thirdPartyFingerprint).toBeTruthy();
    expect(edited.analysis.thirdPartyFingerprint).toBe(first.analysis.thirdPartyFingerprint);
    expect(edited.analysis.issues).toContainEqual(expect.objectContaining({ code: 'third-party-node', severity: 'confirm' }));
  });
  it('G26 keeps cloud-node execution blocked despite scalar schema compatibility', () => {
    const schema = raw({ strength: ['FLOAT', {}] }, {}, { api_node: true }), prompt = imagePrompt({ strength: 0.5 });
    const result = compile(prompt, schema); expect(result.analysis.ok).toBe(false);
    expect(result.analysis.issues).toContainEqual(expect.objectContaining({ code: 'cloud-node', severity: 'block' }));
  });
  it('G27 rejects stale scalar edits after the live schema changes type', () => {
    const prompt = imagePrompt({ strength: 0.5 }), first = raw({ strength: ['FLOAT', {}] }), control = slot(prompt, first, 'strength');
    const second = raw({ strength: ['STRING', {}] });
    expect(compile(prompt, second, { [control.id]: 0.75 }).analysis.issues).toContainEqual(expect.objectContaining({ code: 'stale-slot', severity: 'block' }));
  });
});

function socketGraph(outputType: string, inputType = 'IMAGE') {
  const schema = { Source: definition({}, {}, { output: [outputType] }), Output: definition({ value: [inputType, { forceInput: true }] }, {}, { output: [], output_node: true }) };
  const ui = { nodes: [ { id: 1, type: 'Source', mode: 0, inputs: [], widgets_values: [], outputs: [{ type: outputType }] },
    { id: 2, type: 'Output', mode: 0, inputs: [{ name: 'value', type: inputType, link: 1 }], widgets_values: [], outputs: [] } ], links: [[1, 1, 0, 2, 0, inputType]] };
  return { schema, ui, catalog: normalizeObjectInfoWithDiagnostics(schema).catalog };
}
describe('generic declared socket compatibility frozen contract', () => {
  it('U01 accepts a declared output union that intersects the declared input type', () => {
    const { ui, catalog } = socketGraph('IMAGE,MASK'); expect(compatibleTypes('IMAGE,MASK', 'IMAGE')).toBe(true);
    const converted = convertUiWorkflow(ui, catalog); expect(converted.prompt).not.toBeNull(); expect(validateApiPrompt(converted.prompt, catalog).ok).toBe(true);
    expect(converted.unverified).toBe(true); expect(converted.issues).toContainEqual(expect.objectContaining({ code: 'conversion-unverified', severity: 'confirm' }));
  });
  it('U02 accepts COMFY_MATCHTYPE_V3 output sockets without inventing literal widgets', () => {
    const { ui, catalog } = socketGraph('COMFY_MATCHTYPE_V3'); const converted = convertUiWorkflow(ui, catalog);
    expect(converted.prompt).not.toBeNull(); expect(converted.prompt!['2'].inputs.value).toEqual(['1', 0]); expect(validateApiPrompt(converted.prompt, catalog).ok).toBe(true);
  });
  it('U03 accepts COMFY_MATCHTYPE_V3 input sockets using the same API contract', () => {
    const { ui, catalog } = socketGraph('IMAGE', 'COMFY_MATCHTYPE_V3'), converted = convertUiWorkflow(ui, catalog);
    expect(converted.prompt).not.toBeNull(); expect(validateApiPrompt(converted.prompt, catalog).ok).toBe(true);
  });
  it('U04 retains wildcard socket compatibility without weakening ordinary types', () => {
    const { ui, catalog } = socketGraph('IMAGE', '*'), converted = convertUiWorkflow(ui, catalog);
    expect(converted.prompt).not.toBeNull(); expect(validateApiPrompt(converted.prompt, catalog).ok).toBe(true);
  });
  it('U05 blocks incompatible scalar and structured socket types', () => {
    const { ui, catalog } = socketGraph('MASK', 'IMAGE'), converted = convertUiWorkflow(ui, catalog);
    expect(converted.prompt).toBeNull(); expect(converted.issues).toContainEqual(expect.objectContaining({ code: 'link-type-mismatch', severity: 'block' }));
  });
  it('U06 blocks nonintersecting union sockets rather than accepting every comma type', () => {
    const { ui, catalog } = socketGraph('IMAGE,MASK', 'CONDITIONING'), converted = convertUiWorkflow(ui, catalog);
    expect(converted.prompt).toBeNull(); expect(converted.issues).toContainEqual(expect.objectContaining({ code: 'link-type-mismatch', severity: 'block' }));
  });
  it('U07 continues rejecting unknown frontend extension nodes instead of silently dropping them', () => {
    const { ui, catalog } = socketGraph('IMAGE'); ui.nodes.push({ id: 3, type: 'SyntheticCustomFrontendWidget', mode: 0, inputs: [], widgets_values: [], outputs: [] });
    const converted = convertUiWorkflow(ui, catalog); expect(converted.prompt).toBeNull();
    expect(converted.issues).toContainEqual(expect.objectContaining({ code: 'missing-node-type', severity: 'block' }));
  });
});

function slotReport(prompt: ComfyApiPrompt, schema: unknown): { slots: ReturnType<typeof detectSlots>; omittedGeneric: number } {
  const report = (SlotsModule as unknown as { detectSlotsWithReport?: (prompt: ComfyApiPrompt, catalog: ReturnType<typeof normalizeObjectInfoWithDiagnostics>['catalog']) => { slots: ReturnType<typeof detectSlots>; omittedGeneric: number } }).detectSlotsWithReport;
  expect(typeof report, 'production detectSlotsWithReport must be exported').toBe('function');
  return report!(prompt, normalizeObjectInfoWithDiagnostics(schema).catalog);
}

describe('Claude approved conservative generic adaptation additions', () => {
  it('N01 does not expose linked local COMBO controls or split their graph edges', () => {
    const schema = raw({ mode: [[true, false]] }), prompt = imagePrompt({ mode: ['condition', 0] });
    prompt.condition = { class_type: 'PrimitiveBoolean', inputs: { value: false } };
    expect(apiSlots(prompt, schema).some(item => item.nodeId === 'one' && item.input === 'mode')).toBe(false);
    expect(compile(prompt, schema).prompt.one.inputs.mode).toEqual(['condition', 0]);
  });
  it('N02 does not expose omitted optional COMBO defaults or implicitly add them', () => {
    const schema = raw({}, { mode: [[true, false], { default: false }] }), prompt = imagePrompt();
    expect(apiSlots(prompt, schema).some(item => item.input === 'mode')).toBe(false);
    expect(compile(prompt, schema).prompt.one.inputs).not.toHaveProperty('mode');
  });
  it('N03 excludes generic controls on output-unreachable API graph nodes', () => {
    const schema = raw({ mode: [[true, false]], strength: ['FLOAT', {}] }), prompt = imagePrompt({ mode: true, strength: 0.5 });
    prompt.unreachable = { class_type: 'GenericImage', inputs: { mode: false, strength: 0.25 } };
    expect(apiSlots(prompt, schema).some(item => item.nodeId === 'unreachable')).toBe(false);
  });
  it('N04 excludes generic controls on cloud API node definitions', () => {
    const schema = raw({ mode: [[true, false]], strength: ['FLOAT', {}] }, {}, { api_node: true }), prompt = imagePrompt({ mode: true, strength: 0.5 });
    expect(apiSlots(prompt, schema).some(item => item.nodeId === 'one')).toBe(false);
  });
  it('N05 never duplicates a semantic primitive-backed seed with a generic source value', () => {
    const prompt = corePrompt(); prompt.seed = { class_type: 'PrimitiveInt', inputs: { value: 123 } }; prompt['7'].inputs.seed = ['seed', 0];
    const controls = apiSlots(prompt, rawCoreCatalog), seed = controls.find(item => item.kind === 'seed');
    expect(seed).toMatchObject({ id: 'seed:7:seed', defaultValue: 123, linkedFrom: { nodeId: 'seed', classType: 'PrimitiveInt' } });
    expect(controls.some(item => item.nodeId === 'seed' && item.kind === 'parameter')).toBe(false);
  });
  it('N06 exposes an identity primitive source only when no semantic consumer already owns it', () => {
    const schema = raw({ threshold: ['INT', {}] }), prompt = imagePrompt({ threshold: ['source', 0] });
    prompt.source = { class_type: 'PrimitiveInt', inputs: { value: 2 } };
    const controls = apiSlots(prompt, schema); expect(controls.some(item => item.nodeId === 'one' && item.input === 'threshold')).toBe(false);
    expect(controls.find(item => item.nodeId === 'source')).toMatchObject({ kind: 'parameter', input: 'value', defaultValue: 2 });
  });
  it('N07 preserves branch priority when PrimitiveBoolean precedes its switch consumer', () => {
    const schema = raw({ enabled: ['BOOLEAN', {}] }), prompt = imagePrompt({ enabled: ['condition', 0] });
    prompt.condition = { class_type: 'PrimitiveBoolean', inputs: { value: false } };
    prompt.switch = { class_type: 'ComfySwitchNode', inputs: { switch: ['condition', 0], on_false: false, on_true: true } };
    const controls = apiSlots(prompt, schema).filter(item => item.nodeId === 'condition');
    expect(controls).toHaveLength(1); expect(controls[0]).toMatchObject({ id: 'branch:condition:value', kind: 'branch' });
  });
  it('N08 still fails explicitly when semantic controls alone exceed their slot budget', () => {
    const inputs = Object.fromEntries(Array.from({ length: COMFY_LIMITS.slotCount + 1 }, (_, index) => [`semantic_${index}`, ['INT', {}]]));
    const schema = raw(inputs), prompt = imagePrompt(Object.fromEntries(Object.keys(inputs).map(name => [name, 1]))), catalog = normalizeObjectInfoWithDiagnostics(schema).catalog;
    const hints = Object.fromEntries(Object.keys(inputs).map(name => [`one:${name}`, { kind: 'width' as const }]));
    expect(() => detectSlots(prompt, catalog, hints)).toThrow('Too many editable slots');
  });
  it('N09 rechecks parameter eligibility if a once-literal site is now a link', () => {
    const schema = raw({ mode: [[true, false]] }), prompt = imagePrompt({ mode: false }), control = slot(prompt, schema, 'mode');
    prompt.condition = { class_type: 'PrimitiveBoolean', inputs: { value: true } }; prompt.one.inputs.mode = ['condition', 0];
    expect(() => applySlotValues(prompt, [control], { [control.id]: false }, normalizeObjectInfoWithDiagnostics(schema).catalog)).toThrow('no longer');
    expect(prompt.one.inputs.mode).toEqual(['condition', 0]);
  });
  it('N10 rechecks forceInput and valueType eligibility for supplied parameter descriptors', () => {
    const schema = raw({ mode: [[true, false]] }), prompt = imagePrompt({ mode: false }), control = slot(prompt, schema, 'mode');
    const forced = normalizeObjectInfoWithDiagnostics(raw({ mode: [[true, false], { forceInput: true }] })).catalog;
    expect(() => applySlotValues(prompt, [control], { [control.id]: false }, forced)).toThrow('no longer');
    expect(() => applySlotValues(prompt, [{ ...control, valueType: 'boolean' }], { [control.id]: false }, normalizeObjectInfoWithDiagnostics(schema).catalog)).toThrow('no longer');
  });
  it('N11 keeps invalid scalar ranges and COMBO memberships visible for correction', () => {
    const schema = raw({ threshold: ['FLOAT', { min: 0, max: 1 }], mode: [[false]] }), prompt = imagePrompt({ threshold: 2, mode: true });
    expect(slot(prompt, schema, 'threshold').defaultValue).toBe(2); expect(slot(prompt, schema, 'mode').defaultValue).toBe(true);
    expect(compile(prompt, schema).analysis.ok).toBe(false);
  });
  it('N12 keeps unsafe current INT values outside generic controls while validation blocks them', () => {
    const schema = raw({ threshold: ['INT', {}] }), prompt = imagePrompt({ threshold: Number.MAX_SAFE_INTEGER + 1 });
    expect(apiSlots(prompt, schema).some(item => item.input === 'threshold')).toBe(false); expect(compile(prompt, schema).analysis.ok).toBe(false);
  });
  it('N13 supplies bounded nodeTitle display metadata without changing semantic slot IDs', () => {
    const prompt = corePrompt(); prompt['7']._meta = { title: 'Sampler ' + 'x'.repeat(300) };
    const controls = apiSlots(prompt, rawCoreCatalog), seed = controls.find(item => item.id === 'seed:7:seed')!;
    expect(seed.nodeTitle).toBe(('Sampler ' + 'x'.repeat(300)).slice(0, 256));
  });
  it('N14 rejects missing-type bypass ports rather than treating them as implicit wildcards', () => {
    const { ui, catalog } = socketGraph('IMAGE');
    ui.nodes[1].inputs[0].link = 2;
    ui.nodes.push({ id: 3, type: 'UnknownBypass', mode: 4, inputs: [{ name: 'value', link: 1 }], widgets_values: [], outputs: [{}] } as never);
    ui.links = [[1, 1, 0, 3, 0, 'IMAGE'], [2, 3, 0, 2, 0, 'IMAGE']];
    const converted = convertUiWorkflow(ui, catalog); expect(converted.prompt).toBeNull();
    expect(converted.issues).toContainEqual(expect.objectContaining({ code: 'muted-dependency' }));
  });
  it('N15 uses installed bypass output types instead of forged UI port types', () => {
    const { ui, catalog } = socketGraph('IMAGE');
    const typed = normalizeObjectInfoWithDiagnostics({ Bypass: definition({ value: ['IMAGE', { forceInput: true }] }, {}, { output: ['MASK'] }) }).catalog;
    ui.nodes[1].inputs[0].link = 2;
    ui.nodes.push({ id: 3, type: 'Bypass', mode: 4, inputs: [{ name: 'value', type: 'IMAGE', link: 1 }], widgets_values: [], outputs: [{ type: 'IMAGE' }] } as never);
    ui.links = [[1, 1, 0, 3, 0, 'IMAGE'], [2, 3, 0, 2, 0, 'IMAGE']];
    expect(convertUiWorkflow(ui, { ...catalog, ...typed }).prompt).toBeNull();
  });
  it('N16 validates external link types at declared subgraph input boundaries', () => {
    const rawCatalog = { Source: definition({}, {}, { output: ['IMAGE'] }), Inner: definition({ value: ['IMAGE', { forceInput: true }] }), Output: definition({ value: ['IMAGE', { forceInput: true }] }, {}, { output: [], output_node: true }) };
    const ui = { definitions: { subgraphs: [{ id: 'sub', inputs: [{ name: 'value', type: 'LATENT' }], outputs: [{ name: 'image', type: 'IMAGE' }],
      nodes: [{ id: 10, type: 'Inner', mode: 0, inputs: [{ name: 'value', type: 'IMAGE', link: 10 }], widgets_values: [], outputs: [{ type: 'IMAGE' }] }],
      links: [[10, -10, 0, 10, 0, 'IMAGE'], [11, 10, 0, -20, 0, 'IMAGE']] }] },
      nodes: [{ id: 1, type: 'Source', mode: 0, inputs: [], widgets_values: [], outputs: [{ type: 'IMAGE' }] },
        { id: 2, type: 'sub', mode: 0, inputs: [{ name: 'value', type: 'LATENT', link: 1 }], widgets_values: [], outputs: [{ type: 'IMAGE' }] },
        { id: 3, type: 'Output', mode: 0, inputs: [{ name: 'value', type: 'IMAGE', link: 2 }], widgets_values: [], outputs: [] }], links: [[1, 1, 0, 2, 0, 'LATENT'], [2, 2, 0, 3, 0, 'IMAGE']] };
    const converted = convertUiWorkflow(ui, normalizeObjectInfoWithDiagnostics(rawCatalog).catalog); expect(converted.prompt).toBeNull();
    expect(converted.issues).toContainEqual(expect.objectContaining({ code: 'link-type-mismatch', severity: 'block' }));
  });
});

describe('generic adaptation production integration frozen contract', () => {
  it('I01 surfaces omitted generic controls as an informational production analysis issue', () => {
    const semanticNames = ['width', 'height', 'batch_size', 'batch', 'seed', 'noise_seed', 'steps', 'cfg', 'cfg_scale', 'guidance'];
    const inputs = { ...Object.fromEntries(semanticNames.map(name => [name, ['INT', {}]])), ...Object.fromEntries(Array.from({ length: 300 }, (_, index) => [`threshold_${index}`, ['FLOAT', {}]])) };
    const schema = raw(inputs), prompt = imagePrompt(Object.fromEntries(Object.keys(inputs).map(name => [name, 1]))), result = compile(prompt, schema);
    expect(result.analysis.ok).toBe(true); expect(result.analysis.slots).toHaveLength(128);
    expect(result.analysis.issues).toContainEqual(expect.objectContaining({ code: 'generic-slots-limited', severity: 'info' }));
    expect(result.analysis.issues.find(item => item.code === 'generic-slots-limited')?.message).toContain('182');
  });
  it('I02 merges UI branch controls before generic controls at the same exact source site', () => {
    const schema = raw({ enabled: ['BOOLEAN', {}] }), catalog = normalizeObjectInfoWithDiagnostics(schema).catalog;
    const api: ComfyApiPrompt = {
      '1': { class_type: 'PrimitiveBoolean', inputs: { value: false } },
      '2': { class_type: 'GenericImage', inputs: { enabled: ['1', 0] } },
      '3': { class_type: 'GenericImage', inputs: { enabled: false } },
      '4': { class_type: 'ComfySwitchNode', inputs: { on_false: ['2', 0], on_true: ['3', 0], switch: ['1', 0] } },
      '5': { class_type: 'SaveImage', inputs: { images: ['4', 0], filename_prefix: 'fixture' } },
    };
    const links: unknown[][] = []; let next = 1;
    const nodes = Object.entries(api).map(([id, node]) => {
      const def = catalog[node.class_type];
      const inputs = Object.entries(node.inputs).map(([name, value], index) => {
        let link: number | null = null;
        if (Array.isArray(value)) { link = next++; links.push([link, Number(value[0]), value[1], Number(id), index, def.inputs[name].type]); }
        return { name, type: def.inputs[name].type, link };
      });
      return { id: Number(id), type: node.class_type, mode: 0, inputs, outputs: def.outputs.map(type => ({ type })), widgets_values_named: Object.fromEntries(Object.entries(node.inputs).filter(([, value]) => !Array.isArray(value))) };
    });
    const result = compile({ nodes, links }, schema), controls = result.analysis.slots.filter(item => item.nodeId === '1' && item.input === 'value');
    expect(result.analysis.ok).toBe(true); expect(controls).toHaveLength(1); expect(controls[0].kind).toBe('branch');
    expect(result.analysis.unverifiedConversion).toBe(true);
    expect(result.analysis.issues).toContainEqual(expect.objectContaining({ code: 'conversion-unverified', severity: 'confirm' }));
  });
});

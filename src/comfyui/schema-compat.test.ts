import { describe, expect, it } from 'vitest';
import liveFixture from '../../tests/fixtures/comfy/object_info.local-trimmed.json';
import { normalizeObjectInfo, normalizeObjectInfoWithDiagnostics, isModelLikeInput } from './object-info';
import { validateApiPrompt, validateInputValue, type ComfyApiPrompt } from './api-prompt';
import { detectSlots, applySlotValues, resolveStaticScalar } from './slots';
import { convertUiWorkflow } from './ui-workflow';
import { stableStringify } from './canonical';
import { coreCatalog, corePrompt, rawCoreCatalog } from './core.test-fixtures';
import { ComfyValidationError } from './format-detect';

const definition = (required: Record<string, unknown>, optional: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  input: { required, optional }, input_order: { required: Object.keys(required), optional: Object.keys(optional) },
  output: ['IMAGE'], python_module: 'custom_nodes.fixture_only', ...extra,
});
const enumDef = (choices: unknown[], extra: Record<string, unknown> = {}) => definition({ clamp: [choices, { default: true }] }, {}, extra);
const catalogWith = (raw: Record<string, unknown>) => normalizeObjectInfoWithDiagnostics({ ...rawCoreCatalog, ...raw }).catalog;
const clampPrompt = (clamp: unknown): ComfyApiPrompt => ({
  one: { class_type: 'Color', inputs: { clamp } },
  out: { class_type: 'SaveImage', inputs: { images: ['one', 0], filename_prefix: 'fixture' } },
});
const uiNode = (id: number, type: string, widgets_values: unknown[] = [], inputs: unknown[] = [], extra: Record<string, unknown> = {}) => ({ id, type, mode: 0, widgets_values, inputs, outputs: [{ type: 'IMAGE' }], ...extra });
const ui = (first: ReturnType<typeof uiNode>, extras: ReturnType<typeof uiNode>[] = []) => ({
  nodes: [first, uiNode(2, 'SaveImage', ['fixture'], [{ name: 'images', type: 'IMAGE', link: 1 }]), ...extras],
  links: [[1, 1, 0, 2, 0, 'IMAGE']],
});

describe('scalar COMBO compatibility and per-node schema isolation', () => {
  it('retains booleans, numbers, strings, empty and mixed choices without coercion in both encodings', () => {
    const raw = { Old: enumDef([true, false, 1, '1', 'true']), New: definition({ clamp: ['COMBO', { options: [true, false], default: true }] }), Empty: enumDef([]) };
    const normalized = normalizeObjectInfo(raw);
    expect(normalized.Old.inputs.clamp.options).toEqual([true, false, 1, '1', 'true']);
    expect(normalized.New.inputs.clamp).toMatchObject({ type: 'COMBO', options: [true, false], defaultValue: true, widget: true });
    expect(typeof normalized.New.inputs.clamp.options![0]).toBe('boolean');
    expect(normalized.Empty.inputs.clamp.options).toEqual([]);
    expect(validateInputValue(true, normalized.Empty.inputs.clamp)[0].code).toBe('invalid-option');
  });

  it('isolates complex choices only at that input while the default normalizer remains strict', () => {
    for (const choices of [[{ key: 'opaque' }], [[1]], [null]]) {
      const raw = { Good: enumDef([false]), Bad: enumDef(choices) };
      const result = normalizeObjectInfoWithDiagnostics(raw);
      expect(result.catalog.Bad.schemaError).toBeUndefined();
      expect(result.catalog.Bad.inputs.clamp).toMatchObject({ widget: false, unsupported: { code: 'combo-option-schema' } });
      expect(result.catalog.Bad.inputs.clamp.options).toBeUndefined();
      expect(result.diagnostics[0]).toMatchObject({ classType: 'Bad', input: 'clamp', code: 'combo-option-schema' });
      expect(() => normalizeObjectInfo(raw)).toThrow('Unsupported combo option schema');
    }
    const result = normalizeObjectInfoWithDiagnostics({ New: definition({ mode: ['COMBO', { options: [{ opaque: true }] }] }) });
    expect(result.catalog.New.inputs.mode.unsupported?.code).toBe('combo-option-schema');
    const dynamic = normalizeObjectInfo({ Dynamic: definition({ mode: ['COMFY_DYNAMICCOMBO_V3', { options: [{ key: 'on', inputs: { required: {} } }] }] }) });
    expect(dynamic.Dynamic.inputs.mode.dynamic).toBe(true);
    expect(dynamic.Dynamic.inputs.mode.unsupported).toBeUndefined();
  });

  it('keeps malformed node provenance and distinguishes it from missing nodes, including cloud nodes', () => {
    const raw = { Good: enumDef([true]), Broken: { input: { required: 'invalid' }, api_node: true, python_module: 'comfy_api_nodes.fixture', output_node: true } };
    const result = normalizeObjectInfoWithDiagnostics(raw);
    expect(result.catalog.Broken).toMatchObject({ inputs: {}, apiNode: true, pythonModule: 'comfy_api_nodes.fixture', schemaError: { code: 'node-schema-unsupported' } });
    const checked = validateApiPrompt({ bad: { class_type: 'Broken', inputs: {} } }, result.catalog);
    expect(checked.issues).toContainEqual(expect.objectContaining({ code: 'node-schema-unsupported', severity: 'block', nodeId: 'bad', classType: 'Broken' }));
    expect(checked.cloudNodes).toEqual([{ nodeId: 'bad', classType: 'Broken' }]);
    expect(checked.issues.some(item => item.code === 'cloud-node')).toBe(true);
    expect(checked.missingNodeTypes).toEqual([]);
    // JSON may shadow toString. Metadata must never coerce opaque objects while
    // collecting per-node diagnostics, or an unrelated entry can throw again.
    expect(normalizeObjectInfoWithDiagnostics({ Good: enumDef([true]), Names: { input: {}, output_name: [{ toString: 'not a function' }] } }).catalog.Names.outputNames).toEqual(['UNKNOWN']);
    for (const bad of [{}, null, [], { Broken: {} }, { Broken: definition({ value: [] }) }]) expect(() => normalizeObjectInfoWithDiagnostics(bad)).toThrow('COMFY_INVALID_CATALOG');
    const missing = validateApiPrompt({ one: { class_type: 'NotInstalled', inputs: {} } }, result.catalog);
    expect(missing.missingNodeTypes).toEqual(['NotInstalled']);
  });

  it('never downgrades the global JSON security boundary', () => {
    const raw = { Good: enumDef([true]), unrelated: JSON.parse('{"__proto__":{}}') };
    expect(() => normalizeObjectInfoWithDiagnostics(raw)).toThrow('Forbidden JSON key');
    expect(() => normalizeObjectInfoWithDiagnostics({ Good: enumDef([true]), Bad: enumDef([NaN]) })).toThrow('finite');
    const cycle: Record<string, unknown> = {}; cycle.loop = cycle;
    expect(() => normalizeObjectInfoWithDiagnostics({ Good: enumDef([true]), Bad: cycle })).toThrow('Cyclic');
  });

  it('parses the cropped live mtb definition and isolates the explicit synthetic bad schemas', () => {
    const result = normalizeObjectInfoWithDiagnostics(liveFixture), spec = result.catalog['Color Correct (mtb)'].inputs.clamp;
    expect(spec).toMatchObject({ type: 'COMBO', options: [true, false], defaultValue: true });
    expect(result.diagnostics.map(item => item.classType).sort()).toEqual(['FixtureBrokenNode', 'FixtureUnsupportedCombo']);
  });

  it('validates bool enum membership strictly and keeps normal BOOLEAN behavior separate', () => {
    const catalog = catalogWith({ Color: enumDef([true, false]) });
    for (const value of [true, false]) expect(validateApiPrompt(clampPrompt(value), catalog).ok).toBe(true);
    for (const value of ['true', 'false', 0, 1]) expect(validateApiPrompt(clampPrompt(value), catalog).issues).toContainEqual(expect.objectContaining({ code: 'invalid-option', input: 'clamp' }));
    for (const value of [null, {}, [], Infinity]) expect(validateInputValue(value, catalog.Color.inputs.clamp)[0].code).toBe('value-type');
    expect(validateInputValue('true', coreCatalog.PrimitiveBoolean.inputs.value)[0].code).toBe('value-type');
    const limited = catalogWith({ Color: enumDef([true]) });
    expect(validateApiPrompt(clampPrompt(false), limited).issues.some(item => item.code === 'invalid-option')).toBe(true);
    const linked = clampPrompt(['bool', 0]); linked.bool = { class_type: 'PrimitiveBoolean', inputs: { value: false } };
    // A typed BOOLEAN socket is not an enum socket in this installed Comfy
    // protocol. Do not weaken link type checks merely to support bool literals.
    expect(validateApiPrompt(linked, catalog).issues.some(item => item.code === 'link-type-mismatch')).toBe(true);
    expect(resolveStaticScalar(linked, linked.one.inputs.clamp, catalog)).toBe(false);
  });

  it('blocks required and supplied optional unsupported inputs but permits omitted optional defaults', () => {
    const catalog = catalogWith({ Color: definition({}, { mode: [[{ opaque: true }], { forceInput: true }] }) });
    const omitted = clampPrompt(true); omitted.one.inputs = {};
    expect(validateApiPrompt(omitted, catalog).ok).toBe(true);
    for (const value of ['opaque', ['source', 0]]) {
      const used = structuredClone(omitted); used.one.inputs.mode = value;
      expect(validateApiPrompt(used, catalog).issues).toContainEqual(expect.objectContaining({ code: 'schema-unsupported', nodeId: 'one', classType: 'Color', input: 'mode' }));
    }
    const required = catalogWith({ Color: definition({ mode: [[{ opaque: true }]] }) });
    expect(validateApiPrompt(omitted, required).issues).toContainEqual(expect.objectContaining({ code: 'schema-unsupported', input: 'mode' }));
    expect(detectSlots(omitted, required)).toEqual([]);
    expect(validateApiPrompt(corePrompt(), { ...catalog, Color: required.Color }).ok).toBe(true);
  });

  it('isolates omitted optional complex COMBO children in only the selected dynamic branch, without weakening selection or cloud checks', () => {
    const dynamic = (requiredComplex = false, cloud = false) => definition({ mode: ['COMFY_DYNAMICCOMBO_V3', { options: [
      { key: 'chosen', inputs: { required: { temperature: ['FLOAT', { min: 0, max: 2 }], ...(requiredComplex ? { complex: [[{ opaque: true }], {}] } : {}) }, optional: requiredComplex ? {} : { complex: [[{ opaque: true }], {}] } } },
      { key: 'off', inputs: { required: {} } },
    ] }] }, {}, { api_node: cloud, python_module: cloud ? 'comfy_api_nodes.fixture' : 'comfy_extras.fixture' });
    const catalog = catalogWith({ Color: dynamic() }), prompt = clampPrompt(true); prompt.one.inputs = { mode: 'chosen', 'mode.temperature': 0.5 };
    expect(validateApiPrompt(prompt, catalog).ok).toBe(true);
    for (const value of ['opaque', ['bool', 0]]) {
      const supplied = structuredClone(prompt); supplied.one.inputs['mode.complex'] = value;
      expect(validateApiPrompt(supplied, catalog).issues).toContainEqual(expect.objectContaining({ code: 'schema-unsupported', nodeId: 'one', input: 'mode.complex' }));
    }
    expect(validateApiPrompt(prompt, catalogWith({ Color: dynamic(true) })).issues).toContainEqual(expect.objectContaining({ code: 'schema-unsupported', input: 'mode.complex' }));
    const missing = structuredClone(prompt); delete missing.one.inputs['mode.temperature'];
    expect(validateApiPrompt(missing, catalog).issues).toContainEqual(expect.objectContaining({ code: 'missing-input', input: 'mode.temperature' }));
    for (const mode of ['unknown-key', { key: 'chosen' }]) {
      const invalid = structuredClone(prompt); invalid.one.inputs.mode = mode;
      expect(validateApiPrompt(invalid, catalog).issues).toContainEqual(expect.objectContaining({ code: 'node-unverified', input: 'mode' }));
    }
    const off = structuredClone(prompt); off.one.inputs = { mode: 'off', 'mode.temperature': 0.5 };
    expect(validateApiPrompt(off, catalog).issues).toContainEqual(expect.objectContaining({ code: 'unknown-input', input: 'mode.temperature' }));
    const cloud = validateApiPrompt(prompt, catalogWith({ Color: dynamic(false, true) }));
    expect(cloud.ok).toBe(false); expect(cloud.cloudNodes).toContainEqual({ nodeId: 'one', classType: 'Color' });
    expect(cloud.issues.some(item => item.code === 'cloud-node')).toBe(true);
  });

  it('exposes ordinary local enums as exact-site parameters, preserving bool edits and forbidding paths', () => {
    const catalog = catalogWith({ Color: enumDef([true, false]) }), prompt = clampPrompt(true), before = stableStringify(prompt);
    const slots = detectSlots(prompt, catalog), slot = slots.find(item => item.id === 'parameter:one:clamp')!;
    expect(slot).toMatchObject({ kind: 'parameter', valueType: 'combo', options: [true, false], defaultValue: true });
    const changed = applySlotValues(prompt, slots, { [slot.id]: false }, catalog);
    expect(changed.one.inputs.clamp).toBe(false); expect(typeof changed.one.inputs.clamp).toBe('boolean');
    expect(stableStringify(changed)).toContain('"clamp":false'); expect(stableStringify(prompt)).toBe(before);
    expect(() => applySlotValues(prompt, slots, { [slot.id]: 'false' }, catalog)).toThrow('live local options');
    expect(() => applySlotValues(prompt, slots, { 'parameter:out:filename_prefix': '../arbitrary' }, catalog)).toThrow('unknown');
    const restricted = catalogWith({ Color: definition({ remote: ['COMBO', { remote: { route: '/untrusted' } }], unenumerated: ['COMBO'], text: ['STRING'] }) });
    expect(detectSlots({ one: { class_type: 'Color', inputs: { remote: 'a', unenumerated: 'b', text: 'c' } } }, restricted)).toEqual([]);
  });

  it('does not promote mixed or absent model options into a model or parameter slot', () => {
    const catalog = catalogWith({ UNETLoader: definition({ unet_name: [['valid.safetensors', false]] }, {}, { python_module: 'nodes', output: ['MODEL'] }) });
    const prompt = corePrompt();
    expect(isModelLikeInput('unet_name', catalog.UNETLoader.inputs.unet_name, catalog.UNETLoader)).toBe(false);
    expect(detectSlots(prompt, catalog).some(item => item.nodeId === '1')).toBe(false);
    expect(validateApiPrompt(prompt, catalog).issues).toContainEqual(expect.objectContaining({ code: 'node-unverified', nodeId: '1', input: 'unet_name' }));
    const absent = catalogWith({ UNETLoader: definition({ unet_name: ['STRING'] }, {}, { output: ['MODEL'] }) });
    expect(detectSlots(prompt, absent).some(item => item.nodeId === '1')).toBe(false);
    expect(() => applySlotValues(prompt, detectSlots(corePrompt(), coreCatalog), { 'model:1:unet_name': 'valid.safetensors' }, catalog)).toThrow('no longer');
  });

  it('preserves positional and named bool UI widgets and blocks ambiguous unsupported widgets only when used', () => {
    const catalog = catalogWith({ Color: enumDef([true, false]), Bad: enumDef([{ opaque: true }]) });
    for (const first of [uiNode(1, 'Color', [false]), uiNode(1, 'Color', [], [], { widgets_values_named: { clamp: true } })]) {
      const value = ui(first), before = stableStringify(value), result = convertUiWorkflow(value, catalog);
      expect(result.prompt).not.toBeNull(); expect(typeof result.prompt!['1'].inputs.clamp).toBe('boolean');
      expect(validateApiPrompt(result.prompt, catalog).ok).toBe(true); expect(stableStringify(value)).toBe(before);
    }
    expect(convertUiWorkflow(ui(uiNode(1, 'Color', [true]), [uiNode(3, 'Bad', [{}])]), catalog).prompt).not.toBeNull();
    const result = convertUiWorkflow(ui(uiNode(1, 'Bad', [{}])), catalog);
    expect(result.prompt).toBeNull(); expect(result.issues).toContainEqual(expect.objectContaining({ code: 'schema-unsupported', nodeId: '1', classType: 'Bad', input: 'clamp' }));
    const invalid = convertUiWorkflow(ui(uiNode(1, 'Color', ['false'])), catalog);
    expect(invalid.prompt).not.toBeNull(); expect(validateApiPrompt(invalid.prompt, catalog).ok).toBe(false);
  });

  it('blocks relevant malformed nodes and bypass socket reads, not muted or disconnected malformed nodes', () => {
    const catalog = catalogWith({ Color: enumDef([true]), Broken: { input: null, output: ['IMAGE'], output_node: false } });
    expect(convertUiWorkflow(ui(uiNode(1, 'Color', [true]), [uiNode(3, 'Broken')]), catalog).prompt).not.toBeNull();
    expect(convertUiWorkflow(ui(uiNode(1, 'Color', [true]), [uiNode(3, 'Broken', [], [], { mode: 2 })]), catalog).prompt).not.toBeNull();
    const bad = convertUiWorkflow(ui(uiNode(1, 'Broken')), catalog);
    expect(bad.issues.some(item => item.code === 'node-schema-unsupported')).toBe(true); expect(bad.prompt).toBeNull();
    const bypass = convertUiWorkflow(ui(uiNode(1, 'Broken', [], [{ name: 'input', type: 'IMAGE', link: 2 }], { mode: 4 })), catalog);
    expect(bypass.issues.some(item => item.code === 'node-schema-unsupported')).toBe(true);
    const badSocket = catalogWith({ BadSocket: definition({ mode: [[{ opaque: true }], { forceInput: true }] }, {}, { output: ['*'] }) });
    const socketGraph = { nodes: [uiNode(1, 'BadSocket', [], [{ name: 'mode', type: '*', link: 2 }], { mode: 4, outputs: [{ type: '*' }] }), uiNode(2, 'SaveImage', ['fixture'], [{ name: 'images', type: 'IMAGE', link: 1 }]), uiNode(3, 'EmptyLatentImage', [32, 32, 1])], links: [[1, 1, 0, 2, 0, '*'], [2, 3, 0, 1, 0, '*']] };
    expect(convertUiWorkflow(socketGraph, badSocket).issues).toContainEqual(expect.objectContaining({ code: 'schema-unsupported', nodeId: '1', input: 'mode' }));
  });

  it('keeps bool combo proxy widget values typed inside expanded subgraphs', () => {
    const catalog = catalogWith({ Color: enumDef([true, false]) });
    const inner = { id: 'bool-subgraph', inputs: [], outputs: [{ name: 'image', type: 'IMAGE' }], nodes: [uiNode(10, 'Color', [true])], links: [{ id: 11, origin_id: 10, origin_slot: 0, target_id: -20, target_slot: 0, type: 'IMAGE' }] };
    const graph = { ...ui(uiNode(1, 'bool-subgraph', [false], [], { properties: { proxyWidgets: [['10', 'clamp']] } })), definitions: { subgraphs: [inner] } };
    const result = convertUiWorkflow(graph, catalog);
    expect(result.prompt).not.toBeNull(); expect(result.prompt!['1:10'].inputs.clamp).toBe(false);
    expect(validateApiPrompt(result.prompt, catalog).ok).toBe(true);
  });

  it('retains unsafe-prompt rejection and model/range/cloud/third-party safety checks', () => {
    expect(() => validateApiPrompt({ bad: { class_type: 'Color', inputs: { clamp: NaN } } }, catalogWith({ Color: enumDef([true]) }))).toThrow(ComfyValidationError);
    const prompt = corePrompt(); prompt['1'].inputs.unet_name = 'not-installed'; prompt['7'].inputs.steps = 0;
    const result = validateApiPrompt(prompt, coreCatalog);
    expect(result.issues.some(item => item.code === 'missing-model')).toBe(true); expect(result.issues.some(item => item.code === 'value-range')).toBe(true);
    expect(validateApiPrompt(clampPrompt(true), catalogWith({ Color: enumDef([true]) })).thirdParty).toHaveLength(1);
  });
});

import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import liveFixture from '../../tests/fixtures/comfy/object_info.local-trimmed.json';
import * as objectInfo from '../../src/comfyui/object-info';
import { corePrompt, rawCoreCatalog } from '../../src/comfyui/core.test-fixtures';
import { stableStringify } from '../../src/comfyui/canonical';
import { analyzeComfyWorkflow } from './comfyui-analysis';
import { builtinComfyGraphs } from './comfyui-presets';
import type { StoredComfyWorkflow } from './comfyui-service';
import type { ComfySlotValue } from '../../src/comfyui/contract';

const sha = (value: unknown) => createHash('sha256').update(stableStringify(value)).digest('hex');
const record = (payload: unknown = corePrompt(), sourceFormat: 'api' | 'ui' = 'api'): StoredComfyWorkflow => ({
  id: 'schema-compat-fixture', name: 'Schema compatibility fixture', createdAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-10-21T00:00:00.000Z',
  sourceKind: sourceFormat === 'api' ? 'api-json' : 'ui-json', sourceFormat, sourceSha256: sha(payload), fileName: null,
  templateName: null, familyLabel: null, lastAnalysis: null, savedValues: {}, payload,
});
const analyze = (payload: unknown, catalog: unknown, values: Record<string, ComfySlotValue> = {}, format: 'api' | 'ui' = 'api') => analyzeComfyWorkflow(record(payload, format), catalog, sha(catalog), values);
const boolCatalog = () => ({ ...rawCoreCatalog, Color: {
  input: { required: { clamp: [[true, false], { default: true }] } }, input_order: { required: ['clamp'] },
  output: ['IMAGE'], python_module: 'custom_nodes.fixture_only',
} });
const boolPrompt = () => ({ one: { class_type: 'Color', inputs: { clamp: true } }, out: { class_type: 'SaveImage', inputs: { images: ['one', 0], filename_prefix: 'fixture' } } });

describe('main-process schema compatibility integration', () => {
  it.each(builtinComfyGraphs())('scans builtin $family against cropped actual local schema, never blocked by unrelated unsupported nodes', recipe => {
    const before = stableStringify(liveFixture), compiled = analyze(recipe.graph, liveFixture);
    expect(compiled.analysis.issues.filter(item => item.severity === 'block').every(item => item.code === 'missing-model')).toBe(true);
    expect(compiled.analysis.schemaDiagnostics).toMatchObject({ total: 2, truncated: false });
    expect(compiled.analysis.issues.some(item => item.code === 'schema-unsupported' || item.code === 'node-schema-unsupported')).toBe(false);
    expect(stableStringify(liveFixture)).toBe(before); expect(compiled.prompt).toEqual(recipe.graph);
    // This fixture snapshots schemas/model names only; tests do not load models
    // or claim installed-file availability, inference, or frontend equivalence.
  });

  it('uses the same typed bool values through main analysis, saved-value echoes, JSON round trips and fingerprints', () => {
    const raw = boolCatalog(), prompt = boolPrompt(), source = record(prompt), revision = sha(raw);
    const initial = analyzeComfyWorkflow(source, raw, revision, {}), slot = initial.analysis.slots.find(item => item.id === 'parameter:one:clamp')!;
    expect(slot).toMatchObject({ valueType: 'combo', options: [true, false], defaultValue: true });
    const changed = analyzeComfyWorkflow(source, raw, revision, { [slot.id]: false });
    expect(changed.analysis.ok).toBe(true); expect(changed.prompt.one.inputs.clamp).toBe(false);
    expect(typeof changed.values[slot.id]).toBe('boolean'); expect(stableStringify(changed.prompt)).toContain('"clamp":false');
    const persisted = JSON.parse(JSON.stringify(changed.values)), cloned = structuredClone(persisted);
    const reused = analyzeComfyWorkflow(source, raw, revision, cloned);
    expect(reused.prompt.one.inputs.clamp).toBe(false); expect(reused.analysis.revision).toBe(changed.analysis.revision);
    expect(changed.analysis.revision).not.toBe(initial.analysis.revision); expect(source.payload).toEqual(prompt);
    const oldString = analyzeComfyWorkflow(source, raw, revision, { [slot.id]: 'false' });
    expect(oldString.analysis.ok).toBe(false); expect(oldString.analysis.issues).toContainEqual(expect.objectContaining({ code: 'invalid-option', nodeId: 'one', input: 'clamp' }));
    expect(oldString.prompt.one.inputs.clamp).toBe(true);
  });

  it('only blocks current graph dependencies and preserves optional unsupported/default and missing-class distinctions', () => {
    const bad = { input: { required: { mode: [[{ opaque: true }], {}] } }, output: ['IMAGE'], python_module: 'custom_nodes.fixture_only' };
    const catalog = { ...rawCoreCatalog, Bad: bad, Broken: { input: 'invalid', output: ['IMAGE'], api_node: true } };
    expect(analyze(corePrompt(), catalog).analysis.ok).toBe(true);
    const used = corePrompt(); used['1'].class_type = 'Bad'; used['1'].inputs = { mode: 'unknown' };
    const blocked = analyze(used, catalog);
    expect(blocked.analysis.ok).toBe(false); expect(blocked.analysis.issues).toContainEqual(expect.objectContaining({ code: 'schema-unsupported', nodeId: '1', classType: 'Bad', input: 'mode' }));
    used['1'].class_type = 'Broken'; used['1'].inputs = {};
    const broken = analyze(used, catalog);
    expect(broken.analysis.issues).toContainEqual(expect.objectContaining({ code: 'node-schema-unsupported', nodeId: '1', classType: 'Broken' }));
    expect(broken.analysis.cloudNodes).toContainEqual({ nodeId: '1', classType: 'Broken' });
    expect(broken.analysis.missingNodeTypes).toEqual([]);
    used['1'].class_type = 'Missing'; expect(analyze(used, catalog).analysis.missingNodeTypes).toEqual(['Missing']);
  });

  it('blocks schema-unsupported nodes during UI conversion while allowing unrelated server definitions', () => {
    const catalog = { ...boolCatalog(), Broken: { input: null, output: ['IMAGE'] } };
    const graph = { nodes: [
      { id: 1, type: 'Color', widgets_values: [false], inputs: [], outputs: [{ type: 'IMAGE' }] },
      { id: 2, type: 'SaveImage', widgets_values: ['fixture'], inputs: [{ name: 'images', type: 'IMAGE', link: 1 }], outputs: [] },
    ], links: [[1, 1, 0, 2, 0, 'IMAGE']] };
    const compiled = analyze(graph, catalog, {}, 'ui');
    expect(compiled.analysis.ok).toBe(true); expect(compiled.prompt['1'].inputs.clamp).toBe(false);
    expect(compiled.analysis.unverifiedConversion).toBe(true);
    graph.nodes[0].type = 'Broken';
    const broken = analyze(graph, catalog, {}, 'ui');
    expect(broken.analysis.ok).toBe(false); expect(broken.analysis.issues.some(item => item.code === 'node-schema-unsupported')).toBe(true);
  });

  it('caches only the same main-owned raw object and revision, preserving safety checks on hits', () => {
    const parse = vi.spyOn(objectInfo, 'normalizeObjectInfoWithDiagnostics');
    try {
      const raw = structuredClone(boolCatalog()), source = record(boolPrompt()), revision = sha(raw);
      analyzeComfyWorkflow(source, raw, revision, {});
      analyzeComfyWorkflow(source, raw, revision, { 'parameter:one:clamp': false });
      expect(parse).toHaveBeenCalledTimes(1);
      analyzeComfyWorkflow(source, raw, revision + '-refreshed', {}); expect(parse).toHaveBeenCalledTimes(2);
      const other = structuredClone(raw); analyzeComfyWorkflow(source, other, revision + '-refreshed', {}); expect(parse).toHaveBeenCalledTimes(3);
      Object.assign(other, { Unsafe: JSON.parse('{"__proto__":{}}') });
      expect(() => analyzeComfyWorkflow(source, other, revision + '-refreshed', {})).toThrow('Forbidden JSON key');
      expect(parse).toHaveBeenCalledTimes(3);
    } finally { parse.mockRestore(); }
  });

  it('returns bounded shape-only diagnostics, not raw defaults, as environment information', () => {
    const catalog: Record<string, unknown> = { ...rawCoreCatalog };
    for (let i = 0; i < 60; i++) catalog['Bad' + i] = { display_name: 'x'.repeat(1000), input: { required: { mode: [[{ opaque: true }], { default: 'PRIVATE-DEFAULT-MUST-NOT-LEAK' }] } } };
    const report = analyze(corePrompt(), catalog).analysis, summary = report.schemaDiagnostics!;
    expect(report.ok).toBe(true); expect(summary.total).toBe(60); expect(summary.items).toHaveLength(50); expect(summary.truncated).toBe(true);
    expect(summary.items.every(item => item.displayName.length <= 256 && item.detail.length <= 512)).toBe(true);
    expect(stableStringify(summary)).not.toContain('PRIVATE-DEFAULT-MUST-NOT-LEAK');
    expect(report.issues.some(item => item.code === 'schema-unsupported')).toBe(false);
    expect(() => analyze(corePrompt(), {})).toThrow('COMFY_INVALID_CATALOG');
    expect(() => analyze(corePrompt(), { ...rawCoreCatalog, Unsafe: JSON.parse('{"constructor":{}}') })).toThrow('Forbidden JSON key');
  });
});

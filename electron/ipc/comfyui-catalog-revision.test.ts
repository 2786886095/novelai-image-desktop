import { describe, expect, it } from 'vitest';
import { workflowCatalogCompatibilityRevision } from './comfyui-catalog-revision';
import { analyzeComfyWorkflow } from './comfyui-analysis';
import { corePrompt, rawCoreCatalog } from '../../src/comfyui/core.test-fixtures';
import { stableStringify } from '../../src/comfyui/canonical';
import type { StoredComfyWorkflow } from './comfyui-service';

const source = { sourceFormat: 'api' as const, payload: corePrompt() };
const unrelated = (value: string) => ({ ...rawCoreCatalog, UnrelatedRandomDefaults: { input: { required: { value: ['STRING', { default: value }] } }, output: ['STRING'], python_module: 'custom_nodes.fixture' } });
const digest = (catalog: unknown) => workflowCatalogCompatibilityRevision(source, catalog);

describe('source-scoped full-definition catalog compatibility revision', () => {
  it('ignores unrelated changing defaults without excluding defaults or special-casing a node', () => {
    const a = unrelated('generated-a'), b = unrelated('generated-b');
    expect(digest(a)).toBe(digest(b));
    const reordered = Object.fromEntries(Object.entries(a).reverse());
    expect(digest(reordered)).toBe(digest(a));
    const withRandom = { ...source, payload: { ...source.payload, random: { class_type: 'UnrelatedRandomDefaults', inputs: { value: 'explicit' } } } };
    expect(workflowCatalogCompatibilityRevision(withRandom, a)).not.toBe(workflowCatalogCompatibilityRevision(withRandom, b));
  });

  it.each([
    ['model enumeration', (raw: Record<string, any>) => raw.UNETLoader.input.required.unet_name[0].push('new-local.safetensors')],
    ['socket type', (raw: Record<string, any>) => raw.UNETLoader.output[0] = 'CHANGED_MODEL'],
    ['input default', (raw: Record<string, any>) => raw.CLIPTextEncode.input.required.text[1].default = 'changed default'],
    ['origin', (raw: Record<string, any>) => raw.UNETLoader.python_module = 'custom_nodes.changed'],
    ['cloud marker', (raw: Record<string, any>) => raw.UNETLoader.api_node = true],
    ['required schema', (raw: Record<string, any>) => raw.UNETLoader.input.required.unet_name = [[{ opaque: true }]]],
    ['missing definition', (raw: Record<string, any>) => delete raw.UNETLoader],
  ] as const)('invalidates %s changes in a referenced definition', (_name, mutate) => {
    const changed = structuredClone(rawCoreCatalog); mutate(changed);
    expect(digest(changed)).not.toBe(digest(rawCoreCatalog));
  });

  it('covers UI bypass, folded controls, proxy targets and nested unselected classes, not only final API outputs', () => {
    const ui = { sourceFormat: 'ui' as const, payload: { nodes: [{ id: 1, type: 'Bypass', mode: 4 }, { id: 2, type: 'PrimitiveBoolean' }, { id: 3, type: 'subgraph' }], definitions: { subgraphs: [{ id: 'subgraph', nodes: [{ id: 10, type: 'ProxyTarget' }, { id: 11, type: 'UnselectedBranch' }], definitions: { subgraphs: [{ id: 'nested', nodes: [{ id: 12, type: 'Nested' }] }] } }] } } };
    const raw = Object.fromEntries(['Bypass', 'PrimitiveBoolean', 'ProxyTarget', 'UnselectedBranch', 'Nested'].map(name => [name, { input: {}, output: ['*'] }]));
    const first = workflowCatalogCompatibilityRevision(ui, raw);
    for (const classType of Object.keys(raw)) {
      const changed = structuredClone(raw); Object.assign(changed[classType], { output: ['CHANGED'] });
      expect(workflowCatalogCompatibilityRevision(ui, changed)).not.toBe(first);
    }
  });

  it('retains global unsafe JSON rejection outside the selected scope', () => {
    expect(() => digest({ ...rawCoreCatalog, UnusedUnsafe: JSON.parse('{"__proto__":{}}') })).toThrow('Forbidden JSON key');
    expect(() => digest({ ...rawCoreCatalog, UnusedUnsafe: { value: NaN } })).toThrow('finite');
  });

  it('binds analysis and third-party confirmations to the same referenced definitions', () => {
    const graph = corePrompt();
    const record: StoredComfyWorkflow = { id: 'scope-fixture', name: 'fixture', createdAt: '', updatedAt: '', sourceKind: 'api-json', sourceFormat: 'api', sourceSha256: 'fixed-source', fileName: null, templateName: null, familyLabel: null, lastAnalysis: null, savedValues: {}, payload: graph };
    const a = unrelated('first'), b = unrelated('second');
    a.UNETLoader.python_module = b.UNETLoader.python_module = 'custom_nodes.fixture';
    const first = analyzeComfyWorkflow(record, a, 'full-a', {}), second = analyzeComfyWorkflow(record, b, 'full-b', {});
    expect(first.analysis.revision).toBe(second.analysis.revision); expect(first.analysis.thirdPartyFingerprint).toBe(second.analysis.thirdPartyFingerprint);
    const changed = structuredClone(b); changed.UNETLoader.input.required.unet_name[0].push('new-local.safetensors');
    const third = analyzeComfyWorkflow(record, changed, 'full-c', {});
    expect(third.analysis.revision).not.toBe(second.analysis.revision); expect(third.analysis.thirdPartyFingerprint).not.toBe(second.analysis.thirdPartyFingerprint);
    expect(stableStringify(graph)).toBe(stableStringify(corePrompt()));
  });
});

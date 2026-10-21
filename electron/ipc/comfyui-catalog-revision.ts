import { createHash } from 'node:crypto';
import { assertUntrustedValue, ComfyValidationError, isPlainRecord } from '../../src/comfyui/format-detect';
import { stableStringify } from '../../src/comfyui/canonical';

type Source = { sourceFormat: 'api' | 'ui'; payload: unknown };

/**
 * A main-owned, conservative schema scope, derived from the stored source, not
 * renderer-supplied slot paths or only the final API graph. UI source classes
 * include bypasses, folded controls, proxy targets and unselected branches in
 * nested subgraphs: over-invalidation is safer than omitting a conversion read.
 * Every selected definition is hashed in full, including defaults, sockets,
 * model enums and node origin/cloud markers. No node-specific exclusions.
 */
export function workflowCatalogCompatibilityRevision(source: Source, rawCatalog: unknown): string {
  // Scoping is not a way to hide unsafe data in an unrelated server definition.
  assertUntrustedValue(rawCatalog, { maxStringChars: 4 * 1024 * 1024 });
  if (!isPlainRecord(rawCatalog) || !Object.keys(rawCatalog).length) throw new ComfyValidationError('COMFY_INVALID_CATALOG: object_info is not a nonempty node dictionary');
  const classes = new Set<string>();
  if (source.sourceFormat === 'api') {
    if (isPlainRecord(source.payload)) for (const node of Object.values(source.payload)) {
      if (isPlainRecord(node) && typeof node.class_type === 'string') classes.add(node.class_type);
    }
  } else {
    const graphs: unknown[] = [source.payload], seen = new Set<object>();
    while (graphs.length) {
      const graph = graphs.pop(); if (!isPlainRecord(graph) || seen.has(graph)) continue; seen.add(graph);
      if (Array.isArray(graph.nodes)) for (const node of graph.nodes) {
        if (isPlainRecord(node) && typeof node.type === 'string') classes.add(node.type);
      }
      if (isPlainRecord(graph.definitions) && Array.isArray(graph.definitions.subgraphs)) for (const child of graph.definitions.subgraphs) graphs.push(child);
    }
  }
  const definitions = Object.fromEntries([...classes].sort().map(classType => [classType, Object.hasOwn(rawCatalog,classType) ? rawCatalog[classType] : null]));
  return createHash('sha256').update(stableStringify({ scope: 'stored-source-full-definitions-v1', definitions })).digest('hex');
}

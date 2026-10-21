import { parseImageMeta } from "../../src/png-meta";
import { parseUntrustedJson, detectComfyPayload, payloadFromImageMetadata, ComfyValidationError, assertUntrustedValue } from "../../src/comfyui/format-detect";
import { normalizeObjectInfoWithDiagnostics, type ComfyNormalizedObjectInfo } from "../../src/comfyui/object-info";
import { assertSubmittablePrompt, validateApiPrompt, thirdPartyCanonical, isLinkRef, type ComfyApiPrompt } from "../../src/comfyui/api-prompt";
import { detectSlotsWithReport, applySlotValues, resolveStaticScalar } from "../../src/comfyui/slots";
import { guessFamily } from "../../src/comfyui/families";
import { convertUiWorkflow } from "../../src/comfyui/ui-workflow";
import { sha256Hex, stableStringify } from "../../src/comfyui/canonical";
import { COMFY_LIMITS, type ComfyAnalysis, type ComfyIssue, type ComfySlot, type ComfySlotValue, type ComfyConversionSummary, type ComfyPrunedNode } from "../../src/comfyui/contract";
import type { StoredComfyWorkflow, TrustedComfyAnalysis, ComfyWorkflowInput } from "./comfyui-service";
import { workflowCatalogCompatibilityRevision } from "./comfyui-catalog-revision";

export function parseComfyWorkflow(text: string, image?: Buffer): ComfyWorkflowInput {
  // Existing bounded metadata readers support PNG text/zTXt/iTXt and WebP EXIF.
  // Prefer a captured API prompt over UI editor state when both are present.
  const value = image ? parseImageMeta(Uint8Array.from(image).buffer) : parseUntrustedJson(text);
  const found = image ? payloadFromImageMetadata(value) : detectComfyPayload(value);
  if (!found.format) throw new ComfyValidationError("No ComfyUI API prompt or UI workflow was found. Export an API-format workflow in ComfyUI, or choose an original image containing prompt/workflow metadata.", "unknown-format");
  return { payload: found.payload, format: found.format, sourceKind: image ? "image-metadata" : found.format === "ui" ? "ui-json" : "api-json" };
}

function problems(error: unknown): ComfyIssue[] {
  return error instanceof ComfyValidationError ? error.issues
    : [{ code: "conversion-error", severity: "block", message: error instanceof Error ? error.message : String(error) }];
}
function uniqueIssues(issues: ComfyIssue[]): ComfyIssue[] {
  const seen = new Set<string>();
  return issues.filter(issue => { const key = stableStringify(issue); if (seen.has(key)) return false; seen.add(key); return true; });
}

// Main owns the fetched JSON and its revision. Do not share a cached normalized
// schema with another raw object (even if a caller mistakenly reuses a revision).
// One entry bounds memory and naturally expires when inventory is replaced. The
// service refresh/revision gate is also used immediately before submission.
let catalogCache: { raw: unknown; revision: string; result: ComfyNormalizedObjectInfo } | undefined;
function normalizedCatalog(raw: unknown, revision: string): ComfyNormalizedObjectInfo {
  const cached = catalogCache;
  if (cached && cached.raw === raw && cached.revision === revision) {
    // Keep the global security boundary even on hits; schema-isolation never
    // suppresses unsafe JSON, including accidental mutation of main-owned data.
    assertUntrustedValue(raw, { maxStringChars: 4 * 1024 * 1024 });
    return cached.result;
  }
  const result = normalizeObjectInfoWithDiagnostics(raw);
  catalogCache = { raw, revision, result };
  return result;
}

/** Main-process compiler. The renderer supplies scalar slot values, never a graph. */
export function analyzeComfyWorkflow(
  record: StoredComfyWorkflow,
  rawCatalog: unknown,
  catalogRevision: string,
  values: Record<string, ComfySlotValue>,
): TrustedComfyAnalysis {
  const normalized = normalizedCatalog(rawCatalog, catalogRevision), catalog = normalized.catalog;
  const compatibilityRevision = workflowCatalogCompatibilityRevision(record, rawCatalog);
  let prompt: ComfyApiPrompt | null = null;
  let issues: ComfyIssue[] = [];
  let slots: ComfySlot[] = [], branches: ComfySlot[] = [];
  let conversion: ComfyConversionSummary | null = null;
  let prunedNodes: ComfyPrunedNode[] = [];
  let unverifiedConversion = false;
  let omittedGeneric = 0;
  try {
    if (record.sourceFormat === "ui") {
      const converted = convertUiWorkflow(record.payload, catalog, { slotValues: values });
      prompt = converted.prompt; issues.push(...converted.issues); conversion = converted.conversion;
      branches = converted.branchSlots; prunedNodes = converted.prunedNodes; unverifiedConversion = converted.unverified;
      if (prompt) { const detected = detectSlotsWithReport(prompt, catalog, converted.slotHints); slots = detected.slots; omittedGeneric = detected.omittedGeneric; }
      if (unverifiedConversion && !issues.some(issue => issue.code === "conversion-unverified")) issues.push({
        code: "conversion-unverified", severity: "confirm", message: "UI-to-API conversion has not been proven against an official frontend export. Review the conversion report and explicitly confirm before running; exporting API format avoids this conversion.",
      });
    } else {
      prompt = structuredClone(assertSubmittablePrompt(record.payload));
      const detected = detectSlotsWithReport(prompt, catalog); slots = detected.slots; omittedGeneric = detected.omittedGeneric;
    }
    if (prompt) {
      // Converted branch controllers may have been folded out of the API graph.
      // Reserve their budget before generic fields, and give each exact site a
      // single editor rather than silently rebinding an old draft id.
      branches = [...new Map(branches.map(slot => [`${slot.nodeId}:${slot.input}`,slot])).values()];
      const branchSites = new Set(branches.map(slot => `${slot.nodeId}:${slot.input}`));
      slots = slots.filter(slot => !branchSites.has(`${slot.nodeId}:${slot.input}`));
      const semanticCount = branches.length + slots.filter(slot => slot.kind !== "parameter").length;
      if (semanticCount > COMFY_LIMITS.slotCount) throw new ComfyValidationError("Too many editable semantic slots", "too-large");
      let genericBudget = COMFY_LIMITS.slotCount - semanticCount;
      slots = slots.filter(slot => {
        if (slot.kind !== "parameter") return true;
        if (genericBudget > 0) { genericBudget--; return true; }
        omittedGeneric++; return false;
      });
      if (omittedGeneric > 0) issues.push({
        code: "generic-slots-limited", severity: "info",
        message: `The parameter panel is limited to ${COMFY_LIMITS.slotCount} editable inputs; ${omittedGeneric} additional generic inputs retain their workflow values.`,
      });
      const known = new Set([...branches, ...slots].map(slot => slot.id));
      for (const key of Object.keys(values)) if (!known.has(key)) issues.push({
        code: "stale-slot", severity: "block", message: `Slot no longer belongs to the active workflow: ${key}. Remove it or reselect this workflow before running.`,
      });
      const apiSites = new Map(slots.map(slot => [slot.id, slot]));
      const apiValues = Object.fromEntries(Object.entries(values).filter(([id, value]) => {
        const slot = apiSites.get(id); if (!slot) return false;
        const input = prompt![slot.nodeId]?.inputs[slot.input];
        // Reusing a saved result echoes full values. An equal statically known
        // primitive value is not a request to destroy its original link.
        return !isLinkRef(input) || resolveStaticScalar(prompt!, input, catalog) !== value;
      }));
      try { prompt = applySlotValues(prompt, slots, apiValues, catalog); }
      catch (error) { issues.push(...problems(error)); }
    }
  } catch (error) { issues.push(...problems(error)); }

  const validation = prompt ? validateApiPrompt(prompt, catalog) : null;
  if (validation) issues.push(...validation.issues);
  // Keep original slot descriptors so imported missing model values remain
  // visible and fixable. A resolved value is recorded only after safe binding.
  const resolvedValues: Record<string, ComfySlotValue> = {};
  if (prompt) for (const slot of slots) {
    const input = prompt[slot.nodeId]?.inputs[slot.input];
    const resolved = resolveStaticScalar(prompt, input, catalog);
    if (resolved !== null) resolvedValues[slot.id] = resolved;
  }
  for (const branch of branches) {
    const current = Object.hasOwn(values, branch.id) ? values[branch.id] : branch.defaultValue;
    if (current !== null && current !== undefined) resolvedValues[branch.id] = current;
  }
  const thirdParty = validation?.thirdParty || [];
  const thirdPartyFingerprint = thirdParty.length ? sha256Hex(stableStringify({
    source: record.sourceSha256, catalogRevision: compatibilityRevision, classes: thirdPartyCanonical(thirdParty),
  })) : null;
  issues = uniqueIssues(issues);
  const analysis: ComfyAnalysis = {
    ok: !!validation?.ok && !issues.some(issue => issue.severity === "block"),
    revision: sha256Hex(stableStringify({ source: record.sourceSha256, format: record.sourceFormat, catalogRevision: compatibilityRevision,
      prompt, branches: Object.fromEntries(branches.map(slot => [slot.id, resolvedValues[slot.id] ?? null])), issues })),
    sourceFormat: record.sourceFormat, issues, slots: [...branches, ...slots],
    schemaDiagnostics: { total: normalized.diagnostics.length, truncated: normalized.diagnostics.length > 50,
      items: normalized.diagnostics.slice(0,50).map(item => ({ code: item.code, classType: item.classType.slice(0,256), displayName: item.displayName.slice(0,256),
        ...(item.input ? { input: item.input.slice(0,256) } : {}), detail: item.detail.slice(0,512) })) },
    missingNodeTypes: validation?.missingNodeTypes || [...new Set(issues.filter(issue => issue.code === "missing-node-type").map(issue => issue.classType).filter((type): type is string => !!type))],
    missingModels: validation?.missingModels || [], cloudNodes: validation?.cloudNodes || [], thirdParty, thirdPartyFingerprint,
    unverifiedConversion, conversion, family: prompt ? guessFamily(prompt, record.templateName || undefined) : null,
    prunedNodes, nodeCount: prompt ? Object.keys(prompt).length : 0, outputNodes: validation?.outputNodes || [],
  };
  return { analysis, prompt: prompt || {}, values: resolvedValues, compatibilityRevision };
}

import { parseImageMeta } from "../../src/png-meta";
import { parseUntrustedJson, detectComfyPayload, payloadFromImageMetadata, ComfyValidationError } from "../../src/comfyui/format-detect";
import { normalizeObjectInfo } from "../../src/comfyui/object-info";
import { assertSubmittablePrompt, validateApiPrompt, thirdPartyCanonical, isLinkRef, type ComfyApiPrompt } from "../../src/comfyui/api-prompt";
import { detectSlots, applySlotValues, resolveStaticScalar } from "../../src/comfyui/slots";
import { guessFamily } from "../../src/comfyui/families";
import { convertUiWorkflow } from "../../src/comfyui/ui-workflow";
import { sha256Hex, stableStringify } from "../../src/comfyui/canonical";
import type { ComfyAnalysis, ComfyIssue, ComfySlot, ComfySlotValue, ComfyConversionSummary, ComfyPrunedNode } from "../../src/comfyui/contract";
import type { StoredComfyWorkflow, TrustedComfyAnalysis, ComfyWorkflowInput } from "./comfyui-service";

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

/** Main-process compiler. The renderer supplies scalar slot values, never a graph. */
export function analyzeComfyWorkflow(
  record: StoredComfyWorkflow,
  rawCatalog: unknown,
  catalogRevision: string,
  values: Record<string, ComfySlotValue>,
): TrustedComfyAnalysis {
  const catalog = normalizeObjectInfo(rawCatalog);
  let prompt: ComfyApiPrompt | null = null;
  let issues: ComfyIssue[] = [];
  let slots: ComfySlot[] = [], branches: ComfySlot[] = [];
  let conversion: ComfyConversionSummary | null = null;
  let prunedNodes: ComfyPrunedNode[] = [];
  let unverifiedConversion = false;
  try {
    if (record.sourceFormat === "ui") {
      const converted = convertUiWorkflow(record.payload, catalog, { slotValues: values });
      prompt = converted.prompt; issues.push(...converted.issues); conversion = converted.conversion;
      branches = converted.branchSlots; prunedNodes = converted.prunedNodes; unverifiedConversion = converted.unverified;
      if (prompt) slots = detectSlots(prompt, catalog, converted.slotHints);
      if (unverifiedConversion && !issues.some(issue => issue.code === "conversion-unverified")) issues.push({
        code: "conversion-unverified", severity: "confirm", message: "UI-to-API conversion has not been proven against an official frontend export. Review the conversion report and explicitly confirm before running; exporting API format avoids this conversion.",
      });
    } else {
      prompt = structuredClone(assertSubmittablePrompt(record.payload));
      slots = detectSlots(prompt, catalog);
    }
    if (prompt) {
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
    source: record.sourceSha256, catalogRevision, classes: thirdPartyCanonical(thirdParty),
  })) : null;
  issues = uniqueIssues(issues);
  const analysis: ComfyAnalysis = {
    ok: !!validation?.ok && !issues.some(issue => issue.severity === "block"),
    revision: sha256Hex(stableStringify({ source: record.sourceSha256, format: record.sourceFormat, catalogRevision,
      prompt, branches: Object.fromEntries(branches.map(slot => [slot.id, resolvedValues[slot.id] ?? null])), issues })),
    sourceFormat: record.sourceFormat, issues, slots: [...branches, ...slots],
    missingNodeTypes: validation?.missingNodeTypes || [...new Set(issues.filter(issue => issue.code === "missing-node-type").map(issue => issue.classType).filter((type): type is string => !!type))],
    missingModels: validation?.missingModels || [], cloudNodes: validation?.cloudNodes || [], thirdParty, thirdPartyFingerprint,
    unverifiedConversion, conversion, family: prompt ? guessFamily(prompt, record.templateName || undefined) : null,
    prunedNodes, nodeCount: prompt ? Object.keys(prompt).length : 0, outputNodes: validation?.outputNodes || [],
  };
  return { analysis, prompt: prompt || {}, values: resolvedValues };
}

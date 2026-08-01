import {
  DEFAULT_PARAMS,
  type GenerateParams,
  type TagComicCandidate,
  type TagComicGenerateRequest,
  type TagComicImageSize,
  type TagComicPanel,
  type TagComicPanelReference,
  type TagComicProject,
  type TagComicReferenceAsset,
} from "../types";

export const TAG_COMIC_STORAGE_KEY = "langbai.novelai.tag-comic-project.v2";

export const TAG_COMIC_SIZE_PRESETS = [
  { width: 1024, height: 1024 },
  { width: 1216, height: 832 },
  { width: 832, height: 1216 },
  { width: 1024, height: 1536 },
  { width: 1536, height: 1024 },
] as const satisfies readonly TagComicImageSize[];

export class TagComicSizeImportError extends Error {
  constructor(
    readonly code: "empty" | "count" | "blank" | "format" | "unsupported",
    readonly line?: number,
    readonly expected?: number,
    readonly actual?: number,
  ) {
    super(`Comic size import failed: ${code}`);
    this.name = "TagComicSizeImportError";
  }
}

export class TagComicPanelRangeError extends Error {
  constructor(
    readonly code: "empty" | "format" | "outOfRange",
    readonly token?: string,
  ) {
    super(`Comic panel range failed: ${code}`);
    this.name = "TagComicPanelRangeError";
  }
}

export function parseTagComicPanelRange(
  value: string,
  panelCount: number,
): number[] {
  const source = value.trim().replace(/[，、]/g, ",");
  if (!source) throw new TagComicPanelRangeError("empty");
  const result = new Set<number>();
  for (const rawToken of source.split(/[\s,]+/)) {
    const token = rawToken.trim();
    if (!token) continue;
    const match = token.match(/^(\d+)(?:\s*[-–—~～]\s*(\d+))?$/);
    if (!match) throw new TagComicPanelRangeError("format", token);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (
      start < 1 ||
      end < 1 ||
      start > panelCount ||
      end > panelCount ||
      end < start
    ) {
      throw new TagComicPanelRangeError("outOfRange", token);
    }
    for (let index = start; index <= end; index += 1) result.add(index);
  }
  if (!result.size) throw new TagComicPanelRangeError("empty");
  return [...result].sort((a, b) => a - b);
}

export function formatTagComicPanelRange(
  panelIds: string[],
  panels: TagComicPanel[],
): string {
  const ids = new Set(panelIds);
  const numbers = panels
    .filter((panel) => ids.has(panel.id))
    .map((panel) => panel.index)
    .sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let cursor = 0; cursor < numbers.length; cursor += 1) {
    const start = numbers[cursor];
    let end = start;
    while (numbers[cursor + 1] === end + 1) {
      end = numbers[++cursor];
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
  }
  return ranges.join(", ");
}

export function tagComicReferenceApplies(
  reference: TagComicReferenceAsset,
  panelId: string,
): boolean {
  if (reference.scope === "all") return true;
  const listed = reference.scopePanelIds.includes(panelId);
  return reference.scope === "include" ? listed : !listed;
}

export function resolveTagComicPanelReferences(
  project: TagComicProject,
  panel: TagComicPanel,
): TagComicPanelReference[] {
  return project.preciseReferences.flatMap((reference) => {
    const override = panel.preciseReferences.find(
      (item) => item.referenceId === reference.id,
    );
    const enabled =
      override?.enabled ?? tagComicReferenceApplies(reference, panel.id);
    if (!enabled) return [];
    return [
      override ?? {
        referenceId: reference.id,
        enabled: true,
        type: reference.type,
        strength: reference.strength,
        fidelity: reference.fidelity,
        informationExtracted: reference.informationExtracted,
      },
    ];
  });
}

export function tagComicSizeTemplate(
  count: number,
  size: TagComicImageSize,
): string {
  return Array.from(
    { length: Math.max(0, Math.floor(count)) },
    () => `${size.width}×${size.height}`,
  ).join("\n");
}

export function parseTagComicSizeImport(
  text: string,
  expectedCount: number,
): TagComicImageSize[] {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!source.trim()) throw new TagComicSizeImportError("empty");
  const lines = source.trim().split("\n");
  if (lines.length !== expectedCount) {
    throw new TagComicSizeImportError(
      "count",
      undefined,
      expectedCount,
      lines.length,
    );
  }
  const allowed = new Set(
    TAG_COMIC_SIZE_PRESETS.map((size) => `${size.width}x${size.height}`),
  );
  return lines.map((raw, index) => {
    const line = raw.trim();
    if (!line) throw new TagComicSizeImportError("blank", index + 1);
    const match = line.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    if (!match) throw new TagComicSizeImportError("format", index + 1);
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!allowed.has(`${width}x${height}`)) {
      throw new TagComicSizeImportError("unsupported", index + 1);
    }
    return { width, height };
  });
}

export function createTagComicProject(
  params: GenerateParams = DEFAULT_PARAMS,
): TagComicProject {
  return {
    schemaVersion: 2,
    id: crypto.randomUUID(),
    title: "Untitled comic",
    globalStylePrompt: params.stylePrompt,
    globalNegativePrompt: params.negativePrompt,
    sizeMode: "uniform",
    initialGenerationCount: 1,
    globalParams: { ...params, positivePrompt: "" },
    preciseReferences: [],
    panels: [],
  };
}

function id() {
  return (
    crypto.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export function createTagComicPanel(
  prompt = "",
  index = 1,
  title = "",
): TagComicPanel {
  return {
    id: id(),
    index,
    title: title.trim() || `Panel ${index}`,
    prompt: prompt.trim(),
    preciseReferences: [],
    paramsOverride: { enabled: false, params: {} },
    status: "ready",
    candidates: [],
  };
}

function normalizeCandidate(
  raw: Partial<TagComicCandidate>,
  trustOutputs: boolean,
): TagComicCandidate | null {
  if (!trustOutputs || !raw.outputPath || !raw.outputUrl) return null;
  return {
    id: raw.id || id(),
    historyItemId: raw.historyItemId || "",
    outputPath: raw.outputPath,
    outputUrl: raw.outputUrl,
    createdAt: raw.createdAt || new Date().toISOString(),
    actualAnlas: raw.actualAnlas,
  };
}

function referenceNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function normalizeReferenceAsset(
  raw: Partial<TagComicReferenceAsset>,
  legacyPanelIds: string[],
): TagComicReferenceAsset | null {
  if (!raw.id || !raw.filePath || !raw.fileUrl) return null;
  const type =
    raw.type === "style" || raw.type === "character&style"
      ? raw.type
      : "character";
  return {
    id: raw.id,
    name: String(raw.name || "reference"),
    filePath: raw.filePath,
    fileUrl: raw.fileUrl,
    type,
    strength: referenceNumber(raw.strength, 1),
    fidelity: referenceNumber(raw.fidelity, 1),
    informationExtracted: referenceNumber(raw.informationExtracted, 1),
    scope:
      raw.scope === "all" || raw.scope === "exclude"
        ? raw.scope
        : "include",
    scopePanelIds: Array.isArray(raw.scopePanelIds)
      ? raw.scopePanelIds.filter((item): item is string => typeof item === "string")
      : legacyPanelIds,
  };
}

function normalizePanelReference(
  raw: Partial<TagComicPanelReference>,
  available: Set<string>,
): TagComicPanelReference | null {
  if (!raw.referenceId || !available.has(raw.referenceId)) return null;
  const type =
    raw.type === "style" || raw.type === "character&style"
      ? raw.type
      : "character";
  return {
    referenceId: raw.referenceId,
    enabled: raw.enabled !== false,
    type,
    strength: referenceNumber(raw.strength, 1),
    fidelity: referenceNumber(raw.fidelity, 1),
    informationExtracted: referenceNumber(raw.informationExtracted, 1),
  };
}

export function normalizeTagComicProject(
  raw: unknown,
  params: GenerateParams = DEFAULT_PARAMS,
  options: { trustOutputs?: boolean } = {},
): TagComicProject {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid comic project");
  }
  const source = raw as Partial<TagComicProject>;
  if (source.schemaVersion !== 2) {
    throw new Error("Only comic project schema v2 is supported");
  }
  const base = createTagComicProject(params);
  const panels = Array.isArray(source.panels) ? source.panels : [];
  const preciseReferences = options.trustOutputs && Array.isArray(source.preciseReferences)
    ? source.preciseReferences
        .map((item) =>
          normalizeReferenceAsset(
            item,
            panels.flatMap((panel) => {
              const rawPanel = panel as Partial<TagComicPanel>;
              return rawPanel.id &&
                Array.isArray(rawPanel.preciseReferences) &&
                rawPanel.preciseReferences.some(
                  (selection) => selection.referenceId === item.id,
                )
                ? [rawPanel.id]
                : [];
            }),
          ),
        )
        .filter((item): item is TagComicReferenceAsset => Boolean(item))
    : [];
  const availableReferences = new Set(preciseReferences.map((item) => item.id));
  return {
    ...base,
    id: source.id || base.id,
    title: String(source.title || base.title),
    historyGroupId: options.trustOutputs ? source.historyGroupId : undefined,
    globalStylePrompt: String(
      source.globalStylePrompt ?? base.globalStylePrompt,
    ),
    globalNegativePrompt: String(
      source.globalNegativePrompt ?? base.globalNegativePrompt,
    ),
    sizeMode: source.sizeMode === "perPanel" ? "perPanel" : "uniform",
    initialGenerationCount: Math.max(
      1,
      Math.min(10, Math.round(Number(source.initialGenerationCount) || 1)),
    ),
    globalParams: {
      ...params,
      ...(source.globalParams ?? {}),
      positivePrompt: "",
    },
    preciseReferences,
    panels: panels.map((rawPanel, panelIndex) => {
      const panel = rawPanel as Partial<TagComicPanel>;
      const candidates = Array.isArray(panel.candidates)
        ? panel.candidates
            .map((item) =>
              normalizeCandidate(item, options.trustOutputs === true),
            )
            .filter((item): item is TagComicCandidate => Boolean(item))
        : [];
      const selectedCandidateId = candidates.some(
        (item) => item.id === panel.selectedCandidateId,
      )
        ? panel.selectedCandidateId
        : candidates[0]?.id;
      return {
        ...createTagComicPanel(
          String(panel.prompt ?? ""),
          panelIndex + 1,
          String(panel.title ?? ""),
        ),
        id: panel.id || id(),
        preciseReferences:
          options.trustOutputs && Array.isArray(panel.preciseReferences)
            ? panel.preciseReferences
                .map((item) => normalizePanelReference(item, availableReferences))
                .filter((item): item is TagComicPanelReference => Boolean(item))
            : [],
        imageSize:
          panel.imageSize &&
          TAG_COMIC_SIZE_PRESETS.some(
            (size) =>
              size.width === panel.imageSize?.width &&
              size.height === panel.imageSize?.height,
          )
            ? {
                width: panel.imageSize.width,
                height: panel.imageSize.height,
              }
            : undefined,
        paramsOverride: {
          enabled: panel.paramsOverride?.enabled === true,
          params: panel.paramsOverride?.params ?? {},
        },
        status: candidates.length
          ? "done"
          : panel.status === "failed"
            ? "failed"
            : "ready",
        candidates,
        selectedCandidateId,
        error: options.trustOutputs ? panel.error : undefined,
      };
    }),
  };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function panelsFromJson(
  value: unknown,
): Array<{ title: string; prompt: string }> {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const list = Array.isArray(value)
    ? value
    : record && Array.isArray(record.panels)
      ? record.panels
      : [];
  return list
    .map((item: unknown, index: number) => {
      if (typeof item === "string") {
        return { title: `Panel ${index + 1}`, prompt: item.trim() };
      }
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const prompt = String(
        record.prompt ??
          record.tags ??
          record.tagPrompt ??
          record.enPrompt ??
          "",
      ).trim();
      return {
        title: String(
          record.title ?? record.name ?? `Panel ${index + 1}`,
        ).trim(),
        prompt,
      };
    })
    .filter(
      (
        item: { title: string; prompt: string } | null,
      ): item is { title: string; prompt: string } => Boolean(item?.prompt),
    );
}

export function parseTagComicImport(
  text: string,
  fileName = "",
): Array<{ title: string; prompt: string }> {
  const source = text.replace(/^\uFEFF/, "").trim();
  if (!source) return [];
  const extension = fileName.toLowerCase().split(".").pop();
  if (
    extension === "json" ||
    source.startsWith("[") ||
    source.startsWith("{")
  ) {
    const parsed = JSON.parse(source);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "schemaVersion" in parsed &&
      (parsed as { schemaVersion?: unknown }).schemaVersion !== 2
    ) {
      throw new Error("Old comic projects are not supported");
    }
    return panelsFromJson(parsed);
  }
  if (extension === "csv") {
    const rows = parseCsvRows(source);
    if (!rows.length) return [];
    const headers = rows[0].map((value) => value.trim().toLowerCase());
    const titleIndex = headers.findIndex((value) =>
      [
        "title",
        "name",
        "panel",
        "分镜标题",
        "分鏡標題",
        "标题",
        "標題",
      ].includes(value),
    );
    const promptIndex = headers.findIndex((value) =>
      [
        "prompt",
        "tags",
        "tag",
        "tagprompt",
        "提示词",
        "提示詞",
        "正面提示词",
        "正面提示詞",
      ].includes(value),
    );
    const hasHeader = promptIndex >= 0;
    return rows
      .slice(hasHeader ? 1 : 0)
      .map((row, index) => ({
        title:
          (titleIndex >= 0 ? row[titleIndex] : "")?.trim() ||
          `Panel ${index + 1}`,
        prompt: (
          row[promptIndex >= 0 ? promptIndex : row.length > 1 ? 1 : 0] ?? ""
        ).trim(),
      }))
      .filter((item) => item.prompt);
  }
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((prompt, index) => ({ title: `Panel ${index + 1}`, prompt }));
}

export function mergeTagComicParams(
  project: TagComicProject,
  panel: TagComicPanel,
): GenerateParams {
  const base = { ...project.globalParams, positivePrompt: "" };
  const merged = panel.paramsOverride.enabled
    ? { ...base, ...panel.paramsOverride.params, positivePrompt: "" }
    : base;
  return project.sizeMode === "perPanel" && panel.imageSize
    ? {
        ...merged,
        width: panel.imageSize.width,
        height: panel.imageSize.height,
      }
    : merged;
}

/**
 * Freeze one comic generation at the exact point the user confirms it.
 * Candidates remain attached to the project, while a later regeneration builds
 * a fresh request from the current global and panel-level settings.
 */
export function buildTagComicGenerateRequest(
  project: TagComicProject,
  panel: TagComicPanel,
): TagComicGenerateRequest {
  const params = { ...mergeTagComicParams(project, panel) };
  const preciseReferences = resolveTagComicPanelReferences(project, panel).flatMap(
    (selection) => {
      const asset = project.preciseReferences.find(
        (item) => item.id === selection.referenceId,
      );
      return asset ? [{ ...selection, filePath: asset.filePath }] : [];
    },
  );
  return {
    projectId: project.id,
    projectTitle: project.title,
    historyGroupId: project.historyGroupId,
    panelId: panel.id,
    panelIndex: panel.index,
    params,
    globalStylePrompt: project.globalStylePrompt,
    panelPrompt: panel.prompt,
    globalNegativePrompt: project.globalNegativePrompt,
    preciseReferences,
  };
}

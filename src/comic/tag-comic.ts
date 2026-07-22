import {
  DEFAULT_PARAMS,
  type GenerateParams,
  type TagComicCandidate,
  type TagComicPanel,
  type TagComicProject,
} from "../types";

export const TAG_COMIC_STORAGE_KEY = "langbai.novelai.tag-comic-project.v2";

export function createTagComicProject(
  params: GenerateParams = DEFAULT_PARAMS,
): TagComicProject {
  return {
    schemaVersion: 2,
    id: crypto.randomUUID(),
    title: "Untitled comic",
    globalStylePrompt: params.stylePrompt,
    globalNegativePrompt: params.negativePrompt,
    initialGenerationCount: 1,
    globalParams: { ...params, positivePrompt: "" },
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
    initialGenerationCount: Math.max(
      1,
      Math.min(10, Math.round(Number(source.initialGenerationCount) || 1)),
    ),
    globalParams: {
      ...params,
      ...(source.globalParams ?? {}),
      positivePrompt: "",
    },
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
  return panel.paramsOverride.enabled
    ? { ...base, ...panel.paramsOverride.params, positivePrompt: "" }
    : base;
}

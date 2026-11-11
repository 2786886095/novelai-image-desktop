import { createHash, randomUUID } from "node:crypto";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import type { HistoryGroup, HistoryItem, LoadImageResult } from "../../src/types";

type Json = Record<string, unknown>;
type Image = Pick<HistoryItem, "id" | "filePath" | "groupId" | "date" | "generatedAt" | "generatedAtSource" | "createdAt">;
export type GalleryMove = { id: string; filePath: string; from: string | null; to: string | null };
type Dependencies = {
  images: () => Image[];
  groups: () => HistoryGroup[];
  create: (name: string) => HistoryGroup;
  move: (moves: GalleryMove[]) => boolean;
  decode: (bytes: Uint8Array) => Promise<LoadImageResult["metadata"]>;
  characters: (tags: string[]) => string[];
  refresh: () => void;
  approve: (moves: GalleryMove[], signal: AbortSignal) => Promise<boolean>;
};
type Read = { status: "ok"; tags: Set<string>; characters: string[]; sha: string; characterSource: "local_tag_index" | "prompt_markers" | "mixed" | "unidentified" }
  | { status: "missing_metadata" | "missing_file" | "unsupported_file" | "file_too_large" | "file_changed" };
type Plan = { until: number; moves: GalleryMove[]; hashes: string[] };
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_SCAN = 200;
const UNGROUPED = "__ungrouped";
const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const S = { type: "string" };
const array = (items: Json, maxItems: number) => ({ type: "array", items, minItems: 1, maxItems });
const schema = (properties: Json, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const scope = { date: S, groupId: S, offset: { type: "integer", minimum: 0, maximum: 10_000_000 }, limit: { type: "integer", minimum: 1, maximum: MAX_SCAN } };

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().trim().replace(/[_\s]+/gu, " ");
}

function promptTags(value: string) {
  // Quoted lettering is not a tag, and commas within it must not create tags.
  const safe = value.slice(0, 32_768).replace(/"(?:\\.|[^"\\])*"/g, '""');
  return safe.split(/[,，\n|]/u).slice(0, 512)
    .map(segment => normalize(segment.replace(/[{}\[\]]/gu, "").trim()
      .replace(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)::/u, "").replace(/::\s*$/u, "").trim()))
    .filter(tag => tag.length > 0 && tag.length <= 180 && !/^(?:text|speech|dialogue)\s*:/iu.test(tag));
}
const explicitCharacter = (tag: string) => /^character\s*:/u.test(tag);
const qualifiedCharacter = (tag: string) => /^[\p{L}\p{N}][\p{L}\p{N}' -]*\s*\([\p{L}\p{N}][\p{L}\p{N}' -]+\)$/u.test(tag);

function getPromptProfile(meta: NonNullable<LoadImageResult["metadata"]>, characterLookup: Dependencies["characters"], hints: Set<string>) {
  const base = promptTags(meta.imported.positivePrompt ?? "");
  const captionTags = meta.characterCaptions.filter(c => c.enabled !== false).flatMap(c => promptTags(c.prompt));
  const tags = new Set([...base, ...captionTags]);
  const identity = (tag: string) => tag.replace(/^character\s*:\s*/u, "").replace(/\s+\(/u, "(");
  const known = new Set(characterLookup([...tags]).map(tag => identity(normalize(tag))));
  const characters = new Set<string>();
  let indexed = false, marked = false;
  for (const tag of tags) {
    if (known.has(identity(tag))) {
      indexed = true;
      characters.add(identity(tag));
    } else if (explicitCharacter(tag) || hints.has(tag) || qualifiedCharacter(tag)) {
      marked = true;
      characters.add(tag.replace(/^character\s*:\s*/u, "").replace(/\s+\(/u, "("));
    }
  }
  return { tags, characters: [...characters].sort(),
    characterSource: indexed && marked ? "mixed" as const : indexed ? "local_tag_index" as const : marked ? "prompt_markers" as const : "unidentified" as const };
}

function nonCharacterTags(profile: Extract<Read, { status: "ok" }>, ignored: Set<string>) {
  return new Set([...profile.tags].filter(tag => !ignored.has(tag.replace(/^character\s*:\s*/u, "").replace(/\s+\(/u, "("))
    && !/^\d+\s*(?:girls?|boys?|others?)$|^(?:solo|multiple girls|multiple boys)$/u.test(tag)));
}

function similar(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return { intersection: 0, union: 0, score: 0 };
  const intersection = [...left].filter(tag => right.has(tag)).length;
  const union = left.size + right.size - intersection;
  return { intersection, union, score: intersection / union };
}

function timeOf(row: Image) {
  if (row.generatedAtSource === "local-completion" && row.generatedAt && Number.isFinite(Date.parse(row.generatedAt))) {
    return { time: row.generatedAt, timeSource: "local-completion" };
  }
  if (Number.isFinite(Date.parse(row.createdAt))) return { time: row.createdAt, timeSource: "history-created-at" };
  return { time: null, timeSource: "unknown" };
}

function card(row: Image) {
  return { attachmentId: row.id, name: path.basename(row.filePath), groupId: row.groupId ?? null, ...timeOf(row) };
}

export function createGalleryMcpTools(deps: Dependencies) {
  const plans = new Map<string, Plan>();
  async function read(row: Image, signal: AbortSignal, hints = new Set<string>()): Promise<Read> {
    signal.throwIfAborted();
    if (!path.isAbsolute(row.filePath) || /^[/\\]{2}/u.test(row.filePath)
      || ![".png", ".jpg", ".jpeg", ".webp"].includes(path.extname(row.filePath).toLowerCase())) return { status: "unsupported_file" };
    const entry = await lstat(row.filePath).catch(() => undefined);
    if (!entry) return { status: "missing_file" };
    if (!entry.isFile() || entry.isSymbolicLink()) return { status: "unsupported_file" };
    const handle = await open(row.filePath, "r").catch(() => undefined);
    if (!handle) return { status: "missing_file" };
    try {
      const start = await handle.stat();
      if (!start.isFile() || start.ino !== entry.ino || start.dev !== entry.dev) return { status: "file_changed" };
      if (start.size > MAX_BYTES) return { status: "file_too_large" };
      const buf = Buffer.alloc(start.size);
      for (let pos = 0; pos < buf.length;) {
        signal.throwIfAborted();
        const { bytesRead } = await handle.read(buf, pos, Math.min(1024 * 1024, buf.length - pos), pos);
        if (!bytesRead) return { status: "file_changed" };
        pos += bytesRead;
      }
      const end = await handle.stat();
      if (end.size !== start.size || end.mtimeMs !== start.mtimeMs) return { status: "file_changed" };
      const meta = await deps.decode(buf);
      if (!meta) return { status: "missing_metadata" };
      const parsed = getPromptProfile(meta, deps.characters, hints);
      return parsed.tags.size ? { status: "ok", ...parsed, sha: createHash("sha256").update(buf).digest("hex") } : { status: "missing_metadata" };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof Error && ["ENOENT", "EIO", "EPERM", "EACCES"].includes(String((error as NodeJS.ErrnoException).code))) return { status: "missing_file" };
      throw error;
    } finally { await handle.close(); }
  }

  function page(args: Json, rows: Image[]) {
    const date = args.date as string | undefined, group = args.groupId as string | undefined;
    if (date && !/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error("Use YYYY-MM-DD for date.");
    if (group && group !== UNGROUPED && !deps.groups().some(g => g.id === group)) throw new Error("Unknown source group.");
    const filtered = rows.filter(r => (!date || r.date === date) && (!group || (group === UNGROUPED ? !r.groupId : r.groupId === group)));
    const offset = (args.offset as number | undefined) ?? 0;
    const limit = (args.limit as number | undefined) ?? 100;
    const items = filtered.slice(offset, offset + limit);
    return { items, scanned: items.length, total: filtered.length, nextOffset: offset + items.length < filtered.length ? offset + items.length : null };
  }

  function movesTo(ids: string[], destination: string, rows: Image[]) {
    const to = destination === UNGROUPED ? null : destination;
    if (to !== null && !deps.groups().some(g => g.id === to)) throw new Error("Unknown destination group. Use list_history or create_history_group.");
    const byId = new Map(rows.map(row => [row.id, row]));
    return [...new Set(ids)].map(id => {
      const row = byId.get(id);
      if (!row) throw new Error("One or more history IDs no longer exist. No pictures moved.");
      return { id, filePath: row.filePath, from: row.groupId ?? null, to };
    }).filter(move => move.from !== move.to);
  }

  function commit(moves: GalleryMove[], signal: AbortSignal) {
    signal.throwIfAborted();
    if (moves.length) {
      if (!deps.move(moves)) throw new Error("The history or its groups changed. No pictures moved; run a fresh preview.");
      deps.refresh();
    }
    return { moved: moves.length, changes: moves.map(({ id, from, to }) => ({ attachmentId: id, from, to })) };
  }

  const tools = [
    {
      name: "create_history_group", title: "Create history group",
      description: "Create or reuse a local Studio history group by name. Does not move or modify any image files.",
      inputSchema: schema({ name: S }, ["name"]), annotations: WRITE,
      run: async (args: Json, signal: AbortSignal) => {
        const name = (args.name as string).trim().replace(/\s+/gu, " ");
        if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) throw new Error("Group name must contain 1–80 characters.");
        signal.throwIfAborted();
        const existing = deps.groups().find(group => group.name.toLowerCase() === name.toLowerCase());
        const group = existing ?? deps.create(name);
        if (!existing) deps.refresh();
        return { created: !existing, group };
      },
    },
    {
      name: "move_history_images", title: "Move history images to a group",
      description: "Move only the named history records after the user asks to move them. Use IDs from list_history, not paths. Changes gallery membership, not files.",
      inputSchema: schema({ attachmentIds: array(S, MAX_SCAN), groupId: S }, ["attachmentIds", "groupId"]), annotations: WRITE,
      run: async (args: Json, signal: AbortSignal) => commit(movesTo(args.attachmentIds as string[], args.groupId as string, deps.images()), signal),
    },
    {
      name: "preview_history_tag_classification", title: "Preview history classification by embedded tags",
      description: "Read embedded positive prompt and character prompt tags from local history image bytes. Each rule requires all of its exact tags. Multiple distinct destinations are skipped as ambiguous. Show the preview before applying it; Studio will also require local confirmation.",
      inputSchema: schema({ ...scope, rules: array(schema({ allTags: array(S, 24), targetGroupId: S }, ["allTags", "targetGroupId"]), 30) }, ["rules"]), annotations: READ,
      run: async (args: Json, signal: AbortSignal) => {
        const groupIds = new Set(deps.groups().map(group => group.id));
        const rules = (args.rules as { allTags: string[]; targetGroupId: string }[]).map(rule => {
          const tags = rule.allTags.map(normalize);
          if (tags.some(tag => !tag || tag.length > 180) || !groupIds.has(rule.targetGroupId)) throw new Error("Each rule needs nonempty tags and an existing destination group.");
          return { tags, groupId: rule.targetGroupId };
        });
        const { items, ...paging } = page(args, deps.images());
        const moves: GalleryMove[] = [], hashes: string[] = [];
        const results = [];
        for (const row of items) {
          const image = await read(row, signal);
          if (image.status !== "ok") { results.push({ ...card(row), status: image.status }); continue; }
          const matching = rules.filter(rule => rule.tags.every(tag => image.tags.has(tag)));
          const targets = [...new Set(matching.map(rule => rule.groupId))];
          if (targets.length !== 1) { results.push({ ...card(row), status: targets.length ? "ambiguous" : "no_match", targets }); continue; }
          const to = targets[0];
          const matchedTags = [...new Set(matching.flatMap(rule => rule.tags))];
          if (row.groupId === to) { results.push({ ...card(row), status: "already_grouped", targetGroupId: to, matchedTags }); continue; }
          results.push({ ...card(row), status: "proposed", targetGroupId: to, matchedTags });
          moves.push({ id: row.id, filePath: row.filePath, from: row.groupId ?? null, to });
          hashes.push(image.sha);
        }
        let planId: string | null = null;
        if (moves.length) {
          signal.throwIfAborted();
          const now = Date.now();
          for (const [key, plan] of plans) if (plan.until <= now) plans.delete(key);
          if (plans.size >= 12) plans.delete(plans.keys().next().value!);
          planId = randomUUID();
          plans.set(planId, { until: now + 5 * 60_000, moves, hashes });
        }
        return { ...paging, planId, expiresInSeconds: planId ? 300 : null, proposed: moves.length, results };
      },
    },
    {
      name: "apply_history_tag_classification", title: "Apply reviewed history tag classification",
      description: "Apply a one-time preview plan after the user also confirms inside Studio. Changed files, images or destination groups reject the entire plan. No image files are modified.",
      inputSchema: schema({ planId: S, confirmed: { type: "boolean", enum: [true] } }, ["planId", "confirmed"]), annotations: { ...WRITE, idempotentHint: false },
      run: async (args: Json, signal: AbortSignal) => {
        if (args.confirmed !== true) throw new Error("User confirmation required.");
        const id = args.planId as string;
        const plan = plans.get(id);
        if (!plan || plan.until <= Date.now()) { plans.delete(id); throw new Error("Preview expired or already applied. Run a new preview."); }
        plans.delete(id);
        if (!await deps.approve(plan.moves, signal)) throw new Error("Classification canceled. No pictures moved.");
        signal.throwIfAborted();
        for (const [i, move] of plan.moves.entries()) {
          const row = { id: move.id, filePath: move.filePath, date: "", createdAt: "" };
          const image = await read(row, signal);
          if (image.status !== "ok" || image.sha !== plan.hashes[i]) throw new Error("A source image changed. No pictures moved; run a fresh preview.");
        }
        if (plan.until <= Date.now()) throw new Error("Preview expired during validation. No pictures moved.");
        return commit(plan.moves, signal);
      },
    },
    {
      name: "trace_history_iterations", title: "Find inferred image iterations",
      description: "Find local history images whose embedded positive prompt tag Jaccard similarity to an anchor is at least 50%, after excluding recognized character identities and person-count tags. Sort by generation time and separate changed character sets into related lines. This is inference, not proven ancestry.",
      inputSchema: schema({ ...scope, attachmentId: S, characterTags: array(S, 64) }, ["attachmentId"]), annotations: READ,
      run: async (args: Json, signal: AbortSignal) => {
        const rows = deps.images();
        const anchor = rows.find(row => row.id === args.attachmentId);
        if (!anchor) throw new Error("Unknown anchor history ID. Use list_history.");
        const hints = new Set(((args.characterTags as string[] | undefined) ?? []).map(normalize).filter(Boolean));
        const base = await read(anchor, signal, hints);
        if (base.status !== "ok") return { status: base.status, anchor: card(anchor), lines: [], inference: true };
        const { items, ...paging } = page(args, rows);
        const anchorKey = JSON.stringify(base.characters);
        const output = (row: Image, image: typeof base, score: number) => ({ ...card(row), similarity: score, characters: image.characters, characterSource: image.characterSource });
        const groups = new Map<string, ReturnType<typeof output>[]>([[anchorKey, [output(anchor, base, 1)]]]);
        const skipped = [];
        for (const row of items) {
          if (row.id === anchor.id) continue;
          const image = await read(row, signal, hints);
          if (image.status !== "ok") { skipped.push({ attachmentId: row.id, status: image.status }); continue; }
          const excluded = new Set([...base.characters, ...image.characters].map(tag => tag.replace(/\s+\(/u, "(")));
          const { intersection, union, score } = similar(nonCharacterTags(base, excluded), nonCharacterTags(image, excluded));
          if (!union || intersection * 2 < union) continue;
          const key = JSON.stringify(image.characters);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(output(row, image, score));
        }
        const lines = [...groups].map(([key, images]) => ({
          relation: key === anchorKey ? (base.characters.length ? "anchor_characters" : "anchor_character_unidentified")
            : !images[0].characters.length || !base.characters.length ? "related_character_unidentified" : "related_character_changed",
          characters: images[0].characters,
          images: images.sort((a, b) => (a.time ? Date.parse(a.time) : Infinity) - (b.time ? Date.parse(b.time) : Infinity) || a.attachmentId.localeCompare(b.attachmentId)),
        }));
        return { ...paging, anchor: card(anchor), similarityMethod: "jaccard_positive_prompt_tags_excluding_recognized_characters", minimumSimilarity: 0.5, inference: true, lines, skipped };
      },
    },
  ];
  return tools;
}

export type GalleryMcpTool = ReturnType<typeof createGalleryMcpTools>[number];

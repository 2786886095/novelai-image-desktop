import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS } from "../types";
import {
  MAX_COMPARISON_ENTRIES,
  MAX_EXPLORATION_RECIPES,
  classifyEntry,
  sampleComparisonInterval,
  indexEntryJobs,
  createProject,
  createRun,
  exploreEntries,
  getEntryCover,
  getEntryJobs,
  getLegacyRatingLevels,
  normalizeProject,
  parseEntries,
  renameRating,
  replaceRating,
  syncRatingScheme,
  validateProject,
} from "./model";
import type { ComparisonEntry, ComparisonProject, PoolRule } from "./model";

const ratings = [
  { id: "high", label: "High", color: "#f00" },
  { id: "low", label: "Low", color: "#00f" },
];

function withPool(entry: ComparisonEntry, ratingId: string): ComparisonEntry {
  return { ...entry, ratingId, inPool: true };
}

function projectWithEntries(entries: ComparisonEntry[]): ComparisonProject {
  const project = createProject("comparison", ratings);
  project.entries = entries;
  return project;
}

describe("artist comparison model", () => {
  it("keeps artist and combination libraries independent beyond the old shared quota", () => {
    const artists = parseEntries(Array.from({ length: 6000 }, (_, i) => `artist:large_${i}`).join("\n"));
    const recipes = parseEntries(Array.from({ length: 6000 }, (_, i) => `artist:large_${i}, artist:other`).join("\n"));
    const project = projectWithEntries([...artists, ...recipes]);
    project.entries[0].ratingId = "high";
    const restored = validateProject(project);
    expect(restored.entries.filter((entry) => entry.kind === "single")).toHaveLength(6000);
    expect(restored.entries.filter((entry) => entry.kind === "recipe")).toHaveLength(6000);
    expect(exploreEntries(restored.entries, [{ ratingId: "high", count: 1, minWeight: 0.5, maxWeight: 1 }], 1, 42)).toHaveLength(1);
  });

  it("retains more than 50 generation records and indexes their history", () => {
    const project = projectWithEntries(parseEntries("artist:alpha"));
    project.runs = Array.from({ length: 60 }, () => createRun(project, DEFAULT_PARAMS, "", "", [1]));
    const restored = validateProject(project);
    expect(restored.runs).toHaveLength(60);
    expect(indexEntryJobs(restored).get(project.entries[0].id)).toHaveLength(60);
  });

  it("samples inclusive tenth-second intervals and preserves them through validation", () => {
    const project = projectWithEntries([]);
    project.intervalSeconds = 30;
    project.intervalMaxSeconds = 60;
    expect(sampleComparisonInterval(project, () => 0)).toBe(30);
    expect(sampleComparisonInterval(project, () => 0.999999)).toBe(60);
    expect(sampleComparisonInterval(project, () => 88 / 301)).toBe(38.8);
    expect(validateProject(project).intervalMaxSeconds).toBe(60);
    expect(normalizeProject(project).intervalMaxSeconds).toBe(60);
    expect(() => validateProject({ ...project, intervalMaxSeconds: 29 })).toThrow();
    expect(() => validateProject({ ...project, intervalMaxSeconds: 60.01 })).toThrow();
    expect(sampleComparisonInterval({ intervalSeconds: 5 }, () => 0.7)).toBe(5);
  });

  it("uses one entry per non-empty line and preserves comma recipes", () => {
    const entries = parseEntries([
      "artist:anmi",
      "0.7::artist:anmi::, 0.4::artist:rella::",
      "",
      "  artist:kantoku  ",
    ].join("\n"));

    expect(entries).toHaveLength(3);
    expect(entries[0].kind).toBe("single");
    expect(entries[1].kind).toBe("recipe");
    expect(entries[1].prompt).toBe("0.7::artist:anmi::, 0.4::artist:rella::");
    expect(entries[2].prompt).toBe("artist:kantoku");
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(3);
  });

  it("supports header and headerless TSV with quoted cells", () => {
    const withHeader = parseEntries(
      'note\tprompt\tname\n"has a tab\tand ""quote"""\t"artist:anmi, artist:rella"\t"A, B"',
    );
    const withoutHeader = parseEntries("A\tartist:anmi, artist:rella\tkeep comma, here");

    expect(withHeader[0]).toMatchObject({
      name: "A, B",
      prompt: "artist:anmi, artist:rella",
      note: 'has a tab\tand "quote"',
      kind: "recipe",
    });
    expect(withoutHeader[0]).toMatchObject({
      name: "A",
      prompt: "artist:anmi, artist:rella",
      note: "keep comma, here",
    });
  });

  it("accepts a 4000-row workbook through run creation and rejects job overflow", () => {
    const text = Array.from({ length: 4_000 }, (_, index) => `artist:excel_${index}`).join("\n");
    const entries = parseEntries(text);
    expect(entries).toHaveLength(4_000);

    const project = projectWithEntries(entries);
    const run = createRun(project, DEFAULT_PARAMS, "", "", [123]);
    expect(run.entries).toHaveLength(4_000);
    expect(run.jobs).toHaveLength(4_000);
    expect(run.jobs[0].entryId).toBe(entries[0].id);
    expect(run.jobs.at(-1)?.entryId).toBe(entries.at(-1)?.id);

    const restored = validateProject({ ...project, runs: [run] });
    expect(restored.entries).toHaveLength(4_000);
    expect(restored.runs[0].jobs).toHaveLength(4_000);

    expect(() => createRun(project, DEFAULT_PARAMS, "", "", [1, 2]))
      .toThrow(/5000|too many jobs/);
    const overflowText = Array.from(
      { length: MAX_COMPARISON_ENTRIES + 1 },
      (_, index) => `artist:overflow_${index}`,
    ).join("\n");
    expect(parseEntries(overflowText)).toHaveLength(5001);
    expect(validateProject(projectWithEntries(parseEntries(overflowText))).entries).toHaveLength(5001);
  });

  it("classifies imported artists by comma separators, preserving name punctuation", () => {
    expect(classifyEntry("artist:anmi")).toBe("single");
    expect(classifyEntry("torino_aqua")).toBe("single");
    expect(classifyEntry("artist:anmi, artist:rella")).toBe("recipe");
    expect(classifyEntry("1::artist:anmi::")).toBe("single");
    expect(classifyEntry("artist:anmi artist:rella")).toBe("single");
    expect(classifyEntry(String.raw`nanata \(769\)`)).toBe("single");
    expect(classifyEntry(String.raw`ham melon \(iloha 24\)`)).toBe("single");
    expect(classifyEntry("name;with[punctuation]")).toBe("single");
    expect(classifyEntry("anmi，rella")).toBe("recipe");
  });

  it("repairs legacy punctuation classifications in library and runs without losing results", () => {
    const entry = withPool(parseEntries(String.raw`nanata \(769\)`)[0], "high");
    entry.kind = "recipe";
    entry.inPool = false;
    entry.note = "keep note";
    const project = projectWithEntries([entry]);
    project.runs = [createRun(project, DEFAULT_PARAMS, "", "", [1])];
    const restored = validateProject(project);
    expect(restored.entries[0]).toEqual({ ...entry, kind: "single", inPool: true });
    expect(restored.runs[0].entries[0].kind).toBe("single");
    expect(restored.runs[0].jobs).toEqual(project.runs[0].jobs);
    expect(validateProject(restored)).toEqual(restored);
  });

  it("derives pool membership from rating and never admits recipes or unrated entries", () => {
    const rated = parseEntries("artist:anmi")[0];
    rated.ratingId = "high";
    rated.inPool = false;
    const unrated = parseEntries("artist:rella")[0];
    unrated.inPool = true;
    const recipe = parseEntries("artist:anmi, artist:rella")[0];
    recipe.ratingId = "high";
    recipe.inPool = true;
    const project = projectWithEntries([rated, unrated, recipe]);
    const normalized = validateProject(project);

    expect(normalized.entries.map((entry) => entry.inPool)).toEqual([true, false, false]);
    const explored = exploreEntries(
      [rated, unrated, recipe],
      [{ ratingId: "high", count: 1, minWeight: 1, maxWeight: 1 }],
      1,
      17,
    );
    expect(explored[0].origin?.entryIds).toEqual([rated.id]);
  });

  it("normalizes shared tags and freezes selections into run snapshots", () => {
    const project = projectWithEntries(parseEntries("artist:anmi"));
    project.tags = [
      { id: "favorite", label: "Favorite" },
      { id: "batch", label: "Batch" },
    ];
    project.entries[0].tagIds = ["favorite", "batch"];
    const run = createRun(project, DEFAULT_PARAMS, "", "", [1]);

    expect(run.entries[0].tagIds).toEqual(["favorite", "batch"]);
    project.entries[0].tagIds = ["batch"];
    expect(run.entries[0].tagIds).toEqual(["favorite", "batch"]);
    const restored = validateProject({ ...project, runs: [run] });
    expect(restored.tags).toEqual(project.tags);
    expect(restored.runs[0].entries[0].tagIds).toEqual(["favorite", "batch"]);
    expect(() => validateProject({
      ...project,
      entries: [{ ...project.entries[0], tagIds: ["missing"] }],
    })).toThrow(/unknown tag/);
    expect(() => validateProject({
      ...project,
      tags: [{ id: "one", label: "Same" }, { id: "two", label: "same" }],
    })).toThrow(/duplicate labels/);
  });

  it("updates derived pool state when a rating is replaced or cleared", () => {
    const entry = parseEntries("artist:anmi")[0];
    entry.ratingId = "high";
    entry.inPool = true;
    const project = projectWithEntries([entry]);

    const mapped = replaceRating(project, "high", "low");
    expect(mapped.entries[0]).toMatchObject({ ratingId: "low", inPool: true });
    const cleared = replaceRating(project, "high", null);
    expect(cleared.entries[0]).toMatchObject({ ratingId: null, inPool: false });
  });

  it("samples rated single entries only, with bounded weights and provenance", () => {
    const source = parseEntries("artist:anmi\nartist:rella\nartist:kantoku\nartist:ask");
    const entries = [
      withPool(source[0], "high"),
      withPool(source[1], "high"),
      withPool(source[2], "low"),
      withPool(source[3], "low"),
      withPool(parseEntries("artist:anmi, artist:rella")[0], "high"),
    ];
    const rules: PoolRule[] = [
      { ratingId: "high", count: 1, minWeight: 0.7, maxWeight: 0.9 },
      { ratingId: "low", count: 1, minWeight: 1.1, maxWeight: 1.3 },
    ];
    const recipes = exploreEntries(entries, rules, 20, 12345);
    const sourceIds = new Set(entries.slice(0, 4).map((entry) => entry.id));
    const weightPattern = /^(\d+(?:\.\d+)?|\.\d+)::artist:[^,]+::/;

    expect(recipes).toHaveLength(20);
    expect(recipes.every((entry) => entry.kind === "recipe" && entry.inPool === false)).toBe(true);
    expect(recipes.every((entry) => entry.ratingId === null)).toBe(true);
    for (const recipe of recipes) {
      expect(recipe.origin?.entryIds).toHaveLength(2);
      expect(recipe.origin?.entryIds.every((id) => sourceIds.has(id))).toBe(true);
      expect(new Set(recipe.origin?.entryIds).size).toBe(2);
      const weights = recipe.prompt.split(", ").map((part) => Number(part.match(weightPattern)?.[1]));
      expect(weights[0]).toBeGreaterThanOrEqual(0.7);
      expect(weights[0]).toBeLessThanOrEqual(0.9);
      expect(weights[1]).toBeGreaterThanOrEqual(1.1);
      expect(weights[1]).toBeLessThanOrEqual(1.3);
    }
    expect(recipes.map((entry) => entry.prompt)).toEqual(
      exploreEntries(entries, rules, 20, 12345).map((entry) => entry.prompt),
    );
  });

  it("rejects recipes or insufficient unique pools, including tampered inPool flags", () => {
    const recipe = withPool(parseEntries("artist:anmi, artist:rella")[0], "high");
    expect(() => exploreEntries([recipe], [{ ratingId: "high", count: 1, minWeight: 1, maxWeight: 1 }], 1, 1))
      .toThrow(/insufficient|unique/);

    const duplicateA = withPool(parseEntries("artist:anmi")[0], "high");
    const duplicateB = withPool(parseEntries("artist:ANMI")[0], "high");
    expect(() => exploreEntries(
      [duplicateA, duplicateB],
      [{ ratingId: "high", count: 2, minWeight: 1, maxWeight: 1 }],
      1,
      1,
    )).toThrow(/insufficient|unique/);
  });

  it("keeps rating IDs stable through rename and requires explicit deletion mapping", () => {
    const entry = withPool(parseEntries("artist:anmi")[0], "high");
    const project = projectWithEntries([entry]);
    project.runs = [createRun(project, DEFAULT_PARAMS, "", "", [1])];
    const renamed = renameRating(project, "high", "Preferred", "#abc");
    expect(renamed.ratings[0]).toEqual({ id: "high", label: "Preferred", color: "#abc" });
    expect(renamed.entries[0].ratingId).toBe("high");
    expect(renamed.runs[0].ratings[0]).toEqual({ id: "high", label: "Preferred", color: "#abc" });
    expect(renamed.runs[0].entries[0].ratingId).toBe("high");
    expect(() => (replaceRating as unknown as (...args: unknown[]) => ComparisonProject)(project, "high"))
      .toThrow(/explicit target/);

    const mapped = replaceRating(project, "high", "low");
    expect(mapped.ratings.map((rating) => rating.id)).toEqual(["low"]);
    expect(mapped.entries[0].ratingId).toBe("low");
    const cleared = replaceRating(project, "high", null);
    expect(cleared.entries[0].ratingId).toBeNull();
    expect(project.entries[0].ratingId).toBe("high");
  });

  it("syncs multiple run schemas by stable IDs and requires explicit orphan mappings", () => {
    const project = projectWithEntries(parseEntries("artist:anmi\nartist:rella"));
    project.entries[0].ratingId = "high";
    project.entries[1].ratingId = "low";
    const first = createRun(project, DEFAULT_PARAMS, "", "", [1]);
    const second = createRun(project, DEFAULT_PARAMS, "", "", [2]);
    const legacy = [
      { id: "legacy-a", label: "Preferred", color: "#0f0" },
      { id: "legacy-unused", label: "Unused", color: "#999" },
    ];
    first.ratings = legacy.map((rating) => ({ ...rating }));
    second.ratings = legacy.map((rating) => ({ ...rating }));
    first.entries[0].ratingId = "legacy-a";
    second.entries[0].ratingId = "legacy-a";
    project.runs = [first, second];

    expect(getLegacyRatingLevels(project)).toEqual([legacy[0]]);
    expect(() => syncRatingScheme(project)).toThrow(/mapping required/);
    const synced = syncRatingScheme(project, project.ratings, { "legacy-a": "high" });
    expect(synced.ratings).toEqual(project.ratings);
    expect(synced.runs.every((run) => run.ratings.length === project.ratings.length)).toBe(true);
    expect(synced.runs[0].ratings).toEqual(project.ratings);
    expect(synced.runs[1].ratings).toEqual(project.ratings);
    expect(synced.runs[0].entries[0].ratingId).toBe("high");
    expect(synced.runs[1].entries[0].ratingId).toBe("high");
    expect(synced.runs[0].entries[1].ratingId).toBe("low");
  });

  it("does not guess a same-label different-ID mapping and clears pool membership explicitly", () => {
    const project = projectWithEntries([withPool(parseEntries("artist:anmi")[0], "high")]);
    const run = createRun(project, DEFAULT_PARAMS, "", "", [1]);
    run.ratings = [{ id: "legacy", label: project.ratings[0].label, color: project.ratings[0].color }];
    run.entries[0].ratingId = "legacy";
    project.runs = [run];
    expect(() => syncRatingScheme(project)).toThrow(/mapping required/);

    const clearProject = projectWithEntries([withPool(parseEntries("artist:anmi")[0], "high")]);
    clearProject.runs = [createRun(clearProject, DEFAULT_PARAMS, "", "", [1])];
    const cleared = replaceRating(clearProject, "high", null);
    expect(cleared.entries[0]).toMatchObject({ ratingId: null, inPool: false });
    expect(cleared.runs[0].entries[0]).toMatchObject({ ratingId: null, inPool: false });
    expect(cleared.runs[0].ratings.some((rating) => rating.id === "high")).toBe(false);
    expect(cleared.runs[0].ratings.some((rating) => rating.id === "legacy")).toBe(false);
  });

  it("freezes run snapshots and repeats exactly the same seeds for every entry", () => {
    const project = projectWithEntries(parseEntries("artist:anmi\nartist:rella"));
    project.entries[0].coverJobId = null;
    const params = { ...DEFAULT_PARAMS, positivePrompt: "original" };
    const run = createRun(project, params, "shared positive", "shared negative", [101, 202]);

    project.entries[0].name = "changed after run";
    project.entries[0].prompt = "artist:changed";
    params.positivePrompt = "mutated after run";
    expect(run.entries[0].name).not.toBe("changed after run");
    expect(run.entries[0].prompt).toBe("artist:anmi");
    expect(run.params.positivePrompt).toBe("original");
    expect(run.entries).toHaveLength(2);
    expect(run.jobs.map((job) => job.seed)).toEqual([101, 202, 101, 202]);
    expect(run.jobs.every((job) => job.status === "pending")).toBe(true);
    expect(run.ratings).toEqual(project.ratings);
    expect(run.entries[0].coverJobId).toBeUndefined();
  });

  it("scopes cover lookup to the project and matching prompt", () => {
    const project = projectWithEntries(parseEntries("artist:anmi"));
    const first = createRun(project, DEFAULT_PARAMS, "", "", [11, 12]);
    const second = createRun(project, DEFAULT_PARAMS, "", "", [21, 22]);
    first.jobs[0].status = "done";
    first.jobs[0].image = { id: "first", filePath: "/first.png", fileUrl: "" };
    second.jobs[1].status = "done";
    second.jobs[1].image = { id: "second", filePath: "/second.png", fileUrl: "" };
    const staleProject = {
      ...project,
      entries: project.entries.map((entry) => ({ ...entry, prompt: "artist:stale" })),
    };
    const stale = createRun(staleProject, DEFAULT_PARAMS, "", "", [31]);
    project.runs = [first, second, stale];

    expect(getEntryJobs(project, project.entries[0].id).map((job) => job.seed)).toEqual([
      21,
      22,
      11,
      12,
    ]);
    expect(getEntryCover(project, project.entries[0])?.id).toBe(second.jobs[1].id);

    project.entries[0].coverJobId = first.jobs[0].id;
    expect(getEntryCover(project, project.entries[0])?.id).toBe(first.jobs[0].id);
    project.entries[0].coverJobId = null;
    expect(getEntryCover(project, project.entries[0])).toBeUndefined();

    const otherEntry = { ...parseEntries("artist:other")[0], id: project.entries[0].id };
    const other = projectWithEntries([otherEntry]);
    const otherRun = createRun(other, DEFAULT_PARAMS, "", "", [99]);
    otherRun.jobs[0].status = "done";
    otherRun.jobs[0].image = { id: "other", filePath: "/other.png", fileUrl: "" };
    other.runs = [otherRun];
    expect(getEntryCover(other, other.entries[0])?.id).toBe(otherRun.jobs[0].id);
    expect(getEntryJobs(project, project.entries[0].id).every((job) => job.seed !== 99)).toBe(true);
  });

  it("does not retain PNG metadata replay in comparison snapshots", () => {
    const project = projectWithEntries(parseEntries("artist:anmi"));
    const params = {
      ...DEFAULT_PARAMS,
      metadataReplay: {
        model: "nai-diffusion-5-full",
        parameters: { straight_alpha: true, source_comment: "should not persist" },
      },
    };
    const run = createRun(project, params, "", "", [1]);

    expect(run.params).not.toHaveProperty("metadataReplay");
    const restored = validateProject({ ...project, runs: [run] });
    expect(restored.runs[0].params).not.toHaveProperty("metadataReplay");
  });

  it("rejects empty runs and preserves exploration origin through validation", () => {
    const empty = createProject("empty", ratings);
    expect(() => createRun(empty, DEFAULT_PARAMS, "", "", [1])).toThrow(/at least one/);

    const source = withPool(parseEntries("artist:anmi")[0], "high");
    const explored = exploreEntries(
      [source],
      [{ ratingId: "high", count: 1, minWeight: 1, maxWeight: 1 }],
      1,
      9,
    )[0];
    const normalized = validateProject({
      ...projectWithEntries([source, explored]),
      entries: [source, explored],
    });
    expect(normalized.entries[1].origin).toEqual(explored.origin);
    expect(normalized.entries[1].inPool).toBe(false);
  });

  it("reconstructs bounded projects and strips unknown imported fields", () => {
    const project = projectWithEntries(parseEntries("artist:anmi"));
    const raw = {
      ...project,
      extra: "discard me",
      entries: [{ ...project.entries[0], extra: "discard me" }],
    };
    const normalized = validateProject(raw);
    expect(normalized).toEqual(project);
    expect("extra" in normalized).toBe(false);
    expect("extra" in normalized.entries[0]).toBe(false);
    expect(normalizeProject(raw)).toEqual(normalized);
    expect(() => validateProject({ ...raw, entries: Array.from({ length: 501 }, () => raw.entries[0]) }))
      .toThrow(/too large|duplicate/);
    expect(() => validateProject({ ...raw, entries: [{ ...raw.entries[0], ratingId: "missing" }] }))
      .toThrow(/unknown rating/);
  });

  it("validates current cover references against completed matching images", () => {
    const project = projectWithEntries(parseEntries("artist:anmi"));
    const run = createRun(project, DEFAULT_PARAMS, "", "", [1]);
    run.jobs[0].status = "done";
    run.jobs[0].image = { id: "image", filePath: "/image.png", fileUrl: "" };
    project.runs = [run];
    project.entries[0].coverJobId = run.jobs[0].id;
    run.entries[0].coverJobId = "old-run-job";
    expect(validateProject(project).entries[0].coverJobId).toBe(run.jobs[0].id);
    expect(validateProject(project).runs[0].entries[0].coverJobId).toBe("old-run-job");

    const foreign = parseEntries("artist:other")[0];
    foreign.coverJobId = run.jobs[0].id;
    expect(() => validateProject({ ...project, entries: [project.entries[0], foreign] }))
      .toThrow(/coverJobId/);
    expect(() => validateProject({
      ...project,
      entries: [{ ...project.entries[0], coverJobId: "missing" }],
    })).toThrow(/coverJobId/);
  });

  it("rejects more than the bounded recipe count", () => {
    const entry = withPool(parseEntries("artist:anmi")[0], "high");
    expect(() => exploreEntries(
      [entry],
      [{ ratingId: "high", count: 1, minWeight: 1, maxWeight: 1 }],
      MAX_EXPLORATION_RECIPES + 1,
      42,
    )).toThrow(/recipe count/);
  });

  it("rejects duplicate job IDs across run snapshots", () => {
    const project = projectWithEntries(parseEntries("artist:anmi"));
    const first = createRun(project, DEFAULT_PARAMS, "", "", [1]);
    const second = createRun(project, DEFAULT_PARAMS, "", "", [2]);
    second.jobs[0].id = first.jobs[0].id;
    project.runs = [first, second];
    expect(() => validateProject(project)).toThrow(/duplicate job IDs/);
  });
});

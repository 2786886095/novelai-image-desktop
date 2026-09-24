import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PARAMS } from "../../src/types";
import {
  MAX_COMPARISON_ENTRIES,
  createProject,
  createRun,
  parseEntries,
  type ComparisonJob,
  type ComparisonProject,
} from "../../src/artist-comparison/model";
import { ComparisonService, type ComparisonDependencies } from "./service";

function fixture(): ComparisonProject {
  const project = createProject();
  project.intervalSeconds = 0;
  project.entries = parseEntries("artist:alpha\nartist:beta");
  project.entries[0].ratingId = project.ratings[0].id;
  project.entries[0].inPool = true;
  project.runs.push(createRun(project, DEFAULT_PARAMS, "1girl", "bad quality", [42]));
  return project;
}

function imageFor(job: ComparisonJob) {
  return {
    id: job.id,
    filePath: `/test/${job.id}.png`,
    fileUrl: "test:",
  };
}

function complete(job: ComparisonJob) {
  job.status = "done";
  job.image = imageFor(job);
}

function setup(
  project: ComparisonProject,
  overrides: Partial<ComparisonDependencies> = {},
) {
  let disk = [structuredClone(project)];
  let generationCalls = 0;
  const dependencies: ComparisonDependencies = {
    read: () => structuredClone(disk),
    write: (projects) => {
      disk = structuredClone(projects);
    },
    quote: async () => 0,
    generate: async (_project, _run, job) => {
      generationCalls += 1;
      return { image: imageFor(job), actualAnlas: 0 };
    },
    recover: () => undefined,
    acquire: () => () => undefined,
    exportProject: async () => "",
    importProject: async () => null,
    ...overrides,
  };
  return {
    service: new ComparisonService(dependencies),
    disk: () => disk,
    generationCalls: () => generationCalls,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("main-process comparison queue", () => {
  it("exports an isolated Excel snapshot without changing saved assets or queue progress", async () => {
    const project = fixture();
    complete(project.runs[0].jobs[0]);
    project.entries[0].coverJobId = project.runs[0].jobs[0].id;
    const before = structuredClone(project);
    const exporter = vi.fn(async (snapshot: ComparisonProject, format: string) => {
      expect(format).toBe("xlsx");
      expect(snapshot).toEqual(before);
      snapshot.entries.length = 0;
      snapshot.runs[0].jobs.length = 0;
      return "Excel exported";
    });
    const { service, disk, generationCalls } = setup(project, { exportProject: exporter });
    const response = await service.dispatch({ type: "export", projectId: project.id, format: "xlsx" });
    expect(response.ok).toBe(true);
    expect(exporter).toHaveBeenCalledOnce();
    expect(disk()[0]).toEqual(before);
    expect(response.state.projects[0].runs[0].jobs).toEqual(before.runs[0].jobs);
    expect(generationCalls()).toBe(0);
  });

  it("skips a legacy queued duplicate only after the same artist and seed succeeded", async () => {
    const project = createProject(); project.intervalSeconds = 0;
    project.entries = parseEntries("artist:alpha\nARTIST:ALPHA");
    project.runs = [createRun(project, DEFAULT_PARAMS, "", "", [1])];
    const { service, generationCalls } = setup(project);
    await service.dispatch({ type: "start", projectId: project.id, runId: project.runs[0].id, approvedAnlas: 0 });
    await service.idle();
    expect(generationCalls()).toBe(1);
    expect(service.snapshot().projects[0].entries).toHaveLength(2);
    expect(service.snapshot().projects[0].runs[0].jobs.map((job) => job.status)).toEqual(["done", "skipped"]);
  });

  it("prepends new batches and resumes an old partial task after generating only new artists", async () => {
    const project = fixture();
    const oldRun = project.runs[0];
    oldRun.jobs[0].status = "done";
    oldRun.jobs[0].image = imageFor(oldRun.jobs[0]);
    const { service, disk, generationCalls } = setup(project);
    const first = await service.dispatch({ type: "addEntries", projectId: project.id, text: "new_a\nnew_b" });
    expect(first.state.projects[0].entries.slice(0, 2).map(e => e.prompt)).toEqual(["new_a", "new_b"]);
    const second = await service.dispatch({ type: "addEntries", projectId: project.id, text: "new_c\nnew_a" });
    expect(second.state.projects[0].entries.slice(0, 3).map(e => e.prompt)).toEqual(["new_c", "new_a", "new_b"]);
    const created = await service.dispatch({ type: "createRun", projectId: project.id, entryIds: second.addedEntryIds, params: DEFAULT_PARAMS, positive: "new conditions", negative: "", seeds: [999] });
    const newRun = created.state.projects[0].runs.at(-1)!;
    await service.dispatch({ type: "start", projectId: project.id, runId: newRun.id, approvedAnlas: 0 });
    await service.idle();
    expect(generationCalls()).toBe(1);
    expect(disk()[0].runs[0].jobs).toEqual(oldRun.jobs);
    // Reopen persisted state before continuing the original queue.
    const reopened = setup(disk()[0]);
    await reopened.service.dispatch({ type: "start", projectId: project.id, runId: oldRun.id, approvedAnlas: 0 });
    await reopened.service.idle();
    expect(reopened.generationCalls()).toBe(1);
    const resumed = reopened.disk()[0].runs[0];
    expect(resumed.jobs[0]).toEqual(oldRun.jobs[0]);
    expect(resumed.jobs.map(j => j.status)).toEqual(["done", "done"]);
    expect(resumed.positive).toBe(oldRun.positive);
    expect(resumed.jobs.map(j => j.seed)).toEqual(oldRun.jobs.map(j => j.seed));
  });

  it("imports equivalent artist names once per project without touching existing ratings", async () => {
    const project = fixture();
    const original = structuredClone(project.entries[0]);
    const { service } = setup(project);
    const result = await service.dispatch({ type: "addEntries", projectId: project.id,
      text: "ARTIST:ALPHA\nnew_artist\nartist:new artist\nnanata \\(769\\)\nnanata (769)" });
    expect(result.ok).toBe(true);
    expect(result.addedEntryIds).toHaveLength(2);
    expect(result.state.projects[0].entries.find((entry) => entry.id === original.id)).toEqual(original);
    expect(result.message).toContain("跳过 3");
    const second = setup(createProject());
    expect((await second.service.dispatch({ type: "addEntries", projectId: second.disk()[0].id, text: "artist:alpha" })).addedEntryIds).toHaveLength(1);
  });

  it("keeps more than 5000 entries and splits large generation work without losing entries", async () => {
    const project = createProject();
    const { service } = setup(project);
    const response = await service.dispatch({ type: "addEntries", projectId: project.id,
      text: Array.from({ length: 5100 }, (_, i) => `artist:large_${i}`).join("\n") });
    expect(response.ok).toBe(true);
    const created = await service.dispatch({ type: "createRun", projectId: project.id, params: DEFAULT_PARAMS, positive: "same", negative: "", seeds: [42] });
    expect(created.ok).toBe(true);
    const runs = created.state.projects[0].runs;
    expect(runs.map((run) => run.jobs.length)).toEqual([5000, 100]);
    expect(new Set(runs.flatMap((run) => run.jobs.map((job) => job.entryId))).size).toBe(5100);
    expect(runs.every((run) => run.positive === "same" && run.jobs.every((job) => job.seed === 42))).toBe(true);

  });

  it("accepts a 4000-row import and creates one job per entry", async () => {
    const project = createProject();
    project.intervalSeconds = 0;
    const harness = setup(project);
    const text = Array.from({ length: 4_000 }, (_, index) => `artist:excel_${index}`).join("\n");

    const imported = await harness.service.dispatch({
      type: "addEntries",
      projectId: project.id,
      text,
    });
    expect(imported.ok).toBe(true);
    expect(imported.addedEntryIds).toHaveLength(4_000);
    expect(imported.state.projects[0].entries).toHaveLength(4_000);

    const created = await harness.service.dispatch({
      type: "createRun",
      projectId: project.id,
      params: DEFAULT_PARAMS,
      positive: "",
      negative: "",
      seeds: [7],
    });
    expect(created.ok).toBe(true);
    expect(created.state.projects[0].runs[0].entries).toHaveLength(4_000);
    expect(created.state.projects[0].runs[0].jobs).toHaveLength(4_000);
    expect(MAX_COMPARISON_ENTRIES).toBe(5_000);
  });

  it("migrates rated singles into the pool and keeps recipes and unrated entries out", () => {
    const project = createProject();
    project.entries = parseEntries("artist:alpha\nartist:beta\nartist:alpha, artist:beta");
    project.entries[0].ratingId = project.ratings[0].id;
    project.entries[0].inPool = false;
    project.entries[1].inPool = true;
    project.entries[2].ratingId = project.ratings[0].id;
    project.entries[2].inPool = true;

    const harness = setup(project);
    const entries = harness.service.snapshot().projects[0].entries;
    expect(entries.map((entry) => entry.inPool)).toEqual([true, false, false]);
    expect(harness.disk()[0].entries.map((entry) => entry.inPool)).toEqual([true, false, false]);
  });

  it("edits shared tags, synchronizes run selections, and clears deleted references", async () => {
    const project = fixture();
    project.tags = [
      { id: "favorite", label: "Favorite" },
      { id: "batch", label: "Batch" },
    ];
    project.entries[0].tagIds = ["favorite"];
    project.runs[0].entries[0].tagIds = ["favorite"];
    const harness = setup(project);

    const renamed = await harness.service.dispatch({
      type: "tags",
      projectId: project.id,
      tags: [
        { id: "favorite", label: "Preferred" },
        { id: "batch", label: "Batch" },
      ],
    });
    expect(renamed.ok).toBe(true);
    expect(renamed.state.projects[0].tags).toEqual([
      { id: "favorite", label: "Preferred" },
      { id: "batch", label: "Batch" },
    ]);
    expect(renamed.state.projects[0].runs[0].entries[0].tagIds).toEqual(["favorite"]);

    const patched = await harness.service.dispatch({
      type: "entry",
      projectId: project.id,
      runId: project.runs[0].id,
      entryId: project.entries[0].id,
      patch: { tagIds: ["favorite", "batch"] },
    });
    expect(patched.ok).toBe(true);
    expect(patched.state.projects[0].entries[0].tagIds).toEqual(["favorite", "batch"]);
    expect(patched.state.projects[0].runs[0].entries[0].tagIds).toEqual(["favorite", "batch"]);

    const deleted = await harness.service.dispatch({
      type: "tags",
      projectId: project.id,
      tags: [{ id: "favorite", label: "Preferred" }],
    });
    expect(deleted.ok).toBe(true);
    expect(deleted.state.projects[0].entries[0].tagIds).toEqual(["favorite"]);
    expect(deleted.state.projects[0].runs[0].entries[0].tagIds).toEqual(["favorite"]);

    const invalid = await harness.service.dispatch({
      type: "tags",
      projectId: project.id,
      tags: [
        { id: "same", label: "Duplicate" },
        { id: "same", label: "Other" },
      ],
    });
    expect(invalid.ok).toBe(false);
  });

  it("does not let an inPool patch override rating-derived eligibility", async () => {
    const project = fixture();
    const harness = setup(project);
    const result = await harness.service.dispatch({
      type: "entry",
      projectId: project.id,
      entryId: project.entries[1].id,
      patch: { inPool: true },
    });
    expect(result.ok).toBe(true);
    expect(result.state.projects[0].entries[1].inPool).toBe(false);
  });

  it("recovers a partial run by continuing pending jobs and requiring confirmation for uncertain jobs", async () => {
    const project = createProject();
    project.intervalSeconds = 0;
    project.entries = parseEntries("artist:alpha\nartist:beta\nartist:gamma");
    const run = createRun(project, DEFAULT_PARAMS, "", "", [1]);
    complete(run.jobs[0]);
    run.jobs[2].status = "running";
    project.runs = [run];

    const firstBoot = setup(project);
    expect(firstBoot.service.snapshot().projects[0].runs[0].jobs.map((job) => job.status)).toEqual([
      "done",
      "pending",
      "uncertain",
    ]);

    const restarted = setup(firstBoot.disk()[0]);
    const before = restarted.service.snapshot().projects[0].runs[0].jobs;
    expect(before.map((job) => job.status)).toEqual(["done", "pending", "uncertain"]);
    const doneImagePath = before[0].image?.filePath;
    const uncertainJobId = before[2].id;

    await restarted.service.dispatch({
      type: "start",
      projectId: project.id,
      runId: project.runs[0].id,
      approvedAnlas: 0,
    });
    await restarted.service.idle();

    const resumed = restarted.service.snapshot().projects[0].runs[0].jobs;
    expect(restarted.generationCalls()).toBe(1);
    expect(resumed.map((job) => job.status)).toEqual(["done", "done", "uncertain"]);
    expect(resumed[0].image?.filePath).toBe(doneImagePath);

    const rejected = await restarted.service.dispatch({
      type: "retry",
      projectId: project.id,
      runId: project.runs[0].id,
      jobId: uncertainJobId,
    });
    expect(rejected.ok).toBe(false);
    expect(restarted.service.snapshot().projects[0].runs[0].jobs[2].status).toBe("uncertain");

    const acknowledged = await restarted.service.dispatch({
      type: "retry",
      projectId: project.id,
      runId: project.runs[0].id,
      jobId: uncertainJobId,
      acknowledgeUncertain: true,
    });
    expect(acknowledged.ok).toBe(true);
    expect(acknowledged.state.projects[0].runs[0].jobs[2].status).toBe("pending");
    expect(restarted.generationCalls()).toBe(1);
  });

  it("persists a running marker before a paid request", async () => {
    const project = fixture();
    const started = deferred<void>();
    const release = deferred<void>();
    const harness = setup(project, {
      generate: async (_project, _run, job) => {
        started.resolve(undefined);
        await release.promise;
        return { image: imageFor(job), actualAnlas: 0 };
      },
    });

    const result = await harness.service.dispatch({
      type: "start",
      projectId: project.id,
      runId: project.runs[0].id,
      approvedAnlas: 0,
    });
    expect(result.ok).toBe(true);
    await started.promise;

    expect(harness.service.snapshot().running).toEqual({
      projectId: project.id,
      runId: project.runs[0].id,
      pauseRequested: false,
    });
    expect(harness.disk()[0].runs[0].jobs[0].status).toBe("running");

    release.resolve(undefined);
    await harness.service.idle();
    expect(harness.disk()[0].runs[0].jobs.every((job) => job.status === "done")).toBe(true);
  });

  it("migrates legacy covers from the latest completed output and preserves null", () => {
    const project = fixture();
    complete(project.runs[0].jobs[0]);
    project.entries[1].coverJobId = null;
    const harness = setup(project);

    const migrated = harness.service.snapshot().projects[0];
    expect(migrated.entries[0].coverJobId).toBe(project.runs[0].jobs[0].id);
    expect(migrated.entries[1].coverJobId).toBeNull();
    expect(harness.disk()[0].entries[0].coverJobId).toBe(project.runs[0].jobs[0].id);
    expect(harness.disk()[0].entries[1].coverJobId).toBeNull();
  });

  it("selects and clears only completed images belonging to the entry", async () => {
    const project = fixture();
    complete(project.runs[0].jobs[0]);
    complete(project.runs[0].jobs[1]);
    const harness = setup(project);
    const entryId = project.entries[0].id;
    const ownJobId = project.runs[0].jobs[0].id;
    const foreignJobId = project.runs[0].jobs[1].id;

    const selected = await harness.service.dispatch({
      type: "cover",
      projectId: project.id,
      entryId,
      jobId: ownJobId,
    });
    expect(selected.ok).toBe(true);
    expect(selected.state.projects[0].entries[0].coverJobId).toBe(ownJobId);

    const cleared = await harness.service.dispatch({
      type: "cover",
      projectId: project.id,
      entryId,
      jobId: null,
    });
    expect(cleared.ok).toBe(true);
    expect(cleared.state.projects[0].entries[0].coverJobId).toBeNull();

    const foreign = await harness.service.dispatch({
      type: "cover",
      projectId: project.id,
      entryId,
      jobId: foreignJobId,
    });
    expect(foreign.ok).toBe(false);
    expect(foreign.state.projects[0].entries[0].coverJobId).toBeNull();
    expect(setup(harness.disk()[0]).service.snapshot().projects[0].entries[0].coverJobId).toBeNull();
  });

  it("finishes an in-flight image before pause and resumes only pending jobs", async () => {
    const project = fixture();
    const started = deferred<void>();
    const release = deferred<void>();
    const harness = setup(project, {
      generate: async (_project, _run, job) => {
        started.resolve(undefined);
        await release.promise;
        return { image: imageFor(job), actualAnlas: 0 };
      },
    });

    await harness.service.dispatch({
      type: "start",
      projectId: project.id,
      runId: project.runs[0].id,
      approvedAnlas: 0,
    });
    await started.promise;
    const pause = await harness.service.dispatch({ type: "pause" });
    expect(pause.state.running?.pauseRequested).toBe(true);

    release.resolve(undefined);
    await harness.service.idle();
    expect(harness.disk()[0].runs[0].jobs.map((job) => job.status)).toEqual([
      "done",
      "pending",
    ]);

    const resumed = setup(harness.disk()[0]);
    await resumed.service.dispatch({
      type: "start",
      projectId: project.id,
      runId: project.runs[0].id,
      approvedAnlas: 0,
    });
    await resumed.service.idle();
    expect(resumed.generationCalls()).toBe(1);
  });

  it("marks an in-flight job uncertain when its paused completion cannot be written", async () => {
    const project = fixture();
    const started = deferred<void>();
    const release = deferred<void>();
    let failDoneWrite = true;
    let persisted = [structuredClone(project)];
    const harness = setup(project, {
      write: (projects) => {
        const firstJob = projects[0]?.runs[0]?.jobs[0];
        if (failDoneWrite && firstJob?.status === "done") {
          failDoneWrite = false;
          throw new Error("disk full");
        }
        persisted = structuredClone(projects);
      },
      generate: async (_project, _run, job) => {
        started.resolve(undefined);
        await release.promise;
        return { image: imageFor(job), actualAnlas: 0 };
      },
    });

    await harness.service.dispatch({
      type: "start",
      projectId: project.id,
      runId: project.runs[0].id,
      approvedAnlas: 0,
    });
    await started.promise;
    await harness.service.dispatch({ type: "pause" });
    release.resolve(undefined);
    await harness.service.idle();

    const final = harness.service.snapshot().projects[0];
    expect(final.runs[0].jobs.map((job) => job.status)).toEqual([
      "uncertain",
      "pending",
    ]);
    expect(final.runs[0].jobs[0].error).toContain("disk full");
    expect(persisted[0].runs[0].jobs[0].status).toBe("uncertain");
  });

  it("re-resolves a run after replacing the current project during generation", async () => {
    const project = fixture();
    const started = deferred<void>();
    const release = deferred<void>();
    const harness = setup(project, {
      generate: async (_project, _run, job) => {
        started.resolve(undefined);
        await release.promise;
        return { image: imageFor(job), actualAnlas: 0 };
      },
    });

    await harness.service.dispatch({
      type: "start",
      projectId: project.id,
      runId: project.runs[0].id,
      approvedAnlas: 0,
    });
    await started.promise;

    const oldRatingId = project.ratings[0].id;
    const targetRatingId = project.ratings[1].id;
    const replaced = await harness.service.dispatch({
      type: "replaceLevel",
      projectId: project.id,
      levelId: oldRatingId,
      targetId: targetRatingId,
    });
    expect(replaced.ok).toBe(true);

    release.resolve(undefined);
    await harness.service.idle();
    const finalProject = harness.service.snapshot().projects[0];
    expect(finalProject.entries[0].ratingId).toBe(targetRatingId);
    expect(finalProject.runs[0].entries[0].ratingId).toBe(targetRatingId);
    expect(finalProject.runs[0].jobs.every((job) => job.status === "done")).toBe(true);
  });

  it("uses only the first successful seed as the new cover and preserves old output", async () => {
    const project = createProject();
    project.intervalSeconds = 0;
    project.entries = parseEntries("artist:alpha");
    project.entries[0].ratingId = project.ratings[1].id;
    project.entries[0].note = "keep this note";
    const oldRun = createRun(project, DEFAULT_PARAMS, "", "", [7]);
    complete(oldRun.jobs[0]);
    project.runs = [oldRun];
    project.entries[0].coverJobId = oldRun.jobs[0].id;
    const newRun = createRun(project, DEFAULT_PARAMS, "", "", [11, 12]);
    project.runs.push(newRun);
    const harness = setup(project);

    await harness.service.dispatch({
      type: "start",
      projectId: project.id,
      runId: newRun.id,
      approvedAnlas: 0,
    });
    await harness.service.idle();
    const finalProject = harness.service.snapshot().projects[0];
    const finalRun = finalProject.runs.find((run) => run.id === newRun.id)!;

    expect(finalProject.entries[0].coverJobId).toBe(finalRun.jobs[0].id);
    expect(finalRun.jobs[1].status).toBe("done");
    expect(finalProject.entries[0].coverJobId).not.toBe(finalRun.jobs[1].id);
    expect(finalProject.entries[0].ratingId).toBe(project.ratings[1].id);
    expect(finalProject.entries[0].note).toBe("keep this note");
    expect(finalProject.runs[0].jobs[0].image?.filePath).toBe(oldRun.jobs[0].image?.filePath);
  });

  it("reconciles a failed edit rollback while generation is in flight", async () => {
    const project = fixture();
    const started = deferred<void>();
    const release = deferred<void>();
    let failNextWrite = false;
    let persisted = [structuredClone(project)];
    const harness = setup(project, {
      write: (projects) => {
        if (failNextWrite) {
          failNextWrite = false;
          throw new Error("disk full");
        }
        persisted = structuredClone(projects);
      },
      generate: async (_project, _run, job) => {
        started.resolve(undefined);
        await release.promise;
        return { image: imageFor(job), actualAnlas: 0 };
      },
    });

    await harness.service.dispatch({
      type: "start",
      projectId: project.id,
      runId: project.runs[0].id,
      approvedAnlas: 0,
    });
    await started.promise;
    failNextWrite = true;

    const failedEdit = await harness.service.dispatch({
      type: "renameProject",
      projectId: project.id,
      name: "Changed while busy",
    });
    expect(failedEdit.ok).toBe(false);
    expect(failedEdit.state.projects[0].name).toBe(project.name);

    release.resolve(undefined);
    await harness.service.idle();
    expect(harness.service.snapshot().projects[0].name).toBe(project.name);
    expect(harness.service.snapshot().projects[0].runs[0].jobs.every((job) => job.status === "done")).toBe(true);
    expect(persisted[0].runs[0].jobs.every((job) => job.status === "done")).toBe(true);
  });

  it("does not blindly retry a request left running across a crash", async () => {
    const project = fixture();
    project.runs[0].jobs[0].status = "running";
    const harness = setup(project);
    const job = project.runs[0].jobs[0];

    expect(harness.service.snapshot().projects[0].runs[0].jobs[0].status).toBe("uncertain");
    const result = await harness.service.dispatch({
      type: "retry",
      projectId: project.id,
      runId: project.runs[0].id,
      jobId: job.id,
    });
    expect(result.ok).toBe(false);
    expect(harness.generationCalls()).toBe(0);
  });

  it("reconciles a saved output after a crash without generating again", () => {
    const project = fixture();
    project.runs[0].jobs[0].status = "running";
    const harness = setup(project, {
      recover: (job) => ({
        id: job.id,
        filePath: "/saved.png",
        fileUrl: "test:",
      }),
    });

    expect(harness.disk()[0].runs[0].jobs[0].status).toBe("done");
    expect(harness.disk()[0].runs[0].jobs[0].image?.filePath).toBe("/saved.png");
    expect(harness.generationCalls()).toBe(0);
  });

  it("assigns a missing cover when an uncertain job is recovered by retry", async () => {
    const project = fixture();
    project.runs[0].jobs[0].status = "uncertain";
    let allowRecovery = false;
    const harness = setup(project, {
      recover: (job) => allowRecovery ? imageFor(job) : undefined,
    });
    expect(harness.service.snapshot().projects[0].entries[0].coverJobId).toBeUndefined();

    allowRecovery = true;
    const result = await harness.service.dispatch({
      type: "retry",
      projectId: project.id,
      runId: project.runs[0].id,
      jobId: project.runs[0].jobs[0].id,
    });
    expect(result.ok).toBe(true);
    expect(result.state.projects[0].entries[0].coverJobId).toBe(project.runs[0].jobs[0].id);
  });

  it("stops when price exceeds the user-approved amount", async () => {
    const project = fixture();
    const harness = setup(project, { quote: async () => 3 });

    await harness.service.dispatch({
      type: "start",
      projectId: project.id,
      runId: project.runs[0].id,
      approvedAnlas: 2,
    });
    await harness.service.idle();
    expect(harness.generationCalls()).toBe(0);
    expect(harness.disk()[0].runs[0].jobs[0].status).toBe("pending");
    expect(harness.disk()[0].runs[0].jobs[0].error).toContain("exceeds");
  });

  it("blocks another start during an active queue", async () => {
    const project = fixture();
    const release = deferred<number>();
    const harness = setup(project, {
      quote: async () => {
        await release.promise;
        return 0;
      },
    });
    const action = {
      type: "start" as const,
      projectId: project.id,
      runId: project.runs[0].id,
      approvedAnlas: 0,
    };

    expect((await harness.service.dispatch(action)).ok).toBe(true);
    expect((await harness.service.dispatch(action)).ok).toBe(false);
    release.resolve(0);
    await harness.service.idle();
  });

  it("keeps every run on the current rating schema when levels are reordered and renamed", async () => {
    const project = fixture();
    const [first, second, ...rest] = project.ratings;
    const harness = setup(project);
    const result = await harness.service.dispatch({
      type: "levels",
      projectId: project.id,
      levels: [
        { ...second, label: "Current low" },
        { ...first, label: "Current high" },
        ...rest,
      ],
    });

    expect(result.ok).toBe(true);
    const current = result.state.projects[0];
    expect(current.ratings.map((rating) => rating.id)).toEqual([
      second.id,
      first.id,
      ...rest.map((rating) => rating.id),
    ]);
    expect(current.ratings[0].label).toBe("Current low");
    expect(current.ratings[1].label).toBe("Current high");
    expect(current.runs[0].ratings.map((rating) => rating.id)).toEqual(
      current.ratings.map((rating) => rating.id),
    );
    expect(current.runs[0].ratings[0].label).toBe("Current low");
    expect(current.runs[0].entries[0].ratingId).toBe(first.id);
  });

  it("maps current entries explicitly when deleting a rating", async () => {
    const project = fixture();
    const oldRatingId = project.ratings[0].id;
    const targetRatingId = project.ratings[1].id;
    const harness = setup(project);
    const result = await harness.service.dispatch({
      type: "replaceLevel",
      projectId: project.id,
      levelId: oldRatingId,
      targetId: targetRatingId,
    });

    expect(result.ok).toBe(true);
    const current = result.state.projects[0];
    expect(current.ratings.some((rating) => rating.id === oldRatingId)).toBe(false);
    expect(current.entries[0].ratingId).toBe(targetRatingId);
    expect(current.runs[0].ratings.some((rating) => rating.id === oldRatingId)).toBe(false);
    expect(current.runs[0].entries[0].ratingId).toBe(targetRatingId);
  });

  it("syncs unambiguous imported run schemas and preserves used orphans for mapping", async () => {
    const host = createProject();
    const imported = fixture();
    imported.runs[0].ratings[0].label = "Historical label";
    const harness = setup(host, { importProject: async () => imported });
    const result = await harness.service.dispatch({ type: "import" });
    expect(result.ok).toBe(true);
    const synced = result.state.projects[1];
    expect(synced.runs[0].ratings[0].label).toBe(synced.ratings[0].label);

    const ambiguous = fixture();
    ambiguous.runs[0].ratings[0] = { id: "legacy", label: "Historical label", color: "#000" };
    ambiguous.runs[0].entries[0].ratingId = "legacy";
    const preserve = setup(createProject(), { importProject: async () => ambiguous });
    const preserved = await preserve.service.dispatch({ type: "import" });
    expect(preserved.ok).toBe(true);
    expect(preserved.state.projects[1].runs[0].ratings[0].id).toBe("legacy");
    expect(preserved.state.projects[1].runs[0].entries[0].ratingId).toBe("legacy");
  });

  it("applies explicit multi-run rating mappings atomically and clears pool eligibility", async () => {
    const project = fixture();
    const oldId = project.ratings[0].id;
    const legacyId = "legacy-run";
    project.runs[0].ratings[0] = { id: legacyId, label: "Historical", color: "#111" };
    project.runs[0].entries[0].ratingId = legacyId;
    const secondRun = createRun(project, DEFAULT_PARAMS, "", "", [43]);
    const secondLegacyId = "legacy-second";
    secondRun.ratings[1] = { id: secondLegacyId, label: "Historical second", color: "#222" };
    secondRun.entries[1].ratingId = secondLegacyId;
    project.runs.push(secondRun);
    const harness = setup(project);
    const missing = await harness.service.dispatch({
      type: "syncRatings",
      projectId: project.id,
      mapping: {},
    });
    expect(missing.ok).toBe(false);
    expect(missing.state.projects[0].runs[0].entries[0].ratingId).toBe(legacyId);
    expect(missing.state.projects[0].runs[1].entries[1].ratingId).toBe(secondLegacyId);

    const mapped = await harness.service.dispatch({
      type: "syncRatings",
      projectId: project.id,
      mapping: { [legacyId]: null, [secondLegacyId]: null },
    });
    expect(mapped.ok).toBe(true);
    expect(mapped.state.projects[0].runs[0].entries[0].ratingId).toBeNull();
    expect(mapped.state.projects[0].runs[0].entries[0].inPool).toBe(false);
    expect(mapped.state.projects[0].runs[0].ratings.some((rating) => rating.id === legacyId)).toBe(false);
    expect(mapped.state.projects[0].runs[1].entries[1].ratingId).toBeNull();
    expect(mapped.state.projects[0].entries[0].ratingId).toBe(oldId);
  });

  it("rolls back edits if persistence fails", async () => {
    const project = fixture();
    const harness = setup(project, {
      write: () => {
        throw new Error("disk full");
      },
    });

    const result = await harness.service.dispatch({
      type: "renameProject",
      projectId: project.id,
      name: "Changed",
    });
    expect(result.ok).toBe(false);
    expect(result.state.projects[0].name).toBe(project.name);
  });

  it("cannot add a recipe to a pool through the IPC patch", async () => {
    const project = fixture();
    project.entries = parseEntries("artist:alpha, artist:beta");
    const harness = setup(project);

    const result = await harness.service.dispatch({
      type: "entry",
      projectId: project.id,
      entryId: project.entries[0].id,
      patch: { inPool: true },
    });
    expect(result.state.projects[0].entries[0].inPool).toBe(false);
  });
});


describe("generation interval", () => {
  it("samples once per completed image and retains a decimal delay across pause/resume", async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(88 / 301);
    try {
      const project = fixture();
      const { service, disk, generationCalls } = setup(project);
      expect((await service.dispatch({ type: "setInterval", projectId: project.id, intervalSeconds: 30, intervalMaxSeconds: 60 })).ok).toBe(true);
      expect(disk()[0].intervalMaxSeconds).toBe(60);
      expect((await service.dispatch({ type: "setInterval", projectId: project.id, intervalSeconds: 60, intervalMaxSeconds: 30 })).ok).toBe(false);
      expect(disk()[0].intervalSeconds).toBe(30);
      const start = () => service.dispatch({ type: "start", projectId: project.id, runId: project.runs[0].id, approvedAnlas: 0 });
      await start();
      await vi.advanceTimersByTimeAsync(10000);
      expect(generationCalls()).toBe(1);
      await service.dispatch({ type: "pause" });
      await service.idle();
      random.mockReturnValue(0.99);
      await start();
      await vi.advanceTimersByTimeAsync(28799);
      expect(generationCalls()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await service.idle();
      expect(generationCalls()).toBe(2);
    } finally { random.mockRestore(); vi.useRealTimers(); }
  });
  it("defaults legacy projects to 30 seconds and pause/resume keeps the remaining delay", async () => {
    vi.useFakeTimers();
    try {
      const project = fixture();
      delete project.intervalSeconds;
      const { service, generationCalls } = setup(project);
      const start = () => service.dispatch({ type: "start", projectId: project.id, runId: project.runs[0].id, approvedAnlas: 0 });
      await start();
      await vi.advanceTimersByTimeAsync(0);
      expect(generationCalls()).toBe(1);
      await vi.advanceTimersByTimeAsync(10000);
      await service.dispatch({ type: "pause" });
      await service.idle();
      expect(service.snapshot().running).toBeNull();
      await start();
      await vi.advanceTimersByTimeAsync(19999);
      expect(generationCalls()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await service.idle();
      expect(generationCalls()).toBe(2);
    } finally { vi.useRealTimers(); }
  });
  it("persists a custom interval and applies it between requests", async () => {
    vi.useFakeTimers();
    try {
      const project = fixture();
      const { service, disk, generationCalls } = setup(project);
      expect((await service.dispatch({ type: "setInterval", projectId: project.id, intervalSeconds: 5 })).ok).toBe(true);
      expect(disk()[0].intervalSeconds).toBe(5);
      for (const intervalSeconds of [-1, 1.55, NaN, 3601]) {
        expect((await service.dispatch({ type: "setInterval", projectId: project.id, intervalSeconds })).ok).toBe(false);
      }
      await service.dispatch({ type: "start", projectId: project.id, runId: project.runs[0].id, approvedAnlas: 0 });
      await vi.advanceTimersByTimeAsync(4999);
      expect(generationCalls()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await service.idle();
      expect(generationCalls()).toBe(2);
    } finally { vi.useRealTimers(); }
  });
});

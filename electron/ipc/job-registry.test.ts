import { describe, expect, it } from "vitest";
import { beginJob, cancelAllJobs } from "./job-registry";

describe("job-registry", () => {
  it("an older job finishing after a newer one starts does not clear the newer job's controller", () => {
    const a = beginJob();
    const b = beginJob();

    // A finishes late (its own cleanup runs) — this must not touch B.
    a.end();

    expect(b.controller.signal.aborted).toBe(false);
    const cancelled = cancelAllJobs();
    expect(cancelled).toBe(true);
    expect(b.controller.signal.aborted).toBe(true);
  });

  it("cancelAllJobs aborts every job currently in flight, not just the most recent", () => {
    const a = beginJob();
    const b = beginJob();
    const c = beginJob();

    cancelAllJobs();

    expect(a.controller.signal.aborted).toBe(true);
    expect(b.controller.signal.aborted).toBe(true);
    expect(c.controller.signal.aborted).toBe(true);
  });

  it("cancelAllJobs is a no-op that reports nothing-to-cancel when the registry is empty", () => {
    const a = beginJob();
    a.end();

    expect(cancelAllJobs()).toBe(false);
  });

  it("end() is idempotent and never removes a different job with the same id slot reused later", () => {
    const a = beginJob();
    a.end();
    a.end(); // calling twice must not throw or affect anything else

    const b = beginJob();
    expect(cancelAllJobs()).toBe(true);
    expect(b.controller.signal.aborted).toBe(true);
  });
});

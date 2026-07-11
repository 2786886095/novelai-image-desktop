import crypto from "crypto";

// Each paid generation call (generate/i2i/redraw/inpaint/upscale/augment) gets
// its own entry here instead of sharing one module-level AbortController. A
// slow-to-finish older call can no longer null out a newer call's controller
// out from under it, and "stop" cancels every job actually in flight instead
// of whichever one happened to hold a shared reference last.
const jobs = new Map<string, AbortController>();

export function beginJob(): { id: string; controller: AbortController; end: () => void } {
  const id = crypto.randomUUID();
  const controller = new AbortController();
  jobs.set(id, controller);
  return {
    id,
    controller,
    end: () => {
      if (jobs.get(id) === controller) jobs.delete(id);
    },
  };
}

export function cancelAllJobs(): boolean {
  if (jobs.size === 0) return false;
  for (const controller of jobs.values()) controller.abort();
  jobs.clear();
  return true;
}

import crypto from "crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const generationOwner = new AsyncLocalStorage<symbol>();
let reservation: symbol | undefined;
export interface GenerationReservation { run<T>(fn: () => Promise<T>): Promise<T>; release(): void; }

/** Reserve paid generation across modules while a durable comparison queue runs. */
export function reserveGeneration(label: string): GenerationReservation {
  if (reservation || jobs.size) throw new Error("Another image task is running. Finish it before starting a comparison.");
  const owner = Symbol(label);
  reservation = owner;
  return { run: fn => generationOwner.run(owner, fn), release: () => { if (reservation === owner) reservation = undefined; } };
}

// Each paid generation call (generate/i2i/redraw/inpaint/upscale/augment) gets
// its own entry here instead of sharing one module-level AbortController. A
// slow-to-finish older call can no longer null out a newer call's controller
// out from under it, and "stop" cancels every job actually in flight instead
// of whichever one happened to hold a shared reference last.
const jobs = new Map<string, AbortController>();

export function beginJob(): { id: string; controller: AbortController; end: () => void } {
  if (reservation && generationOwner.getStore() !== reservation) throw new Error("An artist comparison is running. Pause it before starting another image task.");
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

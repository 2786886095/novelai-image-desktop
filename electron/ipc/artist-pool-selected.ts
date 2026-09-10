import axios from "axios";
import type { ArtistPoolSnapshot, ArtistPoolSyncProgress, ArtistPoolTotal, ArtistTagRecord } from "../../src/artist-lab";
import { normalizeArtistPoolCount } from "../../src/artist-pool-options";
import { proxyConfig } from "./proxy";
import { artistRequestScheduler } from "./artist-request-scheduler";

const PAGE_SIZE = 1000, MAX_PAGE = 1000;
class PoolError extends Error {
  constructor(readonly issue: NonNullable<ArtistPoolSnapshot["issue"]>) { super(issue); }
}
function check(signal?: AbortSignal) { if (signal?.aborted) throw new PoolError("cancelled"); }
async function pause(ms: number, signal?: AbortSignal) {
  check(signal); if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener("abort", cancel); reject(new PoolError("cancelled")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, ms);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
function reader(signal?: AbortSignal, onRetry?: (delay: number) => void) {
  return async (page: number|string, limit: number, idsOnly = false, byDate = false): Promise<unknown[]> => {
    for (let attempt = 0; ; attempt++) {
      const release = await artistRequestScheduler.acquire(signal, idsOnly);
      try {
        check(signal);
        const r = await axios.get("https://danbooru.donmai.us/tags.json", {
          ...proxyConfig("update"), signal, timeout: 12_000,
          headers: { Accept: "application/json", "User-Agent": "Langbai-NovelAI-Studio/Selected-Artists" },
          params: { page, limit, "search[category]": 1, "search[is_deprecated]": "false",
            "search[order]": idsOnly || byDate ? "date" : "count", only: idsOnly ? "id" : "id,name,post_count,category,is_deprecated" },
        });
        if (!Array.isArray(r.data) || r.data.length > limit) throw new PoolError("invalid-response");
        return r.data;
      } catch (e) {
        check(signal); const d = e as {code?: string; response?: {status?: number; headers?: Record<string, string>}};
        const status = d?.response?.status;
        if (attempt >= 2 || !(status === 429 || (status != null && status >= 500) || ["ETIMEDOUT", "ECONNABORTED", "ECONNRESET"].includes(d?.code ?? ""))) throw e;
        const retry = d?.response?.headers?.["retry-after"];
        const serverDelay = retry == null ? 0 : Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
        const delay = Math.max(1000 * 2 ** attempt, Number.isFinite(serverDelay) ? serverDelay : 0);
        if (delay > 120_000) throw e;
        artistRequestScheduler.backoff(delay);
        onRetry?.(delay); release(); await pause(delay, signal);
      } finally { release(); }
    }
  };
}

export function readArtistCatalogPage(page:number|string,signal:AbortSignal) {
  return reader(signal)(page,1000,false,true);
}

/** Fetch only the requested leading ranking window; never load the whole catalog first. */
export async function loadSelectedArtistPool(rawCount: unknown, options: {
  signal?: AbortSignal; onProgress?: (p: Omit<ArtistPoolSyncProgress, "requestId">) => void;
} = {}): Promise<ArtistPoolSnapshot> {
  const requested = normalizeArtistPoolCount(rawCount), startedAt = Date.now();
  const items: ArtistTagRecord[] = [], ids = new Set<number>(), names = new Set<string>(); let pages = 0;
  const notify = (state: ArtistPoolSyncProgress["state"] = "loading", retryAfterMs?: number) => options.onProgress?.({loaded:items.length,pages,state,retryAfterMs});
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  const finishSelection = artistRequestScheduler.beginSelection();
  const read = reader(controller.signal, delay => notify("retrying", delay));
  try {
    // Keep a fixed page size: changing the last page's limit would change offsets.
    const pageSize = Math.min(PAGE_SIZE, requested);
    // Bounded look-ahead overlaps network waits but commits pages in ranking order.
    // Wrap failures immediately: a later page can fail before the preceding page completes.
    type Batch = { rows: unknown[]; error?: never } | { rows?: never; error: unknown };
    const pending = new Map<number, Promise<Batch>>();
    let nextPage = 1;
    const fill = () => {
      const lastNeeded = Math.min(MAX_PAGE, pages + Math.ceil((requested - items.length) / pageSize));
      while (pending.size < 2 && nextPage <= lastNeeded) {
        const page = nextPage++;
        pending.set(page, read(page, pageSize).then(rows => ({ rows }), error => ({ error })));
      }
    };
    notify(); fill();
    for (let page = 1; page <= MAX_PAGE && items.length < requested; page++) {
      const result = await pending.get(page)!; pending.delete(page); check(options.signal);
      if ("error" in result) throw result.error;
      const batch = result.rows;
      if (!batch.length) { if (!items.length) throw new PoolError("empty-response"); break; }
      const previous = items.length;
      for (const raw of batch) {
        const r = raw as Record<string, unknown> | null;
        if (!r || !Number.isSafeInteger(r.id) || Number(r.id) <= 0 || typeof r.name !== "string" || !r.name.trim()
          || r.category !== 1 || r.is_deprecated !== false || !Number.isSafeInteger(r.post_count) || Number(r.post_count) < 0) throw new PoolError("invalid-response");
        const name = r.name.trim(), id = Number(r.id);
        if (!ids.has(id) && !names.has(name) && items.length < requested) {
          ids.add(id); names.add(name); items.push({id,name,postCount:Number(r.post_count),deprecated:false});
        }
      }
      if (items.length === previous) throw new PoolError("repeated-page");
      pages++; notify();
      if (batch.length < pageSize) break;
      if (page === MAX_PAGE && items.length < requested) throw new PoolError("empty-response");
      fill();
    }
    items.sort((a,b)=>b.postCount-a.postCount||a.id-b.id);
    return {items,source:"network",requested,rankedCount:items.length,savedAt:Date.now(),issue:null,complete:true,startedAt,pages};
  } catch(e) {
    const d=e as {code?:string;response?:{status?:number}};
    const issue=options.signal?.aborted ? "cancelled" : e instanceof PoolError ? e.issue : ["ETIMEDOUT","ECONNABORTED"].includes(d?.code??"") ? "timeout" : "network";
    return {items:[],source:"empty",requested,rankedCount:0,savedAt:null,issue,complete:false,startedAt,pages,
      ...(Number.isInteger(d?.response?.status)?{httpStatus:d.response!.status}:{})};
  } finally {
    controller.abort(); options.signal?.removeEventListener("abort", cancel); finishSelection();
  }
}

/** No tag-count API exists. Probe the final numbered page with ONLY IDs (<=10 small responses).
 * This sends no catalog to the renderer and does not block the selected pool.
 * At the API's numbered-page ceiling, report a lower bound, never an exact invented total.
 */
export async function fetchArtistPoolTotal(previous?: ArtistPoolTotal | null): Promise<ArtistPoolTotal> {
  const read = reader(); let low = 1, high = MAX_PAGE, lastPage = 0, lastSize = 0;
  const result = (page: number, size: number): ArtistPoolTotal => ({
    total: page ? (page - 1) * PAGE_SIZE + size : 0, checkedAt: Date.now(),
    lowerBound: page === MAX_PAGE && size === PAGE_SIZE, issue: null,
  });
  const probe = async (page: number) => {
    const rows = await read(page, PAGE_SIZE, true), ids = new Set<number>();
    for (const raw of rows) {
      const id = (raw as {id?: unknown} | null)?.id;
      if (!Number.isSafeInteger(id) || Number(id) <= 0 || ids.has(Number(id))) throw new PoolError("invalid-response");
      ids.add(Number(id));
    }
    return rows.length;
  };
  try {
    // Revalidate the last observed boundary, not the whole binary search every click.
    // Usually one request; a full boundary needs its next page. Large changes fall back.
    if (previous?.total != null && Number.isSafeInteger(previous.total) && previous.total >= 0) {
      const page = Math.max(1, Math.min(MAX_PAGE, Math.ceil(previous.total / PAGE_SIZE)));
      const size = await probe(page);
      if (size > 0) {
        if (size < PAGE_SIZE || page === MAX_PAGE) return result(page, size);
        const next = await probe(page + 1);
        if (next === 0) return result(page, size);
        if (next < PAGE_SIZE || page + 1 === MAX_PAGE) return result(page + 1, next);
        lastPage = page + 1; lastSize = next; low = page + 2;
      } else { high = page - 1; }
    }
    while (low <= high) {
      const page = Math.floor((low + high) / 2), size = await probe(page);
      if (size) {
        if (size < PAGE_SIZE) return result(page, size);
        lastPage = page; lastSize = size; low = page + 1;
      } else high = page - 1;
    }
    return result(lastPage, lastSize);
  } catch (e) { return { total: null, checkedAt: null, lowerBound: false, issue: e instanceof PoolError ? "invalid-response" : "network" }; }
}
export function createArtistPoolTotalService(){
  let pending:Promise<ArtistPoolTotal>|null=null,last:ArtistPoolTotal|null=null;
  return (force=false)=>{
    if(pending)return pending;
    if(!force&&last?.checkedAt&&Date.now()-last.checkedAt<15*60_000)return Promise.resolve(last);
    pending=fetchArtistPoolTotal(last).then(r=>{if(r.total!==null)last=r;return r;}).finally(()=>{pending=null;});return pending;
  };
}
export function createSelectedArtistPoolManager(){
  const jobs=new Map<number,{id:string,count:number,controller:AbortController,result:Promise<ArtistPoolSnapshot>}>();
  return {
    start(owner:number,id:string,rawCount:unknown,onProgress:(p:ArtistPoolSyncProgress)=>void){
      if(typeof id!=="string"||!id||id.length>120)throw new Error("Invalid artist sync request ID");
      const count=normalizeArtistPoolCount(rawCount),old=jobs.get(owner);
      if(old?.id===id&&old.count===count)return old.result;
      old?.controller.abort();const controller=new AbortController();
      const result=loadSelectedArtistPool(count,{signal:controller.signal,onProgress:p=>onProgress({...p,requestId:id})})
        .finally(()=>{if(jobs.get(owner)?.controller===controller)jobs.delete(owner);});
      jobs.set(owner,{id,count,controller,result});return result;
    },
    cancel(owner:number,id:string){const j=jobs.get(owner);if(j?.id!==id)return false;j.controller.abort();return true;},
    dispose(owner:number){jobs.get(owner)?.controller.abort();},
  };
}

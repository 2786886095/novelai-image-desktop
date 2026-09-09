export type ImageSaveState = "pending" | "success" | "partial" | "error" | "cancelled";
export interface ImageSaveNotice {
  id: number;
  kind: "image" | "download" | "archive";
  state: ImageSaveState;
  total?: number;
  saved?: number;
  failed?: number;
  path?: string;
  errorCode?: string;
}

interface SaveResult {
  ok: boolean;
  cancelled?: boolean;
  savedPaths?: string[];
  filePath?: string;
  path?: string;
  outputDir?: string;
  count?: number;
  failed?: number;
}

// Only inspect structured results, never parse remote error text or claim a
// save completed before IPC resolves (including the actual filesystem write).
export function settleImageSave(notice: ImageSaveNotice, result: SaveResult): ImageSaveNotice {
  if (result.cancelled) return { ...notice, state: "cancelled" };
  const saved = result.savedPaths?.length ?? result.count ?? (result.filePath ? 1 : undefined);
  const failed = result.failed ?? 0;
  const hasOutput = (saved ?? 0) > 0 || (result.ok && Boolean(result.path));
  const state = hasOutput && failed > 0 ? "partial"
    : result.ok && (result.savedPaths === undefined || saved! > 0) ? "success" : "error";
  return { ...notice, state, saved, failed,
    path: hasOutput ? result.outputDir || result.filePath || result.path || result.savedPaths?.[0] : undefined };
}

export function createImageSaveTracker() {
  let sequence = 0;
  let notices: ImageSaveNotice[] = [];
  const listeners = new Set<(notices: ImageSaveNotice[]) => void>();
  const pending = new Map<string, Promise<SaveResult>>();
  const emit = () => {
    for (const listener of listeners) {
      try { listener(notices.map(item => ({ ...item }))); } catch { /* A closed view must not fail a save. */ }
    }
  };
  return {
    subscribe(listener: (notices: ImageSaveNotice[]) => void) {
      listeners.add(listener);
      listener(notices.map(item => ({ ...item })));
      return () => { listeners.delete(listener); };
    },
    dismiss(id: number) { notices = notices.filter(item => item.id !== id || item.state === "pending"); emit(); },
    run<T extends SaveResult>(key: string, kind: ImageSaveNotice["kind"], operation: () => Promise<T>, total?: number): Promise<T> {
      const active = pending.get(key);
      if (active) return active as Promise<T>;
      const notice: ImageSaveNotice = { id: ++sequence, kind, state: "pending", total };
      // Keep active tasks and a bounded number of recent finished notices.
      const recent = notices.filter(item => item.state !== "pending").slice(-19);
      notices = [...notices.filter(item => item.state === "pending"), ...recent, notice];
      const finish = (value: ImageSaveNotice) => { notices = notices.map(item => item.id === notice.id ? value : item); emit(); };
      const promise = Promise.resolve().then(operation).then(result => {
        finish(settleImageSave(notice, result));
        return result;
      }, error => {
        const code = String(error?.code ?? "");
        finish({ ...notice, state: "error", errorCode: ["ENOSPC", "EACCES", "EPERM", "ENOENT"].includes(code) ? code : undefined });
        throw error;
      }).finally(() => { pending.delete(key); });
      pending.set(key, promise);
      emit();
      return promise;
    },
  };
}

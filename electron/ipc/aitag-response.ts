export type AitagResponseKind = "config" | "search" | "work";
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function readAitagResponse(status: number, data: unknown, kind: AitagResponseKind): Record<string, unknown> {
  // Only the search API's empty-result response is a valid 404. A proxy/CDN
  // HTML error page must never become a successful empty gallery.
  if (status === 404 && kind === "search" && (data === "" || (object(data)
    && (Object.keys(data).length === 0 || (Array.isArray(data.items) && data.items.length === 0 && Number(data.total) === 0))))) {
    return { page: 1, page_size: 60, total: 0, items: [] };
  }
  if (status < 200 || status >= 300) {
    const blocked = status === 403 && typeof data === "string"
      && /cloudflare/i.test(data.slice(0, 16000)) && /blocked|attention required|challenge/i.test(data.slice(0, 16000));
    throw new Error(blocked ? "AITAG_BLOCKED_403" : `AITAG_HTTP_${status}`);
  }
  if (!object(data) || data.error
    || (kind === "search" && (!Array.isArray(data.items) || !Number.isFinite(Number(data.total)) || Number(data.total) < 0))
    || (kind === "work" && (!object(data.work) || !Array.isArray(data.images)))) {
    throw new Error("AITAG_INVALID_RESPONSE");
  }
  return data;
}

export function aitagTransportError(reason: unknown): Error {
  const error = reason as { message?: string; code?: string; response?: { status: number; data: unknown } } | null;
  if (/^AITAG_/.test(error?.message ?? "")) return reason as Error;
  if (error?.response) {
    try { readAitagResponse(error.response.status, error.response.data, "config"); }
    catch (failure) { return failure as Error; }
  }
  return new Error(["ETIMEDOUT", "ECONNABORTED"].includes(error?.code ?? "") ? "AITAG_TIMEOUT" : "AITAG_NETWORK");
}

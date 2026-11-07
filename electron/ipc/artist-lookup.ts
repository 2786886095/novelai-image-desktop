import { net, ipcMain } from "electron";
import { artistHit, artistLookupRequest, artistProfile, matchesArtist, parseArtistPreviews } from "../../src/artist-lookup";

export function registerArtistLookupIpc() {
  const busy = new Map<number, number>();
  ipcMain.handle("artistLookup:read", async (event, kind: unknown, input: unknown) => {
    if ((kind !== "identity" && kind !== "preview") || typeof input !== "string") throw new Error("invalid");
    const sender = event.sender.id;
    const count = busy.get(sender) ?? 0;
    if (count >= 4) throw new Error("busy");
    busy.set(sender, count + 1);
    try {
      const url = artistLookupRequest(kind, input);
      const response = await net.fetch(url.toString(), {
        redirect: "error", credentials: "omit", signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json" },
      });
      if (!response.ok || !response.body) throw new Error("network");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 1024 * 1024) throw new Error("network");
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      const rows: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!Array.isArray(rows)) throw new Error("network");
      if (kind === "preview") return parseArtistPreviews(rows);
      const profile = artistProfile(input)!;
      return rows.slice(0, 20).flatMap(row => {
        const hit = artistHit(row, true);
        return hit && (profile.isUrl ? matchesArtist(profile, hit) : true) ? [hit] : [];
      });
    } catch {
      throw new Error("Danbooru lookup unavailable");
    } finally {
      const remaining = (busy.get(sender) ?? 1) - 1;
      if (remaining) busy.set(sender, remaining); else busy.delete(sender);
    }
  });
}

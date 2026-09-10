import { encodeArtistCatalog, decodeArtistCatalog } from "./artist-catalog-codec";
import type { ArtistTagRecord } from "../../src/artist-lab";

/** Full cursor scan; only a terminal empty page permits a new fixed snapshot. */
export async function collectArtistCatalog(read: (page: number|string) => Promise<unknown[]>,
  check: () => void, progress: (loaded:number,pages:number) => void, now = () => Date.now()) {
  const rows: ArtistTagRecord[] = [], ids = new Set<number>();
  let cursor: number | null = null, pages = 0;
  for (;;) {
    check(); const batch = await read(cursor === null ? 1 : `b${cursor}`); check();
    if (!Array.isArray(batch) || batch.length > 1000) throw new Error("Invalid catalog response");
    if (!batch.length) { if (!rows.length) throw new Error("Empty catalog response"); break; }
    let next: number = cursor ?? Number.MAX_SAFE_INTEGER;
    for (const raw of batch) {
      const row = raw as Record<string,unknown> | null;
      if (!row || !Number.isSafeInteger(row.id) || Number(row.id)<=0 || typeof row.name!=="string" || !row.name.trim() || row.category!==1 || row.is_deprecated!==false || !Number.isSafeInteger(row.post_count) || Number(row.post_count)<0) throw new Error("Invalid catalog artist");
      const id = Number(row.id);
      if (ids.has(id) || (cursor!==null && id>=cursor)) throw new Error("Repeated catalog page");
      ids.add(id); next=Math.min(next,id); rows.push({id,name:row.name.trim(),postCount:Number(row.post_count),deprecated:false});
    }
    cursor=next; pages++; progress(rows.length,pages);
  }
  check(); const packed=encodeArtistCatalog(rows,now()), catalog=decodeArtistCatalog(packed);
  return {packed,catalog,pages,rawCount:rows.length};
}

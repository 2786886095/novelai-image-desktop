import { describe, expect, it } from "vitest";
import { artistHit, artistLookupRequest, formatLookupPrompt, matchesArtist, mergeArtistIndex, parseArtistBatch, parseArtistPreviews, readArtistIndex } from "./artist-lookup";

const joined = "https://www.pixiv.net/users/123https://x.com/FiXtUrEhttps://twitter.com/fixture\nhttps://example.test/artist";
const entry = { id: 24, tag: "fixture_artist", urls: ["https://x.com/fixture"], savedAt: 1720000000000, source: "danbooru" as const };
describe("issue #86 artist lookup", () => {
  it("splits pasted URLs without a separator and deduplicates identity aliases", () => {
    expect(parseArtistBatch(joined)).toEqual({ profiles: [
      { key: "pixiv:123", value:"https://www.pixiv.net/users/123",isUrl:true },
      { key: "x:fixture",value:"https://twitter.com/fixture",isUrl:true },
    ], invalid: 1 });
    expect(() => parseArtistBatch(Array.from({length:13}, (_,i) => "https://x.com/u"+i).join(""))).toThrow();
    for (const input of ["https://x.com:443/fixture","https://x.com@127.0.0.1/fixture","https://x.com.evil.test/fixture","https://www.pixiv.net/artworks/123","https://x.com/search"]) expect(() => parseArtistBatch(input)).toThrow();
  });
  it("matches verified URL identities and retains offline cache provenance", () => {
    const query = parseArtistBatch("https://x.com/fixture").profiles[0];
    const hit = artistHit({ id:24,name:"fixture_artist",urls:[{url:"http://twitter.com/fixture"},{url:"https://x.com/other",is_active:false}] },true)!;
    expect(matchesArtist(query, hit)).toBe(true);
    expect(hit.urls).toEqual(["https://twitter.com/fixture"]);
    expect(artistHit({ id:24,name:"negative_tag:1",urls:[] },true)).toBeNull();
    const snapshot = JSON.stringify({version:1,artists:[entry]});
    expect(readArtistIndex(snapshot)[0].source).toBe("danbooru");
    const imported = readArtistIndex(snapshot,true);
    expect(imported[0].source).toBe("import");
    expect(mergeArtistIndex([entry],imported)).toEqual([entry]);
    expect(() => readArtistIndex(JSON.stringify({version:1,artists:[{...entry,urls:["https://evil.test/"]}]}))).toThrow();
    const url = artistLookupRequest("identity",query.value);
    expect(url.origin).toBe("https://danbooru.donmai.us");
    expect(url.searchParams.get("search[url_matches]")).toBe(query.value);
  });
  it("exports the selected weighted tags in two distinct formats", () => {
    const tags = [{tag:"fixture_artist",weight:1.35},{tag:"fixture_two",weight:1}];
    expect(formatLookupPrompt(tags,true)).toBe("1.35::artist:fixture_artist ::, 1::artist:fixture_two ::");
    expect(formatLookupPrompt(tags,false)).toBe("1.35::fixture_artist ::, fixture_two");
  });
  it("keeps only valid recent general previews from the configured CDN", () => {
    const row = {id:1,rating:"g",created_at:"2024-01-02T00:00:00Z",preview_file_url:"https://cdn.donmai.us/sample/a.jpg"};
    expect(parseArtistPreviews([row,{...row,id:8},{...row,id:9,rating:"e"},{...row,id:10,preview_file_url:"https://cdn.donmai.us.evil.test/a.jpg"}]).map(x=>x.id)).toEqual([8,1]);
    expect(artistLookupRequest("preview","fixture_artist").searchParams.get("tags")).toBe("fixture_artist rating:g");
  });
});

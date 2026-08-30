import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({ default: { get: axiosGet } }));
vi.mock("./proxy", () => ({ proxyConfig: () => ({}) }));

import { clearOnlineGalleryDataCache, getOnlineGalleryDetail, searchOnlineGallery } from "./online-gallery";

beforeEach(() => {
  clearOnlineGalleryDataCache();
  axiosGet.mockReset();
});

describe("online gallery adapters", () => {
  it("normalizes Safebooru search and detail into one source-neutral shape", async () => {
    const post = {
      id: 42,
      rating: "g",
      preview_file_url: "https://cdn.donmai.us/180x180/demo.jpg",
      large_file_url: "https://cdn.donmai.us/sample/demo.jpg",
      file_url: "https://cdn.donmai.us/original/demo.jpg",
      image_width: 832,
      image_height: 1216,
      tag_string: "1girl solo smile",
      tag_string_artist: "artist_name",
      tag_string_character: "character_name",
      tag_string_copyright: "series_name",
      tag_string_general: "1girl solo smile",
      tag_string_meta: "highres",
      score: 8,
      fav_count: 3,
    };
    axiosGet.mockResolvedValue({ data: [post] });

    const page = await searchOnlineGallery({ source: "safebooru", page: 1, query: "smile", safeOnly: true });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      source: "safebooru",
      id: "42",
      prompt: "1girl, solo, smile",
      author: "artist_name",
    });
    expect(axiosGet).toHaveBeenCalledWith(
      "https://safebooru.donmai.us/posts.json",
      expect.objectContaining({ params: expect.objectContaining({ tags: "smile rating:g" }) }),
    );

    axiosGet.mockResolvedValueOnce({ data: post });
    const detail = await getOnlineGalleryDetail({ source: "safebooru", id: "42" });
    expect(detail.media[0]).toMatchObject({ width: 832, height: 1216 });
    expect(detail.item.tags.characters).toEqual(["character_name"]);
  });

  it("loads QuickTagCloud collections, entries, assets and details with manifest verification", async () => {
    const codex = {
      id: "demo",
      title: "演示图鉴",
      author: "Tester",
      version: "1.0",
      entries: [{
        id: "demo_1",
        title: "柔和日光",
        tags: "1girl, solo, soft lighting",
        negative: "lowres",
        path: ["光线"],
        image: "demo.jpg",
        original: "demo.png",
        imageWidth: 832,
        imageHeight: 1216,
        images: [{ path: "demo.jpg", original: "demo.png" }],
      }],
    };
    const bytes = Buffer.from(JSON.stringify(codex));
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const manifestEntry = { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    axiosGet.mockImplementation(async (url: string) => {
      if (url.endsWith("/data-source.json")) return { data: { baseUrl: "https://assets.quicktagcloud.com/data", pointer: "current.json" } };
      if (url.endsWith("/data/current.json")) return { data: { release: "r-test", manifest: "releases/r-test/manifest.json" } };
      if (url.endsWith("/manifest.json")) return { data: { files: { "demo.json": manifestEntry } } };
      if (url.endsWith("/codexes.json")) return { data: [{ id: "demo", title: "演示图鉴", author: "Tester", version: "1.0", entryCount: 1, imagedCount: 1, cover: "demo.jpg" }] };
      if (url.endsWith("/media.json")) return { data: { baseUrl: "https://assets.quicktagcloud.com", imagePrefix: "images", originalPrefix: "originals" } };
      if (url.endsWith("/demo.json")) return { data: arrayBuffer };
      throw new Error(`Unexpected URL: ${url}`);
    });

    const collections = await searchOnlineGallery({ source: "quicktag", page: 1, safeOnly: true });
    expect(collections.items[0]).toMatchObject({ kind: "collection", id: "demo", title: "演示图鉴" });
    expect(collections.items[0].cover.previewUrl).toBe("https://assets.quicktagcloud.com/images/demo/demo.jpg");

    const entries = await searchOnlineGallery({ source: "quicktag", page: 1, collectionId: "demo", safeOnly: true });
    expect(entries.items[0]).toMatchObject({ id: "demo_1", prompt: "1girl, solo, soft lighting" });
    expect(entries.items[0].cover.downloadUrl).toBe("https://assets.quicktagcloud.com/originals/demo/demo.png");

    const detail = await getOnlineGalleryDetail({ source: "quicktag", collectionId: "demo", id: "demo_1" });
    expect(detail.negativePrompt).toBe("lowres");
    expect(detail.categoryPath).toEqual(["光线"]);
  });
});

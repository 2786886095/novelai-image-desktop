import path from "path";
import { pathToFileURL } from "url";
import { describe, expect, it } from "vitest";
import {
  LOCAL_MEDIA_SCHEME,
  localMediaUrlToPath,
  toLocalMediaUrl,
} from "./local-media-protocol";

describe("local media protocol URLs", () => {
  it("gives reused output paths distinct image identities without breaking path validation", () => {
    const source = path.resolve("outputs/2026-09-14_1.png");
    const oldUrl = toLocalMediaUrl(source, "deleted-record");
    const newUrl = toLocalMediaUrl(source, "new-record");
    expect(newUrl).not.toBe(oldUrl);
    expect(toLocalMediaUrl(source, "new-record")).toBe(newUrl);
    expect(localMediaUrlToPath(oldUrl)).toBe(source);
    expect(localMediaUrlToPath(newUrl)).toBe(source);
    expect(localMediaUrlToPath(toLocalMediaUrl(source, "a?b#c /中文"))).toBe(source);
    expect(localMediaUrlToPath(`${LOCAL_MEDIA_SCHEME}://file/${encodeURIComponent(pathToFileURL(path.resolve('never-exposed.png')).toString())}?v=new-record`)).toBeNull();
  });
  it("round-trips Windows paths with spaces and Unicode", () => {
    const source = path.resolve("C:/Users/测试 用户/Pictures/作品 01.png");
    const url = toLocalMediaUrl(source);
    expect(url.startsWith(`${LOCAL_MEDIA_SCHEME}://file/`)).toBe(true);
    expect(localMediaUrlToPath(url)).toBe(source);
  });

  it("allows only the local media scheme and supported media extensions", () => {
    expect(localMediaUrlToPath("file:///C:/Users/test/image.png")).toBeNull();
    expect(localMediaUrlToPath(`${LOCAL_MEDIA_SCHEME}://other/not-an-image`)).toBeNull();
    expect(localMediaUrlToPath(toLocalMediaUrl("C:/Users/test/private.txt"))).toBeNull();
    expect(localMediaUrlToPath(`${LOCAL_MEDIA_SCHEME}://file/not-a-file-url`)).toBeNull();
    const unexposed = pathToFileURL(path.resolve("C:/Users/test/unexposed.png")).toString();
    expect(localMediaUrlToPath(`${LOCAL_MEDIA_SCHEME}://file/${encodeURIComponent(unexposed)}`)).toBeNull();
  });
});

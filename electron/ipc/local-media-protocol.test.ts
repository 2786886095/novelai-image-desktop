import path from "path";
import { pathToFileURL } from "url";
import { describe, expect, it } from "vitest";
import {
  LOCAL_MEDIA_SCHEME,
  localMediaUrlToPath,
  toLocalMediaUrl,
} from "./local-media-protocol";

describe("local media protocol URLs", () => {
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

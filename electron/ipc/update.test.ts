import { beforeEach, describe, expect, it, vi } from "vitest";

const { axiosGet } = vi.hoisted(() => ({ axiosGet: vi.fn() }));

vi.mock("electron", () => ({
  app: { getVersion: () => "1.6.4" },
}));

vi.mock("axios", () => ({
  default: { get: axiosGet },
}));

vi.mock("./proxy", () => ({
  proxyConfig: () => ({}),
}));

import { checkUpdate, compareVersions, latestGiteeRelease, parseLatestYamlVersion, updateSourceOrder } from "./update";

describe("desktop update checking", () => {
  beforeEach(() => {
    axiosGet.mockReset();
  });

  it("parses the updater version from latest.yml", () => {
    expect(parseLatestYamlVersion("version: 1.6.5\npath: app.exe\n")).toBe("1.6.5");
    expect(parseLatestYamlVersion(Buffer.from("version: 'v2.0.1'\n"))).toBe("2.0.1");
  });

  it("compares release versions numerically", () => {
    expect(compareVersions("1.6.5", "1.6.4")).toBe(1);
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("v1.6.4", "1.6.4")).toBe(0);
  });

  it("orders the chosen download source first with automatic fallback", () => {
    expect(updateSourceOrder()).toEqual(["github", "gitee"]);
    expect(updateSourceOrder("gitee")).toEqual(["gitee", "github"]);
  });

  it("uses GitHub as the default update source", async () => {
    axiosGet.mockResolvedValueOnce({ data: "version: 1.6.5\npath: setup.exe\n" });

    await expect(checkUpdate()).resolves.toMatchObject({
      hasUpdate: true,
      currentVersion: "1.6.4",
      latestVersion: "1.6.5",
      releaseUrl: expect.stringContaining("github.com"),
    });
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(axiosGet.mock.calls[0][0]).toContain("github.com");
  });

  it("uses Gitee first when selected", async () => {
    axiosGet.mockResolvedValueOnce({ data: { id: 1765, tag_name: "v1.6.5", assets: [] } });

    await expect(checkUpdate("gitee")).resolves.toMatchObject({
      hasUpdate: true,
      latestVersion: "1.6.5",
      releaseUrl: expect.stringContaining("gitee.com"),
    });
    expect(axiosGet.mock.calls[0][0]).toContain("gitee.com/api/v5");
  });

  it("prefers Gitee attachment metadata when the release list omits sizes", async () => {
    axiosGet
      .mockResolvedValueOnce({
        data: {
          id: 1765,
          tag_name: "v1.6.5",
          assets: [{ name: "part-001", browser_download_url: "https://gitee.com/part-001" }],
        },
      })
      .mockResolvedValueOnce({
        data: [{
          id: 9,
          name: "part-001",
          size: 8_388_608,
          browser_download_url: "https://gitee.com/part-001",
        }],
      });

    const release = await latestGiteeRelease({ includeAttachments: true });
    expect(release.assets).toEqual([
      expect.objectContaining({ name: "part-001", size: 8_388_608 }),
    ]);
  });

  it("falls back to Gitee when GitHub is unavailable", async () => {
    axiosGet
      .mockRejectedValueOnce(new Error("manifest unavailable"))
      .mockRejectedValueOnce(new Error("GitHub API unavailable"))
      .mockResolvedValueOnce({ data: { id: 1765, tag_name: "v1.6.5", assets: [] } });

    await expect(checkUpdate()).resolves.toMatchObject({
      hasUpdate: true,
      latestVersion: "1.6.5",
      releaseUrl: expect.stringContaining("gitee.com"),
    });
    expect(axiosGet).toHaveBeenCalledTimes(3);
  });

  it("falls back to the GitHub API when its manifest is unavailable", async () => {
    axiosGet
      .mockRejectedValueOnce(new Error("asset unavailable"))
      .mockResolvedValueOnce({
        data: {
          tag_name: "v1.6.5",
          html_url: "https://github.com/example/release",
        },
      });

    await expect(checkUpdate()).resolves.toMatchObject({
      hasUpdate: true,
      latestVersion: "1.6.5",
      releaseUrl: "https://github.com/example/release",
    });
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });

  it("returns a visible diagnostic when every source fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    axiosGet
      .mockRejectedValueOnce(new Error("asset blocked"))
      .mockRejectedValueOnce(Object.assign(new Error("rate limit exceeded"), { response: { status: 403 } }))
      .mockRejectedValueOnce(new Error("Gitee blocked"));

    await expect(checkUpdate()).resolves.toMatchObject({
      hasUpdate: false,
      currentVersion: "1.6.4",
      error: expect.stringContaining("rate limit exceeded"),
    });
  });
});

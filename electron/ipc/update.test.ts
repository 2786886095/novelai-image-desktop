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

import { checkUpdate, compareVersions, parseLatestYamlVersion } from "./update";

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

  it("uses latest.yml without consuming the GitHub API quota", async () => {
    axiosGet.mockResolvedValueOnce({ data: "version: 1.6.5\npath: setup.exe\n" });

    await expect(checkUpdate()).resolves.toMatchObject({
      hasUpdate: true,
      currentVersion: "1.6.4",
      latestVersion: "1.6.5",
    });
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(axiosGet.mock.calls[0][0]).toContain("/releases/latest/download/latest.yml");
  });

  it("falls back to the GitHub API when latest.yml is unavailable", async () => {
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
      .mockRejectedValueOnce(Object.assign(new Error("rate limit exceeded"), { response: { status: 403 } }));

    await expect(checkUpdate()).resolves.toMatchObject({
      hasUpdate: false,
      currentVersion: "1.6.4",
      error: expect.stringContaining("rate limit exceeded"),
    });
  });
});

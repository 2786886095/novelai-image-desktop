import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../src/types";

const { getSettings } = vi.hoisted(() => ({ getSettings: vi.fn() }));
vi.mock("./store", () => ({ getSettings }));

import {
  configureSystemProxyResolver,
  normalizeProxyUrl,
  parseSystemProxyResult,
  proxyConfig,
  refreshSystemProxy,
} from "./proxy";

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    proxyMode: "auto",
    proxyUrl: "",
    proxyForNai: true,
    proxyForMcp: true,
    proxyForAi: true,
    proxyForUpdate: true,
    proxyForTranslate: true,
    apiBaseUrl: "https://api.novelai.net",
    tagServerUrl: "",
    visionApiUrl: "https://api.openai.com/v1",
    convertApiUrl: "https://api.openai.com/v1",
    ...overrides,
  } as AppSettings;
}

afterEach(() => {
  configureSystemProxyResolver(undefined);
  getSettings.mockReset();
});

describe("automatic system proxy", () => {
  it("parses Chromium proxy/PAC results in order", () => {
    expect(parseSystemProxyResult(
      "PROXY 127.0.0.1:7897; SOCKS5 localhost:10808; DIRECT",
    )).toEqual({
      proxies: ["http://127.0.0.1:7897", "socks5://localhost:10808"],
      allowsDirect: true,
    });
  });

  it("uses the live system proxy port instead of the legacy 7890 preset", async () => {
    getSettings.mockReturnValue(settings());
    const resolver = vi.fn(async () => "PROXY 127.0.0.1:17890; DIRECT");
    const probe = vi.fn(async (url: string) => url.endsWith(":17890"));
    configureSystemProxyResolver(resolver, probe);
    await refreshSystemProxy();

    expect(resolver).toHaveBeenCalledWith("https://api.novelai.net");
    expect(probe).toHaveBeenCalledWith("http://127.0.0.1:17890");
    expect(proxyConfig("nai")).toMatchObject({ proxy: false });
  });

  it("falls back to direct sockets for TUN when a localhost proxy is stale", async () => {
    getSettings.mockReturnValue(settings());
    configureSystemProxyResolver(
      async () => "PROXY 127.0.0.1:7890; DIRECT",
      async () => false,
    );
    await refreshSystemProxy();
    expect(proxyConfig("nai")).toEqual({});
  });

  it("keeps explicit manual proxy overrides available", () => {
    getSettings.mockReturnValue(settings({
      proxyMode: "custom",
      proxyUrl: "127.0.0.1:4567",
    }));
    expect(normalizeProxyUrl("127.0.0.1:4567")).toBe("http://127.0.0.1:4567");
    expect(proxyConfig("nai")).toMatchObject({ proxy: false });
  });
});

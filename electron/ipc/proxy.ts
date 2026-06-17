// Shared proxy support for every outbound axios request. China-mainland users
// often cannot reach api.novelai.net / image.novelai.net (and Google translate,
// GitHub, etc.) without a local proxy, so we let them point all traffic at an
// HTTP or SOCKS5 proxy, with per-category opt-out.
//
// Usage: spread proxyConfig(category) into an axios request config. It returns
// httpAgent + httpsAgent + `proxy: false` (so axios uses our agents and ignores
// its own env-var proxy parsing), or `{}` when this category should go direct.

import { createRequire } from "module";
import type { AppSettings } from "../../src/types";
import { getSettings } from "./store";

// CJS builds of the proxy-agent packages (v5 / v7) so they load cleanly from
// the packaged asar archive. Loaded via createRequire to stay synchronous.
type AgentCtor = new (uri: string) => unknown;
let HttpProxyAgent: AgentCtor | undefined;
let HttpsProxyAgent: AgentCtor | undefined;
let SocksProxyAgent: AgentCtor | undefined;
try {
  const req = createRequire(__filename);
  HttpProxyAgent = req("http-proxy-agent").HttpProxyAgent;
  HttpsProxyAgent = req("https-proxy-agent").HttpsProxyAgent;
  SocksProxyAgent = req("socks-proxy-agent").SocksProxyAgent;
} catch (err) {
  console.error("[proxy] proxy-agent packages unavailable; proxy disabled:", err);
}

export type ProxyCategory = "nai" | "mcp" | "ai" | "update" | "translate";

const CATEGORY_FLAG: Record<ProxyCategory, keyof AppSettings> = {
  nai: "proxyForNai",
  mcp: "proxyForMcp",
  ai: "proxyForAi",
  update: "proxyForUpdate",
  translate: "proxyForTranslate",
};

/** Add a default http:// scheme when the user omits the protocol. */
export function normalizeProxyUrl(raw: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (/^(https?|socks[45]?h?):\/\//i.test(value)) return value;
  return `http://${value}`;
}

// Agents hold sockets / keep-alive state, so cache by URL.
let cacheKey = "";
let cachedHttp: unknown;
let cachedHttps: unknown;

function agentsFor(proxy: string): { http: unknown; https: unknown } {
  if (proxy === cacheKey) return { http: cachedHttp, https: cachedHttps };
  cacheKey = proxy;
  try {
    if (!proxy) {
      cachedHttp = undefined;
      cachedHttps = undefined;
    } else if (/^socks/i.test(proxy)) {
      const agent = SocksProxyAgent ? new SocksProxyAgent(proxy) : undefined;
      cachedHttp = agent;
      cachedHttps = agent;
    } else {
      cachedHttp = HttpProxyAgent ? new HttpProxyAgent(proxy) : undefined;
      cachedHttps = HttpsProxyAgent ? new HttpsProxyAgent(proxy) : undefined;
    }
  } catch (err) {
    console.error("[proxy] invalid proxy url:", proxy, err);
    cachedHttp = undefined;
    cachedHttps = undefined;
  }
  return { http: cachedHttp, https: cachedHttps };
}

/**
 * Axios request-config fragment that routes a given feature through the
 * configured proxy. Returns {} (direct) when no proxy is set or this category
 * is opted out.
 */
export function proxyConfig(category: ProxyCategory): {
  httpAgent?: unknown;
  httpsAgent?: unknown;
  proxy?: false;
} {
  const settings = getSettings();
  const proxy = normalizeProxyUrl(settings.proxyUrl);
  if (!proxy) return {};
  if (settings[CATEGORY_FLAG[category]] === false) return {};
  const { http, https } = agentsFor(proxy);
  if (!http && !https) return {};
  return { httpAgent: http, httpsAgent: https, proxy: false };
}

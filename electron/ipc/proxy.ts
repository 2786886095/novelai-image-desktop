// Shared proxy support for every outbound axios request.
//
// Automatic mode follows Chromium/Electron's system proxy resolver. This
// covers system proxy settings and PAC rules. When the resolver returns
// DIRECT, Node requests stay direct so a VPN/TUN adapter can route them.

import { createRequire } from "module";
import { connect } from "node:net";
import type { AppSettings } from "../../src/types";
import { getSettings } from "./store";

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
export type SystemProxyResolver = (url: string) => Promise<string>;
type ProxyReachabilityProbe = (proxyUrl: string) => Promise<boolean>;

const CATEGORY_FLAG: Record<ProxyCategory, keyof AppSettings> = {
  nai: "proxyForNai",
  mcp: "proxyForMcp",
  ai: "proxyForAi",
  update: "proxyForUpdate",
  translate: "proxyForTranslate",
};

const CATEGORY_TARGET: Record<ProxyCategory, (settings: AppSettings) => string> = {
  nai: (settings) => settings.apiBaseUrl || "https://api.novelai.net",
  mcp: (settings) => settings.tagServerUrl || "https://danbooru.donmai.us",
  ai: (settings) => settings.visionApiUrl || settings.convertApiUrl || "https://api.openai.com",
  update: () => "https://github.com/2786886095/novelai-image-desktop/releases/latest",
  translate: () => "https://translate.googleapis.com",
};

/** Add a default http:// scheme when the user omits the protocol. */
export function normalizeProxyUrl(raw: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (/^(https?|socks[45]?h?):\/\//i.test(value)) return value;
  return `http://${value}`;
}

/** Convert Electron resolveProxy() output into ordered proxy URL candidates. */
export function parseSystemProxyResult(raw: string): { proxies: string[]; allowsDirect: boolean } {
  const proxies: string[] = [];
  let allowsDirect = false;
  for (const entry of String(raw ?? "").split(";")) {
    const value = entry.trim();
    if (!value) continue;
    if (/^DIRECT$/i.test(value)) {
      allowsDirect = true;
      continue;
    }
    const match = /^(PROXY|HTTP|HTTPS|SOCKS|SOCKS4|SOCKS5)\s+(.+)$/i.exec(value);
    if (!match) continue;
    const kind = match[1].toUpperCase();
    const endpoint = match[2].trim();
    const scheme = kind === "SOCKS" || kind === "SOCKS5"
      ? "socks5"
      : kind === "SOCKS4"
        ? "socks4"
        : kind === "HTTPS"
          ? "https"
          : "http";
    try {
      const url = new URL(`${scheme}://${endpoint}`);
      if (url.hostname && url.port) proxies.push(url.toString().replace(/\/$/, ""));
    } catch {
      // Ignore malformed entries and continue to the next PAC/system result.
    }
  }
  return { proxies: [...new Set(proxies)], allowsDirect };
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

async function probeLocalProxy(proxyUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(proxyUrl);
  } catch {
    return false;
  }
  if (!isLoopbackHost(url.hostname)) return true;
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  return await new Promise<boolean>((resolve) => {
    const socket = connect({ host: url.hostname.replace(/^\[|\]$/g, ""), port });
    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(700, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

let systemProxyResolver: SystemProxyResolver | undefined;
let reachabilityProbe: ProxyReachabilityProbe = probeLocalProxy;
const automaticProxy = new Map<ProxyCategory, string>();
let refreshInFlight: Promise<void> | undefined;

export function configureSystemProxyResolver(
  resolver: SystemProxyResolver | undefined,
  probe: ProxyReachabilityProbe = probeLocalProxy,
) {
  systemProxyResolver = resolver;
  reachabilityProbe = probe;
  automaticProxy.clear();
}

async function resolveAutomaticProxy(category: ProxyCategory, settings: AppSettings): Promise<string> {
  if (!systemProxyResolver) return "";
  const result = parseSystemProxyResult(await systemProxyResolver(CATEGORY_TARGET[category](settings)));
  for (const candidate of result.proxies) {
    if (await reachabilityProbe(candidate)) return candidate;
  }
  // Empty means direct. This is also the fallback for a stale localhost port,
  // allowing an active TUN/VPN virtual adapter to route the socket.
  return "";
}

/** Refresh cached system/PAC decisions without delaying individual requests. */
export function refreshSystemProxy(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const settings = getSettings();
    if (settings.proxyMode !== "auto") {
      automaticProxy.clear();
      return;
    }
    const entries = await Promise.all(
      (Object.keys(CATEGORY_TARGET) as ProxyCategory[]).map(async (category) => {
        try {
          return [category, await resolveAutomaticProxy(category, settings)] as const;
        } catch (error) {
          console.warn(`[proxy] system proxy resolution failed for ${category}; using direct/TUN`, error);
          return [category, ""] as const;
        }
      }),
    );
    automaticProxy.clear();
    for (const [category, proxy] of entries) automaticProxy.set(category, proxy);
  })().finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

const agentCache = new Map<string, { http: unknown; https: unknown }>();

function agentsFor(proxy: string): { http: unknown; https: unknown } {
  const cached = agentCache.get(proxy);
  if (cached) return cached;
  let result: { http: unknown; https: unknown };
  try {
    if (/^socks/i.test(proxy)) {
      const agent = SocksProxyAgent ? new SocksProxyAgent(proxy) : undefined;
      result = { http: agent, https: agent };
    } else {
      result = {
        http: HttpProxyAgent ? new HttpProxyAgent(proxy) : undefined,
        https: HttpsProxyAgent ? new HttpsProxyAgent(proxy) : undefined,
      };
    }
  } catch (err) {
    console.error("[proxy] invalid proxy url:", proxy, err);
    result = { http: undefined, https: undefined };
  }
  agentCache.set(proxy, result);
  return result;
}

/** Axios request-config fragment for manual or automatically resolved proxy. */
export function proxyConfig(category: ProxyCategory): {
  httpAgent?: unknown;
  httpsAgent?: unknown;
  proxy?: false;
} {
  const settings = getSettings();
  if (settings[CATEGORY_FLAG[category]] === false || settings.proxyMode === "direct") return {};
  const proxy = settings.proxyMode === "auto"
    ? automaticProxy.get(category) ?? ""
    : normalizeProxyUrl(settings.proxyUrl);
  if (!proxy) return {};
  const { http, https } = agentsFor(proxy);
  if (!http && !https) return {};
  return { httpAgent: http, httpsAgent: https, proxy: false };
}

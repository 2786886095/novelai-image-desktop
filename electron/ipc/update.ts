import { app } from "electron";
import axios from "axios";
import type { UpdateInfo } from "../../src/types";
import { proxyConfig } from "./proxy";

const REPO = "2786886095/novelai-image-desktop";
const RELEASE_URL = `https://github.com/${REPO}/releases/latest`;
const LATEST_YAML_URL = `${RELEASE_URL}/download/latest.yml`;
const RELEASE_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Compare two dotted version strings. Returns 1 if a>b, -1 if a<b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(/[.+-]/).map((n) => parseInt(n, 10));
  const pb = b.replace(/^v/, "").split(/[.+-]/).map((n) => parseInt(n, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** Extract the updater version without pulling in a YAML parser for one field. */
export function parseLatestYamlVersion(payload: unknown): string {
  const text = Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload ?? "");
  const match = text.match(/^\s*version\s*:\s*["']?([^\s"']+)["']?\s*$/im);
  return match?.[1]?.replace(/^v/, "") ?? "";
}

async function latestVersionFromYaml(): Promise<string> {
  const res = await axios.get(LATEST_YAML_URL, {
    headers: {
      Accept: "text/yaml, text/plain, */*",
      "Cache-Control": "no-cache",
    },
    responseType: "text",
    timeout: 10_000,
    ...proxyConfig("update"),
  });
  const version = parseLatestYamlVersion(res.data);
  if (!version) throw new Error("latest.yml 中缺少 version 字段");
  return version;
}

async function latestVersionFromApi(): Promise<{ version: string; releaseUrl: string }> {
  const res = await axios.get(RELEASE_API_URL, {
    headers: { Accept: "application/vnd.github+json" },
    timeout: 10_000,
    ...proxyConfig("update"),
  });
  const version = String(res.data?.tag_name ?? "").replace(/^v/, "");
  if (!version) throw new Error("GitHub Release API 未返回版本号");
  return {
    version,
    releaseUrl: res.data?.html_url ?? RELEASE_URL,
  };
}

/**
 * Lightweight update notifier: queries the latest GitHub Release and compares
 * it to the running version. We deliberately do NOT auto-download/install —
 * the macOS build is unsigned and the Windows target is portable, neither of
 * which supports silent Squirrel updates. Instead the renderer surfaces a
 * banner linking to the release page for a manual download.
 */
export async function checkUpdate(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion();
  const sourceErrors: string[] = [];

  // GitHub's unauthenticated REST API is limited per public IP. That limit is
  // especially easy to hit behind a shared proxy, and older builds silently
  // treated the resulting HTTP 403 as "no update". latest.yml is a normal
  // release asset, carries the same version, and is not subject to that API
  // quota, so it is the reliable primary source.
  try {
    const latestVersion = await latestVersionFromYaml();
    return {
      hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
      currentVersion,
      latestVersion,
      releaseUrl: RELEASE_URL,
    };
  } catch (error: any) {
    sourceErrors.push(`latest.yml: ${error?.message ?? String(error)}`);
  }

  // Keep the API as a compatibility fallback for repositories/releases that
  // temporarily do not have a latest.yml asset yet.
  try {
    const latest = await latestVersionFromApi();
    return {
      hasUpdate: compareVersions(latest.version, currentVersion) > 0,
      currentVersion,
      latestVersion: latest.version,
      releaseUrl: latest.releaseUrl,
    };
  } catch (error: any) {
    sourceErrors.push(`GitHub API: ${error?.message ?? String(error)}`);
  }

  const detail = sourceErrors.join("; ");
  console.warn(`[update] all update sources failed: ${detail}`);
  return { hasUpdate: false, currentVersion, error: detail || "更新检查失败" };
}

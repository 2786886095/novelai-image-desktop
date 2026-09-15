import { app } from "electron";
import axios from "axios";
import type { UpdateInfo } from "../../src/types";
import { proxyConfig } from "./proxy";

export type UpdateSource = "github";

export function updateSourceOrder(_legacySource: string = "github"): UpdateSource[] { return ["github"]; }
const REPO = "2786886095/novelai-image-desktop";
export const GITHUB_RELEASE_URL = `https://github.com/${REPO}/releases/latest`;
export const GITHUB_LATEST_YAML_URL = `${GITHUB_RELEASE_URL}/download/latest.yml`;
export const GITHUB_RELEASE_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface RemoteReleaseAsset {
  id?: number;
  name: string;
  url: string;
  size?: number;
}

export interface RemoteRelease {
  source: "github";
  id?: number;
  version: string;
  pageUrl: string;
  assets: RemoteReleaseAsset[];
}

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

function normalizeAssets(input: unknown): RemoteReleaseAsset[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item: any) => {
    const name = String(item?.name ?? item?.filename ?? "").trim();
    const url = String(item?.browser_download_url ?? item?.download_url ?? item?.url ?? "").trim();
    if (!name || !url) return [];
    const size = Number(item?.size);
    const id = Number(item?.id);
    return [{
      name,
      url,
      ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
      ...(Number.isFinite(id) && id > 0 ? { id } : {}),
    }];
  });
}

export async function latestGithubRelease(): Promise<RemoteRelease> {
  const res = await axios.get(GITHUB_RELEASE_API_URL, {
    headers: { Accept: "application/vnd.github+json" },
    timeout: 10_000,
    ...proxyConfig("update"),
  });
  const version = String(res.data?.tag_name ?? "").replace(/^v/, "").trim();
  if (!version) throw new Error("GitHub Release API 未返回版本号");
  return {
    source: "github",
    version,
    pageUrl: String(res.data?.html_url ?? GITHUB_RELEASE_URL),
    assets: normalizeAssets(res.data?.assets),
  };
}

async function latestVersionFromGithubYaml(): Promise<string> {
  const res = await axios.get(GITHUB_LATEST_YAML_URL, {
    headers: { Accept: "text/yaml, text/plain, */*", "Cache-Control": "no-cache" },
    responseType: "text",
    timeout: 10_000,
    ...proxyConfig("update"),
  });
  const version = parseLatestYamlVersion(res.data);
  if (!version) throw new Error("latest.yml 中缺少 version 字段");
  return version;
}

async function checkGithubUpdate(currentVersion: string): Promise<UpdateInfo> {
  // Prefer the release manifest because it does not consume GitHub's low
  // unauthenticated API quota. Fall back to the API when the asset is blocked.
  try {
    const latestVersion = await latestVersionFromGithubYaml();
    return {
      hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
      currentVersion,
      latestVersion,
      releaseUrl: GITHUB_RELEASE_URL,
    };
  } catch (manifestError) {
    try {
      const latest = await latestGithubRelease();
      return {
        hasUpdate: compareVersions(latest.version, currentVersion) > 0,
        currentVersion,
        latestVersion: latest.version,
        releaseUrl: latest.pageUrl,
      };
    } catch (apiError: any) {
      const manifestMessage = manifestError instanceof Error
        ? manifestError.message
        : String(manifestError);
      const apiMessage = apiError?.message ?? String(apiError);
      throw new Error(`latest.yml: ${manifestMessage}; API: ${apiMessage}`);
    }
  }
}

/** Legacy source settings are accepted but only GitHub is contacted. */
export async function checkUpdate(_legacySource: string = "github"): Promise<UpdateInfo> {
 const currentVersion=app.getVersion();
 try {return await checkGithubUpdate(currentVersion);}
 catch(error) {return {hasUpdate:false,currentVersion,error:error instanceof Error?error.message:String(error)};}
}

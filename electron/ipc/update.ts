import { app } from "electron";
import axios from "axios";
import type { UpdateInfo } from "../../src/types";
import { proxyConfig } from "./proxy";

const REPO = "2786886095/novelai-image-desktop";
const GITEE_OWNER = "langbai666";
const GITEE_REPO = "novelai-image-desktop";

export const GITEE_RELEASE_URL = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/releases`;
export const GITEE_RELEASE_API_URL =
  `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/releases/latest`;
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
  source: "gitee" | "github";
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

/** Public Gitee release APIs work without embedding a user token in the app. */
export async function latestGiteeRelease(options: { includeAttachments?: boolean } = {}): Promise<RemoteRelease> {
  const res = await axios.get(GITEE_RELEASE_API_URL, {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    timeout: 10_000,
  });
  const version = String(res.data?.tag_name ?? "").replace(/^v/, "").trim();
  const id = Number(res.data?.id);
  if (!version || !Number.isFinite(id)) throw new Error("Gitee Release 未返回有效版本");

  let attachments: RemoteReleaseAsset[] = [];
  if (options.includeAttachments) {
    const attachRes = await axios.get(
      `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/releases/${id}/attach_files`,
      { headers: { Accept: "application/json" }, timeout: 10_000 },
    );
    attachments = normalizeAssets(attachRes.data);
  }

  const assets = [...normalizeAssets(res.data?.assets), ...attachments];
  const uniqueAssets = assets.filter(
    (asset, index) => assets.findIndex((candidate) => candidate.name === asset.name) === index,
  );
  return {
    source: "gitee",
    id,
    version,
    pageUrl: GITEE_RELEASE_URL,
    assets: uniqueAssets,
  };
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

/** Mainland-first update check with an automatic GitHub fallback. */
export async function checkUpdate(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion();
  const sourceErrors: string[] = [];
  let giteeResult: UpdateInfo | undefined;

  try {
    const latest = await latestGiteeRelease();
    giteeResult = {
      hasUpdate: compareVersions(latest.version, currentVersion) > 0,
      currentVersion,
      latestVersion: latest.version,
      releaseUrl: latest.pageUrl,
    };
    if (giteeResult.hasUpdate) return giteeResult;
  } catch (error: any) {
    sourceErrors.push(`Gitee: ${error?.message ?? String(error)}`);
  }

  // A normal release asset avoids GitHub's low unauthenticated API quota.
  try {
    const latestVersion = await latestVersionFromGithubYaml();
    const githubResult = {
      hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
      currentVersion,
      latestVersion,
      releaseUrl: GITHUB_RELEASE_URL,
    };
    return githubResult.hasUpdate || !giteeResult ? githubResult : giteeResult;
  } catch (error: any) {
    sourceErrors.push(`GitHub latest.yml: ${error?.message ?? String(error)}`);
  }

  if (giteeResult) return giteeResult;

  try {
    const latest = await latestGithubRelease();
    return {
      hasUpdate: compareVersions(latest.version, currentVersion) > 0,
      currentVersion,
      latestVersion: latest.version,
      releaseUrl: latest.pageUrl,
    };
  } catch (error: any) {
    sourceErrors.push(`GitHub API: ${error?.message ?? String(error)}`);
  }

  const detail = sourceErrors.join("; ");
  console.warn(`[update] all update sources failed: ${detail}`);
  return { hasUpdate: false, currentVersion, error: detail || "更新检查失败" };
}

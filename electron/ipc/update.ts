import { app } from "electron";
import axios from "axios";
import type { UpdateInfo } from "../../src/types";
import { proxyConfig } from "./proxy";

const REPO = "2786886095/novelai-image-desktop";

/** Compare two dotted version strings. Returns 1 if a>b, -1 if a<b, 0 if equal. */
function compareVersions(a: string, b: string): number {
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

/**
 * Lightweight update notifier: queries the latest GitHub Release and compares
 * it to the running version. We deliberately do NOT auto-download/install —
 * the macOS build is unsigned and the Windows target is portable, neither of
 * which supports silent Squirrel updates. Instead the renderer surfaces a
 * banner linking to the release page for a manual download.
 */
export async function checkUpdate(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion();
  try {
    const res = await axios.get(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      timeout: 10_000,
      ...proxyConfig("update"),
    });
    const tag: string = res.data?.tag_name ?? "";
    const latestVersion = tag.replace(/^v/, "");
    if (!latestVersion) return { hasUpdate: false, currentVersion };
    return {
      hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
      currentVersion,
      latestVersion,
      releaseUrl: res.data?.html_url ?? `https://github.com/${REPO}/releases/latest`,
    };
  } catch (error: any) {
    // 404 = no releases published yet; treat as "no update", not an error banner.
    if (error?.response?.status === 404) return { hasUpdate: false, currentVersion };
    return { hasUpdate: false, currentVersion, error: error?.message ?? "更新检查失败" };
  }
}

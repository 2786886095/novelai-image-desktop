const token = process.env.GITEE_TOKEN?.trim();
const owner = process.env.GITEE_OWNER?.trim() || "langbai666";
const repo = process.env.GITEE_REPO?.trim() || "novelai-image-desktop";
const keepTag = process.env.GITEE_KEEP_TAG?.trim() || process.argv[2]?.trim();
const api = `https://gitee.com/api/v5/repos/${owner}/${repo}`;

if (!token || !/^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(keepTag || "")) {
  throw new Error("GITEE_TOKEN and a valid GITEE_KEEP_TAG are required");
}

async function request(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...options.headers,
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok || response.status === 404) return response;
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Gitee API HTTP ${response.status}: ${detail}`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

async function listReleases() {
  const releases = [];
  for (let page = 1; ; page += 1) {
    const response = await request(`${api}/releases?page=${page}&per_page=100`);
    if (!response.ok) throw new Error(`Unable to list Gitee releases (${response.status})`);
    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  return releases;
}

let removed = 0;
let reclaimedBytes = 0;
for (const release of await listReleases()) {
  if (release?.tag_name === keepTag) continue;
  if (!Number.isFinite(Number(release?.id))) continue;
  // The release listing omits attach-file ids, so it cannot be used for
  // deletion. Query the dedicated endpoint to obtain immutable attachment ids
  // and sizes; generated source archives are not returned by this endpoint.
  const attachmentsResponse = await request(
    `${api}/releases/${Number(release.id)}/attach_files?page=1&per_page=100`,
  );
  if (!attachmentsResponse.ok) {
    throw new Error(`Unable to list Gitee release attachments for ${release.tag_name} (${attachmentsResponse.status})`);
  }
  const assets = await attachmentsResponse.json();
  if (!Array.isArray(assets)) continue;
  for (const asset of assets) {
    const assetId = Number(asset?.id);
    if (!Number.isFinite(assetId)) continue;
    const response = await request(
      `${api}/releases/${Number(release.id)}/attach_files/${assetId}`,
      { method: "DELETE" },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Unable to delete Gitee release attachment ${assetId} (${response.status})`);
    }
    removed += 1;
    reclaimedBytes += Number(asset?.size) || 0;
    console.log(`Removed old Gitee attachment: ${release.tag_name}/${asset.name}`);
  }
}

console.log(
  `Pruned ${removed} old Gitee attachment(s), reclaiming approximately ${(reclaimedBytes / 1024 / 1024).toFixed(1)} MiB; kept ${keepTag}.`,
);

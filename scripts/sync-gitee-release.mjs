import { Blob } from "node:buffer";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const token = process.env.GITEE_TOKEN?.trim();
const owner = process.env.GITEE_OWNER?.trim() || "langbai666";
const repo = process.env.GITEE_REPO?.trim() || "novelai-image-desktop";
const tag = (process.env.GITEE_RELEASE_TAG || process.argv[2] || "").trim();
const api = `https://gitee.com/api/v5/repos/${owner}/${repo}`;
if (!token || !/^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(tag)) {
  throw new Error("GITEE_TOKEN and a valid vX.Y.Z release tag are required");
}

function argumentsFor(name) {
  const values = [];
  for (let index = 3; index < process.argv.length; index += 1) {
    if (process.argv[index] === `--${name}` && process.argv[index + 1]) values.push(process.argv[++index]);
  }
  return values;
}

async function request(url, options = {}, attempts = 4, timeoutMs = 180_000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...options.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok || response.status === 404 || response.status === 409 || response.status === 422) {
        return response;
      }
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Gitee API HTTP ${response.status}: ${detail}`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1500));
    }
  }
  throw lastError;
}

async function releaseForTag() {
  const response = await request(`${api}/releases/tags/${encodeURIComponent(tag)}`, {}, 2);
  // Gitee currently answers `200 null` for a tag that has no release. Treat
  // that as missing instead of dereferencing `null.id` and failing after the
  // GitHub assets have already been published.
  if (response.ok) {
    const existingRelease = await response.json();
    if (existingRelease && Number.isFinite(Number(existingRelease.id))) return existingRelease;
  }
  if (!response.ok && response.status !== 404) throw new Error(`Unable to query Gitee release (${response.status})`);

  const body = new URLSearchParams({
    tag_name: tag,
    target_commitish: tag,
    name: `${repo} ${tag}`,
    body: `Langbai NovelAI Studio ${tag}\n\n中国大陆更新附件；源代码与完整发布资产同时保留在 GitHub。`,
    prerelease: "false",
  });
  const created = await request(`${api}/releases`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (created.ok) {
    const createdRelease = await created.json();
    if (createdRelease && Number.isFinite(Number(createdRelease.id))) return createdRelease;
  }

  // Desktop and Android workflows can race while creating the same release.
  const existing = await request(`${api}/releases/tags/${encodeURIComponent(tag)}`, {}, 4);
  if (!existing.ok) throw new Error(`Unable to create or recover Gitee release (${created.status})`);
  return existing.json();
}

const files = [];
for (const directoryArg of argumentsFor("dir")) {
  const directory = resolve(directoryArg);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile()) files.push(join(directory, entry.name));
  }
}
for (const fileArg of argumentsFor("file")) files.push(resolve(fileArg));
const uniqueFiles = [...new Set(files)];
if (uniqueFiles.length === 0) throw new Error("No Gitee release files were supplied");
for (const file of uniqueFiles) {
  if (!(await stat(file)).isFile()) throw new Error(`Not a file: ${file}`);
}

// The manifest is uploaded last so clients never observe it before all parts.
uniqueFiles.sort((left, right) => Number(basename(left) === "gitee-update.json") - Number(basename(right) === "gitee-update.json"));
const release = await releaseForTag();
const releaseId = Number(release.id);
if (!Number.isFinite(releaseId)) throw new Error("Gitee release did not return an id");

const attachmentsResponse = await request(`${api}/releases/${releaseId}/attach_files`);
const attachments = attachmentsResponse.ok ? await attachmentsResponse.json() : [];
for (const file of uniqueFiles) {
  const name = basename(file);
  for (const existing of Array.isArray(attachments) ? attachments.filter((item) => item?.name === name) : []) {
    const deleted = await request(`${api}/releases/${releaseId}/attach_files/${existing.id}`, { method: "DELETE" });
    if (!deleted.ok && deleted.status !== 404) throw new Error(`Unable to replace Gitee attachment ${name}`);
  }

  const bytes = await readFile(file);
  const form = new FormData();
  form.append("file", new Blob([bytes]), name);
  // Gitee's attachment ingress can be slow from GitHub-hosted runners. Allow
  // a long transfer window while retaining retries and post-upload checks.
  const uploaded = await request(
    `${api}/releases/${releaseId}/attach_files`,
    { method: "POST", body: form },
    3,
    900_000,
  );
  if (!uploaded.ok) {
    const detail = (await uploaded.text()).slice(0, 500);
    throw new Error(`Unable to upload ${name} to Gitee (${uploaded.status}): ${detail}`);
  }
  console.log(`Uploaded ${name} to Gitee ${tag}`);
}

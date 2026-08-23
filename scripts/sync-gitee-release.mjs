import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
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

async function attachmentsForRelease() {
  const response = await request(`${api}/releases/${releaseId}/attach_files`, {}, 3, 60_000);
  if (!response.ok) return [];
  const value = await response.json();
  return Array.isArray(value) ? value : [];
}

async function remoteAttachment(name) {
  const attachments = await attachmentsForRelease();
  return attachments.find((item) => item?.name === name);
}

async function waitForRemoteAttachment(name, attempts = 8) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const attachment = await remoteAttachment(name);
    if (attachment) return attachment;
    if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, 3_000));
  }
  return undefined;
}

async function uploadFile(releaseId, file, name, timeoutMs) {
  const boundary = `----langbai-gitee-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name.replaceAll('"', "_")}"\r\n` +
    "Content-Type: application/octet-stream\r\n\r\n",
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const fileSize = (await stat(file)).size;
  const url = new URL(`${api}/releases/${releaseId}/attach_files`);

  return await new Promise((resolveUpload, rejectUpload) => {
    const req = httpsRequest({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": prefix.length + fileSize + suffix.length,
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolveUpload({
        ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
        status: response.statusCode ?? 0,
        detail: Buffer.concat(chunks).toString("utf8").slice(0, 500),
      }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Gitee upload timed out after ${timeoutMs}ms`)));
    req.on("error", rejectUpload);
    req.write(prefix);
    const source = createReadStream(file);
    source.on("error", (error) => req.destroy(error));
    source.on("end", () => req.end(suffix));
    source.pipe(req, { end: false });
  });
}

for (const file of uniqueFiles) {
  const name = basename(file);
  // Release assets are immutable for a version. A previous CI retry may have
  // completed the upload even when Gitee never returned response headers. Do
  // not delete that valid attachment and start the same slow transfer again.
  if (await remoteAttachment(name)) {
    console.log(`Kept existing ${name} on Gitee ${tag}`);
    continue;
  }

  const localSize = (await stat(file)).size;
  let uploaded = false;
  let lastError;
  for (let attempt = 1; attempt <= 3 && !uploaded; attempt += 1) {
    try {
      // Gitee occasionally accepts the complete body but never returns HTTP
      // response headers to GitHub-hosted runners. Bound each transfer, then
      // verify the release attachment before deciding whether it failed.
      // Small desktop chunks should complete quickly. The directly installable
      // Android APK is larger and receives a longer, bounded transfer window.
      // Gitee commonly persists a complete upload but never closes the HTTP
      // response.  Waiting 3–30 minutes per file made a normal desktop release
      // take close to an hour.  Bound the silent-response window, then poll the
      // attachment list below before deciding whether a retry is necessary.
      const timeoutMs = localSize > 32 * 1024 * 1024 ? 240_000 : 45_000;
      const response = await uploadFile(releaseId, file, name, timeoutMs);
      if (response.ok) uploaded = true;
      else lastError = new Error(`Gitee upload HTTP ${response.status}: ${response.detail}`);
    } catch (error) {
      lastError = error;
    }

    if (!uploaded) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
      uploaded = Boolean(await waitForRemoteAttachment(name));
    }
    if (!uploaded && attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 2_000));
  }
  if (!uploaded) throw new Error(`Unable to upload ${name} to Gitee after remote verification`, { cause: lastError });
  console.log(`Uploaded ${name} to Gitee ${tag}`);
}

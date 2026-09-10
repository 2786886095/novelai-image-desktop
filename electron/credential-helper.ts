import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { CREDENTIAL_PREFIX } from "./ipc/credential-vault";

// One-shot local migration process. No windows, network, store writes or logs.
// Input contains ciphertext only; plaintext output uses an anonymous pipe.
// No secret is placed in argv, logs, or a plaintext file.
export function runCredentialHelper() {
  const profile = process.env.LANGBAI_CREDENTIAL_PROFILE ?? "";
  const root = path.resolve(app.getPath("temp"));
  if (path.dirname(path.resolve(profile)) !== root
    || !path.basename(profile).startsWith("langbai-credential-")
    || !fs.existsSync(path.join(profile, "Local State"))) { process.stdout.write(JSON.stringify({error:"profile path"}),()=>app.exit(2)); return; }
  app.setPath("userData", profile);
  app.disableHardwareAcceleration();
  const timeout = setTimeout(() => app.exit(124), 15_000);
  void app.whenReady().then(() => {
    const requestFile = path.join(profile, "request.json");
    if (fs.statSync(requestFile).size > 128 * 1024) throw new Error("invalid request");
    const input = fs.readFileSync(requestFile, "utf8");
    const request: unknown = JSON.parse(input);
    if (!Array.isArray(request) || request.length > 16) throw new Error("invalid request");
    const result = request.map((value: unknown) => {
      if (typeof value !== "string" || !value.startsWith(CREDENTIAL_PREFIX)) return null;
      try { return safeStorage.decryptString(Buffer.from(value.slice(CREDENTIAL_PREFIX.length), "base64")); }
      catch { return null; }
    });
    process.stdout.write(JSON.stringify(result), () => { clearTimeout(timeout); app.exit(0); });
  }).catch(() => { clearTimeout(timeout); app.exit(2); });
}

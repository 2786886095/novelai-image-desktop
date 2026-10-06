import { spawn } from "node:child_process";
import path from "node:path";

// Electron's writeImage re-encodes PNGs; a subsequent writeBuffer clears its
// bitmap formats. Publish both formats in one persistent Windows DataObject.
// PNG bytes travel over stdin, never in argv, temporary files, or error logs.
const WRITE_PNG_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())
  $stream = [IO.MemoryStream]::new($bytes)
  $image = [Drawing.Image]::FromStream($stream)
  try {
    $data = [Windows.Forms.DataObject]::new()
    $data.SetData('PNG', $false, $stream)
    $data.SetData([Windows.Forms.DataFormats]::Bitmap, $true, $image)
    [Windows.Forms.Clipboard]::SetDataObject($data, $true, 5, 100)
  } finally { $image.Dispose(); $stream.Dispose() }
  exit 0
} catch { exit 1 }
`;

/** Windows only. No new native dependency or renderer-controlled command. */
export function writeWindowsPngClipboard(bytes: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const child = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand",
      Buffer.from(WRITE_PNG_SCRIPT, "utf16le").toString("base64")], {
      windowsHide: true, stdio: ["pipe", "ignore", "ignore"],
    });
    const timeout = setTimeout(() => { child.kill(); reject(new Error("IMAGE_COPY_NATIVE_FAILED")); }, 10000);
    child.once("error", () => { clearTimeout(timeout); reject(new Error("IMAGE_COPY_NATIVE_FAILED")); });
    child.once("close", code => {
      clearTimeout(timeout);
      if (code === 0) resolve(); else reject(new Error("IMAGE_COPY_NATIVE_FAILED"));
    });
    child.stdin.on("error", () => { /* EPIPE is handled by the child exit. */ });
    child.stdin.end(bytes.toString("base64"));
  });
}

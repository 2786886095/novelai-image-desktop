import { spawn } from "node:child_process";
import path from "node:path";

// Electron's writeImage re-encodes PNGs; a subsequent writeBuffer clears its
// bitmap formats. Publish both formats in one persistent Windows DataObject.
// PNG bytes travel over stdin, never in argv, temporary files, or error logs.
const diagnosticEnabled = () => process.env.GITHUB_ACTIONS === 'true' && process.env.WIN_CLIPBOARD_DIAGNOSTIC === '1';
const diagnosticTrace = (record: Record<string, unknown>) => { if (diagnosticEnabled()) console.error('WIN_CLIPBOARD_DIAG:' + JSON.stringify(record)); };
const WRITE_PNG_SCRIPT = `
$ErrorActionPreference = 'Stop'
$diagnostic = $env:GITHUB_ACTIONS -eq 'true' -and $env:WIN_CLIPBOARD_DIAGNOSTIC -eq '1'
$clock = [Diagnostics.Stopwatch]::StartNew()
$stage = 'start'
function Trace-Stage([string]$value) { $script:stage = $value; if ($diagnostic) { [Console]::Error.WriteLine('WIN_CLIPBOARD_HELPER:' + (@{category='powershell';stage=$value;elapsedMs=$clock.ElapsedMilliseconds} | ConvertTo-Json -Compress)) } }
try {
  Trace-Stage 'forms-load'
  Add-Type -AssemblyName System.Windows.Forms
  Trace-Stage 'drawing-load'
  Add-Type -AssemblyName System.Drawing
  Trace-Stage 'stdin-decode'
  $bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())
  Trace-Stage 'stream-create'
  $stream = [IO.MemoryStream]::new($bytes)
  Trace-Stage 'image-decode'
  $image = [Drawing.Image]::FromStream($stream)
  try {
  Trace-Stage 'data-object'
    $data = [Windows.Forms.DataObject]::new()
  Trace-Stage 'set-png'
    $data.SetData('PNG', $false, $stream)
  Trace-Stage 'set-bitmap'
    $data.SetData([Windows.Forms.DataFormats]::Bitmap, $true, $image)
  Trace-Stage 'set-clipboard'
    [Windows.Forms.Clipboard]::SetDataObject($data, $true, 5, 100)
  } finally { $image.Dispose(); $stream.Dispose() }
  Trace-Stage 'complete'
  exit 0
} catch { if ($diagnostic) { [Console]::Error.WriteLine('WIN_CLIPBOARD_HELPER:' + (@{category='powershell-exception';stage=$stage;elapsedMs=$clock.ElapsedMilliseconds;exceptionType=$_.Exception.GetType().FullName;hresult=$_.Exception.HResult;innerExceptionType=$(if ($_.Exception.InnerException) {$_.Exception.InnerException.GetType().FullName} else {''});innerHresult=$(if ($_.Exception.InnerException) {$_.Exception.InnerException.HResult} else {0})} | ConvertTo-Json -Compress)) }; exit 1 }
`;

/** Windows only. No new native dependency or renderer-controlled command. */
export function writeWindowsPngClipboard(bytes: Buffer): Promise<void> {
  const started = Date.now();
  diagnosticTrace({category:'helper',stage:'spawn-begin',bytes:bytes.length});
  return new Promise((resolve, reject) => {
    const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const child = spawn(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand",
      Buffer.from(WRITE_PNG_SCRIPT, "utf16le").toString("base64")], {
      windowsHide: true, stdio: ["pipe", "ignore", diagnosticEnabled() ? "pipe" : "ignore"],
    });
    let diagnosticStderr = '';
    child.stderr?.on('data', (data: Buffer) => {
      diagnosticStderr = (diagnosticStderr + data.toString('utf8')).slice(-8192);
      let newline: number;
      while ((newline = diagnosticStderr.indexOf('\n')) >= 0) {
        const line = diagnosticStderr.slice(0,newline).trim(); diagnosticStderr = diagnosticStderr.slice(newline+1);
        if (!line.startsWith('WIN_CLIPBOARD_HELPER:')) continue;
        try { const input = JSON.parse(line.slice('WIN_CLIPBOARD_HELPER:'.length)) as Record<string,unknown>, record: Record<string,unknown> = {};
          for (const key of ['category','stage','exceptionType','innerExceptionType']) { const value = input[key]; if (typeof value === 'string' && /^[a-zA-Z0-9_.+-]{0,160}$/.test(value)) record[key] = value; }
          for (const key of ['elapsedMs','hresult','innerHresult']) if (typeof input[key] === 'number') record[key] = input[key];
          diagnosticTrace(record);
        } catch { diagnosticTrace({category:'helper',stage:'diagnostic-parse-failed'}); }
      }
    });
    const timeout = setTimeout(() => { diagnosticTrace({category:'helper',stage:'timeout',elapsedMs:Date.now()-started}); child.kill(); reject(new Error("IMAGE_COPY_NATIVE_FAILED")); }, 10000);
    child.once("error", (error: NodeJS.ErrnoException) => { diagnosticTrace({category:"child-error",stage:"error",code:/^[A-Z0-9_]+$/.test(error.code??"")?error.code:"other",elapsedMs:Date.now()-started}); clearTimeout(timeout); reject(new Error("IMAGE_COPY_NATIVE_FAILED")); });
    child.once("close", code => {
      diagnosticTrace({category:"helper",stage:"close",code,elapsedMs:Date.now()-started});
      clearTimeout(timeout);
      if (code === 0) resolve(); else reject(new Error("IMAGE_COPY_NATIVE_FAILED"));
    });
    child.stdin!.on("error", () => { /* EPIPE is handled by the child exit. */ });
    child.stdin!.end(bytes.toString("base64"));
  });
}

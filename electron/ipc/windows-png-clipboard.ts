import { spawn } from "node:child_process";
import path from "node:path";
export interface CopyImageMetadataDiagnostic {
  phase: 'source-read'|'image-validate'|'png-prepare'|'native-process'|'native-load'|'native-decode'|'native-data'|'native-publish-cleanup'|'png-readback'|'bitmap-readback';
  errorCode: 'SOURCE_IO_FAILED'|'SOURCE_LENGTH_CHANGED'|'IMAGE_DECODE_FAILED'|'PNG_PREPARE_FAILED'|'NATIVE_SPAWN_FAILED'|'NATIVE_TIMEOUT'|'NATIVE_EXIT_FAILED'|'NATIVE_SCRIPT_FAILED'|'NATIVE_DIAGNOSTIC_INVALID'|'PNG_READBACK_MISMATCH'|'BITMAP_EMPTY'|'READBACK_FAILED';
  hresult?: '0x800401D0'|'0x80070005'|'0x8007000E'|'0x80004005'|'0x80131500'|'0x80131604';
}

const NATIVE_PHASES = new Set(['native-load','native-decode','native-data','native-publish-cleanup']);
const HRESULTS = new Set(['0x800401D0','0x80070005','0x8007000E','0x80004005','0x80131500','0x80131604']);
function scriptDiagnostic(bytes: Buffer, overflow: boolean): CopyImageMetadataDiagnostic {
 const match=!overflow&&/^IMAGE_COPY_DIAG_V1\|(native-[a-z-]+)\|(0x[0-9A-F]{8})\r?\n?$/.exec(bytes.toString('utf8'));
 if(!match||!NATIVE_PHASES.has(match[1]))return {phase:'native-process',errorCode:bytes.length||overflow?'NATIVE_DIAGNOSTIC_INVALID':'NATIVE_EXIT_FAILED'};
 return {phase:match[1] as CopyImageMetadataDiagnostic['phase'],errorCode:'NATIVE_SCRIPT_FAILED',...(HRESULTS.has(match[2])?{hresult:match[2] as CopyImageMetadataDiagnostic['hresult']}:{})};
}
const WRITE_PNG_SCRIPT = `
$ErrorActionPreference = 'Stop'
$phase = 'native-load'
try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $phase = 'native-decode'
  $bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())
  $stream = [IO.MemoryStream]::new($bytes)
  $image = [Drawing.Image]::FromStream($stream)
  try {
    $phase = 'native-data'
    $data = [Windows.Forms.DataObject]::new()
    $data.SetData('PNG', $false, $stream)
    $data.SetData([Windows.Forms.DataFormats]::Bitmap, $true, $image)
    $phase = 'native-publish-cleanup'
    [Windows.Forms.Clipboard]::SetDataObject($data, $true, 5, 100)
  } finally { $image.Dispose(); $stream.Dispose() }
  exit 0
} catch {
  if ($diagnostics) {
    $exception = $_.Exception
    if ($exception.InnerException) { $exception = $exception.InnerException }
    [Console]::Error.WriteLine('IMAGE_COPY_DIAG_V1|' + $phase + '|0x' + $exception.HResult.ToString('X8'))
  }
  exit 1
}
`;
/** Default callers retain status-only behavior and ignored output. Diagnostics
 * are opt-in main-process CI observations, never a retry or copy-success signal. */
export function writeWindowsPngClipboard(bytes: Buffer, diagnostics = false): Promise<void> {
 return new Promise((resolve,reject)=>{
  const executable=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const child=spawn(executable,['-NoLogo','-NoProfile','-NonInteractive','-STA','-EncodedCommand',Buffer.from(`$diagnostics = $${diagnostics?'true':'false'}\n`+WRITE_PNG_SCRIPT,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','ignore',diagnostics?'pipe':'ignore']});
  let observed=Buffer.alloc(0),overflow=false;
  if(diagnostics)child.stderr?.on('data',chunk=>{const next=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);if(overflow)return;if(observed.length+next.length>256){overflow=true;observed=Buffer.alloc(0);}else observed=Buffer.concat([observed,next]);});
  const fail=(diagnostic:CopyImageMetadataDiagnostic)=>reject(Object.assign(new Error('IMAGE_COPY_NATIVE_FAILED'),diagnostics?{diagnostic}:{}));
  const timeout=setTimeout(()=>{child.kill();fail({phase:'native-process',errorCode:'NATIVE_TIMEOUT'});},10000);
  child.once('error',()=>{clearTimeout(timeout);fail({phase:'native-process',errorCode:'NATIVE_SPAWN_FAILED'});});
  child.once('close',code=>{clearTimeout(timeout);if(code===0)resolve();else fail(scriptDiagnostic(observed,overflow));});
  // Fixed spawn stdio always pipes stdin; no renderer-supplied option exists.
  const input=child.stdin!;input.on('error',()=>{});input.end(bytes.toString('base64'));
 });
}

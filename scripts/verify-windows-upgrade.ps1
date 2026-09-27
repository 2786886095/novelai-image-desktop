$ErrorActionPreference = 'Stop'
# This changes installer registration, so it is intentionally restricted to disposable CI.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') {
  throw 'Actual installation verification must run on a disposable GitHub Windows runner.'
}
$existing = @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'Langbai NovelAI Studio' })
if ($existing.Count -gt 0) { throw 'Runner already has Studio installed; refusing to touch it.' }
$profile = Join-Path $env:APPDATA 'novelai-image-desktop'
if (Test-Path -LiteralPath $profile) { throw 'Runner has a real/default Studio profile; use a clean runner.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$setup = (Resolve-Path "release/Langbai-NovelAI-Studio-Setup-$version.exe").Path
$out = Join-Path (Get-Location) 'release/upgrade-smoke'
New-Item -ItemType Directory -Path $out -Force | Out-Null
$target = Join-Path $env:RUNNER_TEMP ('studio-install-' + [guid]::NewGuid().ToString() + '\Langbai NovelAI Studio')
function Run-Installer([string]$File, [string[]]$Arguments, [int]$TimeoutSeconds=240) {
  Write-Host "INSTALL_BEGIN $File $($Arguments -join ' ')"
  $started=Get-Date
  $p = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru -WindowStyle Hidden
  while (-not $p.WaitForExit(30000)) {
    $elapsed=[int]((Get-Date)-$started).TotalSeconds
    $files=@(Get-ChildItem -LiteralPath $target -Recurse -File -ErrorAction SilentlyContinue).Count
    $p.Refresh()
    $snapshot=@{file=$File;elapsed=$elapsed;pid=$p.Id;cpu=$p.CPU;window=$p.MainWindowTitle;installedFiles=$files}
    $snapshot | ConvertTo-Json -Compress | Tee-Object -FilePath (Join-Path $out 'install-progress.jsonl') -Append | Out-Host
    if ($elapsed -ge $TimeoutSeconds) {
      & taskkill /PID $p.Id /T /F | Out-Null
      throw "Owned test installer timed out after ${elapsed}s: $File"
    }
  }
  if ($p.ExitCode -ne 0) { throw "Installer failed: $($p.ExitCode)" }
  Write-Host "INSTALL_END exit=0 seconds=$([int]((Get-Date)-$started).TotalSeconds)"
}
function Verify-Installed {
  $reference = (Resolve-Path 'release/win-unpacked').Path
  $count=0
  Get-ChildItem -LiteralPath $reference -Recurse -File | ForEach-Object {
    $relative = [IO.Path]::GetRelativePath($reference,$_.FullName)
    $actual=Join-Path $target $relative
    if (-not (Test-Path -LiteralPath $actual) -or (Get-FileHash -LiteralPath $actual).Hash -ne (Get-FileHash -LiteralPath $_.FullName).Hash) { throw "Installed file mismatch: $relative" }
    $count++
  }
  if (Test-Path -LiteralPath (Join-Path $target 'resources/harness-seed')) { throw 'Old bundled runtime was not removed by upgrade.' }
  $env:ELECTRON_RUN_AS_NODE='1'
  try {
    & (Join-Path $target 'Langbai NovelAI Studio.exe') (Resolve-Path 'scripts/packaged-runtime-probe.cjs').Path (Join-Path $target 'resources/app.asar') | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Installed native runtime probe failed' }
  } finally { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
  return $count
}
& gh release download v2.4.0 --repo 2786886095/novelai-image-desktop --pattern Langbai-NovelAI-Studio-Setup-2.4.0.exe --dir $out
if ($LASTEXITCODE -ne 0) { throw 'Could not obtain the actual previous installer' }
Run-Installer (Join-Path $out 'Langbai-NovelAI-Studio-Setup-2.4.0.exe') @('/S','--no-desktop-shortcut',"/D=$target") 600
$legacyManifest=Join-Path $target 'resources/harness-seed/manifest.json'
$legacyHash=(Get-FileHash -LiteralPath $legacyManifest).Hash
$customSeedFile=Join-Path $target 'resources/harness-seed/custom-preservation.txt'
Set-Content -LiteralPath $customSeedFile -Value 'custom resource retained'
$sentinel = Join-Path $profile 'TavernAgent/user-home/user-preservation.txt'
New-Item -ItemType Directory -Path (Split-Path $sentinel) -Force | Out-Null
Set-Content -LiteralPath $sentinel -Value 'user-owned upgrade sentinel'
$before=(Get-FileHash -LiteralPath $sentinel).Hash
Run-Installer $setup @('/S','--updated','--no-desktop-shortcut',"/D=$target")
$upgradeFiles=Verify-Installed
$backupRoot=Join-Path (Split-Path $target -Parent) '.langbai-installer-backups'
$receipts=@(Get-ChildItem -LiteralPath $backupRoot -Recurse -Filter 'preserved-runtime.json' -File)
if ($receipts.Count -ne 1) { throw 'Expected exactly one legacy runtime recovery receipt' }
$receipt=Get-Content -LiteralPath $receipts[0].FullName -Raw | ConvertFrom-Json
if ((Get-FileHash -LiteralPath (Join-Path $receipt.destination 'manifest.json')).Hash -ne $legacyHash) { throw 'Legacy runtime manifest changed' }
if ((Get-Content -LiteralPath (Join-Path $receipt.destination 'custom-preservation.txt') -Raw).Trim() -ne 'custom resource retained') { throw 'Unknown legacy resource lost' }

if ((Get-FileHash -LiteralPath $sentinel).Hash -ne $before) { throw 'User data changed during upgrade' }
$uninstall=Get-ChildItem -LiteralPath $target -Filter '*Uninstall*.exe' | Select-Object -First 1
if (-not $uninstall) { throw 'No test uninstaller found' }
# Execute the actual installed uninstaller outside its target with _?=, just as
# NSIS upgrade does; otherwise its self-copy launcher can return before removal.
$uninstallerCopy=Join-Path $out 'verified-installed-uninstaller.exe'
Copy-Item -LiteralPath $uninstall.FullName -Destination $uninstallerCopy
Run-Installer $uninstallerCopy @('/S',"_?=$target")
Run-Installer $setup @('/S','--no-desktop-shortcut',"/D=$target")
$cleanFiles=Verify-Installed
if ((Get-FileHash -LiteralPath $sentinel).Hash -ne $before) { throw 'Reinstallation removed user data' }
@{pass=$true;version=$version;previous='2.4.0';upgradeFiles=$upgradeFiles;cleanFiles=$cleanFiles;userDataPreserved=$true;legacyRuntimePreserved=$true;installerSha256=(Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash} | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $out 'verification.json')
Write-Output 'WINDOWS_ACTUAL_INSTALL_AND_UPGRADE_OK'

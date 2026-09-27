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
function Run-Installer([string]$File, [string[]]$Arguments) {
  $p = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru -WindowStyle Hidden
  if (-not $p.WaitForExit(240000)) {
    & taskkill /PID $p.Id /T /F | Out-Null
    throw 'Owned test installer exceeded four minutes.'
  }
  if ($p.ExitCode -ne 0) { throw "Installer failed: $($p.ExitCode)" }
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
Run-Installer (Join-Path $out 'Langbai-NovelAI-Studio-Setup-2.4.0.exe') @('/S','--no-desktop-shortcut',"/D=$target")
$sentinel = Join-Path $profile 'TavernAgent/user-home/user-preservation.txt'
New-Item -ItemType Directory -Path (Split-Path $sentinel) -Force | Out-Null
Set-Content -LiteralPath $sentinel -Value 'user-owned upgrade sentinel'
$before=(Get-FileHash -LiteralPath $sentinel).Hash
Run-Installer $setup @('/S','--updated','--no-desktop-shortcut',"/D=$target")
$upgradeFiles=Verify-Installed
if ((Get-FileHash -LiteralPath $sentinel).Hash -ne $before) { throw 'User data changed during upgrade' }
$uninstall=Get-ChildItem -LiteralPath $target -Filter '*Uninstall*.exe' | Select-Object -First 1
if (-not $uninstall) { throw 'No test uninstaller found' }
Run-Installer $uninstall.FullName @('/S')
Run-Installer $setup @('/S','--no-desktop-shortcut',"/D=$target")
$cleanFiles=Verify-Installed
if ((Get-FileHash -LiteralPath $sentinel).Hash -ne $before) { throw 'Reinstallation removed user data' }
@{pass=$true;version=$version;previous='2.4.0';upgradeFiles=$upgradeFiles;cleanFiles=$cleanFiles;userDataPreserved=$true;installerSha256=(Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash} | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $out 'verification.json')
Write-Output 'WINDOWS_ACTUAL_INSTALL_AND_UPGRADE_OK'

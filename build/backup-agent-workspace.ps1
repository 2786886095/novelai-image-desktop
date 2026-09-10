# Loaded by protect-update-data.ps1. Copies only; the old uninstaller may run
# only after the source AND the external copy match this receipt byte for byte.
function Get-WorkspaceFileHash([string]$File) {
  $stream=[IO.File]::OpenRead($File); $sha=[Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
  finally { $stream.Dispose(); $sha.Dispose() }
}
function Get-WorkspaceInventory([string]$Root) {
  if (-not (Get-CanonicalPath $Root).Equals([IO.Path]::GetFullPath($Root).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Workspace directory links require manual review.' }
  $files = [Collections.Generic.List[object]]::new()
  $directories = [Collections.Generic.List[string]]::new()
  $pending = [Collections.Generic.Stack[string]]::new(); $pending.Push($Root)
  while ($pending.Count) {
    foreach ($entry in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
      if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Workspace contains a link; original data has been kept.' }
      $relative = $entry.FullName.Substring($Root.Length + 1).Replace('\','/')
      if ($entry.PSIsContainer) { $directories.Add($relative); $pending.Push($entry.FullName) }
      else { $files.Add([pscustomobject]@{path=$relative;size=$entry.Length;sha256=(Get-WorkspaceFileHash $entry.FullName)}) }
    }
  }
  return @{files=@($files | Sort-Object path);directories=@($directories | Sort-Object)}
}
function Test-SameWorkspace($A, $B) {
  if (@($A.files).Count -ne @($B.files).Count -or @($A.directories).Count -ne @($B.directories).Count) { return $false }
  $lookup=@{}; foreach ($f in $A.files) { $lookup[$f.path]=[string]$f.size+':'+$f.sha256 }
  foreach ($f in $B.files) { if (-not $lookup.ContainsKey($f.path) -or $lookup[$f.path] -cne ([string]$f.size+':'+$f.sha256)) { return $false } }
  $dirs=@{}; foreach ($d in $A.directories) { $dirs[$d]=$true }; foreach ($d in $B.directories) { if (-not $dirs.ContainsKey($d)) { return $false } }; return $true
}
function Backup-AgentWorkspace([string]$Source, [string]$AppDataDir, [string]$ExecutableName) {
  # The old app can still be exiting after launching a silent updater.
  $running=$false
  for ($attempt=0; $attempt -lt 20; $attempt++) {
    $running=$false
    foreach ($process in Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($ExecutableName)) -ErrorAction SilentlyContinue) {
      if (-not $process.Path -or (Test-Within $InstallDir $process.Path)) { $running=$true }
    }
    if (-not $running) { break }; Start-Sleep -Milliseconds 500
  }
  if ($running) { throw 'Close the previous application before migrating its workspace, then retry.' }
  $userData=Join-Path $AppDataDir 'novelai-image-desktop'
  if (Test-InstallData $userData) { throw 'Application data must be outside the installation directory.' }
  $root=Join-Path $userData 'workspace-migrations'
  [IO.Directory]::CreateDirectory($root) | Out-Null
  if (-not (Get-CanonicalPath $root).Equals([IO.Path]::GetFullPath($root),[StringComparison]::OrdinalIgnoreCase)) { throw 'Workspace backup directory must not be a link.' }
  $inventory=Get-WorkspaceInventory $Source
  foreach ($directory in Get-ChildItem -LiteralPath $root -Directory -Force) {
    $record=Join-Path $directory.FullName 'receipt.json'
    if (-not (Test-Path -LiteralPath $record)) { continue }
    $receipt=Get-Content -LiteralPath $record -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($receipt.version -eq 1 -and $receipt.sourcePath -eq $Source -and (Test-SameWorkspace $receipt $inventory)) {
      $original=Join-Path $directory.FullName 'original'
      if (Test-SameWorkspace $receipt (Get-WorkspaceInventory $original)) {
        Write-Output ('WORKSPACE_BACKUP_VERIFIED: '+$original); return
      }
    }
  }
  $id=[guid]::NewGuid().ToString(); $base=Join-Path $root $id; $original=Join-Path $base 'original'
  [IO.Directory]::CreateDirectory($original) | Out-Null
  foreach ($directory in $inventory.directories) { [IO.Directory]::CreateDirectory((Join-Path $original $directory)) | Out-Null }
  foreach ($file in $inventory.files) {
    $destination=Join-Path $original $file.path
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    [IO.File]::Copy((Join-Path $Source $file.path),$destination,$false)
  }
  if (-not (Test-SameWorkspace $inventory (Get-WorkspaceInventory $original)) -or -not (Test-SameWorkspace $inventory (Get-WorkspaceInventory $Source))) {
    throw 'Workspace changed or backup verification failed; the previous installation has not been removed.'
  }
  $receipt=[ordered]@{version=1;id=$id;sourcePath=$Source;createdAt=[DateTime]::UtcNow.ToString('o');files=@($inventory.files);directories=@($inventory.directories)}
  $pending=Join-Path $base 'receipt.json.tmp'
  [IO.File]::WriteAllText($pending,($receipt | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  [IO.File]::Move($pending,(Join-Path $base 'receipt.json'))
  Write-Output ('WORKSPACE_BACKUP_VERIFIED: '+$original)
}

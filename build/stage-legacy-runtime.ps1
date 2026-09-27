param(
  [Parameter(Mandatory=$true)][ValidateSet('Stage','Restore','Commit')][string]$Operation,
  [Parameter(Mandatory=$true)][string]$Ledger,
  [string]$InstallDir
)
$ErrorActionPreference='Stop'
# Move the OLD bundled runtime as ONE directory before the legacy NSIS uninstaller
# tries to move 27,000 nested files through MAX_PATH-limited Rename instructions.
# Same-volume rename only. Never traverse/delete the contents or touch user-home.
function Assert-PlainAncestors([string]$Path) {
  $p=[IO.Path]::GetFullPath($Path)
  while ($p) {
    if (Test-Path -LiteralPath $p) {
      if (((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Linked installer path retained: $p" }
    }
    $parent=[IO.Path]::GetDirectoryName($p)
    if ($parent -eq $p) { break }; $p=$parent
  }
}
try {
  $entries=@()
  if (Test-Path -LiteralPath $Ledger) { $entries=@(Get-Content -LiteralPath $Ledger -Raw -Encoding UTF8 | ConvertFrom-Json) }
  if ($Operation -eq 'Stage') {
    if (-not [IO.Path]::IsPathRooted($InstallDir)) { throw 'Absolute installation path required' }
    $install=[IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
    $source=Join-Path $install 'resources\harness-seed'
    if (-not (Test-Path -LiteralPath $source)) { Write-Output 'LEGACY_RUNTIME_NOT_PRESENT'; exit 0 }
    Assert-PlainAncestors $source
    $manifest=Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.format -ne 1 -or $manifest.platform -ne 'win32' -or -not $manifest.files -or -not $manifest.cli) { throw 'Unrecognized legacy runtime retained; no changes made' }
    $backupRoot=Join-Path (Split-Path $install -Parent) '.langbai-installer-backups'
    Assert-PlainAncestors $backupRoot
    $destination=Join-Path (Join-Path $backupRoot ([guid]::NewGuid().ToString())) 'harness-seed'
    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
    $entry=[pscustomobject]@{source=$source;destination=$destination}
    $entries += $entry
    # Write recovery location BEFORE moving anything. Existing receipt entries retained.
    ConvertTo-Json -InputObject @($entries) | Set-Content -LiteralPath $Ledger -Encoding UTF8
    [IO.Directory]::Move($source,$destination)
    Write-Output "LEGACY_RUNTIME_STAGED: $destination"
  } elseif ($Operation -eq 'Restore') {
    foreach ($entry in $entries) {
      Assert-PlainAncestors $entry.source; Assert-PlainAncestors $entry.destination
      if (Test-Path -LiteralPath $entry.destination) {
        if (Test-Path -LiteralPath $entry.source) { throw "Original path exists; preserved backup retained: $($entry.destination)" }
        New-Item -ItemType Directory -Path (Split-Path $entry.source) -Force | Out-Null
        [IO.Directory]::Move($entry.destination,$entry.source)
      }
    }
    Write-Output 'LEGACY_RUNTIME_RESTORED'
  } else {
    foreach ($entry in $entries) {
      if (Test-Path -LiteralPath $entry.destination) {
        # Keep the old bytes (including unknown/custom files) for manual recovery.
        # Moving is not duplication. No recursive deletion of historical resources.
        ConvertTo-Json -InputObject $entry | Set-Content -LiteralPath (Join-Path (Split-Path $entry.destination) 'preserved-runtime.json') -Encoding UTF8
      }
    }
    Write-Output 'LEGACY_RUNTIME_PRESERVED_OUTSIDE_INSTALLATION'
  }
  exit 0
} catch { Write-Output ('LEGACY_RUNTIME_MIGRATION_FAILED: '+$_.Exception.Message); exit 22 }

param(
  [Parameter(Mandatory=$true)][string]$InstallDir,
  [string]$AppDataDir = [Environment]::GetFolderPath('ApplicationData'),
  [switch]$MigrateWorkspace,
  [string]$ExecutableName = 'Langbai NovelAI Studio.exe'
)
$ErrorActionPreference = 'Stop'
# Read-only by default. The installer explicitly enables verified workspace backup.
# Neither mode removes or modifies any existing user file.
$canonicalPaths = @{}
$historyDirectories = @{}
function Get-CanonicalPath([string]$Value, [int]$Depth = 0) {
  if ($Depth -gt 128) { throw 'Directory link nesting is too deep.' }
  if (-not [IO.Path]::IsPathRooted($Value)) { throw 'A saved data path is not absolute.' }
  $full = [IO.Path]::GetFullPath($Value).TrimEnd('\')
  if ($full -match '^[A-Za-z]:$') { $full += '\' }
  if ($canonicalPaths.ContainsKey($full)) { return $canonicalPaths[$full] }
  if (Test-Path -LiteralPath $full) {
    $item = Get-Item -LiteralPath $full -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      $target = @($item.Target)[0]
      if (-not $target) { throw "Directory link could not be resolved: $full" }
      if (-not [IO.Path]::IsPathRooted($target)) { $target = Join-Path (Split-Path $full -Parent) $target }
      $resolved = Get-CanonicalPath $target ($Depth + 1)
      $canonicalPaths[$full] = $resolved
      return $resolved
    }
  }
  $parent = [IO.Path]::GetDirectoryName($full)
  $resolved = $full
  if ($parent -and $parent -ne $full) {
    $resolved = Join-Path (Get-CanonicalPath $parent ($Depth + 1)) ([IO.Path]::GetFileName($full))
  }
  $canonicalPaths[$full] = $resolved
  return $resolved
}
function Test-Within([string]$Root, [string]$Candidate) {
  $rootPath = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  $target = [IO.Path]::GetFullPath($Candidate).TrimEnd('\')
  return $target.Equals($rootPath, [StringComparison]::OrdinalIgnoreCase) -or $target.StartsWith($rootPath + '\', [StringComparison]::OrdinalIgnoreCase)
}
function Test-InstallData([string]$Value) {
  if (-not [IO.Path]::IsPathRooted($Value)) { throw 'A saved data path is not absolute.' }
  return (Test-Within $InstallDir $Value) -or (Test-Within (Get-CanonicalPath $InstallDir) (Get-CanonicalPath $Value))
}
function Test-HistoryData([string]$Value) {
  if (-not [IO.Path]::IsPathRooted($Value)) { throw 'A history file path is not absolute.' }
  $full = [IO.Path]::GetFullPath($Value)
  $parent = [IO.Path]::GetDirectoryName($full)
  if (-not $parent) { return $false }
  if (-not $historyDirectories.ContainsKey($parent)) {
    # Enumerate once per directory, not stat + resolve every history image.
    # Keep file-link attributes so an external symlink into the install tree
    # still blocks the update. Enumeration failures deliberately fail closed.
    $files = @{}
    if (Test-Path -LiteralPath $parent -PathType Container) {
      foreach ($item in ([IO.DirectoryInfo]::new($parent)).EnumerateFileSystemInfos()) {
        $files[$item.Name] = $item.Attributes
      }
    }
    $historyDirectories[$parent] = @{ Files = $files; AtRisk = (Test-InstallData $parent) }
  }
  $directory = $historyDirectories[$parent]
  $name = [IO.Path]::GetFileName($full)
  if (-not $directory.Files.ContainsKey($name)) { return $false }
  if ($directory.AtRisk) { return $true }
  if (($directory.Files[$name] -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    return Test-InstallData $full
  }
  return $false
}
function Stop-IfDataAtRisk {
  if ($risks.Count -gt 0) {
    Write-Output ('UPDATE_DATA_AT_RISK: ' + (($risks | Sort-Object) -join '; '))
    exit 20
  }
}
try {
  $risks = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  # A known data directory alone is sufficient to stop. Do not spend the
  # installer timeout scanning thousands of unrelated history entries first.
  foreach ($name in @('outputs', 'LangbaiWorkspace')) {
    $legacy = Join-Path $InstallDir $name
    if ((Test-Path -LiteralPath $legacy) -and @(Get-ChildItem -LiteralPath $legacy -Force | Select-Object -First 1).Count -gt 0) {
      if ($name -ne 'LangbaiWorkspace' -or -not $MigrateWorkspace) { [void]$risks.Add($legacy) }
    }
  }
  Stop-IfDataAtRisk
  $storeName = 'novelai-image-desktop.json'
  $stable = Join-Path (Join-Path $AppDataDir 'novelai-image-desktop') $storeName
  $stores = @()
  if (Test-Path -LiteralPath $stable) { $stores = @($stable) }
  elseif (Test-Path -LiteralPath ($stable + '.bak')) { $stores = @($stable + '.bak') }
  elseif (Test-Path -LiteralPath ($stable + '.bak2')) { $stores = @($stable + '.bak2') }
  else {
    foreach ($name in @('Langbai NovelAI Studio', 'langbai-novelai-studio', 'NovelAI Studio')) {
      $candidate = Join-Path (Join-Path $AppDataDir $name) $storeName
      if (Test-Path -LiteralPath $candidate) { $stores += $candidate }
    }
  }
  foreach ($store in $stores) {
    $data = Get-Content -LiteralPath $store -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $data.settings) { throw "Settings could not be verified: $store" }
    foreach ($key in @('outputDir','onlineGalleryDownloadDir','backupDir','logDir')) {
      $value = $data.settings.$key
      if ($null -ne $value -and $value -isnot [string]) { throw "A saved directory setting is invalid: $key" }
      if ($value -is [string] -and $value.Trim() -and (Test-InstallData $value)) { [void]$risks.Add($value) }
    }
    foreach ($value in $data.settings.protectedOutputPaths) {
      if ($value -is [string] -and (Test-Path -LiteralPath $value) -and (Test-InstallData $value)) { [void]$risks.Add($value) }
    }
    Stop-IfDataAtRisk
    foreach ($entry in $data.history) {
      $value = $entry.filePath
      if ($value -is [string] -and $value.Trim() -and (Test-HistoryData $value)) {
        [void]$risks.Add([IO.Path]::GetDirectoryName($value))
        Stop-IfDataAtRisk
      }
    }
  }
  Stop-IfDataAtRisk
  $workspace=Join-Path $InstallDir 'LangbaiWorkspace'
  if ($MigrateWorkspace -and (Test-Path -LiteralPath $workspace) -and @(Get-ChildItem -LiteralPath $workspace -Force | Select-Object -First 1).Count -gt 0) {
    . (Join-Path $PSScriptRoot 'backup-agent-workspace.ps1')
    Backup-AgentWorkspace $workspace $AppDataDir $ExecutableName
  }
  Write-Output 'UPDATE_DATA_CHECK_OK'
  exit 0
} catch {
  Write-Output ('UPDATE_DATA_CHECK_FAILED: ' + $_.Exception.Message)
  exit 21
}

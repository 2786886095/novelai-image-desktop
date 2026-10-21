param(
  [Parameter(Mandatory=$true)][string]$InstallDir,
  [string]$AppDataDir = [Environment]::GetFolderPath('ApplicationData'),
  [switch]$MigrateWorkspace,
  [switch]$ComfyOnly,
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
function Add-ComfyPath($Value) {
  if ($null -eq $Value -or $Value -eq '') { return }
  if ($Value -isnot [string] -or $Value -match '[\x00\r\n]' -or $Value -notmatch '^[A-Za-z]:[\\/]') { throw 'Invalid ComfyUI data path.' }
  if (Test-InstallData $Value) { [void]$risks.Add($Value) }
}
function Read-ComfyEnvelope([string]$File) {
  $present = $false
  foreach ($candidate in @($File, ($File + '.bak'))) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    $present = $true
    try {
      $item = Get-Item -LiteralPath $candidate -Force
      if ($item.PSIsContainer -or $item.Length -gt 67108864 -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'Unsafe ComfyUI store.' }
      $envelope = Get-Content -LiteralPath $candidate -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($envelope.version -ne 1 -or -not $envelope.PSObject.Properties['data'] -or $null -eq $envelope.data) { throw 'Invalid ComfyUI envelope.' }
      return ,$envelope.data
    } catch { }
  }
  if ($present) { throw "Cannot verify ComfyUI store: $File" }
  return $null
}
function Inspect-ComfyData {
  $queue = New-Object 'System.Collections.Generic.Queue[object]'
  if (Test-Path -LiteralPath $InstallDir -PathType Container) { $queue.Enqueue(@{Path=$InstallDir;Depth=0}) }
  $examined = 0
  while ($queue.Count -gt 0) {
    $next = $queue.Dequeue(); $directory = $next.Path
    if (((Test-Path -LiteralPath (Join-Path $directory 'main.py') -PathType Leaf) -and (Test-Path -LiteralPath (Join-Path $directory 'comfy') -PathType Container)) -or (Test-Path -LiteralPath (Join-Path $directory 'python_embeded\python.exe') -PathType Leaf)) { [void]$risks.Add($directory) }
    if ($next.Depth -ge 2) { continue }
    foreach ($item in ([IO.DirectoryInfo]::new($directory)).EnumerateFileSystemInfos()) {
      $examined++; if ($examined -gt 4096) { throw 'ComfyUI install-tree inspection exceeded safety limit.' }
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { [void]$risks.Add($item.FullName); continue }
      if (($item.Attributes -band [IO.FileAttributes]::Directory) -ne 0) { $queue.Enqueue(@{Path=$item.FullName;Depth=($next.Depth+1)}) }
    }
  }
  foreach ($profileName in @('novelai-image-desktop', 'Langbai NovelAI Studio', 'langbai-novelai-studio', 'NovelAI Studio')) {
    $comfy = Join-Path (Join-Path $AppDataDir $profileName) 'comfyui-local'
    if (-not (Test-Path -LiteralPath $comfy)) { continue }
    if (((Get-Item -LiteralPath $comfy -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'ComfyUI store is a link.' }
    Add-ComfyPath $comfy
    $config = Read-ComfyEnvelope (Join-Path $comfy 'settings.json')
    if ($null -ne $config) {
      if ($config -isnot [pscustomobject] -or ($null -ne $config.install -and $config.install -isnot [pscustomobject])) { throw 'Invalid ComfyUI settings.' }
      foreach ($key in @('root','cwd','python','mainPy')) { Add-ComfyPath $config.install.$key }
      Add-ComfyPath $config.outputDirectory
    }
    $registry = Read-ComfyEnvelope (Join-Path $comfy 'environments.json')
    if ($null -ne $registry) {
      if ($registry -isnot [pscustomobject] -or $registry.environments -isnot [array]) { throw 'Invalid ComfyUI registry.' }
      Add-ComfyPath $registry.selectedRoot
      foreach ($environment in $registry.environments) { if ($environment -isnot [pscustomobject]) { throw 'Invalid ComfyUI environment.' }; foreach ($key in @('root','python','launcherPath','modelDirectory')) { Add-ComfyPath $environment.$key } }
    }
    $results = Read-ComfyEnvelope (Join-Path $comfy 'results.json')
    if ($null -ne $results -and $results -isnot [array]) { throw 'Invalid ComfyUI results.' }
    foreach ($result in $results) { if ($result -isnot [pscustomobject]) { throw 'Invalid ComfyUI result.' }; Add-ComfyPath $result.filePath }
  }
}
try {
  $risks = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  Inspect-ComfyData
  Stop-IfDataAtRisk
  if ($ComfyOnly) { Write-Output 'UPDATE_DATA_CHECK_OK'; exit 0 }
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

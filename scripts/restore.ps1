param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [switch]$SkipPreBackup
)

$ErrorActionPreference = "Stop"

function Resolve-Root {
  param([string]$PathValue)
  return (Resolve-Path $PathValue).Path
}

function Assert-InProjectPath {
  param([string]$RootPath, [string]$TargetPath)
  $resolvedTarget = (Resolve-Path -Path $TargetPath -ErrorAction SilentlyContinue)
  if ($resolvedTarget) {
    $candidate = $resolvedTarget.Path
  } else {
    $candidate = [System.IO.Path]::GetFullPath($TargetPath)
  }
  if (-not $candidate.StartsWith($RootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "refuse to restore outside project root: $candidate"
  }
}

$Root = Resolve-Root $Root
$ArchivePath = (Resolve-Path $ArchivePath).Path
$dataFile = Join-Path $Root "data\hazards.json"
$uploadDir = Join-Path $Root "server\uploads"

Assert-InProjectPath -RootPath $Root -TargetPath $dataFile
Assert-InProjectPath -RootPath $Root -TargetPath $uploadDir

if (-not $SkipPreBackup) {
  & (Join-Path $PSScriptRoot "backup.ps1") -Root $Root | Write-Output
}

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("strong-workflow-restore-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
  Expand-Archive -Path $ArchivePath -DestinationPath $tempDir -Force
  $restoreDataFile = Join-Path $tempDir "data\hazards.json"
  $restoreUploadDir = Join-Path $tempDir "server\uploads"

  if (-not (Test-Path $restoreDataFile)) {
    throw "backup archive is missing data\hazards.json"
  }

  New-Item -ItemType Directory -Path (Split-Path $dataFile -Parent) -Force | Out-Null
  Copy-Item -LiteralPath $restoreDataFile -Destination $dataFile -Force

  if (Test-Path $restoreUploadDir) {
    if (Test-Path $uploadDir) {
      Remove-Item -LiteralPath $uploadDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path (Split-Path $uploadDir -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $restoreUploadDir -Destination $uploadDir -Recurse -Force
  }

  Write-Output "restore completed: $ArchivePath"
} finally {
  if (Test-Path $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force
  }
}

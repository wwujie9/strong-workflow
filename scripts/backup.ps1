param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

function Resolve-InProjectPath {
  param([string]$PathValue)
  $resolved = (Resolve-Path $PathValue).Path
  $rootResolved = (Resolve-Path $Root).Path
  if (-not $resolved.StartsWith($rootResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "path is outside project root: $resolved"
  }
  return $resolved
}

$Root = Resolve-InProjectPath $Root
if (-not $OutputDir) {
  $OutputDir = Join-Path $Root "backups"
}
if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stageDir = Join-Path $OutputDir "strong-workflow-$stamp"
$archivePath = Join-Path $OutputDir "strong-workflow-$stamp.zip"

New-Item -ItemType Directory -Path $stageDir | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir "data") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageDir "server") | Out-Null

$dataFile = Join-Path $Root "data\hazards.json"
$notificationFile = Join-Path $Root "data\notifications.json"
$projectConfigFile = Join-Path $Root "data\project-config.json"
$uploadDir = Join-Path $Root "server\uploads"

if (Test-Path $dataFile) {
  Copy-Item -LiteralPath $dataFile -Destination (Join-Path $stageDir "data\hazards.json") -Force
}
if (Test-Path $notificationFile) {
  Copy-Item -LiteralPath $notificationFile -Destination (Join-Path $stageDir "data\notifications.json") -Force
}
if (Test-Path $projectConfigFile) {
  Copy-Item -LiteralPath $projectConfigFile -Destination (Join-Path $stageDir "data\project-config.json") -Force
}
if (Test-Path $uploadDir) {
  Copy-Item -LiteralPath $uploadDir -Destination (Join-Path $stageDir "server\uploads") -Recurse -Force
}

$manifest = [ordered]@{
  project = "strong-workflow"
  createdAt = (Get-Date).ToString("s")
  root = $Root
  dataFile = $dataFile
  notificationFile = $notificationFile
  projectConfigFile = $projectConfigFile
  uploadDir = $uploadDir
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $stageDir "manifest.json") -Encoding utf8

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $archivePath -Force
Remove-Item -LiteralPath $stageDir -Recurse -Force

Write-Output "backup completed: $archivePath"

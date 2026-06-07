param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$Branch = "v2/rapid-iteration",
  [string]$Remote = "origin",
  [switch]$SkipBackup,
  [switch]$SkipDocker,
  [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Output "[update] $Message"
}

function Invoke-Checked {
  param([scriptblock]$Command, [string]$Message)
  Write-Step $Message
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "command failed: $Message"
  }
}

$Root = (Resolve-Path $Root).Path
Set-Location $Root

if (-not (Test-Path (Join-Path $Root "package.json"))) {
  throw "package.json not found under $Root"
}

if (-not $AllowDirty) {
  $dirty = git status --porcelain
  if ($dirty) {
    throw "working tree has local changes. Commit/stash them or rerun with -AllowDirty."
  }
}

if (-not $SkipBackup) {
  Write-Step "creating runtime backup"
  & (Join-Path $PSScriptRoot "backup.ps1") -Root $Root | Write-Output
}

Invoke-Checked { git fetch $Remote $Branch } "fetching $Remote/$Branch"
Invoke-Checked { git checkout $Branch } "switching to $Branch"
Invoke-Checked { git pull --ff-only $Remote $Branch } "pulling latest code"
Invoke-Checked { npm ci } "installing dependencies"
Invoke-Checked { npm run build } "building frontend"

if (-not $SkipDocker) {
  Write-Step "rebuilding and starting Docker service"
  & (Join-Path $PSScriptRoot "docker-up.ps1") -Build | Write-Output
  Write-Step "checking Docker health"
  & (Join-Path $PSScriptRoot "docker-health.ps1") | Write-Output
}

Write-Step "completed"

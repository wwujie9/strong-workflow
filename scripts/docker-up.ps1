param(
  [switch]$Build,
  [switch]$Pull
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

if (-not (Test-Path ".env.docker")) {
  Copy-Item -LiteralPath ".env.docker.example" -Destination ".env.docker"
  Write-Output "created .env.docker from .env.docker.example"
}

if (-not (Test-Path "server\uploads")) {
  New-Item -ItemType Directory -Path "server\uploads" | Out-Null
}

$env:DOCKER_BUILDKIT = "0"
$argsList = @("compose", "up", "-d")
if ($Build) {
  $argsList += "--build"
}
if ($Pull) {
  $argsList += "--pull"
  $argsList += "always"
}

docker @argsList
docker compose ps
Write-Output "strong-workflow is starting at http://127.0.0.1:5174"

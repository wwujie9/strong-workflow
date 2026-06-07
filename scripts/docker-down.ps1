param(
  [switch]$RemoveVolumes
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

if ($RemoveVolumes) {
  docker compose down --volumes
} else {
  docker compose down
}

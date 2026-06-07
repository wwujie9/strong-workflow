param(
  [string]$Url = "http://127.0.0.1:5174/api/health"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

docker compose ps
Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 10 | ConvertTo-Json -Depth 8 | Write-Output

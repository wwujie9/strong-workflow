param(
  [string]$Url = "http://127.0.0.1:5174/api/health",
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

try {
  $health = Invoke-RestMethod -Uri $Url -Method Get -TimeoutSec 8
} catch {
  Write-Error "health check failed, cannot access: $Url"
  exit 1
}

$issues = New-Object System.Collections.Generic.List[string]

if (-not $health.ok) {
  $issues.Add("API did not return ok=true")
}
if (-not (Test-Path $health.dataFile)) {
  $issues.Add("data file is missing: $($health.dataFile)")
}
if (-not (Test-Path $health.uploadDir)) {
  $issues.Add("upload directory is missing: $($health.uploadDir)")
}
if (-not $health.publicBaseUrl) {
  $issues.Add("PUBLIC_BASE_URL is not configured")
}
if (-not $health.wecomConfigured -and -not $health.dingtalkConfigured) {
  $issues.Add("robot webhook is not configured; current mode is dry-run")
}

$result = [ordered]@{
  ok = $issues.Count -eq 0
  checkedAt = (Get-Date).ToString("s")
  url = $Url
  host = $health.host
  port = $health.port
  publicBaseUrl = $health.publicBaseUrl
  dataFile = $health.dataFile
  uploadDir = $health.uploadDir
  httpsEnabled = $health.httpsEnabled
  reminderJobEnabled = $health.reminderJobEnabled
  robotConfigured = [bool]($health.wecomConfigured -or $health.dingtalkConfigured)
  issues = $issues
}

$result | ConvertTo-Json -Depth 6 | Write-Output

if ($issues.Count -gt 0) {
  exit 2
}

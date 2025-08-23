Param(
  [Parameter(Mandatory=$false)][string]$DeployHookUrl,
  [Parameter(Mandatory=$false)][string]$HealthUrl,
  [int]$TimeoutSec = 420,
  [int]$IntervalSec = 6
)

# Fallback to env var if not passed
if (-not $DeployHookUrl) { $DeployHookUrl = $env:RENDER_DEPLOY_HOOK_URL }

if (-not $DeployHookUrl) {
  Write-Error "Missing DeployHookUrl. Set -DeployHookUrl or $env:RENDER_DEPLOY_HOOK_URL. Find it in Render: Service → Settings → Deploy Hooks"
  exit 1
}

Write-Host "Triggering Render deploy via Deploy Hook..." -ForegroundColor Cyan
try {
  $resp = Invoke-RestMethod -Method POST -Uri $DeployHookUrl -ErrorAction Stop
  # Deploy hook usually returns 204 No Content; ignore $resp
  Write-Host "Deploy triggered." -ForegroundColor Green
}
catch {
  Write-Error ("Failed to trigger deploy: {0}" -f $_)
  exit 1
}

if ($HealthUrl) {
  Write-Host ("Waiting for healthy service at {0}" -f $HealthUrl) -ForegroundColor Cyan
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $lastStatus = ""
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $HealthUrl -Method GET -TimeoutSec 10 -UseBasicParsing
      if ($r.StatusCode -eq 200) {
        Write-Host "Health OK (200)" -ForegroundColor Green
        exit 0
      }
      $lastStatus = $r.StatusCode
    }
    catch {
      $lastStatus = $_.Exception.Message
    }
    Start-Sleep -Seconds $IntervalSec
  }
  Write-Error ("Health check timed out after {0}s. Last status: {1}" -f $TimeoutSec, $lastStatus)
  exit 2
}

Write-Host "Deploy triggered. No health polling requested." -ForegroundColor Yellow
exit 0

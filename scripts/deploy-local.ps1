Param(
    [switch]$DryRun,
    [string]$Environment = "production",
    [string]$ServiceName = "Resume-Matcher",
    [string]$ProjectId = "d230e3a7-2d35-4a99-9a59-7b43d5b9c1cf",
    [string]$Team
)

$ErrorActionPreference = 'Stop'

function Exec($cmd) {
    if ($DryRun) {
        Write-Host "[DRYRUN] $cmd" -ForegroundColor Yellow
    } else {
        Write-Host "[EXEC] $cmd" -ForegroundColor Cyan
        iex $cmd
    }
}

Write-Host "== Resume-Matcher: Local Railway Deploy ==" -ForegroundColor Green

# 1) Tooling checks
try {
    $nodeVersion = node -v
    $npmVersion = npm -v
    Write-Host "Node: $nodeVersion | npm: $npmVersion"
} catch {
    Write-Error "Node.js and npm are required. Install from https://nodejs.org and re-run."
    exit 1
}

try {
    $railwayVersion = railway --version
    Write-Host "Railway CLI: $railwayVersion"
} catch {
    Write-Host "Railway CLI not found; installing globally via npm..." -ForegroundColor Yellow
    Exec "npm i -g @railway/cli"
}

# Refresh version after potential install
try { $railwayVersion = railway --version; Write-Host "Railway CLI: $railwayVersion" } catch {}

# 2) Auth check (token-based; no browser prompts)
if (-not $env:RAILWAY_TOKEN) {
    Write-Error "RAILWAY_TOKEN is not set in your session. In PowerShell: `$env:RAILWAY_TOKEN = 'PERSONAL_ACCOUNT_TOKEN'"
    exit 1
}

Write-Host "RAILWAY_TOKEN present (value not shown)."
# Diagnostics: length and whitespace
$tokLen = ($env:RAILWAY_TOKEN | Measure-Object -Character).Characters
Write-Host ("Token length: {0}" -f $tokLen)
if ($env:RAILWAY_TOKEN -match "\s") { Write-Host "Warning: token contains whitespace; trimming." -ForegroundColor Yellow; $env:RAILWAY_TOKEN = $env:RAILWAY_TOKEN.Trim() }

# Hint CLI to use env token
$env:RAILWAY_API_TOKEN = $env:RAILWAY_TOKEN
$env:CI = 'true'

# whoami should pass with a Personal/Account token
$whoamiOk = $true
try {
    Exec "railway whoami"
} catch {
    $whoamiOk = $false
}
if (-not $whoamiOk) {
    Write-Host "railway whoami failed; starting browserless login..." -ForegroundColor Yellow
    try {
        Exec "railway login --browserless"
        Read-Host "After approving the login in your browser, press ENTER to continue"
        Exec "railway whoami"
        $whoamiOk = $true
    } catch {
        Write-Host "Trying npx fallback..." -ForegroundColor Yellow
        try {
            Exec "npx -y @railway/cli whoami"
            $whoamiOk = $true
        } catch {
            $whoamiOk = $false
        }
    }
}
if (-not $whoamiOk) {
    Write-Error "Railway auth failed. Ensure RAILWAY_TOKEN is a Personal (account) token and try a new shell after setting it persistently."
    exit 1
}

# 2.5) Ensure directory is linked to the correct project (non-interactive)
$linked = $true
try {
    Exec "railway status --json | Out-Null"
} catch {
    $linked = $false
}
if (-not $linked) {
    Write-Host "Linking directory to project $ProjectId (env=$Environment, service=$ServiceName)" -ForegroundColor Yellow
    try {
        if ($Team) {
            Exec "railway link -p `"$ProjectId`" -e `"$Environment`" -s `"$ServiceName`" -t `"$Team`""
        } else {
            Exec "railway link -p `"$ProjectId`" -e `"$Environment`" -s `"$ServiceName`""
        }
    } catch {
        Write-Error "Failed to link to project '$ProjectId'. Verify the Project ID and your token permissions."
        exit 1
    }
}

# 3) Prepare variables from session (if provided)
$databaseUrl = $env:DATABASE_URL
$openAiKey   = $env:OPENAI_API_KEY

# 4) Ensure service exists (idempotent)
try {
    Exec "railway add --service `"$ServiceName`""
} catch {
    Write-Host "Service '$ServiceName' may already exist; continuing." -ForegroundColor Yellow
}

# 5) Sync variables (skip deploy triggers)
if ($databaseUrl) {
    Exec "railway variables -e `"$Environment`" -s `"$ServiceName`" --set `"DATABASE_URL=$databaseUrl`" --skip-deploys"
} else {
    Write-Host "DATABASE_URL not set in env; skipping." -ForegroundColor Yellow
}
if ($openAiKey) {
    Exec "railway variables -e `"$Environment`" -s `"$ServiceName`" --set `"OPENAI_API_KEY=$openAiKey`" --skip-deploys"
} else {
    Write-Host "OPENAI_API_KEY not set in env; skipping." -ForegroundColor Yellow
}

# 6) Deploy snapshot (Dockerfile + railway.toml)
$deployCmd = "railway up --detach --ci -e `"$Environment`" -s `"$ServiceName`""
$redeployCmd = "railway redeploy -e `"$Environment`" -s `"$ServiceName`""

$deployOk = $true
try {
    Exec $deployCmd
} catch {
    $deployOk = $false
}
if (-not $deployOk) {
    Write-Host "'railway up' failed; trying redeploy..." -ForegroundColor Yellow
    Exec $redeployCmd
}

# 7) Fetch domain and check health
try {
    $domainJson = & railway domain -s "$ServiceName" --json 2>$null
    if ($domainJson) {
        $domain = (ConvertFrom-Json $domainJson).domain
        if ($domain) {
            $healthUrl = "https://$domain/healthz"
            Write-Host "Service domain: https://$domain" -ForegroundColor Green
            Write-Host "Checking health: $healthUrl"
            if (-not $DryRun) {
                try {
                    $resp = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 20
                    Write-Host "/healthz status: $($resp.StatusCode)" -ForegroundColor Green
                } catch {
                    Write-Host "Health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
                }
            } else {
                Write-Host "[DRYRUN] Would GET $healthUrl" -ForegroundColor Yellow
            }
        }
    }
} catch {
    Write-Host "Could not resolve domain or run health check (non-fatal)." -ForegroundColor Yellow
}

# 8) Tail last logs
try {
    Exec "railway logs -e `"$Environment`" -s `"$ServiceName`""
} catch {
    Write-Host "Could not fetch logs (non-fatal)." -ForegroundColor Yellow
}

Write-Host "== Done ==" -ForegroundColor Green

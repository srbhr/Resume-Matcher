Param(
    [string]$ProjectRoot = "c:\Users\david\Documents\GitHub\Resume-Matcher"
)

# Navigate to backend folder
Set-Location "$ProjectRoot\apps\backend"

# Activate local Python environment if available
$activatePath = Join-Path $ProjectRoot 'env\Scripts\Activate.ps1'
if (Test-Path $activatePath) {
    . $activatePath
}

# Helper to read values from .env (handles quotes and ampersands safely)
function Get-DotEnvValue {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)][string]$Key
    )
    if (-not (Test-Path $Path)) { return $null }
    $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^$Key=" }
    if (-not $line) { return $null }
    $raw = $line.Substring($line.IndexOf('=') + 1).Trim()
    # Trim optional surrounding quotes
    if ($raw.StartsWith('"') -and $raw.EndsWith('"')) {
        $raw = $raw.Trim('"')
    }
    return $raw
}

$dotenvPath = ".env"
$syncUrl  = Get-DotEnvValue -Path $dotenvPath -Key 'SYNC_DATABASE_URL'
$asyncUrl = Get-DotEnvValue -Path $dotenvPath -Key 'ASYNC_DATABASE_URL'

if ($syncUrl)  { $env:SYNC_DATABASE_URL  = $syncUrl }
if ($asyncUrl) { $env:ASYNC_DATABASE_URL = $asyncUrl }

$env:PYTHONUNBUFFERED = '1'

# Run only metrics tests
python -m pytest -q -k metrics --maxfail=1

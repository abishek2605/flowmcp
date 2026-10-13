param([ValidateSet('Login', 'Gateway', 'Tunnel')][string]$Mode = 'Gateway')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
switch ($Mode) {
    'Login' { & node scripts/login.mjs }
    'Gateway' {
        $config = Join-Path $env:LOCALAPPDATA 'FlowMCP\gateway.env'
        if (-not (Test-Path $config)) { throw 'Run node scripts/configure-windows.mjs first.' }
        & node "--env-file=$config" src/main.mjs
    }
    'Tunnel' {
        if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) { throw 'Install and authenticate ngrok using its dashboard instructions.' }
        $domainFile = Join-Path $env:LOCALAPPDATA 'FlowMCP\tunnel-domain.txt'
        if (-not (Test-Path $domainFile)) { throw 'Run node scripts/configure-windows.mjs first.' }
        $domain = (Get-Content $domainFile -Raw).Trim()
        & ngrok http 3000 "--url=$domain"
    }
}
if ($LASTEXITCODE -ne 0) { throw "Process exited with code $LASTEXITCODE." }

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
foreach ($program in @('node', 'npm.cmd', 'git')) {
    if (-not (Get-Command $program -ErrorAction SilentlyContinue)) {
        throw "Install $program before continuing. Node.js 22+ and Git for Windows are required."
    }
}
$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) { throw 'Node.js 22 or later is required.' }
function Invoke-Checked([scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE. Read the output above." }
}
Invoke-Checked { npm.cmd ci }
$backend = Join-Path $env:LOCALAPPDATA 'FlowMCP\backend'
$expected = '06ceeab230da519a7686a12c6c9711eae20ea165'
if (-not (Test-Path $backend)) {
    New-Item -ItemType Directory -Force (Split-Path $backend -Parent) | Out-Null
    Invoke-Checked { git clone https://github.com/GTAI-1/flow-mcp.git $backend }
    Invoke-Checked { git -C $backend checkout --detach $expected }
}
$actual = & git -C $backend rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actual -ne $expected) { throw 'Backend version differs; inspect it before making changes.' }
Invoke-Checked { npm.cmd ci --prefix $backend }
Invoke-Checked { npm.cmd run build --prefix $backend }
Invoke-Checked { npm.cmd test }
Write-Host 'Installed. Follow WINDOWS.md for interactive Google login, OAuth, and HTTPS setup.'

[CmdletBinding()]
param([string]$Root)
$ErrorActionPreference = 'Stop'
if (-not $Root) {
    $taskCanonical = Join-Path 'C:\AI\Projects' ('.codex-fuel-guard-' + (Split-Path $env:USERPROFILE -Leaf))
    if (Test-Path (Join-Path $taskCanonical 'install-manifest.json')) { $Root = $taskCanonical }
    else { $Root = Join-Path $env:LOCALAPPDATA 'CodexFuelGuard' }
}
& node.exe (Join-Path $Root 'app/src/cli.mjs') uninstall
if ($LASTEXITCODE -ne 0) { throw 'Fuel Guard uninstall failed' }

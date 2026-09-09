[CmdletBinding()]
param([string]$Root)
$ErrorActionPreference = 'Stop'
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
if (-not $Root) {
    $taskCanonical = Join-Path 'C:\AI\Projects' ('.codex-fuel-guard-' + (Split-Path $env:USERPROFILE -Leaf))
    if (Test-Path (Join-Path $taskCanonical 'install-manifest.json')) { $Root = $taskCanonical }
    else { $Root = Join-Path $env:LOCALAPPDATA 'CodexFuelGuard' }
}
& $taskNode (Join-Path $PSScriptRoot 'src/cli.mjs') install --root $Root
if ($LASTEXITCODE -ne 0) { throw 'Fuel Guard installation failed' }
& $taskNode (Join-Path $Root 'app/src/cli.mjs') start
if ($LASTEXITCODE -ne 0) { throw 'Installed, but daemon failed to start. Run fuel-guard doctor.' }

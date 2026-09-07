[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
& $taskNode (Join-Path $PSScriptRoot 'src/cli.mjs') install
if ($LASTEXITCODE -ne 0) { throw 'Fuel Guard installation failed' }
& $taskNode (Join-Path $PSScriptRoot 'src/cli.mjs') start
if ($LASTEXITCODE -ne 0) { throw 'Installed, but daemon failed to start. Run fuel-guard doctor.' }

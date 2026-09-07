[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
& node.exe (Join-Path $PSScriptRoot 'src/cli.mjs') uninstall
if ($LASTEXITCODE -ne 0) { throw 'Fuel Guard uninstall failed' }

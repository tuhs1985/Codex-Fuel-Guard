param([string]$Root='C:\AI\Projects\.codex-fuel-guard-rober')
$ErrorActionPreference='Stop'
# Deliberately no start/attach: this proves startup rather than repairing it.
$taskStatus=& node.exe (Join-Path $Root 'app/src/cli.mjs') status
if($LASTEXITCODE -ne 0){throw 'Startup verification failed: daemon not reachable. Do not start it manually until diagnostics are saved.'}
$taskParsed=$taskStatus|ConvertFrom-Json
$taskProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskParsed.pid)"
[pscustomobject]@{boot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime;processStart=$taskProcess.CreationDate;commandLine=$taskProcess.CommandLine;status=$taskParsed} | ConvertTo-Json -Depth 8

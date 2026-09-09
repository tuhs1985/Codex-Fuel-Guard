param([string]$Label='ordinary',[string]$Root='C:\AI\Projects\.codex-fuel-guard-rober')
$ErrorActionPreference='Stop'
if($Label -eq 'ordinary'){
 if($env:CODEX_THREAD_ID -or ([Security.Principal.WindowsIdentity]::GetCurrent().Name -match 'codexsandbox')){throw 'Run ordinary probe outside Codex.'}
 New-Item -ItemType Directory -Force -Path $Root | Out-Null
 $taskMarker=Join-Path $Root 'visibility-probe.txt'
 if(-not(Test-Path -LiteralPath $taskMarker)){[IO.File]::WriteAllText($taskMarker,[guid]::NewGuid().ToString())}
}
$taskMarker=Join-Path $Root 'visibility-probe.txt'
[pscustomobject]@{label=$Label;root=$Root;identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name;fileId=(& fsutil.exe file queryfileid $taskMarker | Out-String).Trim();sha256=(Get-FileHash -LiteralPath $taskMarker).Hash} | ConvertTo-Json

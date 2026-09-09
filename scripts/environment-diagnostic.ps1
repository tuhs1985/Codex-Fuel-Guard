param([string]$Label='task')
$ErrorActionPreference='Continue'
$taskRoot=Join-Path $env:LOCALAPPDATA 'CodexFuelGuard'
$taskFiles=@('ipc-token','config.json','bin/fuel-guard.cmd','app/src/cli.mjs') | ForEach-Object {
 $p=Join-Path $taskRoot $_
 $item=Get-Item -LiteralPath $p -ErrorAction SilentlyContinue
 [pscustomobject]@{relativePath=$_;exists=($null -ne $item);length=$item.Length;sha256=if($item){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}else{$null};fileId=if($item){(& fsutil.exe file queryfileid $p 2>&1 | Out-String).Trim()}else{$null}}
}
$taskResult=[pscustomobject]@{
 label=$Label;time=[DateTime]::UtcNow.ToString('o');identity=(& whoami.exe /user | Out-String).Trim()
 env=@{USERPROFILE=$env:USERPROFILE;LOCALAPPDATA=$env:LOCALAPPDATA;APPDATA=$env:APPDATA;CODEX_HOME=$env:CODEX_HOME;FUEL_GUARD_HOME=$env:FUEL_GUARD_HOME;CODEX_THREAD_ID=$env:CODEX_THREAD_ID}
 root=$taskRoot;files=$taskFiles
 config=if(Test-Path (Join-Path $taskRoot 'config.json')){Get-Content (Join-Path $taskRoot 'config.json') -Raw | ConvertFrom-Json}else{$null}
}
$taskResult | ConvertTo-Json -Depth 6 | Tee-Object -FilePath (Join-Path $PSScriptRoot "../.local/environment-$Label.json")

$ErrorActionPreference = 'Stop'
$taskProject = 'C:\Project\Conan Board Game Foundry Edition'
function Get-TaskInventory {
    @(Get-ChildItem -LiteralPath $taskProject -Recurse -Force -File | Sort-Object FullName | ForEach-Object { '{0}|{1}|{2}' -f $_.FullName,$_.Length,$_.LastWriteTimeUtc.Ticks })
}
$taskBefore = Get-TaskInventory
$taskConfigHash = (Get-FileHash -LiteralPath C:/Users/rober/.codex/config.toml).Hash
& node.exe (Join-Path $PSScriptRoot '../src/cli.mjs') stop
& (Join-Path $PSScriptRoot '../install.ps1') | Out-Null
$taskFirst = & node.exe (Join-Path $PSScriptRoot '../src/cli.mjs') status | ConvertFrom-Json
& (Join-Path $PSScriptRoot '../install.ps1') | Out-Null
& cscript.exe //NoLogo (Join-Path $env:APPDATA 'Microsoft/Windows/Start Menu/Programs/Startup/CodexFuelGuard.vbs')
$taskSecond = & node.exe (Join-Path $PSScriptRoot '../src/cli.mjs') status | ConvertFrom-Json
$taskAfter = Get-TaskInventory
$taskDifference = @(Compare-Object $taskBefore $taskAfter)
$taskUserPath = [Environment]::GetEnvironmentVariable('Path','User')
$taskResult = [PSCustomObject]@{
    timestampUtc=[DateTime]::UtcNow.ToString('o')
    unrelatedProject=$taskProject
    fileCount=$taskBefore.Count
    changedFileMetadataCount=$taskDifference.Count
    daemonPidUnchangedAcrossSecondInstall=($taskFirst.pid -eq $taskSecond.pid)
    userPathEntryCount=@($taskUserPath.Split(';') | Where-Object { $_ -eq (Join-Path $env:LOCALAPPDATA 'CodexFuelGuard/bin') }).Count
    codexConfigUnchanged=($taskConfigHash -eq (Get-FileHash -LiteralPath C:/Users/rober/.codex/config.toml).Hash)
}
$taskResult | ConvertTo-Json | Tee-Object -FilePath (Join-Path $PSScriptRoot '../.local/install-verification.json')
if ($taskDifference.Count -or -not $taskResult.daemonPidUnchangedAcrossSecondInstall -or -not $taskResult.codexConfigUnchanged -or $taskResult.userPathEntryCount -ne 1) { throw 'Installation verification failed' }

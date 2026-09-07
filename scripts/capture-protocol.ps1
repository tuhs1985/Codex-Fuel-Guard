$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskGenerated = Join-Path $taskRoot 'protocol/generated'
& codex app-server generate-json-schema --experimental --out $taskGenerated
if ($LASTEXITCODE -ne 0) { throw 'Schema generation failed' }
$taskTarget = Join-Path $taskRoot 'protocol/verified'
New-Item -ItemType Directory -Force $taskTarget | Out-Null
$taskNames = @('v1/InitializeParams.json','v1/InitializeResponse.json','v2/GetAccountRateLimitsResponse.json','v2/AccountRateLimitsUpdatedNotification.json','v2/ThreadLoadedListParams.json','v2/ThreadLoadedListResponse.json','v2/ThreadReadParams.json','v2/ThreadTurnsListParams.json','v2/TurnSteerParams.json','v2/HooksListParams.json','v2/HooksListResponse.json')
$taskHashes = foreach ($taskName in $taskNames) {
    $taskSource = Join-Path $taskGenerated $taskName
    Copy-Item -LiteralPath $taskSource -Destination $taskTarget -Force
    [PSCustomObject]@{file=$taskName;sha256=(Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash}
}
[PSCustomObject]@{version=(& codex --version);capturedUtc=[DateTime]::UtcNow.ToString('o');schemas=$taskHashes} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskTarget 'manifest.json') -Encoding utf8

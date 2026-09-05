param([Parameter(Mandatory = $true)][string[]]$Paths, [Parameter(Mandatory = $true)][string]$ReportPath)
$ErrorActionPreference = 'Stop'
$status = Get-MpComputerStatus
if (-not $status.AntivirusEnabled -or -not $status.RealTimeProtectionEnabled) { throw '必须开启 Defender 与实时防护才可验证发布包。' }
if ($status.AntivirusSignatureLastUpdated -lt (Get-Date).AddDays(-2)) { throw '病毒库超过两天未更新，请先更新官方病毒库。' }
$results = @()
foreach ($path in $Paths) {
  $target = (Resolve-Path -LiteralPath $path).Path
  $started = Get-Date
  & 'C:\Program Files\Windows Defender\MpCmdRun.exe' -Scan -ScanType 3 -File $target
  if ($LASTEXITCODE -ne 0) { throw "Defender 扫描未通过：$target" }
  $detections = @(Get-MpThreatDetection | Where-Object { $_.InitialDetectionTime -ge $started.AddSeconds(-2) -and ($_.Resources -join ' ').IndexOf($target, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
  if ($detections.Count -gt 0 -or -not (Test-Path -LiteralPath $target)) { throw "扫描发现告警，禁止发布：$target" }
  $hash = $null
  if (Test-Path -LiteralPath $target -PathType Leaf) {
    $hasher = [Security.Cryptography.SHA256]::Create(); $stream = [IO.File]::OpenRead($target)
    try { $hash = ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $hasher.Dispose() }
  }
  $results += [ordered]@{ path = $target; sha256 = $hash; scannedAt = (Get-Date).ToUniversalTime().ToString('o'); result = 'no-threats-detected' }
}
$report = [ordered]@{ engine = $status.AMEngineVersion; signatures = $status.AntivirusSignatureVersion; realtimeProtection = $true; files = $results }
[IO.File]::WriteAllText([IO.Path]::GetFullPath($ReportPath), ($report | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))

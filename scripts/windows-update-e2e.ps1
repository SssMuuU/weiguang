param([Parameter(Mandatory = $true)][string]$InstallerPath)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('weiguang-e2e-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$eventName = 'Local\WeiguangUpdateReady-' + [guid]::NewGuid().ToString('N')
$readyEvent = New-Object System.Threading.EventWaitHandle($false, [System.Threading.EventResetMode]::ManualReset, $eventName)
$parentProcess = $null
$helperProcess = $null
try {
  $fixture = Join-Path $testRoot '微光.exe'
  & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe "/out:$fixture" (Join-Path $projectRoot 'windows\WindowsUpdateTestParent.cs')
  if ($LASTEXITCODE -ne 0) { throw '模拟旧版编译失败。' }
  $sentinel = Join-Path $testRoot 'personal-backup.json'
  [System.IO.File]::WriteAllText($sentinel, 'personal data retained')
  $parentProcess = Start-Process -FilePath $fixture -ArgumentList $eventName -WindowStyle Hidden -PassThru
  $arguments = '--update "' + $testRoot + '" ' + $parentProcess.Id + ' ' + $eventName + ' --no-restart'
  $helperProcess = Start-Process -FilePath ([System.IO.Path]::GetFullPath($InstallerPath)) -ArgumentList $arguments -WindowStyle Hidden -PassThru
  if (-not $helperProcess.WaitForExit(60000)) { throw '升级流程超时。' }
  if ($helperProcess.ExitCode -ne 0) { throw "升级流程失败：$($helperProcess.ExitCode)" }
  if (-not $parentProcess.HasExited -or $parentProcess.ExitCode -ne 0) { throw '旧版退出握手失败。' }
  $versionSource = Get-Content -LiteralPath (Join-Path $projectRoot 'windows\WindowsRelease.cs') -Raw
  $version = [regex]::Match($versionSource, 'const string Version = "([0-9.]+)"').Groups[1].Value + '.0'
  if ([System.Diagnostics.FileVersionInfo]::GetVersionInfo($fixture).FileVersion -ne $version) { throw '新版没有替换成功。' }
  if ([System.IO.File]::ReadAllText($sentinel) -ne 'personal data retained') { throw '非应用文件被改动。' }
  $check = Start-Process -FilePath $fixture -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
  if ($check.ExitCode -ne 0) { throw '升级后启动自检失败。' }
  Write-Output 'Windows 完整升级测试通过：旧版退出握手、原地替换、数据保留、新版启动自检。'
} finally {
  foreach ($process in @($parentProcess, $helperProcess)) { if ($null -ne $process -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit() } }
  $readyEvent.Dispose()
  $safePrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\weiguang-e2e-'
  if ([System.IO.Path]::GetFullPath($testRoot).StartsWith($safePrefix, [System.StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}

param([string]$LiveManifest, [string]$MsiPath)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$testExecutable = Join-Path ([System.IO.Path]::GetTempPath()) ('weiguang-tests-' + [guid]::NewGuid().ToString('N') + '.exe')
try {
  $sources = @('WindowsRelease.cs', 'WindowsUpdater.cs', 'WindowsUpdateTests.cs') | ForEach-Object { Join-Path $projectRoot "windows\$_" }
  & $compiler /nologo /target:exe /reference:System.Web.Extensions.dll "/out:$testExecutable" $sources
  if ($LASTEXITCODE -ne 0) { throw '更新测试编译失败。' }
  & $testExecutable
  if ($LASTEXITCODE -ne 0) { throw '更新测试失败。' }
  if ($MsiPath) {
    & $testExecutable --msi ([IO.Path]::GetFullPath($MsiPath))
    if ($LASTEXITCODE -ne 0) { throw 'MSI 身份或版本校验失败。' }
  }
  if ($LiveManifest) {
    & $testExecutable --live ([System.IO.Path]::GetFullPath($LiveManifest))
    if ($LASTEXITCODE -ne 0) { throw '线上更新通路测试失败。' }
  }
} finally {
  if (Test-Path -LiteralPath $testExecutable) { Remove-Item -LiteralPath $testExecutable -Force }
}

$ErrorActionPreference = 'Stop'

$target = 'D:\Config.Msi'
$resolved = [IO.Path]::GetFullPath($target)
if ($resolved -ne $target) { throw '回滚目录路径校验失败。' }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw '此修复需要管理员权限。'
}

$item = Get-Item -Force -LiteralPath $resolved -ErrorAction Stop
if (-not $item.PSIsContainer -or $item.LinkType) { throw '目标不是普通的 Windows Installer 回滚目录，已停止。' }

& (Join-Path $env:WINDIR 'System32\takeown.exe') /F $resolved /A /R /D Y | Out-Null
if ($LASTEXITCODE -ne 0) { throw '无法取得回滚目录的管理权。' }

& (Join-Path $env:WINDIR 'System32\icacls.exe') $resolved /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw '无法恢复回滚目录的安全权限。' }

& (Join-Path $env:WINDIR 'System32\icacls.exe') $resolved /setowner '*S-1-5-18' /T /C | Out-Null
if ($LASTEXITCODE -ne 0) { throw '无法恢复回滚目录的系统所有者。' }

& (Join-Path $env:WINDIR 'System32\attrib.exe') +H +S $resolved
if ($LASTEXITCODE -ne 0) { throw '无法恢复回滚目录的隐藏属性。' }

$logDirectory = Join-Path $env:LOCALAPPDATA 'Weiguang\Logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $logDirectory 'config-msi-repair.txt'), "修复完成：$([DateTimeOffset]::Now.ToString('O'))`r`n目录：$resolved`r`n", [Text.UTF8Encoding]::new($false))

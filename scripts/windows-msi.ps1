param(
  [Parameter(Mandatory = $true)][string]$StageDirectory,
  [Parameter(Mandatory = $true)][string]$IconPath,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$wixRoot = Join-Path $projectRoot 'work\wix-3.14.1'
$wixBin = Join-Path $wixRoot 'bin'
if (-not (Test-Path -LiteralPath (Join-Path $wixBin 'candle.exe'))) {
  throw '请先从 WiX 官方 wix3141rtm 发布安装构建工具到 work/wix-3.14.1/bin。'
}
$expectedWixHash = '6ac824e1642d6f7277d0ed7ea09411a508f6116ba6fae0aa5f2c7daa2ff43d31'
$wixHasher = [Security.Cryptography.SHA256]::Create()
$wixStream = [IO.File]::OpenRead((Join-Path $wixRoot 'wix314-binaries.zip'))
try { $wixHash = ([BitConverter]::ToString($wixHasher.ComputeHash($wixStream))).Replace('-', '').ToLowerInvariant() }
finally { $wixStream.Dispose(); $wixHasher.Dispose() }
if ($wixHash -ne $expectedWixHash) { throw 'WiX 官方工具压缩包校验失败。' }
$buildRoot = Join-Path $projectRoot ('work\msi-' + $Version)
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$StageDirectory = [IO.Path]::GetFullPath($StageDirectory)
$xml = New-Object System.Text.StringBuilder
$components = New-Object 'System.Collections.Generic.List[string]'
[void]$xml.AppendLine('<?xml version="1.0" encoding="utf-8"?><Wix xmlns="http://schemas.microsoft.com/wix/2006/wi"><Fragment><DirectoryRef Id="INSTALLFOLDER">')
function Escape-Xml([string]$Value) { [System.Security.SecurityElement]::Escape($Value) }
function Stable-Id([string]$Value) {
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try { 'I' + ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value.ToLowerInvariant())))).Replace('-', '').Substring(0, 24) }
  finally { $hasher.Dispose() }
}
function Add-Directory([string]$Path, [string]$DirectoryId) {
  $first = $true
  foreach ($file in Get-ChildItem -LiteralPath $Path -File | Sort-Object Name) {
    $relative = $file.FullName.Substring($StageDirectory.Length + 1)
    $id = Stable-Id $relative
    $guidHasher = [Security.Cryptography.SHA256]::Create()
    try { $componentGuid = [Guid]::new([byte[]]($guidHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes('Weiguang.Msi.v1/' + $relative.ToLowerInvariant())))[0..15]).ToString('B') }
    finally { $guidHasher.Dispose() }
    $fileId = if ($relative -eq '微光.exe') { 'AppLauncher' } else { 'F' + $id }
    $components.Add($id)
    [void]$xml.AppendLine('<Component Id="' + $id + '" Guid="' + $componentGuid + '" Win64="yes"><File Id="' + $fileId + '" Source="' + (Escape-Xml $file.FullName) + '" /><RegistryValue Root="HKCU" Key="Software\Weiguang\Installer\Files" Name="' + $id + '" Type="integer" Value="1" KeyPath="yes" />')
    if ($first) { [void]$xml.AppendLine('<RemoveFolder Id="R' + $id + '" Directory="' + $DirectoryId + '" On="uninstall" />'); $first = $false }
    [void]$xml.AppendLine('</Component>')
  }
  foreach ($directory in Get-ChildItem -LiteralPath $Path -Directory | Sort-Object Name) {
    $id = 'D' + (Stable-Id $directory.FullName.Substring($StageDirectory.Length + 1))
    [void]$xml.AppendLine('<Directory Id="' + $id + '" Name="' + (Escape-Xml $directory.Name) + '">')
    Add-Directory $directory.FullName $id
    [void]$xml.AppendLine('</Directory>')
  }
}
Add-Directory $StageDirectory 'INSTALLFOLDER'
[void]$xml.AppendLine('</DirectoryRef></Fragment><Fragment><ComponentGroup Id="AppFiles">')
foreach ($id in $components) { [void]$xml.AppendLine('<ComponentRef Id="' + $id + '" />') }
[void]$xml.AppendLine('</ComponentGroup></Fragment></Wix>')
$filesSource = Join-Path $buildRoot 'Files.wxs'
[IO.File]::WriteAllText($filesSource, $xml.ToString(), [Text.UTF8Encoding]::new($false))
$defines = @(('-dVersion=' + $Version), '-dProductName=微光', '-dUpgradeCode={C82A99EB-50AB-4F12-9BBA-4DFA0AD75E60}', ('-dIconPath=' + $IconPath), ('-dLicensePath=' + (Join-Path $projectRoot 'windows\INSTALL_NOTICE.rtf')))
& (Join-Path $wixBin 'candle.exe') -nologo -arch x64 @defines -out ($buildRoot + '\') (Join-Path $projectRoot 'windows\Product.wxs') $filesSource
if ($LASTEXITCODE -ne 0) { throw 'MSI 源文件编译失败。' }
& (Join-Path $wixBin 'light.exe') -nologo -ext (Join-Path $wixBin 'WixUIExtension.dll') -cultures:zh-cn -out $OutputPath (Join-Path $buildRoot 'Product.wixobj') (Join-Path $buildRoot 'Files.wixobj')
if ($LASTEXITCODE -ne 0) { throw 'MSI 构建或验证失败。' }

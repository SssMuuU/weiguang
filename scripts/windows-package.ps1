$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
& (Join-Path $PSScriptRoot 'windows-update-test.ps1')
$outputDirectory = Join-Path $projectRoot 'outputs'
$releaseSource = Join-Path $projectRoot 'windows\WindowsRelease.cs'
$versionMatch = [regex]::Match((Get-Content -LiteralPath $releaseSource -Raw), 'const string Version = "(\d+\.\d+\.\d+)"')
if (-not $versionMatch.Success) { throw 'Windows 版本号无效。' }
$version = $versionMatch.Groups[1].Value
$webViewVersion = '1.0.4191.47'
$archivePath = Join-Path $outputDirectory "weiguang-windows-$version.zip"
$checksumPath = Join-Path $outputDirectory "weiguang-windows-$version.sha256.txt"
$installerPath = Join-Path $outputDirectory "微光安装程序-$version.exe"
$installerChecksumPath = Join-Path $outputDirectory "微光安装程序-$version.sha256.txt"
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$stageDirectory = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ("weiguang-windows-" + [guid]::NewGuid().ToString('N'))))
$iconPath = [System.IO.Path]::GetFullPath((Join-Path $tempRoot ("weiguang-icon-" + [guid]::NewGuid().ToString('N') + '.ico')))
$safeTempPrefix = $tempRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

if (-not $stageDirectory.StartsWith($safeTempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw '临时打包目录不在系统临时目录内，已停止。'
}

New-Item -ItemType Directory -Path $stageDirectory | Out-Null
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

try {
  Push-Location $projectRoot
  try {
    & npm.cmd run mobile:build
    if ($LASTEXITCODE -ne 0) { throw '微光前端构建失败。' }
  } finally {
    Pop-Location
  }

  $sourcePath = Join-Path $projectRoot 'windows\WeiguangLauncher.cs'
  $installerSourcePath = Join-Path $projectRoot 'windows\WeiguangInstaller.cs'
  $manifestPath = Join-Path $projectRoot 'windows\weiguang.manifest'
  $readmePath = Join-Path $projectRoot 'windows\WINDOWS_PACKAGE_README.txt'
  $pngPath = Join-Path $projectRoot 'public\icon-1024.png'
  $exePath = Join-Path $stageDirectory '微光.exe'
  $appDirectory = Join-Path $stageDirectory 'app'
  $dependencyBase = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'work\webview2'))
  $webViewRoot = [System.IO.Path]::GetFullPath((Join-Path $dependencyBase $webViewVersion))
  $webViewPackagePath = Join-Path $webViewRoot "Microsoft.Web.WebView2.$webViewVersion.nupkg"
  $webViewPackageRoot = Join-Path $webViewRoot 'package'
  $webViewCore = Join-Path $webViewPackageRoot 'lib\net462\Microsoft.Web.WebView2.Core.dll'
  $webViewWinForms = Join-Path $webViewPackageRoot 'lib\net462\Microsoft.Web.WebView2.WinForms.dll'
  $webViewLoader = Join-Path $webViewPackageRoot 'runtimes\win-x64\native\WebView2Loader.dll'

  if (-not (Test-Path -LiteralPath $webViewCore) -or -not (Test-Path -LiteralPath $webViewWinForms) -or -not (Test-Path -LiteralPath $webViewLoader)) {
    New-Item -ItemType Directory -Path $webViewRoot -Force | Out-Null
    Invoke-WebRequest -UseBasicParsing "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$webViewVersion" -OutFile $webViewPackagePath
    $safeDependencyPrefix = $dependencyBase.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $webViewPackageRoot.StartsWith($safeDependencyPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'WebView2 依赖目录不安全，已停止。' }
    if (Test-Path -LiteralPath $webViewPackageRoot) { Remove-Item -LiteralPath $webViewPackageRoot -Recurse -Force }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($webViewPackagePath, $webViewPackageRoot)
  }

  New-Item -ItemType Directory -Path $appDirectory | Out-Null
  Copy-Item -Path (Join-Path $projectRoot 'mobile-dist\*') -Destination $appDirectory -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $projectRoot 'public\sw.js') -Destination $appDirectory -Force
  Copy-Item -LiteralPath (Join-Path $projectRoot 'public\manifest.webmanifest') -Destination $appDirectory -Force
  Copy-Item -LiteralPath $pngPath -Destination $appDirectory -Force
  Get-ChildItem -LiteralPath (Join-Path $projectRoot 'public') -File | Where-Object { $_.Extension -in '.png', '.svg', '.ico' } | Copy-Item -Destination $appDirectory
  Copy-Item -LiteralPath $webViewCore -Destination $stageDirectory -Force
  Copy-Item -LiteralPath $webViewWinForms -Destination $stageDirectory -Force
  Copy-Item -LiteralPath $webViewLoader -Destination $stageDirectory -Force

  Add-Type -AssemblyName System.Drawing
  $sourceImage = [System.Drawing.Image]::FromFile($pngPath)
  try {
    $iconBitmap = New-Object System.Drawing.Bitmap 256, 256
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
      try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($sourceImage, 0, 0, 256, 256)
      } finally {
        $graphics.Dispose()
      }

      $pngStream = New-Object System.IO.MemoryStream
      try {
        $iconBitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngBytes = $pngStream.ToArray()
      } finally {
        $pngStream.Dispose()
      }
    } finally {
      $iconBitmap.Dispose()
    }
  } finally {
    $sourceImage.Dispose()
  }

  $iconStream = [System.IO.File]::Create($iconPath)
  try {
    $writer = New-Object System.IO.BinaryWriter $iconStream
    try {
      $writer.Write([uint16]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]1)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$pngBytes.Length)
      $writer.Write([uint32]22)
      $writer.Write($pngBytes)
    } finally {
      $writer.Dispose()
    }
  } finally {
    $iconStream.Dispose()
  }

  $compilerCandidates = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
  )
  $compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $compiler) { throw '未找到 Windows 自带的 C# 编译器。' }

  $updaterSource = Join-Path $projectRoot 'windows\WindowsUpdater.cs'
  $transactionSource = Join-Path $projectRoot 'windows\WindowsInstallTransaction.cs'
  & $compiler /nologo /target:winexe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/reference:$webViewCore" "/reference:$webViewWinForms" "/win32icon:$iconPath" "/win32manifest:$manifestPath" "/out:$exePath" $sourcePath $releaseSource $updaterSource
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exePath)) { throw '微光 Windows 启动器编译失败。' }
  $checkProcess = Start-Process -FilePath $exePath -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
  if ($checkProcess.ExitCode -ne 0) { throw "微光 Windows 离线包自检失败，退出码：$($checkProcess.ExitCode)" }
  $dpiCheckProcess = Start-Process -FilePath $exePath -ArgumentList '--dpi-check' -WindowStyle Hidden -Wait -PassThru
  if ($dpiCheckProcess.ExitCode -ne 0) { throw "微光 Windows 高 DPI 自检失败，退出码：$($dpiCheckProcess.ExitCode)" }

  Copy-Item -LiteralPath $readmePath -Destination (Join-Path $stageDirectory '使用说明.txt')
  if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
  if (Test-Path -LiteralPath $checksumPath) { Remove-Item -LiteralPath $checksumPath -Force }
  if (Test-Path -LiteralPath $installerPath) { Remove-Item -LiteralPath $installerPath -Force }
  if (Test-Path -LiteralPath $installerChecksumPath) { Remove-Item -LiteralPath $installerChecksumPath -Force }
  Compress-Archive -Path (Join-Path $stageDirectory '*') -DestinationPath $archivePath -CompressionLevel Optimal

  & $compiler /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll "/resource:$archivePath,WeiguangPayload.zip" "/win32icon:$iconPath" "/win32manifest:$manifestPath" "/out:$installerPath" $installerSourcePath $releaseSource $transactionSource
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $installerPath)) { throw '微光 Windows 安装程序编译失败。' }
  $installerCheck = Start-Process -FilePath $installerPath -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
  if ($installerCheck.ExitCode -ne 0) { throw "微光 Windows 安装程序自检失败，退出码：$($installerCheck.ExitCode)" }
  & (Join-Path $PSScriptRoot 'windows-update-e2e.ps1') -InstallerPath $installerPath

  function Write-Checksum([string]$Path, [string]$ChecksumFile) {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $archiveStream = [System.IO.File]::OpenRead($Path)
    try {
      $hash = ([System.BitConverter]::ToString($sha256.ComputeHash($archiveStream))).Replace('-', '').ToLowerInvariant()
    } finally {
      $archiveStream.Dispose()
      $sha256.Dispose()
    }
    [System.IO.File]::WriteAllText($ChecksumFile, "$hash  $([System.IO.Path]::GetFileName($Path))`r`n", [System.Text.UTF8Encoding]::new($false))
    return $hash
  }

  $hash = Write-Checksum $archivePath $checksumPath
  $installerHash = Write-Checksum $installerPath $installerChecksumPath
  $releaseDirectory = Join-Path $projectRoot 'public\windows'
  New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
  $releaseFile = "weiguang-$version-$($installerHash.Substring(0, 12)).exe"
  Copy-Item -LiteralPath $installerPath -Destination (Join-Path $releaseDirectory $releaseFile)
  $feed = [ordered]@{
    version = $version
    url = "https://weiguang-plan-habits.workspace-192140.chatgpt.site/windows/$releaseFile"
    sha256 = $installerHash
    size = (Get-Item -LiteralPath $installerPath).Length
    notes = (Get-Content -LiteralPath (Join-Path $projectRoot 'windows\RELEASE_NOTES.txt') -Raw).Trim()
  }
  [System.IO.File]::WriteAllText((Join-Path $releaseDirectory 'latest.json'), ($feed | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
  Write-Output "Windows 安装程序已生成：$installerPath"
  Write-Output "SHA-256：$installerHash"
  Write-Output "Windows 便携包已生成：$archivePath"
  Write-Output "SHA-256：$hash"
} finally {
  if ($iconPath.StartsWith($safeTempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $iconPath)) {
    Remove-Item -LiteralPath $iconPath -Force
  }
  if ($stageDirectory.StartsWith($safeTempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $stageDirectory)) {
    Remove-Item -LiteralPath $stageDirectory -Recurse -Force
  }
}

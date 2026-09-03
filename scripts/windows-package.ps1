$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputDirectory = Join-Path $projectRoot 'outputs'
$version = '0.1.0'
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
  $readmePath = Join-Path $projectRoot 'windows\WINDOWS_PACKAGE_README.txt'
  $pngPath = Join-Path $projectRoot 'public\icon-1024.png'
  $exePath = Join-Path $stageDirectory '微光.exe'
  $appDirectory = Join-Path $stageDirectory 'app'

  New-Item -ItemType Directory -Path $appDirectory | Out-Null
  Copy-Item -Path (Join-Path $projectRoot 'mobile-dist\*') -Destination $appDirectory -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $projectRoot 'public\sw.js') -Destination $appDirectory -Force
  Copy-Item -LiteralPath (Join-Path $projectRoot 'public\manifest.webmanifest') -Destination $appDirectory -Force
  Copy-Item -LiteralPath $pngPath -Destination $appDirectory -Force

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

  & $compiler /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll "/win32icon:$iconPath" "/out:$exePath" $sourcePath
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $exePath)) { throw '微光 Windows 启动器编译失败。' }
  $checkProcess = Start-Process -FilePath $exePath -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
  if ($checkProcess.ExitCode -ne 0) { throw "微光 Windows 离线包自检失败，退出码：$($checkProcess.ExitCode)" }

  Copy-Item -LiteralPath $readmePath -Destination (Join-Path $stageDirectory '使用说明.txt')
  if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
  if (Test-Path -LiteralPath $checksumPath) { Remove-Item -LiteralPath $checksumPath -Force }
  if (Test-Path -LiteralPath $installerPath) { Remove-Item -LiteralPath $installerPath -Force }
  if (Test-Path -LiteralPath $installerChecksumPath) { Remove-Item -LiteralPath $installerChecksumPath -Force }
  Compress-Archive -Path (Join-Path $stageDirectory '*') -DestinationPath $archivePath -CompressionLevel Optimal

  & $compiler /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll "/resource:$archivePath,WeiguangPayload.zip" "/win32icon:$iconPath" "/out:$installerPath" $installerSourcePath
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $installerPath)) { throw '微光 Windows 安装程序编译失败。' }
  $installerCheck = Start-Process -FilePath $installerPath -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
  if ($installerCheck.ExitCode -ne 0) { throw "微光 Windows 安装程序自检失败，退出码：$($installerCheck.ExitCode)" }

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

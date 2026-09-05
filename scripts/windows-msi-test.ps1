param(
  [Parameter(Mandatory = $true)][string]$PackagePath,
  [string]$TestBaseDirectory = [IO.Path]::GetTempPath()
)
$ErrorActionPreference = 'Stop'
$PackagePath = [IO.Path]::GetFullPath($PackagePath)
$testBase = [IO.Path]::GetFullPath($TestBaseDirectory)
New-Item -ItemType Directory -Path $testBase -Force | Out-Null
$testRoot = Join-Path $testBase ('weiguang-msi-test-' + [Guid]::NewGuid().ToString('N'))
$testName = 'WeiguangMsiTest' + [Guid]::NewGuid().ToString('N')
$testUpgrade = [Guid]::NewGuid().ToString('B').ToUpperInvariant()
$testProducts = @([Guid]::NewGuid().ToString('B').ToUpperInvariant(), [Guid]::NewGuid().ToString('B').ToUpperInvariant())
$componentGuids = @{}
$engine = New-Object -ComObject WindowsInstaller.Installer
New-Item -ItemType Directory -Path $testRoot | Out-Null
function Execute-Sql($Database, [string]$Sql) {
  $view = $Database.OpenView($Sql)
  try { [void]$view.Execute($null) } finally { [void]$view.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($view) }
}
function Read-Rows($Database, [string]$Sql, [int]$Columns) {
  $view = $Database.OpenView($Sql); $rows = @()
  try {
    [void]$view.Execute($null)
    while ($record = $view.Fetch()) {
      $values = @(); for ($i = 1; $i -le $Columns; $i++) { $values += $record.StringData($i) }
      $rows += ,$values
      [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($record)
    }
  } finally { [void]$view.Close(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($view) }
  return ,$rows
}
function Run-Msi([string]$Arguments, [int[]]$Expected = @(0, 3010)) {
  $process = Start-Process -FilePath (Join-Path $env:WINDIR 'System32\msiexec.exe') -ArgumentList $Arguments -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(60000)) { throw "MSI 测试超时；保留诊断目录：$testRoot" }
  if ($process.ExitCode -notin $Expected) { throw "MSI 测试失败 $($process.ExitCode)；诊断目录：$testRoot" }
}
$cleanupSucceeded = $false
try {
  # Administrative extraction validates the exact production MSI without registering it.
  $extracted = Join-Path $testRoot 'extracted'
  Run-Msi ('/a "' + $PackagePath + '" /qn TARGETDIR="' + $extracted + '" /l*v "' + $testRoot + '\extract.log"')
  $launcher = Get-ChildItem -LiteralPath $extracted -Filter '微光.exe' -Recurse -File | Select-Object -First 1
  if (-not $launcher) { throw 'MSI 缺少启动器。' }
  $check = Start-Process -FilePath $launcher.FullName -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
  if ($check.ExitCode -ne 0) { throw 'MSI 解包后的应用自检失败。' }
  $installed = Join-Path $testRoot 'installed'
  New-Item -ItemType Directory -Path $installed | Out-Null
  $sentinel = Join-Path $installed 'personal-backup.json'
  [IO.File]::WriteAllText($sentinel, 'preserve personal data')
  for ($n = 0; $n -lt 2; $n++) {
    $version = ($n + 1).ToString() + '.0.0'
    $testPackage = Join-Path $testRoot ("test-$version.msi")
    Copy-Item -LiteralPath $PackagePath -Destination $testPackage
    $db = $engine.OpenDatabase($testPackage, 1)
    try {
      Execute-Sql $db ("UPDATE ``Property`` SET ``Value``='$($testProducts[$n])' WHERE ``Property``='ProductCode'")
      Execute-Sql $db ("UPDATE ``Property`` SET ``Value``='$testUpgrade' WHERE ``Property``='UpgradeCode'")
      Execute-Sql $db ("UPDATE ``Property`` SET ``Value``='$version' WHERE ``Property``='ProductVersion'")
      Execute-Sql $db ("UPDATE ``Property`` SET ``Value``='$testName' WHERE ``Property``='ProductName'")
      $upgradeRows = Read-Rows $db 'SELECT `VersionMin`,`VersionMax`,`Language`,`Attributes`,`Remove`,`ActionProperty` FROM `Upgrade`' 6
      Execute-Sql $db 'DELETE FROM `Upgrade`'
      foreach ($row in $upgradeRows) {
        $values = @("'$testUpgrade'")
        for ($column = 0; $column -lt 6; $column++) {
          $value = $row[$column]
          if ($column -lt 2 -and $value) { $value = $version }
          if ($column -eq 3) { $values += $value }
          elseif ($value) { $values += "'" + $value.Replace("'", "''") + "'" }
          else { $values += 'NULL' }
        }
        Execute-Sql $db ('INSERT INTO `Upgrade` (`UpgradeCode`,`VersionMin`,`VersionMax`,`Language`,`Attributes`,`Remove`,`ActionProperty`) VALUES (' + ($values -join ',') + ')')
      }
      # Test copies have isolated component identities, registry keys, folders and no shortcuts.
      foreach ($row in (Read-Rows $db 'SELECT `Component` FROM `Component`' 1)) {
        if (-not $componentGuids.ContainsKey($row[0])) { $componentGuids[$row[0]] = [Guid]::NewGuid().ToString('B').ToUpperInvariant() }
        Execute-Sql $db ("UPDATE ``Component`` SET ``ComponentId``='$($componentGuids[$row[0]])' WHERE ``Component``='$($row[0])'")
      }
      Execute-Sql $db ("UPDATE ``Registry`` SET ``Key``='Software\$testName'")
      Execute-Sql $db 'DELETE FROM `Shortcut`'
      Execute-Sql $db 'DELETE FROM `RemoveRegistry`'
      Execute-Sql $db "DELETE FROM ``RemoveFile`` WHERE ``FileKey``='RemoveLegacyUninstaller'"
      Execute-Sql $db "DELETE FROM ``AppSearch`` WHERE ``Property``='INSTALLFOLDER'"
      Execute-Sql $db ("UPDATE ``Directory`` SET ``DefaultDir``='$testName' WHERE ``Directory``='AppStartMenu'")
      $summary = $db.SummaryInformation(1); $summary.Property(9) = [Guid]::NewGuid().ToString('B').ToUpperInvariant(); $summary.Persist()
      [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($summary)
      $db.Commit()
    } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($db) }
    if ($n -eq 1) {
      $brokenPackage = Join-Path $testRoot 'rollback-test.msi'
      Copy-Item -LiteralPath $testPackage -Destination $brokenPackage
      $brokenDb = $engine.OpenDatabase($brokenPackage, 1)
      try {
        Execute-Sql $brokenDb "INSERT INTO ``CustomAction`` (``Action``,``Type``,``Target``) VALUES ('TestRollbackFailure',19,'Intentional rollback test')"
        Execute-Sql $brokenDb "INSERT INTO ``InstallExecuteSequence`` (``Action``,``Sequence``) VALUES ('TestRollbackFailure',4001)"
        [void]$brokenDb.Commit()
      } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($brokenDb) }
      Run-Msi ('/i "' + $brokenPackage + '" /qn /norestart INSTALLFOLDER="' + $installed + '" /l*v "' + $testRoot + '\rollback.log"') @(1603)
      if ($engine.ProductInfo($testProducts[0], 'VersionString') -ne '1.0.0' -or -not (Test-Path -LiteralPath (Join-Path $installed '微光.exe'))) { throw '失败升级没有恢复旧版。' }
      if ([IO.File]::ReadAllText($sentinel) -ne 'preserve personal data') { throw '回退修改了非应用数据。' }
    }
    Run-Msi ('/i "' + $testPackage + '" /qn /norestart INSTALLFOLDER="' + $installed + '" /l*v "' + $testRoot + '\install-' + $version + '.log"')
    if ($engine.ProductInfo($testProducts[$n], 'VersionString') -ne $version) { throw 'MSI 产品版本不符。' }
    if ([IO.File]::ReadAllText($sentinel) -ne 'preserve personal data') { throw '升级修改了非应用数据。' }
  }
  Run-Msi ('/i "' + $testRoot + '\test-1.0.0.msi" /qn /norestart INSTALLFOLDER="' + $installed + '" /l*v "' + $testRoot + '\downgrade.log"') @(1603)
  Run-Msi ('/x ' + $testProducts[1] + ' /qn /norestart /l*v "' + $testRoot + '\uninstall.log"')
  if ([IO.File]::ReadAllText($sentinel) -ne 'preserve personal data') { throw '卸载删除了非应用数据。' }
  $permissionErrors = Get-ChildItem -LiteralPath $testRoot -Filter '*.log' -File | Select-String -Pattern 'Error 1926|错误 1926|Config\.Msi.+(?:Error|错误): 5'
  if ($permissionErrors) { throw 'MSI 回滚目录仍有权限错误。' }
  $cleanupSucceeded = $true
  Write-Output 'MSI tests passed: production extraction/startup, isolated install, failed-upgrade rollback, major upgrade, downgrade rejection, uninstall and data retention.'
} finally {
  foreach ($product in $testProducts) {
    try { if ($engine.ProductState($product) -gt 0) { Run-Msi ('/x ' + $product + ' /qn /norestart') } } catch { Write-Warning $_.Exception.Message }
  }
  [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($engine)
  $safePrefix = $testBase.TrimEnd('\') + '\weiguang-msi-test-'
  if ($cleanupSucceeded -and [IO.Path]::GetFullPath($testRoot).StartsWith($safePrefix, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}

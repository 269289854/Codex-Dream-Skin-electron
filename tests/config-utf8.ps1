[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\resources\windows\config-utf8.ps1')

$root = Join-Path ([System.IO.Path]::GetTempPath()) "dream-skin-studio-config-$PID-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $root | Out-Null
try {
  $config = Join-Path $root 'config.toml'
  $backup = Join-Path $root 'config.before.toml'
  $project = -join @([char]0x4E2D, [char]0x6587, [char]0x9879, [char]0x76EE)
  $original = "model = `"gpt-5`"`r`n[projects.'C:\$project']`r`ntrust_level = `"trusted`"`r`n[desktop]`r`nappearanceTheme = `"dark`"`r`n"
  [System.IO.File]::WriteAllText($config, $original, [System.Text.UTF8Encoding]::new($false, $true))
  Install-DreamSkinBaseTheme -ConfigPath $config -BackupPath $backup
  $installed = Read-DreamSkinUtf8File -Path $config
  if (-not $installed.Contains($project) -or $installed -notmatch 'appearanceTheme = "light"') { throw 'UTF-8 install failed.' }
  $installed += "afterInstall = `"保留`"`r`n"
  Write-DreamSkinUtf8FileAtomically -Path $config -Content $installed
  Restore-DreamSkinBaseTheme -ConfigPath $config -BackupPath $backup
  $restored = Read-DreamSkinUtf8File -Path $config
  if (-not $restored.Contains($project) -or -not $restored.Contains('保留') -or $restored -notmatch 'appearanceTheme = "dark"') {
    throw 'UTF-8 restore did not preserve unrelated content.'
  }

  $nestedConfig = Join-Path $root 'config-nested.toml'
  $nestedBackup = Join-Path $root 'config-nested.before.toml'
  $nestedTables = @"
[desktop.open-in-target-preferences]
global = "vscode"

[desktop.open-in-target-preferences.perPath]
'C:\$project' = "explorer"
"literal@key.toml" = "preserve exactly"
"@
  $nestedOriginal = "model = `"gpt-5`"`r`n[desktop]`r`nselected-avatar-id = `"$project`"`r`n$($nestedTables.Replace("`n", "`r`n"))"
  [System.IO.File]::WriteAllText($nestedConfig, $nestedOriginal, [System.Text.UTF8Encoding]::new($false, $true))

  Install-DreamSkinBaseTheme -ConfigPath $nestedConfig -BackupPath $nestedBackup
  $nestedInstalled = Read-DreamSkinUtf8File -Path $nestedConfig
  $installedNestedIndex = $nestedInstalled.IndexOf('[desktop.open-in-target-preferences]')
  if ($installedNestedIndex -lt 0 -or $nestedInstalled.Substring($installedNestedIndex) -cne $nestedTables.Replace("`n", "`r`n")) {
    throw 'Install changed nested desktop table bytes.'
  }

  Restore-DreamSkinBaseTheme -ConfigPath $nestedConfig -BackupPath $nestedBackup
  $nestedRestored = Read-DreamSkinUtf8File -Path $nestedConfig
  $restoredNestedIndex = $nestedRestored.IndexOf('[desktop.open-in-target-preferences]')
  if ($restoredNestedIndex -lt 0 -or $nestedRestored.Substring($restoredNestedIndex) -cne $nestedTables.Replace("`n", "`r`n")) {
    throw 'Restore changed nested desktop table bytes.'
  }
  if ($nestedRestored -cne $nestedOriginal) {
    throw 'Scoped restore did not reproduce the original config with nested desktop tables.'
  }
  Write-Host 'PASS: strict UTF-8 config install and scoped restore.'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}

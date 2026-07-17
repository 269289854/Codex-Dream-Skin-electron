[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Detect', 'ApplyConfig', 'Start', 'Restore')]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [string]$StudioRoot,

  [string]$ThemePath,
  [int]$Port = 9335,
  [switch]$RestartExisting,
  [switch]$RestartCodex
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'common-windows.ps1')

function Write-StudioResult {
  param([Parameter(Mandatory = $true)][object]$Value)
  Write-Output ($Value | ConvertTo-Json -Compress -Depth 8)
}

function Get-StudioConfigPaths {
  $configRoot = Join-Path $env:USERPROFILE '.codex'
  $backupRoot = Join-Path $StudioRoot 'backups'
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
  return [pscustomobject]@{
    Config = Join-Path $configRoot 'config.toml'
    Backup = Join-Path $backupRoot 'config.before-studio.toml'
  }
}

function Install-StudioThemeConfig {
  param([Parameter(Mandatory = $true)][string]$ConfigPath,
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [Parameter(Mandatory = $true)][object]$Theme)

  if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Codex config not found: $ConfigPath" }
  $originalBytes = [System.IO.File]::ReadAllBytes($ConfigPath)
  $content = ConvertFrom-DreamSkinUtf8Bytes -Bytes $originalBytes -Path $ConfigPath
  $backupCreated = $false
  if (-not (Test-Path -LiteralPath $BackupPath)) {
    Write-DreamSkinBytesAtomically -Path $BackupPath -Bytes $originalBytes -ExpectedBytes $null
    $backupCreated = $true
  }

  $writeCompleted = $false
  try {
    Assert-DreamSkinDesktopShapeSupported -Content $content
    $newLine = Get-DreamSkinNewLine -Content $content
    $desktop = Get-DreamSkinDesktopSection -Content $content
    if ($null -eq $desktop) {
      $content = Add-DreamSkinDesktopSection -Content $content -NewLine $newLine
      $desktop = Get-DreamSkinDesktopSection -Content $content
    }
    $colors = $Theme.colors
    foreach ($value in @($colors.accent, $colors.ink, $colors.surface, $colors.success, $colors.danger, $colors.lavender)) {
      if ("$value" -cnotmatch '^#[0-9A-Fa-f]{6}$') { throw 'Theme contains an invalid color.' }
    }
    $chrome = 'appearanceLightChromeTheme = { accent = "' + $colors.accent +
      '", contrast = 64, fonts = { code = "Cascadia Code", ui = "Microsoft YaHei UI" }, ink = "' +
      $colors.ink + '", opaqueWindows = true, semanticColors = { diffAdded = "' + $colors.success +
      '", diffRemoved = "' + $colors.danger + '", skill = "' + $colors.lavender +
      '" }, surface = "' + $colors.surface + '" }'
    $settings = [ordered]@{
      appearanceTheme = 'appearanceTheme = "light"'
      appearanceLightCodeThemeId = 'appearanceLightCodeThemeId = "codex"'
      appearanceLightChromeTheme = $chrome
    }
    $body = $desktop.Body
    foreach ($key in $settings.Keys) {
      $body = Set-DreamSkinSectionSetting -Body $body -Key $key -Line $settings[$key] -NewLine $newLine
    }
    $content = $content.Substring(0, $desktop.BodyStart) + $body +
      $content.Substring($desktop.BodyStart + $desktop.BodyLength)
    Write-DreamSkinUtf8FileAtomically -Path $ConfigPath -Content $content -ExpectedBytes $originalBytes
    $writeCompleted = $true
  } catch {
    if ($backupCreated -and -not $writeCompleted) {
      Remove-Item -LiteralPath $BackupPath -Force -ErrorAction SilentlyContinue
    }
    throw
  }
}

$mutex = Enter-DreamSkinOperationLock
try {
  $paths = Get-StudioConfigPaths
  if ($Action -eq 'Detect') {
    $codex = Get-DreamSkinCodexInstall
    Write-StudioResult ([pscustomobject]@{
      found = $true
      version = $codex.Version
      executable = $codex.Executable
      packageFamilyName = $codex.PackageFamilyName
      running = @((Get-DreamSkinCodexProcesses -Codex $codex)).Count -gt 0
      backupAvailable = Test-Path -LiteralPath $paths.Backup
    })
    exit 0
  }

  if ($Action -eq 'ApplyConfig') {
    if (-not $ThemePath -or -not (Test-DreamSkinPathWithin -Path $ThemePath -Root $StudioRoot)) {
      throw 'Theme manifest must be inside the Studio data directory.'
    }
    $theme = (Read-DreamSkinUtf8File -Path $ThemePath) | ConvertFrom-Json -ErrorAction Stop
    Install-StudioThemeConfig -ConfigPath $paths.Config -BackupPath $paths.Backup -Theme $theme
    Write-StudioResult ([pscustomobject]@{ applied = $true; backupPath = $paths.Backup })
    exit 0
  }

  if ($Action -eq 'Start') {
    Assert-DreamSkinPort -Port $Port
    $codex = Get-DreamSkinCodexInstall
    $identity = Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $codex
    if ($null -eq $identity) {
      $processes = @(Get-DreamSkinCodexProcesses -Codex $codex)
      if ($processes.Count -gt 0) {
        if (-not $RestartExisting) { throw 'Codex must restart once to enable the local theme endpoint.' }
        Stop-DreamSkinCodex -Codex $codex -AllowForce
      }
      if (-not (Test-DreamSkinPortAvailable -Port $Port)) { throw "Port $Port is occupied by another process." }
      Start-DreamSkinCodexProcess -Codex $codex -Arguments @(
        '--remote-debugging-address=127.0.0.1', "--remote-debugging-port=$Port"
      ) | Out-Null
      $deadline = (Get-Date).AddSeconds(45)
      do {
        Start-Sleep -Milliseconds 400
        $identity = Get-DreamSkinVerifiedCdpIdentity -Port $Port -Codex $codex
      } while ($null -eq $identity -and (Get-Date) -lt $deadline)
      if ($null -eq $identity) { throw "Codex did not expose a verified loopback endpoint on port $Port." }
    }
    Write-StudioResult ([pscustomobject]@{
      started = $true
      port = $Port
      browserId = $identity.BrowserId
      targetCount = $identity.TargetCount
      version = $codex.Version
      executable = $codex.Executable
    })
    exit 0
  }

  if ($Action -eq 'Restore') {
    $restored = $false
    if (Test-Path -LiteralPath $paths.Backup) {
      Restore-DreamSkinBaseTheme -ConfigPath $paths.Config -BackupPath $paths.Backup
      $archive = Join-Path (Split-Path -Parent $paths.Backup) ("config.restored-{0}.toml" -f (Get-Date).ToString('yyyyMMdd-HHmmss-fff'))
      Archive-DreamSkinConfigBackup -BackupPath $paths.Backup -ArchivePath $archive
      $restored = $true
    }
    if ($RestartCodex) {
      $codex = Get-DreamSkinCodexInstall
      $processes = @(Get-DreamSkinCodexProcesses -Codex $codex)
      if ($processes.Count -gt 0) { Stop-DreamSkinCodex -Codex $codex -AllowForce }
      Start-DreamSkinCodexProcess -Codex $codex | Out-Null
    }
    Write-StudioResult ([pscustomobject]@{ restored = $restored; restarted = [bool]$RestartCodex })
  }
} finally {
  Exit-DreamSkinOperationLock -Mutex $mutex
}

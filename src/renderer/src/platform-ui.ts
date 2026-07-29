import type { AppInfo } from '../../shared/contracts'

export function studioPlatformLabel(platform: AppInfo['platform'] | null): string {
  if (platform === 'darwin') return 'macOS Theme Editor'
  if (platform === 'win32') return 'Windows Theme Editor'
  return 'Theme Editor'
}

export function appUpdateDisabledMessage(platform: AppInfo['platform'] | null): string {
  return platform === 'darwin' ? 'macOS 版暂不支持自动更新' : '仅安装版支持检查更新'
}

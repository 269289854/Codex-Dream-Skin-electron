import type { AppInfo } from '../../shared/contracts'

export function studioPlatformLabel(platform: AppInfo['platform'] | null): string {
  if (platform === 'darwin') return 'macOS Theme Editor'
  if (platform === 'win32') return 'Windows Theme Editor'
  return 'Theme Editor'
}

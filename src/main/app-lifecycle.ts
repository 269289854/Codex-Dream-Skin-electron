export const STUDIO_INSTANCE_APP_ID = 'com.codexdreamskin.studio'
export const STUDIO_INSTANCE_PROTOCOL = 1

const APP_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export interface StudioInstanceData {
  protocol: typeof STUDIO_INSTANCE_PROTOCOL
  appId: typeof STUDIO_INSTANCE_APP_ID
  version: string
}

export type StudioInstanceAction = 'show' | 'relaunch' | 'ignore'

export function createStudioInstanceData(version: string): StudioInstanceData {
  if (!APP_VERSION_PATTERN.test(version)) throw new Error('Studio version is invalid.')
  return { protocol: STUDIO_INSTANCE_PROTOCOL, appId: STUDIO_INSTANCE_APP_ID, version }
}

export function resolveStudioInstanceAction(
  currentVersion: string,
  isPackaged: boolean,
  additionalData: unknown,
  relaunchScheduled: boolean
): StudioInstanceAction {
  if (!isPackaged || !isStudioInstanceData(additionalData) || additionalData.version === currentVersion) return 'show'
  return relaunchScheduled ? 'ignore' : 'relaunch'
}

function isStudioInstanceData(value: unknown): value is StudioInstanceData {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<StudioInstanceData>
  return data.protocol === STUDIO_INSTANCE_PROTOCOL &&
    data.appId === STUDIO_INSTANCE_APP_ID &&
    typeof data.version === 'string' &&
    APP_VERSION_PATTERN.test(data.version)
}

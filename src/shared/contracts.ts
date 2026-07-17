export interface AppInfo {
  version: string
  platform: NodeJS.Platform
}

export interface StudioApi {
  app: {
    getInfo: () => Promise<AppInfo>
  }
}

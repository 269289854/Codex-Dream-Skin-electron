import {
  ProfileStore as ProductionProfileStore,
  type BundledSystemThemeAssets
} from '../src/main/profile-store'

const TEST_DISK_CAPACITY = 100 * 1024 ** 3

export class ProfileStore extends ProductionProfileStore {
  constructor(root: string, bundledSystemAssets?: BundledSystemThemeAssets) {
    super(root, bundledSystemAssets, {
      readDiskSpace: async () => ({
        available: TEST_DISK_CAPACITY,
        total: TEST_DISK_CAPACITY
      })
    })
  }
}

import { mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { unzipSync, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { ProfileStore } from '../src/main/profile-store'
import { ProjectIconStore } from '../src/main/project-icon-store'
import {
  SYSTEM_ICON_LIBRARY_ID,
  createSystemIconLibrary,
  selectStableProjectIcon,
  type ProjectIconPrivateSettings,
  type RuntimeProjectIconCandidate
} from '../src/shared/project-icons'

const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function createStores(): Promise<{ root: string; profiles: ProfileStore; icons: ProjectIconStore; themeId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'project-icons-'))
  roots.push(root)
  const profiles = new ProfileStore(root)
  await profiles.initialize()
  const themeId = (await profiles.list())[0]?.id
  if (!themeId) throw new Error('System theme was not created.')
  const icons = new ProjectIconStore(root, profiles)
  await icons.initialize()
  return { root, profiles, icons, themeId }
}

describe('project icon model', () => {
  it('provides a stable weighted system pool', () => {
    const library = createSystemIconLibrary()
    expect(library.id).toBe(SYSTEM_ICON_LIBRARY_ID)
    expect(library.icons.some((icon) => icon.defaultEnabled)).toBe(true)

    const candidates: RuntimeProjectIconCandidate[] = [
      { ref: { libraryId: 'system', iconId: 'star' }, weight: 1, builtinName: 'star' },
      { ref: { libraryId: 'system', iconId: 'heart' }, weight: 10, builtinName: 'heart' }
    ]
    const first = selectStableProjectIcon('00000000-0000-4000-8000-000000000001', 'project-1', candidates)
    expect(selectStableProjectIcon('00000000-0000-4000-8000-000000000001', 'project-1', candidates)).toEqual(first)
    expect(selectStableProjectIcon('00000000-0000-4000-8000-000000000001', 'project-1', [])).toBeNull()
  })
})

describe('ProjectIconStore', () => {
  it('protects the system library and defaults each theme to it', async () => {
    const { icons, themeId } = await createStores()
    await expect(icons.deleteLibrary(SYSTEM_ICON_LIBRARY_ID)).rejects.toThrow('系统素材库')
    await expect(icons.getThemeSettings(themeId)).resolves.toMatchObject({
      enabledLibraryIds: [SYSTEM_ICON_LIBRARY_ID],
      assignments: [],
      weightOverrides: []
    })
  })

  it('imports validated assets, applies theme weights, assignments, and runtime payloads', async () => {
    const { root, icons, themeId } = await createStores()
    const source = join(root, 'source.png')
    await writeFile(source, TEST_PNG)
    const library = await icons.createLibrary('像素图标')
    const imported = await icons.importAssets(library.id, [source])
    const icon = imported.icons[0]
    if (!icon) throw new Error('Imported icon missing.')

    await icons.setEnabledLibraries(themeId, [SYSTEM_ICON_LIBRARY_ID, library.id])
    await icons.setWeightOverride(themeId, { libraryId: library.id, iconId: icon.id }, true, 8)
    await icons.cacheProjects([{ id: 'project-1', label: '示例项目', kind: 'local' }])
    await icons.assignProject(themeId, 'project-1', { libraryId: library.id, iconId: icon.id })

    const runtime = await icons.compileRuntimeConfig(themeId)
    const systemStar = runtime.pool.find((entry) => entry.builtinName === 'star')?.dataUrl
    expect(systemStar).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(Buffer.from(systemStar?.split(',')[1] ?? '', 'base64').toString('utf8')).toContain('lucide-star')
    expect(runtime.pool.find((entry) => entry.ref.iconId === icon.id)).toMatchObject({ weight: 8, dataUrl: expect.stringContaining('data:image/png;base64,') })
    expect(runtime.assignments).toEqual([expect.objectContaining({ projectId: 'project-1', icon: expect.objectContaining({ dataUrl: expect.any(String) }) })])
    expect(await icons.listCachedProjects()).toEqual([expect.objectContaining({ id: 'project-1', label: '示例项目' })])

    const shareable = await icons.getShareableThemeSettings(themeId)
    expect(shareable).not.toHaveProperty('assignments')
    expect(JSON.stringify(shareable)).not.toContain('project-1')
  })

  it('serializes project caching with private theme setting updates', async () => {
    const { icons, themeId } = await createStores()
    const writable = icons as unknown as {
      writeSettings: (settings: ProjectIconPrivateSettings) => Promise<void>
    }
    const writeSettings = writable.writeSettings.bind(icons)
    let releaseFirstWrite = (): void => undefined
    let markFirstWriteStarted = (): void => undefined
    const firstWriteStarted = new Promise<void>((resolve) => { markFirstWriteStarted = resolve })
    const firstWriteGate = new Promise<void>((resolve) => { releaseFirstWrite = resolve })
    let writeCount = 0
    writable.writeSettings = async (settings) => {
      writeCount += 1
      if (writeCount === 1) {
        markFirstWriteStarted()
        await firstWriteGate
      }
      await writeSettings(settings)
    }

    const themeUpdate = icons.setEnabledLibraries(themeId, [])
    await firstWriteStarted
    const projectUpdate = icons.cacheProjects([{ id: 'concurrent-project', label: '并发项目', kind: 'local' }])
    await new Promise<void>((resolve) => setImmediate(resolve))
    releaseFirstWrite()
    await Promise.all([themeUpdate, projectUpdate])

    expect((await icons.getThemeSettings(themeId)).enabledLibraryIds).toEqual([])
    expect(await icons.listCachedProjects()).toEqual([
      expect.objectContaining({ id: 'concurrent-project', label: '并发项目' })
    ])
  })

  it('keeps the current Codex order ahead of historical cached projects', async () => {
    const { icons } = await createStores()
    await icons.cacheProjects([
      { id: 'old-a', label: 'Alpha', kind: 'local' },
      { id: 'old-b', label: 'Beta', kind: 'local' }
    ])

    await expect(icons.cacheProjects([
      { id: 'new-z', label: 'Zulu', kind: 'local' },
      { id: 'old-b', label: 'Beta updated', kind: 'workspace' }
    ])).resolves.toEqual([
      expect.objectContaining({ id: 'new-z', label: 'Zulu' }),
      expect.objectContaining({ id: 'old-b', label: 'Beta updated', kind: 'workspace' }),
      expect.objectContaining({ id: 'old-a', label: 'Alpha' })
    ])

    await expect(icons.cacheProjects([
      { id: 'old-a', label: 'Alpha', kind: 'local' },
      { id: 'new-z', label: 'Zulu', kind: 'local' }
    ])).resolves.toEqual([
      expect.objectContaining({ id: 'old-a' }),
      expect.objectContaining({ id: 'new-z' }),
      expect.objectContaining({ id: 'old-b' })
    ])
  })

  it('copies private theme settings locally and removes broken references on deletion', async () => {
    const { root, profiles, icons, themeId } = await createStores()
    const source = join(root, 'source.png')
    await writeFile(source, TEST_PNG)
    const library = await icons.createLibrary('项目图标')
    const imported = await icons.importAssets(library.id, [source])
    const icon = imported.icons[0]
    if (!icon) throw new Error('Imported icon missing.')
    await icons.setEnabledLibraries(themeId, [library.id])
    await icons.assignProject(themeId, 'project-2', { libraryId: library.id, iconId: icon.id })

    const duplicate = await profiles.duplicate(await profiles.get(themeId), '副本')
    await icons.copyThemeSettings(themeId, duplicate.id)
    expect((await icons.getThemeSettings(duplicate.id)).assignments).toHaveLength(1)

    await icons.deleteIcon(library.id, icon.id)
    expect((await icons.getThemeSettings(themeId)).assignments).toEqual([])
    expect((await icons.getThemeSettings(duplicate.id)).assignments).toEqual([])
    await icons.deleteLibrary(library.id)
    expect((await icons.getThemeSettings(themeId)).enabledLibraryIds).toEqual([])
  })

  it('recovers an interrupted settings replacement without silently resetting corrupt data', async () => {
    const { root, profiles, icons, themeId } = await createStores()
    await icons.assignProject(themeId, 'project-recovery', { libraryId: 'system', iconId: 'star' })
    const settingsPath = join(root, 'project-icons.json')
    await rename(settingsPath, `${settingsPath}.previous`)

    const recovered = new ProjectIconStore(root, profiles)
    await recovered.initialize()
    expect((await recovered.getThemeSettings(themeId)).assignments).toEqual([
      { projectId: 'project-recovery', ref: { libraryId: 'system', iconId: 'star' } }
    ])

    await writeFile(settingsPath, '{invalid json', 'utf8')
    const corrupt = new ProjectIconStore(root, profiles)
    await expect(corrupt.initialize()).rejects.toThrow()
    expect(await readFile(settingsPath, 'utf8')).toBe('{invalid json')
  })

  it('removes controlled temporary files inside library asset directories on startup', async () => {
    const { root, profiles, icons } = await createStores()
    const library = await icons.createLibrary('临时文件测试')
    const temporary = join(root, 'icon-libraries', library.id, 'assets', 'orphan.00000000-0000-4000-8000-000000000010.tmp')
    await writeFile(temporary, TEST_PNG)

    const restarted = new ProjectIconStore(root, profiles)
    await restarted.initialize()
    await expect(stat(temporary)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('round-trips independent icon library packages and rejects tampering and traversal', async () => {
    const { root, icons } = await createStores()
    const source = join(root, 'package-source.png')
    await writeFile(source, TEST_PNG)
    const library = await icons.createLibrary('可分享素材')
    let populated = await icons.importAssets(library.id, [source])
    const originalIcon = populated.icons[0]
    if (!originalIcon) throw new Error('Imported icon missing.')
    populated = await icons.updateIcon(populated.id, originalIcon.id, { name: '分享星星', defaultEnabled: false, defaultWeight: 7 })
    const packagePath = join(root, 'shared.cdsicons')

    await icons.exportLibraryPackage(populated.id, packagePath)
    const archive = unzipSync(await readFile(packagePath))
    const manifestText = Buffer.from(archive['manifest.json']!).toString('utf8')
    expect(manifestText).not.toContain(root)
    expect(Object.keys(archive).every((path) => path === 'manifest.json' || /^assets\/[0-9a-f-]+\.(?:png|webp|jpe?g|gif)$/i.test(path))).toBe(true)

    const imported = await icons.importLibraryPackage(packagePath)
    expect(imported.id).not.toBe(populated.id)
    expect(imported.name).toBe(populated.name)
    expect(imported.icons).toEqual([expect.objectContaining({ name: '分享星星', defaultEnabled: false, defaultWeight: 7 })])

    const exportController = new AbortController()
    exportController.abort()
    const cancelledExportPath = join(root, 'cancelled.cdsicons')
    await expect(icons.exportLibraryPackage(populated.id, cancelledExportPath, exportController.signal)).rejects.toThrow('导出已取消')
    await expect(stat(cancelledExportPath)).rejects.toMatchObject({ code: 'ENOENT' })
    const importController = new AbortController()
    importController.abort()
    const libraryCountBeforeCancellation = (await icons.listLibraries()).length
    await expect(icons.importLibraryPackage(packagePath, importController.signal)).rejects.toThrow('导入已取消')
    expect((await icons.listLibraries()).length).toBe(libraryCountBeforeCancellation)

    const manifest = JSON.parse(manifestText) as { icons: Array<{ path: string }> }
    const assetPath = manifest.icons[0]?.path
    if (!assetPath) throw new Error('Package asset path missing.')
    archive[assetPath] = Buffer.from('tampered')
    const tamperedPath = join(root, 'tampered.cdsicons')
    await writeFile(tamperedPath, zipSync(archive))
    const countBefore = (await icons.listLibraries()).length
    await expect(icons.importLibraryPackage(tamperedPath)).rejects.toThrow('校验失败')
    expect((await icons.listLibraries()).length).toBe(countBefore)

    const traversalPath = join(root, 'traversal.cdsicons')
    const traversalArchive = Buffer.from(zipSync({ 'manifest.json': Buffer.from('{}'), 'assets/abc.png': TEST_PNG }))
    replaceZipEntryName(traversalArchive, 'assets/abc.png', '../outside.png')
    await writeFile(traversalPath, traversalArchive)
    await expect(icons.importLibraryPackage(traversalPath)).rejects.toThrow(/路径无效|invalid relative path/)
    await expect(stat(join(root, 'outside.png'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(icons.exportLibraryPackage(SYSTEM_ICON_LIBRARY_ID, join(root, 'system.cdsicons'))).rejects.toThrow('系统素材库')
  })
})

function replaceZipEntryName(archive: Buffer, source: string, replacement: string): void {
  const sourceBytes = Buffer.from(source)
  const replacementBytes = Buffer.from(replacement)
  if (sourceBytes.length !== replacementBytes.length) throw new Error('ZIP entry replacement must preserve byte length.')
  let offset = 0
  let replacements = 0
  while ((offset = archive.indexOf(sourceBytes, offset)) >= 0) {
    replacementBytes.copy(archive, offset)
    replacements += 1
    offset += replacementBytes.length
  }
  if (replacements < 2) throw new Error('ZIP entry name was not present in both local and central headers.')
}

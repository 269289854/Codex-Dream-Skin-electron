import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { unzipSync, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { ProfileStore } from '../src/main/profile-store'
import { ProjectIconStore } from '../src/main/project-icon-store'
import {
  THEME_SHARE_COMPOSITE_VERSION,
  ThemeShareService,
  parseThemeShareCompositeManifest,
  type ThemeShareCompositeManifest
} from '../src/main/theme-share-service'
import { sha256 } from '../src/main/theme-share'
import { SYSTEM_ICON_LIBRARY_ID } from '../src/shared/project-icons'

const TEST_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('theme sharing with icon libraries', () => {
  it('imports legacy v1/v2 packages through the existing path', async () => {
    const { root, profiles, service } = await createStores('legacy')
    const profile = await profiles.create('兼容主题')
    const v2Path = join(root, 'v2.cdstheme')
    await service.exportTheme(profile, v2Path, false)
    const v2Archive = unzipSync(await readFile(v2Path))
    const v2Manifest = JSON.parse(Buffer.from(v2Archive['manifest.json']!).toString('utf8')) as { version: number }
    expect(v2Manifest.version).toBe(2)
    await expect(service.importTheme(v2Path)).resolves.toMatchObject({ name: profile.name })

    v2Manifest.version = 1
    const v1Path = join(root, 'v1.cdstheme')
    await writeFile(v1Path, zipSync({ ...v2Archive, 'manifest.json': Buffer.from(`${JSON.stringify(v2Manifest)}\n`) }))
    await expect(service.importTheme(v1Path)).resolves.toMatchObject({ name: profile.name })
  })

  it('round-trips enabled libraries with fresh IDs while excluding all project-private data', async () => {
    const { root, profiles, icons, service } = await createStores('roundtrip')
    const profile = await profiles.create('素材主题')
    const sourcePath = join(root, 'shared-icon.png')
    await writeFile(sourcePath, TEST_PNG)
    const sourceLibrary = await icons.createLibrary('随主题素材')
    const populated = await icons.importAssets(sourceLibrary.id, [sourcePath])
    const emptyLibrary = await icons.createLibrary('空素材')
    const sourceIcon = populated.icons[0]
    if (!sourceIcon) throw new Error('Imported icon missing.')
    await icons.setEnabledLibraries(profile.id, [SYSTEM_ICON_LIBRARY_ID, populated.id, emptyLibrary.id])
    await icons.setWeightOverride(profile.id, { libraryId: populated.id, iconId: sourceIcon.id }, true, 8)
    await icons.cacheProjects([{ id: 'project-private-001', label: 'Private Workspace', kind: 'workspace', sessions: [{ id: 'local:private-session-001', title: 'Private Session' }] }])
    await icons.assignProject(profile.id, 'project-private-001', { libraryId: populated.id, iconId: sourceIcon.id })
    await icons.assignSession(profile.id, 'project-private-001', 'local:private-session-001', { libraryId: populated.id, iconId: sourceIcon.id })

    const packagePath = join(root, 'with-icons.cdstheme')
    await service.exportTheme(profile, packagePath, true)
    const archive = unzipSync(await readFile(packagePath))
    const manifestText = Buffer.from(archive['manifest.json']!).toString('utf8')
    const manifest = parseThemeShareCompositeManifest(JSON.parse(manifestText))
    expect(manifest.version).toBe(THEME_SHARE_COMPOSITE_VERSION)
    expect(manifest.iconLibraries).toHaveLength(1)
    expect(manifest.projectIconSettings.enabledLibraryIds).not.toContain(emptyLibrary.id)
    expect(Object.keys(archive).sort()).toEqual([
      `icon-libraries/${populated.id}.cdsicons`,
      'manifest.json',
      'theme.cdstheme'
    ].sort())
    expect(manifestText).not.toContain('assignments')
    expect(manifestText).not.toContain('allocationFingerprint')
    expect(manifestText).not.toContain('randomAssignments')
    expect(manifestText).not.toContain('randomSessionAssignments')
    expect(manifestText).not.toContain('projects')
    expect(manifestText).not.toContain('project-private-001')
    expect(manifestText).not.toContain('Private Workspace')
    expect(manifestText).not.toContain('private-session-001')
    expect(manifestText).not.toContain('Private Session')
    expect(Buffer.from(archive[`icon-libraries/${populated.id}.cdsicons`]!).toString('latin1')).not.toContain(root)

    const importedTheme = await service.importTheme(packagePath)
    expect(importedTheme.id).not.toBe(profile.id)
    const settings = await icons.getThemeSettings(importedTheme.id)
    expect(settings.assignments).toEqual([])
    expect(settings.sessionAssignments).toEqual([])
    expect(settings.enabledLibraryIds).toContain(SYSTEM_ICON_LIBRARY_ID)
    const importedLibraryId = settings.enabledLibraryIds.find((id) => id !== SYSTEM_ICON_LIBRARY_ID)
    expect(importedLibraryId).toBeDefined()
    expect(importedLibraryId).not.toBe(populated.id)
    const importedLibrary = await icons.getLibrary(importedLibraryId!)
    const importedIcon = importedLibrary.icons[0]
    expect(importedLibrary.name).toBe(populated.name)
    expect(importedIcon?.id).not.toBe(sourceIcon.id)
    expect(settings.weightOverrides).toEqual([{
      ref: { libraryId: importedLibrary.id, iconId: importedIcon?.id },
      enabled: true,
      weight: 8
    }])
  })

  it('rejects private fields in v3 manifests before import', async () => {
    const { root, profiles, service } = await createStores('privacy-schema')
    const profile = await profiles.create('隐私校验')
    const packagePath = join(root, 'privacy.cdstheme')
    await service.exportTheme(profile, packagePath, true)
    const archive = unzipSync(await readFile(packagePath))
    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as ThemeShareCompositeManifest & { projectIconSettings: ThemeShareCompositeManifest['projectIconSettings'] & { assignments?: unknown[] } }
    manifest.projectIconSettings.assignments = [{ projectId: 'private' }]
    expect(() => parseThemeShareCompositeManifest(manifest)).toThrow()
  })

  it('cancels v3 import and export without committing local data', async () => {
    const { root, profiles, icons, service } = await createStores('cancel')
    const profile = await profiles.create('取消主题')
    const cancelledPath = join(root, 'cancelled.cdstheme')
    const exportController = new AbortController()
    exportController.abort()
    await expect(service.exportTheme(profile, cancelledPath, true, exportController.signal)).rejects.toThrow('导出已取消')
    await expect(readFile(cancelledPath)).rejects.toMatchObject({ code: 'ENOENT' })

    const packagePath = join(root, 'valid.cdstheme')
    await service.exportTheme(profile, packagePath, true)
    const themesBefore = (await profiles.list()).map((theme) => theme.id)
    const librariesBefore = (await icons.listLibraries()).map((library) => library.id)
    const importController = new AbortController()
    importController.abort()
    await expect(service.importTheme(packagePath, importController.signal)).rejects.toThrow('导入已取消')
    expect((await profiles.list()).map((theme) => theme.id)).toEqual(themesBefore)
    expect((await icons.listLibraries()).map((library) => library.id)).toEqual(librariesBefore)
  })

  it('rolls back a created theme and earlier libraries when a later embedded library is invalid', async () => {
    const { root, profiles, icons, service } = await createStores('rollback')
    const profile = await profiles.create('回滚主题')
    const sourcePath = join(root, 'rollback-icon.png')
    await writeFile(sourcePath, TEST_PNG)
    const first = await icons.importAssets((await icons.createLibrary('第一素材')).id, [sourcePath])
    const second = await icons.importAssets((await icons.createLibrary('第二素材')).id, [sourcePath])
    await icons.setEnabledLibraries(profile.id, [SYSTEM_ICON_LIBRARY_ID, first.id, second.id])
    const packagePath = join(root, 'rollback.cdstheme')
    await service.exportTheme(profile, packagePath, true)
    const archive = unzipSync(await readFile(packagePath))
    const manifest = JSON.parse(Buffer.from(archive['manifest.json']!).toString('utf8')) as ThemeShareCompositeManifest
    const broken = Buffer.from('not a zip package')
    const brokenEntry = manifest.iconLibraries[1]
    if (!brokenEntry) throw new Error('Second embedded library missing.')
    brokenEntry.package.size = broken.byteLength
    brokenEntry.package.sha256 = sha256(broken)
    archive[brokenEntry.package.path] = broken
    archive['manifest.json'] = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
    const tamperedPath = join(root, 'rollback-tampered.cdstheme')
    await writeFile(tamperedPath, zipSync(archive))

    const themeIdsBefore = (await profiles.list()).map((theme) => theme.id).sort()
    const libraryIdsBefore = (await icons.listLibraries()).map((library) => library.id).sort()
    await expect(service.importTheme(tamperedPath)).rejects.toThrow()
    expect((await profiles.list()).map((theme) => theme.id).sort()).toEqual(themeIdsBefore)
    expect((await icons.listLibraries()).map((library) => library.id).sort()).toEqual(libraryIdsBefore)
    expect((await readdir(profiles.root)).filter((name) => name.startsWith('.cdstheme-v3-'))).toEqual([])
    expect((await readdir(icons.librariesRoot)).filter((name) => name.startsWith('.cdsicons-import-'))).toEqual([])
  })
})

async function createStores(suffix: string): Promise<{
  root: string
  profiles: ProfileStore
  icons: ProjectIconStore
  service: ThemeShareService
}> {
  const root = await mkdtemp(join(tmpdir(), `dream-skin-theme-icons-${suffix}-`))
  roots.push(root)
  const profiles = new ProfileStore(root)
  await profiles.initialize()
  const icons = new ProjectIconStore(root, profiles)
  await icons.initialize()
  return { root, profiles, icons, service: new ThemeShareService(profiles, icons) }
}

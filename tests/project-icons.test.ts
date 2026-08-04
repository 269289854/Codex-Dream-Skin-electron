import { mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { unzipSync, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { ProfileStore } from '../src/main/profile-store'
import { ProjectIconStore } from '../src/main/project-icon-store'
import {
  SYSTEM_ICON_LIBRARY_ID,
  allocateStableUniqueIcons,
  createSystemIconLibrary,
  projectIconPoolFingerprint,
  selectStableProjectIcon,
  selectStableSessionIcon,
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
    const session = selectStableSessionIcon('00000000-0000-4000-8000-000000000001', 'project-1', 'local:session-1', candidates, first)
    expect(session?.ref).not.toEqual(first?.ref)
    expect(selectStableSessionIcon('00000000-0000-4000-8000-000000000001', 'project-1', 'local:session-1', first ? [first] : [], first)).toBeNull()
    expect(selectStableSessionIcon('00000000-0000-4000-8000-000000000001', 'project-1', 'local:session-1', candidates, first)).toEqual(session)
  })

  it('allocates weighted icons without replacement and retains cached results', () => {
    const candidates: RuntimeProjectIconCandidate[] = [
      { ref: { libraryId: 'system', iconId: 'star' }, weight: 1 },
      { ref: { libraryId: 'system', iconId: 'heart' }, weight: 10 },
      { ref: { libraryId: 'system', iconId: 'moon' }, weight: 3 }
    ]
    const first = allocateStableUniqueIcons('theme-projects', ['project-1', 'project-2'], candidates)
    expect(new Set(first.map((entry) => entry.icon.ref.iconId)).size).toBe(2)

    const retained = allocateStableUniqueIcons(
      'theme-projects',
      ['project-1', 'project-2', 'project-3'],
      candidates,
      [],
      first.map((entry) => ({ targetId: entry.targetId, ref: entry.icon.ref }))
    )
    expect(retained.find((entry) => entry.targetId === 'project-1')?.icon.ref).toEqual(first.find((entry) => entry.targetId === 'project-1')?.icon.ref)
    expect(retained.find((entry) => entry.targetId === 'project-2')?.icon.ref).toEqual(first.find((entry) => entry.targetId === 'project-2')?.icon.ref)
    expect(new Set(retained.map((entry) => entry.icon.ref.iconId)).size).toBe(3)

    const exhausted = allocateStableUniqueIcons('theme-projects', ['project-1', 'project-2', 'project-3'], candidates, [{ libraryId: 'system', iconId: 'star' }])
    expect(exhausted).toHaveLength(2)
    expect(exhausted.map((entry) => entry.icon.ref.iconId)).not.toContain('star')
    expect(projectIconPoolFingerprint([...candidates].reverse())).toBe(projectIconPoolFingerprint(candidates))
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
    await icons.cacheProjects([{ id: 'project-1', label: '示例项目', kind: 'local', sessions: [{ id: 'local:session-1', title: '隐私会话标题' }] }])
    await icons.assignProject(themeId, 'project-1', { libraryId: library.id, iconId: icon.id })
    await icons.assignSession(themeId, 'project-1', 'local:session-1', { libraryId: 'system', iconId: 'heart' })
    await expect(icons.setSessionIconsEnabled(false)).resolves.toBe(false)

    const runtime = await icons.compileRuntimeConfig(themeId)
    const systemStar = runtime.pool.find((entry) => entry.builtinName === 'star')?.dataUrl
    expect(systemStar).toMatch(/^data:image\/svg\+xml;base64,/)
    const systemStarSvg = Buffer.from(systemStar?.split(',')[1] ?? '', 'base64').toString('utf8')
    expect(systemStarSvg).toContain('viewBox="0 0 64 64"')
    expect(systemStarSvg).toContain('#FFE5A5')
    expect(runtime.pool.find((entry) => entry.ref.iconId === icon.id)).toMatchObject({ weight: 8, dataUrl: expect.stringContaining('data:image/png;base64,') })
    expect(runtime.assignments).toEqual([expect.objectContaining({ projectId: 'project-1', icon: expect.objectContaining({ dataUrl: expect.any(String) }) })])
    expect(runtime.showSessionIcons).toBe(false)
    expect(runtime.sessionAssignments).toEqual([expect.objectContaining({ projectId: 'project-1', sessionId: 'local:session-1', icon: expect.objectContaining({ builtinName: 'heart' }) })])
    expect(await icons.listCachedProjects()).toEqual([expect.objectContaining({ id: 'project-1', label: '示例项目', sessions: [expect.objectContaining({ id: 'local:session-1', title: '隐私会话标题' })] })])

    const shareable = await icons.getShareableThemeSettings(themeId)
    expect(shareable).not.toHaveProperty('assignments')
    expect(shareable).not.toHaveProperty('sessionAssignments')
    expect(JSON.stringify(shareable)).not.toContain('project-1')
    expect(JSON.stringify(shareable)).not.toContain('local:session-1')
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
    const projectUpdate = icons.cacheProjects([{ id: 'concurrent-project', label: '并发项目', kind: 'local', sessions: [] }])
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
      { id: 'old-a', label: 'Alpha', kind: 'local', sessions: [] },
      { id: 'old-b', label: 'Beta', kind: 'local', sessions: [] }
    ])

    await expect(icons.cacheProjects([
      { id: 'new-z', label: 'Zulu', kind: 'local', sessions: [] },
      { id: 'old-b', label: 'Beta updated', kind: 'workspace', sessions: [] }
    ])).resolves.toEqual([
      expect.objectContaining({ id: 'new-z', label: 'Zulu' }),
      expect.objectContaining({ id: 'old-b', label: 'Beta updated', kind: 'workspace' }),
      expect.objectContaining({ id: 'old-a', label: 'Alpha' })
    ])

    await expect(icons.cacheProjects([
      { id: 'old-a', label: 'Alpha', kind: 'local', sessions: [] },
      { id: 'new-z', label: 'Zulu', kind: 'local', sessions: [] }
    ])).resolves.toEqual([
      expect.objectContaining({ id: 'old-a' }),
      expect.objectContaining({ id: 'new-z' }),
      expect.objectContaining({ id: 'old-b' })
    ])
  })

  it('keeps project and sibling session random icons unique without moving existing allocations', async () => {
    const { root, icons, themeId } = await createStores()
    const library = await icons.createLibrary('去重素材')
    const sources = ['one.png', 'two.png', 'three.png'].map((name) => join(root, name))
    await Promise.all(sources.map((source) => writeFile(source, TEST_PNG)))
    const imported = await icons.importAssets(library.id, sources)
    const refs = imported.icons.map((icon) => ({ libraryId: library.id, iconId: icon.id }))
    const firstRef = refs[0]
    if (!firstRef) throw new Error('Test icon missing.')
    await icons.setEnabledLibraries(themeId, [library.id])
    await icons.cacheProjects([
      { id: 'project-1', label: 'Project 1', kind: 'local', sessions: [] },
      { id: 'project-2', label: 'Project 2', kind: 'local', sessions: [
        { id: 'local:session-1', title: 'Session 1' },
        { id: 'local:session-2', title: 'Session 2' },
        { id: 'local:session-3', title: 'Session 3' }
      ] },
      { id: 'project-3', label: 'Project 3', kind: 'local', sessions: [
        { id: 'local:session-4', title: 'Session 4' },
        { id: 'local:session-5', title: 'Session 5' }
      ] }
    ])
    await icons.assignProject(themeId, 'project-1', firstRef)
    await icons.assignSession(themeId, 'project-2', 'local:session-1', firstRef)

    const first = await icons.getThemeSettings(themeId)
    const projectIcons = new Map(first.randomAssignments.map((entry) => [entry.projectId, entry.ref.iconId]))
    expect(projectIcons.size).toBe(2)
    expect(new Set(projectIcons.values()).size).toBe(2)
    expect([...projectIcons.values()]).not.toContain(firstRef.iconId)

    const project2Sessions = first.randomSessionAssignments.filter((entry) => entry.projectId === 'project-2')
    expect(project2Sessions).toHaveLength(1)
    expect(project2Sessions[0]?.ref.iconId).not.toBe(firstRef.iconId)
    expect(project2Sessions[0]?.ref.iconId).not.toBe(projectIcons.get('project-2'))
    const project3Sessions = first.randomSessionAssignments.filter((entry) => entry.projectId === 'project-3')
    expect(project3Sessions).toHaveLength(2)
    expect(new Set(project3Sessions.map((entry) => entry.ref.iconId)).size).toBe(2)
    expect(project3Sessions.map((entry) => entry.ref.iconId)).not.toContain(projectIcons.get('project-3'))

    await icons.cacheProjects([{ id: 'project-5', label: 'Project 5', kind: 'local', sessions: [] }])
    const afterDiscovery = await icons.getThemeSettings(themeId)
    for (const [projectId, iconId] of projectIcons) {
      expect(afterDiscovery.randomAssignments.find((entry) => entry.projectId === projectId)?.ref.iconId).toBe(iconId)
    }
    expect(afterDiscovery.randomAssignments.some((entry) => entry.projectId === 'project-5')).toBe(false)

    const previousFingerprint = afterDiscovery.allocationFingerprint
    await icons.setWeightOverride(themeId, refs[1]!, true, 9)
    const afterWeightChange = await icons.getThemeSettings(themeId)
    expect(afterWeightChange.allocationFingerprint).not.toBe(previousFingerprint)
    expect(new Set(afterWeightChange.randomAssignments.map((entry) => entry.ref.iconId)).size).toBe(afterWeightChange.randomAssignments.length)

    const runtime = await icons.compileRuntimeConfig(themeId)
    expect(runtime.assignments).toHaveLength(3)
    expect(runtime.assignments.map((entry) => entry.projectId)).toContain('project-1')
    expect(new Set(runtime.assignments.map((entry) => entry.icon.ref.iconId)).size).toBe(3)
    expect(JSON.stringify(runtime)).not.toContain('Session 1')
    const shareable = await icons.getShareableThemeSettings(themeId)
    expect(shareable).not.toHaveProperty('allocationFingerprint')
    expect(shareable).not.toHaveProperty('randomAssignments')
    expect(shareable).not.toHaveProperty('randomSessionAssignments')
  })

  it('keeps every newly discovered session ahead of historical sessions at the global cache limit', async () => {
    const { icons } = await createStores()
    const historicalSessions = Array.from({ length: 10_000 }, (_, index) => ({
      id: `local:historical-${index}`,
      title: `Historical ${index}`
    }))
    await icons.cacheProjects([{ id: 'project-a', label: 'Project A', kind: 'local', sessions: historicalSessions }])

    const cached = await icons.cacheProjects([
      { id: 'project-a', label: 'Project A', kind: 'local', sessions: [{ id: 'local:current-a', title: 'Current A' }] },
      { id: 'project-b', label: 'Project B', kind: 'local', sessions: [{ id: 'local:current-b', title: 'Current B' }] }
    ])

    expect(cached.reduce((count, project) => count + project.sessions.length, 0)).toBe(10_000)
    expect(cached[0]?.sessions[0]?.id).toBe('local:current-a')
    expect(cached[1]?.sessions).toEqual([expect.objectContaining({ id: 'local:current-b' })])
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
    await icons.assignSession(themeId, 'project-2', 'local:session-2', { libraryId: library.id, iconId: icon.id })
    const sourceSettings = await icons.getThemeSettings(themeId)
    await icons.restoreThemeSettings(themeId, {
      ...sourceSettings,
      allocationFingerprint: 'a'.repeat(64),
      randomAssignments: [{ projectId: 'derived-project', ref: { libraryId: 'system', iconId: 'star' } }],
      randomSessionAssignments: [{ projectId: 'derived-project', sessionId: 'local:derived-session', ref: { libraryId: 'system', iconId: 'heart' } }]
    })

    const duplicate = await profiles.duplicate(await profiles.get(themeId), '副本')
    await icons.copyThemeSettings(themeId, duplicate.id)
    const storedAfterCopy = JSON.parse(await readFile(join(root, 'project-icons.json'), 'utf8')) as ProjectIconPrivateSettings
    expect(storedAfterCopy.themes[duplicate.id]).toMatchObject({
      allocationFingerprint: '',
      randomAssignments: [],
      randomSessionAssignments: []
    })
    expect((await icons.getThemeSettings(duplicate.id)).assignments).toHaveLength(1)
    expect((await icons.getThemeSettings(duplicate.id)).sessionAssignments).toHaveLength(1)

    await icons.deleteIcon(library.id, icon.id)
    expect((await icons.getThemeSettings(themeId)).assignments).toEqual([])
    expect((await icons.getThemeSettings(duplicate.id)).assignments).toEqual([])
    expect((await icons.getThemeSettings(themeId)).sessionAssignments).toEqual([])
    expect((await icons.getThemeSettings(duplicate.id)).sessionAssignments).toEqual([])
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

  it('migrates v1 private settings without losing project assignments', async () => {
    const { root, profiles, themeId } = await createStores()
    const settingsPath = join(root, 'project-icons.json')
    await writeFile(settingsPath, `${JSON.stringify({
      version: 1,
      themes: {
        [themeId]: {
          enabledLibraryIds: ['system'],
          weightOverrides: [],
          assignments: [{ projectId: 'legacy-project', ref: { libraryId: 'system', iconId: 'star' } }]
        }
      },
      projects: [{ id: 'legacy-project', label: 'Legacy', kind: 'local', lastSeenAt: '2026-08-01T00:00:00.000Z' }]
    }, null, 2)}\n`, 'utf8')

    const migrated = new ProjectIconStore(root, profiles)
    await migrated.initialize()
    expect(await migrated.getSessionIconsEnabled()).toBe(true)
    expect(await migrated.getThemeSettings(themeId)).toMatchObject({
      assignments: [{ projectId: 'legacy-project', ref: { libraryId: 'system', iconId: 'star' } }],
      sessionAssignments: []
    })
    expect(await migrated.listCachedProjects()).toEqual([expect.objectContaining({ id: 'legacy-project', sessions: [] })])
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toMatchObject({ version: 3, showSessionIcons: true })
  })

  it('migrates v2 private settings without losing sessions or manual assignments', async () => {
    const { root, profiles, themeId } = await createStores()
    const settingsPath = join(root, 'project-icons.json')
    await writeFile(settingsPath, `${JSON.stringify({
      version: 2,
      showSessionIcons: false,
      themes: {
        [themeId]: {
          enabledLibraryIds: ['system'],
          weightOverrides: [],
          assignments: [{ projectId: 'project-v2', ref: { libraryId: 'system', iconId: 'star' } }],
          sessionAssignments: [{ projectId: 'project-v2', sessionId: 'local:session-v2', ref: { libraryId: 'system', iconId: 'heart' } }]
        }
      },
      projects: [{
        id: 'project-v2',
        label: 'Version 2',
        kind: 'local',
        lastSeenAt: '2026-08-01T00:00:00.000Z',
        sessions: [{ id: 'local:session-v2', title: 'Private title', lastSeenAt: '2026-08-01T00:00:00.000Z' }]
      }]
    }, null, 2)}\n`, 'utf8')

    const migrated = new ProjectIconStore(root, profiles)
    await migrated.initialize()
    expect(await migrated.getSessionIconsEnabled()).toBe(false)
    expect(await migrated.getThemeSettings(themeId)).toMatchObject({
      assignments: [{ projectId: 'project-v2', ref: { libraryId: 'system', iconId: 'star' } }],
      sessionAssignments: [{ projectId: 'project-v2', sessionId: 'local:session-v2', ref: { libraryId: 'system', iconId: 'heart' } }],
      randomAssignments: [],
      randomSessionAssignments: [],
      allocationFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/)
    })
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toMatchObject({ version: 3, showSessionIcons: false })
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

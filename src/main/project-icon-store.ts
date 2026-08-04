import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import sharp from 'sharp'
import {
  MAX_CACHED_CODEX_SESSIONS,
  MAX_PROJECT_ICON_LIBRARY_ENTRIES,
  PROJECT_ICON_LIBRARY_VERSION,
  PROJECT_ICON_SETTINGS_VERSION,
  SYSTEM_ICON_LIBRARY_ID,
  SYSTEM_ICON_NAMES,
  cachedCodexProjectSchema,
  allocateStableUniqueIcons,
  createDefaultThemeProjectIconSettings,
  createSystemIconLibrary,
  customIconLibrarySchema,
  discoveredCodexProjectSchema,
  projectIconPrivateSettingsSchema,
  projectIconPrivateSettingsV1Schema,
  projectIconPrivateSettingsV2Schema,
  projectIconPoolFingerprint,
  projectIconRefKey,
  projectIconRefSchema,
  resolveProjectIconWeight,
  themeProjectIconSettingsSchema,
  type CachedCodexProject,
  type CustomIconLibrary,
  type CustomLibraryIcon,
  type IconLibrary,
  type IconLibrarySummary,
  type ProjectIconPrivateSettings,
  type ProjectIconRef,
  type RuntimeProjectIconCandidate,
  type RuntimeProjectIconConfig,
  type SystemIconName,
  type SystemIconLibrary,
  type ThemeProjectIconSettings
} from '../shared/project-icons'
import type { ImportedAsset } from '../shared/contracts'
import { assertSafeSvgSource, inspectImageBytes } from './asset-validation'
import { dataUrlByteLength, EmbeddedAssetBudget } from './embedded-assets'
import { prepareIconGif } from './icon-assets'
import type { ProfileStore } from './profile-store'
import { exportIconLibraryPackage, extractIconLibraryPackage } from './icon-library-share'
import { BuiltinIconAssetStore } from './builtin-icon-assets'

const MAX_ICON_BYTES = 30 * 1024 * 1024
const SUPPORTED_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg'])
const LIBRARY_DELETE_PATTERN = /^\.library-delete-([0-9a-f-]{36})-[0-9a-f-]{36}$/i
const CONTROLLED_TEMP_FILE_PATTERN = /\.[0-9a-f-]{36}\.tmp$/i
export interface ResolvedProjectIconMedia {
  path: string
  mimeType: string
  size: number
}

export interface ImportedIconLibraryPackage {
  library: CustomIconLibrary
  iconIdMap: Map<string, string>
}

export type ThemeIconLibrarySelection =
  | { kind: 'builtin'; name: SystemIconName }
  | { kind: 'asset'; imported: ImportedAsset }

export class ProjectIconStore {
  readonly librariesRoot: string
  private readonly settingsPath: string
  private readonly builtinIconAssets: BuiltinIconAssetStore
  private settingsTail: Promise<void> = Promise.resolve()

  constructor(readonly root: string, private readonly profiles: ProfileStore, builtinIconAssets: BuiltinIconAssetStore) {
    this.librariesRoot = join(root, 'icon-libraries')
    this.settingsPath = join(root, 'project-icons.json')
    this.builtinIconAssets = builtinIconAssets
  }

  getSystemIconDataUrl(name: string): Promise<string | null> {
    if (!SYSTEM_ICON_NAMES.includes(name as SystemIconName)) return Promise.resolve(null)
    return this.builtinIconAssets.getDataUrl(name as SystemIconName)
  }

  async initialize(): Promise<void> {
    await mkdir(this.librariesRoot, { recursive: true })
    await this.cleanupStartupArtifacts()
    try {
      const raw = await this.readJsonWithRecovery(this.settingsPath, (content) => JSON.parse(content) as unknown)
      const current = projectIconPrivateSettingsSchema.safeParse(raw)
      if (!current.success) await this.writeSettings(migratePrivateSettings(raw))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await this.writeSettings({ version: PROJECT_ICON_SETTINGS_VERSION, showSessionIcons: true, themes: {}, projects: [] })
    }
  }

  async listLibraries(): Promise<IconLibrarySummary[]> {
    const libraries = await this.loadCustomLibraries()
    const system = createSystemIconLibrary()
    return [
      { id: system.id, name: system.name, system: true, iconCount: system.icons.length, updatedAt: system.updatedAt },
      ...libraries.map((library) => ({ id: library.id, name: library.name, system: false, iconCount: library.icons.length, updatedAt: library.updatedAt }))
    ]
  }

  async getLibrary(input: unknown): Promise<IconLibrary> {
    if (input === SYSTEM_ICON_LIBRARY_ID) return createSystemIconLibrary()
    const id = parseUuid(input, '素材库 ID 无效。')
    const library = await this.readJsonWithRecovery(this.libraryPath(id), (content) => customIconLibrarySchema.parse(JSON.parse(content)))
    if (library.id !== id) throw new Error('素材库目录与配置 ID 不匹配。')
    return library
  }

  async createLibrary(input: unknown): Promise<CustomIconLibrary> {
    const name = cleanName(input, '素材库名称')
    const library = customIconLibrarySchema.parse({
      version: PROJECT_ICON_LIBRARY_VERSION,
      id: randomUUID(),
      name,
      updatedAt: new Date().toISOString(),
      icons: []
    })
    await this.writeLibrary(library)
    return library
  }

  async exportLibraryPackage(libraryIdInput: unknown, destinationPathInput: unknown, signal?: AbortSignal): Promise<void> {
    try {
      const library = await this.requireCustomLibrary(libraryIdInput)
      if (typeof destinationPathInput !== 'string') throw new Error('素材库包保存路径无效。')
      await exportIconLibraryPackage(library, this.libraryRoot(library.id), destinationPathInput, signal)
    } catch (error) {
      if (signal?.aborted) throw new Error('素材库导出已取消。')
      throw error
    }
  }

  async importLibraryPackage(sourcePathInput: unknown, signal?: AbortSignal): Promise<CustomIconLibrary> {
    return (await this.importLibraryPackageWithMapping(sourcePathInput, signal)).library
  }

  async importLibraryPackageWithMapping(sourcePathInput: unknown, signal?: AbortSignal): Promise<ImportedIconLibraryPackage> {
    if (typeof sourcePathInput !== 'string') throw new Error('素材库包路径无效。')
    const extracted = await extractIconLibraryPackage(sourcePathInput, this.librariesRoot, signal)
    let created: CustomIconLibrary | null = null
    try {
      this.throwIfAborted(signal, '素材库导入已取消。')
      created = await this.createLibrary(extracted.manifest.libraryName)
      const imported = await this.importAssets(created.id, extracted.assetPaths, signal)
      const iconIdMap = new Map<string, string>()
      const icons = imported.icons.map((icon, index) => {
        const manifestIcon = extracted.manifest.icons[index]
        if (!manifestIcon) throw new Error('素材库包图标顺序无效。')
        iconIdMap.set(manifestIcon.id, icon.id)
        return {
          ...icon,
          name: manifestIcon.name,
          defaultEnabled: manifestIcon.defaultEnabled,
          defaultWeight: manifestIcon.defaultWeight,
          originalName: manifestIcon.originalName
        }
      })
      const library = customIconLibrarySchema.parse({ ...imported, name: extracted.manifest.libraryName, icons, updatedAt: new Date().toISOString() })
      await this.writeLibrary(library)
      return { library, iconIdMap }
    } catch (error) {
      if (created) await rm(this.libraryRoot(created.id), { recursive: true, force: true }).catch(() => undefined)
      if (signal?.aborted) throw new Error('素材库导入已取消。')
      throw error
    } finally {
      await rm(extracted.root, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  async renameLibrary(libraryId: unknown, input: unknown): Promise<CustomIconLibrary> {
    const library = await this.requireCustomLibrary(libraryId)
    const next = customIconLibrarySchema.parse({ ...library, name: cleanName(input, '素材库名称'), updatedAt: new Date().toISOString() })
    await this.writeLibrary(next)
    return next
  }

  async deleteLibrary(input: unknown): Promise<void> {
    const library = await this.requireCustomLibrary(input)
    const source = this.libraryRoot(library.id)
    const tombstone = join(this.librariesRoot, `.library-delete-${library.id}-${randomUUID()}`)
    await rename(source, tombstone)
    try {
      await this.updateSettings((settings) => {
        const themes = Object.fromEntries(Object.entries(settings.themes).map(([themeId, theme]) => [themeId, {
          ...theme,
          enabledLibraryIds: theme.enabledLibraryIds.filter((id) => id !== library.id),
          weightOverrides: theme.weightOverrides.filter((entry) => entry.ref.libraryId !== library.id),
          assignments: theme.assignments.filter((entry) => entry.ref.libraryId !== library.id),
          sessionAssignments: theme.sessionAssignments.filter((entry) => entry.ref.libraryId !== library.id),
          randomAssignments: theme.randomAssignments.filter((entry) => entry.ref.libraryId !== library.id),
          randomSessionAssignments: theme.randomSessionAssignments.filter((entry) => entry.ref.libraryId !== library.id)
        }]))
        return { ...settings, themes }
      })
    } catch (error) {
      await rename(tombstone, source).catch(() => undefined)
      throw error
    }
    await rm(tombstone, { recursive: true, force: true })
  }

  async importAssets(libraryId: unknown, pathsInput: unknown, signal?: AbortSignal): Promise<CustomIconLibrary> {
    const library = await this.requireCustomLibrary(libraryId)
    if (!Array.isArray(pathsInput) || pathsInput.length < 1 || pathsInput.length > MAX_PROJECT_ICON_LIBRARY_ENTRIES) {
      throw new Error('请选择有效的图标素材。')
    }
    const paths = pathsInput.map((path) => {
      if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('图标素材路径必须是绝对路径。')
      return path
    })
    if (library.icons.length + paths.length > MAX_PROJECT_ICON_LIBRARY_ENTRIES) throw new Error('单个素材库最多包含 128 个图标。')

    const created: string[] = []
    const icons: CustomLibraryIcon[] = []
    try {
      for (const path of paths) {
        this.throwIfAborted(signal, '素材库导入已取消。')
        const imported = await this.importOneAsset(library.id, path, signal)
        created.push(imported.asset)
        icons.push(imported.icon)
      }
      const next = customIconLibrarySchema.parse({
        ...library,
        updatedAt: new Date().toISOString(),
        icons: [...library.icons, ...icons]
      })
      await this.writeLibrary(next)
      return next
    } catch (error) {
      await Promise.all(created.map((asset) => rm(this.resolveAsset(library.id, asset), { force: true }).catch(() => undefined)))
      throw error
    }
  }

  async updateIcon(libraryId: unknown, iconIdInput: unknown, updateInput: unknown): Promise<CustomIconLibrary> {
    const library = await this.requireCustomLibrary(libraryId)
    const iconId = parseUuid(iconIdInput, '图标 ID 无效。')
    if (!updateInput || typeof updateInput !== 'object') throw new Error('图标设置无效。')
    const update = updateInput as { name?: unknown; defaultEnabled?: unknown; defaultWeight?: unknown }
    const index = library.icons.findIndex((icon) => icon.id === iconId)
    const current = library.icons[index]
    if (index < 0 || !current) throw new Error('图标不存在。')
    const nextIcon = {
      ...current,
      ...(update.name === undefined ? {} : { name: cleanName(update.name, '图标名称') }),
      ...(update.defaultEnabled === undefined ? {} : { defaultEnabled: parseBoolean(update.defaultEnabled) }),
      ...(update.defaultWeight === undefined ? {} : { defaultWeight: parseWeight(update.defaultWeight) })
    }
    const icons = [...library.icons]
    icons[index] = nextIcon
    const next = customIconLibrarySchema.parse({ ...library, updatedAt: new Date().toISOString(), icons })
    await this.writeLibrary(next)
    return next
  }

  async deleteIcon(libraryId: unknown, iconIdInput: unknown): Promise<CustomIconLibrary> {
    const library = await this.requireCustomLibrary(libraryId)
    const iconId = parseUuid(iconIdInput, '图标 ID 无效。')
    const icon = library.icons.find((candidate) => candidate.id === iconId)
    if (!icon) throw new Error('图标不存在。')
    const next = customIconLibrarySchema.parse({
      ...library,
      updatedAt: new Date().toISOString(),
      icons: library.icons.filter((candidate) => candidate.id !== iconId)
    })
    await this.writeLibrary(next)
    try {
      await this.updateSettings((settings) => ({
        ...settings,
        themes: Object.fromEntries(Object.entries(settings.themes).map(([themeId, theme]) => [themeId, {
          ...theme,
          weightOverrides: theme.weightOverrides.filter((entry) => !(entry.ref.libraryId === library.id && entry.ref.iconId === iconId)),
          assignments: theme.assignments.filter((entry) => !(entry.ref.libraryId === library.id && entry.ref.iconId === iconId)),
          sessionAssignments: theme.sessionAssignments.filter((entry) => !(entry.ref.libraryId === library.id && entry.ref.iconId === iconId)),
          randomAssignments: theme.randomAssignments.filter((entry) => !(entry.ref.libraryId === library.id && entry.ref.iconId === iconId)),
          randomSessionAssignments: theme.randomSessionAssignments.filter((entry) => !(entry.ref.libraryId === library.id && entry.ref.iconId === iconId))
        }]))
      }))
    } catch (error) {
      await this.writeLibrary(library).catch(() => undefined)
      throw error
    }
    await rm(this.resolveAsset(library.id, icon.asset), { force: true })
    return next
  }

  async getThemeSettings(themeIdInput: unknown): Promise<ThemeProjectIconSettings> {
    const themeId = parseUuid(themeIdInput, '主题 ID 无效。')
    await this.profiles.get(themeId)
    return this.reconcileThemeAllocations(themeId)
  }

  async getSessionIconsEnabled(): Promise<boolean> {
    return (await this.readSettings()).showSessionIcons
  }

  async setSessionIconsEnabled(input: unknown): Promise<boolean> {
    const enabled = parseBoolean(input)
    await this.updateSettings((settings) => ({ ...settings, showSessionIcons: enabled }))
    return enabled
  }

  async setEnabledLibraries(themeIdInput: unknown, idsInput: unknown): Promise<ThemeProjectIconSettings> {
    const themeId = parseUuid(themeIdInput, '主题 ID 无效。')
    await this.profiles.get(themeId)
    if (!Array.isArray(idsInput) || idsInput.length > 32) throw new Error('主题素材库选择无效。')
    const ids = [...new Set(idsInput.map((id) => parseLibraryId(id)))]
    await Promise.all(ids.map((id) => this.getLibrary(id)))
    return this.updateTheme(themeId, (current) => ({ ...current, enabledLibraryIds: ids }))
  }

  async setWeightOverride(
    themeIdInput: unknown,
    refInput: unknown,
    enabledInput: unknown,
    weightInput: unknown
  ): Promise<ThemeProjectIconSettings> {
    const themeId = parseUuid(themeIdInput, '主题 ID 无效。')
    await this.profiles.get(themeId)
    const ref = projectIconRefSchema.parse(refInput)
    await this.assertIconExists(ref)
    const enabled = parseBoolean(enabledInput)
    const weight = parseWeight(weightInput)
    return this.updateTheme(themeId, (current) => {
      const key = projectIconRefKey(ref)
      return {
        ...current,
        weightOverrides: [...current.weightOverrides.filter((entry) => projectIconRefKey(entry.ref) !== key), { ref, enabled, weight }]
      }
    })
  }

  async assignProject(themeIdInput: unknown, projectIdInput: unknown, refInput: unknown): Promise<ThemeProjectIconSettings> {
    const themeId = parseUuid(themeIdInput, '主题 ID 无效。')
    await this.profiles.get(themeId)
    const projectId = cachedCodexProjectSchema.shape.id.parse(projectIdInput)
    const ref = projectIconRefSchema.parse(refInput)
    await this.assertIconExists(ref)
    return this.updateTheme(themeId, (current) => ({
      ...current,
      assignments: [...current.assignments.filter((entry) => entry.projectId !== projectId), { projectId, ref }]
    }))
  }

  async clearProjectAssignment(themeIdInput: unknown, projectIdInput: unknown): Promise<ThemeProjectIconSettings> {
    const themeId = parseUuid(themeIdInput, '主题 ID 无效。')
    await this.profiles.get(themeId)
    const projectId = cachedCodexProjectSchema.shape.id.parse(projectIdInput)
    return this.updateTheme(themeId, (current) => ({
      ...current,
      assignments: current.assignments.filter((entry) => entry.projectId !== projectId)
    }))
  }

  async assignSession(
    themeIdInput: unknown,
    projectIdInput: unknown,
    sessionIdInput: unknown,
    refInput: unknown
  ): Promise<ThemeProjectIconSettings> {
    const themeId = parseUuid(themeIdInput, '主题 ID 无效。')
    await this.profiles.get(themeId)
    const projectId = cachedCodexProjectSchema.shape.id.parse(projectIdInput)
    const sessionId = discoveredCodexProjectSchema.shape.sessions.element.shape.id.parse(sessionIdInput)
    const ref = projectIconRefSchema.parse(refInput)
    await this.assertIconExists(ref)
    return this.updateTheme(themeId, (current) => ({
      ...current,
      sessionAssignments: [
        ...current.sessionAssignments.filter((entry) => !(entry.projectId === projectId && entry.sessionId === sessionId)),
        { projectId, sessionId, ref }
      ]
    }))
  }

  async clearSessionAssignment(
    themeIdInput: unknown,
    projectIdInput: unknown,
    sessionIdInput: unknown
  ): Promise<ThemeProjectIconSettings> {
    const themeId = parseUuid(themeIdInput, '主题 ID 无效。')
    await this.profiles.get(themeId)
    const projectId = cachedCodexProjectSchema.shape.id.parse(projectIdInput)
    const sessionId = discoveredCodexProjectSchema.shape.sessions.element.shape.id.parse(sessionIdInput)
    return this.updateTheme(themeId, (current) => ({
      ...current,
      sessionAssignments: current.sessionAssignments.filter((entry) => !(entry.projectId === projectId && entry.sessionId === sessionId))
    }))
  }

  async cacheProjects(input: unknown): Promise<CachedCodexProject[]> {
    if (!Array.isArray(input) || input.length > 1000) throw new Error('Codex 项目列表无效。')
    const sessionCount = input.reduce((count, project) => {
      if (!project || typeof project !== 'object' || !Array.isArray((project as { sessions?: unknown }).sessions)) return count
      return count + (project as { sessions: unknown[] }).sessions.length
    }, 0)
    if (sessionCount > MAX_CACHED_CODEX_SESSIONS) throw new Error('Codex 会话列表无效。')
    const now = new Date().toISOString()
    const discovered = input.map((project) => discoveredCodexProjectSchema.parse(project))
    let projects: CachedCodexProject[] = []
    await this.updateSettings((settings) => {
      const previous = new Map(settings.projects.map((project) => [project.id, project]))
      const incoming = new Map<string, CachedCodexProject>()
      const currentSessionIds = new Map<string, Set<string>>()
      for (const project of discovered) {
        const currentSessions = new Map(project.sessions.map((session) => [session.id, { ...session, lastSeenAt: now }]))
        currentSessionIds.set(project.id, new Set(currentSessions.keys()))
        incoming.set(project.id, cachedCodexProjectSchema.parse({ ...project, lastSeenAt: now, sessions: [...currentSessions.values()] }))
      }
      const incomingIds = new Set(incoming.keys())
      const mergedProjects = [
        ...incoming.values(),
        ...settings.projects.filter((project) => !incomingIds.has(project.id))
      ].slice(0, 1000)
      let remainingSessions = MAX_CACHED_CODEX_SESSIONS - [...incoming.values()].reduce((count, project) => count + project.sessions.length, 0)
      projects = mergedProjects.map((project) => {
        const currentSessions = incoming.get(project.id)?.sessions ?? []
        const currentIds = currentSessionIds.get(project.id) ?? new Set<string>()
        const historicalSessions = (previous.get(project.id)?.sessions ?? [])
          .filter((session) => !currentIds.has(session.id))
          .slice(0, remainingSessions)
        remainingSessions -= historicalSessions.length
        return { ...project, sessions: [...currentSessions, ...historicalSessions] }
      })
      return { ...settings, projects }
    })
    return structuredClone(projects)
  }

  async listCachedProjects(): Promise<CachedCodexProject[]> {
    return structuredClone((await this.readSettings()).projects)
  }

  async copyThemeSettings(sourceThemeIdInput: unknown, targetThemeIdInput: unknown): Promise<void> {
    const sourceThemeId = parseUuid(sourceThemeIdInput, '源主题 ID 无效。')
    const targetThemeId = parseUuid(targetThemeIdInput, '目标主题 ID 无效。')
    await this.updateSettings((settings) => ({
      ...settings,
      themes: {
        ...settings.themes,
        [targetThemeId]: {
          ...structuredClone(settings.themes[sourceThemeId] ?? createDefaultThemeProjectIconSettings()),
          allocationFingerprint: '',
          randomAssignments: [],
          randomSessionAssignments: []
        }
      }
    }))
  }

  async deleteThemeSettings(themeIdInput: unknown): Promise<void> {
    const themeId = parseUuid(themeIdInput, '主题 ID 无效。')
    await this.updateSettings((settings) => {
      const themes = { ...settings.themes }
      delete themes[themeId]
      return { ...settings, themes }
    })
  }

  async restoreThemeSettings(themeIdInput: unknown, input: unknown): Promise<void> {
    const themeId = parseUuid(themeIdInput, '主题 ID 无效。')
    const theme = themeProjectIconSettingsSchema.parse(input)
    await this.updateSettings((settings) => ({
      ...settings,
      themes: { ...settings.themes, [themeId]: theme }
    }))
  }

  async getShareableThemeSettings(themeIdInput: unknown): Promise<Pick<ThemeProjectIconSettings, 'enabledLibraryIds' | 'weightOverrides'>> {
    const settings = await this.getThemeSettings(themeIdInput)
    return { enabledLibraryIds: settings.enabledLibraryIds, weightOverrides: settings.weightOverrides }
  }

  async applyShareableThemeSettings(themeIdInput: unknown, input: unknown): Promise<ThemeProjectIconSettings> {
    const themeId = parseUuid(themeIdInput, '主题 ID 无效。')
    const candidate = input && typeof input === 'object' ? input as Partial<ThemeProjectIconSettings> : {}
    const parsed = themeProjectIconSettingsSchema.parse({
      enabledLibraryIds: candidate.enabledLibraryIds ?? [SYSTEM_ICON_LIBRARY_ID],
      weightOverrides: candidate.weightOverrides ?? [],
      assignments: [],
      sessionAssignments: [],
      allocationFingerprint: '',
      randomAssignments: [],
      randomSessionAssignments: []
    })
    const available = new Set((await this.listLibraries()).map((library) => library.id))
    if (parsed.enabledLibraryIds.some((id) => !available.has(id)) || parsed.weightOverrides.some((entry) => !available.has(entry.ref.libraryId))) {
      throw new Error('主题素材库设置引用了不存在的素材库。')
    }
    await Promise.all(parsed.weightOverrides.map((entry) => this.assertIconExists(entry.ref)))
    const next = {
      enabledLibraryIds: parsed.enabledLibraryIds,
      weightOverrides: parsed.weightOverrides,
      assignments: [],
      sessionAssignments: [],
      allocationFingerprint: '',
      randomAssignments: [],
      randomSessionAssignments: []
    }
    return this.updateTheme(themeId, () => next)
  }

  async copyIconToTheme(themeIdInput: unknown, refInput: unknown): Promise<ThemeIconLibrarySelection> {
    const themeId = parseUuid(themeIdInput, '主题 ID 无效。')
    const ref = projectIconRefSchema.parse(refInput)
    const library = await this.getLibrary(ref.libraryId)
    const icon = library.icons.find((candidate) => candidate.id === ref.iconId)
    if (!icon) throw new Error('素材库图标不存在。')
    if (isSystemLibrary(library)) {
      const systemIcon = library.icons.find((candidate) => candidate.id === ref.iconId)
      if (!systemIcon) throw new Error('素材库图标不存在。')
      return { kind: 'builtin', name: systemIcon.builtinName }
    }
    const customIcon = library.icons.find((candidate) => candidate.id === ref.iconId)
    if (!customIcon) throw new Error('素材库图标不存在。')
    return { kind: 'asset', imported: await this.profiles.importAsset(themeId, this.resolveAsset(library.id, customIcon.asset), 'icon') }
  }

  private async reconcileThemeAllocations(themeId: string): Promise<ThemeProjectIconSettings> {
    let result = createDefaultThemeProjectIconSettings()
    await this.updateSettings(async (privateSettings) => {
      const current = privateSettings.themes[themeId] ?? createDefaultThemeProjectIconSettings()
      const candidates = await this.collectWeightedCandidates(current)
      const fingerprint = projectIconPoolFingerprint(candidates)
      const cachedProjects = privateSettings.projects
      const projectIds = cachedProjects.map((project) => project.id)
      const manualProjects = current.assignments
      const manualProjectIds = new Set(manualProjects.map((entry) => entry.projectId))
      const cachedProjectAssignments = current.allocationFingerprint === fingerprint
        ? current.randomAssignments.map((entry) => ({ targetId: entry.projectId, ref: entry.ref }))
        : []
      const allocatedProjects = allocateStableUniqueIcons(
        `${themeId}\u0000projects`,
        projectIds.filter((projectId) => !manualProjectIds.has(projectId)),
        candidates,
        manualProjects.map((entry) => entry.ref),
        cachedProjectAssignments
      )
      const randomAssignments = allocatedProjects.map(({ targetId: projectId, icon }) => ({ projectId, ref: icon.ref }))
      const finalProjectRefs = new Map(randomAssignments.map((entry) => [entry.projectId, entry.ref]))
      for (const assignment of manualProjects) finalProjectRefs.set(assignment.projectId, assignment.ref)

      const randomSessionAssignments: ThemeProjectIconSettings['randomSessionAssignments'] = []
      for (const project of cachedProjects) {
        const sessionIds = project.sessions.map((session) => session.id)
        const manualSessions = current.sessionAssignments.filter((entry) => entry.projectId === project.id)
        const manualSessionIds = new Set(manualSessions.map((entry) => entry.sessionId))
        const cachedSessions = current.allocationFingerprint === fingerprint
          ? current.randomSessionAssignments
            .filter((entry) => entry.projectId === project.id)
            .map((entry) => ({ targetId: entry.sessionId, ref: entry.ref }))
          : []
        const reservedRefs = manualSessions.map((entry) => entry.ref)
        const projectRef = finalProjectRefs.get(project.id)
        if (projectRef) reservedRefs.push(projectRef)
        const allocatedSessions = allocateStableUniqueIcons(
          `${themeId}\u0000sessions\u0000${project.id}`,
          sessionIds.filter((sessionId) => !manualSessionIds.has(sessionId)),
          candidates,
          reservedRefs,
          cachedSessions
        )
        randomSessionAssignments.push(...allocatedSessions.map(({ targetId: sessionId, icon }) => ({ projectId: project.id, sessionId, ref: icon.ref })))
      }

      const next = themeProjectIconSettingsSchema.parse({
        ...current,
        allocationFingerprint: fingerprint,
        randomAssignments,
        randomSessionAssignments
      })
      result = next
      if (privateSettings.themes[themeId] && sameDerivedAllocations(current, next)) return privateSettings
      return { ...privateSettings, themes: { ...privateSettings.themes, [themeId]: next } }
    })
    return structuredClone(result)
  }

  private async collectWeightedCandidates(settings: ThemeProjectIconSettings): Promise<RuntimeProjectIconCandidate[]> {
    const candidates: RuntimeProjectIconCandidate[] = []
    for (const libraryId of settings.enabledLibraryIds) {
      const library = await this.getLibrary(libraryId).catch(() => null)
      if (!library) continue
      for (const icon of library.icons) {
        const ref = { libraryId: library.id, iconId: icon.id }
        const effective = resolveProjectIconWeight(settings, ref, { enabled: icon.defaultEnabled, weight: icon.defaultWeight })
        if (effective.enabled) candidates.push({ ref, weight: effective.weight })
      }
    }
    return candidates
  }

  async compileRuntimeConfig(themeIdInput: unknown, budget = new EmbeddedAssetBudget()): Promise<RuntimeProjectIconConfig> {
    const themeId = parseUuid(themeIdInput, '主题 ID 无效。')
    await this.profiles.get(themeId)
    const settings = await this.reconcileThemeAllocations(themeId)
    const privateSettings = await this.readSettings()
    const libraryCache = new Map<string, IconLibrary>()
    const assetCache = new Map<string, RuntimeProjectIconCandidate>()
    const loadLibrary = async (id: string): Promise<IconLibrary | null> => {
      if (libraryCache.has(id)) return libraryCache.get(id) ?? null
      const library = await this.getLibrary(id).catch(() => null)
      if (library) libraryCache.set(id, library)
      return library
    }
    const candidateFor = async (ref: ProjectIconRef, weight: number): Promise<RuntimeProjectIconCandidate | null> => {
      const key = projectIconRefKey(ref)
      const cached = assetCache.get(key)
      if (cached) return { ...cached, weight }
      const library = await loadLibrary(ref.libraryId)
      if (!library) return null
      if (isSystemLibrary(library)) {
        const icon = library.icons.find((entry) => entry.id === ref.iconId)
        if (!icon) return null
        const candidate = { ref, weight, builtinName: icon.builtinName, dataUrl: await this.builtinIconAssets.getDataUrl(icon.builtinName) }
        assetCache.set(key, candidate)
        return candidate
      }
      const icon = library.icons.find((entry) => entry.id === ref.iconId)
      if (!icon) return null
      const path = this.resolveAsset(library.id, icon.asset)
      const data = await readFile(path)
      if (sha256(data) !== icon.sha256) throw new Error(`素材库图标校验失败: ${icon.name}`)
      budget.set(`project-icon/${key}`, data.byteLength)
      const dataUrl = `data:${icon.mimeType};base64,${data.toString('base64')}`
      const prepared = icon.mimeType === 'image/gif' ? await prepareIconGif(data) : null
      if (prepared) budget.set(`project-icon/${key}/poster`, dataUrlByteLength(prepared.posterDataUrl))
      const candidate = { ref, weight, dataUrl, ...(prepared ? { posterDataUrl: prepared.posterDataUrl } : {}) }
      assetCache.set(key, candidate)
      return candidate
    }

    const pool: RuntimeProjectIconCandidate[] = []
    for (const libraryId of settings.enabledLibraryIds) {
      const library = await loadLibrary(libraryId)
      if (!library) continue
      for (const icon of library.icons) {
        const ref = { libraryId: library.id, iconId: icon.id }
        const effective = resolveProjectIconWeight(settings, ref, { enabled: icon.defaultEnabled, weight: icon.defaultWeight })
        if (!effective.enabled) continue
        const candidate = await candidateFor(ref, effective.weight)
        if (candidate) pool.push(candidate)
      }
    }
    const assignments: RuntimeProjectIconConfig['assignments'] = []
    const finalProjectRefs = new Map(settings.randomAssignments.map((assignment) => [assignment.projectId, assignment.ref]))
    for (const assignment of settings.assignments) finalProjectRefs.set(assignment.projectId, assignment.ref)
    for (const [projectId, ref] of finalProjectRefs) {
      const icon = await candidateFor(ref, 1)
      if (icon) assignments.push({ projectId, icon })
    }
    const sessionAssignments: RuntimeProjectIconConfig['sessionAssignments'] = []
    const finalSessionRefs = new Map(settings.randomSessionAssignments.map((assignment) => [`${assignment.projectId}\u0000${assignment.sessionId}`, assignment]))
    for (const assignment of settings.sessionAssignments) finalSessionRefs.set(`${assignment.projectId}\u0000${assignment.sessionId}`, assignment)
    for (const assignment of finalSessionRefs.values()) {
      const icon = await candidateFor(assignment.ref, 1)
      if (icon) sessionAssignments.push({ projectId: assignment.projectId, sessionId: assignment.sessionId, icon })
    }
    return { showSessionIcons: privateSettings.showSessionIcons, pool, assignments, sessionAssignments }
  }

  async resolvePreview(libraryIdInput: unknown, iconIdInput: unknown): Promise<ResolvedProjectIconMedia> {
    const library = await this.requireCustomLibrary(libraryIdInput)
    const iconId = parseUuid(iconIdInput, '图标 ID 无效。')
    const icon = library.icons.find((candidate) => candidate.id === iconId)
    if (!icon) throw new Error('图标不存在。')
    const path = this.resolveAsset(library.id, icon.asset)
    const file = await stat(path)
    if (!file.isFile() || file.size > MAX_ICON_BYTES) throw new Error('图标素材不可用。')
    return { path, mimeType: icon.mimeType, size: file.size }
  }

  private async importOneAsset(libraryId: string, sourcePath: string, signal?: AbortSignal): Promise<{ asset: string; icon: CustomLibraryIcon }> {
    this.throwIfAborted(signal, '素材库导入已取消。')
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile() || sourceStat.size > MAX_ICON_BYTES) throw new Error('图标素材必须是文件且不能超过 30 MB。')
    const extension = extname(sourcePath).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error('不支持该图标格式。')
    const id = randomUUID()
    const outputExtension = extension === '.svg' ? '.png' : extension
    const asset = `assets/${id}${outputExtension}`
    const destination = this.resolveAsset(libraryId, asset)
    const temporary = `${destination}.${randomUUID()}.tmp`
    await mkdir(dirname(destination), { recursive: true })
    try {
      let data: Buffer
      if (extension === '.svg') {
        const source = await readFile(sourcePath, { encoding: 'utf8', signal })
        assertSafeSvgSource(source)
        await inspectImageBytes(Buffer.from(source), extension)
        data = await sharp(Buffer.from(source)).png().toBuffer()
      } else {
        data = await readFile(sourcePath, { signal })
      }
      this.throwIfAborted(signal, '素材库导入已取消。')
      let inspection: { width: number; height: number }
      if (extension === '.gif') {
        const prepared = await prepareIconGif(data)
        data = prepared.bytes
        inspection = prepared
      } else {
        inspection = await inspectImageBytes(data, outputExtension)
      }
      this.throwIfAborted(signal, '素材库导入已取消。')
      await writeFile(temporary, data, { flag: 'wx' })
      await syncFile(temporary)
      await rename(temporary, destination)
      const originalName = basename(sourcePath)
      return {
        asset,
        icon: customIconLibrarySchema.shape.icons.element.parse({
          id,
          name: basename(originalName, extname(originalName)).trim().slice(0, 80) || 'Icon',
          asset,
          mimeType: mimeType(outputExtension),
          defaultEnabled: true,
          defaultWeight: 1,
          originalName,
          width: inspection.width,
          height: inspection.height,
          sha256: sha256(data)
        })
      }
    } catch (error) {
      await Promise.all([rm(temporary, { force: true }).catch(() => undefined), rm(destination, { force: true }).catch(() => undefined)])
      throw error
    }
  }

  private async assertIconExists(ref: ProjectIconRef): Promise<void> {
    const library = await this.getLibrary(ref.libraryId)
    if (!library.icons.some((icon) => icon.id === ref.iconId)) throw new Error('素材库图标不存在。')
  }

  private async updateTheme(
    themeId: string,
    update: (current: ThemeProjectIconSettings) => ThemeProjectIconSettings
  ): Promise<ThemeProjectIconSettings> {
    await this.updateSettings((settings) => {
      const result = themeProjectIconSettingsSchema.parse(update(settings.themes[themeId] ?? createDefaultThemeProjectIconSettings()))
      return { ...settings, themes: { ...settings.themes, [themeId]: result } }
    })
    return this.reconcileThemeAllocations(themeId)
  }

  private throwIfAborted(signal: AbortSignal | undefined, message: string): void {
    if (signal?.aborted) throw new Error(message)
  }

  private async updateSettings(
    update: (settings: ProjectIconPrivateSettings) => ProjectIconPrivateSettings | Promise<ProjectIconPrivateSettings>
  ): Promise<void> {
    const operation = this.settingsTail.then(async () => {
      const current = await this.readSettings()
      const next = await update(current)
      if (next === current) return
      await this.writeSettings(projectIconPrivateSettingsSchema.parse(next))
    })
    this.settingsTail = operation.then(() => undefined, () => undefined)
    return operation
  }

  private async readSettings(): Promise<ProjectIconPrivateSettings> {
    return this.readJsonWithRecovery(this.settingsPath, (content) => projectIconPrivateSettingsSchema.parse(JSON.parse(content)))
  }

  private async writeSettings(settings: ProjectIconPrivateSettings): Promise<void> {
    await this.writeJsonAtomic(this.settingsPath, projectIconPrivateSettingsSchema.parse(settings))
  }

  private async writeLibrary(library: CustomIconLibrary): Promise<void> {
    await mkdir(join(this.libraryRoot(library.id), 'assets'), { recursive: true })
    await this.writeJsonAtomic(this.libraryPath(library.id), customIconLibrarySchema.parse(library))
  }

  private async requireCustomLibrary(input: unknown): Promise<CustomIconLibrary> {
    if (input === SYSTEM_ICON_LIBRARY_ID) throw new Error('系统素材库不能修改或删除。')
    const library = await this.getLibrary(input)
    if (isSystemLibrary(library)) throw new Error('系统素材库不能修改或删除。')
    return library
  }

  private async loadCustomLibraries(): Promise<CustomIconLibrary[]> {
    const entries = await readdir(this.librariesRoot, { withFileTypes: true })
    const libraries = await Promise.all(entries.filter((entry) => entry.isDirectory() && isUuid(entry.name)).map((entry) => this.getLibrary(entry.name).catch(() => null)))
    return libraries.filter((library): library is CustomIconLibrary => library !== null && !isSystemLibrary(library))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  private libraryRoot(id: string): string {
    parseUuid(id, '素材库 ID 无效。')
    return join(this.librariesRoot, id)
  }

  private libraryPath(id: string): string { return join(this.libraryRoot(id), 'library.json') }

  private resolveAsset(libraryId: string, asset: string): string {
    const root = resolve(this.libraryRoot(libraryId))
    if (!asset || isAbsolute(asset) || asset.includes('\\')) throw new Error('素材库路径无效。')
    const candidate = resolve(root, asset)
    const rel = relative(root, candidate)
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || !rel.startsWith(`assets${process.platform === 'win32' ? '\\' : '/'}`)) {
      throw new Error('素材库路径超出允许目录。')
    }
    return candidate
  }

  private async readJsonWithRecovery<T>(path: string, parse: (content: string) => T): Promise<T> {
    let content: string
    try {
      content = await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await rename(`${path}.previous`, path)
      await this.syncParentDirectory(path)
      content = await readFile(path, 'utf8')
    }
    const value = parse(content)
    await rm(`${path}.previous`, { force: true }).catch(() => undefined)
    return value
  }

  private async writeJsonAtomic(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${randomUUID()}.tmp`
    const backup = `${path}.previous`
    const handle = await open(temporary, 'wx')
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    let hadOriginal = false
    try {
      try { await rename(path, backup); hadOriginal = true } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if (hadOriginal) await this.syncParentDirectory(path)
      await rename(temporary, path)
      await this.syncParentDirectory(path)
    } catch (error) {
      await rm(temporary, { force: true })
      if (hadOriginal) {
        await rename(backup, path).catch(() => undefined)
        await this.syncParentDirectory(path).catch(() => undefined)
      }
      throw error
    }
    if (hadOriginal) {
      await rm(backup, { force: true }).catch(() => undefined)
      await this.syncParentDirectory(path)
    }
  }

  private async cleanupStartupArtifacts(): Promise<void> {
    const entries = await readdir(this.librariesRoot, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
      const path = join(this.librariesRoot, entry.name)
      if (entry.isDirectory() && LIBRARY_DELETE_PATTERN.test(entry.name)) await rm(path, { recursive: true, force: true })
      else if (entry.isDirectory() && isUuid(entry.name)) await this.cleanupControlledTempFiles(path)
      else if (entry.isFile() && CONTROLLED_TEMP_FILE_PATTERN.test(entry.name)) await rm(path, { force: true })
    }))
  }

  private async cleanupControlledTempFiles(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    await Promise.all(entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await this.cleanupControlledTempFiles(path)
      else if (CONTROLLED_TEMP_FILE_PATTERN.test(entry.name)) await rm(path, { force: true }).catch(() => undefined)
    }))
  }

  private async syncParentDirectory(path: string): Promise<void> {
    if (process.platform === 'win32') return
    const handle = await open(dirname(path), 'r')
    try { await handle.sync() } finally { await handle.close() }
  }
}

function parseLibraryId(input: unknown): string {
  if (input === SYSTEM_ICON_LIBRARY_ID) return SYSTEM_ICON_LIBRARY_ID
  return parseUuid(input, '素材库 ID 无效。')
}

function parseUuid(input: unknown, message: string): string {
  if (typeof input !== 'string' || !isUuid(input)) throw new Error(message)
  return input
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function cleanName(input: unknown, label: string): string {
  if (typeof input !== 'string') throw new Error(`${label}无效。`)
  const name = input.trim().replace(/[\u0000-\u001f]/g, '').slice(0, 80)
  if (!name) throw new Error(`${label}不能为空。`)
  return name
}

function parseBoolean(input: unknown): boolean {
  if (typeof input !== 'boolean') throw new Error('图标启用状态无效。')
  return input
}

function parseWeight(input: unknown): number {
  if (!Number.isInteger(input) || (input as number) < 1 || (input as number) > 10) throw new Error('图标优先级必须是 1 到 10 的整数。')
  return input as number
}

function mimeType(extension: string): CustomLibraryIcon['mimeType'] {
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.gif') return 'image/gif'
  throw new Error('图标格式无效。')
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

async function syncFile(path: string): Promise<void> {
  const handle = await open(path, 'r+')
  try { await handle.sync() } finally { await handle.close() }
}

function isSystemLibrary(library: IconLibrary): library is SystemIconLibrary {
  return library.id === SYSTEM_ICON_LIBRARY_ID
}

function migratePrivateSettings(input: unknown): ProjectIconPrivateSettings {
  const version2 = projectIconPrivateSettingsV2Schema.safeParse(input)
  if (version2.success) {
    return projectIconPrivateSettingsSchema.parse({
      ...version2.data,
      version: PROJECT_ICON_SETTINGS_VERSION,
      themes: Object.fromEntries(Object.entries(version2.data.themes).map(([themeId, theme]) => [themeId, {
        ...theme,
        allocationFingerprint: '',
        randomAssignments: [],
        randomSessionAssignments: []
      }]))
    })
  }
  const legacy = projectIconPrivateSettingsV1Schema.parse(input)
  return projectIconPrivateSettingsSchema.parse({
    version: PROJECT_ICON_SETTINGS_VERSION,
    showSessionIcons: true,
    themes: Object.fromEntries(Object.entries(legacy.themes).map(([themeId, theme]) => [themeId, {
      ...theme,
      sessionAssignments: [],
      allocationFingerprint: '',
      randomAssignments: [],
      randomSessionAssignments: []
    }])),
    projects: legacy.projects.map((project) => ({ ...project, sessions: [] }))
  })
}

function sameDerivedAllocations(left: ThemeProjectIconSettings, right: ThemeProjectIconSettings): boolean {
  return left.allocationFingerprint === right.allocationFingerprint
    && JSON.stringify(left.randomAssignments) === JSON.stringify(right.randomAssignments)
    && JSON.stringify(left.randomSessionAssignments) === JSON.stringify(right.randomSessionAssignments)
}

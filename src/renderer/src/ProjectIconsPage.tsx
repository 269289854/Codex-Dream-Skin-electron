import * as React from 'react'
import { Check, FolderCog, LockKeyhole, RefreshCw, Search, Shuffle } from 'lucide-react'
import type { CachedCodexProject, IconLibrary, IconLibrarySummary, ProjectIconRef, ThemeProjectIconSettings } from '../../shared/project-icons'
import { projectIconRefKey, resolveProjectIconWeight, selectStableProjectIcon, SYSTEM_ICON_LIBRARY_ID, type RuntimeProjectIconCandidate } from '../../shared/project-icons'
import type { ThemeSummary } from '../../shared/theme'
import { localizedMessage, localizedMessageFrom, t, tm, type LocalizedMessage } from '../../shared/i18n'
import { builtinIconLabels } from './icons'
import { LibraryIconPreview } from './library-icons'

interface ProjectIconsPageProps {
  themes: ThemeSummary[]
  currentThemeId: string
  revision: number
  onChanged: () => void
  onError: (message: LocalizedMessage) => void
}

export function ProjectIconsPage({ themes, currentThemeId, revision, onChanged, onError }: ProjectIconsPageProps): React.JSX.Element {
  const [themeId, setThemeId] = React.useState(currentThemeId)
  const [summaries, setSummaries] = React.useState<IconLibrarySummary[]>([])
  const [libraries, setLibraries] = React.useState<IconLibrary[]>([])
  const [settings, setSettings] = React.useState<ThemeProjectIconSettings | null>(null)
  const [projects, setProjects] = React.useState<CachedCodexProject[]>([])
  const [busy, setBusy] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [notice, setNotice] = React.useState<LocalizedMessage | null>(null)

  React.useEffect(() => {
    if (!themes.some((theme) => theme.id === themeId)) setThemeId(currentThemeId)
  }, [currentThemeId, themeId, themes])

  const load = React.useCallback(async (selectedThemeId: string): Promise<void> => {
    const [nextSummaries, nextSettings, nextProjects] = await Promise.all([
      window.studio.iconLibraries.list(),
      window.studio.projectIcons.getThemeSettings(selectedThemeId),
      window.studio.projectIcons.listProjects()
    ])
    const nextLibraries = (await Promise.all(nextSummaries.map((summary) => window.studio.iconLibraries.get(summary.id).catch(() => null))))
      .filter((library): library is IconLibrary => library !== null)
    setSummaries(nextSummaries)
    setSettings(nextSettings)
    setProjects(nextProjects)
    setLibraries(nextLibraries)
  }, [])

  React.useEffect(() => {
    let active = true
    setBusy(true)
    void load(themeId).catch((reason) => {
      if (active) onError(localizedMessageFrom(reason))
    }).finally(() => {
      if (active) setBusy(false)
    })
    return () => { active = false }
  }, [load, onError, revision, themeId])

  const updateSettings = (next: ThemeProjectIconSettings): void => {
    setSettings(next)
    onChanged()
  }

  const toggleLibrary = async (libraryId: string, enabled: boolean): Promise<void> => {
    if (!settings || busy) return
    const ids = enabled
      ? [...new Set([...settings.enabledLibraryIds, libraryId])]
      : settings.enabledLibraryIds.filter((id) => id !== libraryId)
    setBusy(true)
    try {
      updateSettings(await window.studio.projectIcons.setEnabledLibraries(themeId, ids))
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      setBusy(false)
    }
  }

  const setIconWeight = async (ref: ProjectIconRef, enabled: boolean, weight: number): Promise<void> => {
    if (!settings || busy) return
    setBusy(true)
    try {
      updateSettings(await window.studio.projectIcons.setWeightOverride(themeId, ref, enabled, weight))
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      setBusy(false)
    }
  }

  const refreshProjects = async (): Promise<void> => {
    if (refreshing) return
    setRefreshing(true)
    setNotice(null)
    try {
      const next = await window.studio.projectIcons.refreshProjects()
      setProjects(next)
      setNotice(localizedMessage('已刷新 {count} 个 Codex 项目。', { count: next.length }))
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      setRefreshing(false)
    }
  }

  const assignProject = async (projectId: string, value: string): Promise<void> => {
    if (!settings || busy) return
    setBusy(true)
    try {
      const next = value
        ? await window.studio.projectIcons.assignProject(themeId, projectId, parseRefKey(value))
        : await window.studio.projectIcons.clearProjectAssignment(themeId, projectId)
      updateSettings(next)
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      setBusy(false)
    }
  }

  const enabledLibraries = libraries.filter((library) => settings?.enabledLibraryIds.includes(library.id))
  const randomCandidates: RuntimeProjectIconCandidate[] = settings ? enabledLibraries.flatMap((library) => library.icons.flatMap((icon) => {
    const ref = { libraryId: library.id, iconId: icon.id }
    const effective = resolveProjectIconWeight(settings, ref, { enabled: icon.defaultEnabled, weight: icon.defaultWeight })
    return effective.enabled ? [{ ref, weight: effective.weight }] : []
  })) : []
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleProjects = projects.filter((project) => !normalizedQuery || project.label.toLocaleLowerCase().includes(normalizedQuery))

  return <section className="utility-workspace project-icons-page">
    <aside className="utility-sidebar">
      <div className="panel-heading"><div><span className="eyebrow">{t('当前主题')}</span><h2>{t('项目图标')}</h2></div><span className="privacy-badge" title={t('项目图标配置仅保存在本机')}><LockKeyhole size={13} />{t('仅本机')}</span></div>
      <label className="utility-select-field"><span>{t('主题')}</span><select value={themeId} disabled={busy} onChange={(event) => { setNotice(null); setThemeId(event.currentTarget.value) }}>{themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>
      <div className="utility-section-heading"><strong>{t('随机素材库')}</strong><span>{settings?.enabledLibraryIds.length ?? 0}</span></div>
      <div className="library-toggle-list">
        {summaries.map((summary) => <label key={summary.id} className="library-toggle-row"><span className="utility-list-icon"><FolderCog size={15} /></span><span><strong>{summary.system ? t(summary.name) : summary.name}</strong><small>{t('{count} 个图标', { count: summary.iconCount })}</small></span><input type="checkbox" checked={settings?.enabledLibraryIds.includes(summary.id) ?? false} disabled={busy} onChange={(event) => void toggleLibrary(summary.id, event.currentTarget.checked)} /></label>)}
      </div>
      <div className="sidebar-footer"><Shuffle size={14} />{t('稳定随机 · 优先级 1-10')}</div>
    </aside>

    <section className="project-icons-main" aria-busy={busy || refreshing}>
      <header className="utility-header project-icons-header"><div><span className="eyebrow">{t('项目分配')}</span><h1>{themes.find((theme) => theme.id === themeId)?.name ?? t('项目图标')}</h1></div><div className="utility-actions"><button type="button" disabled={refreshing} onClick={() => void refreshProjects()}><RefreshCw className={refreshing ? 'is-spinning' : ''} size={15} />{refreshing ? t('刷新中') : t('刷新项目')}</button></div></header>
      {notice && <div className="utility-notice" role="status"><Check size={14} /><span>{tm(notice)}</span></div>}
      <div className="project-search"><Search size={15} /><input value={query} placeholder={t('搜索项目')} aria-label={t('搜索项目')} onInput={(event) => setQuery(event.currentTarget.value)} /><span>{visibleProjects.length}</span></div>
      {visibleProjects.length ? <div className="project-assignment-list">
        {visibleProjects.map((project) => {
          const assignment = settings?.assignments.find((entry) => entry.projectId === project.id)
          const selected = assignment?.ref ?? selectStableProjectIcon(themeId, project.id, randomCandidates)?.ref ?? null
          const selectedEntry = selected ? findLibraryIcon(libraries, selected) : null
          return <article className="project-assignment-row" key={project.id}>
            <span className="project-assignment-preview">{selectedEntry ? <LibraryIconPreview libraryId={selectedEntry.library.id} icon={selectedEntry.icon} size={23} /> : <FolderCog size={21} />}</span>
            <span className="project-assignment-copy"><strong>{project.label}</strong><small>{assignment ? t('已指定') : selected ? t('按优先级随机') : t('Codex 默认图标')}</small></span>
            <label><span>{t('图标')}</span><select value={assignment ? projectIconRefKey(assignment.ref) : ''} disabled={busy} onChange={(event) => void assignProject(project.id, event.currentTarget.value)}>
              <option value="">{t('随机（素材库优先级）')}</option>
              {libraries.map((library) => <optgroup key={library.id} label={libraryLabel(library)}>{library.icons.map((icon) => <option key={icon.id} value={projectIconRefKey({ libraryId: library.id, iconId: icon.id })}>{iconLabel(icon)}</option>)}</optgroup>)}
            </select></label>
          </article>
        })}
      </div> : <div className="utility-empty"><FolderCog size={25} /><strong>{query ? t('没有匹配的项目') : t('暂无已发现的项目')}</strong>{!query && <button className="primary-button" type="button" disabled={refreshing} onClick={() => void refreshProjects()}><RefreshCw size={15} />{t('刷新项目')}</button>}</div>}
    </section>

    <aside className="project-priority-panel">
      <div className="panel-heading"><div><span className="eyebrow">{t('随机规则')}</span><h2>{t('图标优先级')}</h2></div><Shuffle size={17} /></div>
      <div className="priority-library-list">
        {enabledLibraries.map((library) => <section key={library.id} className="priority-library-section"><header><strong>{libraryLabel(library)}</strong><span>{library.icons.length}</span></header><div>
          {library.icons.map((icon) => {
            if (!settings) return null
            const ref = { libraryId: library.id, iconId: icon.id }
            const effective = resolveProjectIconWeight(settings, ref, { enabled: icon.defaultEnabled, weight: icon.defaultWeight })
            return <div className={effective.enabled ? 'priority-icon-row' : 'priority-icon-row is-disabled'} key={icon.id}>
              <span className="priority-icon-preview"><LibraryIconPreview libraryId={library.id} icon={icon} size={18} /></span>
              <span title={iconLabel(icon)}>{iconLabel(icon)}</span>
              <input aria-label={t('{name}参与随机', { name: iconLabel(icon) })} type="checkbox" checked={effective.enabled} disabled={busy} onChange={(event) => void setIconWeight(ref, event.currentTarget.checked, effective.weight)} />
              <input aria-label={t('{name}优先级', { name: iconLabel(icon) })} type="range" min={1} max={10} step={1} value={effective.weight} disabled={busy || !effective.enabled} onChange={(event) => void setIconWeight(ref, effective.enabled, Number(event.currentTarget.value))} />
              <output>{effective.weight}</output>
            </div>
          })}
        </div></section>)}
        {enabledLibraries.length === 0 && <div className="priority-empty">{t('未启用随机素材库')}</div>}
      </div>
    </aside>
  </section>
}

function parseRefKey(value: string): ProjectIconRef {
  const separator = value.indexOf(':')
  if (separator <= 0 || separator === value.length - 1) throw new Error('图标引用无效。')
  return { libraryId: value.slice(0, separator), iconId: value.slice(separator + 1) }
}

function findLibraryIcon(libraries: IconLibrary[], ref: ProjectIconRef): { library: IconLibrary; icon: IconLibrary['icons'][number] } | null {
  const library = libraries.find((candidate) => candidate.id === ref.libraryId)
  const icon = library?.icons.find((candidate) => candidate.id === ref.iconId)
  return library && icon ? { library, icon } : null
}

function iconLabel(icon: IconLibrary['icons'][number]): string {
  return 'builtinName' in icon ? t(builtinIconLabels[icon.builtinName] ?? icon.name) : icon.name
}

function libraryLabel(library: Pick<IconLibrary, 'id' | 'name'>): string {
  return library.id === SYSTEM_ICON_LIBRARY_ID ? t(library.name) : library.name
}

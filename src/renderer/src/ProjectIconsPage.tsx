import * as React from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, ChevronRight, FolderCog, LockKeyhole, MessageCircle, RefreshCw, Search, Shuffle } from 'lucide-react'
import type { CachedCodexProject, IconLibrary, IconLibrarySummary, ProjectIconRef, ThemeProjectIconSettings } from '../../shared/project-icons'
import { projectIconRefKey, resolveProjectIconWeight, SYSTEM_ICON_LIBRARY_ID, type RuntimeProjectIconCandidate } from '../../shared/project-icons'
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
  const [sessionIconsEnabled, setSessionIconsEnabled] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [notice, setNotice] = React.useState<LocalizedMessage | null>(null)
  const [openPickerId, setOpenPickerId] = React.useState<string | null>(null)
  const [expandedProjectIds, setExpandedProjectIds] = React.useState<Set<string>>(() => new Set())

  React.useEffect(() => {
    if (!themes.some((theme) => theme.id === themeId)) setThemeId(currentThemeId)
  }, [currentThemeId, themeId, themes])

  const load = React.useCallback(async (selectedThemeId: string): Promise<void> => {
    const [nextSummaries, nextSettings, nextProjects, nextSessionIconsEnabled] = await Promise.all([
      window.studio.iconLibraries.list(),
      window.studio.projectIcons.getThemeSettings(selectedThemeId),
      window.studio.projectIcons.listProjects(),
      window.studio.projectIcons.getSessionIconsEnabled()
    ])
    const nextLibraries = (await Promise.all(nextSummaries.map((summary) => window.studio.iconLibraries.get(summary.id).catch(() => null))))
      .filter((library): library is IconLibrary => library !== null)
    setSummaries(nextSummaries)
    setSettings(nextSettings)
    setProjects(nextProjects)
    setSessionIconsEnabled(nextSessionIconsEnabled)
    setLibraries(nextLibraries)
  }, [])

  React.useEffect(() => {
    let active = true
    setOpenPickerId(null)
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

  const toggleSessionIcons = async (enabled: boolean): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      setSessionIconsEnabled(await window.studio.projectIcons.setSessionIconsEnabled(enabled))
      onChanged()
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
    setOpenPickerId(null)
    setRefreshing(true)
    setNotice(null)
    try {
      const next = await window.studio.projectIcons.refreshProjects()
      setProjects(next)
      setSettings(await window.studio.projectIcons.getThemeSettings(themeId))
      const sessionCount = next.reduce((count, project) => count + project.sessions.length, 0)
      setNotice(localizedMessage('已刷新 {projectCount} 个 Codex 项目和 {sessionCount} 个会话。', { projectCount: next.length, sessionCount }))
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      setRefreshing(false)
    }
  }

  const assignSession = async (projectId: string, sessionId: string, value: string): Promise<void> => {
    if (!settings || busy) return
    setBusy(true)
    try {
      const next = value
        ? await window.studio.projectIcons.assignSession(themeId, projectId, sessionId, parseRefKey(value))
        : await window.studio.projectIcons.clearSessionAssignment(themeId, projectId, sessionId)
      updateSettings(next)
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      setBusy(false)
    }
  }

  const toggleProjectExpanded = (projectId: string): void => {
    setExpandedProjectIds((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
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
  const visibleProjects = projects.filter((project) => !normalizedQuery || project.label.toLocaleLowerCase().includes(normalizedQuery) || project.sessions.some((session) => session.title.toLocaleLowerCase().includes(normalizedQuery)))

  return <section className="utility-workspace project-icons-page">
    <aside className="utility-sidebar">
      <div className="panel-heading"><div><span className="eyebrow">{t('当前主题')}</span><h2>{t('项目图标')}</h2></div><span className="privacy-badge" title={t('项目与会话图标配置仅保存在本机')}><LockKeyhole size={13} />{t('仅本机')}</span></div>
      <label className="utility-select-field"><span>{t('主题')}</span><select value={themeId} disabled={busy} onChange={(event) => { setNotice(null); setThemeId(event.currentTarget.value) }}>{themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>
      <label className="session-icon-toggle"><span><strong>{t('显示会话图标')}</strong><small>{t('控制 Codex 侧边栏中的会话标记')}</small></span><input type="checkbox" checked={sessionIconsEnabled} disabled={busy} onChange={(event) => void toggleSessionIcons(event.currentTarget.checked)} /></label>
      <div className="utility-section-heading"><strong>{t('随机素材库')}</strong><span>{settings?.enabledLibraryIds.length ?? 0}</span></div>
      <div className="library-toggle-list">
        {summaries.map((summary) => <label key={summary.id} className="library-toggle-row"><span className="utility-list-icon"><FolderCog size={15} /></span><span><strong>{summary.system ? t(summary.name) : summary.name}</strong><small>{t('{count} 个图标', { count: summary.iconCount })}</small></span><input type="checkbox" checked={settings?.enabledLibraryIds.includes(summary.id) ?? false} disabled={busy} onChange={(event) => void toggleLibrary(summary.id, event.currentTarget.checked)} /></label>)}
      </div>
      <div className="sidebar-footer"><Shuffle size={14} />{t('稳定随机 · 优先级 1-10')}</div>
    </aside>

    <section className="project-icons-main" aria-busy={busy || refreshing}>
      <header className="utility-header project-icons-header"><div><span className="eyebrow">{t('项目与会话分配')}</span><h1>{themes.find((theme) => theme.id === themeId)?.name ?? t('项目图标')}</h1></div><div className="utility-actions"><button type="button" disabled={refreshing} onClick={() => void refreshProjects()}><RefreshCw className={refreshing ? 'is-spinning' : ''} size={15} />{refreshing ? t('刷新中') : t('刷新项目与会话')}</button></div></header>
      {notice && <div className="utility-notice" role="status"><Check size={14} /><span>{tm(notice)}</span></div>}
      <div className="project-search"><Search size={15} /><input value={query} placeholder={t('搜索项目或会话')} aria-label={t('搜索项目或会话')} onInput={(event) => { setOpenPickerId(null); setQuery(event.currentTarget.value) }} /><span>{visibleProjects.length}</span></div>
      {visibleProjects.length ? <div className="project-assignment-list">
        {visibleProjects.map((project) => {
          const assignment = settings?.assignments.find((entry) => entry.projectId === project.id)
          const randomAssignment = settings?.randomAssignments.find((entry) => entry.projectId === project.id)
          const selected = assignment?.ref ?? randomAssignment?.ref ?? null
          const selectedEntry = selected ? findLibraryIcon(libraries, selected) : null
          const matchingSessions = normalizedQuery && !project.label.toLocaleLowerCase().includes(normalizedQuery)
            ? project.sessions.filter((session) => session.title.toLocaleLowerCase().includes(normalizedQuery))
            : project.sessions
          const expanded = expandedProjectIds.has(project.id) || Boolean(normalizedQuery && matchingSessions.length)
          const panelId = `project-sessions-${project.id.replace(/[^A-Za-z0-9_-]/g, '-')}`
          return <article className="project-assignment-group" key={project.id}>
            <div className="project-assignment-row">
              <button className="project-disclosure" type="button" aria-label={expanded ? t('折叠项目会话') : t('展开项目会话')} aria-expanded={expanded} aria-controls={panelId} onClick={() => toggleProjectExpanded(project.id)}>{expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>
              <span className="project-assignment-preview">{selectedEntry ? <LibraryIconPreview libraryId={selectedEntry.library.id} icon={selectedEntry.icon} size={23} /> : <FolderCog size={21} />}</span>
              <span className="project-assignment-copy"><strong>{project.label}</strong><small>{assignment ? t('已指定') : randomAssignment ? t('按优先级随机') : randomCandidates.length ? t('随机素材已用尽 · Codex 默认图标') : t('Codex 默认图标')} · {t('{count} 个会话', { count: project.sessions.length })}</small></span>
              <ProjectIconPicker
              targetId={`project:${project.id}`}
              targetLabel={project.label}
              libraries={libraries}
              assignment={assignment?.ref ?? null}
              selectedEntry={selectedEntry}
              open={openPickerId === `project:${project.id}`}
              disabled={busy}
              onOpenChange={(open) => setOpenPickerId(open ? `project:${project.id}` : null)}
              onSelect={(value) => void assignProject(project.id, value)}
            />
            </div>
            {expanded && <div className="session-assignment-list" id={panelId}>
              {matchingSessions.map((session) => {
                const sessionAssignment = settings?.sessionAssignments.find((entry) => entry.projectId === project.id && entry.sessionId === session.id)
                const randomSessionAssignment = settings?.randomSessionAssignments.find((entry) => entry.projectId === project.id && entry.sessionId === session.id)
                const sessionSelected = sessionAssignment?.ref ?? randomSessionAssignment?.ref ?? null
                const sessionEntry = sessionSelected ? findLibraryIcon(libraries, sessionSelected) : null
                const pickerId = `session:${project.id}:${session.id}`
                return <div className="session-assignment-row" key={session.id}>
                  <span className="session-assignment-preview">{sessionEntry ? <LibraryIconPreview libraryId={sessionEntry.library.id} icon={sessionEntry.icon} size={18} /> : <MessageCircle size={17} />}</span>
                  <span className="project-assignment-copy"><strong>{session.title}</strong><small>{sessionAssignment ? t('已指定') : randomSessionAssignment ? t('按优先级随机') : randomCandidates.length ? t('随机素材已用尽 · Codex 默认图标') : t('Codex 默认图标')}</small></span>
                  <ProjectIconPicker targetId={pickerId} targetLabel={session.title} libraries={libraries} assignment={sessionAssignment?.ref ?? null} selectedEntry={sessionEntry} open={openPickerId === pickerId} disabled={busy} onOpenChange={(open) => setOpenPickerId(open ? pickerId : null)} onSelect={(value) => void assignSession(project.id, session.id, value)} />
                </div>
              })}
              {matchingSessions.length === 0 && <div className="session-assignment-empty">{t('该项目暂无已发现的会话')}</div>}
            </div>}
          </article>
        })}
      </div> : <div className="utility-empty"><FolderCog size={25} /><strong>{query ? t('没有匹配的项目或会话') : t('暂无已发现的项目')}</strong>{!query && <button className="primary-button" type="button" disabled={refreshing} onClick={() => void refreshProjects()}><RefreshCw size={15} />{t('刷新项目与会话')}</button>}</div>}
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

interface ProjectIconPickerProps {
  targetId: string
  targetLabel: string
  libraries: IconLibrary[]
  assignment: ProjectIconRef | null
  selectedEntry: { library: IconLibrary; icon: IconLibrary['icons'][number] } | null
  open: boolean
  disabled: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (value: string) => void
}

interface ProjectIconPickerPosition {
  left: number
  top?: number
  bottom?: number
  width: number
  maxHeight: number
}

function ProjectIconPicker({ targetId, targetLabel, libraries, assignment, selectedEntry, open, disabled, onOpenChange, onSelect }: ProjectIconPickerProps): React.JSX.Element {
  const [iconQuery, setIconQuery] = React.useState('')
  const [position, setPosition] = React.useState<ProjectIconPickerPosition | null>(null)
  const fieldRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const listId = `${React.useId()}-project-icon-options`
  const randomLabel = t('随机（素材库优先级）')
  const currentLabel = assignment
    ? selectedEntry ? iconLabel(selectedEntry.icon) : `${assignment.libraryId}:${assignment.iconId}`
    : randomLabel
  const normalizedIconQuery = iconQuery.trim().toLocaleLowerCase()
  const showRandom = !normalizedIconQuery || randomLabel.toLocaleLowerCase().includes(normalizedIconQuery)
  const visibleLibraries = libraries.map((library) => {
    const label = libraryLabel(library)
    const libraryMatches = [label, library.name].some((value) => value.toLocaleLowerCase().includes(normalizedIconQuery))
    const icons = !normalizedIconQuery || libraryMatches ? library.icons : library.icons.filter((icon) => {
      const values = [iconLabel(icon), icon.name, 'builtinName' in icon ? icon.builtinName : '']
      return values.some((value) => value.toLocaleLowerCase().includes(normalizedIconQuery))
    })
    return { library, label, icons }
  }).filter((entry) => entry.icons.length > 0)

  const setOpen = (nextOpen: boolean): void => {
    if (disabled) return
    if (nextOpen) setIconQuery('')
    onOpenChange(nextOpen)
  }

  React.useLayoutEffect(() => {
    if (!open) return undefined
    const updatePosition = (): void => {
      if (triggerRef.current) setPosition(resolveProjectIconPickerPosition(triggerRef.current.getBoundingClientRect()))
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  React.useLayoutEffect(() => {
    if (!open) return undefined
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  React.useEffect(() => {
    if (!open) return undefined
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!fieldRef.current?.contains(target) && !menuRef.current?.contains(target)) onOpenChange(false)
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onOpenChange(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onOpenChange, open])

  React.useEffect(() => {
    if (open && disabled) onOpenChange(false)
  }, [disabled, onOpenChange, open])

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    }
  }

  const select = (value: string): void => {
    onOpenChange(false)
    onSelect(value)
  }

  const menu = open ? <div
    className="project-icon-picker-menu"
    ref={menuRef}
    style={position ? {
      left: position.left,
      top: position.top,
      bottom: position.bottom,
      width: position.width,
      maxHeight: position.maxHeight,
      '--project-icon-picker-max-height': `${position.maxHeight}px`
    } as React.CSSProperties : { visibility: 'hidden' }}
  >
    <label className="project-icon-picker-search"><Search size={15} aria-hidden="true" /><input ref={searchRef} value={iconQuery} placeholder={t('搜索图标')} aria-label={t('搜索图标')} onInput={(event) => setIconQuery(event.currentTarget.value)} /></label>
    <div className="project-icon-picker-options" id={listId} role="listbox" aria-label={t('{label}图标', { label: targetLabel })}>
      {showRandom && <button className={!assignment ? 'project-icon-picker-option active' : 'project-icon-picker-option'} type="button" role="option" aria-selected={!assignment} data-icon-name="__random" title={randomLabel} onClick={() => select('')}>
        <span className="project-icon-picker-option-icon"><Shuffle size={26} aria-hidden="true" /></span><span>{randomLabel}</span>
      </button>}
      {visibleLibraries.map(({ library, label, icons }) => <React.Fragment key={library.id}>
        <div className="project-icon-picker-group-label" role="presentation">{label}</div>
        {icons.map((icon) => {
          const ref = { libraryId: library.id, iconId: icon.id }
          const key = projectIconRefKey(ref)
          const active = assignment ? projectIconRefKey(assignment) === key : false
          const label = iconLabel(icon)
          return <button className={active ? 'project-icon-picker-option active' : 'project-icon-picker-option'} type="button" role="option" aria-selected={active} data-icon-name={key} title={label} key={icon.id} disabled={disabled} onClick={() => select(key)}>
            <span className="project-icon-picker-option-icon"><LibraryIconPreview libraryId={library.id} icon={icon} size={26} /></span><span>{label}</span>
          </button>
        })}
      </React.Fragment>)}
      {!showRandom && visibleLibraries.length === 0 && <div className="project-icon-picker-empty" role="status">{t('没有匹配的图标')}</div>}
    </div>
  </div> : null

  return <div className="project-icon-picker-field" ref={fieldRef} data-icon-target-id={targetId}>
    <span>{t('图标')}</span>
    <button className="project-icon-picker-trigger" ref={triggerRef} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} title={currentLabel} onClick={() => setOpen(!open)} onKeyDown={handleTriggerKeyDown}>
      <span className="project-icon-picker-trigger-icon">{selectedEntry ? <LibraryIconPreview libraryId={selectedEntry.library.id} icon={selectedEntry.icon} size={20} /> : <Shuffle size={19} aria-hidden="true" />}</span>
      <span className="project-icon-picker-trigger-label">{currentLabel}</span>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    {menu && createPortal(menu, document.body)}
  </div>
}

function resolveProjectIconPickerPosition(rect: DOMRect): ProjectIconPickerPosition {
  const viewportPadding = 12
  const gap = 4
  const width = Math.min(420, Math.max(300, window.innerWidth - viewportPadding * 2))
  const left = Math.min(Math.max(viewportPadding, rect.right - width), Math.max(viewportPadding, window.innerWidth - width - viewportPadding))
  const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding - gap)
  const spaceAbove = Math.max(0, rect.top - viewportPadding - gap)
  const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow
  const availableHeight = openAbove ? spaceAbove : spaceBelow
  const maxHeight = Math.max(160, Math.min(360, availableHeight))
  return openAbove
    ? { left, bottom: window.innerHeight - rect.top + gap, width, maxHeight }
    : { left, top: rect.bottom + gap, width, maxHeight }
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

import * as React from 'react'
import { Check, Download, FolderPlus, ImagePlus, LibraryBig, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import type { IconLibrary, IconLibrarySummary } from '../../shared/project-icons'
import { SYSTEM_ICON_LIBRARY_ID } from '../../shared/project-icons'
import type { OperationProgress } from '../../shared/contracts'
import { localizedMessage, localizedMessageFrom, t, tm, type LocalizedMessage } from '../../shared/i18n'
import { clearLibraryIconPreviewCache, LibraryIconPreview } from './library-icons'
import { builtinIconLabels } from './icons'

interface IconLibraryPageProps {
  preferredLibraryId: string | null
  operationProgress: OperationProgress | null
  onChanged: () => void
  onError: (message: LocalizedMessage) => void
}

export function IconLibraryPage({ preferredLibraryId, operationProgress, onChanged, onError }: IconLibraryPageProps): React.JSX.Element {
  const [summaries, setSummaries] = React.useState<IconLibrarySummary[]>([])
  const [selectedId, setSelectedId] = React.useState(SYSTEM_ICON_LIBRARY_ID)
  const [library, setLibrary] = React.useState<IconLibrary | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [renameValue, setRenameValue] = React.useState('')
  const [notice, setNotice] = React.useState<LocalizedMessage | null>(null)
  const dragDepth = React.useRef(0)
  const [dropActive, setDropActive] = React.useState(false)

  const load = React.useCallback(async (preferredId?: string): Promise<void> => {
    const nextSummaries = await window.studio.iconLibraries.list()
    const nextId = preferredId && nextSummaries.some((item) => item.id === preferredId)
      ? preferredId
      : nextSummaries.some((item) => item.id === selectedId) ? selectedId : SYSTEM_ICON_LIBRARY_ID
    const nextLibrary = await window.studio.iconLibraries.get(nextId)
    setSummaries(nextSummaries)
    setSelectedId(nextId)
    setLibrary(nextLibrary)
    setRenameValue(nextLibrary.name)
  }, [selectedId])

  React.useEffect(() => {
    let active = true
    void Promise.all([window.studio.iconLibraries.list(), window.studio.iconLibraries.get(SYSTEM_ICON_LIBRARY_ID)]).then(([nextSummaries, system]) => {
      if (!active) return
      setSummaries(nextSummaries)
      setLibrary(system)
      setRenameValue(system.name)
    }).catch((reason) => onError(localizedMessageFrom(reason)))
    return () => { active = false }
  }, [onError])

  React.useEffect(() => {
    if (!preferredLibraryId || preferredLibraryId === selectedId) return
    void load(preferredLibraryId).catch((reason) => onError(localizedMessageFrom(reason)))
  }, [load, onError, preferredLibraryId, selectedId])

  const selectLibrary = async (id: string): Promise<void> => {
    if (busy || id === selectedId) return
    setBusy(true)
    setNotice(null)
    try {
      const next = await window.studio.iconLibraries.get(id)
      setSelectedId(id)
      setLibrary(next)
      setRenameValue(next.name)
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      setBusy(false)
    }
  }

  const createLibrary = async (): Promise<void> => {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const created = await window.studio.iconLibraries.create(name)
      setNewName('')
      setCreating(false)
      await load(created.id)
      setNotice(localizedMessage('已创建素材库“{name}”', { name: created.name }))
      onChanged()
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      setBusy(false)
    }
  }

  const renameLibrary = async (): Promise<void> => {
    if (!library || library.id === SYSTEM_ICON_LIBRARY_ID || busy) return
    const name = renameValue.trim()
    if (!name || name === library.name) {
      setRenameValue(library.name)
      return
    }
    setBusy(true)
    try {
      const next = await window.studio.iconLibraries.rename(library.id, name)
      setLibrary(next)
      setRenameValue(next.name)
      await load(next.id)
      setNotice(localizedMessage('素材库名称已保存。'))
      onChanged()
    } catch (reason) {
      setRenameValue(library.name)
      onError(localizedMessageFrom(reason))
    } finally {
      setBusy(false)
    }
  }

  const deleteLibrary = async (): Promise<void> => {
    if (!library || library.id === SYSTEM_ICON_LIBRARY_ID || busy) return
    if (!window.confirm(t('删除素材库“{name}”及其中全部图标？', { name: library.name }))) return
    setBusy(true)
    try {
      clearLibraryIconPreviewCache(library.id)
      await window.studio.iconLibraries.delete(library.id)
      await load(SYSTEM_ICON_LIBRARY_ID)
      setNotice(localizedMessage('素材库已删除。'))
      onChanged()
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      setBusy(false)
    }
  }

  const applyLibrary = (next: IconLibrary): void => {
    setLibrary(next)
    setSummaries((current) => current.map((item) => item.id === next.id
      ? { ...item, name: next.name, iconCount: next.icons.length, updatedAt: next.updatedAt }
      : item))
    onChanged()
  }

  const importAssets = async (paths?: string[]): Promise<void> => {
    if (!library || library.id === SYSTEM_ICON_LIBRARY_ID || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const next = paths
        ? await window.studio.iconLibraries.importAssetPaths(library.id, paths)
        : await window.studio.iconLibraries.importAssets(library.id)
      if (next) {
        clearLibraryIconPreviewCache(library.id)
        applyLibrary(next)
        setNotice(localizedMessage('已导入 {count} 个图标素材。', { count: next.icons.length - library.icons.length }))
      }
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      setBusy(false)
    }
  }

  const importPackage = async (path?: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      const imported = path
        ? await window.studio.iconLibraries.importPackagePath(path)
        : await window.studio.iconLibraries.importPackage()
      if (imported) {
        clearLibraryIconPreviewCache(imported.id)
        await load(imported.id)
        setNotice(localizedMessage('已导入素材库“{name}”。', { name: imported.name }))
        onChanged()
      }
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      setBusy(false)
    }
  }

  const exportPackage = async (): Promise<void> => {
    if (!library || library.id === SYSTEM_ICON_LIBRARY_ID || library.icons.length === 0 || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await window.studio.iconLibraries.exportPackage(library.id)
      if (result) setNotice(localizedMessage('素材库已导出到 {path}', { path: result.filePath }))
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      setBusy(false)
    }
  }

  const handleDrop = (event: React.DragEvent<HTMLElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = 0
    setDropActive(false)
    const paths = [...event.dataTransfer.files].map((file) => window.studio.files.getPathForFile(file)).filter(Boolean)
    const packages = paths.filter((path) => path.toLowerCase().endsWith('.cdsicons'))
    if (packages.length === 1 && paths.length === 1) void importPackage(packages[0])
    else if (paths.length > 0 && library?.id !== SYSTEM_ICON_LIBRARY_ID) void importAssets(paths)
  }

  return <section className="utility-workspace icon-library-page" onDragEnter={(event) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current += 1
    setDropActive(true)
  }} onDragOver={(event) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }} onDragLeave={(event) => {
    event.preventDefault()
    event.stopPropagation()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDropActive(false)
  }} onDrop={handleDrop}>
    <aside className="utility-sidebar">
      <div className="panel-heading"><div><span className="eyebrow">{t('图标资源')}</span><h2>{t('素材库')}</h2></div><button className="icon-button" type="button" title={t('新建素材库')} disabled={busy} onClick={() => setCreating((value) => !value)}><FolderPlus size={17} /></button></div>
      {creating && <form className="library-create-form" onSubmit={(event) => { event.preventDefault(); void createLibrary() }}>
        <input autoFocus value={newName} maxLength={80} placeholder={t('素材库名称')} onInput={(event) => setNewName(event.currentTarget.value)} />
        <button type="submit" title={t('创建')} disabled={!newName.trim() || busy}><Plus size={15} /></button>
      </form>}
      <div className="utility-list">
        {summaries.map((summary) => <button type="button" key={summary.id} className={summary.id === selectedId ? 'utility-list-item active' : 'utility-list-item'} disabled={busy} onClick={() => void selectLibrary(summary.id)}>
          <span className="utility-list-icon"><LibraryBig size={16} /></span>
          <span><strong>{summary.system ? t(summary.name) : summary.name}</strong><small>{summary.system ? t('系统素材 · 不可删除') : t('{count} 个图标', { count: summary.iconCount })}</small></span>
        </button>)}
      </div>
      <div className="sidebar-footer"><Check size={14} />{t('系统素材库始终保留')}</div>
    </aside>

    <section className="utility-main" aria-busy={busy}>
      <header className="utility-header">
        <div><span className="eyebrow">{library?.id === SYSTEM_ICON_LIBRARY_ID ? t('系统素材库') : t('自定义素材库')}</span>{library?.id === SYSTEM_ICON_LIBRARY_ID
          ? <h1>{t(library.name)}</h1>
          : <div className="library-title-edit"><input value={renameValue} maxLength={80} aria-label={t('素材库名称')} onInput={(event) => setRenameValue(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void renameLibrary() } }} /><button type="button" title={t('保存名称')} disabled={busy || !renameValue.trim() || renameValue.trim() === library?.name} onClick={() => void renameLibrary()}><Pencil size={15} /></button></div>}</div>
        <div className="utility-actions">
          <button type="button" title={t('导入图标素材')} disabled={busy || !library || library.id === SYSTEM_ICON_LIBRARY_ID} onClick={() => void importAssets()}><ImagePlus size={15} />{t('导入素材')}</button>
          <button type="button" title={t('导入素材库包')} disabled={busy} onClick={() => void importPackage()}><Upload size={15} />{t('导入')}</button>
          <button type="button" title={t('导出素材库包')} disabled={busy || !library || library.id === SYSTEM_ICON_LIBRARY_ID || library.icons.length === 0} onClick={() => void exportPackage()}><Download size={15} />{t('导出')}</button>
          <button className="danger" type="button" title={library?.id === SYSTEM_ICON_LIBRARY_ID ? t('系统素材库不能删除') : t('删除素材库')} disabled={busy || !library || library.id === SYSTEM_ICON_LIBRARY_ID} onClick={() => void deleteLibrary()}><Trash2 size={15} /></button>
        </div>
      </header>
      {notice && <div className="utility-notice" role="status"><Check size={14} /><span>{tm(notice)}</span></div>}
      {operationProgress && (operationProgress.kind === 'icon-library-export' || operationProgress.kind === 'icon-library-import') && <div className="operation-progress utility-operation-progress" role="status"><span>{tm(operationProgress.message)}</span><small>{t('处理中')}</small><button type="button" title={t('取消操作')} onClick={() => void window.studio.operations.cancel(operationProgress.id)}>{t('取消')}</button></div>}
      {library && <div className="library-summary"><span>{t('{count} 个图标', { count: library.icons.length })}</span><span>{library.id === SYSTEM_ICON_LIBRARY_ID ? t('默认随 Studio 提供') : t('PNG、WebP、JPEG、SVG、GIF')}</span></div>}
      {library?.icons.length ? <div className="library-icon-grid">
        {library.icons.map((icon) => <LibraryIconTile key={icon.id} library={library} icon={icon} busy={busy} onBusy={setBusy} onChange={applyLibrary} onError={onError} />)}
      </div> : <div className="utility-empty"><ImagePlus size={25} /><strong>{t('这个素材库还没有图标')}</strong><button className="primary-button" type="button" disabled={busy || library?.id === SYSTEM_ICON_LIBRARY_ID} onClick={() => void importAssets()}><ImagePlus size={15} />{t('导入素材')}</button></div>}
      {dropActive && <div className="utility-drop-overlay" role="status"><ImagePlus size={24} /><strong>{t('释放图片以导入当前素材库')}</strong></div>}
    </section>
  </section>
}

function LibraryIconTile({
  library,
  icon,
  busy,
  onBusy,
  onChange,
  onError
}: {
  library: IconLibrary
  icon: IconLibrary['icons'][number]
  busy: boolean
  onBusy: (busy: boolean) => void
  onChange: (library: IconLibrary) => void
  onError: (message: LocalizedMessage) => void
}): React.JSX.Element {
  const system = library.id === SYSTEM_ICON_LIBRARY_ID
  const [name, setName] = React.useState(icon.name)
  React.useEffect(() => setName(icon.name), [icon.name])

  const update = async (patch: { name?: string; defaultEnabled?: boolean; defaultWeight?: number }): Promise<void> => {
    if (system || busy) return
    onBusy(true)
    try {
      onChange(await window.studio.iconLibraries.updateIcon(library.id, icon.id, patch))
    } catch (reason) {
      setName(icon.name)
      onError(localizedMessageFrom(reason))
    } finally {
      onBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (system || busy || !window.confirm(t('删除图标“{name}”？', { name: icon.name }))) return
    onBusy(true)
    try {
      clearLibraryIconPreviewCache(library.id)
      onChange(await window.studio.iconLibraries.deleteIcon(library.id, icon.id))
    } catch (reason) {
      onError(localizedMessageFrom(reason))
    } finally {
      onBusy(false)
    }
  }

  return <article className="library-icon-tile">
    <div className="library-icon-preview"><LibraryIconPreview libraryId={library.id} icon={icon} size={28} /></div>
    {system ? <strong title={t(builtinIconLabels['builtinName' in icon ? icon.builtinName : ''] ?? icon.name)}>{t(builtinIconLabels['builtinName' in icon ? icon.builtinName : ''] ?? icon.name)}</strong> : <input value={name} maxLength={80} aria-label={t('图标名称')} onInput={(event) => setName(event.currentTarget.value)} onBlur={() => {
      const next = name.trim()
      if (!next || next === icon.name) setName(icon.name)
      else void update({ name: next })
    }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />}
    <label className="library-icon-toggle"><span>{t('参与随机')}</span><input type="checkbox" checked={icon.defaultEnabled} disabled={system || busy} onChange={(event) => void update({ defaultEnabled: event.currentTarget.checked })} /></label>
    <label className="library-icon-weight"><span>{t('默认优先级')}</span><input type="range" min={1} max={10} step={1} value={icon.defaultWeight} disabled={system || busy} onChange={(event) => void update({ defaultWeight: Number(event.currentTarget.value) })} /><output>{icon.defaultWeight}</output></label>
    {!system && <button className="library-icon-delete" type="button" title={t('删除图标')} disabled={busy} onClick={() => void remove()}><Trash2 size={14} /></button>}
  </article>
}

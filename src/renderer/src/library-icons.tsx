import * as React from 'react'
import { ImageOff } from 'lucide-react'
import type { IconLibrary, ProjectIconRef, SystemLibraryIcon } from '../../shared/project-icons'
import type { IconSlot } from '../../shared/theme'
import { builtinIcons } from './icons'

export interface ThemeIconLibraryContextValue {
  libraries: IconLibrary[]
  busy: boolean
  selectIcon: (slot: IconSlot, ref: ProjectIconRef) => Promise<void>
}

export const ThemeIconLibraryContext = React.createContext<ThemeIconLibraryContextValue>({
  libraries: [],
  busy: false,
  selectIcon: async () => undefined
})

const previewUrlCache = new Map<string, Promise<string>>()

export function clearLibraryIconPreviewCache(libraryId?: string): void {
  if (!libraryId) {
    previewUrlCache.clear()
    return
  }
  for (const key of previewUrlCache.keys()) {
    if (key.startsWith(`${libraryId}:`)) previewUrlCache.delete(key)
  }
}

export function LibraryIconPreview({
  libraryId,
  icon,
  size = 22
}: {
  libraryId: string
  icon: IconLibrary['icons'][number]
  size?: number
}): React.JSX.Element {
  const systemIcon = isSystemIcon(icon) ? builtinIcons[icon.builtinName] : null
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    if (systemIcon) return undefined
    let active = true
    const key = `${libraryId}:${icon.id}`
    const request = previewUrlCache.get(key) ?? window.studio.iconLibraries.getPreviewUrl(libraryId, icon.id)
    previewUrlCache.set(key, request)
    void request.then((url) => {
      if (active) setPreviewUrl(url)
    }).catch(() => {
      previewUrlCache.delete(key)
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [icon.id, libraryId, systemIcon])

  if (systemIcon) {
    const Icon = systemIcon
    return <Icon aria-hidden="true" size={size} />
  }
  if (previewUrl) return <img className="library-icon-image" src={previewUrl} alt="" draggable={false} />
  return <ImageOff aria-hidden="true" className={failed ? 'library-icon-fallback is-error' : 'library-icon-fallback'} size={Math.max(14, size - 4)} />
}

function isSystemIcon(icon: IconLibrary['icons'][number]): icon is SystemLibraryIcon {
  return 'builtinName' in icon
}

import { DEFAULT_LOCALE, type SupportedLocale } from '../../shared/i18n'
import { resolveThemeCopy, type ThemeCopy, type ThemeProfile } from '../../shared/theme'

let activeContentLocale: SupportedLocale = DEFAULT_LOCALE

export function setActiveContentLocale(locale: SupportedLocale): void {
  activeContentLocale = locale
}

export function getActiveContentLocale(): SupportedLocale {
  return activeContentLocale
}

export function activeThemeCopy(profile: ThemeProfile): ThemeCopy {
  return resolveThemeCopy(profile, activeContentLocale)
}

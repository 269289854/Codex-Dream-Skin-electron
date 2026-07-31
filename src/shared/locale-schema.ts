import { z } from 'zod'
import { SUPPORTED_LOCALES, type SupportedLocale } from './i18n'

export const localeSchema: z.ZodType<SupportedLocale> = z.enum(SUPPORTED_LOCALES)

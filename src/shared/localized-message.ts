export type LocalizedMessage =
  | {
      source: string
      values?: Readonly<Record<string, string | number | LocalizedMessage>>
    }
  | {
      parts: readonly LocalizedMessage[]
      separator: string
    }

const LOCALIZED_MESSAGE_BRIDGE_PREFIX = '__CDSS_LOCALIZED_MESSAGE__:'

export function localizedMessage(
  source: string,
  values?: Readonly<Record<string, string | number | LocalizedMessage>>
): LocalizedMessage {
  return values ? { source, values } : { source }
}

export function joinLocalizedMessages(parts: readonly LocalizedMessage[], separator = '；'): LocalizedMessage {
  return { parts, separator }
}

export function formatLocalizedMessageSource(message: LocalizedMessage): string {
  if ('parts' in message) {
    return message.parts.map(formatLocalizedMessageSource).join(message.separator)
  }
  return message.source.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, key: string) => {
    const value = message.values?.[key]
    if (value === undefined) return match
    return typeof value === 'object' ? formatLocalizedMessageSource(value) : String(value)
  })
}

export class LocalizedError extends Error {
  constructor(readonly localizedMessage: LocalizedMessage, encodeForBridge = false) {
    super(encodeForBridge ? encodeLocalizedMessageForBridge(localizedMessage) : formatLocalizedMessageSource(localizedMessage))
    this.name = 'LocalizedError'
  }
}

export function localizedMessageFrom(reason: unknown, fallback = '操作失败'): LocalizedMessage {
  if (reason instanceof LocalizedError) return reason.localizedMessage
  if (reason && typeof reason === 'object' && 'localizedMessage' in reason && isLocalizedMessage(reason.localizedMessage)) {
    return reason.localizedMessage
  }
  if (reason instanceof Error) return decodeLocalizedMessageFromBridge(reason.message) ?? localizedMessage(reason.message)
  return localizedMessage(typeof reason === 'string' ? reason : fallback)
}

export function encodeLocalizedMessageForBridge(message: LocalizedMessage): string {
  return `${LOCALIZED_MESSAGE_BRIDGE_PREFIX}${JSON.stringify(message)}`
}

function decodeLocalizedMessageFromBridge(value: string): LocalizedMessage | null {
  const marker = value.indexOf(LOCALIZED_MESSAGE_BRIDGE_PREFIX)
  if (marker < 0) return null
  try {
    const decoded = JSON.parse(value.slice(marker + LOCALIZED_MESSAGE_BRIDGE_PREFIX.length)) as unknown
    return isLocalizedMessage(decoded) ? decoded : null
  } catch {
    return null
  }
}

export function isLocalizedMessage(value: unknown, depth = 0): value is LocalizedMessage {
  if (!value || typeof value !== 'object' || depth > 20) return false
  if ('source' in value) {
    if (typeof value.source !== 'string') return false
    if (!('values' in value) || value.values === undefined) return true
    if (!value.values || typeof value.values !== 'object' || Array.isArray(value.values)) return false
    return Object.values(value.values).every((item) =>
      typeof item === 'string' || typeof item === 'number' || isLocalizedMessage(item, depth + 1))
  }
  if (!('parts' in value) || !Array.isArray(value.parts) || !('separator' in value) || typeof value.separator !== 'string') return false
  return value.parts.every((part) => isLocalizedMessage(part, depth + 1))
}

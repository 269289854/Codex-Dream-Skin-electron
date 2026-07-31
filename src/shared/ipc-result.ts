import { LocalizedError, localizedMessageFrom, type LocalizedMessage } from './localized-message'

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: LocalizedMessage }

export async function captureIpcResult<T>(operation: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (reason) {
    return { ok: false, error: localizedMessageFrom(reason) }
  }
}

export function unwrapIpcResult<T>(result: IpcResult<T>, encodeErrorForBridge = false): T {
  if (result.ok) return result.value
  throw new LocalizedError(result.error, encodeErrorForBridge)
}

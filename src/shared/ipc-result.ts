export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export async function captureIpcResult<T>(operation: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (reason) {
    return { ok: false, error: reason instanceof Error ? reason.message : String(reason) }
  }
}

export function unwrapIpcResult<T>(result: IpcResult<T>): T {
  if (result.ok) return result.value
  throw new Error(result.error)
}

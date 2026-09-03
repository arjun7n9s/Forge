import type { Outcome } from './types.ts'

export type FetchFailure = Extract<Outcome, 'timeout' | 'upstream_error'>

export async function timedFetch(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<Response | FetchFailure> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetcher(url, { ...init, signal: controller.signal })
  } catch (error) {
    return error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'upstream_error'
  } finally {
    clearTimeout(timer)
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

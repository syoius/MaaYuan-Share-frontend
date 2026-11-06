import { SearchTimeoutError } from './error'

export const SEARCH_TIMEOUT_MS = 15_000

export async function withSearchTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new SearchTimeoutError())
      controller.abort()
    }, SEARCH_TIMEOUT_MS)
  })
  try {
    return await Promise.race([request(controller.signal), timeout])
  } finally {
    clearTimeout(timer!)
  }
}

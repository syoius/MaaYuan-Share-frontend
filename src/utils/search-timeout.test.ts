import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { SearchTimeoutError } from './error'
import { SEARCH_TIMEOUT_MS, withSearchTimeout } from './search-timeout'

vi.mock('../i18n/i18n', () => ({
  i18n: { utils: { error: { search_timeout: '搜索请求超时，请重试' } } },
}))
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('ends a stalled request and aborts its signal at the deadline', async () => {
  let signal: AbortSignal | undefined
  const request = withSearchTimeout((value) => {
    signal = value
    return new Promise(() => {})
  })
  const rejected = expect(request).rejects.toBeInstanceOf(SearchTimeoutError)
  await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS - 1)
  expect(signal?.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await rejected
  expect(signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
it('includes reading the response body in the deadline', async () => {
  const request = withSearchTimeout(async () => {
    const response = { json: () => new Promise(() => {}) }
    return response.json()
  })
  const rejected = expect(request).rejects.toThrow('搜索请求超时')
  await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS)
  await rejected
})
it('clears the deadline after a successful request without aborting it', async () => {
  let signal: AbortSignal | undefined
  expect(
    await withSearchTimeout(async (value) => {
      signal = value
      return 42
    }),
  ).toBe(42)
  expect(vi.getTimerCount()).toBe(0)
  await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS)
  expect(signal?.aborted).toBe(false)
})
it('preserves immediate request errors and clears the timer', async () => {
  const error = new Error('server failure')
  await expect(
    withSearchTimeout(() => {
      throw error
    }),
  ).rejects.toBe(error)
  expect(vi.getTimerCount()).toBe(0)
})

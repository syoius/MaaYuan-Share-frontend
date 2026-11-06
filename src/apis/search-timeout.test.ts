import { getDefaultStore } from 'jotai'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import translations from '../i18n/generated/cn'
import { rawTranslationsAtom } from '../i18n/i18n'
import { SearchTimeoutError } from '../utils/error'
import { SEARCH_TIMEOUT_MS } from '../utils/search-timeout'
import { useOperations } from './operation'
import { useOperationSetSearch } from './operation-set'

vi.hoisted(() => vi.stubEnv('VITE_API', 'http://search.test'))
vi.mock('utils/token-manager', () => ({
  TokenManager: {
    updateAndGetToken: async () => {
      throw new Error('anonymous')
    },
  },
}))
const item = {
  id: 12345,
  name: 'fixture',
  copilot_ids: [],
  create_time: '2026-01-01',
  update_time: '2026-01-01',
  content: JSON.stringify({
    stage_name: 'test',
    doc: { title: 'fixture' },
    actions: [],
  }),
}
let root: ReturnType<typeof createRoot>
let latest: {
  items: { id: number }[]
  error: Error | undefined
  isValidating: boolean
  retry: () => Promise<unknown>
  setSize: (size: number) => unknown
}
const fetchMock = vi.fn()
function Operations({ keyword }: { keyword: string }) {
  const response = useOperations({ keyword })
  latest = { ...response, items: response.operations }
  return null
}
function Sets({ keyword }: { keyword: string }) {
  const response = useOperationSetSearch({ keyword, suspense: false })
  latest = { ...response, items: response.operationSets }
  return null
}
function result(url: string, hasNext = false) {
  return new Response(
    JSON.stringify({
      status_code: 200,
      data: url.includes('/set/get')
        ? item
        : { data: [item], has_next: hasNext, total: 1, page: 1 },
    }),
  )
}
async function render(kind: string) {
  await act(async () =>
    root.render(
      createElement(
        SWRConfig,
        {
          value: {
            provider: () => new Map(),
            errorRetryInterval: 10,
            errorRetryCount: 3,
            dedupingInterval: 0,
          },
        },
        createElement(kind === 'operations' ? Operations : Sets, {
          keyword: kind === 'shortcode' ? 'maay://12345' : 'fixture',
        }),
      ),
    ),
  )
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  getDefaultStore().set(rawTranslationsAtom, {
    language: 'cn',
    data: translations,
  })
  vi.useFakeTimers()
  root = createRoot(document.createElement('div'))
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it.each(['operations', 'sets', 'shortcode'])(
  '%s times out without automatic retries and can recover manually',
  async (kind) => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    await render(kind)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    expect(latest.isValidating).toBe(true)
    await advance(SEARCH_TIMEOUT_MS)
    expect(latest.error).toBeInstanceOf(SearchTimeoutError)
    expect(latest.isValidating).toBe(false)
    expect(signal.aborted).toBe(true)
    await advance(SEARCH_TIMEOUT_MS * 4)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockImplementation(async (url) => result(url))
    await act(async () => {
      await latest.retry()
    })
    expect(latest.error).toBeUndefined()
    expect(latest.items.map((item) => item.id)).toEqual([12345])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[0][0])
    expect(fetchMock.mock.calls[1][1].body).toEqual(
      fetchMock.mock.calls[0][1].body,
    )
  },
)
it('retains loaded operations after the next page times out', async () => {
  fetchMock.mockImplementationOnce(async (url) => result(url, true))
  await render('operations')
  expect(latest.items.map((item) => item.id)).toEqual([12345])
  fetchMock.mockImplementation(() => new Promise(() => {}))
  await act(async () => {
    void latest.setSize(2)
  })
  await advance(SEARCH_TIMEOUT_MS)
  expect(latest.error).toBeInstanceOf(SearchTimeoutError)
  expect(latest.items.map((item) => item.id)).toEqual([12345])
  expect(latest.isValidating).toBe(false)
})
it('also times out when headers arrive but the response body stalls', async () => {
  fetchMock.mockImplementation(
    async () => new Response(new ReadableStream({ start() {} })),
  )
  await render('operations')
  await advance(SEARCH_TIMEOUT_MS)
  expect(latest.error).toBeInstanceOf(SearchTimeoutError)
  expect(latest.isValidating).toBe(false)
})

it('ignores a late response from a timed out attempt after a successful retry', async () => {
  let finishOldRequest!: (response: Response) => void
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finishOldRequest = resolve
      }),
  )
  await render('operations')
  await advance(SEARCH_TIMEOUT_MS)
  expect(latest.error).toBeInstanceOf(SearchTimeoutError)
  fetchMock.mockImplementation(async (url) => result(url))
  await act(async () => {
    await latest.retry()
  })
  expect(latest.items.map((item) => item.id)).toEqual([12345])
  await act(async () => {
    finishOldRequest(
      new Response(
        JSON.stringify({
          status_code: 200,
          data: {
            data: [{ ...item, id: 99999 }],
            has_next: false,
            total: 1,
            page: 1,
          },
        }),
      ),
    )
  })
  expect(latest.error).toBeUndefined()
  expect(latest.items.map((item) => item.id)).toEqual([12345])
})

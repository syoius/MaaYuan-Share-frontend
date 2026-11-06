import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { SWRConfig } from 'swr'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UseOperationsParams, useOperations } from './operation'

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
  stage_id: '2_0_2_5_nian_1_1',
  tags: ['如鸢'],
  metadata: { source_type: 'repost', repost_author: '作者' },
  content: JSON.stringify({
    stage_name: '2_0_2_5_nian_1_1',
    doc: { title: '洞窟' },
    actions: [],
  }),
}
let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
let latest: ReturnType<typeof useOperations>
const fetchMock = vi.fn()

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  root = createRoot(host)
  fetchMock.mockReset().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          status_code: 200,
          data: { data: [item], has_next: false, total: 1, page: 1 },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})
async function render(params: UseOperationsParams) {
  const Harness = () => {
    latest = useOperations(params)
    return null
  }
  await act(async () =>
    root.render(
      createElement(
        SWRConfig,
        {
          value: {
            provider: () => new Map(),
            shouldRetryOnError: false,
            dedupingInterval: 0,
          },
        },
        createElement(Harness),
      ),
    ),
  )
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(fetchMock).toHaveBeenCalled()
    expect(latest.isValidating).toBe(false)
  })
}

describe('search through the real generated HTTP client', () => {
  it('sends normalized AND tags and preserves raw metadata', async () => {
    await render({
      tags: [' 如鸢 ', '代号鸢', '如鸢', ''],
      keyword: '洞窟',
      levelKeyword: 'stage',
      uploaderId: 'author',
    })
    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.getAll('tags')).toEqual(['如鸢', '代号鸢'])
    expect(url.searchParams.get('document')).toBe('洞窟')
    expect(url.searchParams.get('levelKeyword')).toBe('stage')
    expect(url.searchParams.get('uploaderId')).toBe('author')
    expect(latest.operations[0].metadata).toMatchObject({
      tags: ['如鸢'],
      repostAuthor: '作者',
    })
  })

  it.each([
    { keyword: '洞窟' },
    { keyword: 'maay://12345', tags: ['代号鸢'] },
    { levelKeyword: '2_0_2_5_nian_1_1' },
    { uploaderId: 'author' },
    { tags: ['如鸢'] },
    { operator: { included: ['张角'], excluded: [] } },
    { operationIds: [12345] },
  ])('does not hide an explicit hot-sort search: %j', async (params) => {
    await render({ orderBy: 'hot', ...params })
    expect(latest.operations.map((op) => op.id)).toEqual([12345])
    if (params.keyword === 'maay://12345') {
      const url = new URL(fetchMock.mock.calls[0][0])
      expect(url.searchParams.get('copilotIds')).toBe('12345')
      expect(url.searchParams.has('tags')).toBe(false)
    }
  })
  it('keeps the blocklist for unfiltered hot browsing', async () => {
    await render({ orderBy: 'hot' })
    expect(latest.operations).toEqual([])
  })
  it.each([
    [200, { status_code: 400, message: '查询失败' }],
    [503, { message: '查询失败' }],
    [200, { status_code: 200, data: null, message: '查询失败' }],
  ])(
    'reports HTTP %s or business failure instead of an empty success',
    async (status, body) => {
      fetchMock.mockImplementation(
        async () =>
          new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
      )
      await render({ keyword: '[' })
      expect(latest.error?.message).toBe('查询失败')
      expect(latest.isReachingEnd).toBe(false)
    },
  )
  it('accepts a successful empty result', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            status_code: 200,
            data: { data: [], has_next: false },
          }),
        ),
    )
    await render({ keyword: '不存在' })
    expect(latest.error).toBeUndefined()
    expect(latest.operations).toEqual([])
    expect(latest.isReachingEnd).toBe(true)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readYuanHubAccounts } from './yuanhub'

const state = vi.hoisted(() => ({ userId: 'owner' }))
vi.mock('jotai', () => ({ getDefaultStore: () => ({ get: () => state }) }))
vi.mock('../store/auth', () => ({ authAtom: {} }))
vi.mock('../utils/token-manager', () => ({
  TokenManager: { updateAndGetToken: async () => 'site-token' },
}))
const token = `ymatch_${'a'.repeat(32)}`
const body = { status_code: 200, data: { connection_id: 'c', accounts: [] } }
beforeEach(() => {
  state.userId = 'owner'
})
afterEach(() => vi.unstubAllGlobals())

describe('matching relay identity boundary', () => {
  it('keeps both credentials out of the URL and disables response caching', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => body })
    vi.stubGlobal('fetch', fetch)
    expect(
      await readYuanHubAccounts(token, 'owner', new AbortController().signal),
    ).toEqual({ connectionId: 'c', accounts: [] })
    const [url, options] = fetch.mock.calls[0]
    expect(url).toMatch(/\/yuanhub\/matcher\/accounts$/)
    expect(url).not.toContain(token)
    expect(options).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      headers: { Authorization: 'Bearer site-token', 'X-YuanHub-Token': token },
    })
  })
  it('rejects a response after the site user switches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          state.userId = 'other'
          return body
        },
      }),
    )
    await expect(
      readYuanHubAccounts(token, 'owner', new AbortController().signal),
    ).rejects.toThrow('取消')
  })
  it('rejects late responses even if fetch ignores cancellation', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          controller.abort()
          return body
        },
      }),
    )
    await expect(
      readYuanHubAccounts(token, 'owner', controller.signal),
    ).rejects.toThrow('取消')
  })
})

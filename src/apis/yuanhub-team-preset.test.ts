import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
  readYuanHubTeamPresets,
  saveYuanHubTeamPreset,
} from './yuanhub-team-preset'

const state = vi.hoisted(() => ({ userId: 'owner' }))
vi.mock('jotai', () => ({ getDefaultStore: () => ({ get: () => state }) }))
vi.mock('../store/auth', () => ({ authAtom: {} }))
vi.mock('../utils/token-manager', () => ({
  TokenManager: { updateAndGetToken: async () => 'site-token' },
}))
const account = { connectionId: 'c', accountId: 'a', game: '如鸢' }
const preset = {
  ...account,
  label: 'test',
  members: Array.from({ length: 5 }, (_, i) => ({
    operatorId: String(i),
    loadoutId: 'two',
  })),
}
const raw = {
  connection_id: 'c',
  account_id: 'a',
  game: '如鸢',
  id: 'p',
  label: 'test',
  version: 0,
  members: preset.members.map((m) => ({
    operator_id: m.operatorId,
    loadout_id: m.loadoutId,
  })),
}
beforeEach(() => {
  state.userId = 'owner'
})
afterEach(() => vi.unstubAllGlobals())
it('writes only the team references using site authentication and snake_case wire keys', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status_code: 200, data: raw }),
  })
  vi.stubGlobal('fetch', fetch)
  const result = await saveYuanHubTeamPreset(
    'owner',
    preset,
    new AbortController().signal,
  )
  expect(result.members).toEqual(preset.members)
  const [url, init] = fetch.mock.calls[0]
  expect(url).toMatch(/\/yuanhub\/team-presets$/)
  expect(init.headers).toEqual({
    Authorization: 'Bearer site-token',
    'Content-Type': 'application/json',
  })
  expect(JSON.parse(init.body)).toEqual({
    connection_id: 'c',
    account_id: 'a',
    game: '如鸢',
    label: 'test',
    members: raw.members,
  })
  expect(init.cache).toBe('no-store')
})
it('rejects late reads after switching site users', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        state.userId = 'other'
        return { status_code: 200, data: [raw] }
      },
    }),
  )
  await expect(
    readYuanHubTeamPresets('owner', account, new AbortController().signal),
  ).rejects.toThrow('账号已切换')
})
it('never sends a pending write under a different site user', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  state.userId = 'other'
  await expect(
    saveYuanHubTeamPreset('owner', preset, new AbortController().signal),
  ).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})
it('reports missing deployment and business save failures without claiming success', async () => {
  const fetch = vi.fn().mockResolvedValue({ status: 404 })
  vi.stubGlobal('fetch', fetch)
  await expect(
    readYuanHubTeamPresets('owner', account, new AbortController().signal),
  ).rejects.toThrow('尚未部署')
  fetch.mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => ({ status_code: 400, message: '预设已在其他设备修改' }),
  })
  await expect(
    saveYuanHubTeamPreset('owner', preset, new AbortController().signal),
  ).rejects.toThrow('其他设备修改')
})

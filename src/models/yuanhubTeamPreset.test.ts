import { expect, it } from 'vitest'

import { normalizeTeamPreset, teamMemberIssue } from './yuanhubTeamPreset'
import type { YuanHubTrainingSnapshot } from './yuanhubTraining'

const account = { connectionId: 'c', accountId: 'a', game: '如鸢' }
const raw = {
  connection_id: 'c',
  account_id: 'a',
  game: '如鸢',
  id: 'p',
  label: 'team',
  version: 0,
  members: Array.from({ length: 5 }, (_, i) => ({
    operator_id: String(i),
    loadout_id: 'disc',
  })),
}
it('validates the full account scope and distinct five member payload at the cloud boundary', () => {
  expect(normalizeTeamPreset(raw, account).members[0]).toEqual({
    operatorId: '0',
    loadoutId: 'disc',
  })
  for (const data of [
    { ...raw, connection_id: 'other' },
    { ...raw, account_id: 'other' },
    { ...raw, game: '代号鸢' },
    { ...raw, members: raw.members.slice(1) },
    { ...raw, members: Array(5).fill(raw.members[0]) },
    { ...raw, version: -1 },
  ]) {
    expect(() => normalizeTeamPreset(data, account)).toThrow()
  }
})
it('does not substitute another loadout when a saved loadout is removed', () => {
  const snapshot = {
    ...account,
    accountName: '测试',
    syncedAt: '2026-11-06',
    operators: [
      { id: '0', loadouts: [{ id: 'new', name: '新盘', discs: [] }] },
    ],
  } satisfies YuanHubTrainingSnapshot
  expect(
    teamMemberIssue({ operatorId: '0', loadoutId: 'disc' }, snapshot),
  ).toContain('命盘方案已不存在')
  expect(
    teamMemberIssue({ operatorId: 'missing', loadoutId: null }, snapshot),
  ).toContain('已无此密探')
  expect(
    teamMemberIssue({ operatorId: '0', loadoutId: null }, snapshot),
  ).toBeUndefined()
})

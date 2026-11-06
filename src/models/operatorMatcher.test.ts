import { describe, expect, it } from 'vitest'

import { CopilotDocV1 } from './copilot.schema'
import { OPERATORS } from './generated/operators.json'
import { Operation } from './operation'
import {
  MatcherSnapshot,
  getOperationMatchResult,
  normalizeYuanHubSnapshot,
} from './operatorMatcher'

const [a, b, c, d, e, f] = OPERATORS
const account = { id: 'test-account', name: '测试账号', game: '如鸢' }
const expected = {
  connectionId: 'connection',
  accountId: account.id,
  game: account.game,
}
const payload = (entries: Record<string, unknown>) => ({
  version: 1,
  connection_id: 'connection',
  account,
  operators: Object.fromEntries(
    Object.entries(entries).map(([id, value]) => [
      id,
      {
        owned: true,
        discs: [],
        main_stars: [],
        assist_stars: [],
        ...(value as object),
      },
    ]),
  ),
})
const normalize = (value: unknown) => normalizeYuanHubSnapshot(value, expected)
const snapshot = () =>
  normalize(
    payload(
      Object.fromEntries(
        [a, b, c, d, e].map((op) => [
          op.id,
          { level: 100, elite: 17, stars: 5 },
        ]),
      ),
    ),
  )
const operation = (
  opers: CopilotDocV1.Operator[],
  groups: CopilotDocV1.Group[] = [],
) =>
  ({
    parsedContent: { opers, groups },
    metadata: {},
  }) as Operation
const result = (op: Operation, owned: MatcherSnapshot = snapshot()) =>
  getOperationMatchResult(op, owned)

describe('YuanHub normalization', () => {
  it('accepts empty successful data', () => {
    expect(normalize(payload({})).operators).toEqual({})
  })
  it('rejects other connections accounts games and unknown protocol versions', () => {
    for (const change of [
      { connection_id: 'other' },
      { account: { ...account, id: 'other' } },
      { account: { ...account, game: '代号鸢' } },
      { version: 2 },
      { operators: [] },
    ])
      expect(() => normalize({ ...payload({}), ...change })).toThrow()
  })
  it('preserves explicit zero cultivation and keeps missing growth unknown', () => {
    const data = normalize(
      payload({ [a.id]: { level: 1, elite: 0, stars: null } }),
    )
    expect(data.operators[a.id]).toMatchObject({
      owned: true,
      level: 1,
      elite: 0,
      stars: undefined,
    })
    expect(
      result(operation([{ name: a.name, requirements: { elite: 1 } }]), data)
        .mode,
    ).toBe('train')
  })
  it('uses only calculated panel values', () => {
    for (const status of ['incomplete', 'unsupported', 'unavailable'])
      expect(
        normalize(
          payload({ [a.id]: { panel: { status, attack: 9000, hp: 10000 } } }),
        ).operators[a.id].attack,
      ).toBeUndefined()
    expect(
      normalize(
        payload({
          [a.id]: { panel: { status: 'calculated', attack: 9000, hp: 10000 } },
        }),
      ).operators[a.id].attack,
    ).toBe(9000)
  })
})

describe('five-person matching without support', () => {
  it('allows five distinct operators and rejects six even if owned', () => {
    expect(result(operation([a, b, c, d, e])).mode).toBe('ready')
    const owned = snapshot()
    owned.operators[f.id] = { ...owned.operators[a.id], id: f.id }
    expect(result(operation([a, b, c, d, e, f]), owned).mode).toBe('blocked')
  })
  it('does not borrow even one missing operator', () => {
    expect(result(operation([a, f])).mode).toBe('blocked')
  })
  it('backtracks overlapping alternatives and prevents reusing a person', () => {
    expect(
      result(
        operation(
          [],
          [
            { name: '组一', opers: [a, b] },
            { name: '组二', opers: [a] },
          ],
        ),
      ).mode,
    ).toBe('ready')
    expect(result(operation([a], [{ name: '组一', opers: [a] }])).mode).toBe(
      'blocked',
    )
    expect(result(operation([a, a])).mode).toBe('blocked')
  })
  it('compares independent level and cultivation and never infers Arknights elite stages', () => {
    expect(
      result(
        operation([{ name: a.name, requirements: { level: 101, elite: 17 } }]),
      ).mode,
    ).toBe('train')
    expect(
      result(
        operation([{ name: a.name, requirements: { level: 80, elite: 18 } }]),
      ).mode,
    ).toBe('train')
  })
  it('only tests explicitly stated requirements and respects unrestricted operators', () => {
    const owned = snapshot()
    owned.operators[a.id].level = undefined
    expect(result(operation([a]), owned).mode).toBe('ready')
    expect(
      result(
        operation([
          {
            name: a.name,
            unrestricted: true,
            requirements: { level: 150 },
          } as CopilotDocV1.Operator,
        ]),
        owned,
      ).mode,
    ).toBe('ready')
  })
  it('marks absent formations and empty groups unknown', () => {
    expect(result(operation([])).mode).toBe('unknown')
    expect(result(operation([a], [{ name: '空组', opers: [] }])).mode).toBe(
      'unknown',
    )
  })
  it('separates game versions and allows shared operations', () => {
    expect(
      result({ ...operation([a]), metadata: { tags: ['代号鸢'] } } as Operation)
        .mode,
    ).toBe('blocked')
    expect(
      result({
        ...operation([a]),
        metadata: { tags: ['代号鸢', '如鸢'] },
      } as Operation).mode,
    ).toBe('ready')
  })
  it('never joins separate destiny loadouts into an imaginary loadout', () => {
    const owned = snapshot()
    const names = a.discs.slice(0, 4).map((d) => d.ot_name)
    owned.operators[a.id].discs = [
      [names[0], names[2], names[3]],
      [names[1], names[2], names[3]],
    ]
    const required = operation([
      { name: a.name, discsSelected: [1, 2] } as CopilotDocV1.Operator,
    ])
    expect(result(required, owned).mode).toBe('train')
    owned.operators[a.id].discs.push([names[0], names[1], names[2]])
    expect(result(required, owned).mode).toBe('ready')
  })
  it('requires complete evidence for forbidden discs and duplicate star requirements', () => {
    const owned = snapshot()
    owned.operators[a.id].discs = [[a.discs[0].ot_name]]
    expect(
      result(
        operation([
          { name: a.name, discsSelected: [-2] } as CopilotDocV1.Operator,
        ]),
        owned,
      ).mode,
    ).toBe('unknown')
    owned.operators[a.id].mainStars = ['天府']
    expect(
      result(
        operation([
          {
            name: a.name,
            discStarStones: ['天府', '天府'],
          } as CopilotDocV1.Operator,
        ]),
        owned,
      ).mode,
    ).toBe('unknown')
  })
  it('does not pass attack/health requirements using missing or stale panels', () => {
    const owned = normalize(
      payload({
        [a.id]: {
          star_level: 31,
          level: 100,
          elite: 17,
          combat_stats: {
            source: 'scan',
            observed_status: 'valid',
            observed_attack: 9000,
            manual_attack: 9000,
          },
        },
      }),
    )
    expect(
      result(
        operation([{ name: a.name, attack: 8000 } as CopilotDocV1.Operator]),
        owned,
      ).mode,
    ).toBe('unknown')
  })
})

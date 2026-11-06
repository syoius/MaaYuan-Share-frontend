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
  it('accepts ownership records without training data and ignores unused fields', () => {
    const data = normalize(
      payload({ [a.id]: { level: 1, discs: null, panel: null } }),
    )
    expect(data.operators[a.id]).toEqual({ id: a.id, owned: true })
    expect(
      normalize({ ...payload({}), operators: { [a.id]: {} } }).operators[a.id],
    ).toEqual({ id: a.id, owned: undefined })
  })
  it('rejects malformed ownership records', () => {
    for (const entry of [null, [], { owned: 'true' }, { owned: 1 }])
      expect(() =>
        normalize({ ...payload({}), operators: { [a.id]: entry } }),
      ).toThrow()
  })
})

describe('five-person matching without support', () => {
  it('excludes owned operators even without growth requirements and preserves the roster', () => {
    const owned = snapshot()
    const original = structuredClone(owned)
    const op = operation([
      { name: a.name, unrestricted: true } as CopilotDocV1.Operator,
    ])
    const excluded = getOperationMatchResult(op, owned, [a.id])
    expect(excluded.mode).toBe('blocked')
    expect(excluded.reasons).toContain(`${a.name}：已设为不使用`)
    expect(owned).toEqual(original)
    expect(getOperationMatchResult(op, owned, []).mode).toBe('ready')
  })
  it('keeps alternative formations and never reuses a remaining candidate after exclusion', () => {
    const owned = snapshot()
    expect(
      getOperationMatchResult(
        operation([], [{ name: '任选', opers: [a, b] }]),
        owned,
        [a.id],
      ).mode,
    ).toBe('ready')
    expect(
      getOperationMatchResult(
        operation([], [{ name: '任选', opers: [a, b] }]),
        owned,
        [a.id, b.id],
      ).mode,
    ).toBe('blocked')
    expect(
      getOperationMatchResult(
        operation([b], [{ name: '任选', opers: [a, b] }]),
        owned,
        [a.id],
      ).mode,
    ).toBe('blocked')
  })
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
  it.each([
    { requirements: { level: 150, elite: 20 } },
    { starLevel: 50, attack: 99999, hp: 99999 },
    { discsSelected: [1, -2, 3] },
    {
      extensions: {
        discs: { slots: [{ disc: 1, starStone: '天府', assistStar: '天相' }] },
      },
    },
    { discStarStones: ['天府', '天府'], discAssistStars: ['天相'] },
  ])('ignores training, stats and loadout requirements: %j', (requirements) => {
    const owned = normalize({
      ...payload({}),
      operators: { [a.id]: { owned: true } },
    })
    const op = operation([
      { name: a.name, ...requirements } as CopilotDocV1.Operator,
    ])
    expect(result(op, owned)).toEqual({ mode: 'ready', reasons: [] })
    expect(getOperationMatchResult(op, owned, [a.id]).mode).toBe('blocked')
  })
  it('uses roster presence unless explicitly marked unowned', () => {
    const owned = normalize({ ...payload({}), operators: { [a.id]: {} } })
    expect(result(operation([a]), owned).mode).toBe('ready')
    owned.operators[a.id].owned = false
    expect(result(operation([a]), owned).mode).toBe('blocked')
  })
  it('rejects missing formations, empty groups and unrecognized operators', () => {
    expect(result(operation([])).mode).toBe('blocked')
    expect(result(operation([a], [{ name: '空组', opers: [] }])).mode).toBe(
      'blocked',
    )
    expect(result(operation([{ name: '未知密探' }])).mode).toBe('blocked')
    expect(
      result(
        operation([], [{ name: '任选', opers: [{ name: '未知密探' }, a] }]),
      ).mode,
    ).toBe('ready')
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
})

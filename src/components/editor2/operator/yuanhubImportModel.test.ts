import { describe, expect, it } from 'vitest'

import { OPERATORS } from '../../../models/operator'
import { normalizeYuanHubTraining } from '../../../models/yuanhubTraining'
import { defaultEditorState } from '../editor-state'
import { toMaaOperation } from '../reconciliation'
import {
  mergeImportedOperators,
  yuanHubImportCandidate,
} from './yuanhubImportModel'

const info = OPERATORS[0]
const expected = {
  connectionId: 'connection',
  accountId: 'account',
  game: '如鸢',
}
const raw = (entry: Record<string, unknown>) => ({
  version: 1,
  connection_id: 'connection',
  account: { id: 'account', name: '大号', game: '如鸢' },
  operators: { [info.id]: entry },
})
const read = (entry: Record<string, unknown>) =>
  normalizeYuanHubTraining(raw(entry), expected).operators[0]

describe('YuanHub editor import', () => {
  it('preserves unknown numbers and does not import an uncalculated panel', () => {
    const entry = read({
      panel: { status: 'incomplete', attack: 999, hp: 999 },
      level: null,
    })
    const result = yuanHubImportCandidate(entry)
    expect(result.operator?.requirements?.level).toBeUndefined()
    expect(result.operator?.attack).toBeUndefined()
    expect(result.operator?.hp).toBeUndefined()
    expect(result.warnings.join()).toContain('面板不可用')
    const exported = toMaaOperation({
      ...defaultEditorState.operation,
      opers: [result.operator!],
    })
    expect(exported.opers?.[0].requirements?.level).toBeUndefined()
    expect(exported.opers?.[0]).not.toHaveProperty('attack')
    expect(exported.opers?.[0]).not.toHaveProperty('hp')
  })
  it('imports exactly one actual loadout and keeps star positions and duplicates through export', () => {
    const entry = read({
      level: 100,
      elite: 17,
      stars: 5,
      panel: { status: 'calculated', attack: 1234, hp: 5678 },
      disc_loadouts: [
        { id: 'one', name: '一盘', discs: [info.discs[0].ot_name] },
        { id: 'two', name: '二盘', discs: [info.discs[1].ot_name] },
      ],
      star_slots: {
        main1: null,
        main2: '天府',
        main3: '天府',
        support1: '红鸾',
        support2: null,
        support3: '红鸾',
      },
    })
    const operator = yuanHubImportCandidate(entry, 'two').operator!
    expect(operator.discsSelected).toEqual([2, 0, 0])
    expect(operator.discStarStones).toEqual(['', '天府', '天府'])
    expect(operator.discAssistStars).toEqual(['红鸾', '', '红鸾'])
    expect(operator.attack).toBe(1234)
    const exported = toMaaOperation({
      ...defaultEditorState.operation,
      opers: [operator],
      groups: [],
      actions: [],
    })
    expect(exported.opers?.[0]).toMatchObject({
      disc_star_stones: ['', '天府', '天府'],
      attack: 1234,
    })
  })
  it('keeps old roster compatibility but never guesses compressed star slots', () => {
    const entry = read({
      discs: [[info.discs[0].ot_name]],
      main_stars: ['天府'],
    })
    expect(entry.loadouts[0].name).toBe('命盘 1')
    const result = yuanHubImportCandidate(entry, '0')
    expect(result.operator?.discStarStones).toEqual(['', '', ''])
    expect(result.warnings.join()).toContain('星石槽位不可用')
  })
  it('rejects foreign identity and malformed fields at the boundary', () => {
    expect(() =>
      normalizeYuanHubTraining(raw({}), { ...expected, accountId: 'other' }),
    ).toThrow()
    expect(() => read({ level: '100' })).toThrow()
    expect(() => read({ star_slots: { main1: '天府' } })).toThrow()
    expect(() =>
      read({
        disc_loadouts: [
          { id: 'x', name: '盘', discs: [] },
          { id: 'x', name: '盘', discs: [] },
        ],
      }),
    ).toThrow()
  })
  it('does not substitute unknown catalog entries or silently clamp training', () => {
    expect(
      yuanHubImportCandidate({ ...read({}), id: 'unknown' }).operator,
    ).toBeUndefined()
    const result = yuanHubImportCandidate(
      read({ level: 101, elite: 99, stars: 6, discs: [['不存在的词条']] }),
      '0',
    )
    expect(result.operator?.requirements?.level).toBeUndefined()
    expect(result.operator?.requirements?.elite).toBeUndefined()
    expect(result.operator?.starLevel).toBeUndefined()
    expect(result.warnings.join()).toContain('不存在的词条')
  })
  it('checks groups, duplicates and replacement without mutating the old lineup', () => {
    const operator = yuanHubImportCandidate(read({})).operator!
    const existing = [{ ...operator, name: '旧密探' }]
    expect(
      mergeImportedOperators(existing, [operator], 3, 'append'),
    ).toHaveLength(2)
    expect(() =>
      mergeImportedOperators(existing, [operator], 4, 'append'),
    ).toThrow()
    expect(() =>
      mergeImportedOperators([operator], [operator], 0, 'append'),
    ).toThrow()
    expect(mergeImportedOperators(existing, [operator], 4, 'replace')).toEqual([
      operator,
    ])
    expect(existing[0].name).toBe('旧密探')
    expect(() => mergeImportedOperators(existing, [], 0, 'replace')).toThrow()
  })
})

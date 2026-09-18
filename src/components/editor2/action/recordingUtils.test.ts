import { describe, expect, it } from 'vitest'

import {
  appendRecorderToken,
  clearRecorderRound,
  describeRecorderToken,
  ensureRecorderRound,
  formatRecorderRoundItem,
  getNextRecorderRound,
  getRecorderRoundNumbers,
  groupRecorderRoundActions,
  removeRecorderToken,
} from './recordingUtils'
import { roundActionsToEditorActions } from './roundMapping'

describe('recordingUtils', () => {
  it('records tokens in click order and keeps the source immutable', () => {
    const source = {}
    const first = appendRecorderToken(source, 1, '1大')
    const second = appendRecorderToken(first, 1, '3普')

    expect(source).toEqual({})
    expect(first).toEqual({ '1': [['1大']] })
    expect(second).toEqual({ '1': [['1大'], ['3普']] })
  })

  it('supports removing and clearing recorded rounds', () => {
    const source = {
      '1': [['1普'], ['2下']],
      '2': [['5sp']],
    }

    expect(removeRecorderToken(source, 1, 0)).toEqual({
      '1': [['2下']],
      '2': [['5sp']],
    })
    expect(clearRecorderRound(source, 2)).toEqual({
      '1': [['1普'], ['2下']],
      '2': [],
    })
  })

  it('finds the next round from the current recording', () => {
    const source = {
      '1': [['1普']],
      '3': [['5大']],
    }

    expect(getRecorderRoundNumbers(source)).toEqual([1, 3])
    expect(getNextRecorderRound(source)).toBe(4)
  })

  it('creates a new round without mutating the current draft', () => {
    const source = {
      '1': [['1普']],
    }

    expect(ensureRecorderRound(source, 2)).toEqual({
      '1': [['1普']],
      '2': [],
    })
    expect(source).toEqual({
      '1': [['1普']],
    })
  })

  it('maps recorded tokens to existing editor actions', () => {
    const actions = roundActionsToEditorActions(
      {
        '1': [['1大'], ['3sp'], ['额外:左侧目标']],
      },
      {
        slotAssignments: {
          1: { name: '孙尚香' },
          3: { name: '史子眇' },
        },
      },
    )

    expect(actions).toHaveLength(3)
    expect(actions[0]).toMatchObject({
      name: '孙尚香',
      doc: expect.stringContaining('[1大]'),
    })
    expect(actions[1].doc).toContain('[3sp]')
    expect(actions[2].doc).toContain('[额外:左侧目标]')
  })

  it('describes table cells for slots and extra actions', () => {
    expect(describeRecorderToken('2大')).toEqual({
      area: 'slot',
      slot: 2,
      label: '↑',
    })
    expect(describeRecorderToken('额外:右侧目标')).toEqual({
      area: 'extra',
      label: '右侧目标',
    })
  })

  it('groups actions into fixed slots and keeps their round order', () => {
    const groups = groupRecorderRoundActions(
      {
        '1': [['2普'], ['额外:右侧目标'], ['1下'], ['2sp']],
      },
      1,
    )

    expect(groups.slots[1]).toMatchObject([
      {
        index: 2,
        order: 3,
        display: { area: 'slot', slot: 1, label: '↓' },
      },
    ])
    expect(groups.slots[2]).toMatchObject([
      { index: 0, order: 1, display: { label: 'A' } },
      { index: 3, order: 4, display: { label: '圈' } },
    ])
    expect(groups.extras).toMatchObject([
      {
        index: 1,
        order: 2,
        display: { area: 'extra', label: '右侧目标' },
      },
    ])

    const slotItem = groups.slots[2][1]
    const extraItem = groups.extras[0]
    expect(formatRecorderRoundItem(slotItem)).toBe('4圈')
    expect(formatRecorderRoundItem(extraItem)).toBe('2右侧目标')
  })
})

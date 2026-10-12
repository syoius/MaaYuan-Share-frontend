import { describe, expect, it } from 'vitest'

import {
  getRecorderMetaTargetIndex,
  hydrateRoundActionsWithRecorderMeta,
  parseRecorderMeta,
  syncRecorderMetaFromRoundActions,
} from './recorderMeta'
import {
  getRecorderDeadTargetFallbacks,
  getRecorderDeadTargetIndices,
  parseRecorderTargetMetadata,
} from './recordingUtils'

describe('recorderMeta', () => {
  it('restores recorded targets and enemy events from persisted metadata', () => {
    const meta = {
      version: 2,
      initial_enemies: [1, 2, 3, 4, 5],
      initial_main: 1,
      changes: {
        '1': {
          '1': { target: 2, left: 0, right: 1 },
          '2': { target: 2, left: 0, right: 0 },
          '3': { target: 1, left: 1, right: 0 },
          '4': { target: 1, left: 0, right: 0 },
          '5': { target: 1, left: 0, right: 0 },
          '6': { target: 1, left: 0, right: 0 },
          '7': { target: 1, left: 0, right: 0 },
        },
        '2': {
          '1': {
            target: 2,
            left: 0,
            right: 1,
            dead: [2],
            fallback: { 2: 1 },
          },
          '2': { target: 1, left: 0, right: 0 },
          '3': { target: 1, left: 0, right: 0 },
          '4': { target: 1, left: 0, right: 0 },
          '5': { target: 1, left: 0, right: 0 },
          '6': { target: 1, left: 0, right: 0 },
        },
      },
    }
    const input = {
      '1': [
        ['额外:右侧目标'],
        ['2普'],
        ['2普'],
        ['额外:左侧目标'],
        ['1普'],
        ['2普'],
        ['3普'],
        ['4普'],
        ['5普'],
      ],
      '2': [
        ['额外:右侧目标'],
        ['2普'],
        ['2普'],
        ['1下'],
        ['3下'],
        ['4下'],
        ['5下'],
      ],
    }

    const hydrated = hydrateRoundActionsWithRecorderMeta(input, meta)
    const firstAttackMetadata = hydrated['2'][1].slice(1)

    expect(
      firstAttackMetadata
        .map((value) => parseRecorderTargetMetadata(value))
        .find((value) => value !== undefined),
    ).toBe(2)
    expect(getRecorderDeadTargetIndices(firstAttackMetadata)).toEqual([2])
    expect(getRecorderDeadTargetFallbacks(firstAttackMetadata).get(2)).toBe(1)
    expect(hydrated['2'][0]).toEqual(['额外:右侧目标'])

    const synced = syncRecorderMetaFromRoundActions(
      parseRecorderMeta(meta),
      hydrated,
    )
    expect(synced.changes['2']['1']).toMatchObject({
      target: 2,
      right: 1,
      dead: [2],
      fallback: { 2: 1 },
    })
    expect(synced.changes['2']['2']).toMatchObject({
      target: 1,
      left: 0,
      right: 0,
    })
  })

  it('derives a target after its own switches and before deaths or later actions', () => {
    const meta = {
      initialEnemies: [1, 2, 3],
      initialMain: 1,
      changes: {
        '1': {
          '1': { right: 1, dead: [2], fallback: { 2: 1 } },
          '2': { right: 1 },
          '3': { left: 1 },
        },
      },
    }
    expect(getRecorderMetaTargetIndex(meta, 1, 1)).toBe(2)
    expect(getRecorderMetaTargetIndex(meta, 1, 2)).toBe(3)
    expect(getRecorderMetaTargetIndex(meta, 1, 3)).toBe(1)
  })

  it('reduces large external switch counts to a bounded circular rotation', () => {
    expect(
      getRecorderMetaTargetIndex(
        {
          initialEnemies: [1, 2, 3],
          initialMain: 1,
          changes: { '1': { '1': { right: 1_000_000_000 } } },
        },
        1,
        1,
      ),
    ).toBe(2)
  })
})

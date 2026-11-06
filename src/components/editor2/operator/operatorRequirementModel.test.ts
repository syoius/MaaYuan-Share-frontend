import { describe, expect, it } from 'vitest'

import type { EditorOperator } from '../types'
import {
  OPERATOR_LEVEL_MAX,
  OPERATOR_LEVEL_MIN,
  applyAnyDiscsAndStarStones,
  getMaxEliteForLevel,
} from './operatorRequirementModel'

describe('getMaxEliteForLevel', () => {
  it.each([
    [1, 1],
    [9, 1],
    [10, 2],
    [14, 2],
    [15, 3],
    [19, 3],
    [29, 3],
    [30, 4],
    [39, 4],
    [40, 5],
    [80, 13],
    [90, 15],
    [100, 17],
  ])('maps level %i to elite max %i', (level, expected) => {
    expect(getMaxEliteForLevel(level)).toBe(expected)
  })

  it('clamps out-of-range levels before calculating the cap', () => {
    expect(getMaxEliteForLevel(Number.NEGATIVE_INFINITY)).toBe(
      getMaxEliteForLevel(OPERATOR_LEVEL_MIN),
    )
    expect(getMaxEliteForLevel(Number.POSITIVE_INFINITY)).toBe(
      getMaxEliteForLevel(OPERATOR_LEVEL_MAX),
    )
  })
})

describe('applyAnyDiscsAndStarStones', () => {
  it.each([false, true])(
    'preserves training and stats (imported: %s)',
    (importedTraining) => {
      const operator: EditorOperator = {
        id: 'operator-1',
        name: '测试密探',
        unrestricted: true,
        extensions: {
          version: 1,
          importedTraining,
          stats: { starLevel: 5, attack: 100, hp: 200 },
        },
        starLevel: 5,
        attack: 100,
        hp: 200,
        requirements: { level: 60, elite: 2 },
        discsSelected: [1, 2, 3],
        discStarStones: ['天府', '天相', '巨门'],
        discAssistStars: ['红鸾', '阴煞', '天魁'],
      }

      const result = applyAnyDiscsAndStarStones(operator)

      expect(result.unrestricted).toBe(false)
      expect(result.starLevel).toEqual(operator.starLevel)
      expect(result.attack).toEqual(operator.attack)
      expect(result.hp).toEqual(operator.hp)
      expect(result.requirements).toEqual(operator.requirements)
      expect(result.extensions?.stats).toEqual(operator.extensions?.stats)
      expect(result.extensions?.importedTraining).toBe(importedTraining)
      expect(operator.discsSelected).toEqual([1, 2, 3])
      expect(result.discsSelected).toEqual([0, 0, 0])
      expect(result.discStarStones).toEqual(['任意', '任意', '任意'])
      expect(result.discAssistStars).toEqual(['任意', '任意', '任意'])
      expect(result.extensions?.discs?.slots).toEqual([
        {
          index: 0,
          disc: 0,
          discConfirmed: true,
          starStone: '任意',
          assistStar: '任意',
        },
        {
          index: 1,
          disc: 0,
          discConfirmed: true,
          starStone: '任意',
          assistStar: '任意',
        },
        {
          index: 2,
          disc: 0,
          discConfirmed: true,
          starStone: '任意',
          assistStar: '任意',
        },
      ])
      expect(result.id).toBe('operator-1')
      expect(result.name).toBe('测试密探')
    },
  )
})

import { describe, expect, it } from 'vitest'

import type { EditorOperator } from '../types'
import {
  applyAssistStarPreset,
  applyDiscPreset,
  applyMainStarPreset,
  getDiscSlots,
  setDiscSlot,
} from './operatorDiscModel'

const createOperator = (): EditorOperator => ({
  id: 'operator-1',
  name: '测试密探',
  discsSelected: [1, 2, 3],
  discStarStones: ['天府', '天相', '巨门'],
  discAssistStars: ['红鸾', '阴煞', '天魁'],
  extensions: {
    version: 1,
    stats: { starLevel: 5, attack: 100, hp: 200 },
  },
})

describe('operatorDiscModel', () => {
  it('applies a main-star preset without changing discs or assist stars', () => {
    const operator = applyMainStarPreset(createOperator(), [
      '太阳',
      '廉贞',
      '太阴',
    ])

    expect(operator.discsSelected).toEqual([1, 2, 3])
    expect(operator.discStarStones).toEqual(['太阳', '廉贞', '太阴'])
    expect(operator.discAssistStars).toEqual(['红鸾', '阴煞', '天魁'])
    expect(operator.extensions?.stats).toEqual({
      starLevel: 5,
      attack: 100,
      hp: 200,
    })
  })

  it('applies an assist-star preset without changing discs or main stars', () => {
    const operator = applyAssistStarPreset(createOperator(), ['文昌'])

    expect(operator.discsSelected).toEqual([1, 2, 3])
    expect(operator.discStarStones).toEqual(['天府', '天相', '巨门'])
    expect(operator.discAssistStars).toEqual(['文昌', '', ''])
  })

  it('applies a disc preset without changing main or assist stars', () => {
    const operator = applyDiscPreset(
      createOperator(),
      [4, 0, -2],
      [true, true, true],
    )

    expect(operator.discsSelected).toEqual([4, 0, -2])
    expect(operator.discStarStones).toEqual(['天府', '天相', '巨门'])
    expect(operator.discAssistStars).toEqual(['红鸾', '阴煞', '天魁'])
    expect(getDiscSlots(operator).map((slot) => slot.discConfirmed)).toEqual([
      true,
      true,
      true,
    ])
  })

  it('preserves repeated equipped stars in separate slots', () => {
    const operator = setDiscSlot(createOperator(), 2, {
      starStone: '天府',
      assistStar: '红鸾',
    })

    expect(operator.discStarStones).toEqual(['天府', '天相', '天府'])
    expect(operator.discAssistStars).toEqual(['红鸾', '阴煞', '红鸾'])
  })

  it('keeps existing slot behavior when changing a duplicate disc', () => {
    const operator = setDiscSlot(createOperator(), 1, { disc: 1 })

    expect(operator.discsSelected).toEqual([0, 1, 3])
    expect(operator.discStarStones).toEqual(['天府', '天相', '巨门'])
    expect(operator.discAssistStars).toEqual(['红鸾', '阴煞', '天魁'])
  })

  it('distinguishes an explicitly selected any disc from an empty slot', () => {
    const selectedAny = setDiscSlot(createOperator(), 0, {
      disc: 0,
      discConfirmed: true,
    })

    expect(getDiscSlots(selectedAny)[0]).toMatchObject({
      disc: 0,
      discConfirmed: true,
    })
    expect(selectedAny.discsSelected?.[0]).toBe(0)

    const cleared = setDiscSlot(selectedAny, 0, {
      disc: 0,
      discConfirmed: false,
    })
    expect(getDiscSlots(cleared)[0]).toMatchObject({
      disc: 0,
      discConfirmed: false,
    })
  })

  it('restores an exported any disc when the slot already has a star stone', () => {
    expect(
      getDiscSlots({
        id: 'operator-2',
        name: '测试密探',
        discsSelected: [0, 0, 0],
        discStarStones: ['任意', '', ''],
      })[0],
    ).toMatchObject({
      disc: 0,
      discConfirmed: true,
    })
  })

  it('treats a positive parallel-array disc as confirmed', () => {
    expect(
      getDiscSlots({
        id: 'operator-3',
        name: '测试密探',
        discsSelected: [2, 0, 0],
      })[0],
    ).toMatchObject({ disc: 2, discConfirmed: true })
  })

  it('falls back to extension slots when parallel arrays are absent', () => {
    const slots = getDiscSlots({
      id: 'operator-2',
      name: '测试密探',
      extensions: {
        version: 1,
        discs: {
          slots: [{ index: 0, disc: 2, starStone: '天机', assistStar: '文曲' }],
        },
      },
    })

    expect(slots).toEqual([
      {
        index: 0,
        disc: 2,
        discConfirmed: true,
        starStone: '天机',
        assistStar: '文曲',
      },
      {
        index: 1,
        disc: 0,
        discConfirmed: false,
        starStone: '',
        assistStar: '',
      },
      {
        index: 2,
        disc: 0,
        discConfirmed: false,
        starStone: '',
        assistStar: '',
      },
    ])
  })
})

import { describe, expect, it } from 'vitest'

import { applyAnyDiscsAndStarStones } from '../operator/operatorRequirementModel'
import type { EditorMetadata, EditorOperation, EditorOperator } from '../types'
import { validateOriginalOperatorRequirements } from './editorSourceValidation'

const metadata = (
  sourceType: EditorMetadata['sourceType'],
): EditorMetadata => ({
  visibility: 'public',
  sourceType,
  tags: ['如鸢'],
})

const operator = (overrides: Partial<EditorOperator> = {}): EditorOperator => ({
  id: 'operator-1',
  name: '测试密探',
  ...overrides,
})

const operation = (
  opers: EditorOperator[],
  groupedOpers: EditorOperator[] = [],
): Pick<EditorOperation, 'opers' | 'groups'> => ({
  opers,
  groups: groupedOpers.length
    ? [{ id: 'group-1', name: '测试编组', opers: groupedOpers }]
    : [],
})

describe('editor source validation', () => {
  it('requires star level, disc and main star stone for every original operator', () => {
    expect(
      validateOriginalOperatorRequirements(
        metadata('original'),
        operation([operator()]),
      ),
    ).toEqual([
      {
        operatorId: 'operator-1',
        operatorName: '测试密探',
        fields: ['starLevel', 'disc', 'starStone'],
      },
    ])
  })

  it('still requires star level after setting any discs and star stones', () => {
    const result = applyAnyDiscsAndStarStones(operator({ unrestricted: true }))
    expect(
      validateOriginalOperatorRequirements(
        metadata('original'),
        operation([result]),
      ),
    ).toEqual([
      {
        operatorId: result.id,
        operatorName: result.name,
        fields: ['starLevel'],
      },
    ])
    expect(
      validateOriginalOperatorRequirements(
        metadata('original'),
        operation([{ ...result, starLevel: 5 }]),
      ),
    ).toEqual([])
  })

  it('accepts completed original requirements from extension-backed values', () => {
    expect(
      validateOriginalOperatorRequirements(
        metadata('original'),
        operation([
          operator({
            extensions: {
              version: 1,
              stats: { starLevel: 3 },
              discs: {
                slots: [
                  { index: 0, disc: 1, starStone: '天府' },
                  { index: 1, disc: -2, starStone: '任意' },
                  { index: 2, disc: 3, starStone: '巨门' },
                ],
              },
            },
          }),
        ]),
      ),
    ).toEqual([])
  })

  it('validates operators inside groups and rejects empty slots', () => {
    expect(
      validateOriginalOperatorRequirements(
        metadata('original'),
        operation(
          [],
          [
            operator({
              starLevel: 2,
              discsSelected: [-1, 2, 0],
              discStarStones: ['任意', '天相', ''],
            }),
          ],
        ),
      ),
    ).toEqual([
      {
        operatorId: 'operator-1',
        operatorName: '测试密探',
        fields: ['disc', 'starStone'],
      },
    ])
  })

  it('does not require original operator fields for reposts', () => {
    expect(
      validateOriginalOperatorRequirements(
        metadata('repost'),
        operation([operator()]),
      ),
    ).toEqual([])
  })

  it('accepts explicitly selected any discs in all slots', () => {
    expect(
      validateOriginalOperatorRequirements(
        metadata('original'),
        operation([
          operator({
            starLevel: 2,
            discsSelected: [0, 0, 0],
            discStarStones: ['任意', '任意', '任意'],
            extensions: {
              version: 1,
              discs: {
                slots: [0, 1, 2].map((index) => ({
                  index,
                  disc: 0,
                  discConfirmed: true,
                  starStone: '任意',
                })),
              },
            },
          }),
        ]),
      ),
    ).toEqual([])
  })

  it('accepts original operators marked as unrestricted without requirement fields', () => {
    expect(
      validateOriginalOperatorRequirements(
        metadata('original'),
        operation([operator({ unrestricted: true })]),
      ),
    ).toEqual([])
  })

  it('accepts unrestricted operators inside groups', () => {
    expect(
      validateOriginalOperatorRequirements(
        metadata('original'),
        operation([], [operator({ unrestricted: true })]),
      ),
    ).toEqual([])
  })
})

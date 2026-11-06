import type { StarPresetValues } from '../../../data/operator-star-stone-presets'
import type { AssistStarName, MainStarName } from '../../../data/star-stones'
import type { EditorOperator } from '../types'
import type {
  DiscPresetConfirmed,
  DiscPresetSelected,
} from './operatorDiscPresetModel'

export interface DiscSlot {
  index: number
  disc: number
  discConfirmed?: boolean
  starStone?: string
  assistStar?: string
}

const DISC_SLOT_COUNT = 3

export function getDiscSlots(operator: EditorOperator): DiscSlot[] {
  const discsSelected = operator.discsSelected ?? []
  const starStones = operator.discStarStones ?? []
  const assistStars = operator.discAssistStars ?? []
  const hasParallelArrays =
    discsSelected.length > 0 || starStones.length > 0 || assistStars.length > 0
  const extensionSlots = operator.extensions?.discs?.slots

  if (hasParallelArrays) {
    return Array.from({ length: DISC_SLOT_COUNT }, (_, index) => {
      const disc = discsSelected[index] ?? 0
      const starStone = starStones[index] ?? ''
      const extensionSlot = extensionSlots?.find((slot) => slot.index === index)
      return {
        index,
        disc,
        discConfirmed:
          extensionSlot?.discConfirmed ??
          (disc !== 0 || Boolean(starStone.trim())),
        starStone,
        assistStar: assistStars[index] ?? '',
      }
    })
  }

  if (extensionSlots?.length) {
    const normalized = extensionSlots
      .filter((slot) => slot && typeof slot.index === 'number')
      .map((slot, index) => ({
        index: slot.index ?? index,
        disc: slot.disc ?? 0,
        discConfirmed: slot.discConfirmed ?? (slot.disc ?? 0) !== 0,
        starStone: slot.starStone ?? '',
        assistStar: slot.assistStar ?? '',
      }))
      .sort((a, b) => a.index - b.index)
      .slice(0, DISC_SLOT_COUNT)

    while (normalized.length < DISC_SLOT_COUNT) {
      normalized.push({
        index: normalized.length,
        disc: 0,
        discConfirmed: false,
        starStone: '',
        assistStar: '',
      })
    }
    return normalized
  }

  return Array.from({ length: DISC_SLOT_COUNT }, (_, index) => ({
    index,
    disc: 0,
    discConfirmed: false,
    starStone: '',
    assistStar: '',
  }))
}

function withDiscSlots(
  operator: EditorOperator,
  slots: DiscSlot[],
): EditorOperator {
  const discsSelected = [0, 0, 0]
  const discStarStones = ['', '', '']
  const discAssistStars = ['', '', '']

  for (const slot of slots) {
    if (slot.index >= 0 && slot.index < DISC_SLOT_COUNT) {
      discsSelected[slot.index] = slot.disc ?? 0
      discStarStones[slot.index] = slot.starStone ?? ''
      discAssistStars[slot.index] = slot.assistStar ?? ''
    }
  }

  return {
    ...operator,
    unrestricted: false,
    discsSelected,
    discStarStones,
    discAssistStars,
    extensions: {
      version: 1,
      ...(operator.extensions ?? {}),
      discs: {
        slots: slots.map((slot) => ({
          index: slot.index,
          disc: slot.disc,
          discConfirmed: slot.discConfirmed ?? false,
          starStone: slot.starStone,
          assistStar: slot.assistStar,
        })),
      },
    },
  }
}

export function setDiscSlot(
  operator: EditorOperator,
  slotIndex: number,
  updates: Partial<
    Pick<DiscSlot, 'disc' | 'discConfirmed' | 'starStone' | 'assistStar'>
  >,
): EditorOperator {
  const nextSlots = getDiscSlots(operator).map((slot) => {
    if (slot.index !== slotIndex) {
      return { ...slot }
    }
    return {
      ...slot,
      ...updates,
      ...(updates.disc !== undefined
        ? {
            discConfirmed:
              updates.disc === 0 ? (updates.discConfirmed ?? false) : true,
          }
        : {}),
    }
  })

  const chosen = nextSlots.find((slot) => slot.index === slotIndex)?.disc
  if (typeof chosen === 'number' && chosen > 0) {
    for (let index = 0; index < nextSlots.length; index++) {
      if (
        nextSlots[index].index !== slotIndex &&
        nextSlots[index].disc === chosen
      ) {
        nextSlots[index] = {
          ...nextSlots[index],
          disc: 0,
          discConfirmed: false,
        }
      }
    }
  }

  return withDiscSlots(operator, nextSlots)
}

export function applyMainStarPreset(
  operator: EditorOperator,
  values: StarPresetValues<MainStarName>,
): EditorOperator {
  const nextSlots = getDiscSlots(operator).map((slot) => ({
    ...slot,
    starStone: values[slot.index] ?? '',
  }))
  return withDiscSlots(operator, nextSlots)
}

export function applyAssistStarPreset(
  operator: EditorOperator,
  values: StarPresetValues<AssistStarName>,
): EditorOperator {
  const nextSlots = getDiscSlots(operator).map((slot) => ({
    ...slot,
    assistStar: values[slot.index] ?? '',
  }))
  return withDiscSlots(operator, nextSlots)
}

export function applyDiscPreset(
  operator: EditorOperator,
  selected: DiscPresetSelected,
  confirmed: DiscPresetConfirmed,
): EditorOperator {
  const nextSlots = getDiscSlots(operator).map((slot) => ({
    ...slot,
    disc: selected[slot.index] ?? 0,
    discConfirmed: confirmed[slot.index] ?? false,
  }))
  return withDiscSlots(operator, nextSlots)
}

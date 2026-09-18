import type { RoundActionsInput } from './roundMapping'

export const RECORDER_SLOT_KEYS = ['1', '2', '3', '4', '5'] as const

export type RecorderTokenDisplay =
  | {
      area: 'slot'
      slot: number
      label: string
    }
  | {
      area: 'extra'
      label: string
    }

export interface RecorderRoundItem {
  index: number
  order: number
  token: string
  display: RecorderTokenDisplay
}

export interface RecorderRoundGroups {
  slots: Record<number, RecorderRoundItem[]>
  extras: RecorderRoundItem[]
}

const BASE_ACTION_LABELS: Record<string, string> = {
  普: 'A',
  大: '↑',
  下: '↓',
  sp: '圈',
}

export function cloneRoundActions(
  source: RoundActionsInput,
): RoundActionsInput {
  const result: RoundActionsInput = {}
  for (const [round, actions] of Object.entries(source)) {
    result[round] = actions.map((entry) => [...entry])
  }
  return result
}

export function getRecorderRoundNumbers(input: RoundActionsInput): number[] {
  return Object.keys(input)
    .map((round) => Number(round))
    .filter((round) => Number.isFinite(round) && round > 0)
    .sort((a, b) => a - b)
}

export function getNextRecorderRound(input: RoundActionsInput): number {
  const numbers = getRecorderRoundNumbers(input)
  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1
}

export function ensureRecorderRound(
  input: RoundActionsInput,
  round: number,
): RoundActionsInput {
  const key = String(round)
  if (input[key]) {
    return input
  }
  const result = cloneRoundActions(input)
  result[key] = []
  return result
}

export function appendRecorderToken(
  input: RoundActionsInput,
  round: number,
  token: string,
): RoundActionsInput {
  const key = String(round)
  const result = ensureRecorderRound(cloneRoundActions(input), round)
  result[key].push([token])
  return result
}

export function removeRecorderToken(
  input: RoundActionsInput,
  round: number,
  index: number,
): RoundActionsInput {
  const result = cloneRoundActions(input)
  const key = String(round)
  const actions = result[key] ?? []
  result[key] = actions.filter((_, actionIndex) => actionIndex !== index)
  return result
}

export function groupRecorderRoundActions(
  input: RoundActionsInput,
  round: number,
): RecorderRoundGroups {
  const slots: Record<number, RecorderRoundItem[]> = {}
  const extras: RecorderRoundItem[] = []

  ;(input[String(round)] ?? []).forEach((entry, index) => {
    const token = entry[0] ?? ''
    const display = describeRecorderToken(token)
    const item: RecorderRoundItem = {
      index,
      order: index + 1,
      token,
      display,
    }

    if (display.area === 'slot') {
      ;(slots[display.slot] ??= []).push(item)
    } else {
      extras.push(item)
    }
  })

  return { slots, extras }
}

export function clearRecorderRound(
  input: RoundActionsInput,
  round: number,
): RoundActionsInput {
  const result = cloneRoundActions(input)
  result[String(round)] = []
  return result
}

export function describeRecorderToken(rawToken: string): RecorderTokenDisplay {
  const token = rawToken.trim()
  const baseMatch = token.match(/^([1-5])([普大下]|sp)$/)
  if (baseMatch) {
    return {
      area: 'slot',
      slot: Number(baseMatch[1]),
      label: BASE_ACTION_LABELS[baseMatch[2]] ?? baseMatch[2],
    }
  }

  if (token === '额外:左侧目标') {
    return { area: 'extra', label: '左侧目标' }
  }
  if (token === '额外:右侧目标') {
    return { area: 'extra', label: '右侧目标' }
  }
  if (token.startsWith('额外:')) {
    return { area: 'extra', label: token.slice('额外:'.length) || '额外' }
  }

  return { area: 'extra', label: token || '未知' }
}

export function formatRecorderRoundItem(item: RecorderRoundItem): string {
  return `${item.order}${item.display.label}`
}

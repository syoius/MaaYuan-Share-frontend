import { asRecord, normalizeYuanHubSnapshot } from './operatorMatcher'

export interface YuanHubTrainingEntry {
  id: string
  owned?: boolean
  level?: number
  elite?: number
  stars?: number
  attack?: number
  hp?: number
  loadouts: { id: string; name: string; discs: string[] }[]
  starSlots?: Record<string, string | null>
}

export function normalizeYuanHubTraining(
  value: unknown,
  expected: { connectionId: string; accountId: string; game: string },
) {
  const snapshot = normalizeYuanHubSnapshot(value, expected)
  const entries = asRecord(asRecord(value)?.operators)!
  const number = (value: unknown): number | undefined => {
    if (value === null || value === undefined) return undefined
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
      throw new Error('YuanHub 养成数值格式不正确')
    return value
  }
  const strings = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
      throw new Error('YuanHub 命盘格式不正确')
    return value
  }
  const operators = Object.values(snapshot.operators).map(
    (owned): YuanHubTrainingEntry => {
      const entry = asRecord(entries[owned.id])!
      const panel = asRecord(entry.panel)
      const rawLoadouts = entry.disc_loadouts
      let loadouts: YuanHubTrainingEntry['loadouts']
      if (rawLoadouts !== null && rawLoadouts !== undefined) {
        if (!Array.isArray(rawLoadouts))
          throw new Error('YuanHub 命盘方案格式不正确')
        loadouts = rawLoadouts.map((value) => {
          const item = asRecord(value)
          if (
            !item ||
            typeof item.id !== 'string' ||
            !item.id ||
            typeof item.name !== 'string'
          )
            throw new Error('YuanHub 命盘方案格式不正确')
          return { id: item.id, name: item.name, discs: strings(item.discs) }
        })
      } else {
        if (
          entry.discs !== null &&
          entry.discs !== undefined &&
          !Array.isArray(entry.discs)
        )
          throw new Error('YuanHub 命盘格式不正确')
        loadouts = ((entry.discs as unknown[] | undefined) ?? []).map(
          (discs, index) => ({
            id: String(index),
            name: `命盘 ${index + 1}`,
            discs: strings(discs),
          }),
        )
      }
      if (new Set(loadouts.map((l) => l.id)).size !== loadouts.length)
        throw new Error('YuanHub 命盘方案标识重复')
      let starSlots: YuanHubTrainingEntry['starSlots']
      if (entry.star_slots !== null && entry.star_slots !== undefined) {
        const slots = asRecord(entry.star_slots)
        const keys = [
          'main1',
          'main2',
          'main3',
          'support1',
          'support2',
          'support3',
        ]
        if (
          !slots ||
          keys.some(
            (key) => slots[key] !== null && typeof slots[key] !== 'string',
          )
        )
          throw new Error('YuanHub 星石槽位格式不正确')
        starSlots = Object.fromEntries(
          keys.map((key) => [key, slots[key] as string | null]),
        )
      }
      return {
        ...owned,
        level: number(entry.level),
        elite: number(entry.elite),
        stars: number(entry.stars),
        attack:
          panel?.status === 'calculated' ? number(panel.attack) : undefined,
        hp: panel?.status === 'calculated' ? number(panel.hp) : undefined,
        loadouts,
        starSlots,
      }
    },
  )
  return { ...snapshot, operators }
}

export type YuanHubTrainingSnapshot = ReturnType<
  typeof normalizeYuanHubTraining
>

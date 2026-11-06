import {
  ASSIST_STAR_OPTIONS,
  MAIN_STAR_OPTIONS,
} from '../../../data/star-stones'
import { findOperatorById } from '../../../models/operator'
import type { YuanHubTrainingEntry } from '../../../models/yuanhubTraining'
import { createOperator } from '../reconciliation'
import type { EditorOperator } from '../types'
import { setDiscSlot } from './operatorDiscModel'
import { getMaxEliteForLevel } from './operatorRequirementModel'

export type OperatorImportMode = 'append' | 'replace'
export interface OperatorImportCandidate {
  key: string
  label: string
  operator?: EditorOperator
  warnings: string[]
}

export function yuanHubImportCandidate(
  entry: YuanHubTrainingEntry,
  loadoutId?: string,
): OperatorImportCandidate {
  const info = findOperatorById(entry.id)
  const warnings: string[] = []
  if (!info || entry.owned === false)
    return {
      key: entry.id,
      label: info?.name ?? entry.id,
      warnings: [info ? '未拥有' : '本站目录无法识别，不能导入'],
    }
  const bounded = (
    value: number | undefined,
    max: number,
    min: number,
    label: string,
  ) => {
    if (value === undefined || value < min || value > max) {
      warnings.push(`${label}未知或超出支持范围，请手动填写`)
      return undefined
    }
    return value
  }
  const level = bounded(entry.level, 100, 1, '等级')
  const elite = bounded(
    entry.elite,
    level === undefined ? 17 : getMaxEliteForLevel(level),
    0,
    '修为',
  )
  const starLevel = bounded(entry.stars, 5, 1, '星级')
  if (entry.attack === undefined || entry.hp === undefined)
    warnings.push('面板不可用，攻击/生命请手动填写')
  let operator: EditorOperator = {
    ...createOperator({ name: info.name }),
    requirements: { level, elite },
    starLevel,
    attack: entry.attack,
    hp: entry.hp,
    extensions: { version: 1, importedTraining: true },
  }
  const loadout = entry.loadouts.find((l) => l.id === loadoutId)
  if (!loadout || !loadout.discs.length)
    warnings.push('未选择实际命盘，请手动填写')
  if (loadout && loadout.discs.length > 3) {
    warnings.push('命盘超过三个词条，本次不导入命盘')
  } else {
    loadout?.discs.forEach((name, index) => {
      const discIndex = info.discs.findIndex((disc) => disc.ot_name === name)
      if (discIndex < 0 || loadout.discs.indexOf(name) !== index)
        warnings.push(`无法导入命盘词条：${name}`)
      else operator = setDiscSlot(operator, index, { disc: discIndex + 1 })
    })
  }
  if (!entry.starSlots)
    warnings.push('星石槽位不可用，请手动填写；旧接口名称列表不用于猜测槽位')
  else {
    for (let index = 0; index < 3; index++) {
      const main = entry.starSlots[`main${index + 1}`]
      const assist = entry.starSlots[`support${index + 1}`]
      const star = (name: string | null, options: readonly string[]) => {
        if (name === null) return ''
        if (!options.includes(name) || name === '任意') {
          warnings.push(`无法导入星石：${name}`)
          return ''
        }
        return name
      }
      operator = setDiscSlot(operator, index, {
        starStone: star(main, MAIN_STAR_OPTIONS),
        assistStar: star(assist, ASSIST_STAR_OPTIONS),
      })
    }
  }
  return { key: entry.id, label: info.name, operator, warnings }
}

export function mergeImportedOperators(
  current: EditorOperator[],
  incoming: EditorOperator[],
  groupCount: number,
  mode: OperatorImportMode,
) {
  const next = mode === 'append' ? [...current, ...incoming] : incoming
  if (!incoming.length) throw new Error('请至少选择一位密探')
  if (next.length + groupCount > 5)
    throw new Error('固定密探与候选分组合计不能超过 5 个位置')
  if (new Set(next.map((op) => op.name)).size !== next.length)
    throw new Error('阵容中已有同名密探，请取消勾选或选择替换阵容')
  return next
}

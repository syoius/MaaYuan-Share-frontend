import { readOperatorStats } from '../utils/operatorStats'
import { CopilotDocV1 } from './copilot.schema'
import { OPERATORS } from './generated/operators.json'
import { Operation } from './operation'

export const MATCH_MODES = ['ready', 'train', 'blocked', 'unknown'] as const
export type MatchMode = (typeof MATCH_MODES)[number]
export interface OwnedOperator {
  id: string
  owned?: boolean
  level?: number
  elite?: number
  stars?: number
  attack?: number
  hp?: number
  discs: string[][]
  mainStars: string[]
  assistStars: string[]
}
export interface MatcherSnapshot {
  connectionId: string
  accountId: string
  accountName: string
  game: string
  syncedAt: string
  updatedAt?: string
  operators: Record<string, OwnedOperator>
}
export interface OperatorMatcherFilter {
  snapshot: MatcherSnapshot
  modes: MatchMode[]
  excludedOperatorIds?: string[]
}
export interface OperationMatchResult {
  mode: MatchMode
  reasons: string[]
}

type RecordValue = Record<string, unknown>
export const asRecord = (value: unknown): RecordValue | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined
const integer = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined
const positive = (value: unknown) => {
  const number = integer(value)
  return number && number > 0 ? number : undefined
}
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export interface YuanHubAccount {
  id: string
  name: string
  game: string
}
export interface YuanHubAccounts {
  connectionId: string
  accounts: YuanHubAccount[]
}
function accountOf(value: unknown): YuanHubAccount {
  const account = asRecord(value)
  if (
    !account ||
    !text(account.id) ||
    !text(account.name) ||
    !['如鸢', '代号鸢'].includes(text(account.game))
  )
    throw new Error('YuanHub 游戏账号格式不正确')
  return {
    id: text(account.id),
    name: text(account.name),
    game: text(account.game),
  }
}
export function normalizeYuanHubAccounts(value: unknown): YuanHubAccounts {
  const data = asRecord(value)
  if (!text(data?.connection_id) || !Array.isArray(data?.accounts))
    throw new Error('YuanHub 账号列表格式不正确')
  const accounts = data.accounts.map(accountOf)
  if (new Set(accounts.map((a) => a.id)).size !== accounts.length)
    throw new Error('YuanHub 账号列表存在重复')
  return { connectionId: text(data.connection_id), accounts }
}
export function normalizeYuanHubSnapshot(
  value: unknown,
  expected: { connectionId: string; accountId: string; game: string },
): MatcherSnapshot {
  const data = asRecord(value)
  const account = accountOf(data?.account)
  const entries = asRecord(data?.operators)
  if (
    data?.version !== 1 ||
    !entries ||
    data.connection_id !== expected.connectionId ||
    account.id !== expected.accountId ||
    account.game !== expected.game
  )
    throw new Error('YuanHub 返回了不属于当前连接或游戏账号的档案，请重新连接')
  const strings = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
      throw new Error('YuanHub 档案格式不正确')
    return value.map((v) => v.trim()).filter(Boolean)
  }
  const operators: Record<string, OwnedOperator> = Object.fromEntries(
    Object.entries(entries).map(([id, value]) => {
      const entry = asRecord(value)
      if (!entry || !Array.isArray(entry.discs))
        throw new Error('YuanHub 密探格式不正确')
      const panel = asRecord(entry.panel)
      return [
        id,
        {
          id,
          owned: typeof entry.owned === 'boolean' ? entry.owned : undefined,
          level: positive(entry.level),
          elite: integer(entry.elite),
          stars: positive(entry.stars),
          attack:
            panel?.status === 'calculated' ? positive(panel.attack) : undefined,
          hp: panel?.status === 'calculated' ? positive(panel.hp) : undefined,
          discs: entry.discs.map(strings),
          mainStars: strings(entry.main_stars),
          assistStars: strings(entry.assist_stars),
        },
      ]
    }),
  )
  return {
    connectionId: expected.connectionId,
    accountId: account.id,
    accountName: account.name,
    game: account.game,
    syncedAt: new Date().toISOString(),
    updatedAt: text(data.updated_at) || undefined,
    operators,
  }
}

const localByName = new Map(OPERATORS.map((op) => [op.name, op]))

function evaluateOperator(
  requirement: CopilotDocV1.Operator,
  snapshot: MatcherSnapshot,
  excludedOperatorIds: readonly string[],
) {
  const local = localByName.get(requirement.name)
  const owned = local && snapshot.operators[local.id]
  const result = (mode: MatchMode, reasons: string[]) => ({
    id: local?.id ?? requirement.name,
    mode,
    reasons,
  })
  if (!local)
    return result('unknown', [`${requirement.name}：本站目录无法识别`])
  if (excludedOperatorIds.includes(local.id))
    return result('blocked', [`${requirement.name}：已设为不使用`])
  if (!owned || owned.owned === false)
    return result('blocked', [`${requirement.name}：档案未收录或标记未拥有`])
  const raw = requirement as CopilotDocV1.Operator & {
    unrestricted?: boolean
    discsSelected?: number[]
    discStarStones?: string[]
    discAssistStars?: string[]
    extensions?: {
      discs?: {
        slots?: { disc?: number; starStone?: string; assistStar?: string }[]
      }
    }
  }
  const unknown: string[] = owned.owned === undefined ? ['持有状态待确认'] : []
  const shortages: string[] = []
  if (!raw.unrestricted) {
    const compare = (
      label: string,
      expected: unknown,
      actual: number | undefined,
    ) => {
      if (expected === null || expected === undefined || expected === 0) return
      if (positive(expected) === undefined || actual === undefined)
        unknown.push(`${label}待确认`)
      else if (actual < (expected as number))
        shortages.push(`${label} ${actual} < ${expected}`)
    }
    compare('等级', requirement.requirements?.level, owned.level)
    compare('修为', requirement.requirements?.elite, owned.elite)
    const stats = readOperatorStats(requirement)
    if (stats.hasStar) compare('化极', stats.starLevel, owned.stars)
    if (stats.hasAttack) compare('攻击', stats.attack, owned.attack)
    if (stats.hasHp) compare('生命', stats.hp, owned.hp)

    const slots =
      raw.discsSelected?.length ||
      raw.discStarStones?.length ||
      raw.discAssistStars?.length
        ? [0, 1, 2].map((i) => ({
            disc: raw.discsSelected?.[i],
            starStone: raw.discStarStones?.[i],
            assistStar: raw.discAssistStars?.[i],
          }))
        : (raw.extensions?.discs?.slots ?? [])
    const required: string[] = []
    const forbidden: string[] = []
    for (const slot of slots) {
      if (!slot.disc) continue
      const disc = local.discs[Math.abs(slot.disc) - 1]
      if (!disc) unknown.push('命盘要求无法识别')
      else (slot.disc < 0 ? forbidden : required).push(disc.ot_name)
    }
    if (required.length || forbidden.length) {
      const meets = owned.discs.some(
        (discs) =>
          required.every((d) => discs.includes(d)) &&
          forbidden.every((d) => !discs.includes(d)) &&
          (!forbidden.length || discs.length === 3),
      )
      if (!meets) {
        if (!owned.discs.length || owned.discs.some((d) => d.length < 3))
          unknown.push('命盘记录不完整')
        else shortages.push('需调整命盘（不能拼接不同套命盘）')
      }
    }
    for (const [label, needed, actual] of [
      [
        '主星',
        slots.map((s) => text(s.starStone)).filter(Boolean),
        owned.mainStars,
      ],
      [
        '辅星',
        slots.map((s) => text(s.assistStar)).filter(Boolean),
        owned.assistStars,
      ],
    ] as const) {
      const remaining = [...actual]
      for (const name of needed) {
        const index = remaining.indexOf(name)
        if (index === -1) unknown.push(`${label}「${name}」配装待确认`)
        else remaining.splice(index, 1)
      }
    }
  }
  return result(
    unknown.length ? 'unknown' : shortages.length ? 'train' : 'ready',
    [...shortages, ...unknown].map(
      (reason) => `${requirement.name}：${reason}`,
    ),
  )
}

export function getOperationMatchResult(
  operation: Operation,
  snapshot: MatcherSnapshot,
  excludedOperatorIds: readonly string[] = [],
): OperationMatchResult {
  const tags = operation.metadata?.tags ?? []
  const games = tags.filter((t) => t === '如鸢' || t === '代号鸢')
  if (games.length && !games.some((game) => game === snapshot.game))
    return { mode: 'blocked', reasons: ['作业游戏版本与连接账号不同'] }
  const content = operation.parsedContent
  const slots = [
    ...(content.opers ?? []).map((op) => [op]),
    ...(content.groups ?? []).map((g) => g.opers ?? []),
  ]
  if (slots.length > 5)
    return {
      mode: 'blocked',
      reasons: [`作业需要 ${slots.length} 个位置，最多可上阵 5 人`],
    }
  if (!slots.length || slots.some((s) => !s.length))
    return { mode: 'unknown', reasons: ['作业未填写完整阵容'] }
  const candidates = slots.map((slot) =>
    slot.map((op) => evaluateOperator(op, snapshot, excludedOperatorIds)),
  )

  // 二分匹配：每个密探只占一个位置，允许组间回退重选，避免贪心误判。
  for (const allowed of [
    ['ready'],
    ['ready', 'train'],
    ['ready', 'train', 'unknown'],
  ] as MatchMode[][]) {
    const assigned = new Map<string, number>()
    const choices = new Map<number, ReturnType<typeof evaluateOperator>>()
    const assign = (slot: number, seen: Set<string>): boolean => {
      for (const candidate of candidates[slot]) {
        if (!allowed.includes(candidate.mode) || seen.has(candidate.id))
          continue
        seen.add(candidate.id)
        const previous = assigned.get(candidate.id)
        if (previous === undefined || assign(previous, seen)) {
          assigned.set(candidate.id, slot)
          choices.set(slot, candidate)
          return true
        }
      }
      return false
    }
    if (slots.every((_, index) => assign(index, new Set()))) {
      return {
        mode: allowed[allowed.length - 1],
        reasons: [...choices.values()].flatMap((c) => c.reasons),
      }
    }
  }
  return {
    mode: 'blocked',
    reasons: [
      '档案无法组成互不重复的阵容；本网站无助战',
      ...candidates
        .filter((c) => c.every((v) => v.mode === 'blocked'))
        .flatMap((c) => c.flatMap((v) => v.reasons)),
    ],
  }
}

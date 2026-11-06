import { CopilotDocV1 } from './copilot.schema'
import { OPERATORS } from './generated/operators.json'
import { Operation } from './operation'

export type MatchMode = 'ready' | 'blocked'
export interface OwnedOperator {
  id: string
  owned?: boolean
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
  const operators: Record<string, OwnedOperator> = Object.fromEntries(
    Object.entries(entries).map(([id, value]) => {
      const entry = asRecord(value)
      if (
        !entry ||
        (entry.owned !== undefined && typeof entry.owned !== 'boolean')
      )
        throw new Error('YuanHub 密探格式不正确')
      return [
        id,
        {
          id,
          owned: typeof entry.owned === 'boolean' ? entry.owned : undefined,
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
    return result('blocked', [`${requirement.name}：本站目录无法识别`])
  if (excludedOperatorIds.includes(local.id))
    return result('blocked', [`${requirement.name}：已设为不使用`])
  if (!owned || owned.owned === false)
    return result('blocked', [`${requirement.name}：档案未收录或标记未拥有`])
  return result('ready', [])
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
    return { mode: 'blocked', reasons: ['作业未填写完整阵容'] }
  const candidates = slots.map((slot) =>
    slot.map((op) => evaluateOperator(op, snapshot, excludedOperatorIds)),
  )

  // 二分匹配：每个密探只占一个位置，允许组间回退重选，避免贪心误判。
  const assigned = new Map<string, number>()
  const assign = (slot: number, seen: Set<string>): boolean => {
    for (const candidate of candidates[slot]) {
      if (candidate.mode !== 'ready' || seen.has(candidate.id)) continue
      seen.add(candidate.id)
      const previous = assigned.get(candidate.id)
      if (previous === undefined || assign(previous, seen)) {
        assigned.set(candidate.id, slot)
        return true
      }
    }
    return false
  }
  if (slots.every((_, index) => assign(index, new Set())))
    return { mode: 'ready', reasons: [] }
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

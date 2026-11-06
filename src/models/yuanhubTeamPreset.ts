import { asRecord } from './operatorMatcher'
import type { YuanHubTrainingSnapshot } from './yuanhubTraining'

export interface YuanHubTeamAccount {
  connectionId: string
  accountId: string
  game: string
}
export interface YuanHubTeamMember {
  operatorId: string
  loadoutId: string | null
}
export interface YuanHubTeamPreset extends YuanHubTeamAccount {
  id: string
  label: string
  members: YuanHubTeamMember[]
  version: number
}
export type YuanHubTeamPresetSave = Omit<YuanHubTeamPreset, 'id' | 'version'> &
  Partial<Pick<YuanHubTeamPreset, 'id' | 'version'>>

export function normalizeTeamPreset(
  value: unknown,
  account: YuanHubTeamAccount,
): YuanHubTeamPreset {
  const data = asRecord(value)
  const text = (v: unknown): v is string =>
    typeof v === 'string' && v.trim().length > 0
  if (
    !data ||
    !text(data.id) ||
    !text(data.label) ||
    data.connection_id !== account.connectionId ||
    data.account_id !== account.accountId ||
    data.game !== account.game ||
    !Number.isSafeInteger(data.version) ||
    (data.version as number) < 0 ||
    !Array.isArray(data.members) ||
    data.members.length !== 5
  ) {
    throw new Error('云端阵容预设格式或所属账号不正确')
  }
  const members = data.members.map((value): YuanHubTeamMember => {
    const member = asRecord(value)
    if (
      !member ||
      !text(member.operator_id) ||
      (member.loadout_id !== null &&
        member.loadout_id !== undefined &&
        !text(member.loadout_id))
    )
      throw new Error('云端阵容成员格式不正确')
    return {
      operatorId: member.operator_id,
      loadoutId: (member.loadout_id as string | null) ?? null,
    }
  })
  if (new Set(members.map((m) => m.operatorId)).size !== 5)
    throw new Error('云端阵容存在重复密探')
  return {
    ...account,
    id: data.id,
    label: data.label,
    version: data.version as number,
    members,
  }
}

export function teamMemberIssue(
  member: YuanHubTeamMember,
  snapshot: YuanHubTrainingSnapshot,
) {
  const entry = snapshot.operators.find(
    (op) => op.id === member.operatorId && op.owned !== false,
  )
  if (!entry) return '当前档案已无此密探，请重新选择'
  if (
    member.loadoutId !== null &&
    !entry.loadouts.some((l) => l.id === member.loadoutId)
  )
    return '原命盘方案已不存在，请重新选择'
  return undefined
}

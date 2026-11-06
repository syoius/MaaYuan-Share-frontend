import { getDefaultStore } from 'jotai'

import { asRecord } from '../models/operatorMatcher'
import {
  YuanHubTeamAccount,
  YuanHubTeamPresetSave,
  normalizeTeamPreset,
} from '../models/yuanhubTeamPreset'
import { authAtom } from '../store/auth'
import { TokenManager } from '../utils/token-manager'

async function request(
  ownerId: string,
  signal: AbortSignal,
  query: string,
  body?: YuanHubTeamPresetSave,
) {
  const token = await TokenManager.updateAndGetToken()
  const checkOwner = () => {
    if (signal.aborted || getDefaultStore().get(authAtom).userId !== ownerId)
      throw new Error('本站账号已切换或请求已取消')
  }
  checkOwner()
  const response = await fetch(
    `${import.meta.env.VITE_API}/yuanhub/team-presets${query}`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body
        ? JSON.stringify({
            id: body.id,
            version: body.version,
            connection_id: body.connectionId,
            account_id: body.accountId,
            game: body.game,
            label: body.label,
            members: body.members.map((m) => ({
              operator_id: m.operatorId,
              loadout_id: m.loadoutId,
            })),
          })
        : undefined,
      signal,
      cache: 'no-store',
      credentials: 'omit',
    },
  )
  checkOwner()
  if (response.status === 404)
    throw new Error('本站后端尚未部署云端阵容预设接口')
  if (response.status === 401) throw new Error('请重新登录本站后同步预设')
  const result = asRecord(await response.json())
  checkOwner()
  if (!response.ok || result?.status_code !== 200)
    throw new Error(
      typeof result?.message === 'string'
        ? result.message
        : '云端预设同步失败，请重试',
    )
  return result.data
}

export async function readYuanHubTeamPresets(
  ownerId: string,
  account: YuanHubTeamAccount,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({
    connectionId: account.connectionId,
    accountId: account.accountId,
    game: account.game,
  })
  const data = await request(ownerId, signal, `?${query}`)
  if (!Array.isArray(data)) throw new Error('云端阵容列表格式不正确')
  return data.map((value) => normalizeTeamPreset(value, account))
}

export async function saveYuanHubTeamPreset(
  ownerId: string,
  preset: YuanHubTeamPresetSave,
  signal: AbortSignal,
) {
  return normalizeTeamPreset(await request(ownerId, signal, '', preset), preset)
}

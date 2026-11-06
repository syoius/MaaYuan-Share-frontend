import { getDefaultStore } from 'jotai'

import {
  YuanHubAccount,
  normalizeYuanHubAccounts,
  normalizeYuanHubSnapshot,
} from '../models/operatorMatcher'
import { authAtom } from '../store/auth'
import { TokenManager } from '../utils/token-manager'

async function readYuanHub(
  path: string,
  token: string,
  ownerId: string,
  signal: AbortSignal,
) {
  const normalizedToken = token
    .trim()
    .replace(/^Bearer(?:\s+|$)/i, '')
    .trim()
  if (!/^ymatch_[a-f0-9]{32}$/.test(normalizedToken))
    throw new Error('请填写 YuanHub 作业匹配连接码（不是 MaaYuan 连接码）')
  const siteToken = await TokenManager.updateAndGetToken()
  if (getDefaultStore().get(authAtom).userId !== ownerId)
    throw new Error('本站账号已切换，请重新连接')
  const response = await fetch(
    `${import.meta.env.VITE_API}/yuanhub/matcher/${path}`,
    {
      headers: {
        Authorization: `Bearer ${siteToken}`,
        'X-YuanHub-Token': normalizedToken,
      },
      signal,
      cache: 'no-store',
      credentials: 'omit',
    },
  )
  if (response.status === 401) throw new Error('请重新登录本站后连接 YuanHub')
  if (response.status === 404)
    throw new Error('本站后端尚未部署 YuanHub 匹配接口')
  const body = await response.json().catch(() => {
    throw new Error('服务返回异常，请稍后重试')
  })
  if (!response.ok || body.status_code !== 200) {
    throw new Error(
      typeof body.message === 'string'
        ? body.message
        : '读取 YuanHub 失败，请检查作业匹配连接码',
    )
  }
  if (signal.aborted || getDefaultStore().get(authAtom).userId !== ownerId)
    throw new Error('连接已取消')
  return body.data
}

export async function readYuanHubAccounts(
  token: string,
  ownerId: string,
  signal: AbortSignal,
) {
  return normalizeYuanHubAccounts(
    await readYuanHub('accounts', token, ownerId, signal),
  )
}
export async function readYuanHubSnapshot(
  token: string,
  ownerId: string,
  signal: AbortSignal,
  connectionId: string,
  account: YuanHubAccount,
) {
  return normalizeYuanHubSnapshot(
    await readYuanHub(
      `accounts/${encodeURIComponent(account.id)}/roster`,
      token,
      ownerId,
      signal,
    ),
    { connectionId, accountId: account.id, game: account.game },
  )
}

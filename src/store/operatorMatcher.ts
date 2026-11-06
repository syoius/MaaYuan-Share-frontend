import { useAtom, useAtomValue } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { useMemo } from 'react'

import {
  MatcherSnapshot,
  OperatorMatcherFilter,
  asRecord,
} from '../models/operatorMatcher'
import { authAtom } from './auth'

export interface MatcherSettings {
  enabled: boolean
  token?: string
  snapshot?: MatcherSnapshot
  excludedByAccount?: Record<string, string[]>
}
export const emptyMatcherSettings = (): MatcherSettings => ({
  enabled: false,
  excludedByAccount: {},
})

export const getMatcherAccountKey = (snapshot: MatcherSnapshot) =>
  JSON.stringify([snapshot.connectionId, snapshot.accountId, snapshot.game])

export function parseMatcherSettings(value: unknown): MatcherSettings {
  const data = asRecord(value)
  const token = typeof data?.token === 'string' ? data.token : undefined
  const snapshot = asRecord(data?.snapshot)
  const operators = asRecord(snapshot?.operators)
  const excludedByAccount: Record<string, string[]> = {}
  for (const [account, ids] of Object.entries(
    asRecord(data?.excludedByAccount) ?? {},
  )) {
    if (
      Array.isArray(ids) &&
      ids.every((id) => typeof id === 'string' && id.length > 0)
    )
      excludedByAccount[account] = ids
  }
  if (!data || typeof data.enabled !== 'boolean') return emptyMatcherSettings()
  if (!snapshot)
    return {
      enabled: false,
      token,
      excludedByAccount,
    }
  if (
    !operators ||
    !['如鸢', '代号鸢'].includes(String(snapshot.game)) ||
    !['connectionId', 'accountId', 'accountName', 'syncedAt'].every(
      (k) => typeof snapshot[k] === 'string',
    ) ||
    !Number.isFinite(Date.parse(String(snapshot.syncedAt))) ||
    Object.entries(operators).some(([id, value]) => {
      const op = asRecord(value)
      return (
        !op ||
        op.id !== id ||
        (op.owned !== undefined && typeof op.owned !== 'boolean')
      )
    })
  )
    return emptyMatcherSettings()
  return {
    token,
    enabled: data.enabled,
    snapshot: snapshot as unknown as MatcherSnapshot,
    excludedByAccount,
  }
}

export function useOperatorMatcher() {
  const { userId } = useAtomValue(authAtom)
  const settingsAtom = useMemo(
    () =>
      atomWithStorage<MatcherSettings>(
        `maayuan-yuanhub-matcher-v2:${encodeURIComponent(userId ?? 'guest')}`,
        emptyMatcherSettings(),
        {
          getItem: (key, initial) => {
            try {
              return parseMatcherSettings(
                JSON.parse(localStorage.getItem(key) ?? 'null'),
              )
            } catch {
              return initial
            }
          },
          setItem: (key, value) => {
            try {
              localStorage.setItem(key, JSON.stringify(value))
            } catch {
              /* 本次会话仍可使用。 */
            }
          },
          removeItem: (key) => {
            try {
              localStorage.removeItem(key)
            } catch {
              /* 存储不可用时保留内存行为。 */
            }
          },
        },
        { getOnInit: true },
      ),
    [userId],
  )
  const [settings, setSettings] = useAtom(settingsAtom)
  const filter = useMemo<OperatorMatcherFilter | undefined>(
    () =>
      userId && settings.enabled && settings.snapshot
        ? {
            snapshot: settings.snapshot,
            excludedOperatorIds:
              settings.excludedByAccount?.[
                getMatcherAccountKey(settings.snapshot)
              ] ?? [],
          }
        : undefined,
    [userId, settings],
  )
  return { userId, settings, setSettings, filter }
}

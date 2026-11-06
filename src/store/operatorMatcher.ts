import { useAtom, useAtomValue } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { useMemo } from 'react'

import {
  MATCH_MODES,
  MatchMode,
  MatcherSnapshot,
  OperatorMatcherFilter,
  asRecord,
} from '../models/operatorMatcher'
import { authAtom } from './auth'

export interface MatcherSettings {
  enabled: boolean
  modes: MatchMode[]
  token?: string
  snapshot?: MatcherSnapshot
}
export const emptyMatcherSettings = (): MatcherSettings => ({
  enabled: false,
  modes: ['ready', 'train', 'unknown'],
})

export function parseMatcherSettings(value: unknown): MatcherSettings {
  const data = asRecord(value)
  const token = typeof data?.token === 'string' ? data.token : undefined
  const snapshot = asRecord(data?.snapshot)
  const operators = asRecord(snapshot?.operators)
  if (
    !data ||
    typeof data.enabled !== 'boolean' ||
    !Array.isArray(data.modes) ||
    !data.modes.length ||
    data.modes.some((m) => !MATCH_MODES.includes(m))
  )
    return emptyMatcherSettings()
  if (!snapshot)
    return { enabled: false, modes: data.modes as MatchMode[], token }
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
        (op.owned !== undefined && typeof op.owned !== 'boolean') ||
        ['level', 'elite', 'stars', 'attack', 'hp'].some(
          (k) =>
            op[k] !== undefined &&
            (typeof op[k] !== 'number' ||
              !Number.isSafeInteger(op[k]) ||
              (op[k] as number) < 0),
        ) ||
        !['mainStars', 'assistStars'].every(
          (k) =>
            Array.isArray(op[k]) &&
            (op[k] as unknown[]).every((v) => typeof v === 'string'),
        ) ||
        !Array.isArray(op.discs) ||
        op.discs.some(
          (d) => !Array.isArray(d) || d.some((v) => typeof v !== 'string'),
        )
      )
    })
  )
    return emptyMatcherSettings()
  return {
    token,
    enabled: data.enabled,
    modes: data.modes as MatchMode[],
    snapshot: snapshot as unknown as MatcherSnapshot,
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
        ? { snapshot: settings.snapshot, modes: settings.modes }
        : undefined,
    [userId, settings],
  )
  return { userId, settings, setSettings, filter }
}

import {
  getRecorderDeadTargetFallbacks,
  getRecorderDeadTargetIndices,
  getRecorderSpawnedTargetIndices,
  isRecorderAttackToken,
  isRecorderTargetSwitchToken,
  parseRecorderTargetMetadata,
  setRecorderTokenDeadTargetFallback,
  setRecorderTokenDeadTargets,
  setRecorderTokenSpawnedTargets,
  setRecorderTokenTarget,
} from './recordingUtils'
import type { RoundActionsInput } from './roundMapping'

export const RECORDER_META_VERSION = 2

export interface RecorderMetaChange {
  /**
   * 当前动作实际命中的敌人位（内部索引 1-5），与悬浮窗编辑记录保持一致。
   */
  target?: number
  /**
   * 本动作前发生的“左侧目标”次数，用于还原悬浮窗切换状态。
   */
  left?: number
  /**
   * 本动作前发生的“右侧目标”次数，用于还原悬浮窗切换状态。
   */
  right?: number
  dead?: number[]
  spawned?: number[]
  fallback?: Record<number, number>
}

export type RecorderMetaChanges = Record<
  string,
  Record<string, RecorderMetaChange>
>

export interface RecorderMeta {
  version: typeof RECORDER_META_VERSION
  initialEnemies: number[]
  initialMain: number
  changes: RecorderMetaChanges
}

export type RecorderMetaPatch = Partial<
  Pick<RecorderMeta, 'initialEnemies' | 'initialMain'>
>

const DEFAULT_INITIAL_ENEMIES = [1, 2, 3, 4, 5]
const DEFAULT_INITIAL_MAIN = 1
const MIN_TARGET_INDEX = 1
const MAX_TARGET_INDEX = 5

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const clampTargetIndex = (value: unknown, fallback: number) => {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return fallback
  }
  return Math.min(
    MAX_TARGET_INDEX,
    Math.max(MIN_TARGET_INDEX, Math.round(number)),
  )
}

const readNonNegativeInt = (value: unknown) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) {
    return 0
  }
  return Math.round(number)
}

const readTargetIndices = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_INITIAL_ENEMIES]
  }
  const indices = value
    .map((candidate) => clampTargetIndex(candidate, 0))
    .filter((targetIndex) => targetIndex >= MIN_TARGET_INDEX)

  return Array.from(
    new Set(
      indices.length > 0
        ? indices
        : [
            Math.min(
              MAX_TARGET_INDEX,
              Math.max(MIN_TARGET_INDEX, DEFAULT_INITIAL_MAIN),
            ),
          ],
    ),
  ).sort((a, b) => a - b)
}

const readChange = (value: unknown): RecorderMetaChange => {
  if (!isRecord(value)) {
    return {}
  }

  const target = clampTargetIndex(value['target'], 0)
  const left = readNonNegativeInt(value['left'])
  const right = readNonNegativeInt(value['right'])
  const dead = Array.isArray(value['dead'])
    ? value['dead']
        .map((candidate) => clampTargetIndex(candidate, 0))
        .filter((candidate) => candidate >= MIN_TARGET_INDEX)
    : []
  const spawned = Array.isArray(value['spawned'])
    ? value['spawned']
        .map((candidate) => clampTargetIndex(candidate, 0))
        .filter((candidate) => candidate >= MIN_TARGET_INDEX)
    : []
  const fallbackRecord = isRecord(value['fallback'])
    ? (Object.fromEntries(
        Object.entries(value['fallback'])
          .map(([key, fallbackTarget]) => [
            clampTargetIndex(Number(key), 0),
            clampTargetIndex(fallbackTarget, 0),
          ])
          .filter(
            ([deadTargetIndex, fallbackTargetIndex]) =>
              deadTargetIndex >= MIN_TARGET_INDEX &&
              fallbackTargetIndex >= MIN_TARGET_INDEX,
          ),
      ) as Record<number, number>)
    : {}

  return {
    ...(target >= MIN_TARGET_INDEX ? { target } : {}),
    ...(value['left'] === undefined ? {} : { left }),
    ...(value['right'] === undefined ? {} : { right }),
    ...(Array.from(new Set(dead)).sort((a, b) => a - b).length
      ? {
          dead: Array.from(new Set(dead)).sort((a, b) => a - b),
        }
      : {}),
    ...(Array.from(new Set(spawned)).sort((a, b) => a - b).length
      ? {
          spawned: Array.from(new Set(spawned)).sort((a, b) => a - b),
        }
      : {}),
    ...(Object.keys(fallbackRecord).length ? { fallback: fallbackRecord } : {}),
  }
}

const readChanges = (value: unknown): RecorderMetaChanges => {
  if (!isRecord(value)) {
    return {}
  }

  const changes: RecorderMetaChanges = {}
  Object.entries(value).forEach(([roundKey, roundValue]) => {
    if (!isRecord(roundValue)) {
      return
    }

    const roundChanges: Record<string, RecorderMetaChange> = {}
    Object.entries(roundValue).forEach(([attackNumber, changeValue]) => {
      const parsedChange = readChange(changeValue)
      if (Object.keys(parsedChange).length > 0) {
        roundChanges[attackNumber] = parsedChange
      }
    })
    if (Object.keys(roundChanges).length > 0) {
      changes[roundKey] = roundChanges
    }
  })
  return changes
}

export function createDefaultRecorderMeta(): RecorderMeta {
  return {
    version: RECORDER_META_VERSION,
    initialEnemies: [...DEFAULT_INITIAL_ENEMIES],
    initialMain: DEFAULT_INITIAL_MAIN,
    changes: {},
  }
}

export function parseRecorderMeta(value?: unknown): RecorderMeta {
  const raw = isRecord(value) ? value : {}
  const initialEnemies = readTargetIndices(
    raw['initialEnemies'] ?? raw['initial_enemies'],
  )
  const initialMain = clampTargetIndex(
    raw['initialMain'] ?? raw['initial_main'],
    DEFAULT_INITIAL_MAIN,
  )

  return {
    version: RECORDER_META_VERSION,
    initialEnemies,
    initialMain: initialEnemies.includes(initialMain)
      ? initialMain
      : (initialEnemies[0] ?? DEFAULT_INITIAL_MAIN),
    changes: readChanges(raw['changes']),
  }
}

export function cloneRecorderMeta(meta: RecorderMeta): RecorderMeta {
  return JSON.parse(JSON.stringify(meta)) as RecorderMeta
}

export function syncRecorderMetaFromRoundActions(
  meta: RecorderMeta | undefined,
  input: RoundActionsInput,
  patch?: RecorderMetaPatch,
): RecorderMeta {
  const next = cloneRecorderMeta(parseRecorderMeta(meta))

  if (patch?.initialEnemies !== undefined) {
    next.initialEnemies = readTargetIndices(patch.initialEnemies)
  }
  if (patch?.initialMain !== undefined) {
    next.initialMain = clampTargetIndex(
      patch.initialMain,
      next.initialEnemies[0] ?? DEFAULT_INITIAL_MAIN,
    )
    if (!next.initialEnemies.includes(next.initialMain)) {
      next.initialMain = next.initialEnemies[0] ?? DEFAULT_INITIAL_MAIN
    }
  }

  let activeTargetIndices = [...next.initialEnemies]
  let currentMainIndex = next.initialMain
  let pendingLeft = 0
  let pendingRight = 0
  const changes: RecorderMetaChanges = {}

  const findNearestTargetIndex = (targetIndex: number) =>
    activeTargetIndices.length > 0
      ? activeTargetIndices.reduce((nearest, candidate) =>
          Math.abs(candidate - targetIndex) < Math.abs(nearest - targetIndex)
            ? candidate
            : nearest,
        )
      : next.initialMain

  const moveMainIndex = (direction: -1 | 1) => {
    const currentPosition = activeTargetIndices.indexOf(currentMainIndex)
    if (activeTargetIndices.length <= 1 || currentPosition === -1) {
      return
    }
    currentMainIndex =
      activeTargetIndices[
        (currentPosition + direction + activeTargetIndices.length) %
          activeTargetIndices.length
      ]
  }

  const applyStatusMetadata = (metadata: readonly string[]) => {
    const deadTargetIndices = getRecorderDeadTargetIndices(metadata)
    const spawnedTargetIndices = getRecorderSpawnedTargetIndices(metadata)
    const fallbacks = Object.fromEntries(
      getRecorderDeadTargetFallbacks(metadata),
    ) as Record<number, number>

    if (deadTargetIndices.length > 0) {
      const deadSet = new Set(deadTargetIndices)
      activeTargetIndices = activeTargetIndices.filter(
        (targetIndex) => !deadSet.has(targetIndex),
      )
    }
    if (spawnedTargetIndices.length > 0) {
      const activeSet = new Set(activeTargetIndices)
      spawnedTargetIndices.forEach((targetIndex) => activeSet.add(targetIndex))
      activeTargetIndices = Array.from(activeSet).sort((a, b) => a - b)
    }

    if (
      activeTargetIndices.length > 0 &&
      !activeTargetIndices.includes(currentMainIndex)
    ) {
      const fallbackTargetIndex = fallbacks[currentMainIndex]
      currentMainIndex =
        fallbackTargetIndex !== undefined &&
        activeTargetIndices.includes(fallbackTargetIndex)
          ? fallbackTargetIndex
          : findNearestTargetIndex(currentMainIndex)
    }

    return { dead: deadTargetIndices, spawned: spawnedTargetIndices, fallbacks }
  }

  Object.entries(input)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([roundKey, entries]) => {
      const roundChanges: Record<string, RecorderMetaChange> = {}
      let attackNumber = 0

      entries.forEach((entry) => {
        const token = entry[0]?.trim() ?? ''
        if (isRecorderTargetSwitchToken(token)) {
          if (token === '额外:左侧目标') {
            pendingLeft += 1
          } else {
            pendingRight += 1
          }
          return
        }

        if (!isRecorderAttackToken(token)) {
          return
        }

        attackNumber += 1
        const metadata = entry.slice(1)
        const leftSwitches = pendingLeft
        const rightSwitches = pendingRight
        while (pendingLeft > 0) {
          moveMainIndex(-1)
          pendingLeft -= 1
        }
        while (pendingRight > 0) {
          moveMainIndex(1)
          pendingRight -= 1
        }

        const targetIndex = metadata
          .map((value) => parseRecorderTargetMetadata(value))
          .find((value) => value !== undefined)
        const recordedTargetIndex =
          targetIndex === undefined
            ? activeTargetIndices.includes(currentMainIndex)
              ? currentMainIndex
              : findNearestTargetIndex(currentMainIndex)
            : clampTargetIndex(targetIndex, 0)
        const status = applyStatusMetadata(metadata)
        const change: RecorderMetaChange = {
          ...(recordedTargetIndex >= MIN_TARGET_INDEX
            ? { target: recordedTargetIndex }
            : {}),
          left: leftSwitches,
          right: rightSwitches,
          ...(status.dead.length ? { dead: status.dead } : {}),
          ...(status.spawned.length ? { spawned: status.spawned } : {}),
          ...(Object.keys(status.fallbacks).length
            ? { fallback: status.fallbacks }
            : {}),
        }

        if (Object.keys(change).length > 0) {
          roundChanges[String(attackNumber)] = change
        }
      })

      if (Object.keys(roundChanges).length > 0) {
        changes[roundKey] = roundChanges
      }
    })

  next.changes = changes
  return next
}

export function getRecorderAttackNumber(
  input: RoundActionsInput,
  round: number,
  index: number,
): number | undefined {
  const entries = input[String(round)] ?? []
  let attackNumber = 0

  for (let currentIndex = 0; currentIndex <= index; currentIndex += 1) {
    const token = entries[currentIndex]?.[0]?.trim() ?? ''
    if (!isRecorderAttackToken(token)) {
      continue
    }
    attackNumber += 1
  }

  const token = entries[index]?.[0]?.trim() ?? ''
  return isRecorderAttackToken(token) ? attackNumber : undefined
}

export function getRecorderMetaTargetIndex(
  meta: unknown,
  round: number,
  attackNumber: number | undefined,
): number | undefined {
  if (attackNumber === undefined) {
    return undefined
  }
  const parsed = parseRecorderMeta(meta)
  const change = parsed.changes[String(round)]?.[String(attackNumber)]
  if (change === undefined) {
    return undefined
  }

  const hasSourceStateChanges = Object.values(parsed.changes).some(
    (roundChanges) =>
      Object.values(roundChanges).some(
        (candidate) =>
          candidate.left !== undefined || candidate.right !== undefined,
      ),
  )
  if (hasSourceStateChanges && change.target === undefined) {
    return getDerivedRecorderMetaTargetIndex(parsed, round, attackNumber)
  }

  return change.target
}

const getDerivedRecorderMetaTargetIndex = (
  meta: RecorderMeta,
  round: number,
  attackNumber: number,
): number | undefined => {
  let activeTargetIndices = [...meta.initialEnemies]
  let currentMainIndex = activeTargetIndices.includes(meta.initialMain)
    ? meta.initialMain
    : activeTargetIndices[0]
  if (currentMainIndex === undefined) {
    return undefined
  }

  const findNearestTargetIndex = (targetIndex: number) =>
    activeTargetIndices.length > 0
      ? activeTargetIndices.reduce((nearest, candidate) =>
          Math.abs(candidate - targetIndex) < Math.abs(nearest - targetIndex)
            ? candidate
            : nearest,
        )
      : meta.initialMain

  const moveMainIndex = (direction: -1 | 1) => {
    const currentPosition = activeTargetIndices.indexOf(currentMainIndex)
    if (activeTargetIndices.length <= 1 || currentPosition === -1) {
      return
    }
    currentMainIndex =
      activeTargetIndices[
        (currentPosition + direction + activeTargetIndices.length) %
          activeTargetIndices.length
      ]
  }

  for (const [roundKey, roundChanges] of Object.entries(meta.changes).sort(
    ([a], [b]) => Number(a) - Number(b),
  )) {
    const currentRound = Number(roundKey)
    if (currentRound > round) {
      break
    }

    for (const [attackNumberKey, change] of Object.entries(roundChanges).sort(
      ([a], [b]) => Number(a) - Number(b),
    )) {
      const currentAttackNumber = Number(attackNumberKey)
      const reachedTargetAction =
        currentRound === round && currentAttackNumber === attackNumber
      // 环形切换只需执行余数步，避免外部元数据的大计数阻塞页面。
      const leftSwitches = (change.left ?? 0) % activeTargetIndices.length
      const rightSwitches = (change.right ?? 0) % activeTargetIndices.length
      for (let index = 0; index < leftSwitches; index += 1) {
        moveMainIndex(-1)
      }
      for (let index = 0; index < rightSwitches; index += 1) {
        moveMainIndex(1)
      }

      if (reachedTargetAction) {
        return activeTargetIndices.includes(currentMainIndex)
          ? currentMainIndex
          : undefined
      }

      if (change.dead?.length || change.spawned?.length) {
        const deadSet = new Set(change.dead ?? [])
        const activeSet = new Set(
          activeTargetIndices.filter(
            (targetIndex) => !deadSet.has(targetIndex),
          ),
        )
        ;(change.spawned ?? []).forEach((targetIndex) =>
          activeSet.add(targetIndex),
        )
        activeTargetIndices = Array.from(activeSet).sort((a, b) => a - b)

        if (
          activeTargetIndices.length > 0 &&
          !activeTargetIndices.includes(currentMainIndex)
        ) {
          const fallbackTargetIndex = change.fallback?.[currentMainIndex]
          currentMainIndex =
            fallbackTargetIndex !== undefined &&
            activeTargetIndices.includes(fallbackTargetIndex)
              ? fallbackTargetIndex
              : findNearestTargetIndex(currentMainIndex)
        }
      }
    }
  }

  return activeTargetIndices.includes(currentMainIndex)
    ? currentMainIndex
    : undefined
}

export const RECORDER_META_TARGET_COLORS: Record<number, string> = {
  2: '#a21caf',
  3: '#1d4ed8',
  4: '#92400e',
  5: '#047857',
}

export function getRecorderMetaTargetColor(
  targetIndex?: number,
): string | undefined {
  return targetIndex === undefined
    ? undefined
    : RECORDER_META_TARGET_COLORS[targetIndex]
}

export function hydrateRoundActionsWithRecorderMeta(
  input: RoundActionsInput,
  value?: unknown,
): RoundActionsInput {
  const meta = parseRecorderMeta(value)
  if (Object.keys(meta.changes).length === 0) {
    return input
  }

  let result = input

  Object.entries(input)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([roundKey, entries]) => {
      const round = Number(roundKey)
      let attackNumber = 0

      entries.forEach((entry, index) => {
        const token = entry[0]?.trim() ?? ''
        if (!isRecorderAttackToken(token)) {
          return
        }

        attackNumber += 1
        const change = meta.changes[roundKey]?.[String(attackNumber)]
        if (!change) {
          return
        }

        let currentEntry = result[roundKey]?.[index] ?? entry
        const metadata = currentEntry.slice(1)
        const existingTargetIndex = metadata
          .map((value) => parseRecorderTargetMetadata(value))
          .find((value) => value !== undefined)
        const targetIndex =
          change.target ?? getRecorderMetaTargetIndex(meta, round, attackNumber)

        if (existingTargetIndex === undefined && targetIndex !== undefined) {
          result = setRecorderTokenTarget(result, round, index, targetIndex)
          currentEntry = result[roundKey]?.[index] ?? currentEntry
        }

        const currentMetadata = currentEntry.slice(1)
        const existingDeadTargetIndices =
          getRecorderDeadTargetIndices(currentMetadata)
        const nextDeadTargetIndices = Array.from(
          new Set([...existingDeadTargetIndices, ...(change.dead ?? [])]),
        ).sort((a, b) => a - b)
        if (
          nextDeadTargetIndices.length !== existingDeadTargetIndices.length ||
          nextDeadTargetIndices.some(
            (targetIndex, index) =>
              targetIndex !== existingDeadTargetIndices[index],
          )
        ) {
          result = setRecorderTokenDeadTargets(
            result,
            round,
            index,
            nextDeadTargetIndices,
          )
          currentEntry = result[roundKey]?.[index] ?? currentEntry
        }

        const currentSpawnedTargetIndices = getRecorderSpawnedTargetIndices(
          currentEntry.slice(1),
        )
        const nextSpawnedTargetIndices = Array.from(
          new Set([...currentSpawnedTargetIndices, ...(change.spawned ?? [])]),
        ).sort((a, b) => a - b)
        if (
          nextSpawnedTargetIndices.length !==
            currentSpawnedTargetIndices.length ||
          nextSpawnedTargetIndices.some(
            (targetIndex, index) =>
              targetIndex !== currentSpawnedTargetIndices[index],
          )
        ) {
          result = setRecorderTokenSpawnedTargets(
            result,
            round,
            index,
            nextSpawnedTargetIndices,
          )
          currentEntry = result[roundKey]?.[index] ?? currentEntry
        }

        const existingFallbacks = getRecorderDeadTargetFallbacks(
          currentEntry.slice(1),
        )
        Object.entries(change.fallback ?? {}).forEach(
          ([deadTargetIndexValue, fallbackTargetIndexValue]) => {
            const deadTargetIndex = Number(deadTargetIndexValue)
            const fallbackTargetIndex = Number(fallbackTargetIndexValue)
            if (
              !Number.isFinite(deadTargetIndex) ||
              !Number.isFinite(fallbackTargetIndex) ||
              existingFallbacks.has(deadTargetIndex)
            ) {
              return
            }

            result = setRecorderTokenDeadTargetFallback(
              result,
              round,
              index,
              deadTargetIndex,
              fallbackTargetIndex,
            )
            existingFallbacks.set(deadTargetIndex, fallbackTargetIndex)
          },
        )
      })
    })

  return result
}

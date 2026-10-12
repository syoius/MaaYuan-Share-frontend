import { Button, Card, Classes, Icon, Menu, MenuItem } from '@blueprintjs/core'
import { Popover2 } from '@blueprintjs/popover2'

import clsx from 'clsx'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { Rnd } from 'react-rnd'
import { useWindowSize } from 'react-use'

import { useBreakpoint } from '../../../utils/device'
import { AppToaster } from '../../Toaster'
import {
  type RecorderMeta,
  type RecorderMetaPatch,
  parseRecorderMeta,
} from './recorderMeta'
import {
  RECORDER_SLOT_KEYS,
  RECORDER_TARGET_LABELS,
  appendRecorderToken,
  cloneRoundActions,
  formatRecorderRoundItem,
  getNextRecorderRound,
  getRecorderActiveTargetIndices,
  getRecorderCurrentMainTargetIndex,
  getRecorderDeadTargetIndices,
  getRecorderRoundNumbers,
  getRecorderSpawnedTargetIndices,
  getRecorderTargetGridPosition,
  getRecorderTargetLabel,
  getRecorderTargetRotation,
  getRecorderTargetSwitchPath,
  getRotatedRecorderTargetGridPosition,
  groupRecorderRoundActions,
  isRecorderAttackToken,
  isRecorderAutomaticTargetSwitchMetadata,
  parseRecorderTargetMetadata,
  rebuildRecorderTargetSwitches,
  removeRecorderToken,
  setRecorderTokenDeadTargetFallback,
  setRecorderTokenDeadTargets,
  setRecorderTokenSpawnedTargets,
  setRecorderTokenTarget,
} from './recordingUtils'
import type { RecorderRoundItem } from './recordingUtils'
import type { MappingOptions, RoundActionsInput } from './roundMapping'

type RecorderButtonTone = 'ultimate' | 'normal' | 'defense' | 'sp' | 'extra'
type RecorderConvertibleTone = Extract<
  RecorderButtonTone,
  'ultimate' | 'normal' | 'defense'
>

interface RecorderActionButton {
  key: string
  slot?: number
  label: string
  token: string
  tone: RecorderButtonTone
}

interface FloatingActionRecorderProps {
  roundActions: RoundActionsInput
  slotAssignments?: MappingOptions['slotAssignments']
  onChange: (next: RoundActionsInput, metaPatch?: RecorderMetaPatch) => void
  recorderMeta?: RecorderMeta
}

interface RecorderEnemyEventSummary {
  round: number
  order: number
  actionLabel: string
  type: 'dead' | 'spawn'
}

interface RecorderEnemyEventSummaryGroup {
  targetIndex: number
  label: string
  events: RecorderEnemyEventSummary[]
}

type RecorderTargetFallbackDialog =
  | {
      kind: 'remove'
      targetIndex: number
      fallbackTargetIndex: number | null
    }
  | {
      kind: 'death'
      targetIndex: number
      fallbackTargetIndex: number | null
      round: number
      index: number
      replaceDeadTargetIndex?: number
      removeSpawnTargetIndex?: number
    }

const HEADER_CLASS = 'action-recorder-header'
const MIN_WIDTH = 320
const MIN_HEIGHT = 420
const DEFAULT_WIDTH = 480
const DEFAULT_HEIGHT = 680
const TARGET_SWITCH_STEP_DURATION = 160
const RECORDER_CONTROL_BUTTON_CLASS =
  '!w-full !justify-start !gap-1 !rounded-sm !border !border-slate-200 !bg-white/70 !px-1.5 !py-0 !font-medium !text-slate-600 hover:!border-slate-300 hover:!bg-slate-100 dark:!border-slate-700 dark:!bg-slate-900/40 dark:!text-slate-300 dark:hover:!border-slate-600 dark:hover:!bg-slate-800'
const RECORDER_CONTROL_BUTTON_TEXT_CLASS = '!text-[11px] !leading-none'
const RECORDER_CONTROL_BUTTON_ACTIVE_CLASS =
  '!border-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_42%,var(--maayuan-surface,#fff))] !bg-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_18%,var(--maayuan-surface,#faf5ff))] !text-[var(--maayuan-text-strong,#4c1d95)] hover:!bg-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_26%,var(--maayuan-surface,#faf5ff))] dark:!border-violet-500/50 dark:!bg-violet-500/20 dark:!text-violet-100 dark:hover:!bg-violet-500/30'
const RECORDER_ROUND_OPTIONS = Array.from(
  { length: 49 },
  (_, index) => index + 1,
)
const RECORDER_ENEMY_COUNTS = [1, 2, 3, 4, 5] as const
const RECORDER_TARGET_INDICES = RECORDER_TARGET_LABELS.map(
  (_, index) => index + 1,
)
const RECORDER_CENTER_TARGET_INDEX = 1
const getRecorderTargetPositionStyle = (
  gridColumn: number,
  gridRow: number,
) => ({
  left: `${(gridColumn - 0.5) * 20}%`,
  top: `${(gridRow - 0.5) * 50}%`,
  transform: 'translate(-50%, -50%)',
})
const getInitialRecorderTargetIndices = (enemyCount: number) =>
  RECORDER_TARGET_INDICES.slice(
    0,
    Math.min(
      Math.max(Math.round(enemyCount), 1),
      RECORDER_TARGET_INDICES.length,
    ),
  )
const TARGET_POSITION_TONE_CLASS: Record<string, string> = {
  '1': 'border-pink-200 bg-[#ffe3ed] hover:bg-[#ffe3ed] dark:border-pink-500/50 dark:bg-[#ffe3ed] dark:hover:bg-[#ffe3ed]',
  '2': 'border-[#82bfe3] bg-[#c3e8ff] hover:bg-[#c3e8ff] dark:border-blue-500/50 dark:bg-[#c3e8ff] dark:hover:bg-[#c3e8ff]',
  '3': 'border-amber-200 bg-[#fff3c9] hover:bg-[#fff3c9] dark:border-amber-500/50 dark:bg-[#fff3c9] dark:hover:bg-[#fff3c9]',
  '4': 'border-[#b8cc9c] bg-[#e1edc1] hover:bg-[#e1edc1] dark:border-emerald-500/50 dark:bg-[#e1edc1] dark:hover:bg-[#e1edc1]',
  '5': 'border-rose-300 bg-rose-100/80 text-rose-700 hover:bg-rose-200/80 dark:border-rose-500/60 dark:bg-rose-500/20 dark:text-rose-200 dark:hover:bg-rose-500/30',
}
const TARGET_POSITION_NEUTRAL_CLASS =
  'border-slate-300 bg-transparent text-slate-600 hover:bg-slate-100/80 dark:border-slate-600 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-700/60'

const TONE_CHIP_CLASS: Record<RecorderButtonTone, string> = {
  ultimate:
    'border-red-300 bg-red-50/70 text-red-700 hover:bg-red-100/80 dark:border-red-600/70 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20',
  normal:
    'border-amber-300 bg-amber-50/70 text-amber-700 hover:bg-amber-100/80 dark:border-amber-600/70 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20',
  defense:
    'border-blue-300 bg-blue-50/70 text-blue-700 hover:bg-blue-100/80 dark:border-blue-600/70 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/20',
  sp: 'border-lime-300 bg-lime-50/70 text-lime-700 hover:bg-lime-100/80 dark:border-lime-600/70 dark:bg-lime-500/10 dark:text-lime-200 dark:hover:bg-lime-500/20',
  extra:
    'border-violet-300 bg-violet-50/70 text-violet-700 hover:bg-violet-100/80 dark:border-violet-600/70 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20',
}

const RECORDER_ACTION_SYMBOL: Record<RecorderConvertibleTone, string> = {
  ultimate: '大',
  normal: '普',
  defense: '下',
}

const createSlotButtons = (
  tone: Extract<RecorderButtonTone, 'ultimate' | 'normal' | 'defense' | 'sp'>,
  symbol: string,
  label: string,
): RecorderActionButton[] =>
  RECORDER_SLOT_KEYS.map((slot) => ({
    key: `${slot}-${symbol}`,
    slot: Number(slot),
    label,
    token: `${slot}${symbol}`,
    tone,
  }))

const RECORDER_BUTTON_ROWS: RecorderActionButton[][] = [
  createSlotButtons('ultimate', '大', '↑'),
  createSlotButtons('normal', '普', 'A'),
  createSlotButtons('defense', '下', '↓'),
  createSlotButtons('sp', 'sp', '圈'),
]

const getInitialSize = () => {
  if (typeof window === 'undefined') {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
  }
  return {
    width: Math.max(MIN_WIDTH, Math.min(DEFAULT_WIDTH, window.innerWidth - 24)),
    height: Math.max(
      MIN_HEIGHT,
      Math.min(DEFAULT_HEIGHT, window.innerHeight - 24),
    ),
  }
}

const getInitialPosition = (size: { width: number; height: number }) => {
  if (typeof window === 'undefined') {
    return { x: 24, y: 80 }
  }
  return {
    x: Math.max(8, window.innerWidth - size.width - 20),
    y: Math.max(72, window.innerHeight - size.height - 20),
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

const getNearestRecorderTargetIndex = (
  targetIndex: number,
  targetIndices: readonly number[],
) =>
  targetIndices.reduce(
    (nearest, candidate) =>
      Math.abs(candidate - targetIndex) < Math.abs(nearest - targetIndex)
        ? candidate
        : nearest,
    targetIndices[0] ?? RECORDER_CENTER_TARGET_INDEX,
  )

const cloneEntries = (entries: string[][]) => entries.map((entry) => [...entry])

const getRecorderTargetEventAnchor = (
  input: RoundActionsInput,
  throughRound: number,
) => {
  for (let round = throughRound; round >= 1; round -= 1) {
    const entries = input[String(round)] ?? []
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      if (!entry?.[0]?.trim()) {
        continue
      }
      if (
        entry
          .slice(1)
          .some((value) => isRecorderAutomaticTargetSwitchMetadata(value))
      ) {
        continue
      }
      return { round, index }
    }
  }
  return undefined
}

const copyRoundInRecorder = (
  input: RoundActionsInput,
  sourceRound: number,
  targetRound = sourceRound,
): RoundActionsInput => {
  const result = cloneRoundActions(input)
  const source = cloneEntries(result[String(sourceRound)] ?? [])
  const numbers = getRecorderRoundNumbers(result)
  const lastRound = numbers.length > 0 ? Math.max(...numbers) : 0
  const insertRound = targetRound + 1

  for (let current = lastRound; current >= insertRound; current -= 1) {
    result[String(current + 1)] = cloneEntries(result[String(current)] ?? [])
  }
  result[String(insertRound)] = source
  return result
}

const removeRoundInRecorder = (
  input: RoundActionsInput,
  round: number,
): RoundActionsInput => {
  const result = cloneRoundActions(input)
  delete result[String(round)]

  const reindexed: RoundActionsInput = {}
  getRecorderRoundNumbers(result).forEach((sourceRound, index) => {
    reindexed[String(index + 1)] = cloneEntries(
      result[String(sourceRound)] ?? [],
    )
  })
  return reindexed
}

export function FloatingActionRecorder({
  roundActions,
  slotAssignments,
  onChange,
  recorderMeta: recorderMetaProp,
}: FloatingActionRecorderProps) {
  const parsedRecorderMeta = useMemo(
    () => parseRecorderMeta(recorderMetaProp),
    [recorderMetaProp],
  )
  const [size, setSize] = useState(getInitialSize)
  const [position, setPosition] = useState(() => getInitialPosition(size))
  const [visible, setVisible] = useState(false)
  const [initialMain, setInitialMain] = useState<number>(
    () => parsedRecorderMeta.initialMain,
  )
  const [enemyCount, setEnemyCount] = useState(
    () => parsedRecorderMeta.initialEnemies.length,
  )
  const [availableTargetIndices, setAvailableTargetIndices] = useState<
    number[]
  >(() => parsedRecorderMeta.initialEnemies)
  const [selectedTargetIndex, setSelectedTargetIndex] = useState(
    () => parsedRecorderMeta.initialMain,
  )
  const [targetSwitchPreviewIndex, setTargetSwitchPreviewIndex] = useState<
    number | null
  >(null)
  const [showTargetSwitches, setShowTargetSwitches] = useState(true)
  const [showEnemyEvents, setShowEnemyEvents] = useState(true)
  const [targetFallbackDialog, setTargetFallbackDialog] =
    useState<RecorderTargetFallbackDialog | null>(null)
  const [targetFallbackDialogAnchorX, setTargetFallbackDialogAnchorX] =
    useState<number | null>(null)
  const [currentRound, setCurrentRound] = useState(() =>
    getNextRecorderRound(roundActions),
  )
  const [copySourceRoundInput, setCopySourceRoundInput] = useState('1')
  const [openRoundMenu, setOpenRoundMenu] = useState<number | null>(null)
  const { width: windowWidth, height: windowHeight } = useWindowSize()
  const breakpoint = useBreakpoint()
  const isMobileRecorder = breakpoint === 'tablet'
  const canDrag = !isMobileRecorder
  const recorderControlButtonSizeClass = isMobileRecorder
    ? '!h-7 !min-h-[28px]'
    : '!h-7 !min-h-[28px]'
  const recorderControlIconSize = isMobileRecorder ? 14 : 13
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const targetBoardRef = useRef<HTMLDivElement>(null)
  const pendingScrollRoundRef = useRef<number | null>(null)
  const targetSwitchTimerRef = useRef<number | null>(null)
  const targetSwitchSequenceRef = useRef(0)
  const targetSwitchPendingTargetRef = useRef<number | null>(null)

  const cancelTargetSwitchAnimation = useCallback(() => {
    if (targetSwitchTimerRef.current !== null) {
      window.clearTimeout(targetSwitchTimerRef.current)
      targetSwitchTimerRef.current = null
    }
    targetSwitchSequenceRef.current += 1
    targetSwitchPendingTargetRef.current = null
  }, [])

  useEffect(
    () => () => {
      cancelTargetSwitchAnimation()
    },
    [cancelTargetSwitchAnimation],
  )

  useEffect(() => {
    const parsed = parseRecorderMeta(recorderMetaProp)
    setInitialMain(parsed.initialMain)
    setEnemyCount(parsed.initialEnemies.length)
    setAvailableTargetIndices(parsed.initialEnemies)
    setSelectedTargetIndex((current) =>
      parsed.initialEnemies.includes(current) ? current : parsed.initialMain,
    )
  }, [recorderMetaProp])

  useEffect(() => {
    setSize((current) => ({
      width: Math.min(current.width, Math.max(MIN_WIDTH, windowWidth - 16)),
      height: Math.min(current.height, Math.max(MIN_HEIGHT, windowHeight - 16)),
    }))
  }, [windowWidth, windowHeight])

  useEffect(() => {
    setPosition((current) => ({
      x: clamp(current.x, 8, windowWidth - size.width - 8),
      y: clamp(current.y, 8, windowHeight - size.height - 8),
    }))
  }, [size.height, size.width, windowHeight, windowWidth])

  useEffect(() => {
    const targetRound = pendingScrollRoundRef.current
    if (!visible || targetRound === null) {
      return
    }

    pendingScrollRoundRef.current = null
    const frame = requestAnimationFrame(() => {
      const container = scrollContainerRef.current
      if (!container) {
        return
      }

      const row = container.querySelector<HTMLElement>(
        `[data-recorder-round="${targetRound}"]`,
      )
      if (!row) {
        container.scrollTop = container.scrollHeight
        return
      }

      const headerHeight =
        container.querySelector('thead')?.getBoundingClientRect().height ?? 0
      const containerRect = container.getBoundingClientRect()
      const rowRect = row.getBoundingClientRect()
      const visibleTop = containerRect.top + headerHeight

      if (rowRect.top < visibleTop) {
        container.scrollTop -= visibleTop - rowRect.top
      } else if (rowRect.bottom > containerRect.bottom) {
        container.scrollTop += rowRect.bottom - containerRect.bottom
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [currentRound, visible])

  const roundNumbers = useMemo(
    () => getRecorderRoundNumbers(roundActions),
    [roundActions],
  )
  const maxRound = Math.max(currentRound, ...roundNumbers, 1)
  const roundRows = useMemo(
    () =>
      Array.from({ length: maxRound }, (_, index) => {
        const round = index + 1
        return {
          round,
          groups: groupRecorderRoundActions(roundActions, round, {
            showTargetSwitches,
          }),
        }
      }),
    [roundActions, maxRound, showTargetSwitches],
  )
  const enemyEventSummaries = useMemo(() => {
    const summaries: RecorderEnemyEventSummaryGroup[] =
      RECORDER_TARGET_INDICES.slice(1).map((targetIndex) => ({
        targetIndex,
        label: getRecorderTargetLabel(targetIndex),
        events: [],
      }))
    const summariesByTargetIndex = new Map(
      summaries.map((summary) => [summary.targetIndex, summary]),
    )

    getRecorderRoundNumbers(roundActions).forEach((round) => {
      const groups = groupRecorderRoundActions(roundActions, round)
      const items = Object.values(groups.slots)
        .flat()
        .filter((item) => isRecorderAttackToken(item.token))
        .sort((a, b) => a.index - b.index)

      items.forEach((item, itemIndex) => {
        const order = itemIndex + 1
        const actionLabel = `${
          slotAssignments?.[item.display.slot]?.name?.trim() ||
          `${item.display.slot}号位`
        }${formatRecorderRoundItem({ ...item, order })}`
        const events: RecorderEnemyEventSummary[] = [
          ...item.deadTargetIndices.map((targetIndex) => ({
            targetIndex,
            type: 'dead' as const,
          })),
          ...item.spawnedTargetIndices.map((targetIndex) => ({
            targetIndex,
            type: 'spawn' as const,
          })),
        ]

        events.forEach(({ targetIndex, type }) => {
          const summary = summariesByTargetIndex.get(targetIndex)
          if (!summary) {
            return
          }
          summary.events.push({
            round,
            order,
            actionLabel,
            type,
          })
        })
      })
    })

    return summaries
  }, [roundActions, slotAssignments])
  const enemyEventSummaryCount = enemyEventSummaries.reduce(
    (total, summary) => total + summary.events.length,
    0,
  )
  const activeTargetIndicesForCurrentRound = useMemo(
    () =>
      getRecorderActiveTargetIndices(
        roundActions,
        availableTargetIndices,
        initialMain,
        { throughRound: currentRound },
      ),
    [availableTargetIndices, currentRound, initialMain, roundActions],
  )
  const currentMainTargetIndexForCurrentRound = useMemo(
    () =>
      getRecorderCurrentMainTargetIndex(
        roundActions,
        availableTargetIndices,
        initialMain,
        { throughRound: currentRound },
      ),
    [availableTargetIndices, currentRound, initialMain, roundActions],
  )
  const targetFallbackOptions = useMemo(() => {
    if (targetFallbackDialog === null) {
      return []
    }

    if (targetFallbackDialog.kind === 'remove') {
      return activeTargetIndicesForCurrentRound.filter(
        (targetIndex) => targetIndex !== targetFallbackDialog.targetIndex,
      )
    }

    const entry =
      roundActions[String(targetFallbackDialog.round)]?.[
        targetFallbackDialog.index
      ]
    const activeBeforeAction = getRecorderActiveTargetIndices(
      roundActions,
      availableTargetIndices,
      initialMain,
      {
        throughRound: targetFallbackDialog.round,
        beforeActionIndex: targetFallbackDialog.index,
      },
    )
    const deadTargetIndices = new Set(
      getRecorderDeadTargetIndices(entry?.slice(1) ?? []),
    )
    if (targetFallbackDialog.replaceDeadTargetIndex !== undefined) {
      deadTargetIndices.delete(targetFallbackDialog.replaceDeadTargetIndex)
    }
    deadTargetIndices.add(targetFallbackDialog.targetIndex)

    return activeBeforeAction.filter(
      (targetIndex) => !deadTargetIndices.has(targetIndex),
    )
  }, [
    activeTargetIndicesForCurrentRound,
    availableTargetIndices,
    initialMain,
    roundActions,
    targetFallbackDialog,
  ])
  useEffect(() => {
    if (activeTargetIndicesForCurrentRound.includes(selectedTargetIndex)) {
      return
    }

    cancelTargetSwitchAnimation()
    setTargetSwitchPreviewIndex(null)
    setSelectedTargetIndex(
      getNearestRecorderTargetIndex(
        selectedTargetIndex,
        activeTargetIndicesForCurrentRound,
      ),
    )
  }, [
    activeTargetIndicesForCurrentRound,
    cancelTargetSwitchAnimation,
    selectedTargetIndex,
  ])

  useLayoutEffect(() => {
    if (targetFallbackDialog === null) {
      setTargetFallbackDialogAnchorX(null)
      return
    }

    const board = targetBoardRef.current
    const anchorParent = board?.offsetParent

    if (!board || !(anchorParent instanceof HTMLElement)) {
      return
    }

    const nextAnchorX = board.offsetLeft + board.offsetWidth / 2
    setTargetFallbackDialogAnchorX((current) =>
      current === nextAnchorX ? current : nextAnchorX,
    )
  }, [
    isMobileRecorder,
    size.height,
    size.width,
    targetFallbackDialog,
    windowHeight,
    windowWidth,
  ])

  const allTargetLegend = useMemo(
    () =>
      RECORDER_TARGET_INDICES.map((targetIndex) => {
        const label = getRecorderTargetLabel(targetIndex)
        const position = getRecorderTargetGridPosition(targetIndex)
        return {
          targetIndex,
          label,
          gridColumn: position.column,
          gridRow: position.row,
        }
      }),
    [],
  )
  const visualSelectedTargetIndex =
    targetSwitchPreviewIndex ?? selectedTargetIndex
  const rotatedAllTargetLegend = useMemo(() => {
    const rotation = getRecorderTargetRotation(visualSelectedTargetIndex)

    return allTargetLegend.map((target) => {
      const position = getRotatedRecorderTargetGridPosition(
        target.targetIndex,
        rotation,
      )

      return {
        ...target,
        gridColumn: position.column,
        gridRow: position.row,
      }
    })
  }, [allTargetLegend, visualSelectedTargetIndex])

  const handleSelectTarget = useCallback(
    (targetIndex: number) => {
      if (targetFallbackDialog !== null) {
        if (
          targetIndex === targetFallbackDialog.targetIndex ||
          !targetFallbackOptions.includes(targetIndex)
        ) {
          return
        }

        setTargetFallbackDialog({
          ...targetFallbackDialog,
          fallbackTargetIndex: targetIndex,
        })
        return
      }

      cancelTargetSwitchAnimation()

      const currentTargetIndex = targetSwitchPreviewIndex ?? selectedTargetIndex
      const path = getRecorderTargetSwitchPath(
        currentTargetIndex,
        targetIndex,
        activeTargetIndicesForCurrentRound,
      )
      if (path.length === 0) {
        setSelectedTargetIndex(targetIndex)
        setTargetSwitchPreviewIndex(null)
        return
      }

      targetSwitchPendingTargetRef.current = targetIndex
      setTargetSwitchPreviewIndex(currentTargetIndex)
      const sequence = targetSwitchSequenceRef.current
      let pathIndex = 0

      const runNextStep = () => {
        if (sequence !== targetSwitchSequenceRef.current) {
          return
        }

        if (pathIndex < path.length) {
          setTargetSwitchPreviewIndex(path[pathIndex])
          pathIndex += 1
          targetSwitchTimerRef.current = window.setTimeout(
            runNextStep,
            TARGET_SWITCH_STEP_DURATION,
          )
          return
        }

        setSelectedTargetIndex(targetIndex)
        setTargetSwitchPreviewIndex(null)
        targetSwitchPendingTargetRef.current = null
        targetSwitchTimerRef.current = null
      }

      targetSwitchTimerRef.current = window.setTimeout(
        runNextStep,
        TARGET_SWITCH_STEP_DURATION,
      )
    },
    [
      activeTargetIndicesForCurrentRound,
      cancelTargetSwitchAnimation,
      selectedTargetIndex,
      targetFallbackDialog,
      targetFallbackOptions,
      targetSwitchPreviewIndex,
    ],
  )

  const handleAppendToken = useCallback(
    (token: string) => {
      const targetIndex = isRecorderAttackToken(token)
        ? getNearestRecorderTargetIndex(
            targetSwitchPendingTargetRef.current ?? selectedTargetIndex,
            activeTargetIndicesForCurrentRound,
          )
        : undefined
      const next = appendRecorderToken(
        roundActions,
        currentRound,
        token,
        targetIndex,
      )
      onChange(
        rebuildRecorderTargetSwitches(
          next,
          availableTargetIndices,
          initialMain,
        ),
      )
    },
    [
      activeTargetIndicesForCurrentRound,
      availableTargetIndices,
      currentRound,
      initialMain,
      onChange,
      roundActions,
      selectedTargetIndex,
    ],
  )

  const handleEnemyCountChange = useCallback(
    (count: number) => {
      cancelTargetSwitchAnimation()
      setTargetSwitchPreviewIndex(null)
      const nextTargetIndices = getInitialRecorderTargetIndices(count)
      const fallbackMain = nextTargetIndices.includes(initialMain)
        ? initialMain
        : (nextTargetIndices[0] ?? initialMain)
      setEnemyCount(count)
      setInitialMain(fallbackMain)
      setAvailableTargetIndices(nextTargetIndices)
      setSelectedTargetIndex(fallbackMain)
      onChange(
        rebuildRecorderTargetSwitches(
          roundActions,
          nextTargetIndices,
          fallbackMain,
        ),
        {
          initialEnemies: nextTargetIndices,
          ...(fallbackMain === initialMain
            ? {}
            : { initialMain: fallbackMain }),
        },
      )
    },
    [cancelTargetSwitchAnimation, initialMain, onChange, roundActions],
  )

  const handleAddTarget = useCallback(
    (targetIndex: number) => {
      if (targetFallbackDialog !== null) {
        return
      }

      if (activeTargetIndicesForCurrentRound.includes(targetIndex)) {
        return
      }

      cancelTargetSwitchAnimation()
      setTargetSwitchPreviewIndex(null)
      const anchor = getRecorderTargetEventAnchor(roundActions, currentRound)
      if (anchor) {
        const entry = roundActions[String(anchor.round)]?.[anchor.index]
        const spawnedTargetIndices = getRecorderSpawnedTargetIndices(
          entry?.slice(1) ?? [],
        )
        const next = setRecorderTokenSpawnedTargets(
          roundActions,
          anchor.round,
          anchor.index,
          [
            ...spawnedTargetIndices.filter(
              (spawnedTargetIndex) => spawnedTargetIndex !== targetIndex,
            ),
            targetIndex,
          ],
        )
        onChange(
          rebuildRecorderTargetSwitches(
            next,
            availableTargetIndices,
            initialMain,
          ),
        )
        return
      }

      const nextTargetIndices = [...availableTargetIndices, targetIndex].sort(
        (a, b) => a - b,
      )
      setAvailableTargetIndices(nextTargetIndices)
      setEnemyCount(nextTargetIndices.length)
      onChange(
        rebuildRecorderTargetSwitches(
          roundActions,
          nextTargetIndices,
          initialMain,
        ),
        { initialEnemies: nextTargetIndices },
      )
    },
    [
      activeTargetIndicesForCurrentRound,
      availableTargetIndices,
      cancelTargetSwitchAnimation,
      currentRound,
      initialMain,
      onChange,
      roundActions,
      targetFallbackDialog,
    ],
  )

  const removeRecorderTarget = useCallback(
    (targetIndex: number, fallbackTargetIndex?: number) => {
      if (!activeTargetIndicesForCurrentRound.includes(targetIndex)) {
        return
      }

      cancelTargetSwitchAnimation()
      setTargetSwitchPreviewIndex(null)
      const anchor = getRecorderTargetEventAnchor(roundActions, currentRound)
      if (anchor) {
        const entry = roundActions[String(anchor.round)]?.[anchor.index]
        const deadTargetIndices = getRecorderDeadTargetIndices(
          entry?.slice(1) ?? [],
        )
        const next = setRecorderTokenDeadTargets(
          roundActions,
          anchor.round,
          anchor.index,
          [
            ...deadTargetIndices.filter(
              (deadTargetIndex) => deadTargetIndex !== targetIndex,
            ),
            targetIndex,
          ],
        )
        const nextWithFallback =
          fallbackTargetIndex === undefined
            ? next
            : setRecorderTokenDeadTargetFallback(
                next,
                anchor.round,
                anchor.index,
                targetIndex,
                fallbackTargetIndex,
              )
        onChange(
          rebuildRecorderTargetSwitches(
            nextWithFallback,
            availableTargetIndices,
            initialMain,
          ),
        )
        if (fallbackTargetIndex !== undefined) {
          setSelectedTargetIndex(fallbackTargetIndex)
        }
        return
      }

      const nextTargetIndices = availableTargetIndices.filter(
        (currentTargetIndex) => currentTargetIndex !== targetIndex,
      )
      if (nextTargetIndices.length === 0) {
        return
      }

      setAvailableTargetIndices(nextTargetIndices)
      setEnemyCount(nextTargetIndices.length)
      const metaPatch: RecorderMetaPatch = {
        initialEnemies: nextTargetIndices,
      }
      if (
        fallbackTargetIndex !== undefined &&
        nextTargetIndices.includes(fallbackTargetIndex)
      ) {
        setSelectedTargetIndex(fallbackTargetIndex)
        setInitialMain(fallbackTargetIndex)
        metaPatch.initialMain = fallbackTargetIndex
      } else if (selectedTargetIndex === targetIndex) {
        setSelectedTargetIndex(
          getNearestRecorderTargetIndex(targetIndex, nextTargetIndices),
        )
      }
      onChange(
        rebuildRecorderTargetSwitches(
          roundActions,
          nextTargetIndices,
          initialMain,
        ),
        metaPatch,
      )
    },
    [
      activeTargetIndicesForCurrentRound,
      availableTargetIndices,
      cancelTargetSwitchAnimation,
      currentRound,
      initialMain,
      onChange,
      roundActions,
      selectedTargetIndex,
    ],
  )

  const handleRemoveTarget = useCallback(
    (targetIndex: number) => {
      cancelTargetSwitchAnimation()

      const fallbackTargetOptions = activeTargetIndicesForCurrentRound.filter(
        (currentTargetIndex) => currentTargetIndex !== targetIndex,
      )

      if (
        targetIndex === currentMainTargetIndexForCurrentRound &&
        fallbackTargetOptions.length > 0
      ) {
        setTargetSwitchPreviewIndex(null)
        setTargetFallbackDialog({
          kind: 'remove',
          targetIndex,
          fallbackTargetIndex: null,
        })
        return
      }

      removeRecorderTarget(targetIndex)
    },
    [
      activeTargetIndicesForCurrentRound,
      cancelTargetSwitchAnimation,
      currentMainTargetIndexForCurrentRound,
      removeRecorderTarget,
    ],
  )

  const closeTargetFallbackDialog = useCallback(() => {
    setTargetFallbackDialog(null)
  }, [])

  const handleConfirmTargetFallback = useCallback(() => {
    if (
      targetFallbackDialog === null ||
      targetFallbackDialog.fallbackTargetIndex === null
    ) {
      return
    }

    const { fallbackTargetIndex, targetIndex } = targetFallbackDialog
    if (targetFallbackDialog.kind === 'death') {
      const entry =
        roundActions[String(targetFallbackDialog.round)]?.[
          targetFallbackDialog.index
        ]
      const deadTargetIndices = getRecorderDeadTargetIndices(
        entry?.slice(1) ?? [],
      )
      const base =
        targetFallbackDialog.removeSpawnTargetIndex === undefined
          ? roundActions
          : setRecorderTokenSpawnedTargets(
              roundActions,
              targetFallbackDialog.round,
              targetFallbackDialog.index,
              getRecorderSpawnedTargetIndices(entry?.slice(1) ?? []).filter(
                (spawnedTargetIndex) =>
                  spawnedTargetIndex !==
                  targetFallbackDialog.removeSpawnTargetIndex,
              ),
            )
      const nextDeadTargetIndices = Array.from(
        new Set([
          ...deadTargetIndices.filter(
            (deadTargetIndex) =>
              deadTargetIndex !== targetFallbackDialog.replaceDeadTargetIndex,
          ),
          targetIndex,
        ]),
      ).sort((a, b) => a - b)
      const next = setRecorderTokenDeadTargetFallback(
        setRecorderTokenDeadTargets(
          base,
          targetFallbackDialog.round,
          targetFallbackDialog.index,
          nextDeadTargetIndices,
        ),
        targetFallbackDialog.round,
        targetFallbackDialog.index,
        targetIndex,
        fallbackTargetIndex,
      )
      closeTargetFallbackDialog()
      onChange(
        rebuildRecorderTargetSwitches(
          next,
          availableTargetIndices,
          initialMain,
        ),
      )
      return
    }

    closeTargetFallbackDialog()
    removeRecorderTarget(targetIndex, fallbackTargetIndex)
  }, [
    availableTargetIndices,
    closeTargetFallbackDialog,
    initialMain,
    onChange,
    removeRecorderTarget,
    roundActions,
    targetFallbackDialog,
  ])

  const handlePreviousRound = useCallback(() => {
    setCurrentRound((current) => Math.max(1, current - 1))
  }, [])

  const handleNextRound = useCallback(() => {
    const next = currentRound + 1
    pendingScrollRoundRef.current = next
    setCurrentRound(next)
  }, [currentRound])

  const handleJumpToRound = useCallback((round: number) => {
    pendingScrollRoundRef.current = round
    setCurrentRound(round)
    setOpenRoundMenu(null)
  }, [])

  const handleCopyRound = useCallback(
    (round: number) => {
      const nextRound = round + 1
      onChange(
        rebuildRecorderTargetSwitches(
          copyRoundInRecorder(roundActions, round),
          availableTargetIndices,
          initialMain,
        ),
      )
      setCurrentRound(nextRound)
      pendingScrollRoundRef.current = nextRound
      setOpenRoundMenu(null)
      AppToaster.show({
        message: `已将第 ${round} 回合复制到第 ${nextRound} 回合`,
        intent: 'success',
      })
    },
    [availableTargetIndices, initialMain, onChange, roundActions],
  )

  const handleCopySpecificRound = useCallback(
    (targetRound: number, sourceRoundValue = copySourceRoundInput) => {
      const sourceRound = Number(sourceRoundValue)
      if (
        !Number.isInteger(sourceRound) ||
        sourceRound < 1 ||
        sourceRound > 49
      ) {
        AppToaster.show({
          message: '请输入 1-49 之间的回合数',
          intent: 'warning',
        })
        return
      }
      if (
        !Object.prototype.hasOwnProperty.call(roundActions, String(sourceRound))
      ) {
        AppToaster.show({
          message: `第 ${sourceRound} 回合暂无动作`,
          intent: 'warning',
        })
        return
      }

      const nextRound = targetRound + 1
      onChange(
        rebuildRecorderTargetSwitches(
          copyRoundInRecorder(roundActions, sourceRound, targetRound),
          availableTargetIndices,
          initialMain,
        ),
      )
      setCurrentRound(nextRound)
      pendingScrollRoundRef.current = nextRound
      setOpenRoundMenu(null)
      AppToaster.show({
        message: `已将第 ${sourceRound} 回合复制到第 ${nextRound} 回合`,
        intent: 'success',
      })
    },
    [
      availableTargetIndices,
      copySourceRoundInput,
      initialMain,
      onChange,
      roundActions,
    ],
  )

  const handleDeleteRound = useCallback(
    (round: number) => {
      const next = rebuildRecorderTargetSwitches(
        removeRoundInRecorder(roundActions, round),
        availableTargetIndices,
        initialMain,
      )
      const remainingMax = Math.max(1, ...getRecorderRoundNumbers(next))
      onChange(next)
      setCurrentRound((currentRound) =>
        Math.max(1, Math.min(currentRound, remainingMax, round)),
      )
      setOpenRoundMenu(null)
      AppToaster.show({
        message: `已删除第 ${round} 回合`,
        intent: 'success',
      })
    },
    [availableTargetIndices, initialMain, onChange, roundActions],
  )

  const handleRemoveToken = useCallback(
    (round: number, index: number) => {
      onChange(
        rebuildRecorderTargetSwitches(
          removeRecorderToken(roundActions, round, index),
          availableTargetIndices,
          initialMain,
        ),
      )
    },
    [availableTargetIndices, initialMain, onChange, roundActions],
  )

  const handleConvertToken = useCallback(
    (
      round: number,
      index: number,
      slot: number,
      kind: RecorderConvertibleTone,
    ) => {
      const key = String(round)
      const entry = roundActions[key]?.[index]
      if (!entry) {
        return
      }

      const token = `${slot}${RECORDER_ACTION_SYMBOL[kind]}`
      if (entry[0] === token) {
        return
      }

      const next = cloneRoundActions(roundActions)
      next[key][index] = [token, ...entry.slice(1)]
      onChange(next)
    },
    [onChange, roundActions],
  )

  const handleSetTokenTarget = useCallback(
    (round: number, index: number, targetIndex?: number) => {
      if (targetIndex !== undefined) {
        const activeTargetIndices = getRecorderActiveTargetIndices(
          roundActions,
          availableTargetIndices,
          initialMain,
          {
            throughRound: round,
            beforeActionIndex: index,
          },
        )
        if (!activeTargetIndices.includes(targetIndex)) {
          return
        }
      }

      onChange(
        rebuildRecorderTargetSwitches(
          setRecorderTokenTarget(roundActions, round, index, targetIndex),
          availableTargetIndices,
          initialMain,
        ),
      )
    },
    [availableTargetIndices, initialMain, onChange, roundActions],
  )

  const openRecorderDeathFallbackDialog = useCallback(
    (
      round: number,
      index: number,
      targetIndex: number,
      options: {
        replaceDeadTargetIndex?: number
        removeSpawnTargetIndex?: number
      } = {},
    ) => {
      const entry = roundActions[String(round)]?.[index]
      const actionTargetIndex = entry
        ?.slice(1)
        .map((value) => parseRecorderTargetMetadata(value))
        .find((value) => value !== undefined)

      if (actionTargetIndex !== targetIndex) {
        return false
      }

      const activeBeforeAction = getRecorderActiveTargetIndices(
        roundActions,
        availableTargetIndices,
        initialMain,
        {
          throughRound: round,
          beforeActionIndex: index,
        },
      )
      const deadSet = new Set(
        getRecorderDeadTargetIndices(entry?.slice(1) ?? []),
      )
      if (options.replaceDeadTargetIndex !== undefined) {
        deadSet.delete(options.replaceDeadTargetIndex)
      }
      deadSet.add(targetIndex)
      const fallbackTargetOptions = activeBeforeAction.filter(
        (candidate) => !deadSet.has(candidate),
      )

      if (fallbackTargetOptions.length === 0) {
        return false
      }

      cancelTargetSwitchAnimation()
      setTargetSwitchPreviewIndex(null)
      setTargetFallbackDialog({
        kind: 'death',
        targetIndex,
        fallbackTargetIndex: null,
        round,
        index,
        ...options,
      })
      return true
    },
    [
      availableTargetIndices,
      cancelTargetSwitchAnimation,
      initialMain,
      roundActions,
    ],
  )

  const handleToggleTokenDeath = useCallback(
    (round: number, index: number, targetIndex: number) => {
      const entry = roundActions[String(round)]?.[index]
      const deadTargetIndices = getRecorderDeadTargetIndices(
        entry?.slice(1) ?? [],
      )
      const isMarked = deadTargetIndices.includes(targetIndex)

      if (
        !isMarked &&
        openRecorderDeathFallbackDialog(round, index, targetIndex)
      ) {
        return
      }

      const nextDeadTargetIndices = isMarked
        ? deadTargetIndices.filter(
            (deadTargetIndex) => deadTargetIndex !== targetIndex,
          )
        : [...deadTargetIndices, targetIndex]

      onChange(
        rebuildRecorderTargetSwitches(
          setRecorderTokenDeadTargets(
            roundActions,
            round,
            index,
            nextDeadTargetIndices,
          ),
          availableTargetIndices,
          initialMain,
        ),
      )
    },
    [
      availableTargetIndices,
      initialMain,
      onChange,
      openRecorderDeathFallbackDialog,
      roundActions,
    ],
  )

  const handleToggleTokenSpawn = useCallback(
    (round: number, index: number, targetIndex: number) => {
      const entry = roundActions[String(round)]?.[index]
      const spawnedTargetIndices = getRecorderSpawnedTargetIndices(
        entry?.slice(1) ?? [],
      )
      const isMarked = spawnedTargetIndices.includes(targetIndex)
      const nextSpawnedTargetIndices = isMarked
        ? spawnedTargetIndices.filter(
            (spawnedTargetIndex) => spawnedTargetIndex !== targetIndex,
          )
        : [...spawnedTargetIndices, targetIndex]

      onChange(
        rebuildRecorderTargetSwitches(
          setRecorderTokenSpawnedTargets(
            roundActions,
            round,
            index,
            nextSpawnedTargetIndices,
          ),
          availableTargetIndices,
          initialMain,
        ),
      )
    },
    [availableTargetIndices, initialMain, onChange, roundActions],
  )

  const handleChangeTokenDeathTarget = useCallback(
    (
      round: number,
      index: number,
      fromTargetIndex: number,
      toTargetIndex: number,
    ) => {
      if (fromTargetIndex === toTargetIndex) {
        return
      }

      const entry = roundActions[String(round)]?.[index]
      const deadTargetIndices = getRecorderDeadTargetIndices(
        entry?.slice(1) ?? [],
      )
      if (!deadTargetIndices.includes(fromTargetIndex)) {
        return
      }

      if (
        openRecorderDeathFallbackDialog(round, index, toTargetIndex, {
          replaceDeadTargetIndex: fromTargetIndex,
        })
      ) {
        return
      }

      onChange(
        rebuildRecorderTargetSwitches(
          setRecorderTokenDeadTargets(roundActions, round, index, [
            ...deadTargetIndices.filter(
              (deadTargetIndex) => deadTargetIndex !== fromTargetIndex,
            ),
            toTargetIndex,
          ]),
          availableTargetIndices,
          initialMain,
        ),
      )
    },
    [
      availableTargetIndices,
      initialMain,
      onChange,
      openRecorderDeathFallbackDialog,
      roundActions,
    ],
  )

  const handleChangeTokenSpawnTarget = useCallback(
    (
      round: number,
      index: number,
      fromTargetIndex: number,
      toTargetIndex: number,
    ) => {
      if (fromTargetIndex === toTargetIndex) {
        return
      }

      const entry = roundActions[String(round)]?.[index]
      const spawnedTargetIndices = getRecorderSpawnedTargetIndices(
        entry?.slice(1) ?? [],
      )
      if (!spawnedTargetIndices.includes(fromTargetIndex)) {
        return
      }

      onChange(
        rebuildRecorderTargetSwitches(
          setRecorderTokenSpawnedTargets(roundActions, round, index, [
            ...spawnedTargetIndices.filter(
              (spawnedTargetIndex) => spawnedTargetIndex !== fromTargetIndex,
            ),
            toTargetIndex,
          ]),
          availableTargetIndices,
          initialMain,
        ),
      )
    },
    [availableTargetIndices, initialMain, onChange, roundActions],
  )

  const handleChangeTokenMarkerType = useCallback(
    (
      round: number,
      index: number,
      targetIndex: number,
      nextType: 'dead' | 'spawn',
    ) => {
      const entry = roundActions[String(round)]?.[index]
      const metadata = entry?.slice(1) ?? []
      const deadTargetIndices = getRecorderDeadTargetIndices(metadata)
      const spawnedTargetIndices = getRecorderSpawnedTargetIndices(metadata)
      const isChangingFromDead =
        nextType === 'spawn' && deadTargetIndices.includes(targetIndex)
      const isChangingFromSpawn =
        nextType === 'dead' && spawnedTargetIndices.includes(targetIndex)

      if (!isChangingFromDead && !isChangingFromSpawn) {
        return
      }

      if (
        isChangingFromSpawn &&
        openRecorderDeathFallbackDialog(round, index, targetIndex, {
          removeSpawnTargetIndex: targetIndex,
        })
      ) {
        return
      }

      const nextDeadTargetIndices =
        nextType === 'dead'
          ? [
              ...deadTargetIndices.filter(
                (deadTargetIndex) => deadTargetIndex !== targetIndex,
              ),
              targetIndex,
            ]
          : deadTargetIndices.filter(
              (deadTargetIndex) => deadTargetIndex !== targetIndex,
            )
      const nextSpawnedTargetIndices =
        nextType === 'spawn'
          ? [
              ...spawnedTargetIndices.filter(
                (spawnedTargetIndex) => spawnedTargetIndex !== targetIndex,
              ),
              targetIndex,
            ]
          : spawnedTargetIndices.filter(
              (spawnedTargetIndex) => spawnedTargetIndex !== targetIndex,
            )

      const next = setRecorderTokenSpawnedTargets(
        setRecorderTokenDeadTargets(
          roundActions,
          round,
          index,
          nextDeadTargetIndices,
        ),
        round,
        index,
        nextSpawnedTargetIndices,
      )

      onChange(
        rebuildRecorderTargetSwitches(
          next,
          availableTargetIndices,
          initialMain,
        ),
      )
    },
    [
      availableTargetIndices,
      initialMain,
      onChange,
      openRecorderDeathFallbackDialog,
      roundActions,
    ],
  )

  const handleHide = useCallback(() => {
    setVisible(false)
    closeTargetFallbackDialog()
  }, [closeTargetFallbackDialog])

  if (!visible) {
    return createPortal(
      <Button
        className="!fixed right-4 bottom-4 z-50 shadow-lg"
        icon="annotation"
        intent="primary"
        onClick={() => setVisible(true)}
      >
        快速编辑
      </Button>,
      document.body,
    )
  }

  const renderActionToken = (item: RecorderRoundItem, round: number) => {
    const isExtra = item.display.area === 'extra'
    const itemLabel = formatRecorderRoundItem(item)
    const usesTrimmedGlyphBox = !isExtra && itemLabel.endsWith('A')
    const targetIndex = item.targetIndex
    const normalizedTargetIndex =
      targetIndex === undefined
        ? undefined
        : clamp(targetIndex, 1, RECORDER_TARGET_INDICES.length)
    const targetLabel =
      normalizedTargetIndex === undefined
        ? undefined
        : getRecorderTargetLabel(normalizedTargetIndex)
    const targetToneClass =
      normalizedTargetIndex === undefined || targetLabel === '0'
        ? undefined
        : TARGET_POSITION_TONE_CLASS[targetLabel]
    const activeTargetIndicesBeforeAction = getRecorderActiveTargetIndices(
      roundActions,
      availableTargetIndices,
      initialMain,
      {
        throughRound: round,
        beforeActionIndex: item.index,
      },
    )
    const actionTargetLegend = allTargetLegend.filter(
      ({ targetIndex: choiceIndex }) =>
        activeTargetIndicesBeforeAction.includes(choiceIndex),
    )
    if (item.automaticTargetSwitch) {
      return (
        <span
          key={`${round}-${item.index}-${item.token}`}
          className="inline-flex min-h-3 items-center rounded-sm px-1 text-[10px] font-normal leading-3 text-[var(--maayuan-text,#7c3aed)] opacity-55 dark:text-slate-400"
          title="根据相邻动作的目标自动生成，不需要单独编辑"
        >
          {formatRecorderRoundItem(item)}
        </span>
      )
    }
    const slot = item.display.area === 'slot' ? item.display.slot : undefined
    const slotName =
      slot === undefined ? undefined : slotAssignments?.[slot]?.name?.trim()
    const actionButtons = (
      <>
        <Button
          small
          minimal
          disabled={slot === undefined}
          className={clsx(
            Classes.POPOVER_DISMISS,
            '!h-6 !min-h-6 !w-6 !min-w-6 !p-0 !text-sm !font-semibold',
          )}
          title={slot === undefined ? '额外动作不能转换' : '改为放大'}
          onClick={
            slot === undefined
              ? undefined
              : () => handleConvertToken(round, item.index, slot, 'ultimate')
          }
        >
          {`↑`}
        </Button>
        <Button
          small
          minimal
          disabled={slot === undefined}
          className={clsx(
            Classes.POPOVER_DISMISS,
            '!h-6 !min-h-6 !w-6 !min-w-6 !p-0 !text-sm !font-semibold',
          )}
          title={slot === undefined ? '额外动作不能转换' : '改为平A'}
          onClick={
            slot === undefined
              ? undefined
              : () => handleConvertToken(round, item.index, slot, 'normal')
          }
        >
          A
        </Button>
        <Button
          small
          minimal
          disabled={slot === undefined}
          className={clsx(
            Classes.POPOVER_DISMISS,
            '!h-6 !min-h-6 !w-6 !min-w-6 !p-0 !text-sm !font-semibold',
          )}
          title={slot === undefined ? '额外动作不能转换' : '改为下拉'}
          onClick={
            slot === undefined
              ? undefined
              : () => handleConvertToken(round, item.index, slot, 'defense')
          }
        >
          {`↓`}
        </Button>
      </>
    )
    return (
      <span
        key={`${round}-${item.index}-${item.token}`}
        className="inline-flex min-w-0 max-w-full flex-wrap items-center justify-center gap-x-0 gap-y-0"
      >
        <Popover2
          minimal
          placement="top"
          portalClassName="z-[1600]"
          popoverClassName="[&>.bp4-popover2-content]:!p-0 overflow-hidden"
          targetProps={{ className: '!inline-flex items-center' }}
          content={
            <div className="p-0.5">
              <div className="flex items-center justify-center gap-0.5">
                {actionButtons}
                <Button
                  small
                  minimal
                  intent="danger"
                  className={clsx(
                    Classes.POPOVER_DISMISS,
                    '!h-6 !min-h-6 !w-6 !min-w-6 !p-0 !text-sm !font-semibold',
                  )}
                  title="删除动作"
                  onClick={() => handleRemoveToken(round, item.index)}
                >
                  删
                </Button>
              </div>
              {slot !== undefined ? (
                <>
                  <div className="mt-0.5 flex items-center gap-1 border-t border-slate-200 px-0.5 pt-1 dark:border-slate-700">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      目标
                    </span>
                    {actionTargetLegend.map(
                      ({ targetIndex: choiceIndex, label }) => {
                        const isNeutralTarget = label === '0'
                        return (
                          <button
                            key={choiceIndex}
                            type="button"
                            title={`将此动作标记为${label}`}
                            aria-pressed={normalizedTargetIndex === choiceIndex}
                            className={clsx(
                              'inline-flex h-5 min-w-7 items-center justify-center rounded-sm border px-1 text-[10px] font-semibold transition',
                              isNeutralTarget
                                ? TARGET_POSITION_NEUTRAL_CLASS
                                : TARGET_POSITION_TONE_CLASS[label],
                              normalizedTargetIndex === choiceIndex &&
                                'ring-1 ring-slate-700 dark:ring-slate-100',
                            )}
                            onClick={() =>
                              handleSetTokenTarget(
                                round,
                                item.index,
                                choiceIndex,
                              )
                            }
                          >
                            {label}
                          </button>
                        )
                      },
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5 border-t border-slate-200 px-0.5 pt-1 dark:border-slate-700">
                    <div className="flex items-center gap-1">
                      <span className="w-8 shrink-0 text-[10px] text-slate-500 dark:text-slate-400">
                        行动后
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        死亡
                      </span>
                      {allTargetLegend.map(
                        ({ targetIndex: choiceIndex, label }) => {
                          const marked =
                            item.deadTargetIndices.includes(choiceIndex)
                          return (
                            <button
                              key={choiceIndex}
                              type="button"
                              title={`${label} 号位在此动作后死亡`}
                              aria-pressed={marked}
                              className={clsx(
                                Classes.POPOVER_DISMISS,
                                'inline-flex h-5 min-w-7 items-center justify-center rounded-sm border px-1 text-[10px] font-semibold transition',
                                marked
                                  ? 'border-rose-400 bg-rose-100 text-rose-700 dark:border-rose-500 dark:bg-rose-500/20 dark:text-rose-200'
                                  : 'border-slate-300 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-200',
                              )}
                              onClick={() =>
                                handleToggleTokenDeath(
                                  round,
                                  item.index,
                                  choiceIndex,
                                )
                              }
                            >
                              死{label}
                            </button>
                          )
                        },
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-8 shrink-0" />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        出现
                      </span>
                      {allTargetLegend.map(
                        ({ targetIndex: choiceIndex, label }) => {
                          const marked =
                            item.spawnedTargetIndices.includes(choiceIndex)
                          return (
                            <button
                              key={choiceIndex}
                              type="button"
                              title={`${label} 号位在此动作后出现`}
                              aria-pressed={marked}
                              className={clsx(
                                'inline-flex h-5 min-w-7 items-center justify-center rounded-sm border px-1 text-[10px] font-semibold transition',
                                marked
                                  ? 'border-cyan-400 bg-cyan-100 text-cyan-700 dark:border-cyan-500 dark:bg-cyan-500/20 dark:text-cyan-200'
                                  : 'border-slate-300 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-500 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-200',
                              )}
                              onClick={() =>
                                handleToggleTokenSpawn(
                                  round,
                                  item.index,
                                  choiceIndex,
                                )
                              }
                            >
                              加{label}
                            </button>
                          )
                        },
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          }
        >
          <button
            type="button"
            className={clsx(
              'inline-flex items-center justify-center rounded-sm border-0 px-1 leading-none transition',
              targetToneClass,
              isExtra
                ? 'h-4 text-[10px] font-normal text-stone-500 hover:bg-black/5 dark:text-stone-400 dark:hover:bg-white/10'
                : 'h-[18px] text-[13px] font-semibold text-stone-700 dark:text-stone-100',
            )}
            title={`第 ${round} 回合第 ${item.order} 个动作：${formatRecorderRoundItem(
              item,
            )}${slotName ? `（${slotName}）` : ''}${
              targetLabel && targetIndex
                ? `（目标：${targetLabel} / ${normalizedTargetIndex}号位）`
                : ''
            }（点击编辑、删除动作）`}
          >
            <span
              className={clsx(
                'block',
                !isExtra &&
                  (usesTrimmedGlyphBox
                    ? '[text-box-trim:trim-both] [text-box-edge:cap_alphabetic]'
                    : 'relative -top-px'),
              )}
            >
              {itemLabel}
            </span>
          </button>
        </Popover2>
        {showEnemyEvents ? (
          <>
            {item.deadTargetIndices.map((deadTargetIndex) => {
              const deadTargetLabel = getRecorderTargetLabel(deadTargetIndex)
              return (
                <Popover2
                  key={deadTargetIndex}
                  minimal
                  placement="top"
                  portalClassName="z-[1600]"
                  popoverClassName="[&>.bp4-popover2-content]:!p-0 overflow-hidden"
                  content={
                    <div className="flex items-center gap-0.5 p-0.5">
                      <span className="px-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-200">
                        死亡
                      </span>
                      {allTargetLegend.map(
                        ({ targetIndex: choiceIndex, label }) => {
                          const selected = choiceIndex === deadTargetIndex
                          return (
                            <button
                              key={choiceIndex}
                              type="button"
                              title={`改为${label}号位死亡`}
                              aria-pressed={selected}
                              className={clsx(
                                Classes.POPOVER_DISMISS,
                                'inline-flex h-6 min-w-7 items-center justify-center rounded-sm border px-1 text-[10px] font-semibold transition',
                                selected
                                  ? 'border-rose-400 bg-rose-100 text-rose-700 dark:border-rose-500 dark:bg-rose-500/25 dark:text-rose-100'
                                  : 'border-slate-300 bg-white text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-rose-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-200',
                              )}
                              onClick={() =>
                                handleChangeTokenDeathTarget(
                                  round,
                                  item.index,
                                  deadTargetIndex,
                                  choiceIndex,
                                )
                              }
                            >
                              死{label}
                            </button>
                          )
                        },
                      )}
                      <button
                        type="button"
                        title="改为出现标记"
                        className={clsx(
                          Classes.POPOVER_DISMISS,
                          'inline-flex h-6 min-w-10 items-center justify-center rounded-sm border border-cyan-300 bg-cyan-50 px-1 text-[10px] font-semibold text-cyan-700 transition hover:border-cyan-400 hover:bg-cyan-100 dark:border-cyan-500/70 dark:bg-cyan-500/15 dark:text-cyan-200 dark:hover:border-cyan-400 dark:hover:bg-cyan-500/25',
                        )}
                        onClick={() =>
                          handleChangeTokenMarkerType(
                            round,
                            item.index,
                            deadTargetIndex,
                            'spawn',
                          )
                        }
                      >
                        改出现
                      </button>
                      <Button
                        small
                        minimal
                        intent="danger"
                        className={clsx(
                          Classes.POPOVER_DISMISS,
                          '!h-6 !min-h-6 !w-7 !min-w-7 !p-0 !text-[10px] !font-semibold',
                        )}
                        title="删除死亡标记"
                        onClick={() =>
                          handleToggleTokenDeath(
                            round,
                            item.index,
                            deadTargetIndex,
                          )
                        }
                      >
                        删
                      </Button>
                    </div>
                  }
                >
                  <button
                    type="button"
                    className="ml-0.5 inline-flex h-4 max-w-full shrink-0 cursor-pointer items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-sm border border-rose-300 bg-rose-50 px-1 text-[9px] font-semibold leading-none text-rose-700 transition hover:border-rose-500 hover:bg-rose-100 dark:border-rose-500/60 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:border-rose-400 dark:hover:bg-rose-500/25"
                    title={`第 ${round} 回合第 ${item.order} 个动作后，${deadTargetLabel} 号位死亡；点击编辑`}
                    aria-label={`编辑第 ${round} 回合第 ${item.order} 个动作后的 ${deadTargetLabel} 号位死亡标记`}
                  >
                    {deadTargetLabel}死亡
                  </button>
                </Popover2>
              )
            })}
            {item.spawnedTargetIndices.map((spawnedTargetIndex) => {
              const spawnedTargetLabel =
                getRecorderTargetLabel(spawnedTargetIndex)
              return (
                <Popover2
                  key={spawnedTargetIndex}
                  minimal
                  placement="top"
                  portalClassName="z-[1600]"
                  popoverClassName="[&>.bp4-popover2-content]:!p-0 overflow-hidden"
                  content={
                    <div className="flex items-center gap-0.5 p-0.5">
                      <span className="px-0.5 text-[10px] font-medium text-cyan-700 dark:text-cyan-200">
                        出现
                      </span>
                      {allTargetLegend.map(
                        ({ targetIndex: choiceIndex, label }) => {
                          const selected = choiceIndex === spawnedTargetIndex
                          return (
                            <button
                              key={choiceIndex}
                              type="button"
                              title={`改为${label}号位出现`}
                              aria-pressed={selected}
                              className={clsx(
                                Classes.POPOVER_DISMISS,
                                'inline-flex h-6 min-w-7 items-center justify-center rounded-sm border px-1 text-[10px] font-semibold transition',
                                selected
                                  ? 'border-cyan-400 bg-cyan-100 text-cyan-700 dark:border-cyan-500 dark:bg-cyan-500/25 dark:text-cyan-100'
                                  : 'border-slate-300 bg-white text-slate-600 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-500 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-200',
                              )}
                              onClick={() =>
                                handleChangeTokenSpawnTarget(
                                  round,
                                  item.index,
                                  spawnedTargetIndex,
                                  choiceIndex,
                                )
                              }
                            >
                              加{label}
                            </button>
                          )
                        },
                      )}
                      <button
                        type="button"
                        title="改为死亡标记"
                        className={clsx(
                          Classes.POPOVER_DISMISS,
                          'inline-flex h-6 min-w-10 items-center justify-center rounded-sm border border-rose-300 bg-rose-50 px-1 text-[10px] font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 dark:border-rose-500/70 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:border-rose-400 dark:hover:bg-rose-500/25',
                        )}
                        onClick={() =>
                          handleChangeTokenMarkerType(
                            round,
                            item.index,
                            spawnedTargetIndex,
                            'dead',
                          )
                        }
                      >
                        改死亡
                      </button>
                      <Button
                        small
                        minimal
                        intent="danger"
                        className={clsx(
                          Classes.POPOVER_DISMISS,
                          '!h-6 !min-h-6 !w-7 !min-w-7 !p-0 !text-[10px] !font-semibold',
                        )}
                        title="删除出现标记"
                        onClick={() =>
                          handleToggleTokenSpawn(
                            round,
                            item.index,
                            spawnedTargetIndex,
                          )
                        }
                      >
                        删
                      </Button>
                    </div>
                  }
                >
                  <button
                    type="button"
                    className="ml-0.5 inline-flex h-4 max-w-full shrink-0 cursor-pointer items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-sm border border-cyan-300 bg-cyan-50 px-1 text-[9px] font-semibold leading-none text-cyan-700 transition hover:border-cyan-500 hover:bg-cyan-100 dark:border-cyan-500/60 dark:bg-cyan-500/15 dark:text-cyan-200 dark:hover:border-cyan-400 dark:hover:bg-cyan-500/25"
                    title={`第 ${round} 回合第 ${item.order} 个动作后，${spawnedTargetLabel} 号位出现；点击编辑`}
                    aria-label={`编辑第 ${round} 回合第 ${item.order} 个动作后的 ${spawnedTargetLabel} 号位出现标记`}
                  >
                    {spawnedTargetLabel}出现
                  </button>
                </Popover2>
              )
            })}
          </>
        ) : null}
      </span>
    )
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <Rnd
        className="pointer-events-auto"
        dragHandleClassName={HEADER_CLASS}
        bounds="window"
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        disableDragging={!canDrag}
        enableResizing={{
          bottom: true,
          bottomLeft: true,
          bottomRight: true,
          left: true,
          right: true,
          top: true,
          topLeft: true,
          topRight: false,
        }}
        size={size}
        position={position}
        onDragStop={(_event, data) => setPosition({ x: data.x, y: data.y })}
        onResizeStop={(_event, _direction, ref, _delta, nextPosition) => {
          setSize({
            width: Number.parseFloat(ref.style.width),
            height: Number.parseFloat(ref.style.height),
          })
          setPosition(nextPosition)
        }}
      >
        <Card className="flex h-full flex-col overflow-hidden !p-0 !shadow-2xl">
          <div
            className={clsx(
              'flex min-h-12 flex-none items-center justify-between border-b border-slate-200 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-800',
            )}
          >
            <div
              style={{
                cursor: canDrag ? 'move' : 'default',
                userSelect: 'none',
              }}
              className={clsx(
                HEADER_CLASS,
                '-mx-1 flex min-w-0 flex-1 select-none items-center gap-2 rounded-md px-1 py-1 transition',
                canDrag
                  ? 'cursor-move hover:bg-slate-200/70 dark:hover:bg-slate-700/70'
                  : 'cursor-default',
              )}
            >
              <Icon
                icon="annotation"
                className="text-blue-600 dark:text-blue-300"
              />
              {canDrag ? (
                <Icon
                  icon="move"
                  className="flex-none text-slate-400 dark:text-slate-500"
                />
              ) : null}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                  快速编辑悬浮窗
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                  录制中 · 实时同步到动作序列
                </div>
              </div>
            </div>
            <Button
              minimal
              small
              icon="minimize"
              title="收起录制窗口"
              aria-label="收起录制窗口"
              onClick={handleHide}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
            <div className="flex-none space-y-1">
              <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50/70 px-2 py-2 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      初始敌人
                    </span>
                    <div className="inline-flex overflow-hidden rounded-sm border border-slate-300 dark:border-slate-600">
                      {RECORDER_ENEMY_COUNTS.map((count, index) => (
                        <button
                          key={count}
                          type="button"
                          aria-pressed={enemyCount === count}
                          className={clsx(
                            'h-6 w-6 text-[11px] font-medium transition',
                            index > 0 &&
                              'border-l border-slate-300 dark:border-slate-600',
                            enemyCount === count
                              ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                              : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-700',
                          )}
                          onClick={() => handleEnemyCountChange(count)}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ml-auto w-[104px] flex-none">
                    <Button
                      minimal
                      small
                      active={showTargetSwitches}
                      aria-pressed={showTargetSwitches}
                      icon={
                        <Icon
                          icon={showTargetSwitches ? 'eye-open' : 'eye-off'}
                          size={recorderControlIconSize}
                        />
                      }
                      title="在当前录制表中显示或隐藏额外动作"
                      className={clsx(
                        RECORDER_CONTROL_BUTTON_CLASS,
                        RECORDER_CONTROL_BUTTON_TEXT_CLASS,
                        recorderControlButtonSizeClass,
                        showTargetSwitches &&
                          RECORDER_CONTROL_BUTTON_ACTIVE_CLASS,
                      )}
                      onClick={() =>
                        setShowTargetSwitches((current) => !current)
                      }
                    >
                      <span className="truncate">显示额外动作</span>
                    </Button>
                  </div>
                </div>
                <div
                  className={clsx(
                    'flex flex-wrap items-center gap-1.5 border-t border-slate-200 dark:border-slate-700',
                    isMobileRecorder ? 'gap-y-0 pt-0.5' : 'pt-1.5',
                  )}
                >
                  <span className="shrink-0 text-[10px] font-medium leading-none text-slate-500 dark:text-slate-400">
                    站位
                  </span>
                  <div
                    ref={targetBoardRef}
                    className={clsx(
                      'relative',
                      isMobileRecorder
                        ? 'order-3 mt-1 h-20 w-full min-w-0 flex-none'
                        : 'h-[76px] min-w-[136px] max-w-[180px] flex-1',
                    )}
                    role="group"
                    aria-label="选择接下来录制动作的目标"
                  >
                    {rotatedAllTargetLegend.map(
                      ({ targetIndex, label, gridColumn, gridRow }) => {
                        const positionStyle = getRecorderTargetPositionStyle(
                          gridColumn,
                          gridRow,
                        )
                        const isAvailable =
                          activeTargetIndicesForCurrentRound.includes(
                            targetIndex,
                          )
                        const selected =
                          targetIndex === visualSelectedTargetIndex
                        const selectedForRemoval =
                          targetFallbackDialog !== null &&
                          targetIndex ===
                            targetFallbackDialog.fallbackTargetIndex
                        const isNeutralTarget = label === '0'

                        if (!isAvailable) {
                          return (
                            <button
                              key={targetIndex}
                              type="button"
                              title={`出现 ${label} 号位`}
                              aria-label={`出现 ${label} 号位`}
                              disabled={targetFallbackDialog !== null}
                              style={positionStyle}
                              className={clsx(
                                'absolute inline-flex items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-slate-500 hover:bg-slate-100 hover:text-slate-600 dark:border-slate-600 dark:text-slate-500 dark:hover:border-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-300',
                                'disabled:cursor-not-allowed disabled:opacity-35',
                                isMobileRecorder ? 'h-10 w-10' : 'h-9 w-9',
                              )}
                              onClick={() => handleAddTarget(targetIndex)}
                            >
                              <Icon
                                icon="plus"
                                size={isMobileRecorder ? 14 : 10}
                              />
                            </button>
                          )
                        }

                        return (
                          <div
                            key={targetIndex}
                            style={positionStyle}
                            className={clsx(
                              'absolute flex items-center justify-center',
                              isMobileRecorder ? 'h-10 w-10' : 'h-9 w-9',
                            )}
                          >
                            <button
                              type="button"
                              aria-pressed={selected || selectedForRemoval}
                              title={
                                targetFallbackDialog !== null
                                  ? targetIndex ===
                                    targetFallbackDialog.targetIndex
                                    ? `${label} 号位正在处理`
                                    : `选择 ${label} 号位作为死亡后切换目标`
                                  : `接下来录制的攻击动作标记为${label}`
                              }
                              className={clsx(
                                'inline-flex items-center justify-center rounded-full border font-semibold transition',
                                isMobileRecorder
                                  ? 'h-10 w-10 text-[12px]'
                                  : 'h-9 w-9 text-[13px]',
                                isNeutralTarget
                                  ? TARGET_POSITION_NEUTRAL_CLASS
                                  : TARGET_POSITION_TONE_CLASS[label],
                                selectedForRemoval
                                  ? 'font-semibold ring-2 ring-[var(--maayuan-accent,#8b5cf6)] ring-offset-1 ring-offset-slate-50 dark:ring-offset-slate-800'
                                  : selected &&
                                      'font-semibold ring-2 ring-slate-700 ring-offset-1 ring-offset-slate-50 dark:ring-slate-100 dark:ring-offset-slate-800',
                              )}
                              onClick={() => handleSelectTarget(targetIndex)}
                            >
                              {label}
                            </button>
                            <button
                              type="button"
                              title={`移除 ${label} 号位`}
                              aria-label={`移除 ${label} 号位`}
                              disabled={targetFallbackDialog !== null}
                              className={clsx(
                                'absolute inline-flex items-center justify-center rounded-full border-white bg-rose-500 text-white shadow-sm transition hover:bg-rose-600 dark:border-slate-800',
                                'disabled:cursor-not-allowed disabled:opacity-40',
                                isMobileRecorder
                                  ? '-right-1.5 -top-1.5 h-5 w-5 border-2'
                                  : '-right-0.5 -top-0.5 h-3.5 w-3.5 border',
                              )}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleRemoveTarget(targetIndex)
                              }}
                            >
                              <Icon
                                icon="cross"
                                size={isMobileRecorder ? 9 : 7}
                              />
                            </button>
                          </div>
                        )
                      },
                    )}
                  </div>
                  <div
                    className={clsx(
                      'ml-auto grid gap-1',
                      isMobileRecorder
                        ? 'order-2 w-[212px] grid-cols-2'
                        : 'w-[104px]',
                    )}
                  >
                    <Button
                      minimal
                      small
                      active={showEnemyEvents}
                      aria-pressed={showEnemyEvents}
                      icon={
                        <Icon
                          icon={showEnemyEvents ? 'eye-open' : 'eye-off'}
                          size={recorderControlIconSize}
                        />
                      }
                      title="在当前录制表中显示或隐藏敌方存活状态标记"
                      className={clsx(
                        RECORDER_CONTROL_BUTTON_CLASS,
                        RECORDER_CONTROL_BUTTON_TEXT_CLASS,
                        recorderControlButtonSizeClass,
                        showEnemyEvents && RECORDER_CONTROL_BUTTON_ACTIVE_CLASS,
                      )}
                      onClick={() => setShowEnemyEvents((current) => !current)}
                    >
                      <span className="truncate">敌方存活状态</span>
                    </Button>
                    <Popover2
                      placement="bottom-end"
                      portalClassName="z-[1600]"
                      popoverClassName="[&>.bp4-popover2-content]:!p-0 overflow-hidden"
                      content={
                        <div className="flex max-h-[60vh] w-[272px] flex-col overflow-hidden rounded-md border border-slate-200 bg-white text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          <div className="flex flex-none items-center justify-between border-b border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800">
                            <span className="text-[11px] font-semibold">
                              敌方情况
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              共 {enemyEventSummaryCount} 处变化
                            </span>
                          </div>
                          <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain dark:divide-slate-800">
                            {enemyEventSummaries.map((summary) => (
                              <div
                                key={summary.targetIndex}
                                className="grid grid-cols-[42px_1fr] gap-2 px-2.5 py-2"
                              >
                                <span className="pt-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                  {summary.label}号位
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {summary.events.length > 0 ? (
                                    summary.events.map((event, index) => (
                                      <span
                                        key={`${event.round}-${event.order}-${event.type}-${index}`}
                                        className={clsx(
                                          'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] leading-none',
                                          event.type === 'dead'
                                            ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-200'
                                            : 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/50 dark:bg-cyan-500/10 dark:text-cyan-200',
                                        )}
                                      >
                                        <span>第{event.round}回合 ·</span>
                                        <span title={`第${event.order}动作`}>
                                          {event.actionLabel}
                                        </span>
                                        <span className="font-semibold">
                                          {event.type === 'dead'
                                            ? '死亡'
                                            : '出现'}
                                        </span>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="pt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                                      无变化
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      }
                    >
                      <Button
                        minimal
                        small
                        className={clsx(
                          RECORDER_CONTROL_BUTTON_CLASS,
                          RECORDER_CONTROL_BUTTON_TEXT_CLASS,
                          recorderControlButtonSizeClass,
                        )}
                        title="查看敌方死亡与出现情况"
                        icon={
                          <Icon icon="list" size={recorderControlIconSize} />
                        }
                      >
                        <span className="truncate">敌方情况</span>
                      </Button>
                    </Popover2>
                  </div>
                </div>
              </div>
              <div className="grid flex-none grid-cols-[1fr_auto_1fr] items-center gap-2">
                <Button
                  className="w-full"
                  small
                  disabled={currentRound <= 1}
                  onClick={handlePreviousRound}
                >
                  上一回合
                </Button>
                <div className="px-1 text-center text-sm font-medium text-slate-700 dark:text-slate-200">
                  回合 {currentRound}/{maxRound}
                </div>
                <Button className="w-full" small onClick={handleNextRound}>
                  下一回合
                </Button>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {RECORDER_SLOT_KEYS.map((slot) => {
                  const name = slotAssignments?.[Number(slot)]?.name?.trim()
                  const label = name ?? `${slot}号位`
                  return (
                    <div
                      key={slot}
                      className="flex h-6 items-center justify-center px-0.5 text-[11px] font-semibold text-[var(--maayuan-text-strong,#4c1d95)] dark:text-slate-200"
                      title={label}
                    >
                      <span className="truncate">{label}</span>
                    </div>
                  )
                })}
              </div>
              {RECORDER_BUTTON_ROWS.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className={clsx(
                    'grid gap-1',
                    row.length === 2 ? 'grid-cols-2' : 'grid-cols-5',
                  )}
                >
                  {row.map((action) => (
                    <button
                      key={action.key}
                      type="button"
                      className={clsx(
                        'flex h-7 items-center justify-center rounded-md border px-1.5 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900',
                        TONE_CHIP_CLASS[action.tone],
                      )}
                      onClick={() => handleAppendToken(action.token)}
                    >
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-1 flex min-h-[190px] flex-1 flex-col overflow-hidden rounded-md border border-[var(--maayuan-accent,#ddd6fe)] dark:border-slate-700">
              <div className="flex flex-none items-center justify-between border-b border-[var(--maayuan-accent,#ddd6fe)] px-3 py-2 dark:border-slate-700">
                <span className="text-xs font-medium text-[var(--maayuan-text-strong,#5b21b6)] dark:text-slate-300">
                  当前录制
                  <span className="ml-1.5 text-[9px] font-normal text-[var(--maayuan-text,#7c3aed)] opacity-50 dark:text-slate-400">
                    点击回合数与动作可进行编辑/删除
                  </span>
                </span>
                <span className="text-xs text-[var(--maayuan-text,#7c3aed)] dark:text-slate-400">
                  回合 {currentRound}/{maxRound}
                </span>
              </div>

              <div
                ref={scrollContainerRef}
                className="min-h-0 flex-1 overflow-auto"
              >
                <table className="w-full table-fixed border-collapse text-xs">
                  <thead className="text-[var(--maayuan-text-strong,#4c1d95)] dark:text-violet-100">
                    <tr>
                      <th className="sticky top-0 z-10 w-8 whitespace-nowrap border border-[var(--maayuan-accent,#8b5cf6)] bg-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_55%,var(--maayuan-surface,#fff))] px-0.5 py-2 text-[11px] font-medium dark:border-violet-700 dark:bg-violet-900/50">
                        回合
                      </th>
                      {RECORDER_SLOT_KEYS.map((slot) => {
                        const name =
                          slotAssignments?.[Number(slot)]?.name?.trim()
                        const label = name ?? `${slot} 号位`
                        return (
                          <th
                            key={slot}
                            className="sticky top-0 z-10 border border-[var(--maayuan-accent,#8b5cf6)] bg-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_55%,var(--maayuan-surface,#fff))] px-0.5 py-2 text-center font-medium dark:border-violet-700 dark:bg-violet-900/50"
                            title={label}
                          >
                            <span className="block truncate">{label}</span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  {roundRows.map(({ round, groups }) => (
                    <tbody key={round}>
                      <tr
                        data-recorder-round={round}
                        className={clsx(
                          round % 2 === 1
                            ? 'bg-[var(--maayuan-surface,#faf5ff)] dark:bg-slate-900/30'
                            : 'bg-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_12%,var(--maayuan-surface,#faf5ff))] dark:bg-slate-800/50',
                        )}
                      >
                        <th
                          rowSpan={
                            showTargetSwitches && groups.extras.length > 0
                              ? 2
                              : undefined
                          }
                          className="w-7 border border-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_45%,var(--maayuan-surface,#faf5ff))] px-0.5 py-2 text-center align-middle text-[var(--maayuan-text-strong,#5b21b6)] dark:border-slate-600 dark:text-slate-100"
                        >
                          <Popover2
                            minimal
                            isOpen={openRoundMenu === round}
                            onInteraction={(nextOpen) =>
                              setOpenRoundMenu(nextOpen ? round : null)
                            }
                            placement="right-start"
                            popoverClassName="overflow-hidden [&>.bp4-popover2-content]:!p-0 [&_.bp4-menu]:!min-w-[150px]"
                            content={
                              <Menu>
                                <MenuItem
                                  icon="edit"
                                  text="跳转编辑"
                                  onClick={() => handleJumpToRound(round)}
                                />
                                <MenuItem
                                  icon="duplicate"
                                  text="复制回合"
                                  onClick={() => handleCopyRound(round)}
                                />
                                <MenuItem
                                  icon="duplicate"
                                  title="复制指定回合并插入到当前回合之后"
                                  textClassName="flex items-center gap-0.5"
                                  text={
                                    <>
                                      <button
                                        type="button"
                                        title="确认复制"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          handleCopySpecificRound(
                                            round,
                                            Number(copySourceRoundInput),
                                          )
                                        }}
                                        className="inline-flex h-5 cursor-pointer items-center border-0 bg-transparent p-0 text-inherit leading-none"
                                      >
                                        复制
                                      </button>
                                      <span className="relative inline-flex h-5 items-center justify-center gap-0.5 rounded-sm bg-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_8%,transparent)] px-1.5 text-inherit leading-none">
                                        <span className="pointer-events-none whitespace-nowrap text-center">
                                          第 {copySourceRoundInput} 回合
                                        </span>
                                        <Icon
                                          icon="caret-down"
                                          size={11}
                                          className="pointer-events-none opacity-60"
                                        />
                                        <select
                                          value={copySourceRoundInput}
                                          onChange={(event) => {
                                            setCopySourceRoundInput(
                                              event.target.value,
                                            )
                                          }}
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                          onMouseDown={(event) =>
                                            event.stopPropagation()
                                          }
                                          onTouchStart={(event) =>
                                            event.stopPropagation()
                                          }
                                          onKeyDown={(event) => {
                                            event.stopPropagation()
                                          }}
                                          className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0 opacity-0 outline-none"
                                          style={{
                                            fontFamily: 'inherit',
                                            fontSize: 'inherit',
                                          }}
                                          aria-label="要复制的源回合数"
                                        >
                                          {RECORDER_ROUND_OPTIONS.map(
                                            (roundNumber) => (
                                              <option
                                                key={roundNumber}
                                                value={roundNumber}
                                              >
                                                第 {roundNumber} 回合
                                              </option>
                                            ),
                                          )}
                                        </select>
                                      </span>
                                    </>
                                  }
                                />
                                <MenuItem
                                  icon="trash"
                                  intent="danger"
                                  text="删除回合"
                                  onClick={() => handleDeleteRound(round)}
                                />
                              </Menu>
                            }
                          >
                            <button
                              type="button"
                              className={clsx(
                                'inline-flex h-6 min-w-6 items-center justify-center rounded-sm px-1 text-base font-bold transition hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--maayuan-accent,#8b5cf6)] dark:hover:bg-white/10',
                                currentRound === round &&
                                  'bg-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_55%,var(--maayuan-surface,#fff))] text-[var(--maayuan-text-strong,#4c1d95)] shadow-sm hover:bg-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_55%,var(--maayuan-surface,#fff))] dark:bg-violet-900/50 dark:text-violet-100 dark:hover:bg-violet-900/50',
                              )}
                              title={`第 ${round} 回合：点击可跳转、复制、复制指定回合或删除回合`}
                              aria-label={`第 ${round} 回合：点击可跳转、复制、复制指定回合或删除回合`}
                            >
                              {round}
                            </button>
                          </Popover2>
                        </th>
                        {RECORDER_SLOT_KEYS.map((slot) => (
                          <td
                            key={slot}
                            className="h-[46px] overflow-hidden border border-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_45%,var(--maayuan-surface,#faf5ff))] p-0.5 text-center align-middle dark:border-slate-600"
                          >
                            <div className="flex min-h-8 w-full min-w-0 flex-wrap items-center justify-center gap-x-0 gap-y-0">
                              {(groups.slots[Number(slot)] ?? []).map((item) =>
                                renderActionToken(item, round),
                              )}
                            </div>
                          </td>
                        ))}
                      </tr>
                      {showTargetSwitches && groups.extras.length > 0 ? (
                        <tr className="bg-transparent">
                          <td
                            colSpan={RECORDER_SLOT_KEYS.length}
                            className="border-x border-b border-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_45%,var(--maayuan-surface,#faf5ff))] px-1 py-0.5 text-left text-[10px] leading-3 text-[var(--maayuan-accent-strong,#8b5cf6)] dark:border-slate-600 dark:text-stone-500"
                          >
                            额外动作：
                            <span className="ml-1 inline-flex flex-wrap items-center gap-x-0 gap-y-0.5 align-middle">
                              {groups.extras.map((item) =>
                                renderActionToken(item, round),
                              )}
                            </span>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  ))}
                </table>
              </div>
            </div>
          </div>

          <div className="flex flex-none border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
            <Button
              className="w-full !border-[var(--maayuan-accent,#8b5cf6)] !bg-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_18%,var(--maayuan-surface,#faf5ff))] !text-[var(--maayuan-text-strong,#4c1d95)] enabled:hover:!brightness-95 dark:!border-violet-700 dark:!bg-violet-900/50 dark:!text-violet-100 dark:enabled:hover:!bg-violet-800"
              small
              onClick={handleHide}
            >
              关闭悬浮窗
            </Button>
          </div>
        </Card>
        {targetFallbackDialog !== null ? (
          <div
            role="dialog"
            aria-modal="false"
            aria-label={
              targetFallbackDialog.kind === 'death'
                ? `${getRecorderTargetLabel(targetFallbackDialog.targetIndex)} 号位死亡后切换`
                : `删除 ${getRecorderTargetLabel(targetFallbackDialog.targetIndex)} 号位`
            }
            className={clsx(
              'pointer-events-auto absolute z-30 -translate-x-1/2 overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_42%,var(--maayuan-surface,#faf5ff))] bg-[color-mix(in_srgb,var(--maayuan-surface,#fff)_97%,var(--maayuan-accent,#8b5cf6)_3%)] shadow-2xl dark:border-slate-600 dark:bg-slate-800',
              isMobileRecorder ? 'bottom-14' : 'top-[190px]',
            )}
            style={{
              left: targetFallbackDialogAnchorX ?? '50%',
              width: isMobileRecorder ? 'min(calc(100% - 16px), 200px)' : 200,
            }}
          >
            <div className="flex items-start gap-1.5 px-2.5 pb-1.5 pt-2">
              <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                <Icon
                  icon={
                    targetFallbackDialog.kind === 'death'
                      ? 'warning-sign'
                      : 'trash'
                  }
                  size={10}
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold leading-4 text-[var(--maayuan-text-strong,#4c1d95)] dark:text-slate-100">
                  {targetFallbackDialog.kind === 'death'
                    ? `${getRecorderTargetLabel(targetFallbackDialog.targetIndex)} 号位死亡后切换`
                    : `删除 ${getRecorderTargetLabel(targetFallbackDialog.targetIndex)} 号位`}
                </div>
                <div className="text-[9px] leading-3 text-slate-500 dark:text-slate-400">
                  {targetFallbackDialog.kind === 'death'
                    ? '请选择该动作后自动切换到的位置'
                    : '选择敌人死亡后自动切换到的位置'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 border-t border-slate-200/80 px-2.5 py-1.5 dark:border-slate-700">
              <span className="flex-none text-[9px] font-medium text-slate-500 dark:text-slate-400">
                切换至
              </span>
              <div className="flex min-w-0 flex-1 items-center justify-around gap-1">
                {targetFallbackOptions.map((targetIndex) => {
                  const label = getRecorderTargetLabel(targetIndex)
                  const selected =
                    targetIndex === targetFallbackDialog.fallbackTargetIndex
                  const isNeutralTarget = label === '0'

                  return (
                    <button
                      key={targetIndex}
                      type="button"
                      aria-pressed={selected}
                      title={`选择 ${label} 号位作为死亡后切换目标`}
                      className={clsx(
                        'inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border text-[10px] font-semibold transition',
                        selected
                          ? isNeutralTarget
                            ? TARGET_POSITION_NEUTRAL_CLASS
                            : TARGET_POSITION_TONE_CLASS[label]
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-700',
                        selected &&
                          'ring-2 ring-[var(--maayuan-accent,#8b5cf6)] ring-offset-1 ring-offset-white dark:ring-offset-slate-800',
                      )}
                      onClick={() =>
                        setTargetFallbackDialog({
                          ...targetFallbackDialog,
                          fallbackTargetIndex: targetIndex,
                        })
                      }
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center justify-between gap-1.5 border-t border-slate-200/80 bg-slate-50/70 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900/30">
              <span className="text-[9px] text-slate-400 dark:text-slate-500">
                {targetFallbackDialog.kind === 'death'
                  ? '选择后点击确认标记'
                  : '也可直接点击上方站位'}
              </span>
              <div className="flex flex-none gap-1">
                <Button
                  small
                  minimal
                  className="!h-6 !min-h-6 !px-1.5 !text-[10px]"
                  onClick={closeTargetFallbackDialog}
                >
                  取消
                </Button>
                <Button
                  small
                  intent="danger"
                  className="!h-6 !min-h-6 !px-2 !text-[10px]"
                  disabled={targetFallbackDialog.fallbackTargetIndex === null}
                  onClick={handleConfirmTargetFallback}
                >
                  {targetFallbackDialog.kind === 'death'
                    ? '确认标记'
                    : '确认删除'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Rnd>
    </div>,
    document.body,
  )
}

FloatingActionRecorder.displayName = 'FloatingActionRecorder'

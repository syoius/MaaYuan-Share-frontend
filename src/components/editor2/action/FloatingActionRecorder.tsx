import { Button, Card, Classes, Icon, Menu, MenuItem } from '@blueprintjs/core'
import { Popover2 } from '@blueprintjs/popover2'

import clsx from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Rnd } from 'react-rnd'
import { useWindowSize } from 'react-use'

import { useBreakpoint } from '../../../utils/device'
import { AppToaster } from '../../Toaster'
import {
  RECORDER_SLOT_KEYS,
  appendRecorderToken,
  cloneRoundActions,
  ensureRecorderRound,
  formatRecorderRoundItem,
  getNextRecorderRound,
  getRecorderRoundNumbers,
  groupRecorderRoundActions,
  removeRecorderToken,
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
  onSave: (next: RoundActionsInput) => void
}

const HEADER_CLASS = 'action-recorder-header'
const MIN_WIDTH = 320
const MIN_HEIGHT = 420
const DEFAULT_WIDTH = 480
const DEFAULT_HEIGHT = 680

const TONE_CHIP_CLASS: Record<RecorderButtonTone, string> = {
  ultimate:
    'border-amber-300 bg-amber-50/70 text-amber-700 hover:bg-amber-100/80 dark:border-amber-600/70 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20',
  normal:
    'border-blue-300 bg-blue-50/70 text-blue-700 hover:bg-blue-100/80 dark:border-blue-600/70 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/20',
  defense:
    'border-sky-300 bg-sky-50/70 text-sky-700 hover:bg-sky-100/80 dark:border-sky-600/70 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20',
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
  [
    {
      key: 'left',
      label: '左',
      token: '额外:左侧目标',
      tone: 'extra',
    },
    {
      key: 'right',
      label: '右',
      token: '额外:右侧目标',
      tone: 'extra',
    },
  ],
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

const cloneEntries = (entries: string[][]) =>
  entries.map((entry) => [...entry])

const copyRoundInRecorder = (
  input: RoundActionsInput,
  round: number,
): RoundActionsInput => {
  const result = cloneRoundActions(input)
  const source = cloneEntries(result[String(round)] ?? [])
  const numbers = getRecorderRoundNumbers(result)
  const lastRound = numbers.length > 0 ? Math.max(...numbers) : 0

  if (round > lastRound) {
    result[String(round + 1)] = []
    return result
  }

  for (let current = lastRound; current >= round; current -= 1) {
    result[String(current + 1)] = cloneEntries(result[String(current)] ?? [])
  }
  result[String(round + 1)] = source
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
  onSave,
}: FloatingActionRecorderProps) {
  const [size, setSize] = useState(getInitialSize)
  const [position, setPosition] = useState(() => getInitialPosition(size))
  const [visible, setVisible] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [draft, setDraft] = useState(() => cloneRoundActions(roundActions))
  const [currentRound, setCurrentRound] = useState(() =>
    getNextRecorderRound(roundActions),
  )
  const { width: windowWidth, height: windowHeight } = useWindowSize()
  const breakpoint = useBreakpoint()
  const canDrag = breakpoint !== 'tablet'
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pendingScrollRoundRef = useRef<number | null>(null)

  useEffect(() => {
    if (dirty) {
      return
    }
    setDraft(cloneRoundActions(roundActions))
  }, [dirty, roundActions])

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

  const roundNumbers = useMemo(() => getRecorderRoundNumbers(draft), [draft])
  const maxRound = Math.max(currentRound, ...roundNumbers, 1)
  const roundRows = useMemo(
    () =>
      Array.from({ length: maxRound }, (_, index) => {
        const round = index + 1
        return {
          round,
          groups: groupRecorderRoundActions(draft, round),
        }
      }),
    [draft, maxRound],
  )

  const handleAppendToken = useCallback(
    (token: string) => {
      setDraft((current) => appendRecorderToken(current, currentRound, token))
      setDirty(true)
    },
    [currentRound],
  )

  const handlePreviousRound = useCallback(() => {
    setCurrentRound((current) => Math.max(1, current - 1))
  }, [])

  const handleNextRound = useCallback(() => {
    const next = currentRound + 1
    pendingScrollRoundRef.current = next
    setDraft((draftValue) => ensureRecorderRound(draftValue, next))
    setCurrentRound(next)
  }, [currentRound])

  const handleJumpToRound = useCallback((round: number) => {
    pendingScrollRoundRef.current = round
    setCurrentRound(round)
  }, [])

  const handleCopyRound = useCallback(
    (round: number) => {
      const nextRound = round + 1
      setDraft((current) => copyRoundInRecorder(current, round))
      setCurrentRound(nextRound)
      setDirty(true)
      pendingScrollRoundRef.current = nextRound
      AppToaster.show({
        message: `已将第 ${round} 回合复制到第 ${nextRound} 回合`,
        intent: 'success',
      })
    },
    [],
  )

  const handleDeleteRound = useCallback(
    (round: number) => {
      const next = removeRoundInRecorder(draft, round)
      const remainingMax = Math.max(1, ...getRecorderRoundNumbers(next))
      setDraft(next)
      setCurrentRound((currentRound) =>
        Math.max(1, Math.min(currentRound, remainingMax, round)),
      )
      setDirty(true)
      AppToaster.show({
        message: `已删除第 ${round} 回合`,
        intent: 'success',
      })
    },
    [draft],
  )

  const handleRemoveToken = useCallback((round: number, index: number) => {
    setDraft((current) => removeRecorderToken(current, round, index))
    setDirty(true)
  }, [])

  const handleConvertToken = useCallback(
    (
      round: number,
      index: number,
      slot: number,
      kind: RecorderConvertibleTone,
    ) => {
      setDraft((current) => {
        const next = cloneRoundActions(current)
        const key = String(round)
        const entry = next[key]?.[index]
        if (!entry) {
          return current
        }
        const token = `${slot}${RECORDER_ACTION_SYMBOL[kind]}`
        if (entry[0] === token) {
          return current
        }
        next[key][index] = [token, ...entry.slice(1)]
        return next
      })
      setDirty(true)
    },
    [],
  )

  const handleSave = useCallback(
    (closeAfterSave: boolean) => {
      onSave(draft)
      setDirty(false)
      setCurrentRound(getNextRecorderRound(draft))
      AppToaster.show({
        message: closeAfterSave
          ? '已保存到动作序列并收起快速编辑窗口'
          : '已保存到动作序列',
        intent: 'success',
      })
      if (closeAfterSave) {
        setVisible(false)
      }
    },
    [draft, onSave],
  )

  const handleHide = useCallback(() => {
    setVisible(false)
    if (dirty) {
      AppToaster.show({
        message: '快速编辑窗口已收起，未保存内容仍保留在窗口中',
        intent: 'warning',
      })
    }
  }, [dirty])

  if (!visible) {
    return createPortal(
      <Button
        className="!fixed right-4 bottom-4 z-50 shadow-lg"
        icon="annotation"
        intent={dirty ? 'warning' : 'primary'}
        onClick={() => setVisible(true)}
      >
        快速编辑
        {dirty ? '（未保存）' : ''}
      </Button>,
      document.body,
    )
  }

  const renderActionToken = (item: RecorderRoundItem, round: number) => {
    const isExtra = item.display.area === 'extra'
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
              : () =>
                  handleConvertToken(round, item.index, slot, 'ultimate')
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
      <Popover2
        key={`${round}-${item.index}-${item.token}`}
        minimal
        placement="top"
        portalClassName="z-[1600]"
        popoverClassName="[&>.bp4-popover2-content]:!p-0 overflow-hidden"
        content={
          <div className="flex items-center gap-0.5 p-0.5">
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
        }
      >
        <button
          type="button"
          className={clsx(
            'inline-flex items-center rounded-sm px-0.5 transition hover:bg-black/5 dark:hover:bg-white/10',
            isExtra
              ? 'min-h-3 text-[10px] font-normal leading-3 text-stone-500 dark:text-stone-400'
              : 'min-h-4 text-[13px] font-semibold leading-4 text-stone-700 dark:text-stone-100',
          )}
          title={`第 ${round} 回合第 ${item.order} 个动作：${formatRecorderRoundItem(
            item,
          )}${slotName ? `（${slotName}）` : ''}（点击编辑、删除动作）`}
        >
          {formatRecorderRoundItem(item)}
        </button>
      </Popover2>
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
                <div
                  className={clsx(
                    'text-[11px]',
                    dirty
                      ? 'font-medium text-amber-600 dark:text-amber-300'
                      : 'text-slate-400 dark:text-slate-500',
                  )}
                >
                  {dirty ? '未保存' : '录制中'}
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

            <div className="flex-none space-y-1">
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
                      {action.slot ? <span>{action.slot}</span> : null}
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
                          rowSpan={groups.extras.length > 0 ? 2 : undefined}
                          className="w-7 border border-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_45%,var(--maayuan-surface,#faf5ff))] px-0.5 py-2 text-center align-middle text-[var(--maayuan-text-strong,#5b21b6)] dark:border-slate-600 dark:text-slate-100"
                        >
                          <Popover2
                            minimal
                            placement="right-start"
                            popoverClassName="[&>.bp4-popover2-content]:!p-0 overflow-hidden"
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
                              title={`第 ${round} 回合：点击可跳转、复制、删除回合`}
                              aria-label={`第 ${round} 回合：点击可跳转、复制、删除回合`}
                            >
                              {round}
                            </button>
                          </Popover2>
                        </th>
                        {RECORDER_SLOT_KEYS.map((slot) => (
                          <td
                            key={slot}
                            className="h-12 border border-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_45%,var(--maayuan-surface,#faf5ff))] p-0.5 text-center align-middle dark:border-slate-600"
                          >
                            <div className="flex min-h-8 flex-wrap items-center justify-center gap-x-0 gap-y-0">
                              {(groups.slots[Number(slot)] ?? []).map((item) =>
                                renderActionToken(item, round),
                              )}
                            </div>
                          </td>
                        ))}
                      </tr>
                      {groups.extras.length > 0 ? (
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

          <div className="grid flex-none grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
            <Button
              className="w-full"
              small
              outlined
              onClick={() => handleSave(false)}
            >
              保存到动作序列
            </Button>
            <Button
              className="w-full !border-[var(--maayuan-accent,#8b5cf6)] !bg-[color-mix(in_srgb,var(--maayuan-accent,#8b5cf6)_18%,var(--maayuan-surface,#faf5ff))] !text-[var(--maayuan-text-strong,#4c1d95)] enabled:hover:!brightness-95 dark:!border-violet-700 dark:!bg-violet-900/50 dark:!text-violet-100 dark:enabled:hover:!bg-violet-800"
              small
              onClick={() => handleSave(true)}
            >
              保存并关闭
            </Button>
          </div>
        </Card>
      </Rnd>
    </div>,
    document.body,
  )
}

FloatingActionRecorder.displayName = 'FloatingActionRecorder'

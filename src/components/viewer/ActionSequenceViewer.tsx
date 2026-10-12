import {
  Button,
  ButtonGroup,
  Card,
  NonIdealState,
  Tag,
} from '@blueprintjs/core'

import { useAtomValue } from 'jotai'
import { FC, type ReactNode, useMemo, useState } from 'react'

import { languageAtom, useTranslation } from '../../i18n/i18n'
import type { Language } from '../../i18n/i18n'
import { Operation } from '../../models/operation'
import { getLocalizedOperatorName } from '../../models/operator'
import { useCurrentSize } from '../../utils/useCurrenSize'
import { OperatorAvatar } from '../OperatorAvatar'
import {
  RoundActionsInput,
  editorActionsToRoundActions,
} from '../editor2/action/roundMapping'
import type { BasicActionSymbol, SlotKey } from '../editor2/action/tokenUtils'
import {
  SLOT_KEYS,
  groupTokensBySlotWithExtraAttribution,
  resolveChipVariant,
} from '../editor2/action/tokenUtils'
import { simingActionsToRoundActions } from '../editor2/siming-export'
import {
  getRecorderAttackNumber,
  getRecorderMetaTargetIndex,
} from '../editor2/action/recorderMeta'

interface ActionSequenceViewerProps {
  operation: Operation
  shareImage?: ReactNode
}

type EditorAction = import('../editor2/editor-state').EditorAction

export type SlotAssignments = Partial<
  Record<number, { name?: string; rawName?: string }>
>

export interface DisplayRound {
  round: number
  tokens: DisplayToken[]
}

export interface DisplayToken {
  raw: string
  label: string
  key: string
  order: number
  targetIndex?: number
}

type ViewMode = 'flow' | 'table' | 'share'

const BASIC_ACTION_SUMMARY_MAP: Record<BasicActionSymbol, string> = {
  普: 'A',
  大: '↑',
  下: '↓',
  sp: '圈',
}

export const ActionSequenceViewer: FC<ActionSequenceViewerProps> = ({
  operation,
  shareImage,
}) => {
  const t = useTranslation()
  const language = useAtomValue(languageAtom)
  // 移动端默认用 flow 卡片视图，避免类表格视图首屏即横向滚动（audit t3 #2）
  const { isSM } = useCurrentSize()

  const { rounds, slotAssignments } = useMemo(
    () => buildOperationActionDisplay(operation, language),
    [operation, language],
  )

  const [viewMode, setViewMode] = useState<ViewMode>(isSM ? 'flow' : 'table')

  if (!rounds.length) {
    return (
      <NonIdealState
        className="my-2"
        title={t.components.viewer.OperationViewer.no_actions}
        description={t.components.viewer.OperationViewer.no_actions_defined}
        icon="slash"
        layout="horizontal"
      />
    )
  }

  const viewModeOptions: Array<{
    mode: ViewMode
    icon: 'timeline-events' | 'layout-grid'
    label: string
  }> = [
    {
      mode: 'flow',
      icon: 'timeline-events',
      label: t.components.viewer.OperationViewer.action_view_mode_flow,
    },
    {
      mode: 'table',
      icon: 'layout-grid',
      label: t.components.viewer.OperationViewer.action_view_mode_table,
    },
  ]

  const renderFlowRound = ({ round, tokens }: DisplayRound) => (
    <Card key={round} className="card-shadow-subtle space-y-3 !p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold">
            {t.components.viewer.OperationViewer.round_title({ round })}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t.components.viewer.OperationViewer.round_action_count({
              count: tokens.length,
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {tokens.map(({ raw, label, key }) => (
          <Tag
            key={key}
            large
            intent="primary"
            minimal
            title={raw !== label ? raw : undefined}
          >
            {label}
          </Tag>
        ))}
      </div>
    </Card>
  )

  const renderTableView = () => {
    const tableRows = rounds.map((roundEntry) => {
      const { slotMap, others } = groupTokensForTable(
        roundEntry.tokens,
        slotAssignments,
      )
      return {
        round: roundEntry.round,
        tokens: roundEntry.tokens,
        slotMap,
        others,
      }
    })

    const assignedSlots = SLOT_KEYS.filter((slot) =>
      Boolean(slotAssignments[Number(slot)]?.name),
    )
    const slotsWithTokens = new Set<SlotKey>()
    tableRows.forEach(({ slotMap }) => {
      SLOT_KEYS.forEach((slot) => {
        if ((slotMap[slot]?.length ?? 0) > 0) {
          slotsWithTokens.add(slot)
        }
      })
    })

    const slotsToRender =
      assignedSlots.length > 0
        ? SLOT_KEYS.filter(
            (slot) => assignedSlots.includes(slot) || slotsWithTokens.has(slot),
          )
        : slotsWithTokens.size > 0
          ? SLOT_KEYS.filter((slot) => slotsWithTokens.has(slot))
          : SLOT_KEYS

    const hasOtherActions = tableRows.some(({ others }) => others.length > 0)

    const noActionsText =
      t.components.viewer.OperationViewer.action_table_no_actions
    const otherActionsText =
      t.components.viewer.OperationViewer.action_table_other_actions
    const roundHeaderText = language === 'zh_tw' ? '回合' : '回合'

    return (
      <Card key="table-view" className="card-shadow-subtle space-y-4 !p-4">
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full align-middle">
            <div className="rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-white dark:bg-slate-800/60">
                    <th className="w-[140px] align-top border border-gray-200 dark:border-gray-600 px-3 py-2 text-left text-sm font-semibold">
                      {roundHeaderText}
                    </th>
                    {slotsToRender.map((slotKey) => {
                      const slotNumber = Number(slotKey)
                      const assignment = slotAssignments[slotNumber]
                      const operatorName = assignment?.name?.trim()
                      const placeholder =
                        t.components.viewer.OperationViewer.action_table_slot_placeholder(
                          {
                            slot: slotNumber,
                          },
                        )
                      const slotLabel = operatorName || placeholder
                      const slotPosition =
                        t.components.viewer.OperationViewer.action_table_slot_position(
                          {
                            slot: slotNumber,
                          },
                        )

                      return (
                        <th
                          key={slotKey}
                          className="w-[180px] align-top border border-gray-200 dark:border-gray-600 px-3 py-3 text-sm font-semibold text-center bg-white dark:bg-slate-800/60"
                        >
                          <div className="flex flex-col items-center gap-2">
                            {assignment?.rawName ? (
                              <OperatorAvatar
                                name={assignment.rawName}
                                size="verylarge"
                                sourceSize={96}
                                className="h-28 w-20 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="flex h-12 w-full items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                                {placeholder}
                              </div>
                            )}
                            <div className="text-sm font-semibold text-center">
                              {slotLabel}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {slotPosition}
                            </div>
                          </div>
                        </th>
                      )
                    })}
                    {hasOtherActions && (
                      <th className="w-[200px] align-top border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm font-semibold bg-white dark:bg-slate-800/60">
                        {otherActionsText}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr
                      key={row.round}
                      className="bg-white dark:bg-slate-800/60"
                    >
                      <th className="w-[140px] align-top border border-gray-200 dark:border-gray-600 px-3 py-3 text-left">
                        <div className="text-sm font-semibold">
                          {t.components.viewer.OperationViewer.round_title({
                            round: row.round,
                          })}
                        </div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {t.components.viewer.OperationViewer.round_action_count(
                            {
                              count: row.tokens.length,
                            },
                          )}
                        </div>
                      </th>
                      {slotsToRender.map((slotKey) => {
                        const slotTokens = row.slotMap[slotKey] ?? []
                        return (
                          <td
                            key={`${row.round}-${slotKey}`}
                            className="w-[180px] align-top border border-gray-200 dark:border-gray-600 px-3 py-3 text-center"
                          >
                            {slotTokens.length > 0 ? (
                              <div className="flex flex-wrap gap-2 justify-center">
                                {slotTokens.map((token) => {
                                  const variant = resolveChipVariant(token.raw)
                                  const summary = formatTokenSummary(
                                    token.raw,
                                    language,
                                  )
                                  return (
                                    <div
                                      key={token.key}
                                      className="editor-round-chip text-xs sm:text-sm font-medium select-none whitespace-nowrap cursor-default"
                                      data-variant={variant}
                                      title={token.label}
                                    >
                                      <span className="truncate">
                                        {`${token.order + 1}${summary}`}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {noActionsText}
                              </span>
                            )}
                          </td>
                        )
                      })}
                      {hasOtherActions && (
                        <td className="w-[200px] align-top border border-gray-200 dark:border-gray-600 px-3 py-3 text-center">
                          {row.others.length > 0 ? (
                            <div className="flex flex-wrap gap-2 justify-center">
                              {row.others.map((token) => {
                                const variant = resolveChipVariant(token.raw)
                                const summary = formatTokenSummary(
                                  token.raw,
                                  language,
                                )
                                return (
                                  <div
                                    key={token.key}
                                    className="editor-round-chip text-xs sm:text-sm font-medium select-none whitespace-nowrap cursor-default"
                                    data-variant={variant}
                                    title={token.label}
                                  >
                                    <span className="truncate">
                                      {`${token.order + 1}${summary}`}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {noActionsText}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="mt-2 flex flex-col pb-8 space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <ButtonGroup minimal>
            {viewModeOptions.map((option) => (
              <Button
                key={option.mode}
                icon={option.icon}
                active={viewMode === option.mode}
                intent={viewMode === option.mode ? 'primary' : 'none'}
                onClick={() => setViewMode(option.mode)}
              >
                {option.label}
              </Button>
            ))}
            {shareImage ? (
              <Button
                icon="media"
                active={viewMode === 'share'}
                intent={viewMode === 'share' ? 'primary' : 'none'}
                onClick={() => setViewMode('share')}
              >
                分享图
              </Button>
            ) : null}
          </ButtonGroup>
        </div>
      </div>
      {viewMode === 'share' && shareImage
        ? shareImage
        : viewMode === 'table'
          ? renderTableView()
          : rounds.map((round) => renderFlowRound(round))}
    </div>
  )
}

function collectRoundsFromStandardActions(
  operation: Operation,
  slotAssignments: SlotAssignments,
  language: Language,
): { rounds: DisplayRound[]; isSiming: boolean } | null {
  const actions = operation.parsedContent.actions
  if (!Array.isArray(actions) || actions.length === 0) {
    return null
  }

  const editorActions: EditorAction[] = actions.map((action, index) => ({
    id: `viewer-action-${index}`,
    ...action,
  })) as unknown as EditorAction[]

  const roundActions = editorActionsToRoundActions(editorActions)
  const rounds = buildDisplayRounds(
    roundActions,
    slotAssignments,
    language,
    operation.parsedContent.recorderMeta,
  )
  if (!rounds.length) {
    return null
  }
  return { rounds, isSiming: false }
}

function collectRoundsFromSimingActions(
  operation: Operation,
  slotAssignments: SlotAssignments,
  language: Language,
): { rounds: DisplayRound[]; isSiming: boolean } | null {
  const actions = operation.parsedContent.simingActions
  if (!actions || Object.keys(actions).length === 0) {
    return null
  }
  const roundActions = simingActionsToRoundActions(actions)
  const rounds = buildDisplayRounds(
    roundActions,
    slotAssignments,
    language,
    operation.parsedContent.recorderMeta,
  )
  if (!rounds.length) {
    return null
  }
  return { rounds, isSiming: true }
}

function buildDisplayRounds(
  roundActions: RoundActionsInput,
  slotAssignments: SlotAssignments,
  language: Language,
  recorderMeta?: unknown,
): DisplayRound[] {
  return Object.entries(roundActions)
    .map(([roundKey, entries]) => {
      const round = Number(roundKey)
      const tokens: DisplayToken[] = []
      let order = 0

      ;(entries ?? []).forEach((entry, index) => {
        const raw = entry?.[0]?.trim()
        if (!raw) {
          return
        }

        tokens.push({
          raw,
          label: formatTokenLabel(raw, slotAssignments, language),
          key: `${round}-${order}-${raw}`,
          order,
          targetIndex: getRecorderMetaTargetIndex(
            recorderMeta,
            round,
            getRecorderAttackNumber(roundActions, round, index),
          ),
        })
        order += 1
      })

      return { round, tokens }
    })
    .filter((entry) => entry.tokens.length > 0 && Number.isFinite(entry.round))
    .sort((a, b) => a.round - b.round)
}

export function buildOperationActionDisplay(
  operation: Operation,
  language: Language,
) {
  const slotAssignments = buildSlotAssignments(operation, language)
  const result = collectRoundsFromStandardActions(
    operation,
    slotAssignments,
    language,
  ) ??
    collectRoundsFromSimingActions(operation, slotAssignments, language) ?? {
      rounds: [],
      isSiming: false,
    }

  return { ...result, slotAssignments }
}

function buildSlotAssignments(
  operation: Operation,
  language: Language,
): SlotAssignments {
  const assignments: SlotAssignments = {}
  const opers = operation.parsedContent.opers ?? []
  for (let slot = 1; slot <= 5; slot += 1) {
    const operator = opers[slot - 1]
    if (operator?.name) {
      const localized = getLocalizedOperatorName(operator.name, language)
      assignments[slot] = {
        rawName: operator.name,
        name: localized,
      }
    }
  }
  return assignments
}

function formatTokenLabel(
  token: string,
  slotAssignments: SlotAssignments,
  language: Language,
): string {
  const trimmed = token.trim()
  if (!trimmed) {
    return language === 'zh_tw' ? 'Unspecified Action' : '未设定动作'
  }

  const baseMatch = trimmed.match(/^(\d)([普大下]|sp)$/)
  if (baseMatch) {
    const slot = Number(baseMatch[1])
    const symbol = baseMatch[2] as BasicActionSymbol
    return buildSlotLabel(
      slotAssignments,
      slot,
      symbolToActionLabel(symbol, language),
      language,
    )
  }

  if (trimmed.startsWith('额外:')) {
    const payload = trimmed.slice('额外:'.length)
    if (payload.startsWith('等待:')) {
      const wait = payload.split(':')[1] ?? '0'
      return language === 'zh_tw'
        ? `Extra: Wait ${wait}ms`
        : `额外:等待 ${wait}ms`
    }
    const againMatch = payload.match(/^(\d)([普大下]|sp)$/)
    if (againMatch) {
      const slot = Number(againMatch[1])
      const symbol = againMatch[2] as BasicActionSymbol
      const label = symbolToActionLabel(symbol, language)
      const slotLabel = buildSlotLabel(slotAssignments, slot, label, language)
      return language === 'zh_tw' ? `Extra: ${slotLabel}` : `额外:${slotLabel}`
    }
    if (payload === '左侧目标') {
      return language === 'zh_tw'
        ? 'Extra: Switch to Left Target'
        : '额外:左侧目标'
    }
    if (payload === '右侧目标') {
      return language === 'zh_tw'
        ? 'Extra: Switch to Right Target'
        : '额外:右侧目标'
    }
    if (payload === '关卡内互动') {
      return language === 'zh_tw' ? '額外:互動' : '额外:关卡内互动'
    }
    return language === 'zh_tw' ? `Extra: ${payload}` : `额外:${payload}`
  }

  if (trimmed.startsWith('重开:')) {
    const rest = trimmed.slice('重开:'.length)
    if (rest === '全灭') {
      return language === 'zh_tw' ? 'Restart: Full Team' : trimmed
    }
    if (rest === '左上角') {
      return language === 'zh_tw' ? 'Restart: Manual' : trimmed
    }
    if (rest === '无橙星') {
      return language === 'zh_tw' ? 'Restart: No Orange Star' : trimmed
    }
    if (rest === '无紫星') {
      return language === 'zh_tw' ? 'Restart: No Purple Star' : trimmed
    }
    if (rest === '无蓝星') {
      return language === 'zh_tw' ? 'Restart: No Blue Star' : trimmed
    }
    return language === 'zh_tw' ? `Restart: ${rest}` : trimmed
  }

  return trimmed
}

function buildSlotLabel(
  slotAssignments: SlotAssignments,
  slot: number,
  actionLabel: string | undefined,
  language: Language,
): string {
  const name = slotAssignments[slot]?.name?.trim()
  const slotLabel = language === 'zh_tw' ? `Slot ${slot}` : `${slot}号位`
  const separator = name ? (language === 'zh_tw' ? ' · ' : '·') : ''
  const base = name ? `${slotLabel}${separator}${name}` : slotLabel
  if (!actionLabel) {
    return base
  }
  return language === 'zh_tw'
    ? `${base} (${actionLabel})`
    : `${base}（${actionLabel}）`
}

function symbolToActionLabel(
  symbol: BasicActionSymbol,
  language: Language,
): string {
  if (language === 'zh_tw') {
    if (symbol === '普') return 'Normal Attack'
    if (symbol === '大') return 'Ultimate'
    if (symbol === '下') return 'Defense'
    return 'SP'
  }
  if (symbol === '普') return '普攻'
  if (symbol === '大') return '大招'
  if (symbol === '下') return '下拉'
  return '圈'
}

export function groupTokensForTable(
  tokens: DisplayToken[],
  slotAssignments: SlotAssignments,
) {
  const rawActions: string[][] = tokens.map((t) => [t.raw])
  const { slotMap, others } = groupTokensBySlotWithExtraAttribution(
    rawActions,
    {
      slotAssignments,
    },
  )
  const mappedSlotMap: Partial<Record<SlotKey, DisplayToken[]>> = {}
  ;(Object.keys(slotMap) as SlotKey[]).forEach((slot) => {
    const entries = slotMap[slot] ?? []
    mappedSlotMap[slot] = entries
      .map((e) => tokens[e.index])
      .filter(
        Boolean as unknown as (
          t: DisplayToken | undefined,
        ) => t is DisplayToken,
      )
  })
  const mappedOthers: DisplayToken[] = others
    .map((e) => tokens[e.index])
    .filter(
      Boolean as unknown as (t: DisplayToken | undefined) => t is DisplayToken,
    )

  return { slotMap: mappedSlotMap, others: mappedOthers }
}

export function formatTokenSummary(
  rawToken: string,
  language: Language,
): string {
  const token = rawToken.trim()
  if (!token) {
    return language === 'zh_tw' ? '未設定' : '未设定'
  }

  const baseMatch = token.match(/^(\d)([普大下]|sp)$/)
  if (baseMatch) {
    const symbol = baseMatch[2] as BasicActionSymbol
    return BASIC_ACTION_SUMMARY_MAP[symbol]
  }

  if (token.startsWith('额外:')) {
    const payload = token.slice('额外:'.length)
    const againMatch = payload.match(/^([1-5])([普大下]|sp)$/)
    if (againMatch) {
      const symbol = againMatch[2] as BasicActionSymbol
      const prefix = language === 'zh_tw' ? '再動·' : '再动·'
      return `${prefix}${BASIC_ACTION_SUMMARY_MAP[symbol]}`
    }

    if (payload.startsWith('等待:')) {
      const wait = payload.split(':')[1] ?? ''
      const base = `等待 ${wait}ms`
      return language === 'zh_tw' ? convertToTraditional(base) : base
    }

    if (payload === '左侧目标') {
      return language === 'zh_tw' ? '切換左側目標' : '切换左侧目标'
    }
    if (payload === '右侧目标') {
      return language === 'zh_tw' ? '切換右側目標' : '切换右侧目标'
    }
    if (payload === '吕布' || payload === '吕布·切换形态') {
      return language === 'zh_tw' ? '呂布切換' : '吕布切换'
    }
    if (
      payload === '开自动' ||
      payload === '开启自动' ||
      payload.toLowerCase() === 'auto'
    ) {
      return language === 'zh_tw' ? '開啟自動' : '开启自动'
    }
    if (payload === '史子眇sp') {
      return '史子眇sp'
    }
    if (payload === '关卡内互动') {
      return language === 'zh_tw' ? '互動' : '关卡内互动'
    }

    return language === 'zh_tw' ? convertToTraditional(payload) : payload
  }

  if (token.startsWith('重开:')) {
    if (token === '重开:无橙星') {
      return language === 'zh_tw' ? '無橙星' : '无橙星'
    }
    if (token === '重开:无紫星') {
      return language === 'zh_tw' ? '無紫星' : '无紫星'
    }
    if (token === '重开:无蓝星') {
      return language === 'zh_tw' ? '無藍星' : '无蓝星'
    }
    if (token === '重开:左上角') {
      return language === 'zh_tw' ? '左上角重開' : '左上角重开'
    }
    if (token === '重开:全灭') {
      return language === 'zh_tw' ? '全滅重開' : '全灭重开'
    }
    if (token.startsWith('重开:检测')) {
      const rest = token.replace('重开:', '')
      return language === 'zh_tw' ? convertToTraditional(rest) : rest
    }
    const rest = token.slice('重开:'.length)
    return language === 'zh_tw' ? convertToTraditional(rest) : rest
  }

  return language === 'zh_tw' ? convertToTraditional(token) : token
}

function convertToTraditional(input: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/额外/g, '額外'],
    [/再动/g, '再動'],
    [/动作/g, '動作'],
    [/切换/g, '切換'],
    [/左侧/g, '左側'],
    [/右侧/g, '右側'],
    [/吕布/g, '呂布'],
    [/开自动/g, '開自動'],
    [/开启/g, '開啟'],
    [/自动/g, '自動'],
    [/无/g, '無'],
    [/灭/g, '滅'],
    [/重开/g, '重開'],
    [/检测/g, '檢測'],
    [/号位/g, '號位'],
    [/阵亡/g, '陣亡'],
    [/设定/g, '設定'],
  ]
  return replacements.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    input,
  )
}

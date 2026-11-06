import { Button, Callout, NonIdealState } from '@blueprintjs/core'
import { Tooltip2 } from '@blueprintjs/popover2'

import { useLevels } from 'apis/level'
import { UseOperationsParams, useOperations } from 'apis/operation'
import { useAtomValue } from 'jotai'
import {
  ComponentType,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { sunkEnabledAtom } from 'store/operationPrefs'
import { neoLayoutAtom } from 'store/pref'
import { moveSunkOperationsToBottom } from 'store/sunkOperations'

import { useTranslation } from '../i18n/i18n'
import {
  findLevelByStageName,
  getNextLevelEndTime,
  isLevelWithinTimeRange,
} from '../models/level'
import { Operation } from '../models/operation'
import {
  OperatorMatcherFilter,
  getOperationMatchResult,
} from '../models/operatorMatcher'
import { NeoOperationCard, OperationCard } from './OperationCard'
import { withSuspensable } from './Suspensable'
import { AddToOperationSetButton } from './operation-set/AddToOperationSet'

interface OperationListProps extends UseOperationsParams {
  operatorMatcher?: OperatorMatcherFilter
  multiselect?: boolean
  showReadStatus?: boolean
  sunkOperationIds?: number[]
  onUpdate?: (params: { total: number }) => void
  /**
   * 扩展：在多选模式下渲染额外的批量操作按钮（如批量删除）。
   * 仅在 multiselect=true 时生效。
   */
  renderMultiSelectActions?: (params: {
    selectedOperations: Operation[]
    clearSelection: () => void
  }) => ReactNode
  /**
   * 客户端过滤：根据 metadata.sourceType 过滤（original | repost）
   * 若未指定则不过滤。
   */
  sourceTypeFilter?: 'original' | 'repost'
  /**
   * 首页按排序浏览时隐藏不在关卡时间范围内的作业。
   */
  hideInactiveLevels?: boolean
}

export const OperationList: ComponentType<OperationListProps> = withSuspensable(
  ({
    multiselect,
    showReadStatus,
    sunkOperationIds,
    onUpdate,
    renderMultiSelectActions,
    sourceTypeFilter,
    hideInactiveLevels,
    operatorMatcher,
    ...params
  }) => {
    const t = useTranslation()
    const neoLayout = useAtomValue(neoLayoutAtom)
    const sunkEnabled = useAtomValue(sunkEnabledAtom)
    const { data: levels, isLoading: levelsLoading } = useLevels()
    const [levelTimeVersion, setLevelTimeVersion] = useState(0)

    const { operations, total, setSize, isValidating, isReachingEnd, error } =
      useOperations({
        ...params,
        suspense: true,
      })

    // make TS happy: we got Suspense out there
    if (!operations) throw new Error('unreachable')

    const matchResults = useMemo(
      () =>
        new Map(
          operations.map((operation) => [
            operation.id,
            operatorMatcher
              ? getOperationMatchResult(
                  operation,
                  operatorMatcher.snapshot,
                  operatorMatcher.excludedOperatorIds,
                )
              : undefined,
          ]),
        ),
      [operations, operatorMatcher],
    )
    const autoLoads = useRef(0)
    const queryKey = JSON.stringify([
      params.orderBy,
      params.keyword,
      params.levelKeyword,
      params.tags,
      params.operator,
      params.uploaderId,
      params.operationIds,
    ])
    useEffect(() => {
      autoLoads.current = 0
    }, [queryKey, operatorMatcher])

    useEffect(() => {
      onUpdate?.({ total })
    }, [total, onUpdate])

    const [selectedOperations, setSelectedOperations] = useState<Operation[]>(
      [],
    )
    const updateSelection = (add: Operation[], remove: Operation[]) => {
      setSelectedOperations((old) => {
        return [
          ...old.filter((op) => !remove.some((o) => o.id === op.id)),
          ...add.filter((op) => !old.some((o) => o.id === op.id)),
        ]
      })
    }
    const onSelect = (operation: Operation, selected: boolean) => {
      if (selected) {
        updateSelection([operation], [])
      } else {
        updateSelection([], [operation])
      }
    }

    const shouldHideInactiveLevels =
      !!hideInactiveLevels &&
      !levelsLoading &&
      !params.keyword?.trim() &&
      !params.levelKeyword?.trim() &&
      !params.uploaderId &&
      !params.operationIds?.length &&
      !params.tags?.length &&
      !params.operator &&
      !operatorMatcher

    useEffect(() => {
      if (!shouldHideInactiveLevels) return

      const now = Date.now()
      const nextEndTime = getNextLevelEndTime(levels ?? [], now)
      if (nextEndTime === undefined) return

      // 浏览器 setTimeout 的可靠上限约为 2^31-1 ms；更远的时间先低频唤醒再重排。
      const maxDelay = 2_147_000_000
      const delay = Math.min(Math.max(nextEndTime - now + 1, 1), maxDelay)
      const timer = window.setTimeout(() => {
        setLevelTimeVersion((version) => version + 1)
      }, delay)

      return () => window.clearTimeout(timer)
    }, [levels, levelTimeVersion, shouldHideInactiveLevels])

    // 根据需要进行客户端过滤（例如按来源：原创/搬运）
    const displayedOperations = (
      sourceTypeFilter
        ? operations.filter(
            (op) => op.metadata?.sourceType === sourceTypeFilter,
          )
        : operations
    ).filter((op) => {
      if (
        operatorMatcher &&
        !operatorMatcher.modes.includes(matchResults.get(op.id)!.mode)
      )
        return false
      if (shouldHideInactiveLevels) {
        // ponytail: linear matching is enough for one page; use a stage map if level data grows.
        const level = findLevelByStageName(
          levels ?? [],
          op.preLevel?.stageId ||
            op.preLevel?.levelId ||
            op.parsedContent.stageName,
        )
        if (level && !isLevelWithinTimeRange(level)) return false
      }

      if (!params.tags?.length) return true
      const itemTags = Array.isArray(op.metadata?.tags)
        ? (op.metadata?.tags as string[])
        : []
      const normalized = params.tags
        .map((s) => (s || '').trim())
        .filter(Boolean)
      return normalized.every((t) => itemTags.includes(t))
    })

    const orderedOperations = sunkEnabled
      ? moveSunkOperationsToBottom(displayedOperations, sunkOperationIds ?? [])
      : displayedOperations

    const items: ReactNode = neoLayout ? (
      <ul
        className="grid gap-4 items-stretch"
        style={{
          gridTemplateColumns:
            'repeat(auto-fill, minmax(min(20rem, 100%), 1fr))',
        }}
      >
        {orderedOperations.map((operation) => (
          <NeoOperationCard
            operation={operation}
            key={operation.id}
            showReadStatus={showReadStatus}
            matchResult={matchResults.get(operation.id)}
            selectable={multiselect}
            selected={selectedOperations?.some((op) => op.id === operation.id)}
            onSelect={onSelect}
          />
        ))}
      </ul>
    ) : (
      <ul>
        {orderedOperations.map((operation) => (
          <OperationCard
            operation={operation}
            key={operation.id}
            showReadStatus={showReadStatus}
            matchResult={matchResults.get(operation.id)}
          />
        ))}
      </ul>
    )

    useEffect(() => {
      const pageSize = params.limit ?? 50
      if (!params.tags?.length && !shouldHideInactiveLevels && !operatorMatcher)
        return
      if (!pageSize || displayedOperations.length >= pageSize) return
      if (isReachingEnd || isValidating || error) return
      if (operatorMatcher && autoLoads.current >= 5) return
      autoLoads.current += 1
      setSize((size) => size + 1)
    }, [
      params.tags,
      params.limit,
      displayedOperations.length,
      isReachingEnd,
      isValidating,
      setSize,
      shouldHideInactiveLevels,
      operatorMatcher,
      error,
      queryKey,
    ])

    return (
      <>
        {multiselect && (
          <Callout className="mb-4 p-0 select-none">
            <div className="flex flex-wrap items-start justify-between gap-x-2">
              <details className="min-w-0 flex-1">
                <summary className="px-2 py-4 cursor-pointer hover:bg-zinc-500 hover:bg-opacity-5">
                  {t.components.OperationList.selected_jobs({
                    count: selectedOperations.length,
                  })}
                </summary>
                <div className="p-2 flex flex-wrap gap-1">
                  {selectedOperations.map((operation) => (
                    <Button
                      key={operation.id}
                      small
                      minimal
                      outlined
                      rightIcon="cross"
                      onClick={() => updateSelection([], [operation])}
                    >
                      {operation.parsedContent.doc.title}
                    </Button>
                  ))}
                </div>
              </details>
              <div className="flex flex-wrap items-center gap-1 px-2 py-2">
                <Tooltip2
                  content={t.components.OperationList.only_loaded_items}
                  placement="top"
                >
                  <Button
                    minimal
                    icon="tick"
                    onClick={() => updateSelection(displayedOperations, [])}
                  >
                    {t.components.OperationList.select_all}
                  </Button>
                </Tooltip2>
                <Button
                  minimal
                  intent="danger"
                  icon="trash"
                  onClick={() => setSelectedOperations([])}
                >
                  {t.components.OperationList.clear}
                </Button>
                <AddToOperationSetButton
                  minimal
                  outlined
                  intent="primary"
                  icon="add-to-folder"
                  disabled={selectedOperations.length === 0}
                  operationIds={selectedOperations.map((op) => op.id)}
                >
                  {t.components.OperationList.add_to_job_set}
                </AddToOperationSetButton>
                {renderMultiSelectActions?.({
                  selectedOperations,
                  clearSelection: () => setSelectedOperations([]),
                })}
              </div>
            </div>
          </Callout>
        )}

        {operatorMatcher && (
          <p className="mb-3 text-sm" aria-live="polite">
            {t.components.OperatorMatcher.loaded({
              matched: displayedOperations.length,
              loaded: operations.length,
            })}
            {!isReachingEnd && <> {t.components.OperatorMatcher.more_hint}</>}
          </p>
        )}
        {items}

        {isReachingEnd && displayedOperations.length === 0 && (
          <NonIdealState
            icon="slash"
            title={t.components.OperationList.no_jobs_found}
            description={t.components.OperationList.sad_face}
          />
        )}

        {isReachingEnd && displayedOperations.length !== 0 && (
          <div className="mt-8 w-full tracking-wider text-center select-none text-slate-500">
            {t.components.OperationList.reached_bottom}
          </div>
        )}

        {!isReachingEnd && (
          <Button
            loading={isValidating}
            text={t.components.OperationList.load_more}
            icon="more"
            className="mt-2"
            large
            fill
            onClick={() => {
              autoLoads.current = 0
              void setSize((size) => size + 1)
            }}
          />
        )}
      </>
    )
  },
  {
    // tags 变化应触发重试
    retryOnChange: [
      'orderBy',
      'keyword',
      'levelKeyword',
      'operator',
      'tags',
      'operatorMatcher',
    ],
  },
)

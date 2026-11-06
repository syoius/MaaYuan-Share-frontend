import {
  Button,
  ButtonGroup,
  Card,
  Collapse,
  Divider,
  H6,
  InputGroup,
  Tab,
  Tabs,
} from '@blueprintjs/core'
import { IconNames } from '@blueprintjs/icons'
import { Tooltip2 } from '@blueprintjs/popover2'

import {
  UseOperationsParams,
  deleteOperation,
  useRefreshOperations,
} from 'apis/operation'
import clsx from 'clsx'
import { useAtomValue } from 'jotai'
import { debounce } from 'lodash-es'
import { ComponentType, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { Confirm } from 'components/Confirm'
import { withGlobalErrorBoundary } from 'components/GlobalErrorBoundary'
import { LevelSelectButton } from 'components/LevelSelectButton'
import { OperationList } from 'components/OperationList'
import { OperatorFilter, useOperatorFilter } from 'components/OperatorFilter'
import { UserFilter } from 'components/UserFilter'
import { AdminOperationSetList } from 'components/admin/AdminOperationSetList'
import { OperationDrawer } from 'components/drawer/OperationDrawer'

import { TagsFilter } from '../components/TagsFilter'
import { mapQuickPresetToTags } from '../constants/tags'
import { useTranslation } from '../i18n/i18n'
import { authAtom, isAdmin } from '../store/auth'
import { useCurrentSize } from '../utils/useCurrenSize'

export const AdminPage: ComponentType = withGlobalErrorBoundary(() => {
  const t = useTranslation()
  const auth = useAtomValue(authAtom)
  const { isMD } = useCurrentSize()

  if (!isAdmin(auth)) {
    return <Navigate to="/" replace />
  }

  const refreshOperations = useRefreshOperations()
  const [tab, setTab] = useState<'operation' | 'operationSet'>('operation')
  // 移动端筛选区默认折叠，展开由用户手动触发；桌面端保持展开（见下方 isMD ? ... 渲染）
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  const [queryParams, setQueryParams] = useState<
    Omit<UseOperationsParams, 'operator'>
  >({
    limit: 20,
    orderBy: 'id',
    descending: true,
  })
  const debouncedSetQueryParams = useMemo(
    () => debounce(setQueryParams, 500),
    [],
  )

  const { operatorFilter, setOperatorFilter } = useOperatorFilter()
  const [selectedStageId, setSelectedStageId] = useState<string>('')
  // tags 多选 AND
  const [tags, setTags] = useState<string[]>([])
  // 元数据来源过滤：原创/搬运
  const [sourceTypeFilter, setSourceTypeFilter] = useState<
    'original' | 'repost' | undefined
  >(undefined)

  return (
    <div className="px-4 pb-16 mt-4 md:px-8 md:mt-8 max-w-[96rem] mx-auto">
      <Card className="flex flex-col mb-4">
        <div className="mb-6 flex items-center">
          <Tabs
            className="pl-2 [&>div]:space-x-2 [&>div]:space-x-reverse"
            id="admin-operation-tabs"
            large
            selectedTabId={tab}
            onChange={(newTab) =>
              setTab(newTab as 'operation' | 'operationSet')
            }
          >
            <Tab
              className={clsx(
                'text-inherit',
                tab !== 'operation' && 'opacity-75',
              )}
              id="operation"
              title={t.components.Operations.operations}
            />
            <Divider className="self-center h-[1em]" />
            <Tab
              className={clsx(
                'text-inherit',
                tab !== 'operationSet' && 'opacity-75',
              )}
              id="operationSet"
              title={t.components.Operations.operation_sets}
            />
          </Tabs>
        </div>

        {tab === 'operation' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <InputGroup
                className="w-full sm:max-w-md [&>input]:!rounded-md"
                placeholder={t.components.Operations.search_placeholder}
                leftIcon="search"
                size={32}
                large
                type="search"
                enterKeyHint="search"
                defaultValue={queryParams.keyword}
                onChange={(e) =>
                  debouncedSetQueryParams((old) => ({
                    ...old,
                    keyword: e.target.value.trim(),
                  }))
                }
                onBlur={() => debouncedSetQueryParams.flush()}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.nativeEvent.isComposing &&
                    event.keyCode !== 229
                  ) {
                    event.preventDefault()
                    debouncedSetQueryParams.flush()
                  }
                }}
              />
              {isMD && (
                <Button
                  minimal
                  small
                  icon={filtersExpanded ? 'chevron-up' : 'filter'}
                  text={filtersExpanded ? t.common.collapse : t.common.filter}
                  onClick={() => setFiltersExpanded((v) => !v)}
                />
              )}
              <Collapse
                className="basis-full"
                isOpen={!isMD || filtersExpanded}
              >
                <div className="flex flex-wrap gap-1 items-end pt-2 sm:pt-0">
                  <LevelSelectButton
                    value={selectedStageId}
                    keyword={
                      selectedStageId ? undefined : queryParams.levelKeyword
                    }
                    onChange={(stageId) => {
                      setSelectedStageId(stageId)
                      setQueryParams((old) => ({
                        ...old,
                        levelKeyword: stageId,
                      }))
                      refreshOperations()
                    }}
                    onFilter={(kw) => {
                      setSelectedStageId('')
                      setQueryParams((old) => ({ ...old, levelKeyword: kw }))
                      refreshOperations()
                    }}
                  />
                  {/* 快捷筛选：如鸢 / 代号鸢 / 通用（映射为 AND：['如鸢','代号鸢']） */}
                  <ButtonGroup
                    minimal
                    className="flex flex-wrap items-center gap-1"
                  >
                    {[
                      {
                        label: '只看如鸢',
                        value: '如鸢',
                        icon: IconNames.MANUAL,
                      },
                      {
                        label: '只看代号鸢',
                        value: '代号鸢',
                        icon: IconNames.GLOBE,
                      },
                      {
                        label: '通用',
                        value: '通用',
                        icon: IconNames.LAYERS,
                      } as const,
                    ].map(({ label, value, icon }) => {
                      const quickTags = mapQuickPresetToTags(value)
                      const isActive =
                        tags.length === quickTags.length &&
                        quickTags.every((t) => tags.includes(t))
                      return (
                        <Button
                          key={label}
                          className="bp4-button bp4-minimal !px-3"
                          icon={icon}
                          active={isActive}
                          onClick={() => {
                            const next = isActive ? [] : quickTags
                            // 清空已选具体关卡，避免过度收窄
                            setSelectedStageId('')
                            // 仅使用 tags 作为快捷筛选；清空 levelKeyword 与自由关键字避免叠加
                            setTags(next)
                            setQueryParams((old) => ({
                              ...old,
                              levelKeyword: undefined,
                              keyword: undefined,
                            }))
                            refreshOperations()
                          }}
                        >
                          {label}
                        </Button>
                      )
                    })}
                  </ButtonGroup>
                  {/* Tags 多选 AND 过滤器 */}
                  <TagsFilter
                    value={tags}
                    onChange={(next) => {
                      setTags(next)
                      // 清空具体关卡，避免条件叠加导致无结果
                      setSelectedStageId('')
                      refreshOperations()
                    }}
                  />
                  {/* 快捷筛选：原创 / 搬运（基于 metadata.sourceType 的客户端过滤）*/}
                  <ButtonGroup
                    minimal
                    className="flex flex-wrap items-center gap-1"
                  >
                    {[
                      { label: '只看原创', value: 'original' as const },
                      { label: '只看搬运', value: 'repost' as const },
                    ].map(({ label, value }) => (
                      <Button
                        key={label}
                        className="bp4-button bp4-minimal !px-3"
                        active={sourceTypeFilter === value}
                        onClick={() => {
                          setSourceTypeFilter((old) =>
                            old === value ? undefined : value,
                          )
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </ButtonGroup>
                </div>
                <UserFilter
                  user={undefined}
                  onChange={(user) =>
                    setQueryParams((old) => {
                      if (!user) {
                        const { uploaderId: _removed, ...rest } = old
                        return rest
                      }
                      return { ...old, uploaderId: user.id }
                    })
                  }
                />
                <div className="flex flex-wrap items-center ml-auto">
                  <H6 className="mb-0 mr-1 opacity-75">
                    {t.components.Operations.sort_by}
                  </H6>
                  <div className="flex items-center">
                    {(
                      [
                        {
                          icon: 'time',
                          text: t.components.Operations.newest,
                          orderBy: 'id',
                        },
                        {
                          icon: 'flame',
                          text: t.components.Operations.popularity,
                          orderBy: 'hot',
                        },
                        {
                          icon: 'eye-open',
                          text: t.components.Operations.views,
                          orderBy: 'views',
                        },
                      ] as const
                    ).map(({ icon, text, orderBy }) => (
                      <Tooltip2 key={orderBy} placement="top" content={text}>
                        <Button
                          minimal
                          className="!px-2 !py-1 !border-none [&>.bp4-icon]:!mr-1"
                          icon={icon}
                          aria-label={text}
                          intent={
                            queryParams.orderBy === orderBy ? 'primary' : 'none'
                          }
                          onClick={() =>
                            setQueryParams((old) => ({ ...old, orderBy }))
                          }
                        />
                      </Tooltip2>
                    ))}
                  </div>
                </div>
              </Collapse>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-2">
              <OperatorFilter
                filter={operatorFilter}
                onChange={setOperatorFilter}
              />
            </div>
          </>
        )}
      </Card>

      <div className="tabular-nums">
        {tab === 'operation' && (
          <OperationList
            {...queryParams}
            tags={tags}
            multiselect
            operator={operatorFilter.enabled ? operatorFilter : undefined}
            sourceTypeFilter={sourceTypeFilter}
            renderMultiSelectActions={({
              selectedOperations,
              clearSelection,
            }) => (
              <Confirm
                intent="danger"
                confirmButtonText={t.common.delete}
                canOutsideClickCancel
                canEscapeKeyCancel
                trigger={({ handleClick }) => (
                  <Button
                    small
                    intent="danger"
                    icon="trash"
                    className="ml-2"
                    disabled={selectedOperations.length === 0}
                    onClick={handleClick}
                  >
                    {t.common.delete}
                  </Button>
                )}
                onConfirm={async () => {
                  const ids = selectedOperations.map((op) => op.id)
                  await Promise.allSettled(
                    ids.map((id) => deleteOperation({ id })),
                  )
                  clearSelection()
                  refreshOperations()
                }}
              />
            )}
          />
        )}

        {tab === 'operationSet' && <AdminOperationSetList />}
      </div>
      <OperationDrawer />
    </div>
  )
})

AdminPage.displayName = 'AdminPage'

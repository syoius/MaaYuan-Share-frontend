import {
  Button,
  ButtonGroup,
  Card,
  Divider,
  H6,
  Tab,
  Tabs,
} from '@blueprintjs/core'
import { IconNames } from '@blueprintjs/icons'

import { UseOperationsParams, useRefreshOperations } from 'apis/operation'
import clsx from 'clsx'
import { useAtom, useAtomValue } from 'jotai'
import { debounce } from 'lodash-es'
import { MaaUserInfo } from 'maa-copilot-client'
import { ComponentType, useCallback, useEffect, useMemo, useState } from 'react'

import { CardTitle } from 'components/CardTitle'
import { OperationList } from 'components/OperationList'
import { OperationSearchInput } from 'components/OperationSearchInput'
import { OperationSetList } from 'components/OperationSetList'
import { sunkEnabledAtom } from 'store/operationPrefs'
import { neoLayoutAtom } from 'store/pref'
import { sunkOperationIdsAtom } from 'store/sunkOperations'

import { mapQuickPresetToTags } from '../constants/tags'
import { useTranslation } from '../i18n/i18n'
import { useOperatorMatcher } from '../store/operatorMatcher'
// 使用悬浮式按钮选择器
import { LevelSelectButton } from './LevelSelectButton'
import { OperatorFilter, useOperatorFilter } from './OperatorFilter'
import { OperatorMatcher } from './OperatorMatcher'
import { withSuspensable } from './Suspensable'
import { TagsFilter } from './TagsFilter'
import { UserFilter } from './UserFilter'

export const Operations: ComponentType = withSuspensable(() => {
  const t = useTranslation()
  const matcher = useOperatorMatcher()
  const [matchedCount, setMatchedCount] = useState(0)
  const handleOperationsUpdate = useCallback(
    ({ matched }: { matched: number }) => setMatchedCount(matched),
    [],
  )
  const refreshOperations = useRefreshOperations()
  const [queryParams, setQueryParams] = useState<
    Omit<UseOperationsParams, 'operator'>
  >({
    limit: 10,
    orderBy: 'hot',
  })
  const debouncedSetQueryParams = useMemo(
    () => debounce(setQueryParams, 500),
    [],
  )
  const [searchKeyword, setSearchKeyword] = useState('')

  const handleSearchKeywordChange = (keyword: string) => {
    setSearchKeyword(keyword)
    debouncedSetQueryParams((old) => ({
      ...old,
      keyword: keyword.trim(),
    }))
  }

  const handleShortCodeSelect = (shortCode: string) => {
    debouncedSetQueryParams.cancel()
    setSearchKeyword(shortCode)
    setQueryParams((old) => ({
      ...old,
      keyword: shortCode,
    }))
  }

  const { operatorFilter, setOperatorFilter } = useOperatorFilter()
  const [selectedUser, setSelectedUser] = useState<MaaUserInfo>()
  const [neoLayout, setNeoLayout] = useAtom(neoLayoutAtom)
  const sunkEnabled = useAtomValue(sunkEnabledAtom)
  const sunkOperationIds = useAtomValue(sunkOperationIdsAtom)
  const [tab, setTab] = useState<'operation' | 'operationSet'>('operation')
  const [multiselect, setMultiselect] = useState(false)
  // 独立保存已选中的具体关卡，用于按钮展示与弹层回显
  const [selectedStageId, setSelectedStageId] = useState<string>('')
  // tags 多选 AND
  const [tags, setTags] = useState<string[]>([])
  const matcherGame = matcher.filter?.snapshot.game
  useEffect(() => {
    if (matcherGame) setTags(mapQuickPresetToTags(matcherGame))
  }, [matcherGame])

  return (
    <>
      <Card className="flex flex-col mb-4">
        <CardTitle className="mb-6 flex" icon="properties">
          <Tabs
            className="pl-2 [&>div]:space-x-2 [&>div]:space-x-reverse"
            id="operation-tabs"
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
          <Button
            minimal
            icon="multi-select"
            title={t.components.Operations.enable_multi_select}
            className="ml-auto mr-2"
            active={multiselect}
            onClick={() => setMultiselect((v) => !v)}
          />
          <ButtonGroup>
            <Button
              icon="grid-view"
              active={neoLayout}
              onClick={() => setNeoLayout(true)}
            />
            <Button
              icon="list"
              active={!neoLayout}
              onClick={() => setNeoLayout(false)}
            />
          </ButtonGroup>
        </CardTitle>
        {tab === 'operation' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <OperationSearchInput
                value={searchKeyword}
                size={32}
                onChange={handleSearchKeywordChange}
                onBlur={() => debouncedSetQueryParams.flush()}
                onSubmit={() => debouncedSetQueryParams.flush()}
                onShortCodeSelect={handleShortCodeSelect}
              />
              <div className="flex flex-wrap gap-1 items-end w-full md:w-auto">
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
                    // 主动触发一次刷新，确保立刻发起查询
                    refreshOperations()
                  }}
                  onFilter={(kw) => {
                    setSelectedStageId('')
                    setQueryParams((old) => ({
                      ...old,
                      levelKeyword: kw,
                    }))
                    // 主动触发一次刷新，确保立刻发起查询
                    refreshOperations()
                  }}
                />
                {/* 快捷筛选：如鸢 / 代号鸢 / 通用（AND） */}
                <ButtonGroup
                  minimal
                  className="flex flex-wrap items-center gap-1 justify-between w-full md:w-auto"
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
                    // { label: "通用", value: "通用", icon: IconNames.LAYERS } as const,
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
                          setTags(next)
                          refreshOperations()
                        }}
                      >
                        {label}
                      </Button>
                    )
                  })}
                </ButtonGroup>
                {/* Tags 多选 AND 过滤器（首页隐藏） */}
                <TagsFilter
                  className="hidden"
                  value={tags}
                  onChange={(next) => {
                    setTags(next)
                    setSelectedStageId('')
                    refreshOperations()
                  }}
                />
                <UserFilter
                  user={selectedUser}
                  onChange={(user) => {
                    setSelectedUser(user)
                    setQueryParams((old) => ({
                      ...old,
                      uploaderId: user?.id,
                    }))
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              <OperatorFilter
                className=""
                filter={operatorFilter}
                onChange={setOperatorFilter}
              />
              <OperatorMatcher
                key={matcher.userId ?? 'guest'}
                {...matcher}
                matchedCount={matcher.filter ? matchedCount : undefined}
              />
              <div className="flex flex-wrap items-center w-full sm:w-auto sm:ml-auto">
                <H6 className="mb-0 mr-1 opacity-75">
                  {t.components.Operations.sort_by}
                </H6>
                <ButtonGroup
                  minimal
                  className="flex-wrap flex-1 sm:flex-none justify-between"
                >
                  {(
                    [
                      {
                        icon: 'flame',
                        text: t.components.Operations.popularity,
                        orderBy: 'hot',
                        active: queryParams.orderBy === 'hot',
                      },
                      {
                        icon: 'time',
                        text: t.components.Operations.newest,
                        orderBy: 'id',
                        active: queryParams.orderBy === 'id',
                      },
                      {
                        icon: 'eye-open',
                        text: t.components.Operations.views,
                        orderBy: 'views',
                        active: queryParams.orderBy === 'views',
                      },
                    ] as const
                  ).map(({ icon, text, orderBy, active }) => (
                    <Button
                      key={orderBy}
                      className={clsx(
                        '!px-2 !py-1 !border-none [&>.bp4-icon]:!mr-1',
                        !active && 'opacity-75 !font-normal',
                      )}
                      icon={icon}
                      intent={active ? 'primary' : 'none'}
                      onClick={() => {
                        setQueryParams((old) => ({ ...old, orderBy }))
                      }}
                    >
                      {text}
                    </Button>
                  ))}
                </ButtonGroup>
              </div>
            </div>
          </>
        )}

        {tab === 'operationSet' && (
          <div className="flex flex-wrap items-center gap-2">
            <OperationSearchInput
              value={searchKeyword}
              size={64}
              onChange={handleSearchKeywordChange}
              onBlur={() => debouncedSetQueryParams.flush()}
              onSubmit={() => debouncedSetQueryParams.flush()}
              onShortCodeSelect={handleShortCodeSelect}
            />
            <UserFilter
              user={selectedUser}
              onChange={(user) => {
                setSelectedUser(user)
                setQueryParams((old) => ({
                  ...old,
                  uploaderId: user?.id,
                }))
              }}
            />
          </div>
        )}
      </Card>

      <div className="tabular-nums">
        {tab === 'operation' && (
          <OperationList
            {...queryParams}
            tags={tags}
            hideInactiveLevels
            multiselect={multiselect}
            showReadStatus
            sunkOperationIds={sunkEnabled ? sunkOperationIds : []}
            operator={operatorFilter.enabled ? operatorFilter : undefined}
            operatorMatcher={matcher.filter}
            onUpdate={handleOperationsUpdate}
            // 按热度排序时列表前几页的变化不会太频繁，可以不刷新第一页，节省点流量
            revalidateFirstPage={queryParams.orderBy !== 'hot'}
          />
        )}
        {tab === 'operationSet' && (
          <OperationSetList
            {...queryParams}
            creatorId={queryParams.uploaderId}
          />
        )}
      </div>
    </>
  )
})
Operations.displayName = 'Operations'

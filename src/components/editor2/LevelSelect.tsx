import { Classes, InputGroup, MenuItem, Tag } from '@blueprintjs/core'
import { getCreateNewItem } from '@blueprintjs/select'

import clsx from 'clsx'
import Fuse from 'fuse.js'
import {
  FC,
  ReactNode,
  Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useLevels } from '../../apis/level'
import { i18n, useTranslation } from '../../i18n/i18n'
import {
  compareLevelsByEndTime,
  compareLevelsForDisplay,
  createCustomLevel,
  findLevelByStageName,
  isCustomLevel,
  isHardMode,
} from '../../models/level'
import { Level, OpDifficulty } from '../../models/operation'
import { formatError } from '../../utils/error'
import { useDebouncedQuery } from '../../utils/useDebouncedQuery'
import { Suggest } from '../Suggest'
import { NumericInput2 } from '../editor/NumericInput2'
import {
  DEFAULT_REC_TARGET_OFFSET,
  REC_TARGET_OFFSET_PRESETS,
  RecTargetOffset,
} from './siming/recTargetOffset'

interface LevelSelectProps {
  className?: string
  difficulty?: OpDifficulty
  name?: string
  inputRef?: Ref<HTMLInputElement>
  disabled?: boolean
  value?: string
  fallbackLevel?: Level
  onChange: (stageId: string, level?: Level) => void
  onDifficultyChange?: (value: OpDifficulty, programmatically: boolean) => void
  // 当选择了“游戏”或“分类”时，上抛一个用于筛选的关键字
  onFilterChange?: (keyword: string, meta?: { catOne?: string }) => void
  initialQuery?: string
  onSearchQueryChange?: (query: string) => void
  defaultCategory?: string
  // 自定义 Portal 容器，确保下拉菜单渲染在 Overlay 容器内，避免被判定为“外部点击”
  portalContainer?: HTMLElement | undefined | null
  // 额外的右侧内容（如第三层分类输入），将渲染在同一行的最右侧
  rightExtra?: ReactNode
  activityLevelRecognitionName?: string
  onActivityLevelRecognitionNameChange?: (value: string) => void
  recTargetOffset?: RecTargetOffset
  onRecTargetOffsetChange?: (value: RecTargetOffset) => void
  activityDifficultyOverride?: string
  onActivityDifficultyOverrideChange?: (value: string) => void
}

export const LevelSelect: FC<LevelSelectProps> = ({
  className,
  inputRef,
  disabled,
  value,
  fallbackLevel,
  onChange,
  onFilterChange,
  initialQuery,
  onSearchQueryChange,
  defaultCategory,
  portalContainer,
  rightExtra,
  activityLevelRecognitionName,
  onActivityLevelRecognitionNameChange,
  recTargetOffset,
  onRecTargetOffsetChange,
  activityDifficultyOverride,
  onActivityDifficultyOverrideChange,
  ...inputProps
}) => {
  const t = useTranslation()
  const relatedLevelsLabel = i18n.components.editor2.LevelSelect.related_levels
  // we are going to manually handle loading state so we could show the skeleton state easily,
  // without swapping the actual element.
  const { data, error: fetchError, isLoading } = useLevels()
  const levels = useMemo(
    () =>
      data
        // to simplify the list, we only show levels in normal mode
        .filter((level) => !isHardMode(level.stageId))
        .sort(compareLevelsForDisplay),
    [data],
  )
  const fuse = useMemo(
    () =>
      new Fuse(levels, {
        keys: ['name', 'catOne', 'catTwo', 'catThree', 'stageId'],
        threshold: 0.3,
      }),
    [levels],
  )

  const { query, debouncedQuery, updateQuery, onOptionMouseDown } =
    useDebouncedQuery({
      onDebouncedQueryChange: (value) => {
        if (value !== debouncedQuery) {
          // 清空 activeItem，之后会自动设置为第一项
          setActiveItem(null)
        }
      },
    })
  useEffect(() => {
    if (initialQuery !== undefined) updateQuery(initialQuery, true)
  }, [initialQuery, updateQuery])

  const [activeItem, setActiveItem] = useState<Level | 'createNewItem' | null>(
    null,
  )
  const [sortNow, setSortNow] = useState(Date.now)

  // 标记：用户是否主动点击了 X 清除按钮，避免 fallback effect 立即恢复显示
  const clearedByUserRef = useRef(false)

  const selectedLevel = useMemo(() => {
    if (!value) return null
    const fromStageName = findLevelByStageName(levels, value)
    if (fromStageName) return fromStageName
    if (
      fallbackLevel &&
      (fallbackLevel.stageId === value ||
        fallbackLevel.catThree === value ||
        fallbackLevel.name === value)
    ) {
      return fallbackLevel
    }
    return createCustomLevel(value)
  }, [levels, value, fallbackLevel])

  const getLevelCategory = useCallback(
    (level: Level) =>
      level.catOne?.trim() ||
      level.catTwo?.trim() ||
      level.catThree?.trim() ||
      relatedLevelsLabel,
    [relatedLevelsLabel],
  )

  // 已移除游戏层，不再构建游戏维度选项

  const categories = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const level of levels) {
      const category = getLevelCategory(level)
      if (!seen.has(category)) {
        seen.add(category)
        result.push(category)
      }
    }
    if (selectedLevel && !isCustomLevel(selectedLevel)) {
      const category = getLevelCategory(selectedLevel)
      if (!seen.has(category)) {
        seen.add(category)
        result.push(category)
      }
    }
    return result
  }, [getLevelCategory, levels, selectedLevel])

  const normalizedDefaultCategory = (defaultCategory ?? '').trim()
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    if (selectedLevel) {
      return getLevelCategory(selectedLevel)
    }
    // 没有关卡时，尝试使用父组件传入的默认分类以便回显
    return normalizedDefaultCategory
  })

  // 标记：用户是否手动选择过分类，避免后续默认值/下级选择回写覆盖
  const categoryEditedRef = useRef(false)
  // 标记：仅在初次挂载/首次有选中关卡时，从关卡类别回显一次到分类
  const hydratedCategoryRef = useRef(false)

  useEffect(() => {
    if (selectedLevel) return
    if (!normalizedDefaultCategory) return
    // 若用户已手动选择过分类，则不再用默认分类覆盖
    if (categoryEditedRef.current) return
    setSelectedCategory(normalizedDefaultCategory)
  }, [normalizedDefaultCategory, selectedLevel])

  // 取消自动选择首个分类，避免“强制重置”

  const categoryOptions = useMemo(() => {
    if (!selectedCategory) {
      return categories
    }
    if (categories.includes(selectedCategory)) {
      return categories
    }
    return [...categories, selectedCategory]
  }, [categories, selectedCategory])

  const previousValueRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (value !== previousValueRef.current) {
      previousValueRef.current = value

      // 用户选择了新关卡时，重置清除标记
      if (value?.trim()) {
        clearedByUserRef.current = false
      }

      if (selectedLevel && !isCustomLevel(selectedLevel)) {
        const category = getLevelCategory(selectedLevel)
        if (category && category !== selectedCategory) {
          // 仅在尚未被用户手动选择且尚未水合过时，从关卡回显一次分类
          if (!categoryEditedRef.current && !hydratedCategoryRef.current) {
            setSelectedCategory(category)
            hydratedCategoryRef.current = true
          }
          // 将输入框填充为已选关卡的显示文案，便于直观看到当前选择
          updateQuery(formatLevelInputValue(selectedLevel), true)
        }
        return
      }
      // 不再在无选中关卡时强制设定首个分类
    }
  }, [
    categories,
    getLevelCategory,
    selectedCategory,
    selectedLevel,
    updateQuery,
    value,
  ])

  const ensureIncludesSelected = useCallback(
    (list: Level[]) => {
      if (
        selectedLevel &&
        !list.some((level) => level.stageId === selectedLevel.stageId)
      ) {
        return [selectedLevel, ...list]
      }
      return list
    },
    [selectedLevel],
  )

  const filteredLevels = useMemo(() => {
    const trimmedQuery = debouncedQuery.trim()

    if (trimmedQuery) {
      const searchResults = fuse
        .search(trimmedQuery)
        .map((el) => el.item)
        .sort((a, b) => compareLevelsByEndTime(a, b, sortNow))
      const filteredResults = selectedCategory
        ? searchResults.filter(
            (level) => getLevelCategory(level) === selectedCategory,
          )
        : searchResults
      return ensureIncludesSelected(
        filteredResults.length ? filteredResults : searchResults,
      )
    }

    const sortedLevels = [...levels].sort((a, b) =>
      compareLevelsByEndTime(a, b, sortNow),
    )

    if (selectedLevel) {
      let similarLevels: Level[] = []
      let headerName = relatedLevelsLabel

      if (selectedLevel.catOne === '剿灭作战') {
        headerName = selectedLevel.catOne
        similarLevels = sortedLevels.filter(
          (level) => level.catOne === selectedLevel.catOne,
        )
      } else if (
        selectedLevel.stageId.includes('rune') ||
        selectedLevel.stageId.includes('crisis')
      ) {
        headerName = '危机合约'
        similarLevels = sortedLevels.filter(
          (level) =>
            level.stageId.includes('rune') || level.stageId.includes('crisis'),
        )
      } else if (selectedLevel.catTwo) {
        headerName = selectedLevel.catTwo
        similarLevels = sortedLevels.filter(
          (level) => level.catTwo === selectedLevel.catTwo,
        )
      } else {
        const levelIdPrefix = selectedLevel.levelId
          .split('/')
          .slice(0, -1)
          .join('/')
        similarLevels = levelIdPrefix
          ? sortedLevels.filter((level) =>
              level.levelId.startsWith(levelIdPrefix),
            )
          : []
      }

      if (selectedCategory) {
        similarLevels = similarLevels.filter(
          (level) => getLevelCategory(level) === selectedCategory,
        )
      }

      if (similarLevels.length > 1) {
        const header = createCustomLevel('header')
        header.name = headerName
        return ensureIncludesSelected([header, ...similarLevels])
      }

      if (similarLevels.length === 1) {
        return ensureIncludesSelected(similarLevels)
      }
    }

    const levelsInCategory = selectedCategory
      ? sortedLevels.filter(
          (level) => getLevelCategory(level) === selectedCategory,
        )
      : sortedLevels

    return ensureIncludesSelected(levelsInCategory)
  }, [
    debouncedQuery,
    ensureIncludesSelected,
    fuse,
    getLevelCategory,
    levels,
    relatedLevelsLabel,
    selectedCategory,
    selectedLevel,
    sortNow,
  ])

  useEffect(() => {
    if (!selectedLevel) {
      setActiveItem(null)
    } else if (isCustomLevel(selectedLevel)) {
      setActiveItem('createNewItem')
    } else {
      setActiveItem(selectedLevel)
    }
  }, [selectedLevel])

  // 同步输入框显示为当前选中关卡，避免初次加载为空白
  useEffect(() => {
    if (selectedLevel) {
      const formatted = formatLevelInputValue(selectedLevel)
      if (formatted) {
        updateQuery(formatted, true)
      }
    }
  }, [selectedLevel, updateQuery])

  useEffect(() => {
    if (selectedLevel) {
      return
    }
    if (!fallbackLevel) {
      return
    }
    // 用户主动清除后，不从 fallbackLevel 恢复显示
    if (clearedByUserRef.current) {
      return
    }
    const formatted = formatLevelInputValue(fallbackLevel)
    if (!formatted) {
      return
    }
    updateQuery(formatted, true)
  }, [fallbackLevel, selectedLevel, updateQuery])

  const formatLevelInputValue = (level: Level) => {
    const trimmedName = level.name?.trim()
    if (trimmedName) {
      return trimmedName
    }
    return level.stageId
  }

  const formatLevelLabel = (level: Level) => {
    // 下拉项与选择后展示仅显示关卡名，若无则回退至 stageId
    if (level.stageId === 'header') return level.name
    const trimmedName = level.name?.trim()
    return trimmedName || level.stageId
  }

  const enhanceCustomLevel = useCallback(
    (level: Level): Level => {
      if (!isCustomLevel(level)) {
        return level
      }
      const trimmedName = level.name?.trim() || level.stageId
      return {
        ...level,
        catOne: selectedCategory?.trim() || level.catOne || '',
        catTwo: trimmedName,
        catThree: '',
      }
    },
    [selectedCategory],
  )

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      <div className="flex w-full flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 w-full sm:flex-1 sm:min-w-[200px] sm:max-w-[260px]">
          <Suggest<string>
            items={categoryOptions}
            itemsEqual={(a, b) => a === b}
            selectedItem={selectedCategory || null}
            disabled={disabled || isLoading || categoryOptions.length === 0}
            className="w-full"
            itemListPredicate={(search, items) => {
              const normalized = (search ?? '').trim().toLowerCase()
              if (!normalized) {
                return items
              }
              return items.filter((item) =>
                item.toLowerCase().includes(normalized),
              )
            }}
            itemRenderer={(item, { handleClick, handleFocus, modifiers }) => {
              if (modifiers.matchesPredicate === false) {
                return null
              }
              return (
                <MenuItem
                  roleStructure="listoption"
                  key={item}
                  className={clsx(modifiers.active && Classes.ACTIVE)}
                  text={item}
                  onClick={handleClick}
                  onFocus={handleFocus}
                  onMouseDown={onOptionMouseDown}
                  selected={item === selectedCategory}
                  disabled={modifiers.disabled}
                />
              )
            }}
            inputValueRenderer={(item) => item ?? ''}
            onItemSelect={(category) => {
              if (!category || category === selectedCategory) {
                return
              }
              // 用户主动选择分类
              categoryEditedRef.current = true
              setSelectedCategory(category)
              setActiveItem(null)
              updateQuery('', true)
              // 分类变化时无条件清空关卡，避免跨分类残留
              if (!disabled) {
                onChange('')
              }
              // 选择“分类”时触发一次筛选查询（仅分类关键字）
              const kw = category
              onFilterChange?.(kw, { catOne: category })
            }}
            inputProps={{
              large: true,
              placeholder:
                t.components.editor2.LevelSelect.category_placeholder,
            }}
            popoverProps={{
              minimal: true,
              captureDismiss: !onSearchQueryChange,
              ...(onSearchQueryChange ? { placement: 'top-start' as const } : {}),
              portalContainer: portalContainer ?? undefined,
            }}
          />
        </div>
        <div className="flex items-end gap-2 w-full min-w-0 max-w-[560px]">
          <Suggest<Level>
            items={levels}
            itemListPredicate={() => filteredLevels}
            activeItem={
              activeItem === 'createNewItem' ? getCreateNewItem() : activeItem
            }
            onActiveItemChange={(item, isCreateNewItem) => {
              setActiveItem(isCreateNewItem ? 'createNewItem' : item)
            }}
            resetOnQuery={false}
            query={query}
            onQueryChange={(query) => {
              updateQuery(query, false)
              onSearchQueryChange?.(query)
            }}
            onReset={() => {
              clearedByUserRef.current = true
              setActiveItem(null)
              if (!disabled) {
                onChange('')
                onSearchQueryChange?.('')
              }
            }}
            disabled={disabled || isLoading}
            className={clsx('w-full', isLoading && 'bp4-skeleton')}
            itemsEqual={(a, b) => a.stageId === b.stageId}
            itemDisabled={(item) => item.stageId === 'header'}
            itemRenderer={(item, { handleClick, handleFocus, modifiers }) => (
              <MenuItem
                roleStructure="listoption"
                key={item.stageId}
                className={clsx(modifiers.active && Classes.ACTIVE)}
                text={formatLevelLabel(item)}
                onClick={handleClick}
                onFocus={handleFocus}
                onMouseDown={onOptionMouseDown}
                selected={item === selectedLevel}
                disabled={modifiers.disabled}
              />
            )}
            inputValueRenderer={formatLevelInputValue}
            selectedItem={selectedLevel}
            onItemSelect={(level) => {
              const nextLevel = enhanceCustomLevel(level)
              if (!isCustomLevel(level)) {
                updateQuery('', true)
              }
              if (!disabled) {
                onChange(nextLevel.stageId, nextLevel)
              }
            }}
            createNewItemFromQuery={(query) => createCustomLevel(query)}
            createNewItemRenderer={(query, active, handleClick) => (
              <MenuItem
                key="create-new-item"
                roleStructure="listoption"
                className={clsx(active && Classes.ACTIVE)}
                text={`使用自定义关卡名 "${query}"`}
                icon="text-highlight"
                onClick={handleClick}
                selected={!!selectedLevel && isCustomLevel(selectedLevel)}
              />
            )}
            inputProps={{
              large: true,
              placeholder: t.components.editor2.LevelSelect.placeholder,
              inputRef,
              ...inputProps,
            }}
            popoverProps={{
              minimal: true,
              captureDismiss: !onSearchQueryChange,
              ...(onSearchQueryChange ? { placement: 'top-start' as const } : {}),
              portalContainer: portalContainer ?? undefined,
              onOpening() {
                setSortNow(Date.now())
              },
              onClosed() {
                if (!onSearchQueryChange) updateQuery('', false)
              },
            }}
          />
        </div>
        {rightExtra && (
          <div className="flex flex-col gap-1 w-full sm:flex-1 sm:min-w-[200px] sm:max-w-[260px]">
            {rightExtra}
          </div>
        )}
      </div>
      {(() => {
        const isActivityLevel = selectedLevel?.catOne === '活动'
        const isDungeonLevel = selectedLevel?.catOne === '地宫'

        if (!isActivityLevel && !isDungeonLevel) {
          return null
        }

        return (
          <>
            {isActivityLevel && onActivityDifficultyOverrideChange && (
              <div className="mt-2 flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">
                  {t.components.editor2.LevelSelect.activity_difficulty_label}
                </span>
                <InputGroup
                  large
                  placeholder={
                    t.components.editor2.LevelSelect
                      .activity_difficulty_placeholder
                  }
                  value={activityDifficultyOverride ?? ''}
                  onChange={(e) =>
                    onActivityDifficultyOverrideChange?.(e.target.value)
                  }
                />
              </div>
            )}

            {onActivityLevelRecognitionNameChange && (
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
                <div className="flex w-full flex-col gap-1 sm:w-3/5">
                  <span className="text-xs font-medium text-slate-500">
                    {
                      t.components.editor2.LevelSelect
                        .activity_level_recognition_label
                    }
                  </span>
                  <InputGroup
                    large
                    placeholder={
                      t.components.editor2.LevelSelect
                        .activity_level_recognition_placeholder
                    }
                    value={activityLevelRecognitionName ?? ''}
                    onChange={(e) =>
                      onActivityLevelRecognitionNameChange?.(e.target.value)
                    }
                  />
                </div>

                {onRecTargetOffsetChange && (
                  <div className="flex w-full min-w-0 flex-col gap-1 sm:w-2/5">
                    <span className="text-xs font-medium text-slate-500">
                      {t.components.editor2.LevelSelect.rec_target_offset_label}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {(['x', 'y', 'w', 'h'] as const).map((axis, index) => (
                        <label
                          key={axis}
                          className="flex flex-none items-center gap-1"
                        >
                          <span className="w-4 text-xs text-slate-500">
                            {axis}
                          </span>
                          <NumericInput2
                            containerClassName="flex-none"
                            inputClassName="!rounded-r-md !border-r !text-center"
                            style={{ width: '3.5rem' }}
                            intOnly
                            value={
                              (recTargetOffset ?? DEFAULT_REC_TARGET_OFFSET)[
                                index
                              ]
                            }
                            onValueChange={(nextValue) => {
                              const nextOffset: RecTargetOffset = [
                                ...(recTargetOffset ??
                                  DEFAULT_REC_TARGET_OFFSET),
                              ]
                              nextOffset[index] = Math.trunc(nextValue)
                              onRecTargetOffsetChange(nextOffset)
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <span className="text-xs text-slate-500">
                      {
                        t.components.editor2.LevelSelect
                          .rec_target_offset_helper
                      }
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {
                          t.components.editor2.LevelSelect
                            .rec_target_offset_preset_label
                        }
                      </span>
                      {REC_TARGET_OFFSET_PRESETS.map((preset) => {
                        const current =
                          recTargetOffset ?? DEFAULT_REC_TARGET_OFFSET
                        const active = preset.value.every(
                          (value, index) => value === current[index],
                        )
                        return (
                          <Tag
                            key={preset.label}
                            className={clsx(
                              'editor-preset-tag',
                              active && 'editor-preset-tag-active',
                            )}
                            interactive
                            minimal={!active}
                            intent={active ? 'primary' : 'none'}
                            onClick={() =>
                              onRecTargetOffsetChange([...preset.value])
                            }
                          >
                            {preset.label}
                            <span className="ml-1 opacity-70">
                              [{preset.value.join(', ')}]
                            </span>
                          </Tag>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )
      })()}
      {fetchError && (
        <span className="text-xs opacity-50">
          {t.components.editor2.LevelSelect.load_error({
            error: formatError(fetchError),
          })}
        </span>
      )}
    </div>
  )
}

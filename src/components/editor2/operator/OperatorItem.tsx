import { Button, Card, Classes, Icon, Menu, MenuItem } from '@blueprintjs/core'
import { Popover2 } from '@blueprintjs/popover2'

import clsx from 'clsx'
import { useSetAtom } from 'jotai'
import { clamp } from 'lodash-es'
import { FC, memo, useMemo, useState } from 'react'

import {
  ASSIST_STAR_DESCRIPTIONS,
  ASSIST_STAR_OPTIONS,
  AssistStarName,
  MAIN_STAR_OPTIONS,
  MainStarName,
  getAssistStarAvailability,
  getMainStarAvailability,
} from '../../../data/star-stones'
import { i18n, useTranslation } from '../../../i18n/i18n'
import { CopilotDocV1 } from '../../../models/copilot.schema'
import {
  findOperatorByName,
  getDefaultRequirements,
  getModuleName,
  getSkillCount,
  useLocalizedOperatorName,
  withDefaultRequirements,
} from '../../../models/operator'
import { getProfIconPath } from '../../../utils/profIcon'
import { useCurrentSize } from '../../../utils/useCurrenSize'
import { MasteryIcon } from '../../MasteryIcon'
import { OperatorAvatar } from '../../OperatorAvatar'
import { Select } from '../../Select'
import { AppToaster } from '../../Toaster'
import { SortableItemProps } from '../../dnd'
import { NumericInput2 } from '../../editor/NumericInput2'
import { EditorOperator, useEdit } from '../editor-state'
import { editorFavOperatorsAtom } from '../reconciliation'
import { OperatorDiscPresetSelect } from './OperatorDiscPresetSelect'
import { OperatorStarStonePresetSelect } from './OperatorStarStonePresetSelect'
import { getDiscSlots, setDiscSlot } from './operatorDiscModel'
import {
  OPERATOR_ELITE_MAX,
  OPERATOR_ELITE_MIN,
  OPERATOR_LEVEL_MAX,
  OPERATOR_LEVEL_MIN,
  applyAnyRequirements,
  getMaxEliteForLevel,
} from './operatorRequirementModel'

const RarityDiamond = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 0 Q14.8 9.2 24 12 Q14.8 14.8 12 24 Q9.2 14.8 0 12 Q9.2 9.2 12 0Z" />
  </svg>
)

const EMPTY_DISC_OPTION = {
  abbreviation: '未选择',
  color: undefined,
  desp: '未选择命盘',
  idx: -2,
  kind: 'empty',
} as const

const ANY_DISC_OPTION = {
  abbreviation: '任意',
  color: undefined,
  desp: '任意命盘',
  idx: -1,
  kind: 'any',
} as const

function getStats(
  operator: EditorOperator,
  _rarityFallback = 6,
): { starLevel: number; attack: number; hp: number } {
  const s = operator.extensions?.stats
  return {
    // 默认 0 星
    starLevel:
      s?.starLevel ??
      (typeof (operator as any).starLevel === 'number'
        ? (operator as any).starLevel
        : undefined) ??
      0,
    attack:
      s?.attack ??
      (typeof (operator as any).attack === 'number'
        ? (operator as any).attack
        : 0),
    hp:
      s?.hp ??
      (typeof (operator as any).hp === 'number' ? (operator as any).hp : 0),
  }
}

function setStats(
  operator: EditorOperator,
  updates: Partial<{ starLevel: number; attack: number; hp: number }>,
): EditorOperator {
  const prevStats = operator.extensions?.stats ?? {}
  const nextStats = { ...prevStats, ...updates }
  const next: EditorOperator = {
    ...operator,
    unrestricted: false,
    // 同步原方案根级字段，便于回退与导出
    ...(updates.starLevel !== undefined
      ? { starLevel: updates.starLevel }
      : {}),
    ...(updates.attack !== undefined ? { attack: updates.attack } : {}),
    ...(updates.hp !== undefined ? { hp: updates.hp } : {}),
    extensions: {
      version: 1 as const,
      ...(operator.extensions ?? {}),
      discs: operator.extensions?.discs,
      stats: nextStats,
    },
  }
  return next
}

interface OperatorItemProps extends Partial<SortableItemProps> {
  operator: EditorOperator
  onOverlay?: boolean
  centerControls?: boolean
  onChange?: (operator: EditorOperator) => void
  onRemove?: () => void
}

export const OperatorItem: FC<OperatorItemProps> = memo(
  ({
    operator,
    onRemove,
    onChange,
    onOverlay,
    centerControls,
    isDragging,
    attributes,
    listeners,
  }) => {
    const t = useTranslation()
    const { isMD } = useCurrentSize()
    const displayName = useLocalizedOperatorName(operator.name)
    const setFavOperators = useSetAtom(editorFavOperatorsAtom)
    const info = findOperatorByName(operator.name)
    const edit = useEdit()

    const controlsEnabled = true
    const requirements = useMemo(
      () => withDefaultRequirements(operator.requirements, info?.rarity),
      [operator.requirements, info?.rarity],
    )
    const skillCount = useMemo(() => (info ? getSkillCount(info) : 0), [info])
    const [skillLevels, setSkillLevels] = useState<Record<number, number>>({})
    const discList = useMemo(() => info?.discs ?? [], [info])
    const discOptions = useMemo(
      () => [
        EMPTY_DISC_OPTION,
        ANY_DISC_OPTION,
        ...discList.map((disc, idx) => ({
          ...disc,
          idx,
          kind: 'disc' as const,
        })),
      ],
      [discList],
    )
    const discSlots = getDiscSlots(operator)

    const discColorClasses = (color?: string) => {
      switch (color) {
        case '金':
          return '!bg-yellow-100 dark:!bg-yellow-900 dark:!text-yellow-200 !text-yellow-800'
        case '紫':
          return '!bg-purple-100 dark:!bg-purple-900 dark:!text-purple-200 !text-purple-800'
        case '蓝':
          return '!bg-blue-100 dark:!bg-blue-900 dark:!text-blue-200 !text-blue-800'
        case '橙':
          return '!bg-orange-100 dark:!bg-orange-900 dark:!text-orange-200 !text-orange-800'
        default:
          return '!bg-gray-300 dark:!bg-gray-600 opacity-15 dark:opacity-25 hover:opacity-30 dark:hover:opacity-50'
      }
    }

    return (
      <div
        className={clsx(
          'relative flex flex-col gap-1',
          !onOverlay && 'w-full',
          isDragging && 'invisible',
        )}
      >
        <div className="relative self-center flex flex-col items-center">
          <Popover2
            // 维持全屏灰幕时，确保弹层通过 Portal 且层级高于遮罩
            usePortal={true}
            popoverClassName="z-[1600]"
            portalClassName="z-[1600]"
            placement="top"
            content={
              <Menu>
                <MenuItem
                  icon="star"
                  text={t.components.editor2.OperatorItem.add_to_favorites}
                  onClick={() => {
                    setFavOperators((prev) => [...prev, operator])
                    AppToaster.show({
                      message:
                        t.components.editor2.OperatorItem.added_to_favorites,
                      intent: 'success',
                    })
                  }}
                />
                <MenuItem
                  icon="trash"
                  text={t.common.delete}
                  intent="danger"
                  onClick={onRemove}
                />
              </Menu>
            }
          >
            <Card
              interactive
              className="card-shadow-subtle relative w-20 p-0 !py-0 flex flex-col items-center overflow-hidden select-none pointer-events-auto"
              {...attributes}
              {...listeners}
            >
              <OperatorAvatar
                id={info?.id}
                rarity={info?.rarity}
                className="w-20 h-20 rounded-b-none"
                fallback={displayName}
              />
              <h4
                className={clsx(
                  'm-1 leading-4 font-semibold tracking-tighter text-center pointer-events-none',
                  displayName.length >= 12 && 'text-xs',
                )}
              >
                {displayName}
              </h4>
              {info && !info.prof.includes('TOKEN') && (
                <img
                  className="absolute top-0 right-0 w-5 h-5 p-px bg-gray-600 pointer-events-none"
                  src={getProfIconPath(info.prof[0])}
                  alt={info.prof[0]}
                />
              )}
            </Card>
          </Popover2>
          {/* 星级（5星可点，默认0；重复点击当前星 -> 0）——移出 Card，避免误触头像/名字 */}
          <div className="mt-2 flex items-center justify-center gap-1 select-none">
            {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => {
              const current = clamp(
                getStats(operator, info?.rarity).starLevel ?? 0,
                0,
                5,
              )
              const filled = n <= current
              return (
                <button
                  key={'star-' + n}
                  type="button"
                  title={`星级 ${n}`}
                  className={clsx(
                    'w-7 h-7 min-w-7 min-h-7 p-0 inline-flex items-center justify-center',
                    'transition-opacity',
                    filled
                      ? 'opacity-100 text-yellow-500'
                      : 'opacity-40 text-gray-500',
                  )}
                  onClick={() =>
                    edit(() => {
                      const cur =
                        getStats(operator, info?.rarity).starLevel ?? 0
                      const nextLevel = cur === n ? 0 : n
                      const next = setStats(operator, { starLevel: nextLevel })
                      onChange?.(next)
                      return {
                        action: 'set-operator-starLevel',
                        desc: '设置密探星级',
                        squashBy: operator.id,
                      }
                    })
                  }
                >
                  <RarityDiamond className="h-6 w-6" />
                </button>
              )
            })}
          </div>
          <div className="mt-1 flex items-center justify-center">
            <Button
              small
              minimal
              onClick={() =>
                edit(() => {
                  const next = applyAnyRequirements(operator)
                  onChange?.(next)
                  return {
                    action: 'apply-operator-any-requirements',
                    desc: '设置密探任意练度/命盘/星石',
                    squashBy: operator.id,
                  }
                })
              }
            >
              {t.components.editor2.OperatorItem.any_requirements}
            </Button>
          </div>
        </div>

        {/* Skills & Module controls */}
        {info && (
          <div
            className={clsx(
              'mt-2 select-none shrink-0',
              centerControls ? 'self-center' : 'ml-5',
            )}
          >
            <ul className="w-full min-w-0 sm:w-[23ch]">
              {/* 攻击力/生命值（置于命盘上方） */}
              {controlsEnabled && (
                <li className="flex flex-col gap-1">
                  <div className="flex items-center">
                    <span className="text-xs opacity-80 w-12 ml-2">生命值</span>
                    <NumericInput2
                      intOnly
                      min={0}
                      buttonPosition={isMD ? 'right' : 'none'}
                      title={'生命值'}
                      value={
                        operator.extensions?.importedTraining &&
                        operator.hp === undefined
                          ? ''
                          : Math.max(0, getStats(operator, info?.rarity).hp)
                      }
                      containerClassName="flex-1 min-w-0"
                      inputClassName={clsx(
                        'h-6 !w-24 !px-2 !leading-8',
                        'text-center font-bold text-base',
                        '!rounded-md !border-2 transition-colors',
                        // 亮色主题
                        '!bg-white !text-slate-800 !border-slate-400',
                        'focus:!border-sky-500 focus:!ring-2 focus:!ring-sky-400',
                        // 暗色主题：提高前景/边框对比度与聚焦可见度
                        'dark:!bg-slate-800 dark:!text-slate-100 dark:!border-slate-300',
                        'dark:focus:!border-sky-400 dark:focus:!ring-sky-400',
                      )}
                      onValueChange={(_, valueStr) => {
                        edit(() => {
                          let v = Number(valueStr)
                          if (!Number.isFinite(v))
                            return { action: 'skip', desc: 'skip' }
                          v = Math.max(0, Math.round(v))
                          const next = setStats(operator, { hp: v })
                          onChange?.(next)
                          return {
                            action: 'set-operator-hp',
                            desc: '设置密探生命',
                            squashBy: operator.id,
                          }
                        })
                      }}
                    />
                  </div>
                  <div className="flex items-center ml-2">
                    <span className="text-xs opacity-80 w-12">攻击力</span>
                    <NumericInput2
                      intOnly
                      min={0}
                      buttonPosition={isMD ? 'right' : 'none'}
                      title={'攻击力'}
                      value={
                        operator.extensions?.importedTraining &&
                        operator.attack === undefined
                          ? ''
                          : Math.max(0, getStats(operator, info?.rarity).attack)
                      }
                      containerClassName="flex-1 min-w-0"
                      inputClassName={clsx(
                        'h-6 !w-24 !px-2 !leading-8',
                        'text-center font-bold text-base',
                        '!rounded-md !border-2 transition-colors',
                        // 亮色主题
                        '!bg-white !text-slate-800 !border-slate-400',
                        'focus:!border-sky-500 focus:!ring-2 focus:!ring-sky-400',
                        // 暗色主题：提高前景/边框对比度与聚焦可见度
                        'dark:!bg-slate-800 dark:!text-slate-100 dark:!border-slate-300',
                        'dark:focus:!border-sky-400 dark:focus:!ring-sky-400',
                      )}
                      onValueChange={(_, valueStr) => {
                        edit(() => {
                          let v = Number(valueStr)
                          if (!Number.isFinite(v))
                            return { action: 'skip', desc: 'skip' }
                          v = Math.max(0, Math.round(v))
                          const next = setStats(operator, { attack: v })
                          onChange?.(next)
                          return {
                            action: 'set-operator-attack',
                            desc: '设置密探攻击',
                            squashBy: operator.id,
                          }
                        })
                      }}
                    />
                  </div>
                </li>
              )}
              {controlsEnabled && (
                <li className="flex flex-col gap-1">
                  <div className="flex items-center">
                    <span className="text-xs opacity-80 w-12 ml-2">等级</span>
                    <NumericInput2
                      intOnly
                      min={OPERATOR_LEVEL_MIN}
                      max={OPERATOR_LEVEL_MAX}
                      buttonPosition={isMD ? 'right' : 'none'}
                      title="密探等级"
                      value={
                        operator.extensions?.importedTraining &&
                        operator.requirements?.level === undefined
                          ? ''
                          : clamp(
                              requirements.level ?? OPERATOR_LEVEL_MIN,
                              OPERATOR_LEVEL_MIN,
                              OPERATOR_LEVEL_MAX,
                            )
                      }
                      containerClassName="flex-1 min-w-0"
                      inputClassName="h-6 !w-24 !px-2 !leading-8 text-center font-bold text-base !rounded-md !border-2"
                      onValueChange={(_, valueStr) => {
                        edit(() => {
                          const value = Number(valueStr)
                          if (!Number.isFinite(value))
                            return { action: 'skip', desc: 'skip' }
                          const level = clamp(
                            Math.round(value),
                            OPERATOR_LEVEL_MIN,
                            OPERATOR_LEVEL_MAX,
                          )
                          const elite =
                            operator.extensions?.importedTraining &&
                            operator.requirements?.elite === undefined
                              ? undefined
                              : Math.min(
                                  requirements.elite ?? OPERATOR_ELITE_MIN,
                                  getMaxEliteForLevel(level),
                                )
                          const next: EditorOperator = {
                            ...operator,
                            unrestricted: false,
                            requirements: {
                              ...operator.requirements,
                              level,
                              elite,
                            },
                          }
                          onChange?.(next)
                          return {
                            action: 'set-operator-level',
                            desc: '设置密探等级',
                            squashBy: operator.id,
                          }
                        })
                      }}
                    />
                  </div>
                  <div className="flex items-center ml-2">
                    <span className="text-xs opacity-80 w-12">修为</span>
                    <NumericInput2
                      intOnly
                      min={OPERATOR_ELITE_MIN}
                      max={Math.min(
                        OPERATOR_ELITE_MAX,
                        getMaxEliteForLevel(
                          requirements.level ?? OPERATOR_LEVEL_MIN,
                        ),
                      )}
                      buttonPosition={isMD ? 'right' : 'none'}
                      title="密探修为"
                      value={
                        operator.extensions?.importedTraining &&
                        operator.requirements?.elite === undefined
                          ? ''
                          : clamp(
                              requirements.elite ?? OPERATOR_ELITE_MIN,
                              OPERATOR_ELITE_MIN,
                              getMaxEliteForLevel(
                                requirements.level ?? OPERATOR_LEVEL_MIN,
                              ),
                            )
                      }
                      containerClassName="flex-1 min-w-0"
                      inputClassName="h-6 !w-24 !px-2 !leading-8 text-center font-bold text-base !rounded-md !border-2"
                      onValueChange={(_, valueStr) => {
                        edit(() => {
                          const value = Number(valueStr)
                          if (!Number.isFinite(value))
                            return { action: 'skip', desc: 'skip' }
                          const maxElite = getMaxEliteForLevel(
                            requirements.level ?? OPERATOR_LEVEL_MIN,
                          )
                          const elite = clamp(
                            Math.round(value),
                            OPERATOR_ELITE_MIN,
                            maxElite,
                          )
                          const next: EditorOperator = {
                            ...operator,
                            unrestricted: false,
                            requirements: {
                              ...operator.requirements,
                              elite,
                            },
                          }
                          onChange?.(next)
                          return {
                            action: 'set-operator-elite',
                            desc: '设置密探修为',
                            squashBy: operator.id,
                          }
                        })
                      }}
                    />
                  </div>
                </li>
              )}
              <OperatorStarStonePresetSelect
                operator={operator}
                operatorId={info.id}
                operatorProfile={info}
                onChange={onChange}
              />
              <OperatorDiscPresetSelect
                operator={operator}
                operatorId={info.id}
                operatorProfile={info}
                onChange={onChange}
              />
              {/* 如果有命盘定义，则以命盘集合驱动 skill 选择；否则回退为原来的 1/2/3 技能选择 */}
              {discList.length > 0
                ? [0, 1, 2].map((slot) => {
                    const slots = discSlots
                    const idx1 = slots[slot]?.disc ?? 0
                    const selectedIsAny =
                      idx1 === 0 && Boolean(slots[slot]?.discConfirmed)
                    const selectedIsForbidden = idx1 < 0
                    const selectedDiscIndex1 =
                      idx1 > 0 ? idx1 : selectedIsForbidden ? -idx1 : 0
                    const selectedItem =
                      selectedDiscIndex1 > 0
                        ? discList[selectedDiscIndex1 - 1]
                        : undefined
                    const selectableMainStarOptions = MAIN_STAR_OPTIONS.filter(
                      (item) => getMainStarAvailability(item, info).available,
                    )
                    const selectableAssistStarOptions =
                      ASSIST_STAR_OPTIONS.filter(
                        (item) =>
                          getAssistStarAvailability(item, info).available,
                      )
                    return (
                      <li
                        key={'disc-slot-' + slot}
                        className="relative h-8 flex items-center gap-1 ml-1"
                      >
                        <Select
                          filterable={false}
                          items={discOptions}
                          itemRenderer={(
                            item,
                            { handleClick, handleFocus, modifiers },
                          ) => {
                            const isSelected =
                              item.kind === 'empty'
                                ? selectedDiscIndex1 === 0 && !selectedIsAny
                                : item.kind === 'any'
                                  ? selectedIsAny
                                  : item.idx + 1 === selectedDiscIndex1
                            return (
                              <MenuItem
                                roleStructure="listoption"
                                key={item.idx}
                                className={clsx(
                                  'min-w-40 !rounded-none text-sm font-serif text-slate-700 dark:text-slate-200',
                                  modifiers.active && Classes.ACTIVE,
                                )}
                                text={
                                  item.abbreviation +
                                  (item.color ? ` · ${item.color}` : '')
                                }
                                title={item.desp}
                                onClick={handleClick}
                                onFocus={handleFocus}
                                selected={isSelected}
                                labelElement={
                                  isSelected &&
                                  selectedIsForbidden &&
                                  selectedDiscIndex1 > 0 ? (
                                    <span className="font-serif font-bold text-red-700 dark:text-red-300">
                                      ×
                                    </span>
                                  ) : undefined
                                }
                              />
                            )
                          }}
                          onItemSelect={(item) => {
                            edit(() => {
                              const discIndex1 = item.idx + 1
                              const chosen =
                                item.kind === 'disc'
                                  ? selectedIsForbidden
                                    ? -discIndex1
                                    : discIndex1
                                  : 0
                              const next = setDiscSlot(operator, slot, {
                                disc: chosen,
                                discConfirmed: item.kind !== 'empty',
                              })
                              onChange?.(next)
                              return {
                                action: 'set-operator-skill',
                                desc: i18n.actions.editor2.set_operator_skill,
                                squashBy: operator.id,
                              }
                            })
                          }}
                          popoverProps={{
                            placement: 'top',
                            popoverClassName:
                              'max-w-[90vw] !rounded-none [&_.bp4-popover2-content]:!p-0 [&_.bp4-menu]:min-w-40 [&_li]:!mb-0',
                          }}
                        >
                          <Button
                            small
                            minimal
                            title={
                              selectedItem
                                ? selectedIsForbidden
                                  ? `不能有：${selectedItem.desp}`
                                  : selectedItem.desp
                                : selectedIsAny
                                  ? '任意命盘'
                                  : `选择命盘${slot + 1}`
                            }
                            className={clsx(
                              'w-[7ch] whitespace-nowrap !p-0 px-1 flex items-center justify-center font-serif !font-bold !text-sm !rounded-md !border-2 !border-current relative',
                              selectedItem || selectedIsAny
                                ? clsx(
                                    discColorClasses(selectedItem?.color),
                                    selectedIsForbidden &&
                                      '!border-red-600 dark:!border-red-400',
                                  )
                                : '!bg-gray-300 dark:!bg-gray-600 opacity-15 dark:opacity-25 hover:opacity-30 dark:hover:opacity-50',
                            )}
                          >
                            <span
                              className={clsx(
                                selectedItem &&
                                  selectedIsForbidden &&
                                  'opacity-35',
                              )}
                            >
                              {selectedItem
                                ? selectedItem.abbreviation
                                : selectedIsAny
                                  ? '任意'
                                  : `命盘${slot + 1}`}
                            </span>
                            {selectedItem && selectedIsForbidden ? (
                              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <span className="w-6 h-6 rounded-full bg-red-600 text-white border-2 border-white/80 text-lg leading-[1] flex items-center justify-center">
                                  ×
                                </span>
                              </span>
                            ) : null}
                          </Button>
                        </Select>

                        <Button
                          small
                          minimal
                          disabled={!selectedItem}
                          title={
                            !selectedItem
                              ? '请选择命盘后可禁用'
                              : selectedIsForbidden
                                ? '取消：不能有该命盘'
                                : '设置：不能有该命盘'
                          }
                          className={clsx(
                            'w-[3ch] whitespace-nowrap !p-0 px-1 self-center flex items-center justify-center font-serif !font-bold !text-sm !rounded-md !border-2 !border-current',
                            selectedIsForbidden
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200',
                          )}
                          onClick={() => {
                            edit(() => {
                              if (!selectedItem || selectedDiscIndex1 <= 0) {
                                return { action: 'skip', desc: 'skip' }
                              }
                              const nextDisc = selectedIsForbidden
                                ? selectedDiscIndex1
                                : -selectedDiscIndex1
                              const next = setDiscSlot(operator, slot, {
                                disc: nextDisc,
                              })
                              onChange?.(next)
                              return {
                                action: 'toggle-operator-disc-forbidden',
                                desc: '切换命盘禁用',
                                squashBy: operator.id,
                              }
                            })
                          }}
                        >
                          禁
                        </Button>

                        {/* 星石选择 */}
                        <Select
                          className=""
                          filterable={false}
                          items={selectableMainStarOptions}
                          itemRenderer={(
                            item: MainStarName,
                            { handleClick, handleFocus, modifiers },
                          ) => (
                            <MenuItem
                              roleStructure="listoption"
                              key={item}
                              className={clsx(
                                'min-w-44 !rounded-none text-sm font-serif text-slate-700 dark:text-slate-200',
                                modifiers.active && Classes.ACTIVE,
                              )}
                              text={item}
                              title={item}
                              onClick={handleClick}
                              onFocus={handleFocus}
                              selected={discSlots[slot]?.starStone === item}
                            />
                          )}
                          onItemSelect={(item: MainStarName) => {
                            const availability = getMainStarAvailability(
                              item,
                              info,
                            )
                            if (!availability.available) {
                              return
                            }
                            edit(() => {
                              const next = setDiscSlot(operator, slot, {
                                starStone: item,
                              })
                              onChange?.(next)
                              return {
                                action: 'set-operator-discStarStone',
                                desc: '选择命盘星石',
                                squashBy: operator.id,
                              }
                            })
                          }}
                          popoverProps={{
                            placement: 'top',
                            popoverClassName:
                              'max-w-[90vw] !rounded-none [&_.bp4-popover2-content]:!p-0 [&_.bp4-menu]:min-w-20 [&_li]:!mb-0',
                          }}
                        >
                          <Button
                            small
                            minimal
                            title={discSlots[slot]?.starStone || '选择星石'}
                            className="w-[4ch] min-w-8 whitespace-nowrap !p-0 px-1 flex items-center justify-center font-serif !font-bold !text-sm !rounded-md !border-2 !border-current bg-slate-200 dark:bg-slate-600"
                          >
                            {discSlots[slot]?.starStone || '星石'}
                          </Button>
                        </Select>

                        {/* 辅星选择 */}
                        <Select
                          className=""
                          filterable={false}
                          items={selectableAssistStarOptions}
                          itemRenderer={(
                            item: AssistStarName,
                            { handleClick, handleFocus, modifiers },
                          ) => {
                            const description = ASSIST_STAR_DESCRIPTIONS[item]
                            return (
                              <MenuItem
                                roleStructure="listoption"
                                key={item}
                                className={clsx(
                                  'min-w-56 !rounded-none text-sm font-serif text-slate-700 dark:text-slate-200',
                                  modifiers.active && Classes.ACTIVE,
                                )}
                                text={item}
                                title={`${item} · ${description}`}
                                labelElement={description}
                                onClick={handleClick}
                                onFocus={handleFocus}
                                selected={discSlots[slot]?.assistStar === item}
                              />
                            )
                          }}
                          onItemSelect={(item: AssistStarName) => {
                            const availability = getAssistStarAvailability(
                              item,
                              info,
                            )
                            if (!availability.available) {
                              return
                            }
                            edit(() => {
                              const next = setDiscSlot(operator, slot, {
                                assistStar: item,
                              })
                              onChange?.(next)
                              return {
                                action: 'set-operator-discAssistStar',
                                desc: '选择命盘辅星',
                                squashBy: operator.id,
                              }
                            })
                          }}
                          popoverProps={{
                            placement: 'top',
                            popoverClassName:
                              'max-w-[90vw] !rounded-none [&_.bp4-popover2-content]:!p-0 [&_.bp4-menu]:min-w-20 [&_li]:!mb-0',
                          }}
                        >
                          <Button
                            small
                            minimal
                            title={discSlots[slot]?.assistStar || '选择辅星'}
                            className="w-[4ch] min-w-8 whitespace-nowrap !p-0 px-1 flex items-center justify-center font-serif !font-bold !text-sm !rounded-md !border-2 !border-current bg-slate-200 dark:bg-slate-600"
                          >
                            {discSlots[slot]?.assistStar || '辅星'}
                          </Button>
                        </Select>
                      </li>
                    )
                  })
                : controlsEnabled &&
                  Array.from({ length: skillCount }, (_, index) => {
                    const available = index <= (requirements.elite ?? 0)
                    const skillNumber = index + 1
                    const selected = operator.skill === skillNumber
                    const maxSkillLevel =
                      (requirements.elite ?? 0) >= 2 ? 10 : 7
                    const skillLevel = selected
                      ? (requirements.skillLevel ??
                        getDefaultRequirements(info?.rarity).skillLevel)
                      : (skillLevels[skillNumber] ??
                        getDefaultRequirements(info?.rarity).skillLevel)

                    const selectSkill = () => {
                      if (operator.skill !== skillNumber) {
                        edit(() => {
                          operator as EditorOperator // narrow type for editor
                          const next: EditorOperator = {
                            ...operator,
                            skill: skillNumber,
                            requirements: {
                              ...operator.requirements,
                              // override with the current skill level
                              skillLevel,
                            },
                          }
                          // 触发上层 onChange 以持久化
                          onChange?.(next)
                          return {
                            action: 'set-operator-skill',
                            desc: i18n.actions.editor2.set_operator_skill,
                          }
                        })
                      }
                    }

                    return (
                      <li
                        key={index}
                        className={clsx(
                          'relative',
                          selected
                            ? available
                              ? '!bg-purple-100 dark:!bg-purple-900 dark:text-purple-200 text-purple-800'
                              : '!bg-red-100 dark:!bg-red-900 dark:text-red-200 text-red-800'
                            : '!bg-gray-300 dark:!bg-gray-600 opacity-15 dark:opacity-25 hover:opacity-30 dark:hover:opacity-50',
                        )}
                      >
                        <NumericInput2
                          intOnly
                          title={
                            available
                              ? t.models.operator.skill_number({
                                  count: skillNumber,
                                })
                              : t.components.editor2.OperatorItem
                                  .skill_not_available
                          }
                          min={0}
                          buttonPosition="none"
                          value={skillLevel <= 7 ? skillLevel : ''}
                          inputClassName={clsx(
                            '!w-8 h-8 !p-0 !leading-8 !bg-transparent text-center font-bold text-xl !text-inherit !rounded-none !border-2 !border-current [&:not(:focus)]:cursor-pointer',
                            skillLevel > 7 && '!pl-4',
                          )}
                          onClick={selectSkill}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              selectSkill()
                            }
                          }}
                          onValueChange={(_, valueStr) => {
                            edit(() => {
                              let newLevel = Number(valueStr)
                              if (!Number.isFinite(newLevel))
                                return {
                                  action: 'skip',
                                  desc: 'Skip checkpoint',
                                }
                              if (newLevel === 0) newLevel = 10
                              newLevel = clamp(newLevel, 1, maxSkillLevel)

                              setSkillLevels((prev) => ({
                                ...prev,
                                [skillNumber]: newLevel,
                              }))
                              const next: EditorOperator = {
                                ...operator,
                                requirements: {
                                  ...operator.requirements,
                                  skillLevel: newLevel,
                                },
                              }
                              onChange?.(next)
                              return {
                                action: 'set-operator-skillLevel',
                                desc: i18n.actions.editor2
                                  .set_operator_skill_level,
                                squashBy: operator.id,
                              }
                            })
                          }}
                          onWheelFocused={(e) => {
                            e.preventDefault()
                            edit(() => {
                              const newLevel = clamp(
                                (requirements.skillLevel ??
                                  getDefaultRequirements(info?.rarity)
                                    .skillLevel) + (e.deltaY > 0 ? -1 : 1),
                                1,
                                maxSkillLevel,
                              )
                              setSkillLevels((prev) => ({
                                ...prev,
                                [skillNumber]: newLevel,
                              }))
                              const next: EditorOperator = {
                                ...operator,
                                requirements: {
                                  ...operator.requirements,
                                  skillLevel: newLevel,
                                },
                              }
                              onChange?.(next)
                              return {
                                action: 'set-operator-skillLevel',
                                desc: i18n.actions.editor2
                                  .set_operator_skill_level,
                                squashBy: operator.id,
                              }
                            })
                          }}
                        />
                        {skillLevel > 7 && (
                          <MasteryIcon
                            className="absolute top-0 left-0 w-full h-full p-2 pointer-events-none"
                            mastery={skillLevel - 7}
                          />
                        )}
                        {!available && (
                          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-current rotate-45 -translate-y-px pointer-events-none" />
                        )}
                      </li>
                    )
                  })}

              {/* Row 5: Module selector */}
              {controlsEnabled && info?.modules && (
                <li>
                  <Select
                    className=""
                    filterable={false}
                    items={[
                      CopilotDocV1.Module.Default,
                      ...info.modules
                        .map((m) =>
                          m
                            ? (CopilotDocV1.Module[m] as
                                CopilotDocV1.Module | undefined)
                            : CopilotDocV1.Module.Original,
                        )
                        .filter((m) => m !== undefined),
                    ]}
                    itemRenderer={(
                      value,
                      { handleClick, handleFocus, modifiers },
                    ) => (
                      <MenuItem
                        roleStructure="listoption"
                        key={value}
                        className={clsx(
                          'min-w-12 !rounded-none text-base font-serif font-bold text-center text-slate-600 dark:text-slate-300',
                          modifiers.active && Classes.ACTIVE,
                        )}
                        text={
                          value === CopilotDocV1.Module.Default ? (
                            <Icon icon="disable" />
                          ) : value === CopilotDocV1.Module.Original ? (
                            <Icon icon="small-square" />
                          ) : (
                            getModuleName(value)
                          )
                        }
                        title={t.components.editor2.OperatorItem.module_title({
                          count: value as number,
                          name: getModuleName(value as CopilotDocV1.Module),
                        })}
                        onClick={handleClick}
                        onFocus={handleFocus}
                        selected={value === requirements.module}
                      />
                    )}
                    onItemSelect={(value) => {
                      edit(() => {
                        const next: EditorOperator = {
                          ...operator,
                          requirements: {
                            ...operator.requirements,
                            module: value as CopilotDocV1.Module,
                          },
                        }
                        onChange?.(next)
                        return {
                          action: 'set-operator-module',
                          desc: i18n.actions.editor2.set_operator_module,
                          squashBy: operator.id,
                        }
                      })
                    }}
                    popoverProps={{
                      placement: 'top',
                      popoverClassName:
                        '!rounded-none [&_.bp4-popover2-content]:!p-0 [&_.bp4-menu]:min-w-0 [&_li]:!mb-0',
                    }}
                  >
                    <Button
                      small
                      minimal
                      title={
                        t.components.editor2.OperatorItem.module +
                        ': ' +
                        t.components.editor2.OperatorItem.module_title({
                          count:
                            requirements.module ?? CopilotDocV1.Module.Default,
                          name: getModuleName(
                            (requirements.module ??
                              CopilotDocV1.Module
                                .Default) as CopilotDocV1.Module,
                          ),
                        })
                      }
                      className={clsx(
                        'w-7 h-7 min-w-7 min-h-7 !p-0 flex items-center justify-center font-serif !font-bold !text-base !rounded-none !border-2 !border-current',
                        (requirements.module ?? CopilotDocV1.Module.Default) !==
                          CopilotDocV1.Module.Default
                          ? '!bg-purple-100 dark:!bg-purple-900 dark:!text-purple-200 !text-purple-800'
                          : '!bg-gray-300 dark:!bg-gray-600 opacity-15 dark:opacity-25 hover:opacity-30 dark:hover:opacity-50',
                      )}
                    />
                  </Select>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    )
  },
)
OperatorItem.displayName = 'OperatorItem'

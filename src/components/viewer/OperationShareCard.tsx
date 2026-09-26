import { Icon } from '@blueprintjs/core'

import type { CSSProperties, Ref } from 'react'

import {
  OPERATION_SHARE_CELL_COLOR_KEYS,
  OPERATION_SHARE_CELL_PALETTE,
  type OperationShareAction,
  type OperationShareCardConfig,
  type OperationShareCellPattern,
  type OperationShareModel,
  type OperationShareOperator,
  type OperationShareRound,
  buildOperationShareCellKey,
  createOperationShareCardConfig,
  filterOperationShareActions,
} from './operationShareModel'
import {
  DEFAULT_OPERATION_SHARE_TABLE_THEME,
  type OperationShareTableTheme,
  type OperationShareTableThemeOverrides,
  getOperationShareTableTheme,
} from './operationShareTheme'
import {
  ShareCardFrame,
  ShareOperatorAvatar,
  ShareSectionTitle,
  shareCardPalette as palette,
} from './shareCardComponents'

const defaultCardConfig = createOperationShareCardConfig()
const accessibleDarkTextColor = '#231f20'

const shareCellPatternStyles: Record<OperationShareCellPattern, CSSProperties> =
  {
    solid: {},
    vertical: {
      backgroundImage:
        'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.2) 0 3px, transparent 3px 11px)',
    },
    horizontal: {
      backgroundImage:
        'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.2) 0 3px, transparent 3px 11px)',
    },
    diagonal: {
      backgroundImage:
        'repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.18) 0 3px, transparent 3px 11px)',
    },
    cross: {
      backgroundImage:
        'repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.16) 0 3px, transparent 3px 11px), repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.16) 0 3px, transparent 3px 11px)',
    },
    dots: {
      backgroundImage:
        'radial-gradient(circle at 3px 3px, rgba(0, 0, 0, 0.16) 0 2px, transparent 2.25px)',
      backgroundSize: '10px 10px',
    },
  }

// 每种颜色在「增加底纹」打开时使用专属纹样，保证同一张图里不同颜色
// 在黑白打印/色盲场景下也能靠纹样分辨；关闭时全部退化为纯色块。
const shareCellColorVisualStyles: Record<
  string,
  { plain: CSSProperties; patterned: CSSProperties }
> = Object.fromEntries(
  OPERATION_SHARE_CELL_COLOR_KEYS.map((colorKey) => {
    const { hex, pattern } = OPERATION_SHARE_CELL_PALETTE[colorKey]
    const plain: CSSProperties = {
      backgroundColor: hex,
      color: accessibleDarkTextColor,
    }
    return [
      colorKey,
      { plain, patterned: { ...plain, ...shareCellPatternStyles[pattern] } },
    ]
  }),
)

// 未上色的单元格按回合隔行取底色，始终不带纹样。
const emptyOperationShareCellVisualStyle: CSSProperties = {}

export function getOperationShareCellVisualStyle(
  cellColor?: string,
  showPattern = false,
  tableTheme = DEFAULT_OPERATION_SHARE_TABLE_THEME,
): CSSProperties {
  if (!cellColor) return emptyOperationShareCellVisualStyle

  const colorStyle = shareCellColorVisualStyles[cellColor]
  if (colorStyle) {
    return showPattern ? colorStyle.patterned : colorStyle.plain
  }

  if (
    cellColor === tableTheme.bodyBackgrounds[0] ||
    cellColor === tableTheme.bodyBackgrounds[1]
  ) {
    return { backgroundColor: cellColor, color: tableTheme.text }
  }

  return emptyOperationShareCellVisualStyle
}

function getOperationShareRoundBackground(
  round: number,
  tableColor?: string,
  tableThemeOverrides?: OperationShareTableThemeOverrides,
) {
  const { bodyBackgrounds } = getOperationShareTableTheme(
    tableColor,
    tableThemeOverrides,
  )
  return bodyBackgrounds[(round - 1) % bodyBackgrounds.length]
}

export function getOperationShareActionCellBackground(
  cellColors: OperationShareCardConfig['cellColors'],
  round: number,
  slot: number,
  tableColor?: string,
  tableThemeOverrides?: OperationShareTableThemeOverrides,
) {
  return (
    cellColors[buildOperationShareCellKey(round, `slot-${slot}`)] ??
    getOperationShareRoundBackground(round, tableColor, tableThemeOverrides)
  )
}

export function getOperationShareActionLabel(
  action: OperationShareAction,
  displayOrder = action.order,
) {
  const starColor = action.raw.match(/^重开:无(.+)星$/)?.[1]

  if (starColor) {
    return `${displayOrder}无${starColor}星重开`
  }

  const fallenSlot = action.raw.match(/^重开:检测(\d+)号位阵亡$/)?.[1]
  if (fallenSlot) {
    return `${fallenSlot}号位阵亡就重开`
  }

  const birdSlot = action.raw.match(/^重开:检测(\d+)号位鹦鹉$/)?.[1]
  if (birdSlot) {
    return `${birdSlot}号位鹦鹉未被复制就重开`
  }

  return `${displayOrder}${action.label}`
}

export function getOperationShareRoundDisplay(
  round: OperationShareRound,
  config: Pick<
    OperationShareCardConfig,
    'showOtherActions' | 'showTargetSwitches'
  >,
) {
  const otherActions = config.showOtherActions
    ? filterOperationShareActions(round.others, config.showTargetSwitches)
    : []
  const visibleActions = [...otherActions]

  Object.values(round.slots).forEach((actions) => {
    visibleActions.push(...actions)
  })
  visibleActions.sort((left, right) => left.order - right.order)

  return {
    otherActions,
    displayOrderByActionOrder: new Map(
      visibleActions.map((action, index) => [action.order, index + 1]),
    ),
  }
}

export function getOperationShareOperatorStarLabel(
  operator: Pick<OperationShareOperator, 'starLevel'>,
) {
  return operator.starLevel === undefined
    ? undefined
    : `${operator.starLevel} 星`
}

function OperatorAvatar({
  operator,
  slot,
  tableTheme,
}: {
  operator?: OperationShareOperator
  slot: number
  tableTheme: OperationShareTableTheme
}) {
  if (!operator) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center border-2 border-dashed text-lg font-semibold"
        style={{
          borderColor: '#9aaba5',
          color: tableTheme.headerMutedText,
        }}
      >
        {slot} 号位
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-hidden">
      <ShareOperatorAvatar
        className="block aspect-square h-auto w-full bg-white object-cover"
        operator={operator}
        size={180}
      />
      {operator.starLevel !== undefined ? (
        <span
          aria-label={getOperationShareOperatorStarLabel(operator)}
          className="absolute right-2 top-2 flex h-8 min-w-10 items-center justify-center gap-1 rounded-sm border-2 border-white px-1.5 text-sm font-bold text-white"
          style={{ background: '#e96913' }}
        >
          <Icon aria-hidden icon="star" iconSize={14} />
          <span>{operator.starLevel}</span>
        </span>
      ) : null}
    </div>
  )
}

function OperatorLabel({
  operator,
  tableTheme,
}: {
  operator?: OperationShareOperator
  tableTheme: OperationShareTableTheme
}) {
  if (!operator) {
    return <span style={{ color: tableTheme.headerMutedText }}>未配置密探</span>
  }

  return (
    <div
      className="px-1 py-2 text-center"
      style={{ color: tableTheme.headerText }}
    >
      <div className="break-words text-[20px] font-bold leading-tight">
        {operator.name}
      </div>
      {operator.skill || operator.module ? (
        <div
          className="mt-1 text-[12px] font-medium leading-4"
          style={{ color: tableTheme.headerMutedText }}
        >
          {operator.skill ? <div>技能 {operator.skill}</div> : null}
          {operator.module ? <div>{operator.module}模组</div> : null}
        </div>
      ) : null}
    </div>
  )
}

function SubstituteOperator({
  operator,
}: {
  operator: OperationShareOperator
}) {
  return (
    <div className="flex w-[148px] items-center gap-3">
      <ShareOperatorAvatar
        className="h-14 w-14 shrink-0 border-2 border-white bg-white object-cover shadow-sm"
        operator={operator}
        size={56}
      />
      <div className="min-w-0 text-left">
        <div className="break-words text-base font-bold leading-tight">
          {operator.name}
        </div>
        <div className="mt-1 text-xs" style={{ color: palette.muted }}>
          {operator.skill ? `技能 ${operator.skill}` : '可替换'}
        </div>
      </div>
    </div>
  )
}

function ActionList({
  actions,
  displayOrderByActionOrder,
}: {
  actions: OperationShareAction[]
  displayOrderByActionOrder: ReadonlyMap<number, number>
}) {
  if (actions.length === 0) {
    return <span className="text-lg opacity-70">—</span>
  }

  return (
    <div className="text-center text-[22px] font-bold leading-[1.25]">
      {actions.map((action, index) => (
        <span key={`${action.raw}-${index}`}>
          {getOperationShareActionLabel(
            action,
            displayOrderByActionOrder.get(action.order),
          )}
          <wbr />
        </span>
      ))}
    </div>
  )
}

export function OperationShareCard({
  model,
  cardRef,
  qrDataUrl,
  hideQrCode = true,
  showShortCode = true,
  config = defaultCardConfig,
}: {
  model: OperationShareModel
  cardRef?: Ref<HTMLDivElement>
  qrDataUrl: string
  hideQrCode?: boolean
  showShortCode?: boolean
  config?: OperationShareCardConfig
}) {
  const tableTheme = getOperationShareTableTheme(
    config.tableColor,
    config.tableThemeOverrides,
  )

  return (
    <ShareCardFrame
      backgroundColor={tableTheme.pageBackground}
      cardRef={cardRef}
      eyebrow="MaaYuan · 作业分享"
      hideQrCode={hideQrCode}
      model={model}
      qrDataUrl={qrDataUrl}
      showShortCode={showShortCode}
    >
      <section className="mt-10">
        <ShareSectionTitle>作战编排</ShareSectionTitle>
        <table
          className="mt-5 w-full table-fixed border-collapse text-center"
          style={{
            borderColor: tableTheme.border,
            color: tableTheme.text,
          }}
        >
          <thead>
            <tr aria-label="密探头像">
              <td
                className="w-[110px] border-2 p-0"
                style={{
                  borderColor: tableTheme.border,
                  background: tableTheme.headerBackground,
                }}
              />
              {model.actionSlots.map((slot) => (
                <td
                  key={slot}
                  className="border-2 p-0 align-middle"
                  style={{
                    borderColor: tableTheme.border,
                    background: tableTheme.headerBackground,
                  }}
                >
                  <OperatorAvatar
                    operator={model.operators[slot - 1]}
                    slot={slot}
                    tableTheme={tableTheme}
                  />
                </td>
              ))}
              {config.showOtherActions ? (
                <td
                  className="w-[118px] border-2 p-0"
                  style={{
                    borderColor: tableTheme.border,
                    background: tableTheme.headerBackground,
                  }}
                />
              ) : null}
              {config.showNotes ? (
                <td
                  className="w-[168px] border-2 p-0"
                  style={{
                    borderColor: tableTheme.border,
                    background: tableTheme.headerBackground,
                  }}
                />
              ) : null}
            </tr>
            <tr
              aria-label="列标题"
              style={{
                background: tableTheme.headerBackground,
                color: tableTheme.headerText,
              }}
            >
              <th
                className="border-2 px-3 py-3 text-[21px] font-bold"
                scope="col"
                style={{ borderColor: tableTheme.border }}
              >
                回合
              </th>
              {model.actionSlots.map((slot) => (
                <th
                  key={slot}
                  className="border-2 px-1 py-2 align-middle"
                  scope="col"
                  style={{ borderColor: tableTheme.border }}
                >
                  <OperatorLabel
                    operator={model.operators[slot - 1]}
                    tableTheme={tableTheme}
                  />
                </th>
              ))}
              {config.showOtherActions ? (
                <th
                  className="border-2 px-3 py-3 text-lg font-bold"
                  scope="col"
                  style={{ borderColor: tableTheme.border }}
                >
                  其他动作
                </th>
              ) : null}
              {config.showNotes ? (
                <th
                  className="border-2 px-3 py-3 text-lg font-bold"
                  scope="col"
                  style={{ borderColor: tableTheme.border }}
                >
                  备注
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {model.rounds.length > 0 ? (
              model.rounds.map((round) => {
                const { otherActions, displayOrderByActionOrder } =
                  getOperationShareRoundDisplay(round, config)
                const rowBackground = getOperationShareRoundBackground(
                  round.round,
                  config.tableColor,
                  config.tableThemeOverrides,
                )

                return (
                  <tr key={round.round} style={{ background: rowBackground }}>
                    <th
                      className="border-2 px-3 py-3 text-[19px] leading-tight"
                      style={{
                        borderColor: tableTheme.border,
                        color: tableTheme.text,
                      }}
                    >
                      <span className="block text-[28px] font-bold">
                        {round.round}
                      </span>
                    </th>
                    {model.actionSlots.map((slot) => (
                      <td
                        key={slot}
                        className="border-2 px-1.5 py-2 align-middle"
                        style={{
                          borderColor: tableTheme.border,
                          ...getOperationShareCellVisualStyle(
                            getOperationShareActionCellBackground(
                              config.cellColors,
                              round.round,
                              slot,
                              config.tableColor,
                              config.tableThemeOverrides,
                            ),
                            config.showCellPattern,
                            tableTheme,
                          ),
                        }}
                      >
                        <ActionList
                          actions={round.slots[slot] ?? []}
                          displayOrderByActionOrder={displayOrderByActionOrder}
                        />
                      </td>
                    ))}
                    {config.showOtherActions ? (
                      <td
                        className="border-2 px-1.5 py-2 align-middle"
                        style={{
                          borderColor: tableTheme.border,
                          background: rowBackground,
                        }}
                      >
                        <ActionList
                          actions={otherActions}
                          displayOrderByActionOrder={displayOrderByActionOrder}
                        />
                      </td>
                    ) : null}
                    {config.showNotes ? (
                      <td
                        className="whitespace-pre-wrap break-words border-2 px-3 py-3 text-left text-[17px] font-medium leading-6 align-middle"
                        style={{
                          borderColor: tableTheme.border,
                          background: rowBackground,
                          color: config.notes[round.round]
                            ? tableTheme.text
                            : tableTheme.mutedText,
                        }}
                      >
                        {config.notes[round.round] || '—'}
                      </td>
                    ) : null}
                  </tr>
                )
              })
            ) : (
              <tr style={{ background: tableTheme.bodyBackgrounds[0] }}>
                <td
                  className="border-2 px-4 py-8 text-base font-medium"
                  colSpan={
                    model.actionSlots.length +
                    1 +
                    (config.showOtherActions ? 1 : 0) +
                    (config.showNotes ? 1 : 0)
                  }
                  style={{
                    borderColor: tableTheme.border,
                    color: tableTheme.mutedText,
                  }}
                >
                  此作业未定义动作序列
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {model.groups.length > 0 ? (
        <section className="mt-9">
          <ShareSectionTitle>可替换密探</ShareSectionTitle>
          <div className="mt-4 border-y" style={{ borderColor: '#b9c4c0' }}>
            {model.groups.map((group, index) => (
              <div
                key={`${group.name}-${index}`}
                className="flex min-h-[92px] items-center gap-6 px-4 py-4"
                style={{
                  background: index % 2 === 0 ? palette.panel : '#eee8dc',
                }}
              >
                <h3
                  className="w-[150px] shrink-0 border-r pr-5 text-lg font-bold"
                  style={{ borderColor: '#b9c4c0' }}
                >
                  {group.name}
                </h3>
                {group.operators.length > 0 ? (
                  <div className="flex flex-1 flex-wrap gap-x-5 gap-y-3">
                    {group.operators.map((operator, operatorIndex) => (
                      <SubstituteOperator
                        key={`${operator.rawName}-${operatorIndex}`}
                        operator={operator}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm" style={{ color: palette.muted }}>
                    该密探组未配置可替换密探
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </ShareCardFrame>
  )
}

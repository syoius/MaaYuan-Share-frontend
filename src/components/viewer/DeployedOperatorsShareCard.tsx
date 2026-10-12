import type { ReactNode, Ref } from 'react'

import type {
  OperationShareCardConfig,
  OperationShareDisc,
  OperationShareModel,
  OperationShareOperator,
} from './operationShareModel'
import {
  buildOperationShareDiscKey,
  createOperationShareCardConfig,
  resolveOperationShareExtraForbiddenDiscs,
} from './operationShareModel'
import { getOperationShareTableTheme } from './operationShareTheme'
import {
  ShareCardFrame,
  ShareOperatorAvatar,
  ShareSectionTitle,
  shareCardPalette as palette,
} from './shareCardComponents'

const DISC_SLOTS = [1, 2, 3] as const
const DISC_FIELDS = [
  { field: 'disc', label: '命盘' },
  { field: 'starStone', label: '主星' },
  { field: 'assistStar', label: '辅星' },
] as const
const emptyRequiredDiscSlots: ReadonlySet<number> = new Set()
const defaultCardConfig = createOperationShareCardConfig()

function getDiscDisplayPriority(
  disc: OperationShareDisc,
  requiredDiscSlots: ReadonlySet<number>,
) {
  if (requiredDiscSlots.has(disc.slot)) return 0
  if (disc.forbidden) return 2
  return 1
}

export function orderOperationShareDiscs(
  discs: OperationShareDisc[],
  requiredDiscSlots: ReadonlySet<number> = emptyRequiredDiscSlots,
) {
  const discsBySlot = new Map(discs.map((disc) => [disc.slot, disc]))
  const orderedDiscs = DISC_SLOTS.flatMap((slot) => {
    const disc = discsBySlot.get(slot)
    return disc ? [disc] : []
  }).sort(
    (left, right) =>
      getDiscDisplayPriority(left, requiredDiscSlots) -
        getDiscDisplayPriority(right, requiredDiscSlots) ||
      left.slot - right.slot,
  )

  return DISC_SLOTS.map((_, index) => orderedDiscs[index])
}

function DiscAbbreviation({
  disc,
  required,
  textColor,
}: {
  disc: OperationShareDisc
  required: boolean
  textColor: string
}) {
  if (disc.abbreviation === '未选择命盘') return null

  const color = textColor

  if (disc.forbidden) {
    return (
      <span
        aria-label={`禁用命盘：${disc.abbreviation}`}
        className="inline-flex max-w-full items-center justify-center gap-1"
        style={{ color: '#8f2117' }}
      >
        <span aria-hidden className="text-[24px] leading-none" />
        <span className="whitespace-nowrap text-[24px] font-black leading-snug line-through decoration-2">
          {disc.abbreviation}
        </span>
      </span>
    )
  }

  if (required) {
    return (
      <span
        className="inline-flex max-w-full items-center justify-center rounded-md border-2 px-2 py-0.5"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.58)',
          borderColor: color,
        }}
      >
        <span
          aria-label={`核心命盘：${disc.abbreviation}`}
          className="inline-flex max-w-full items-center justify-center gap-1"
        >
          <span aria-hidden className="text-[24px] leading-none" />
          <span
            className="whitespace-nowrap text-[24px] font-black leading-snug"
            style={{ color }}
          >
            {disc.abbreviation}
          </span>
        </span>
      </span>
    )
  }

  return (
    <span
      className="break-words text-[24px] font-bold leading-snug"
      style={{ color }}
    >
      {disc.abbreviation}
    </span>
  )
}

function ExtraForbiddenDisc({ name }: { name: string }) {
  return (
    <span
      aria-label={`额外禁用命盘：${name}`}
      className="inline-flex max-w-full items-center justify-center gap-1"
      style={{ color: '#8f2117' }}
    >
      <span aria-hidden className="text-[24px] leading-none" />
      <span className="whitespace-nowrap text-[24px] font-black leading-snug line-through decoration-2">
        {name}
      </span>
    </span>
  )
}

function DiscUsageLegend({
  mutedTextColor,
  textColor,
}: {
  mutedTextColor: string
  textColor: string
}) {
  const requiredColor = textColor

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium"
      style={{ color: mutedTextColor }}
    >
      <span className="inline-flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center rounded-md border-2 px-1.5 py-0.5 text-[13px] font-bold leading-none"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.58)',
            borderColor: requiredColor,
            color: requiredColor,
          }}
        >
          命盘
        </span>
        <span>代表必须命盘</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          className="text-[13px] font-bold leading-none line-through decoration-2"
          style={{ color: '#8f2117' }}
        >
          命盘
        </span>
        <span>代表禁用命盘</span>
      </span>
    </div>
  )
}

function DiscStoneValue({
  mutedTextColor,
  value,
}: {
  mutedTextColor: string
  value?: string
}) {
  if (!value) {
    return <span style={{ color: mutedTextColor }}>—</span>
  }

  return (
    <span className="break-words text-[24px] font-semibold leading-5">
      {value}
    </span>
  )
}

function AscensionLevel({
  mutedTextColor,
  value,
}: {
  mutedTextColor: string
  value?: number
}) {
  if (value === undefined) {
    return <span style={{ color: mutedTextColor }}>—</span>
  }

  const starCount = Math.max(0, Math.min(5, Math.floor(value)))

  return (
    <div
      aria-label={`化极 ${value}`}
      className="flex items-center justify-center gap-1.5"
    >
      {Array.from({ length: starCount }, (_, index) => (
        <svg
          key={index}
          aria-hidden="true"
          className="block h-[18px] w-[18px] shrink-0"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 0 Q14.8 9.2 24 12 Q14.8 14.8 12 24 Q9.2 14.8 0 12 Q9.2 9.2 12 0Z"
            fill="#e96913"
          />
        </svg>
      ))}
    </div>
  )
}

function OperatorAvatar({ operator }: { operator: OperationShareOperator }) {
  return (
    <ShareOperatorAvatar
      className="block aspect-square h-auto w-full bg-white object-cover"
      operator={operator}
      size={180}
    />
  )
}

function AttributeRow({
  background,
  borderColor,
  children,
  label,
  minHeight,
  operators,
}: {
  background: string
  borderColor: string
  children: (operator: OperationShareOperator) => ReactNode
  label: string
  minHeight: number
  operators: OperationShareOperator[]
}) {
  return (
    <tr style={{ background, height: minHeight }}>
      <th
        className="w-[108px] border px-3 text-[27px] font-bold"
        scope="row"
        style={{ borderColor }}
      >
        {label}
      </th>
      {operators.map((operator, index) => (
        <td
          key={`${label}-${operator.rawName}-${index}`}
          className="border px-3 py-4 text-center text-[27px] font-semibold align-middle"
          style={{ borderColor }}
        >
          {children(operator)}
        </td>
      ))}
    </tr>
  )
}

function DiscRows({
  borderColor,
  config,
  mutedTextColor,
  operators,
  rowBackgrounds,
  textColor,
}: {
  borderColor: string
  config: OperationShareCardConfig
  mutedTextColor: string
  operators: OperationShareOperator[]
  rowBackgrounds: readonly [string, string]
  textColor: string
}) {
  const orderedDiscs = operators.map((operator, operatorIndex) => {
    const operatorSlot = operator.slot ?? operatorIndex + 1
    const requiredDiscSlots = new Set(
      operator.discs
        .filter(
          (disc) =>
            config.requiredDiscs[
              buildOperationShareDiscKey(operatorSlot, disc.slot)
            ] === true,
        )
        .map((disc) => disc.slot),
    )

    return orderOperationShareDiscs(operator.discs, requiredDiscSlots)
  })

  return (
    <>
      {DISC_FIELDS.map(({ field, label }, rowIndex) => (
        <tr
          key={field}
          style={{
            background: rowBackgrounds[rowIndex % rowBackgrounds.length],
            height: 126,
          }}
        >
          <th
            className="w-[108px] border px-3 text-[22px] font-bold leading-snug"
            scope="row"
            style={{ borderColor }}
          >
            {label}
          </th>
          {operators.map((operator, operatorIndex) => {
            const operatorSlot = operator.slot ?? operatorIndex + 1
            const extraForbiddenDiscs =
              field === 'disc'
                ? resolveOperationShareExtraForbiddenDiscs(
                    operator,
                    config.extraForbiddenDiscs?.[String(operatorSlot)] ?? [],
                  )
                : []
            const displayDiscs: Array<{
              key: string
              node: ReactNode
            }> =
              field === 'disc'
                ? [
                    ...orderedDiscs[operatorIndex].flatMap((disc, slotIndex) => {
                      if (!disc || disc.abbreviation === '未选择命盘') return []

                      return [
                        {
                          key: `disc-${DISC_SLOTS[slotIndex]}`,
                          node: (
                            <DiscAbbreviation
                              disc={disc}
                              required={
                                !disc.forbidden &&
                                config.requiredDiscs[
                                  buildOperationShareDiscKey(
                                    operatorSlot,
                                    disc.slot,
                                  )
                                ] === true
                              }
                              textColor={textColor}
                            />
                          ),
                        },
                      ]
                    }),
                    ...extraForbiddenDiscs.map((discName) => ({
                      key: `extra-forbidden-${operatorSlot}-${discName}`,
                      node: <ExtraForbiddenDisc name={discName} />,
                    })),
                  ]
                : orderedDiscs[operatorIndex].map((disc, slotIndex) => ({
                    key: DISC_SLOTS[slotIndex].toString(),
                    node: disc ? (
                      <DiscStoneValue
                        mutedTextColor={mutedTextColor}
                        value={disc[field]}
                      />
                    ) : (
                      <span style={{ color: mutedTextColor }}>—</span>
                    ),
                  }))

            return (
              <td
                key={`${field}-${operator.rawName}-${operatorIndex}`}
                className="border px-2 py-3 text-center align-middle"
                style={{ borderColor }}
              >
                <div
                  className={`flex flex-col items-center justify-center ${
                    field === 'disc' ? 'gap-0' : 'gap-1.5'
                  }`}
                >
                  {displayDiscs.map(({ key, node }) => (
                    <div
                      key={key}
                      className="flex min-h-[28px] w-full items-center justify-center"
                    >
                      {node}
                    </div>
                  ))}
                </div>
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

export function DeployedOperatorsShareCard({
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
  const shareTableTheme = getOperationShareTableTheme(
    config.operatorTableColor,
    config.operatorTableThemeOverrides,
  )
  const hasCustomTableTheme = Boolean(
    config.operatorTableColor ||
      (config.operatorTableThemeOverrides &&
        Object.keys(config.operatorTableThemeOverrides).length > 0),
  )
  const pageBackground = hasCustomTableTheme
    ? shareTableTheme.pageBackground
    : palette.paper
  const headerBackground = hasCustomTableTheme
    ? shareTableTheme.headerBackground
    : '#f0dec1'
  const rowBackgrounds: readonly [string, string] = hasCustomTableTheme
    ? shareTableTheme.bodyBackgrounds
    : ['#f3e3c9', '#f3e3c9']
  const borderColor = hasCustomTableTheme ? shareTableTheme.border : '#78501f'
  const textColor = hasCustomTableTheme ? shareTableTheme.text : '#624015'
  const headerTextColor = hasCustomTableTheme
    ? shareTableTheme.headerText
    : '#624015'
  const mutedTextColor = hasCustomTableTheme
    ? shareTableTheme.mutedText
    : '#9a856d'
  const discTextColor = hasCustomTableTheme
    ? shareTableTheme.text
    : '#5f4a31'

  return (
    <ShareCardFrame
      backgroundColor={pageBackground}
      cardRef={cardRef}
      eyebrow="MaaYuan · 上阵密探"
      hideQrCode={hideQrCode}
      model={model}
      qrDataUrl={qrDataUrl}
      showShortCode={showShortCode}
    >
      <section className="mt-10">
        <ShareSectionTitle>上阵密探属性一览</ShareSectionTitle>
        {model.operators.length > 0 ? (
          <table
            className="mt-5 w-full table-fixed border-collapse border-2"
            style={{ borderColor, color: textColor }}
          >
            <thead style={{ color: headerTextColor }}>
              <tr aria-label="密探头像" style={{ background: headerBackground }}>
                <td
                  className="w-[108px] border p-0"
                  style={{ borderColor }}
                />
                {model.operators.map((operator, index) => (
                  <td
                    key={`${operator.rawName}-${index}`}
                    className="border p-0 align-middle"
                    style={{ borderColor }}
                  >
                    <OperatorAvatar operator={operator} />
                  </td>
                ))}
              </tr>
              <tr aria-label="列标题" style={{ background: headerBackground }}>
                <th
                  className="border px-3 py-3 text-[22px] font-bold"
                  scope="col"
                  style={{ borderColor }}
                >
                  属性
                </th>
                {model.operators.map((operator, index) => (
                  <th
                    key={`${operator.rawName}-${index}`}
                    className="break-words border px-2 py-3 text-center text-[22px] font-bold leading-tight"
                    scope="col"
                    style={{ borderColor }}
                  >
                    {operator.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AttributeRow
                background={rowBackgrounds[0]}
                borderColor={borderColor}
                label="生命"
                minHeight={72}
                operators={model.operators}
              >
                {(operator) => operator.hp ?? '—'}
              </AttributeRow>
              <AttributeRow
                background={rowBackgrounds[1]}
                borderColor={borderColor}
                label="攻击"
                minHeight={72}
                operators={model.operators}
              >
                {(operator) => operator.attack ?? '—'}
              </AttributeRow>
              <AttributeRow
                background={rowBackgrounds[0]}
                borderColor={borderColor}
                label="等级"
                minHeight={68}
                operators={model.operators}
              >
                {(operator) => operator.level ?? '—'}
              </AttributeRow>
              <AttributeRow
                background={rowBackgrounds[1]}
                borderColor={borderColor}
                label="修为"
                minHeight={68}
                operators={model.operators}
              >
                {(operator) => operator.elite ?? '—'}
              </AttributeRow>
              <AttributeRow
                background={rowBackgrounds[0]}
                borderColor={borderColor}
                label="化极"
                minHeight={76}
                operators={model.operators}
              >
                {(operator) => (
                  <AscensionLevel
                    mutedTextColor={mutedTextColor}
                    value={operator.starLevel}
                  />
                )}
              </AttributeRow>
              <DiscRows
                borderColor={borderColor}
                config={config}
                mutedTextColor={mutedTextColor}
                operators={model.operators}
                rowBackgrounds={[rowBackgrounds[1], rowBackgrounds[0]]}
                              textColor={discTextColor}
              />
            </tbody>
          </table>
        ) : (
          <div
            className="mt-5 border-2 border-dashed px-5 py-12 text-center text-lg font-semibold"
            style={{ borderColor: '#9aaba5', color: palette.muted }}
          >
            此作业未配置上阵密探
          </div>
        )}
        {model.operators.length > 0 ? (
          <DiscUsageLegend
            mutedTextColor={mutedTextColor}
            textColor={discTextColor}
          />
        ) : null}
      </section>
    </ShareCardFrame>
  )
}

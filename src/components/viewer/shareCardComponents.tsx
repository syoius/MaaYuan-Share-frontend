import clsx from 'clsx'
import type { CSSProperties, ReactNode, Ref } from 'react'

import { operatorAvatarFallback, operatorAvatarUrl } from '../../models/operatorAvatar'
import type {
  OperationShareModel,
  OperationShareOperator,
} from './operationShareModel'

export const shareCardPalette = {
  accent: '#b85f3f',
  brand: '#176b64',
  border: '#49645c',
  ink: '#24312f',
  muted: '#63716d',
  paper: '#f6f3eb',
  panel: '#fffdf8',
  stripe: '#ebe1d2',
}

// 分享图固定 1080px 定宽：这是生成位图（html-to-image 导出 PNG）的标准做法，
// 保证主/辅星石、命盘、二维码等内容的字号与列宽按桌面比例稳定渲染，
// 无移动端断点/双布局。预览与生成共用同一 DOM，宽度必须与
// operationShareImage.ts 中 toBlob 的 width:1080 保持一致。
const shareCardStyle: CSSProperties = {
  width: 1080,
  boxSizing: 'border-box',
  background: shareCardPalette.paper,
  color: shareCardPalette.ink,
  padding: '52px 52px 40px',
  fontFamily:
    '"MaaYuan Arrow Symbols", Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
}

const STAR_LEVELS = [1, 2, 3, 4, 5] as const

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

function applyAvatarFallback(image: HTMLImageElement) {
  if (image.dataset.fallbackApplied === 'true') return
  image.dataset.fallbackApplied = 'true'
  image.src = operatorAvatarFallback
}

export function ShareOperatorAvatar({
  className,
  operator,
  size,
}: {
  className: string
  operator: OperationShareOperator
  size: number
}) {
  return (
    <img
      alt={operator.name}
      className={className}
      height={size}
      loading="eager"
      onError={(event) => applyAvatarFallback(event.currentTarget)}
      src={operatorAvatarUrl(operator.avatarId, 192)}
      width={size}
    />
  )
}

export function ShareOperatorStarLevel({ value }: { value: number }) {
  return (
    <div
      aria-label={`${value} 星`}
      className="mt-1 flex items-center justify-center gap-1 select-none"
    >
      {STAR_LEVELS.map((level) => (
        <RarityDiamond
          key={level}
          className={`h-4 w-4 ${
            level <= value
              ? 'text-yellow-500 opacity-100'
              : 'text-gray-500 opacity-40'
          }`}
        />
      ))}
    </div>
  )
}

export function ShareSectionTitle({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-4">
      <h2 className="shrink-0 text-[22px] font-bold">{children}</h2>
      <div className="h-px flex-1" style={{ background: '#b9c4c0' }} />
    </div>
  )
}

export function ShareCardFrame({
  backgroundColor = shareCardPalette.paper,
  cardRef,
  children,
  eyebrow,
  headerRight,
  hideQrCode,
  model,
  qrDataUrl,
  showShortCode,
}: {
  backgroundColor?: string
  cardRef?: Ref<HTMLDivElement>
  children: ReactNode
  eyebrow: string
  headerRight?: ReactNode
  hideQrCode: boolean
  model: OperationShareModel
  qrDataUrl: string
  showShortCode: boolean
}) {
  const sourceTag =
    model.source.type === 'repost'
      ? { label: '搬运', background: '#f2dfb9', color: '#795410' }
      : { label: '原创', background: '#d8e9e4', color: '#155d57' }

  const hasQrCode = !hideQrCode
  const stackSourceInfo = Boolean(headerRight && hasQrCode)

  const sourceInfo = (
    <div
      className={clsx(
        'min-w-0 flex-1 py-1',
        headerRight && !stackSourceInfo && 'flex items-stretch gap-5',
        stackSourceInfo && 'flex flex-col',
        headerRight ? 'text-left' : 'border-l-4 pl-4 text-right',
      )}
      style={headerRight ? undefined : { borderColor: shareCardPalette.accent }}
    >
      <div
        className={
          headerRight && !stackSourceInfo ? 'min-w-0 shrink-0' : 'min-w-0'
        }
      >
        <div
          className={clsx(
            'text-sm font-semibold',
            headerRight ? undefined : 'mt-4',
          )}
          style={{ color: shareCardPalette.muted }}
        >
          攻略作者
        </div>
        <div className="mt-1 break-words text-[22px] font-bold leading-tight">
          {model.source.strategyAuthor}
        </div>
      </div>
      {headerRight &&
      (model.source.platform || model.source.sharer) ? (
        <div
          className={clsx(
            'min-w-0 text-sm',
            stackSourceInfo
              ? 'mt-2 flex flex-col items-start gap-1.5'
              : 'flex flex-1 flex-col justify-center gap-2 border-l pl-5',
          )}
          style={stackSourceInfo ? undefined : { borderColor: '#c7d0cc' }}
        >
          {model.source.platform ? (
            <div
              className="inline-flex w-fit whitespace-nowrap rounded-sm border px-2 py-1 text-xs font-semibold"
              style={{
                borderColor: '#9aaba5',
                color: shareCardPalette.muted,
              }}
            >
              来源平台 · {model.source.platform}
            </div>
          ) : null}
          {model.source.sharer ? (
            <div
              className="break-words text-sm"
              style={{ color: shareCardPalette.muted }}
            >
              本站分享 · {model.source.sharer}
            </div>
          ) : null}
        </div>
      ) : null}
      {!headerRight && model.source.platform ? (
        <div
          className="mt-2 inline-flex whitespace-nowrap rounded-sm border px-2 py-1 text-xs font-semibold"
          style={{
            borderColor: '#9aaba5',
            color: shareCardPalette.muted,
          }}
        >
          来源平台 · {model.source.platform}
        </div>
      ) : null}
      {!headerRight && model.source.sharer ? (
        <div
          className="mt-2 text-sm"
          style={{ color: shareCardPalette.muted }}
        >
          本站分享 · {model.source.sharer}
        </div>
      ) : null}
    </div>
  )

  const qrCode = !hasQrCode ? null : (
    <div className="w-[104px] shrink-0 text-center">
      <img
        alt={model.qrLabel}
        className="h-[104px] w-[104px] bg-white object-contain"
        height={104}
        src={qrDataUrl}
        width={104}
      />
      <div
        className="mt-2 text-xs font-semibold leading-4"
        style={{ color: shareCardPalette.muted }}
      >
        {model.qrLabel}
      </div>
    </div>
  )

  return (
    <div
      ref={cardRef}
      style={{ ...shareCardStyle, background: backgroundColor }}
    >
      <header
        className={clsx(
          'flex justify-between gap-8',
          headerRight ? 'items-stretch' : 'items-start',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div
              className="text-[15px] font-bold uppercase tracking-[0.18em]"
              style={{ color: shareCardPalette.brand }}
            >
              {eyebrow}
            </div>
            <span
              className="inline-flex rounded-sm px-2.5 py-1 text-sm font-bold"
              style={{
                background: sourceTag.background,
                color: sourceTag.color,
              }}
            >
              {sourceTag.label}
            </span>
          </div>
          <h1
            className="mt-4 break-words text-[44px] font-bold leading-[1.18]"
            style={{ color: '#172522' }}
          >
            {model.title}
          </h1>
          {headerRight ? (
            <div
              className={clsx(
                'mt-4 flex gap-5',
                hasQrCode ? 'items-center' : 'items-start',
              )}
            >
              {sourceInfo}
              {qrCode}
            </div>
          ) : null}
        </div>
        {headerRight ? (
          <div
            className="flex w-[440px] shrink-0 border-l-4 pl-6"
            style={{ borderColor: shareCardPalette.accent }}
          >
            {headerRight}
          </div>
        ) : (
          <div className="mt-1 flex w-[440px] shrink-0 items-start justify-end gap-4">
            {sourceInfo}
            {qrCode}
          </div>
        )}
      </header>

      {children}

      <footer
        className="mt-9 flex items-end justify-between gap-8 border-t pt-5 text-sm"
        style={{ borderColor: '#b9c4c0', color: shareCardPalette.muted }}
      >
        {/* 「神秘代码」与「站内地址」携带同一个作业 id，必须作为一个整体开关处理 */}
        {showShortCode ? (
          <div className="min-w-0">
            <div>
              MaaYuan 神秘代码 ·{' '}
              <span
                className="font-bold"
                style={{ color: shareCardPalette.ink }}
              >
                {model.shortCode}
              </span>
            </div>
            <div className="mt-1 max-w-[760px] break-all text-xs">
              站内地址 · {model.maayuanUrl}
            </div>
          </div>
        ) : null}
        <div
          className={clsx('shrink-0 text-right', !showShortCode && 'ml-auto')}
        >
          <div className="font-semibold">MAAYUAN SHARE</div>
          <div className="mt-1 text-xs">让每一步都清晰可见</div>
        </div>
      </footer>
    </div>
  )
}

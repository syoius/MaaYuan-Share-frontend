import clsx from 'clsx'
import { ReactNode } from 'react'

import {
  OperatorInfo,
  findOperatorById,
  findOperatorByName,
} from '../models/operator'
import { operatorAvatarFallback, operatorAvatarUrl } from '../models/operatorAvatar'

interface OperatorAvatarProps {
  id?: string
  name?: string
  rarity?: number
  size?: 'small' | 'medium' | 'large' | 'verylarge'
  sourceSize?: 32 | 96
  fallback?: ReactNode
  className?: string
}

export function OperatorAvatar({
  id,
  name,
  rarity,
  size,
  fallback = '?',
  className,
  sourceSize = 32,
}: OperatorAvatarProps) {
  let info: OperatorInfo | undefined
  if (id) {
    info = findOperatorById(id)
    name = info?.name
  } else if (name) {
    info = findOperatorByName(name)
    id = info?.id
  }
  rarity ??= info?.rarity

  const sizing =
    size &&
    {
      small: { className: 'h-5 w-5', pixels: 20 },
      medium: { className: 'h-6 w-6', pixels: 24 },
      large: { className: 'h-8 w-8', pixels: 32 },
      verylarge: { className: 'h-12 w-12', pixels: 48 },
    }[size]

  const colorClassName =
    rarity === 6
      ? 'bg-orange-200 ring-orange-300'
      : rarity === 5
        ? 'bg-yellow-100 ring-yellow-200'
        : rarity === 4
          ? 'bg-purple-100 ring-purple-200'
          : 'bg-slate-100 ring-slate-200'

  const commonClassName =
    'ring-inset ring-2 border-solid rounded-md object-cover'

  const useCompactSource = size === 'small' && sourceSize === 32
  const avatarSrc = operatorAvatarUrl(id, useCompactSource ? 32 : 96)
  const avatarSrcSet = `${avatarSrc} 1x, ${operatorAvatarUrl(id, useCompactSource ? 96 : 192)} 2x`

  return id ? (
    <img
      className={clsx(
        sizing?.className,
        colorClassName,
        commonClassName,
        className,
      )}
      src={avatarSrc}
      srcSet={avatarSrcSet}
      alt={name || id}
      // lazy 要配合 width 和 height 使用，不然图片提前很多就加载了
      loading="lazy"
      width={sizing?.pixels ?? sourceSize}
      height={sizing?.pixels ?? sourceSize}
      onError={(event) => {
        const target = event.currentTarget
        if (target.dataset.fallbackApplied === 'true') return
        target.dataset.fallbackApplied = 'true'
        target.srcset = ''
        target.src = operatorAvatarFallback
      }}
    />
  ) : (
    <div
      className={clsx(
        sizing?.className,
        colorClassName,
        commonClassName,
        'flex items-center justify-center font-bold text-2xl text-slate-300 truncate select-none',
        className,
      )}
    >
      <div className="min-w-0">{fallback}</div>
    </div>
  )
}

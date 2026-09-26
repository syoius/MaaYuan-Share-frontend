export interface OperationShareTableTheme {
  headerBackground: string
  bodyBackgrounds: readonly [string, string]
  pageBackground: string
  border: string
  text: string
  mutedText: string
  headerText: string
  headerMutedText: string
}

export type OperationShareTableThemeOverrideKey =
  | 'headerBackground'
  | 'pageBackground'
  | 'lightRowBackground'
  | 'darkRowBackground'
  | 'border'
  | 'text'

export interface OperationShareTableThemeOverrides {
  headerBackground?: string
  pageBackground?: string
  lightRowBackground?: string
  darkRowBackground?: string
  border?: string
  text?: string
}

export const DEFAULT_OPERATION_SHARE_TABLE_THEME: OperationShareTableTheme = {
  headerBackground: '#f0dec1',
  bodyBackgrounds: ['#f3e3c9', '#ddc09e'],
  pageBackground: '#fbf8f3',
  border: '#78501f',
  text: '#624015',
  mutedText: '#9a856d',
  headerText: '#624015',
  headerMutedText: '#9a856d',
}

export const DEFAULT_OPERATION_SHARE_TABLE_BASE_COLOR = '#b98a4a'
const DEFAULT_TABLE_LIGHT_ROW_MIX = 0.7
const DEFAULT_TABLE_DARK_ROW_MIX = 0.45

export interface OperationShareTableThemePreset {
  id: 'native' | 'blue' | 'green' | 'orange' | 'purple' | 'pink'
  label: string
  baseColor?: string
  lightRowMix?: number
  darkRowMix?: number
}

export const OPERATION_SHARE_TABLE_THEME_PRESETS: readonly OperationShareTableThemePreset[] =
  [
    { id: 'native', label: '原生' },
    { id: 'blue', label: '蓝色', baseColor: '#4d6fa8', lightRowMix: 0.96 },
    { id: 'green', label: '绿色', baseColor: '#4b7d5b', lightRowMix: 0.94 },
    { id: 'orange', label: '橙色', baseColor: '#c66a2b' },
    { id: 'purple', label: '紫色', baseColor: '#7d5bb7', lightRowMix: 0.88 },
    {
      id: 'pink',
      label: '粉色',
      baseColor: '#a8607b',
      lightRowMix: 0.94,
      darkRowMix: 0.78,
    },
  ]

const HEX_COLOR_PATTERN = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const TABLE_THEME_OVERRIDE_KEYS = [
  'headerBackground',
  'pageBackground',
  'lightRowBackground',
  'darkRowBackground',
  'border',
  'text',
] as const

interface RgbColor {
  red: number
  green: number
  blue: number
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function expandHexColor(value: string) {
  const hex = value.replace('#', '').toLowerCase()
  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map((character) => character + character)
      .join('')}`
  }
  return `#${hex}`
}

export function normalizeOperationShareTableColor(value?: string) {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!HEX_COLOR_PATTERN.test(normalized)) return undefined
  return expandHexColor(normalized)
}

export function getOperationShareTableThemePreset(
  tableColor?: string,
): OperationShareTableThemePreset {
  const normalized = normalizeOperationShareTableColor(tableColor)
  if (!normalized) return OPERATION_SHARE_TABLE_THEME_PRESETS[0]

  return (
    OPERATION_SHARE_TABLE_THEME_PRESETS.find(
      (preset) =>
        preset.baseColor &&
        normalizeOperationShareTableColor(preset.baseColor) === normalized,
    ) ?? OPERATION_SHARE_TABLE_THEME_PRESETS[0]
  )
}

export function normalizeOperationShareTableThemeOverrides(
  value: unknown,
): OperationShareTableThemeOverrides | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  const source = value as Record<string, unknown>
  const overrides: OperationShareTableThemeOverrides = {}
  TABLE_THEME_OVERRIDE_KEYS.forEach((key) => {
    const color = normalizeOperationShareTableColor(
      typeof source[key] === 'string' ? source[key] : undefined,
    )
    if (color) overrides[key] = color
  })

  return Object.keys(overrides).length > 0 ? overrides : undefined
}

function hexToRgb(value: string): RgbColor {
  const hex = expandHexColor(value).slice(1)
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function rgbToHex({ red, green, blue }: RgbColor) {
  return `#${[red, green, blue]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`
}

function mixHex(from: string, to: string, ratio: number) {
  const fromRgb = hexToRgb(from)
  const toRgb = hexToRgb(to)
  const clampedRatio = Math.max(0, Math.min(1, ratio))
  return rgbToHex({
    red: fromRgb.red + (toRgb.red - fromRgb.red) * clampedRatio,
    green: fromRgb.green + (toRgb.green - fromRgb.green) * clampedRatio,
    blue: fromRgb.blue + (toRgb.blue - fromRgb.blue) * clampedRatio,
  })
}

function relativeLuminance(color: string) {
  const { red, green, blue } = hexToRgb(color)
  const channels = [red, green, blue].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function ensureContrast(
  color: string,
  background: string,
  minimumRatio: number,
) {
  if (contrastRatio(color, background) >= minimumRatio) return color

  const contrastTarget =
    relativeLuminance(background) > 0.45 ? '#000000' : '#ffffff'
  for (let ratio = 0.2; ratio <= 1; ratio += 0.2) {
    const candidate = mixHex(color, contrastTarget, ratio)
    if (contrastRatio(candidate, background) >= minimumRatio) return candidate
  }
  return contrastTarget
}

export function getOperationShareTableTheme(
  tableColor?: string,
  overrides?: OperationShareTableThemeOverrides,
): OperationShareTableTheme {
  const baseColor = normalizeOperationShareTableColor(tableColor)
  const normalizedOverrides =
    normalizeOperationShareTableThemeOverrides(overrides)
  if (!baseColor && !normalizedOverrides) {
    return DEFAULT_OPERATION_SHARE_TABLE_THEME
  }

  const resolvedBaseColor =
    baseColor ?? DEFAULT_OPERATION_SHARE_TABLE_BASE_COLOR
  const preset = OPERATION_SHARE_TABLE_THEME_PRESETS.find(
    (candidate) =>
      candidate.baseColor &&
      normalizeOperationShareTableColor(candidate.baseColor) ===
        resolvedBaseColor,
  )
  const isCustomColor = Boolean(baseColor) && !preset
  const isVeryDark = relativeLuminance(resolvedBaseColor) < 0.18
  const bodyDarkMix =
    preset?.darkRowMix ??
    (isCustomColor ? DEFAULT_TABLE_DARK_ROW_MIX : isVeryDark ? 0.68 : 0.54)
  const bodyLightMix =
    preset?.lightRowMix ?? (isCustomColor ? DEFAULT_TABLE_LIGHT_ROW_MIX : 0.76)
  const defaultBodyBackgrounds = [
    mixHex(resolvedBaseColor, '#ffffff', bodyLightMix),
    mixHex(resolvedBaseColor, '#ffffff', bodyDarkMix),
  ] as const
  const defaultHeaderBackground = mixHex(resolvedBaseColor, '#ffffff', 0.74)
  const bodyBackgrounds = [
    normalizedOverrides?.lightRowBackground ?? defaultBodyBackgrounds[0],
    normalizedOverrides?.darkRowBackground ?? defaultBodyBackgrounds[1],
  ] as const
  const pageBackground =
    normalizedOverrides?.pageBackground ??
    mixHex(resolvedBaseColor, '#ffffff', 0.94)
  const headerBackground =
    normalizedOverrides?.headerBackground ?? defaultHeaderBackground
  const preferredText = mixHex(resolvedBaseColor, '#111827', 0.8)
  const text =
    normalizedOverrides?.text ??
    ensureContrast(preferredText, bodyBackgrounds[1], 4.8)
  const preferredMutedText = mixHex(resolvedBaseColor, '#64748b', 0.66)
  const mutedText = ensureContrast(preferredMutedText, bodyBackgrounds[1], 3.2)
  const preferredHeaderText = mixHex(resolvedBaseColor, '#111827', 0.84)
  const headerText =
    normalizedOverrides?.text ??
    ensureContrast(preferredHeaderText, headerBackground, 4.5)
  const preferredHeaderMutedText = mixHex(resolvedBaseColor, '#64748b', 0.62)
  const headerMutedText = ensureContrast(
    preferredHeaderMutedText,
    headerBackground,
    3.2,
  )

  return {
    headerBackground,
    bodyBackgrounds,
    pageBackground,
    border:
      normalizedOverrides?.border ?? mixHex(resolvedBaseColor, '#000000', 0.42),
    text,
    mutedText,
    headerText,
    headerMutedText,
  }
}

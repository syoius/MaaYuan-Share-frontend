import { CopilotInfoStatusEnum } from 'maa-copilot-client'

import type { Language } from '../../i18n/i18n'
import { CopilotDocV1 } from '../../models/copilot.schema'
import type { Operation } from '../../models/operation'
import {
  OPERATORS,
  getLocalizedOperatorName,
  getModuleName,
  withDefaultRequirements,
} from '../../models/operator'
import { readOperatorStats } from '../../utils/operatorStats'
import {
  buildOperationActionDisplay,
  formatTokenSummary,
  groupTokensForTable,
} from './ActionSequenceViewer'
import {
  type OperationShareTableThemeOverrides,
  normalizeOperationShareTableColor,
  normalizeOperationShareTableThemeOverrides,
} from './operationShareTheme'

export interface OperationShareOperator {
  slot?: number
  name: string
  rawName: string
  avatarId?: string
  starLevel?: number
  attack?: number
  hp?: number
  skill?: number
  elite?: number
  level?: number
  skillLevel?: number
  potentiality?: number
  module?: string
  discs: OperationShareDisc[]
}

export interface OperationShareDisc {
  slot: number
  abbreviation: string
  color?: string
  forbidden: boolean
  starStone?: string
  assistStar?: string
}

export interface OperationShareGroup {
  name: string
  operators: OperationShareOperator[]
}

export interface OperationShareAction {
  raw: string
  order: number
  label: string
}

export type OperationShareCellColumn = `slot-${number}`

export interface OperationShareCardConfig {
  showTargetSwitches: boolean
  showOtherActions: boolean
  showNotes: boolean
  /** 为已上色的单元格添加底纹；关闭时全部渲染为纯色块。 */
  showCellPattern: boolean
  tableColor?: string
  tableThemeOverrides?: OperationShareTableThemeOverrides
  notes: Record<number, string>
  cellColors: Record<string, string>
  requiredDiscs: Record<string, boolean>
}

/**
 * 单元格底纹类型。'solid' 即不上底纹，其余为各颜色在「增加底纹」打开时
 * 使用的纹样。这里只描述数据，具体 CSS 由 OperationShareCard 负责。
 */
export type OperationShareCellPattern =
  'solid' | 'vertical' | 'horizontal' | 'diagonal' | 'cross' | 'dots'

/** 单元格可用的颜色；是否带底纹由 showCellPattern 统一控制。 */
export const OPERATION_SHARE_CELL_COLOR_KEYS = [
  'yellow',
  'pink',
  'blue',
  'green',
  'ice',
] as const

export type OperationShareCellColorKey =
  (typeof OPERATION_SHARE_CELL_COLOR_KEYS)[number]

/** 各颜色的基础色，以及「增加底纹」时使用的纹样。 */
export const OPERATION_SHARE_CELL_PALETTE: Record<
  OperationShareCellColorKey,
  { hex: string; pattern: OperationShareCellPattern }
> = {
  yellow: { hex: '#fff3c9', pattern: 'cross' },
  pink: { hex: '#ffe3ed', pattern: 'vertical' },
  blue: { hex: '#c3e8ff', pattern: 'horizontal' },
  green: { hex: '#e1edc1', pattern: 'diagonal' },
  ice: { hex: '#d8e8ee', pattern: 'dots' },
}

/** cellColors 的取值：颜色名，例如 'yellow'。 */
export type OperationShareCellStyle = OperationShareCellColorKey

const OPERATION_SHARE_CELL_COLOR_SET: ReadonlySet<string> = new Set(
  OPERATION_SHARE_CELL_COLOR_KEYS,
)

/**
 * 历史兼容表：旧版本把「颜色」和「纹样」绑死、并把颜色存成 hex，
 * 这里统一按色系归到对应的颜色名（是否带底纹改由 showCellPattern 控制）。
 */
const LEGACY_OPERATION_SHARE_CELL_STYLES: Record<
  string,
  OperationShareCellStyle
> = {
  '#fff3c9': 'yellow',
  '#ffe3ed': 'pink',
  '#c3e8ff': 'blue',
  '#e1edc1': 'green',
  '#edf8ff': 'ice',
  // 更早的 24 色板（含 Okabe-Ito 色盲友好色）统一按色系归类
  '#f4ecdf': 'ice',
  '#f2dfb9': 'yellow',
  '#d8e9e4': 'green',
  '#dbe7ea': 'blue',
  '#f4d9d1': 'pink',
  '#dfe4e2': 'ice',
  '#e7cfaa': 'yellow',
  '#e8bd68': 'yellow',
  '#afd0c4': 'green',
  '#aecbd4': 'blue',
  '#e5afa1': 'pink',
  '#becbc7': 'ice',
  '#e89b91': 'pink',
  '#e8bd5f': 'yellow',
  '#a1c77f': 'green',
  '#79c3b6': 'blue',
  '#82add5': 'blue',
  '#bd9bcc': 'pink',
  '#e69f00': 'yellow',
  '#56b4e9': 'blue',
  '#009e73': 'green',
  '#f0e442': 'yellow',
  '#0072b2': 'blue',
  '#cc79a7': 'pink',
}

const OPERATION_SHARE_CARD_CONFIG_STORAGE_VERSION = 1
const OPERATION_SHARE_CARD_CONFIG_STORAGE_PREFIX =
  'maa-copilot-operation-share-card-config'
// 「分享神秘代码」是跨卡片（页脚属于 ShareCardFrame）的开关，不参与
// OperationShareCardConfig 的归一化与 schema 版本，因此单独存一个 key。
const OPERATION_SHARE_SHORT_CODE_STORAGE_PREFIX =
  'maa-copilot-operation-share-short-code'
const SHARE_CELL_KEY_PATTERN = /^\d+:slot-\d+$/
const REQUIRED_DISC_KEY_PATTERN = /^\d+:[1-3]$/

export interface OperationShareRound {
  round: number
  slots: Record<number, OperationShareAction[]>
  others: OperationShareAction[]
}

export interface OperationShareSource {
  type: 'original' | 'repost'
  strategyAuthor: string
  sharer?: string
  platform?: string
  originalUrl?: string
}

export interface OperationShareModel {
  title: string
  stage: string
  author: string
  originalAuthor?: string
  source: OperationShareSource
  shortCode: string
  maayuanUrl: string
  qrTargetUrl: string
  qrLabel: string
  operators: OperationShareOperator[]
  groups: OperationShareGroup[]
  actionSlots: number[]
  rounds: OperationShareRound[]
}

export type OperationShareCardKind = 'actions' | 'operators'

export const OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION = 1
export const OPERATION_SHARE_CARD_KEYS: Record<OperationShareCardKind, string> =
  {
    actions: 'actions',
    operators: 'deployed-operators',
  }

export interface OperationShareRemoteConfig {
  cardKey: string
  schemaVersion: number
  revision: number
  payload: unknown
}

export function createOperationShareCardConfig(): OperationShareCardConfig {
  return {
    showTargetSwitches: true,
    showOtherActions: true,
    showNotes: false,
    showCellPattern: true,
    tableColor: undefined,
    tableThemeOverrides: undefined,
    notes: {},
    cellColors: {},
    requiredDiscs: {},
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeOperationShareCardConfig(
  value: unknown,
): OperationShareCardConfig {
  const defaults = createOperationShareCardConfig()
  if (!isRecord(value)) return defaults

  const tableColor = normalizeOperationShareTableColor(
    typeof value.tableColor === 'string' ? value.tableColor : undefined,
  )
  const tableThemeOverrides = normalizeOperationShareTableThemeOverrides(
    value.tableThemeOverrides,
  )

  const notes: Record<number, string> = {}
  if (isRecord(value.notes)) {
    Object.entries(value.notes).forEach(([round, note]) => {
      if (/^\d+$/.test(round) && typeof note === 'string') {
        notes[Number(round)] = note.slice(0, 160)
      }
    })
  }

  const cellColors: Record<string, string> = {}
  if (isRecord(value.cellColors)) {
    Object.entries(value.cellColors).forEach(([key, style]) => {
      if (SHARE_CELL_KEY_PATTERN.test(key) && typeof style === 'string') {
        const normalizedStyle = style.trim().toLowerCase()
        const supportedStyle = OPERATION_SHARE_CELL_COLOR_SET.has(
          normalizedStyle,
        )
          ? (normalizedStyle as OperationShareCellStyle)
          : LEGACY_OPERATION_SHARE_CELL_STYLES[normalizedStyle]

        if (supportedStyle) cellColors[key] = supportedStyle
      }
    })
  }

  const requiredDiscs: Record<string, boolean> = {}
  if (isRecord(value.requiredDiscs)) {
    Object.entries(value.requiredDiscs).forEach(([key, required]) => {
      if (REQUIRED_DISC_KEY_PATTERN.test(key) && required === true) {
        requiredDiscs[key] = true
      }
    })
  }

  return {
    showTargetSwitches:
      typeof value.showTargetSwitches === 'boolean'
        ? value.showTargetSwitches
        : defaults.showTargetSwitches,
    showOtherActions:
      typeof value.showOtherActions === 'boolean'
        ? value.showOtherActions
        : defaults.showOtherActions,
    showNotes:
      typeof value.showNotes === 'boolean'
        ? value.showNotes
        : defaults.showNotes,
    showCellPattern:
      typeof value.showCellPattern === 'boolean'
        ? value.showCellPattern
        : defaults.showCellPattern,
    tableColor,
    tableThemeOverrides,
    notes,
    cellColors,
    requiredDiscs,
  }
}

export function buildOperationShareCardConfigPayload(
  kind: OperationShareCardKind,
  config: OperationShareCardConfig,
): Record<string, unknown> {
  const normalized = normalizeOperationShareCardConfig(config)
  if (kind === 'operators') {
    return { requiredDiscs: normalized.requiredDiscs }
  }

  return {
    showTargetSwitches: normalized.showTargetSwitches,
    showOtherActions: normalized.showOtherActions,
    showNotes: normalized.showNotes,
    showCellPattern: normalized.showCellPattern,
    tableColor: normalized.tableColor,
    tableThemeOverrides: normalized.tableThemeOverrides,
    notes: normalized.notes,
    cellColors: normalized.cellColors,
  }
}

export function getOperationShareRemoteConfigByKind(
  configs: readonly OperationShareRemoteConfig[],
) {
  const byKind: Partial<
    Record<OperationShareCardKind, OperationShareRemoteConfig>
  > = {}
  configs.forEach((config) => {
    const kind = (
      Object.keys(OPERATION_SHARE_CARD_KEYS) as OperationShareCardKind[]
    ).find(
      (candidate) => OPERATION_SHARE_CARD_KEYS[candidate] === config.cardKey,
    )
    if (kind) byKind[kind] = config
  })
  return byKind
}

export function getRenderableOperationShareConfigs(
  configs: readonly OperationShareRemoteConfig[],
) {
  const byKind = getOperationShareRemoteConfigByKind(configs)
  return (Object.keys(OPERATION_SHARE_CARD_KEYS) as OperationShareCardKind[])
    .filter(
      (kind) =>
        byKind[kind]?.schemaVersion ===
        OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION,
    )
    .reduce<Partial<Record<OperationShareCardKind, OperationShareCardConfig>>>(
      (renderable, kind) => {
        renderable[kind] = normalizeOperationShareCardConfig(
          byKind[kind]?.payload,
        )
        return renderable
      },
      {},
    )
}

export function mergeOperationShareRemoteConfigs(
  configs: readonly OperationShareRemoteConfig[],
) {
  const defaults = createOperationShareCardConfig()
  const byKind = getOperationShareRemoteConfigByKind(configs)
  const actions = byKind.actions
  const operators = byKind.operators
  const actionConfig =
    actions?.schemaVersion === OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION
      ? normalizeOperationShareCardConfig(actions.payload)
      : defaults
  const operatorConfig =
    operators?.schemaVersion === OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION
      ? normalizeOperationShareCardConfig(operators.payload)
      : defaults

  return {
    ...actionConfig,
    requiredDiscs: operatorConfig.requiredDiscs,
  }
}

export function resolveOperationShareCardConfig(
  localConfig: OperationShareCardConfig | undefined,
  authorConfig: OperationShareCardConfig,
) {
  if (!localConfig) return authorConfig

  const local = normalizeOperationShareCardConfig(localConfig)
  const defaults = createOperationShareCardConfig()
  const hasLocalActionOverrides =
    local.showTargetSwitches !== defaults.showTargetSwitches ||
    local.showOtherActions !== defaults.showOtherActions ||
    local.showNotes !== defaults.showNotes ||
    local.showCellPattern !== defaults.showCellPattern ||
    local.tableColor !== undefined ||
    local.tableThemeOverrides !== undefined ||
    Object.keys(local.notes).length > 0 ||
    Object.keys(local.cellColors).length > 0
  const hasLocalOperatorOverrides = Object.keys(local.requiredDiscs).length > 0

  return {
    ...(hasLocalActionOverrides ? local : authorConfig),
    requiredDiscs: hasLocalOperatorOverrides
      ? local.requiredDiscs
      : authorConfig.requiredDiscs,
  }
}

export function replaceOperationShareCardConfigKind(
  kind: OperationShareCardKind,
  current: OperationShareCardConfig,
  replacement: OperationShareCardConfig,
) {
  if (kind === 'operators') {
    return { ...current, requiredDiscs: replacement.requiredDiscs }
  }

  return {
    ...current,
    showTargetSwitches: replacement.showTargetSwitches,
    showOtherActions: replacement.showOtherActions,
    showNotes: replacement.showNotes,
    showCellPattern: replacement.showCellPattern,
    tableColor: replacement.tableColor,
    tableThemeOverrides: replacement.tableThemeOverrides,
    notes: replacement.notes,
    cellColors: replacement.cellColors,
  }
}

function operationShareCardConfigStorageKey(operationId: number) {
  return `${OPERATION_SHARE_CARD_CONFIG_STORAGE_PREFIX}:v${OPERATION_SHARE_CARD_CONFIG_STORAGE_VERSION}:${operationId}`
}

export function loadOperationShareCardConfig(
  operationId: number,
  storage: Pick<Storage, 'getItem'> = window.localStorage,
) {
  return (
    readOperationShareCardConfig(operationId, storage) ??
    createOperationShareCardConfig()
  )
}

export function readOperationShareCardConfig(
  operationId: number,
  storage: Pick<Storage, 'getItem'> = window.localStorage,
) {
  try {
    const raw = storage.getItem(operationShareCardConfigStorageKey(operationId))
    if (!raw) return undefined
    const stored = JSON.parse(raw) as unknown
    if (
      !isRecord(stored) ||
      stored.version !== OPERATION_SHARE_CARD_CONFIG_STORAGE_VERSION
    ) {
      return undefined
    }
    return normalizeOperationShareCardConfig(stored.config)
  } catch {
    return undefined
  }
}

export function saveOperationShareCardConfig(
  operationId: number,
  config: OperationShareCardConfig,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
) {
  try {
    storage.setItem(
      operationShareCardConfigStorageKey(operationId),
      JSON.stringify({
        version: OPERATION_SHARE_CARD_CONFIG_STORAGE_VERSION,
        config: normalizeOperationShareCardConfig(config),
      }),
    )
    return true
  } catch {
    return false
  }
}

function operationShareShortCodeStorageKey(operationId: number) {
  return `${OPERATION_SHARE_SHORT_CODE_STORAGE_PREFIX}:${operationId}`
}

/**
 * 读取用户对「分享神秘代码」的显式选择；从未设置过时返回 undefined，
 * 交由 resolveOperationShareShortCode 按作业可见性推导默认值。
 */
export function readOperationShareShortCode(
  operationId: number,
  storage: Pick<Storage, 'getItem'> = window.localStorage,
) {
  try {
    const raw = storage.getItem(operationShareShortCodeStorageKey(operationId))
    if (raw === 'true') return true
    if (raw === 'false') return false
    return undefined
  } catch {
    return undefined
  }
}

/**
 * 只在用户显式切换后才落盘，避免把「按可见性推导的默认值」固化下来：
 * 作业从「仅个人可见」改为公开后，默认值应当随状态自动恢复为分享。
 */
export function saveOperationShareShortCode(
  operationId: number,
  shareShortCode: boolean,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
) {
  try {
    storage.setItem(
      operationShareShortCodeStorageKey(operationId),
      shareShortCode ? 'true' : 'false',
    )
    return true
  } catch {
    return false
  }
}

/**
 * 分享图页脚的「神秘代码」与「站内地址」指向同一个作业 id，原创作业的二维码
 * 也编码同一地址，因此它是一个整体开关：关闭即整块隐藏。
 * 「仅个人可见」的作业默认不分享，用户显式选择优先。
 */
export function resolveOperationShareShortCode(
  operation: { status?: Operation['status'] | undefined },
  stored: boolean | undefined,
) {
  if (typeof stored === 'boolean') return stored
  return operation.status !== CopilotInfoStatusEnum.Private
}

export function buildOperationShareCellKey(
  round: number,
  column: OperationShareCellColumn,
) {
  return `${round}:${column}`
}

export function buildOperationShareDiscKey(
  operatorSlot: number,
  discSlot: number,
) {
  return `${operatorSlot}:${discSlot}`
}

export function getOperationShareCellSelectionState(
  selectedCellKeys: ReadonlySet<string>,
  cellKeys: readonly string[],
) {
  let selectedCount = 0
  cellKeys.forEach((key) => {
    if (selectedCellKeys.has(key)) selectedCount += 1
  })

  return {
    checked: cellKeys.length > 0 && selectedCount === cellKeys.length,
    indeterminate: selectedCount > 0 && selectedCount < cellKeys.length,
  }
}

export function updateOperationShareCellSelection(
  selectedCellKeys: ReadonlySet<string>,
  cellKeys: readonly string[],
  checked: boolean,
) {
  const next = new Set(selectedCellKeys)
  cellKeys.forEach((key) => {
    if (checked) next.add(key)
    else next.delete(key)
  })
  return next
}

function isTargetSwitchAction(raw: string) {
  return raw === '额外:左侧目标' || raw === '额外:右侧目标'
}

function belongsToOtherShareColumn(raw: string) {
  return (
    isTargetSwitchAction(raw) || /^重开:检测[1-5]号位(阵亡|鹦鹉)$/.test(raw)
  )
}

export function filterOperationShareActions(
  actions: OperationShareAction[],
  showTargetSwitches: boolean,
) {
  return showTargetSwitches
    ? actions
    : actions.filter((action) => !isTargetSwitchAction(action.raw))
}

function isHiddenShareAction(raw: string) {
  return raw.startsWith('额外:等待')
}

function formatShareActionSummary(raw: string, language: Language) {
  if (raw === '额外:左侧目标') return '右滑'
  if (raw === '额外:右侧目标') return '左滑'
  return formatTokenSummary(raw, language)
}

function normalizeHttpUrl(raw?: string) {
  const value = raw?.trim()
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

interface OperationDiscSlot {
  index: number
  disc: number
  starStone?: string
  assistStar?: string
}

function readOperationDiscSlots(
  operator: CopilotDocV1.Operator,
): OperationDiscSlot[] {
  const legacy = operator as CopilotDocV1.Operator & {
    discsSelected?: unknown
    discStarStones?: unknown
    discAssistStars?: unknown
  }
  const selected = Array.isArray(legacy.discsSelected)
    ? legacy.discsSelected
    : []
  const starStones = Array.isArray(legacy.discStarStones)
    ? legacy.discStarStones
    : []
  const assistStars = Array.isArray(legacy.discAssistStars)
    ? legacy.discAssistStars
    : []
  if (selected.length > 0 || starStones.length > 0 || assistStars.length > 0) {
    return [0, 1, 2].map((index) => ({
      index,
      disc: Number(selected[index]) || 0,
      starStone:
        typeof starStones[index] === 'string' ? starStones[index] : undefined,
      assistStar:
        typeof assistStars[index] === 'string' ? assistStars[index] : undefined,
    }))
  }

  const extensions = (
    operator as unknown as {
      extensions?: { discs?: { slots?: unknown } }
    }
  ).extensions
  const extensionSlots = extensions?.discs?.slots
  if (!Array.isArray(extensionSlots)) return []

  return extensionSlots
    .filter(
      (slot): slot is Record<string, unknown> =>
        isRecord(slot) && typeof slot.index === 'number',
    )
    .map((slot) => ({
      index: Number(slot.index),
      disc: Number(slot.disc) || 0,
      starStone:
        typeof slot.starStone === 'string' ? slot.starStone : undefined,
      assistStar:
        typeof slot.assistStar === 'string' ? slot.assistStar : undefined,
    }))
    .sort((left, right) => left.index - right.index)
    .slice(0, 3)
}

function optionalLabel(value?: string) {
  const normalized = value?.trim()
  return normalized || undefined
}

function mapOperator(
  operator: CopilotDocV1.Operator,
  language: Language,
  slot?: number,
): OperationShareOperator {
  const info = OPERATORS.find((candidate) => candidate.name === operator.name)
  const unrestricted = Boolean(
    (operator as CopilotDocV1.Operator & { unrestricted?: unknown })
      .unrestricted,
  )

  if (unrestricted) {
    return {
      slot,
      name: getLocalizedOperatorName(operator.name, language),
      rawName: operator.name,
      avatarId: info?.id,
      starLevel: undefined,
      attack: undefined,
      hp: undefined,
      skill: operator.skill,
      elite: undefined,
      level: undefined,
      skillLevel: undefined,
      potentiality: undefined,
      module: undefined,
      discs: [],
    }
  }

  const requirements = withDefaultRequirements(
    operator.requirements,
    info?.rarity,
  )
  const stats = readOperatorStats(operator)
  const module =
    requirements.module === CopilotDocV1.Module.Default
      ? undefined
      : getModuleName(requirements.module)
  const discList = info?.discs ?? []
  const discs = readOperationDiscSlots(operator).flatMap((slot) => {
    const starStone = optionalLabel(slot.starStone)
    const assistStar = optionalLabel(slot.assistStar)
    const selectedDisc = discList[Math.abs(slot.disc) - 1]
    if (!selectedDisc && !starStone && !assistStar) return []

    return [
      {
        slot: slot.index + 1,
        abbreviation: selectedDisc?.abbreviation ?? '未选择命盘',
        color: selectedDisc?.color,
        forbidden: slot.disc < 0,
        starStone,
        assistStar,
      },
    ]
  })

  return {
    slot,
    name: getLocalizedOperatorName(operator.name, language),
    rawName: operator.name,
    avatarId: info?.id,
    starLevel: stats.hasStar
      ? Math.min(5, Math.max(0, stats.starLevel))
      : undefined,
    attack: stats.hasAttack ? Math.max(0, stats.attack) : undefined,
    hp: stats.hasHp ? Math.max(0, stats.hp) : undefined,
    skill: operator.skill,
    elite: requirements.elite,
    level: requirements.level,
    skillLevel: requirements.skillLevel,
    potentiality: requirements.potentiality,
    module,
    discs,
  }
}

export function buildOperationShareModel(
  operation: Operation,
  language: Language,
  maayuanUrl = '?op=' + operation.id,
): OperationShareModel {
  const content = operation.parsedContent
  const operators = (content.opers ?? []).map((operator, index) =>
    mapOperator(operator, language, index + 1),
  )
  const groups = (content.groups ?? []).map((group, groupIndex) => ({
    name: group.name?.trim() || `密探组 ${groupIndex + 1}`,
    operators: (group.opers ?? []).map((operator) =>
      mapOperator(operator, language),
    ),
  }))

  const actionDisplay = buildOperationActionDisplay(operation, language)
  const rounds = actionDisplay.rounds.map((round) => {
    const grouped = groupTokensForTable(
      round.tokens.filter((token) => !isHiddenShareAction(token.raw)),
      actionDisplay.slotAssignments,
    )
    const slots: Record<number, OperationShareAction[]> = {}
    const otherTokens = [...grouped.others]
    for (let slot = 1; slot <= 5; slot += 1) {
      const key = String(slot) as keyof typeof grouped.slotMap
      const slotTokens = grouped.slotMap[key] ?? []
      otherTokens.push(
        ...slotTokens.filter((token) => belongsToOtherShareColumn(token.raw)),
      )
      slots[slot] = slotTokens
        .filter((token) => !belongsToOtherShareColumn(token.raw))
        .map((token) => ({
          raw: token.raw,
          order: token.order + 1,
          label: formatShareActionSummary(token.raw, language),
        }))
    }
    return {
      round: round.round,
      slots,
      others: otherTokens
        .sort((left, right) => left.order - right.order)
        .map((token) => ({
          raw: token.raw,
          order: token.order + 1,
          label: formatShareActionSummary(token.raw, language),
        })),
    }
  })

  const actionSlots = [1, 2, 3, 4, 5].filter(
    (slot) =>
      Boolean(actionDisplay.slotAssignments[slot]?.name) ||
      rounds.some((round) => round.slots[slot]?.length),
  )
  const author = operation.uploader?.trim() || '匿名作者'
  const isRepost = operation.metadata?.sourceType === 'repost'
  const originalAuthor = isRepost
    ? operation.metadata?.repostAuthor?.trim() || undefined
    : undefined
  const originalUrl = normalizeHttpUrl(operation.metadata?.repostUrl)
  const source: OperationShareSource = isRepost
    ? {
        type: 'repost',
        strategyAuthor: originalAuthor || '原作者未填写',
        sharer: author,
        platform: operation.metadata?.repostPlatform?.trim() || undefined,
        originalUrl,
      }
    : {
        type: 'original',
        strategyAuthor: author,
        originalUrl,
      }

  return {
    title: content.doc.title?.trim() || '未命名作业',
    stage:
      operation.preLevel?.name?.trim() ||
      content.stageName?.trim() ||
      '未知关卡',
    author,
    originalAuthor,
    source,
    shortCode: String(operation.id),
    maayuanUrl,
    qrTargetUrl: originalUrl || maayuanUrl,
    qrLabel: originalUrl
      ? isRepost
        ? '扫码查看原贴'
        : '扫码访问作者平台'
      : '扫码查看 MaaYuan 作业',
    operators,
    groups,
    actionSlots: actionSlots.length > 0 ? actionSlots : [1, 2, 3, 4, 5],
    rounds,
  }
}

function sanitizeFilePart(value: string, fallback: string) {
  const sanitized = value
    .split('')
    .filter((character) => character.charCodeAt(0) > 31)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return sanitized || fallback
}

export function buildOperationShareFilename(
  model: Pick<OperationShareModel, 'stage' | 'title'>,
  kind: OperationShareCardKind = 'actions',
) {
  const stage = sanitizeFilePart(model.stage, '未知关卡')
  const title = sanitizeFilePart(model.title, '未命名作业')
  const suffix = kind === 'operators' ? '-上阵密探' : ''
  return `${stage}-${title}${suffix}.png`
}

export function buildOperationShareUrl(operationId: number, origin: string) {
  const url = new URL('/', origin)
  url.searchParams.set('op', String(operationId))
  return url.toString()
}

// 浏览器 canvas 导出位图的像素高度上限，超出后部分浏览器（尤其 iOS Safari）会生成失败或空白。
// 分享图按 1080px 定宽生成（见 shareCardComponents.tsx），长图（多回合/多密探）会很高，
// 因此按「上限 / 卡片高度」动态降低导出像素比，把最终位图高度压回该阈值以内。
const MAX_CANVAS_HEIGHT_PX = 16000

export function calculateSharePixelRatio(cardHeight: number) {
  if (!Number.isFinite(cardHeight) || cardHeight <= 0) return 2
  return Math.max(1, Math.min(2, MAX_CANVAS_HEIGHT_PX / cardHeight))
}

export class ObjectUrlStore {
  private current?: string

  replace(blob: Blob) {
    this.revoke()
    this.current = URL.createObjectURL(blob)
    return this.current
  }

  revoke() {
    if (!this.current) return
    URL.revokeObjectURL(this.current)
    this.current = undefined
  }
}

import {
  Button,
  Callout,
  Checkbox,
  Dialog,
  Icon,
  Spinner,
  Switch,
} from '@blueprintjs/core'

import { useAtomValue } from 'jotai'
import { CopilotInfoStatusEnum } from 'maa-copilot-client'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  getOperationShareImageConfigs,
  updateOperationShareImageConfig,
} from '../../apis/operation-share-image-config'
import { languageAtom, useTranslation } from '../../i18n/i18n'
import type { Operation } from '../../models/operation'
import { findOperatorByName } from '../../models/operator'
import { formatError } from '../../utils/error'
import { AppToaster } from '../Toaster'
import { DeployedOperatorsShareCard } from './DeployedOperatorsShareCard'
import {
  OperationShareCard,
  getOperationShareActionFillColor,
  getOperationShareActionLabel,
  getOperationShareCellVisualStyle,
  getOperationShareNoteActionLabel,
  getOperationShareRoundDisplay,
  getOperationShareRoundNoteText,
} from './OperationShareCard'
import {
  createOperationShareQrDataUrl,
  renderOperationShareCardBlob,
} from './operationShareImage'
import {
  getOperationShareNotePlainText,
  OperationShareNoteEditor,
  OperationShareNoteFormatToolbar,
  resetOperationShareNoteFormatting,
} from './operationShareNote'
import {
  OPERATION_SHARE_ACTION_COLOR_ORDER,
  OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION,
  OPERATION_SHARE_CARD_KEYS,
  ObjectUrlStore,
  type OperationShareCardConfig,
  type OperationShareCardKind,
  type OperationShareCellColorKey,
  type OperationShareCellColumn,
  type OperationShareRound,
  buildOperationShareActionKey,
  buildOperationShareCardConfigPayload,
  buildOperationShareCellKey,
  buildOperationShareDiscKey,
  buildOperationShareFilename,
  buildOperationShareModel,
  buildOperationShareUrl,
  createOperationShareCardConfig,
  getOperationShareCellSelectionState,
  getOperationShareOtherActions,
  getOperationShareRemoteConfigByKind,
  isOperationShareTargetSwitchAction,
  mergeOperationShareRemoteConfigs,
  readOperationShareCardConfig,
  readOperationShareShortCode,
  replaceOperationShareCardConfigKind,
  resolveOperationShareCardConfig,
  resolveOperationShareExtraForbiddenDiscs,
  resolveOperationShareShortCode,
  saveOperationShareCardConfig,
  saveOperationShareShortCode,
  updateOperationShareCellSelection,
} from './operationShareModel'
import {
  DEFAULT_OPERATION_SHARE_TABLE_BASE_COLOR,
  OPERATION_SHARE_TABLE_THEME_PRESETS,
  type OperationShareTableThemeOverrideKey,
  getOperationShareTableTheme,
  normalizeOperationShareTableColor,
} from './operationShareTheme'

type GenerationStatus = 'idle' | 'generating' | 'ready' | 'error'
type ColorMode = 'action' | 'cell'
type EditMode = 'color' | 'note'
type OperationShareNoteHistoryState = Pick<
  OperationShareCardConfig,
  'hiddenOtherActionKeys' | 'roundNoteOverrides'
>

function cloneOperationShareNoteHistoryState(
  config: OperationShareCardConfig,
): OperationShareNoteHistoryState {
  return {
    hiddenOtherActionKeys: config.hiddenOtherActionKeys
      ? { ...config.hiddenOtherActionKeys }
      : undefined,
    roundNoteOverrides: config.roundNoteOverrides
      ? { ...config.roundNoteOverrides }
      : undefined,
  }
}

function areOperationShareNoteHistoryStatesEqual(
  left: OperationShareNoteHistoryState,
  right: OperationShareNoteHistoryState,
) {
  const leftRoundNotes = left.roundNoteOverrides ?? {}
  const rightRoundNotes = right.roundNoteOverrides ?? {}
  const roundNoteKeys = Object.keys(leftRoundNotes)
  if (roundNoteKeys.length !== Object.keys(rightRoundNotes).length) {
    return false
  }
  if (
    !roundNoteKeys.every(
      (key) =>
        leftRoundNotes[Number(key)] === rightRoundNotes[Number(key)],
    )
  ) {
    return false
  }

  const leftHiddenActions = left.hiddenOtherActionKeys ?? {}
  const rightHiddenActions = right.hiddenOtherActionKeys ?? {}
  const hiddenActionKeys = Object.keys(leftHiddenActions)
  if (hiddenActionKeys.length !== Object.keys(rightHiddenActions).length) {
    return false
  }
  return hiddenActionKeys.every(
    (key) => leftHiddenActions[key] === rightHiddenActions[key],
  )
}

function isMobileDeviceUserAgent() {
  if (typeof navigator === 'undefined') return false

  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  )
}

const MOBILE_TABLE_ROUND_COLUMN_WIDTH = 24
const MOBILE_ACTION_COLUMN_WIDTH = 36
const MOBILE_ACTION_COLUMN_WIDE_WIDTH = 72
const MOBILE_NOTE_ACTION_COLUMN_MIN_WIDTH = 28
const MOBILE_NOTE_MIN_COLUMN_WIDTH = 240

function appendOperationShareNoteText(note: string, text: string) {
  const trimmed = note.trim()
  if (!trimmed) return text
  if (getOperationShareNotePlainText(trimmed).includes(text)) return trimmed
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `${trimmed}<br>${escapedText}`
  }
  return `${trimmed}\n${text}`
}

function removeOperationShareNoteText(note: string, text: string) {
  const nextNote = note
    .split(text)
    .join('')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')

  if (!/<[a-z][\s\S]*>/i.test(note)) return nextNote
  return nextNote
    .replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br>')
    .replace(/(?:<br\s*\/?>)+$/i, '')
}

function OperationShareSelectionCheckbox({
  ariaLabel,
  checked,
  indeterminate,
  label,
  onChange,
  stacked = false,
}: {
  ariaLabel: string
  checked: boolean
  indeterminate: boolean
  label: string
  onChange: (checked: boolean) => void
  stacked?: boolean
}) {
  return (
    <label
      className={`inline-flex cursor-pointer select-none items-center justify-center whitespace-nowrap leading-none ${
        stacked
          ? 'h-auto flex-col gap-0.5 py-0.5'
          : 'h-6 gap-1 max-sm:h-auto max-sm:flex-col max-sm:gap-0 max-sm:py-0'
      }`}
    >
      <input
        aria-label={ariaLabel}
        checked={checked}
        className={`m-0 shrink-0 cursor-pointer accent-sky-600 ${
          stacked
            ? 'order-2 h-3 w-3'
            : 'h-3.5 w-3.5 max-sm:order-2 max-sm:h-3 max-sm:w-3'
        }`}
        onChange={(event) => onChange(event.currentTarget.checked)}
        ref={(input) => {
          if (input) {
            input.indeterminate = indeterminate
          }
        }}
        type="checkbox"
      />
      <span
        className={`leading-none ${
          stacked ? 'order-1 text-[10px]' : 'max-sm:order-1 max-sm:text-[10px]'
        }`}
      >
        {label}
      </span>
    </label>
  )
}

export default function OperationShareDialog({
  operation,
  canManageAuthorConfig,
  onClose,
}: {
  operation: Operation
  canManageAuthorConfig: boolean
  onClose: () => void
}) {
  const t = useTranslation()
  const language = useAtomValue(languageAtom)
  const maayuanUrl = useMemo(
    () => buildOperationShareUrl(operation.id, window.location.origin),
    [operation.id],
  )
  const model = useMemo(
    () => buildOperationShareModel(operation, language, maayuanUrl),
    [operation, language, maayuanUrl],
  )
  // 「神秘代码」默认值：仅在用户显式切换前生效，私密作业默认不分享。
  // 独立用例，使下面的重置 effect 无需依赖 operation 对象本身。
  const defaultShowShortCode = useMemo(
    () =>
      resolveOperationShareShortCode(
        operation,
        readOperationShareShortCode(operation.id),
      ),
    [operation],
  )
  const [cardNode, setCardNode] = useState<HTMLDivElement | null>(null)
  const localConfigRef = useRef(readOperationShareCardConfig(operation.id))
  const [cardConfig, setCardConfig] = useState(
    () => localConfigRef.current ?? createOperationShareCardConfig(),
  )
  const noteConfigRef = useRef(cardConfig)
  noteConfigRef.current = cardConfig
  const noteHistoryRef = useRef<{
    future: OperationShareNoteHistoryState[]
    past: OperationShareNoteHistoryState[]
  }>({ future: [], past: [] })
  const noteHistoryGroupRef = useRef<OperationShareNoteHistoryState | null>(
    null,
  )
  const [noteEditorRevision, setNoteEditorRevision] = useState(0)
  const [noteHistoryAvailability, setNoteHistoryAvailability] = useState({
    canRedo: false,
    canUndo: false,
  })
  const shouldPersistCardConfigRef = useRef(false)
  const [authorCardConfig, setAuthorCardConfig] = useState(() =>
    createOperationShareCardConfig(),
  )
  const [remoteConfigsByKind, setRemoteConfigsByKind] = useState(() =>
    getOperationShareRemoteConfigByKind([]),
  )
  const [authorConfigStatus, setAuthorConfigStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading')
  const [authorConfigError, setAuthorConfigError] = useState<string>()
  const [savingCardKind, setSavingCardKind] = useState<OperationShareCardKind>()
  const [selectedActionKeys, setSelectedActionKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedCellKeys, setSelectedCellKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [colorMode, setColorMode] = useState<ColorMode>('action')
  const [editMode, setEditMode] = useState<EditMode>('color')
  const [extraForbiddenDiscSelections, setExtraForbiddenDiscSelections] =
    useState<Record<string, string>>({})
  const isMobileDevice = useMemo(isMobileDeviceUserAgent, [])
  const showRoundNoteColumn =
    cardConfig.showNotes || cardConfig.showOtherActions
  const effectiveEditMode: EditMode = showRoundNoteColumn ? editMode : 'color'
  const [useMobileEqualActionColumns, setUseMobileEqualActionColumns] =
    useState(false)
  const [mobileNoteActionColumnWidths, setMobileNoteActionColumnWidths] =
    useState<Record<string, number>>({})
  const mobileTableScrollRef = useRef<HTMLDivElement | null>(null)
  const mobileTableRef = useRef<HTMLTableElement | null>(null)
  const isMobileNoteMode =
    isMobileDevice && effectiveEditMode === 'note' && showRoundNoteColumn

  useEffect(() => {
    if (!showRoundNoteColumn) setEditMode('color')
  }, [showRoundNoteColumn])

  const urlStoreRef = useRef(new ObjectUrlStore())
  const generationRef = useRef(0)
  const generatingRef = useRef(false)
  const [cardKind, setCardKind] = useState<OperationShareCardKind>('actions')
  const [hideQrCode, setHideQrCode] = useState(true)
  const shouldPersistShortCodeRef = useRef(false)
  const [showShortCode, setShowShortCode] = useState(defaultShowShortCode)
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [blob, setBlob] = useState<Blob>()
  const [qrCode, setQrCode] = useState<{
    targetUrl: string
    dataUrl: string
  }>()
  const [isTableThemeAdvancedOpen, setIsTableThemeAdvancedOpen] =
    useState(false)
  const [
    isOperatorTableThemeAdvancedOpen,
    setIsOperatorTableThemeAdvancedOpen,
  ] = useState(false)
  const qrDataUrl =
    qrCode?.targetUrl === model.qrTargetUrl ? qrCode.dataUrl : undefined
  const [error, setError] = useState<string>()

  const updateCardConfig = useCallback(
    (
      updater: (current: OperationShareCardConfig) => OperationShareCardConfig,
    ) => {
      shouldPersistCardConfigRef.current = true
      setCardConfig(updater)
    },
    [],
  )

  const refreshNoteHistoryAvailability = useCallback(() => {
    const nextAvailability = {
      canRedo: noteHistoryRef.current.future.length > 0,
      canUndo: noteHistoryRef.current.past.length > 0,
    }
    setNoteHistoryAvailability((current) =>
      current.canRedo === nextAvailability.canRedo &&
      current.canUndo === nextAvailability.canUndo
        ? current
        : nextAvailability,
    )
  }, [])

  const updateNoteCardConfig = useCallback(
    (
      updater: (current: OperationShareCardConfig) => OperationShareCardConfig,
    ) => {
      const current = noteConfigRef.current
      const next = updater(current)
      const before = cloneOperationShareNoteHistoryState(current)
      const after = cloneOperationShareNoteHistoryState(next)
      if (areOperationShareNoteHistoryStatesEqual(before, after)) return

      noteConfigRef.current = next
      if (!noteHistoryGroupRef.current) {
        noteHistoryRef.current.past.push(before)
        if (noteHistoryRef.current.past.length > 100) {
          noteHistoryRef.current.past.shift()
        }
        noteHistoryRef.current.future = []
        refreshNoteHistoryAvailability()
      }
      updateCardConfig(() => next)
    },
    [refreshNoteHistoryAvailability, updateCardConfig],
  )

  const beginNoteHistoryGroup = useCallback(() => {
    if (noteHistoryGroupRef.current) return
    noteHistoryGroupRef.current = cloneOperationShareNoteHistoryState(
      noteConfigRef.current,
    )
  }, [])

  const endNoteHistoryGroup = useCallback(() => {
    const before = noteHistoryGroupRef.current
    if (!before) return
    noteHistoryGroupRef.current = null

    const after = cloneOperationShareNoteHistoryState(noteConfigRef.current)
    if (areOperationShareNoteHistoryStatesEqual(before, after)) return

    noteHistoryRef.current.past.push(before)
    if (noteHistoryRef.current.past.length > 100) {
      noteHistoryRef.current.past.shift()
    }
    noteHistoryRef.current.future = []
    refreshNoteHistoryAvailability()
  }, [refreshNoteHistoryAvailability])

  const runNoteHistoryGroup = useCallback(
    (action: () => void) => {
      beginNoteHistoryGroup()
      try {
        action()
      } finally {
        endNoteHistoryGroup()
      }
    },
    [beginNoteHistoryGroup, endNoteHistoryGroup],
  )

  const applyNoteHistoryState = useCallback(
    (state: OperationShareNoteHistoryState) => {
      const next = {
        ...noteConfigRef.current,
        hiddenOtherActionKeys: state.hiddenOtherActionKeys,
        roundNoteOverrides: state.roundNoteOverrides,
      }
      noteConfigRef.current = next
      setNoteEditorRevision((current) => current + 1)
      updateCardConfig(() => next)
    },
    [updateCardConfig],
  )

  const undoNoteChange = useCallback(() => {
    if (noteHistoryGroupRef.current) endNoteHistoryGroup()
    const previous = noteHistoryRef.current.past.pop()
    if (!previous) {
      refreshNoteHistoryAvailability()
      return
    }

    noteHistoryRef.current.future.push(
      cloneOperationShareNoteHistoryState(noteConfigRef.current),
    )
    applyNoteHistoryState(previous)
    refreshNoteHistoryAvailability()
  }, [
    applyNoteHistoryState,
    endNoteHistoryGroup,
    refreshNoteHistoryAvailability,
  ])

  const redoNoteChange = useCallback(() => {
    if (noteHistoryGroupRef.current) endNoteHistoryGroup()
    const next = noteHistoryRef.current.future.pop()
    if (!next) {
      refreshNoteHistoryAvailability()
      return
    }

    noteHistoryRef.current.past.push(
      cloneOperationShareNoteHistoryState(noteConfigRef.current),
    )
    applyNoteHistoryState(next)
    refreshNoteHistoryAvailability()
  }, [
    applyNoteHistoryState,
    endNoteHistoryGroup,
    refreshNoteHistoryAvailability,
  ])

  useEffect(() => {
    noteHistoryRef.current = { future: [], past: [] }
    noteHistoryGroupRef.current = null
    setNoteHistoryAvailability({ canRedo: false, canUndo: false })
    setNoteEditorRevision((current) => current + 1)
    setExtraForbiddenDiscSelections({})
  }, [operation.id])

  useEffect(() => {
    if (!shouldPersistCardConfigRef.current) return
    shouldPersistCardConfigRef.current = false
    saveOperationShareCardConfig(operation.id, cardConfig)
  }, [cardConfig, operation.id])

  useEffect(() => {
    if (!shouldPersistShortCodeRef.current) return
    shouldPersistShortCodeRef.current = false
    saveOperationShareShortCode(operation.id, showShortCode)
  }, [operation.id, showShortCode])

  useEffect(() => {
    let active = true
    const localConfig = readOperationShareCardConfig(operation.id)
    localConfigRef.current = localConfig
    shouldPersistCardConfigRef.current = false
    shouldPersistShortCodeRef.current = false
    setCardConfig(localConfig ?? createOperationShareCardConfig())
    setShowShortCode(defaultShowShortCode)
    setAuthorConfigStatus('loading')
    setAuthorConfigError(undefined)

    void getOperationShareImageConfigs(operation.id)
      .then((configs) => {
        if (!active) return
        const authorConfig = mergeOperationShareRemoteConfigs(configs)
        setAuthorCardConfig(authorConfig)
        setRemoteConfigsByKind(getOperationShareRemoteConfigByKind(configs))
        setCardConfig(
          resolveOperationShareCardConfig(localConfig, authorConfig),
        )
        setAuthorConfigStatus('ready')
      })
      .catch((reason) => {
        if (!active) return
        setAuthorConfigStatus('error')
        setAuthorConfigError(formatError(reason))
      })

    return () => {
      active = false
    }
  }, [defaultShowShortCode, operation.id])

  const isPrivateOperation = operation.status === CopilotInfoStatusEnum.Private
  // 原创作业（无外站原贴）的二维码编码的就是站内地址，关闭神秘代码时必须一并隐藏
  const qrFollowsShortCode =
    !showShortCode && model.qrTargetUrl === model.maayuanUrl
  const effectiveHideQrCode = hideQrCode || qrFollowsShortCode
  const shortCodeHint = showShortCode
    ? undefined
    : isPrivateOperation
      ? t.components.viewer.OperationViewer.share_image_short_code_private_hint
      : qrFollowsShortCode
        ? t.components.viewer.OperationViewer.share_image_qr_follows_short_code
        : t.components.viewer.OperationViewer.share_image_short_code_hidden_hint

  const cellColorNames: Record<OperationShareCellColorKey, string> = {
    yellow: t.components.viewer.OperationViewer.share_cell_color_yellow,
    pink: t.components.viewer.OperationViewer.share_cell_color_pink,
    blue: t.components.viewer.OperationViewer.share_cell_color_blue,
    green: t.components.viewer.OperationViewer.share_cell_color_green,
    ice: t.components.viewer.OperationViewer.share_cell_color_ice,
  }
  const actionColorNames: Record<OperationShareCellColorKey, string> = {
    ...cellColorNames,
    ice: t.components.viewer.OperationViewer.share_cell_color_none,
  }
  const actionColorNoteNames: Record<OperationShareCellColorKey, string> = {
    ...actionColorNames,
    ice: t.components.viewer.OperationViewer
      .share_action_color_note_none_label,
  }
  const actionColorNoteTargetIndexes: Record<
    Exclude<OperationShareCellColorKey, 'ice'>,
    number
  > = {
    pink: 1,
    blue: 2,
    yellow: 3,
    green: 4,
  }
  const actionColorNoteKeys = OPERATION_SHARE_ACTION_COLOR_ORDER

  const editableColumns = useMemo<
    Array<{ key: OperationShareCellColumn; slot: number; label: string }>
  >(
    () =>
      model.actionSlots.map((slot) => ({
        key: `slot-${slot}` as OperationShareCellColumn,
        slot,
        label: model.operators[slot - 1]?.name || `${slot} 号位`,
      })),
    [model.actionSlots, model.operators],
  )
  const editableColumnGroups = useMemo(
    () =>
      editableColumns.map((column) => ({
        ...column,
        maxActionsInRound: model.rounds.reduce(
          (maximum, round) =>
            Math.max(maximum, round.slots[column.slot]?.length ?? 0),
          0,
        ),
        actionKeys: model.rounds.flatMap((round) =>
          (round.slots[column.slot] ?? []).map((action) =>
            buildOperationShareActionKey(round.round, action.order),
          ),
        ),
        cellKeys: model.rounds.map((round) =>
          buildOperationShareCellKey(round.round, column.key),
        ),
      })),
    [editableColumns, model.rounds],
  )
  const editableRoundGroups = useMemo(
    () =>
      model.rounds.map((sourceRound) => ({
        round: sourceRound.round,
        sourceRound,
        actionKeys: editableColumns.flatMap((column) =>
          (sourceRound.slots[column.slot] ?? []).map((action) =>
            buildOperationShareActionKey(sourceRound.round, action.order),
          ),
        ),
        cellKeys: editableColumns.map((column) =>
          buildOperationShareCellKey(sourceRound.round, column.key),
        ),
      })),
    [editableColumns, model.rounds],
  )
  const getMobileNoteActionColumnWidth = (columnKey: string) =>
    mobileNoteActionColumnWidths[columnKey] ??
    MOBILE_NOTE_ACTION_COLUMN_MIN_WIDTH
  const mobileNoteTableMinWidth =
    MOBILE_TABLE_ROUND_COLUMN_WIDTH +
    editableColumnGroups.reduce(
      (width, column) =>
        width + getMobileNoteActionColumnWidth(column.key),
      0,
    ) +
    MOBILE_NOTE_MIN_COLUMN_WIDTH
  const useMobileEqualColumns =
    isMobileDevice &&
    effectiveEditMode === 'color' &&
    !showRoundNoteColumn &&
    useMobileEqualActionColumns
  const useMobileFixedActionColumns =
    isMobileDevice &&
    effectiveEditMode === 'color' &&
    (showRoundNoteColumn || !useMobileEqualActionColumns)

  useLayoutEffect(() => {
    const scrollContainer = mobileTableScrollRef.current
    if (
      !isMobileDevice ||
      effectiveEditMode !== 'color' ||
      showRoundNoteColumn ||
      !scrollContainer
    ) {
      setUseMobileEqualActionColumns(false)
      return
    }

    const updateColumnLayout = () => {
      const measuredActionWidths = new Map<string, number>()
      mobileTableRef.current
        ?.querySelectorAll<HTMLElement>('[data-mobile-action-column]')
        .forEach((actionElement) => {
          const columnKey = actionElement.dataset.mobileActionColumn
          if (!columnKey) return

          measuredActionWidths.set(
            columnKey,
            Math.max(
              measuredActionWidths.get(columnKey) ?? 0,
              Math.ceil(actionElement.getBoundingClientRect().width),
              actionElement.scrollWidth,
            ),
          )
        })

      const fixedActionTableWidth =
        MOBILE_TABLE_ROUND_COLUMN_WIDTH +
        editableColumnGroups.reduce((width, column) => {
          const assignedWidth =
            column.maxActionsInRound >= 3
              ? MOBILE_ACTION_COLUMN_WIDE_WIDTH
              : MOBILE_ACTION_COLUMN_WIDTH

          return (
            width +
            Math.max(assignedWidth, measuredActionWidths.get(column.key) ?? 0)
          )
        }, 0) +
        editableColumnGroups.length +
        1

      setUseMobileEqualActionColumns(
        fixedActionTableWidth < scrollContainer.clientWidth,
      )
    }

    updateColumnLayout()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateColumnLayout)
      return () => window.removeEventListener('resize', updateColumnLayout)
    }

    const observer = new ResizeObserver(updateColumnLayout)
    observer.observe(scrollContainer)
    return () => observer.disconnect()
  }, [
    cardConfig.hiddenOtherActionKeys,
    cardConfig.showOtherActions,
    cardConfig.showTargetSwitches,
    colorMode,
    editableColumnGroups,
    effectiveEditMode,
    isMobileDevice,
    showRoundNoteColumn,
  ])

  useLayoutEffect(() => {
    if (!isMobileNoteMode) {
      setMobileNoteActionColumnWidths({})
      return
    }

    let cancelled = false

    const updateNoteActionColumnWidth = () => {
      const actionGroups =
        mobileTableRef.current?.querySelectorAll<HTMLElement>(
          '[data-mobile-note-action-group]',
        )

      const contentWidths: Record<string, number> = {}
      Array.from(actionGroups ?? []).forEach((group) => {
        const columnKey = group.dataset.mobileNoteActionColumn
        if (!columnKey) return

        contentWidths[columnKey] = Math.max(
          contentWidths[columnKey] ?? MOBILE_NOTE_ACTION_COLUMN_MIN_WIDTH,
          Math.ceil(
            Math.max(
              group.getBoundingClientRect().width,
              group.scrollWidth,
            ),
          ) + 4,
        )
      })

      const nextWidths = Object.fromEntries(
        editableColumnGroups.map((column) => [
          column.key,
          Math.max(
            MOBILE_NOTE_ACTION_COLUMN_MIN_WIDTH,
            contentWidths[column.key] ?? MOBILE_NOTE_ACTION_COLUMN_MIN_WIDTH,
          ),
        ]),
      ) as Record<string, number>

      if (!cancelled) {
        setMobileNoteActionColumnWidths((currentWidths) => {
          const changed =
            Object.keys(nextWidths).length !==
              Object.keys(currentWidths).length ||
            Object.entries(nextWidths).some(
              ([columnKey, width]) =>
                currentWidths[columnKey] !== width,
            )
          return changed ? nextWidths : currentWidths
        })
      }
    }

    updateNoteActionColumnWidth()
    document.fonts?.ready.then(updateNoteActionColumnWidth).catch(() => {})
    window.addEventListener('resize', updateNoteActionColumnWidth)

    return () => {
      cancelled = true
      window.removeEventListener('resize', updateNoteActionColumnWidth)
    }
  }, [
    cardConfig.actionColors,
    editableColumnGroups,
    isMobileNoteMode,
    language,
  ])
  const actionKeysByCellKey = useMemo(() => {
    const keysByCellKey = new Map<string, string[]>()

    model.rounds.forEach((round) => {
      editableColumns.forEach((column) => {
        keysByCellKey.set(
          buildOperationShareCellKey(round.round, column.key),
          (round.slots[column.slot] ?? []).map((action) =>
            buildOperationShareActionKey(round.round, action.order),
          ),
        )
      })
    })

    return keysByCellKey
  }, [editableColumns, model.rounds])
  const selectedCellActionKeys = useMemo(() => {
    const actionKeys = new Set<string>()

    selectedCellKeys.forEach((cellKey) => {
      actionKeysByCellKey
        .get(cellKey)
        ?.forEach((actionKey) => actionKeys.add(actionKey))
    })

    return actionKeys
  }, [actionKeysByCellKey, selectedCellKeys])
  const allActionKeys = useMemo(
    () => editableRoundGroups.flatMap((round) => round.actionKeys),
    [editableRoundGroups],
  )
  const allCellKeys = useMemo(
    () => editableRoundGroups.flatMap((round) => round.cellKeys),
    [editableRoundGroups],
  )
  const allTableKeys = colorMode === 'action' ? allActionKeys : allCellKeys
  const selectedTableKeys =
    colorMode === 'action' ? selectedActionKeys : selectedCellKeys
  const allTableSelection = getOperationShareCellSelectionState(
    selectedTableKeys,
    allTableKeys,
  )

  const invalidatePreview = useCallback(() => {
    generationRef.current += 1
    generatingRef.current = false
    urlStoreRef.current.revoke()
    setBlob(undefined)
    setPreviewUrl(undefined)
    setError(undefined)
    setStatus('idle')
  }, [])

  const updateOption = (
    option: 'showTargetSwitches' | 'showNotes' | 'showCellPattern',
    checked: boolean,
  ) => {
    invalidatePreview()
    updateCardConfig((current) => ({ ...current, [option]: checked }))
  }

  const updateNotesColumnVisibility = (checked: boolean) => {
    invalidatePreview()
    updateCardConfig((current) => ({
      ...current,
      showNotes: checked,
      showOtherActions: checked,
    }))
  }

  const updateOtherActionsVisibility = (checked: boolean) => {
    invalidatePreview()
    updateCardConfig((current) => ({
      ...current,
      showNotes: checked
        ? current.showNotes
        : current.showNotes || current.showOtherActions,
      showOtherActions: checked,
    }))
  }

  const updateTableColor = (color?: string) => {
    invalidatePreview()
    updateCardConfig((current) => ({
      ...current,
      tableColor: normalizeOperationShareTableColor(color),
      tableThemeOverrides: undefined,
    }))
  }

  const updateTableThemeOverride = (
    key: OperationShareTableThemeOverrideKey,
    color: string,
  ) => {
    invalidatePreview()
    updateCardConfig((current) => {
      const tableThemeOverrides = { ...current.tableThemeOverrides }
      const normalizedColor = normalizeOperationShareTableColor(color)
      if (normalizedColor) tableThemeOverrides[key] = normalizedColor
      else delete tableThemeOverrides[key]

      return {
        ...current,
        tableThemeOverrides:
          Object.keys(tableThemeOverrides).length > 0
            ? tableThemeOverrides
            : undefined,
      }
    })
  }

  const updateOperatorTableColor = (color?: string) => {
    invalidatePreview()
    updateCardConfig((current) => ({
      ...current,
      operatorTableColor: normalizeOperationShareTableColor(color),
      operatorTableThemeOverrides: undefined,
    }))
  }

  const updateOperatorTableThemeOverride = (
    key: OperationShareTableThemeOverrideKey,
    color: string,
  ) => {
    invalidatePreview()
    updateCardConfig((current) => {
      const operatorTableThemeOverrides = {
        ...current.operatorTableThemeOverrides,
      }
      const normalizedColor = normalizeOperationShareTableColor(color)
      if (normalizedColor) operatorTableThemeOverrides[key] = normalizedColor
      else delete operatorTableThemeOverrides[key]

      return {
        ...current,
        operatorTableThemeOverrides:
          Object.keys(operatorTableThemeOverrides).length > 0
            ? operatorTableThemeOverrides
            : undefined,
      }
    })
  }

  const resetTableTheme = () => {
    setIsTableThemeAdvancedOpen(false)
    updateTableColor()
  }

  const resetOperatorTableTheme = () => {
    setIsOperatorTableThemeAdvancedOpen(false)
    updateOperatorTableColor()
  }

  const changeCardKind = (nextKind: OperationShareCardKind) => {
    if (nextKind === cardKind) return
    invalidatePreview()
    setSelectedActionKeys(new Set())
    setSelectedCellKeys(new Set())
    setCardKind(nextKind)
  }

  const updateQrCodeVisibility = (hidden: boolean) => {
    invalidatePreview()
    setHideQrCode(hidden)
  }

  const updateShortCodeVisibility = (shareShortCode: boolean) => {
    invalidatePreview()
    shouldPersistShortCodeRef.current = true
    setShowShortCode(shareShortCode)
  }

  const updateRoundNote = (round: number, note: string) => {
    invalidatePreview()
    updateNoteCardConfig((current) => ({
      ...current,
      roundNoteOverrides: {
        ...current.roundNoteOverrides,
        [round]: note,
      },
    }))
  }

  const toggleOtherActionInNote = (
    round: OperationShareRound,
    label: string,
  ) => {
    invalidatePreview()
    updateNoteCardConfig((current) => {
      const note = getOperationShareRoundNoteText(round, current)
      const included = note.includes(label)
      return {
        ...current,
        roundNoteOverrides: {
          ...current.roundNoteOverrides,
          [round.round]: included
            ? removeOperationShareNoteText(note, label)
            : appendOperationShareNoteText(note, label),
        },
      }
    })
  }

  const restoreRoundNote = (round: number) => {
    invalidatePreview()
    updateNoteCardConfig((current) => {
      const roundNoteOverrides = { ...current.roundNoteOverrides }
      delete roundNoteOverrides[round]

      const hiddenOtherActionKeys = { ...current.hiddenOtherActionKeys }
      Object.keys(hiddenOtherActionKeys).forEach((key) => {
        if (key.startsWith(`${round}:`)) delete hiddenOtherActionKeys[key]
      })

      return {
        ...current,
        roundNoteOverrides:
          Object.keys(roundNoteOverrides).length > 0
            ? roundNoteOverrides
            : undefined,
        hiddenOtherActionKeys:
          Object.keys(hiddenOtherActionKeys).length > 0
            ? hiddenOtherActionKeys
            : undefined,
      }
    })
  }

  const toggleActionSelection = (key: string, checked: boolean) => {
    setSelectedActionKeys((current) => {
      const next = new Set(current)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const toggleActionGroupSelection = (
    actionKeys: readonly string[],
    checked: boolean,
  ) => {
    setSelectedActionKeys((current) =>
      updateOperationShareCellSelection(current, actionKeys, checked),
    )
  }

  const toggleCellSelection = (key: string, checked: boolean) => {
    setSelectedCellKeys((current) => {
      const next = new Set(current)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const toggleCellGroupSelection = (
    cellKeys: readonly string[],
    checked: boolean,
  ) => {
    setSelectedCellKeys((current) =>
      updateOperationShareCellSelection(current, cellKeys, checked),
    )
  }

  const applyActionColor = (style: string) => {
    if (selectedActionKeys.size === 0) return
    invalidatePreview()
    updateCardConfig((current) => {
      const actionColors = { ...current.actionColors }
      selectedActionKeys.forEach((key) => {
        actionColors[key] = style
      })
      return { ...current, actionColors }
    })
    setSelectedActionKeys(new Set())
  }

  const updateActionColorNote = (
    colorKey: OperationShareCellColorKey,
    note: string,
  ) => {
    invalidatePreview()
    updateCardConfig((current) => ({
      ...current,
      actionColorNotes: {
        ...current.actionColorNotes,
        [colorKey]: note,
      },
    }))
  }

  const applyCellColor = (style: string) => {
    if (selectedCellKeys.size === 0) return
    invalidatePreview()
    updateCardConfig((current) => {
      const actionColors = { ...current.actionColors }
      selectedCellActionKeys.forEach((key) => {
        actionColors[key] = style
      })

      const cellColors = { ...current.cellColors }
      selectedCellKeys.forEach((key) => {
        delete cellColors[key]
      })

      return { ...current, actionColors, cellColors }
    })
    setSelectedCellKeys(new Set())
  }

  const clearActionColor = () => {
    if (selectedActionKeys.size === 0) return
    invalidatePreview()
    updateCardConfig((current) => {
      const actionColors = { ...current.actionColors }
      selectedActionKeys.forEach((key) => {
        delete actionColors[key]
      })
      return { ...current, actionColors }
    })
    setSelectedActionKeys(new Set())
  }

  const clearCellColor = () => {
    if (selectedCellKeys.size === 0) return
    invalidatePreview()
    updateCardConfig((current) => {
      const actionColors = { ...current.actionColors }
      selectedCellActionKeys.forEach((key) => {
        delete actionColors[key]
      })

      const cellColors = { ...current.cellColors }
      selectedCellKeys.forEach((key) => {
        delete cellColors[key]
      })

      return { ...current, actionColors, cellColors }
    })
    setSelectedCellKeys(new Set())
  }

  const restoreDefaults = () => {
    const defaults = createOperationShareCardConfig()
    invalidatePreview()
    setSelectedActionKeys(new Set())
    setSelectedCellKeys(new Set())
    updateCardConfig(() => defaults)
  }

  const restoreAuthorConfig = () => {
    invalidatePreview()
    setSelectedActionKeys(new Set())
    setSelectedCellKeys(new Set())
    updateCardConfig((current) =>
      replaceOperationShareCardConfigKind(cardKind, current, authorCardConfig),
    )
  }

  const updateRequiredDisc = (key: string, checked: boolean) => {
    invalidatePreview()
    updateCardConfig((current) => {
      const requiredDiscs = { ...current.requiredDiscs }
      if (checked) requiredDiscs[key] = true
      else delete requiredDiscs[key]
      return { ...current, requiredDiscs }
    })
  }

  const addExtraForbiddenDisc = (
    operatorSlot: number,
    discName: string,
  ) => {
    const normalizedDiscName = discName.trim()
    if (!normalizedDiscName) return

    updateCardConfig((current) => {
      const operatorKey = String(operatorSlot)
      const currentDiscNames =
        current.extraForbiddenDiscs?.[operatorKey] ?? []
      if (currentDiscNames.includes(normalizedDiscName)) return current

      return {
        ...current,
        extraForbiddenDiscs: {
          ...current.extraForbiddenDiscs,
          [operatorKey]: [...currentDiscNames, normalizedDiscName],
        },
      }
    })
    invalidatePreview()
  }

  const removeExtraForbiddenDisc = (
    operatorSlot: number,
    discName: string,
  ) => {
    updateCardConfig((current) => {
      const operatorKey = String(operatorSlot)
      const currentDiscNames =
        current.extraForbiddenDiscs?.[operatorKey] ?? []
      const nextDiscNames = currentDiscNames.filter(
        (currentDiscName) => currentDiscName !== discName,
      )
      const nextExtraForbiddenDiscs = {
        ...current.extraForbiddenDiscs,
      }
      if (nextDiscNames.length > 0) {
        nextExtraForbiddenDiscs[operatorKey] = nextDiscNames
      } else {
        delete nextExtraForbiddenDiscs[operatorKey]
      }

      return {
        ...current,
        extraForbiddenDiscs:
          Object.keys(nextExtraForbiddenDiscs).length > 0
            ? nextExtraForbiddenDiscs
            : undefined,
      }
    })
    invalidatePreview()
  }

  const clearRequiredDiscs = () => {
    if (Object.keys(cardConfig.requiredDiscs).length === 0) return
    invalidatePreview()
    updateCardConfig((current) => ({ ...current, requiredDiscs: {} }))
  }

  const clearExtraForbiddenDiscs = () => {
    if (Object.keys(cardConfig.extraForbiddenDiscs ?? {}).length === 0) return
    invalidatePreview()
    updateCardConfig((current) => ({
      ...current,
      extraForbiddenDiscs: undefined,
    }))
    setExtraForbiddenDiscSelections({})
  }

  const generate = useCallback(async () => {
    if (!cardNode || !qrDataUrl || generatingRef.current) return

    const generation = ++generationRef.current
    generatingRef.current = true
    setStatus('generating')
    setError(undefined)
    try {
      const nextBlob = await renderOperationShareCardBlob(cardNode)
      if (generation !== generationRef.current) return

      const nextUrl = urlStoreRef.current.replace(nextBlob)
      setBlob(nextBlob)
      setPreviewUrl(nextUrl)
      setStatus('ready')
    } catch (reason) {
      if (generation !== generationRef.current) return
      setStatus('error')
      setError(formatError(reason))
    } finally {
      if (generation === generationRef.current) generatingRef.current = false
    }
  }, [cardNode, qrDataUrl])

  useEffect(() => {
    let active = true
    const createQrCode = async () => {
      try {
        const nextQrDataUrl = await createOperationShareQrDataUrl(
          model.qrTargetUrl,
        )
        if (active) {
          setQrCode({ targetUrl: model.qrTargetUrl, dataUrl: nextQrDataUrl })
        }
      } catch (reason) {
        if (!active) return
        setStatus('error')
        setError(formatError(reason))
      }
    }

    void createQrCode()
    return () => {
      active = false
    }
  }, [model.qrTargetUrl])

  useEffect(() => {
    const urlStore = urlStoreRef.current
    return () => {
      generationRef.current += 1
      generatingRef.current = false
      urlStore.revoke()
    }
  }, [])

  const download = () => {
    if (!blob || !previewUrl) return
    const anchor = document.createElement('a')
    anchor.href = previewUrl
    anchor.download = buildOperationShareFilename(model, cardKind)
    anchor.click()
  }

  const currentRemoteConfig = remoteConfigsByKind[cardKind]
  const hasUnsupportedRemoteConfig =
    currentRemoteConfig !== undefined &&
    currentRemoteConfig.schemaVersion >
      OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION
  const shareTableTheme = getOperationShareTableTheme(
    cardConfig.tableColor,
    cardConfig.tableThemeOverrides,
  )
  const normalizedTableColor = normalizeOperationShareTableColor(
    cardConfig.tableColor,
  )
  const matchingTableThemePreset = normalizedTableColor
    ? OPERATION_SHARE_TABLE_THEME_PRESETS.find(
        (preset) =>
          preset.baseColor &&
          normalizeOperationShareTableColor(preset.baseColor) ===
            normalizedTableColor,
      )
    : undefined
  const selectedTableThemePreset =
    matchingTableThemePreset ?? OPERATION_SHARE_TABLE_THEME_PRESETS[0]
  const isCustomTableBaseColor = Boolean(
    normalizedTableColor && !matchingTableThemePreset,
  )
  const tableThemeOverrideCount = Object.keys(
    cardConfig.tableThemeOverrides ?? {},
  ).length
  const hasTableThemeOverrides = tableThemeOverrideCount > 0
  const tableThemeBaseLabel = isCustomTableBaseColor
    ? `自定义 ${normalizedTableColor}`
    : selectedTableThemePreset.label
  const tableThemeStatus = hasTableThemeOverrides
    ? `自定义（基于${tableThemeBaseLabel}，已修改 ${tableThemeOverrideCount} 项）`
    : `当前：${tableThemeBaseLabel}`
  const tableThemeColorFields: Array<{
    key: OperationShareTableThemeOverrideKey
    label: string
    value: string
  }> = [
    {
      key: 'headerBackground',
      label: '表头',
      value: shareTableTheme.headerBackground,
    },
    {
      key: 'pageBackground',
      label: '图片背景',
      value: shareTableTheme.pageBackground,
    },
    {
      key: 'lightRowBackground',
      label: '浅色行',
      value: shareTableTheme.bodyBackgrounds[0],
    },
    {
      key: 'darkRowBackground',
      label: '深色行',
      value: shareTableTheme.bodyBackgrounds[1],
    },
    {
      key: 'border',
      label: '表格线',
      value: shareTableTheme.border,
    },
    {
      key: 'text',
      label: '文字',
      value: shareTableTheme.text,
    },
  ]
  const operatorShareTableTheme = getOperationShareTableTheme(
    cardConfig.operatorTableColor,
    cardConfig.operatorTableThemeOverrides,
  )
  const normalizedOperatorTableColor = normalizeOperationShareTableColor(
    cardConfig.operatorTableColor,
  )
  const matchingOperatorTableThemePreset = normalizedOperatorTableColor
    ? OPERATION_SHARE_TABLE_THEME_PRESETS.find(
        (preset) =>
          preset.baseColor &&
          normalizeOperationShareTableColor(preset.baseColor) ===
            normalizedOperatorTableColor,
      )
    : undefined
  const selectedOperatorTableThemePreset =
    matchingOperatorTableThemePreset ??
    OPERATION_SHARE_TABLE_THEME_PRESETS[0]
  const isCustomOperatorTableBaseColor = Boolean(
    normalizedOperatorTableColor && !matchingOperatorTableThemePreset,
  )
  const operatorTableThemeOverrideCount = Object.keys(
    cardConfig.operatorTableThemeOverrides ?? {},
  ).length
  const hasOperatorTableThemeOverrides =
    operatorTableThemeOverrideCount > 0
  const operatorTableThemeBaseLabel = isCustomOperatorTableBaseColor
    ? `自定义 ${normalizedOperatorTableColor}`
    : selectedOperatorTableThemePreset.label
  const operatorTableThemeStatus = hasOperatorTableThemeOverrides
    ? `自定义（基于${operatorTableThemeBaseLabel}，已修改 ${operatorTableThemeOverrideCount} 项）`
    : `当前：${operatorTableThemeBaseLabel}`
  const operatorTableThemeColorFields: Array<{
    key: OperationShareTableThemeOverrideKey
    label: string
    value: string
  }> = [
    {
      key: 'headerBackground',
      label: '表头',
      value: operatorShareTableTheme.headerBackground,
    },
    {
      key: 'pageBackground',
      label: '图片背景',
      value: operatorShareTableTheme.pageBackground,
    },
    {
      key: 'lightRowBackground',
      label: '浅色行',
      value: operatorShareTableTheme.bodyBackgrounds[0],
    },
    {
      key: 'darkRowBackground',
      label: '深色行',
      value: operatorShareTableTheme.bodyBackgrounds[1],
    },
    {
      key: 'border',
      label: '表格线',
      value: operatorShareTableTheme.border,
    },
    {
      key: 'text',
      label: '文字',
      value: operatorShareTableTheme.text,
    },
  ]

  const saveAuthorConfig = async () => {
    if (!canManageAuthorConfig || hasUnsupportedRemoteConfig) return

    setSavingCardKind(cardKind)
    try {
      const saved = await updateOperationShareImageConfig(
        operation.id,
        OPERATION_SHARE_CARD_KEYS[cardKind],
        {
          schemaVersion: OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION,
          expectedRevision: currentRemoteConfig?.revision ?? 0,
          payload: buildOperationShareCardConfigPayload(cardKind, cardConfig),
        },
      )
      setRemoteConfigsByKind((current) => ({
        ...current,
        [cardKind]: saved,
      }))
      setAuthorCardConfig((current) =>
        replaceOperationShareCardConfigKind(cardKind, current, cardConfig),
      )
      AppToaster.show({
        intent: 'success',
        message: '作者分享图配置已保存',
      })
    } catch (reason) {
      AppToaster.show({
        intent: 'danger',
        message: `作者分享图配置保存失败：${formatError(reason)}`,
      })
    } finally {
      setSavingCardKind(undefined)
    }
  }

  return (
    <Dialog
      canEscapeKeyClose
      canOutsideClickClose
      className="w-[min(96vw,960px)] max-h-[calc(100vh-60px)]"
      icon="media"
      isOpen
      onClose={onClose}
      style={{
        maxHeight: isMobileDevice
          ? 'calc(100dvh - 38px)'
          : 'calc(100dvh - 60px)',
        ...(isMobileDevice ? { marginBottom: '8px' } : {}),
      }}
      title={t.components.viewer.OperationViewer.share_image_dialog_title}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto bg-slate-100 px-2 py-4 md:p-6 dark:bg-[#2f343c]">
          <div
            aria-label="分享图片类型"
            className="mb-5 grid grid-cols-2 gap-2 rounded border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-[#383e47]"
            role="tablist"
          >
            <Button
              active={cardKind === 'actions'}
              aria-selected={cardKind === 'actions'}
              icon="timeline-events"
              onClick={() => changeCardKind('actions')}
              role="tab"
            >
              动作序列
            </Button>
            <Button
              active={cardKind === 'operators'}
              aria-selected={cardKind === 'operators'}
              icon="people"
              onClick={() => changeCardKind('operators')}
              role="tab"
            >
              上阵密探
            </Button>
          </div>

          {authorConfigStatus === 'error' ? (
            <Callout className="mb-5" intent="warning" title="作者配置加载失败">
              {authorConfigError}
            </Callout>
          ) : null}
          {hasUnsupportedRemoteConfig ? (
            <Callout className="mb-5" intent="warning" title="作者配置版本较新">
              当前页面版本无法编辑这份作者配置，请刷新或升级后重试。
            </Callout>
          ) : null}

          <div className="mb-3 flex flex-col items-end gap-1">
            <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
              <Switch
                checked={showShortCode}
                className="m-0"
                disabled={status === 'generating'}
                label={
                  t.components.viewer.OperationViewer
                    .share_image_share_short_code
                }
                onChange={(event) =>
                  updateShortCodeVisibility(event.currentTarget.checked)
                }
              />
              <Switch
                checked={!effectiveHideQrCode}
                className="m-0"
                disabled={status === 'generating' || qrFollowsShortCode}
                label={
                  t.components.viewer.OperationViewer.share_image_share_qr_code
                }
                onChange={(event) =>
                  updateQrCodeVisibility(!event.currentTarget.checked)
                }
              />
            </div>
            {shortCodeHint ? (
              <p className="m-0 text-xs text-slate-500 dark:text-slate-400">
                {shortCodeHint}
              </p>
            ) : null}
          </div>

          {cardKind === 'actions' ? (
            <fieldset
              className="mb-5 min-w-0 max-w-full overflow-hidden rounded border border-slate-200 bg-white px-1 py-4 dark:border-slate-600 dark:bg-[#383e47] md:p-4"
              disabled={
                status === 'generating' || authorConfigStatus === 'loading'
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                      生成前编辑
                    </h3>
                    <Button
                      icon="reset"
                      minimal
                      onClick={restoreDefaults}
                      small
                    >
                      恢复至默认
                    </Button>
                    <Button
                      disabled={
                        !currentRemoteConfig || hasUnsupportedRemoteConfig
                      }
                      icon="cloud-download"
                      minimal
                      onClick={restoreAuthorConfig}
                      small
                    >
                      恢复作者配置
                    </Button>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    配置会自动保存到当前作业。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <Checkbox
                    checked={cardConfig.showTargetSwitches}
                    label="显示左滑 / 右滑"
                    onChange={(event) =>
                      updateOption(
                        'showTargetSwitches',
                        event.currentTarget.checked,
                      )
                    }
                  />
                  <Checkbox
                    checked={
                      cardConfig.showNotes || cardConfig.showOtherActions
                    }
                    label="显示备注与其他动作"
                    onChange={(event) =>
                      updateNotesColumnVisibility(event.currentTarget.checked)
                    }
                  />
                  <Checkbox
                    checked={cardConfig.showOtherActions}
                    label="显示其他动作"
                    onChange={(event) =>
                      updateOtherActionsVisibility(event.currentTarget.checked)
                    }
                  />
                </div>
              </div>

              {model.rounds.length > 0 ? (
                <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-600">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      表格配色
                    </h4>
                    <Button
                      aria-label="恢复预设表格配色"
                      disabled={
                        !normalizedTableColor && !hasTableThemeOverrides
                      }
                      icon="reset"
                      minimal
                      onClick={resetTableTheme}
                      small
                    >
                      恢复预设
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    选择生成作业分享图整体的主题色，可自定义颜色。
                    <span
                      aria-live="polite"
                      className="ml-2 text-slate-500 dark:text-slate-400"
                    >
                      {tableThemeStatus}
                    </span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="mr-0.5 text-xs text-slate-400">预设</span>
                    {OPERATION_SHARE_TABLE_THEME_PRESETS.map((preset) => {
                      const presetTheme = getOperationShareTableTheme(
                        preset.baseColor,
                      )
                      const selected =
                        selectedTableThemePreset.id === preset.id &&
                        (preset.baseColor !== undefined ||
                          cardConfig.tableColor === undefined)
                      const previewColor = presetTheme.bodyBackgrounds[1]

                      return (
                        <button
                          key={preset.id}
                          aria-label={`应用${preset.label}表格配色`}
                          aria-pressed={selected}
                          className={`flex h-7 items-center gap-1.5 rounded border px-1.5 text-xs transition-colors ${
                            selected
                              ? 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-600'
                          }`}
                          onClick={() => updateTableColor(preset.baseColor)}
                          type="button"
                        >
                          <span
                            aria-hidden
                            className="flex h-3 w-3 shrink-0 overflow-hidden rounded-[2px] border border-black/10"
                          >
                            <span
                              className="h-full w-full"
                              style={{ backgroundColor: previewColor }}
                            />
                          </span>
                          <span>{preset.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <label className="flex h-7 items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      <span>自定义</span>
                      <input
                        aria-label="选择表格主题色"
                        className="h-5 w-7 cursor-pointer rounded-sm border-0 bg-transparent p-0"
                        onChange={(event) =>
                          updateTableColor(event.currentTarget.value)
                        }
                        type="color"
                        value={
                          cardConfig.tableColor ??
                          DEFAULT_OPERATION_SHARE_TABLE_BASE_COLOR
                        }
                      />
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">
                        {cardConfig.tableColor ?? '默认'}
                      </span>
                    </label>
                    <Button
                      aria-controls="operation-share-table-theme-advanced"
                      aria-expanded={isTableThemeAdvancedOpen}
                      aria-label={
                        isTableThemeAdvancedOpen
                          ? '收起高级自定义'
                          : '展开高级自定义'
                      }
                      className="!text-xs !font-normal !text-slate-500 hover:!text-slate-700 dark:!text-slate-400 dark:hover:!text-slate-200"
                      icon={
                        <Icon
                          icon={
                            isTableThemeAdvancedOpen
                              ? 'chevron-up'
                              : 'chevron-down'
                          }
                          size={12}
                        />
                      }
                      minimal
                      onClick={() =>
                        setIsTableThemeAdvancedOpen((current) => !current)
                      }
                      small
                    >
                      高级自定义
                      {hasTableThemeOverrides
                        ? `（已修改 ${tableThemeOverrideCount} 项）`
                        : ''}
                    </Button>
                  </div>
                  {isTableThemeAdvancedOpen ? (
                    <div
                      className="mt-2 w-fit max-w-full rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-600 dark:bg-slate-800/60"
                      id="operation-share-table-theme-advanced"
                    >
                      <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-200">
                        {tableThemeColorFields.map(({ key, label, value }) => (
                          <label
                            key={key}
                            className="flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-slate-200 bg-white px-1.5 dark:border-slate-600 dark:bg-slate-700"
                          >
                            <input
                              aria-label={`${label}颜色`}
                              className="h-4 w-6 shrink-0 cursor-pointer rounded-sm border border-black/10 bg-transparent p-0"
                              onChange={(event) =>
                                updateTableThemeOverride(
                                  key,
                                  event.currentTarget.value,
                                )
                              }
                              type="color"
                              value={value}
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {model.rounds.length > 0 ? (
                <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-600">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {
                            t.components.viewer.OperationViewer
                              .share_cell_color_section_title
                          }
                        </h4>
                        <div
                          aria-label="表格编辑模式"
                          className="inline-flex overflow-hidden rounded border border-slate-200 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-700"
                          role="group"
                        >
                          <Button
                            active={effectiveEditMode === 'color'}
                            className="!inline-flex !h-6 !min-h-0 !items-center !justify-center !px-2 !py-0 !text-xs !font-normal !leading-none"
                            minimal
                            onClick={() => setEditMode('color')}
                            small
                          >
                            标注模式
                          </Button>
                          {showRoundNoteColumn ? (
                            <Button
                              active={effectiveEditMode === 'note'}
                              className="!inline-flex !h-6 !min-h-0 !items-center !justify-center !px-2 !py-0 !text-xs !font-normal !leading-none"
                              minimal
                              onClick={() => setEditMode('note')}
                              small
                            >
                              备注模式
                            </Button>
                          ) : null}
                        </div>
                        {effectiveEditMode === 'note' ? (
                          <OperationShareNoteFormatToolbar
                            canRedo={noteHistoryAvailability.canRedo}
                            canUndo={noteHistoryAvailability.canUndo}
                            onRedo={redoNoteChange}
                            onUndo={undoNoteChange}
                            runHistoryGroup={runNoteHistoryGroup}
                          />
                        ) : null}
                      </div>
                    </div>
                    {effectiveEditMode === 'color' ? (
                      <p className="w-full text-[11px] leading-4 text-slate-400 dark:text-slate-500">
                        <span className="font-medium text-slate-500 dark:text-slate-300">
                          标注模式：
                        </span>
                        对动作进行颜色标注，以区分所对应的敌人。使用悬浮窗编辑可在此快捷查看动作目标色。
                      </p>
                    ) : null}
                    {effectiveEditMode === 'color' ? (
                      <div className="mt-3 border-y border-slate-200/70 py-2 dark:border-slate-600">
                        <div className="flex items-center justify-between gap-2">
                          <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-200">
                            {
                              t.components.viewer.OperationViewer
                                .share_action_color_notes_title
                            }
                          </span>
                          <span className="min-w-0 truncate text-[10px] leading-4 text-slate-400">
                            {
                              t.components.viewer.OperationViewer
                                .share_action_color_notes_hint
                            }
                          </span>
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5 md:grid-cols-5">
                          {actionColorNoteKeys.map((colorKey) => (
                            <label
                              key={colorKey}
                              className="flex min-w-0 items-center gap-1.5"
                            >
                              <span
                                aria-hidden="true"
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold text-slate-800 ${
                                  colorKey === 'ice'
                                    ? 'border-slate-300'
                                    : 'border-transparent'
                                }`}
                                style={{
                                  backgroundColor:
                                    colorKey === 'ice'
                                      ? '#ffffff'
                                      : getOperationShareActionFillColor(
                                          colorKey,
                                        ),
                                }}
                              >
                                A
                              </span>
                              <span className="w-7 shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                                {actionColorNoteNames[colorKey]}
                              </span>
                              <input
                                aria-label={t.components.viewer.OperationViewer.share_action_color_note_label(
                                  {
                                    color: actionColorNoteNames[colorKey],
                                  },
                                )}
                                className="h-7 min-w-0 flex-1 rounded bg-white/90 px-1.5 text-xs text-slate-700 outline-none transition placeholder:text-slate-300 focus:bg-white focus:ring-1 focus:ring-sky-200 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500 dark:ring-1 dark:ring-inset dark:ring-slate-600 dark:focus:bg-slate-800 dark:focus:ring-sky-500"
                                maxLength={80}
                                onChange={(event) =>
                                  updateActionColorNote(
                                    colorKey,
                                    event.currentTarget.value,
                                  )
                                }
                                placeholder={
                                  colorKey === 'ice'
                                    ? '进场Boss'
                                    : t.components.viewer.OperationViewer.share_action_color_note_placeholder(
                                        {
                                          position:
                                            actionColorNoteTargetIndexes[colorKey],
                                        },
                                      )
                                }
                                type="text"
                                value={
                                  cardConfig.actionColorNotes[colorKey] ?? ''
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {effectiveEditMode === 'color' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          aria-label={
                            t.components.viewer.OperationViewer
                              .share_cell_color_group_action
                          }
                          className="flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-800"
                          role="group"
                        >
                          {OPERATION_SHARE_ACTION_COLOR_ORDER.map(
                            (colorKey) => {
                              const label =
                                t.components.viewer.OperationViewer.share_cell_color_apply(
                                  {
                                    label: actionColorNames[colorKey],
                                  },
                                )
                              return (
                                <button
                                  key={colorKey}
                                  aria-label={label}
                                  className="h-8 w-8 rounded border border-slate-300 text-base font-bold text-slate-800 transition-transform enabled:hover:scale-105 enabled:focus:outline-none enabled:focus:ring-2 enabled:focus:ring-sky-500 enabled:focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-100"
                                  disabled={
                                    (colorMode === 'action'
                                      ? selectedActionKeys.size
                                      : selectedCellKeys.size) === 0
                                  }
                                  onClick={() =>
                                    colorMode === 'action'
                                      ? colorKey === 'ice'
                                        ? clearActionColor()
                                        : applyActionColor(colorKey)
                                      : colorKey === 'ice'
                                        ? clearCellColor()
                                        : applyCellColor(colorKey)
                                  }
                                  style={{
                                    backgroundColor:
                                      colorKey === 'ice'
                                        ? '#ffffff'
                                        : getOperationShareActionFillColor(
                                            colorKey,
                                          ),
                                  }}
                                  title={label}
                                  type="button"
                                >
                                  A
                                </button>
                              )
                            },
                          )}
                        </div>
                        <div
                          aria-label={
                            t.components.viewer.OperationViewer
                              .share_cell_color_section_title
                          }
                          className="flex items-center gap-0.5 text-xs text-slate-400"
                          role="group"
                        >
                          <span className="mr-0.5">配色模式</span>
                          <button
                            aria-label={
                              t.components.viewer.OperationViewer
                                .share_cell_color_mode_action
                            }
                            aria-pressed={colorMode === 'action'}
                            className={`h-6 rounded px-1.5 transition ${
                              colorMode === 'action'
                                ? 'bg-sky-50 font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                : 'hover:text-slate-600 dark:hover:text-slate-200'
                            }`}
                            onClick={() => setColorMode('action')}
                            type="button"
                          >
                            操作
                          </button>
                          <span
                            aria-hidden="true"
                            className="text-slate-300 dark:text-slate-600"
                          >
                            /
                          </span>
                          <button
                            aria-label={
                              t.components.viewer.OperationViewer
                                .share_cell_color_mode_cell
                            }
                            aria-pressed={colorMode === 'cell'}
                            className={`h-6 rounded px-1.5 transition ${
                              colorMode === 'cell'
                                ? 'bg-sky-50 font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                : 'hover:text-slate-600 dark:hover:text-slate-200'
                            }`}
                            onClick={() => setColorMode('cell')}
                            type="button"
                          >
                            单元格
                          </button>
                        </div>
                        <Button
                          disabled={
                            (colorMode === 'action'
                              ? selectedActionKeys.size
                              : selectedCellKeys.size) === 0
                          }
                          icon="eraser"
                          onClick={() =>
                            colorMode === 'action'
                              ? clearActionColor()
                              : clearCellColor()
                          }
                          small
                        >
                          {colorMode === 'action'
                            ? t.components.viewer.OperationViewer
                                .share_cell_color_clear
                            : t.components.viewer.OperationViewer
                                .share_cell_color_clear_cell}
                        </Button>
                        <Button
                          disabled={
                            (colorMode === 'action'
                              ? selectedActionKeys.size
                              : selectedCellKeys.size) === 0
                          }
                          minimal
                          onClick={() =>
                            colorMode === 'action'
                              ? setSelectedActionKeys(new Set())
                              : setSelectedCellKeys(new Set())
                          }
                          small
                        >
                          {t.components.viewer.OperationViewer.share_cell_color_clear_selection(
                            {
                              count:
                                colorMode === 'action'
                                  ? selectedActionKeys.size
                                  : selectedCellKeys.size,
                            },
                          )}
                        </Button>
                      </div>
                    ) : null}
                    <div className="w-full text-[11px] leading-4 text-slate-400 dark:text-slate-500">
                      {effectiveEditMode === 'note' ? (
                        <>
                          <span className="font-medium text-slate-500 dark:text-slate-300">
                            备注模式：
                          </span>
                          当前编辑回合备注，动作仅供查看。
                        </>
                      ) : (
                        colorMode === 'action'
                          ? t.components.viewer.OperationViewer
                              .share_cell_color_section_hint_action
                          : t.components.viewer.OperationViewer
                              .share_cell_color_section_hint_cell
                      )}
                    </div>
                  </div>
                  <div
                    className="mt-3 max-h-80 w-full min-w-0 max-w-full overflow-x-auto overflow-y-auto overscroll-x-contain rounded border border-slate-200 bg-white dark:border-slate-600 dark:bg-[#2f343c]"
                    ref={mobileTableScrollRef}
                  >
                    <table
                      className={`border-collapse bg-white text-center text-xs text-slate-800 dark:bg-[#2f343c] dark:text-slate-100 ${
                        isMobileDevice
                          ? isMobileNoteMode
                            ? 'w-full table-fixed'
                            : useMobileEqualColumns
                              ? 'w-full min-w-full table-fixed'
                              : 'w-max min-w-0 table-auto'
                          : 'w-full table-fixed'
                      }`}
                      data-edit-mode={effectiveEditMode}
                      ref={mobileTableRef}
                      style={
                        isMobileNoteMode
                          ? { minWidth: `${mobileNoteTableMinWidth}px` }
                          : undefined
                      }
                    >
                      <colgroup>
                        <col
                          style={{ width: isMobileDevice ? '24px' : '3.5rem' }}
                        />
                        {editableColumnGroups.map((column) => (
                          <col
                            key={column.key}
                            className={
                              isMobileDevice && useMobileFixedActionColumns
                                ? column.maxActionsInRound >= 3
                                  ? 'w-[4.5rem]'
                                  : 'w-9'
                                : undefined
                            }
                            style={
                              isMobileNoteMode
                                ? {
                                    width: `${getMobileNoteActionColumnWidth(
                                      column.key,
                                    )}px`,
                                    minWidth: `${getMobileNoteActionColumnWidth(
                                      column.key,
                                    )}px`,
                                    maxWidth: `${getMobileNoteActionColumnWidth(
                                      column.key,
                                    )}px`,
                                  }
                                : undefined
                            }
                          />
                        ))}
                        {showRoundNoteColumn ? (
                          <col
                            style={{
                              width:
                                isMobileNoteMode
                                  ? 'auto'
                                  : effectiveEditMode === 'note'
                                    ? '56%'
                                    : '16%',
                            }}
                          />
                        ) : null}
                      </colgroup>
                      <thead className="text-slate-600 dark:text-slate-300">
                        <tr>
                          <th
                            className={`sticky top-0 z-10 border-b border-r border-slate-200 bg-slate-100 shadow-[0_1px_0_rgba(148,163,184,0.35)] dark:border-slate-600 dark:bg-slate-800 ${
                              isMobileDevice ? 'px-0 py-1' : 'px-1 py-1.5'
                            }`}
                            style={
                              isMobileDevice
                                ? {
                                    width: '24px',
                                    minWidth: '24px',
                                    maxWidth: '24px',
                                  }
                                : undefined
                            }
                          >
                            {effectiveEditMode === 'color' ? (
                              <OperationShareSelectionCheckbox
                                ariaLabel="选择整个表格"
                                checked={allTableSelection.checked}
                                indeterminate={allTableSelection.indeterminate}
                                label="回合"
                                onChange={(checked) =>
                                  colorMode === 'action'
                                    ? toggleActionGroupSelection(
                                        allActionKeys,
                                        checked,
                                      )
                                    : toggleCellGroupSelection(
                                        allCellKeys,
                                        checked,
                                      )
                                }
                                stacked={isMobileDevice}
                              />
                            ) : (
                              '回合'
                            )}
                          </th>
                          {editableColumnGroups.map((column) => {
                            const keySet =
                              colorMode === 'action'
                                ? selectedActionKeys
                                : selectedCellKeys
                            const keys =
                              colorMode === 'action'
                                ? column.actionKeys
                                : column.cellKeys
                            const selection =
                              getOperationShareCellSelectionState(keySet, keys)
                            return (
                              <th
                                key={column.key}
                                className={`sticky top-0 z-10 border-b border-r border-slate-200 bg-slate-100 shadow-[0_1px_0_rgba(148,163,184,0.35)] last:border-r-0 dark:border-slate-600 dark:bg-slate-800 ${
                                  effectiveEditMode === 'note'
                                    ? isMobileDevice
                                      ? 'px-0 py-1'
                                      : 'px-1 py-1'
                                    : isMobileDevice
                                      ? 'px-0 py-1'
                                      : 'px-2 py-2'
                                }`}
                                style={
                                  isMobileNoteMode
                                    ? {
                                        width: `${getMobileNoteActionColumnWidth(
                                          column.key,
                                        )}px`,
                                        minWidth: `${getMobileNoteActionColumnWidth(
                                          column.key,
                                        )}px`,
                                        maxWidth: `${getMobileNoteActionColumnWidth(
                                          column.key,
                                        )}px`,
                                      }
                                    : undefined
                                }
                              >
                                {effectiveEditMode === 'color' ? (
                                  <OperationShareSelectionCheckbox
                                    ariaLabel={`选择${column.label}整列`}
                                    checked={selection.checked}
                                    indeterminate={selection.indeterminate}
                                    label={column.label}
                                    onChange={(checked) =>
                                      colorMode === 'action'
                                        ? toggleActionGroupSelection(
                                            column.actionKeys,
                                            checked,
                                          )
                                        : toggleCellGroupSelection(
                                            column.cellKeys,
                                            checked,
                                          )
                                    }
                                    stacked={isMobileDevice}
                                  />
                                ) : (
                                  <span>{column.label}</span>
                                )}
                              </th>
                            )
                          })}
                          {showRoundNoteColumn ? (
                            <th
                              className={`sticky top-0 z-10 border-b border-r border-slate-200 bg-slate-100 text-left shadow-[0_1px_0_rgba(148,163,184,0.35)] last:border-r-0 dark:border-slate-600 dark:bg-slate-800 ${
                                effectiveEditMode === 'note'
                                  ? 'px-2 py-2'
                                  : 'px-1 py-1 text-[11px] text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              回合备注
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {editableRoundGroups.map((round) => {
                          const keySet =
                            colorMode === 'action'
                              ? selectedActionKeys
                              : selectedCellKeys
                          const keys =
                            colorMode === 'action'
                              ? round.actionKeys
                              : round.cellKeys
                          const selection = getOperationShareCellSelectionState(
                            keySet,
                            keys,
                          )
                          const { displayOrderByActionOrder } =
                            getOperationShareRoundDisplay(
                              round.sourceRound,
                              cardConfig,
                            )
                          const note = getOperationShareRoundNoteText(
                            round.sourceRound,
                            cardConfig,
                          )
                          const noteActions = getOperationShareOtherActions(
                            round.sourceRound,
                            {
                              ...cardConfig,
                              hiddenOtherActionKeys: {},
                            },
                          ).filter(
                            (action) =>
                              !isOperationShareTargetSwitchAction(action.raw),
                          )
                          const hasNoteOverride =
                            Object.prototype.hasOwnProperty.call(
                              cardConfig.roundNoteOverrides ?? {},
                              round.round,
                            )
                          const hasHiddenOtherActions = Object.keys(
                            cardConfig.hiddenOtherActionKeys ?? {},
                          ).some((key) => key.startsWith(`${round.round}:`))
                          return (
                            <tr key={round.round}>
                              <th
                                className="border-b border-r border-slate-200 px-1 py-0.5 font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300 max-sm:px-0 max-sm:py-0"
                                style={
                                  isMobileDevice
                                    ? {
                                        width: '24px',
                                        minWidth: '24px',
                                        maxWidth: '24px',
                                      }
                                    : undefined
                                }
                              >
                                {effectiveEditMode === 'color' ? (
                                  <OperationShareSelectionCheckbox
                                    ariaLabel={`选择第 ${round.round} 回合整行`}
                                    checked={selection.checked}
                                    indeterminate={selection.indeterminate}
                                    label={`${round.round}`}
                                    onChange={(checked) =>
                                      colorMode === 'action'
                                        ? toggleActionGroupSelection(
                                            round.actionKeys,
                                            checked,
                                          )
                                        : toggleCellGroupSelection(
                                            round.cellKeys,
                                            checked,
                                          )
                                    }
                                  />
                                ) : (
                                  round.round
                                )}
                              </th>
                              {editableColumns.map((column) => {
                                const cellKey = buildOperationShareCellKey(
                                  round.round,
                                  column.key,
                                )
                                const actions =
                                  round.sourceRound.slots[column.slot] ?? []
                                const actionLabels = actions.map((action) =>
                                  getOperationShareActionLabel(
                                    action,
                                    displayOrderByActionOrder.get(action.order),
                                  ),
                                )
                                const cellSelected =
                                  selectedCellKeys.has(cellKey)
                                const cellHasColor = Boolean(
                                  cardConfig.cellColors[cellKey],
                                )
                                const actionNodes = actions.map((action) => {
                                  const actionKey =
                                    buildOperationShareActionKey(
                                      round.round,
                                      action.order,
                                    )
                                  const selected =
                                    selectedActionKeys.has(actionKey)
                                  const label = getOperationShareActionLabel(
                                    action,
                                    displayOrderByActionOrder.get(action.order),
                                  )
                                  const actionFill =
                                    getOperationShareActionFillColor(
                                      cardConfig.actionColors[actionKey],
                                      action.targetIndex,
                                    )

                                  return effectiveEditMode === 'color' ? (
                                    <button
                                      key={actionKey}
                                      aria-label={`${round.round} 回合 ${column.label}：${label}`}
                                      aria-pressed={selected}
                                      data-mobile-action-column={column.key}
                                      className={`whitespace-nowrap rounded-sm py-0.5 font-medium leading-4 transition enabled:hover:bg-black/5 enabled:focus:outline-none ${
                                        actionFill ||
                                        (cellHasColor && !selected)
                                          ? 'text-slate-800'
                                          : 'text-slate-800 dark:text-slate-100'
                                      } ${
                                        isMobileDevice ? 'px-0.5' : 'px-1'
                                      } ${
                                        selected
                                          ? 'bg-sky-50 ring-1 ring-inset ring-sky-500 dark:bg-sky-900/60 dark:ring-sky-400'
                                          : ''
                                      }`}
                                      onClick={() =>
                                        toggleActionSelection(
                                          actionKey,
                                          !selected,
                                        )
                                      }
                                      style={
                                        actionFill
                                          ? {
                                              backgroundColor: actionFill,
                                              ...(isMobileDevice
                                                ? {}
                                                : { paddingInline: '4px' }),
                                            }
                                          : undefined
                                      }
                                      type="button"
                                    >
                                      {label}
                                    </button>
                                  ) : (
                                    <span
                                      key={actionKey}
                                      className={`whitespace-nowrap rounded-sm px-0.5 py-0.5 text-[11px] font-medium leading-4 ${
                                        actionFill
                                          ? 'text-slate-800'
                                          : 'text-slate-800 dark:text-slate-100'
                                      }`}
                                      style={
                                        actionFill
                                          ? { backgroundColor: actionFill }
                                          : undefined
                                      }
                                    >
                                      {label}
                                    </span>
                                  )
                                })

                                return (
                                  <td
                                    key={column.key}
                                    className={`border-b border-r border-slate-200 last:border-r-0 dark:border-slate-600 ${
                                      effectiveEditMode === 'note'
                                        ? `p-0.5 ${
                                            isMobileNoteMode
                                              ? 'text-center align-middle'
                                              : ''
                                          }`
                                        : isMobileDevice
                                          ? 'p-0'
                                          : 'p-1'
                                    }`}
                                    style={{
                                      ...getOperationShareCellVisualStyle(
                                        cardConfig.cellColors[cellKey],
                                        cardConfig.showCellPattern,
                                      ),
                                      ...(isMobileNoteMode
                                        ? {
                                            width: `${getMobileNoteActionColumnWidth(
                                              column.key,
                                            )}px`,
                                            minWidth: `${getMobileNoteActionColumnWidth(
                                              column.key,
                                            )}px`,
                                            maxWidth: `${getMobileNoteActionColumnWidth(
                                              column.key,
                                            )}px`,
                                          }
                                        : {}),
                                    }}
                                  >
                                    {colorMode === 'action' ||
                                    effectiveEditMode === 'note' ? (
                                      <div
                                        className={
                                          isMobileNoteMode
                                            ? 'inline-flex min-h-6 flex-col items-center justify-center gap-y-0.5'
                                            : 'flex min-h-6 flex-wrap items-center justify-center gap-0.5'
                                        }
                                        data-mobile-note-action-group={
                                          isMobileNoteMode ? true : undefined
                                        }
                                        data-mobile-note-action-column={
                                          isMobileNoteMode
                                            ? column.key
                                            : undefined
                                        }
                                      >
                                        {actions.length > 0 ? (
                                          isMobileNoteMode ? (
                                            Array.from(
                                              {
                                                length: Math.ceil(
                                                  actionNodes.length / 3,
                                                ),
                                              },
                                              (_, rowIndex) => (
                                                <div
                                                  key={rowIndex}
                                                  className="flex items-center justify-center gap-0.5"
                                                >
                                                  {actionNodes.slice(
                                                    rowIndex * 3,
                                                    rowIndex * 3 + 3,
                                                  )}
                                                </div>
                                              ),
                                            )
                                          ) : (
                                            actionNodes
                                          )
                                        ) : (
                                          <span
                                            className={
                                              cellHasColor
                                                ? 'text-slate-400'
                                                : 'text-slate-400 dark:text-slate-500'
                                            }
                                          >
                                            —
                                          </span>
                                        )}
                                      </div>
                                    ) : effectiveEditMode === 'color' ? (
                                      <button
                                        aria-label={`${round.round} 回合 ${column.label}${
                                          actionLabels.length > 0
                                            ? `：${actionLabels.join(' ')}`
                                            : ''
                                        }`}
                                        aria-pressed={cellSelected}
                                        className={`relative flex min-h-6 w-full items-center justify-center rounded-sm transition enabled:hover:bg-black/5 enabled:focus:outline-none ${
                                          cellHasColor && !cellSelected
                                            ? 'text-slate-800'
                                            : 'text-slate-800 dark:text-slate-100'
                                        } ${
                                          isMobileDevice
                                            ? 'gap-0 px-0 py-0'
                                            : 'gap-1.5 px-1.5 py-1'
                                        } ${
                                          cellSelected
                                            ? 'bg-sky-50/80 ring-1 ring-inset ring-sky-500 dark:bg-sky-900/50 dark:ring-sky-400'
                                            : ''
                                        }`}
                                        onClick={() =>
                                          toggleCellSelection(
                                            cellKey,
                                            !cellSelected,
                                          )
                                        }
                                        type="button"
                                      >
                                        {isMobileDevice ? (
                                          cellSelected ? (
                                            <Icon
                                              aria-hidden="true"
                                              className="absolute right-0 top-0 z-0 text-sky-600"
                                              icon="tick"
                                              size={9}
                                            />
                                          ) : null
                                        ) : (
                                          <span
                                            aria-hidden="true"
                                            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                                              cellSelected
                                                ? 'border-sky-500 bg-sky-500 text-white'
                                                : 'border-slate-400 bg-white/70 dark:border-slate-500 dark:bg-slate-800'
                                            }`}
                                          >
                                            {cellSelected ? (
                                              <Icon icon="tick" size={10} />
                                            ) : null}
                                          </span>
                                        )}
                                        <span
                                          className={`flex min-w-0 flex-wrap items-center justify-center gap-0.5 font-medium leading-4 ${
                                            isMobileDevice ? 'w-full' : ''
                                          }`}
                                        >
                                          {actions.length > 0
                                            ? actions.map((action) => {
                                                const actionKey =
                                                  buildOperationShareActionKey(
                                                    round.round,
                                                    action.order,
                                                  )
                                                const actionFill =
                                                  getOperationShareActionFillColor(
                                                    cardConfig.actionColors[
                                                      actionKey
                                                    ],
                                                    action.targetIndex,
                                                  )

                                                return (
                                                  <span
                                                    key={actionKey}
                                                    className={`whitespace-nowrap rounded-sm px-0.5 py-0.5 text-[11px] ${
                                                      actionFill ||
                                                      (cellHasColor &&
                                                        !cellSelected)
                                                        ? 'text-slate-800'
                                                        : 'text-slate-800 dark:text-slate-100'
                                                    }`}
                                                    data-mobile-action-column={
                                                      column.key
                                                    }
                                                    style={
                                                      actionFill
                                                        ? {
                                                            backgroundColor:
                                                              actionFill,
                                                          }
                                                        : undefined
                                                    }
                                                  >
                                                    {getOperationShareActionLabel(
                                                      action,
                                                      displayOrderByActionOrder.get(
                                                        action.order,
                                                      ),
                                                    )}
                                                  </span>
                                                )
                                              })
                                            : '—'}
                                        </span>
                                      </button>
                                    ) : (
                                      <div className="flex min-h-6 items-center justify-center px-0.5 py-0.5">
                                        <span
                                          className={`min-w-0 break-words text-[11px] font-medium leading-4 ${
                                            cellHasColor
                                              ? 'text-slate-800'
                                              : 'text-slate-800 dark:text-slate-100'
                                          }`}
                                        >
                                          {actionLabels.length > 0
                                            ? actionLabels.join(' ')
                                            : '—'}
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                )
                              })}
                              {showRoundNoteColumn ? (
                                <td
                                  className={`border-b border-slate-200 text-left align-top dark:border-slate-600 ${
                                    effectiveEditMode === 'note'
                                      ? 'p-2'
                                      : 'p-1'
                                  }`}
                                >
                                  {/* 富文本颜色按浅色分享图校验，编辑画布也保持浅色。 */}
                                  <OperationShareNoteEditor
                                    ariaLabel={`${round.round} 回合备注`}
                                    className={`block w-full resize-y overflow-y-auto whitespace-pre-wrap break-words rounded border border-slate-300 bg-white text-slate-800 outline-none focus:border-sky-500 dark:border-slate-600 ${
                                      isMobileDevice ? 'min-w-0' : ''
                                    } ${
                                      effectiveEditMode === 'note'
                                        ? 'min-h-14 px-2 py-1.5 text-xs leading-5'
                                        : 'max-h-24 min-h-6 px-1 py-0.5 text-[11px] leading-4'
                                    }`}
                                    onChange={(value) =>
                                      updateRoundNote(round.round, value)
                                    }
                                    placeholder="修改本回合备注"
                                    revision={noteEditorRevision}
                                    round={round.round}
                                    value={note}
                                  />
                                  {effectiveEditMode === 'note' &&
                                  noteActions.length > 0 ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-0.5">
                                      <span className="mr-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                                        快捷填入
                                      </span>
                                      {noteActions.map((action) => {
                                        const label =
                                          getOperationShareNoteActionLabel(
                                            round.sourceRound,
                                            action,
                                            displayOrderByActionOrder,
                                          )
                                        const included = note.includes(label)

                                        return (
                                          <Button
                                            key={`${action.order}-${action.raw}`}
                                            aria-label={
                                              included
                                                ? `从备注移除${label}`
                                                : `填入备注${label}`
                                            }
                                            className={`!inline-flex !h-5 !min-h-0 !items-center !gap-0.5 !px-1 !py-0 !text-[10px] !font-normal !leading-none ${
                                              included
                                                ? '!bg-slate-100 !text-slate-700 dark:!bg-slate-700 dark:!text-slate-200'
                                                : '!text-slate-400 dark:!text-slate-500'
                                            }`}
                                            icon={
                                              <Icon
                                                icon={
                                                  included ? 'cross' : 'plus'
                                                }
                                                size={9}
                                              />
                                            }
                                            minimal
                                            onClick={() =>
                                              toggleOtherActionInNote(
                                                round.sourceRound,
                                                label,
                                              )
                                            }
                                            small
                                          >
                                            {label}
                                          </Button>
                                        )
                                      })}
                                      {hasNoteOverride ||
                                      hasHiddenOtherActions ? (
                                        <Button
                                          className="!inline-flex !h-5 !min-h-0 !items-center !gap-0.5 !px-1 !py-0 !text-[10px] !font-normal !leading-none"
                                          icon={<Icon icon="reset" size={9} />}
                                          minimal
                                          onClick={() =>
                                            runNoteHistoryGroup(() =>
                                              restoreRoundNote(round.round),
                                            )
                                          }
                                          small
                                        >
                                          恢复自动内容
                                        </Button>
                                      ) : null}
                                      {hasNoteOverride ? (
                                        <Button
                                          className="!inline-flex !h-5 !min-h-0 !items-center !gap-0.5 !px-1 !py-0 !text-[10px] !font-normal !leading-none"
                                          icon={<Icon icon="reset" size={9} />}
                                          minimal
                                          onClick={() =>
                                            runNoteHistoryGroup(() =>
                                              resetOperationShareNoteFormatting(
                                                round.round,
                                              ),
                                            )
                                          }
                                          small
                                        >
                                          恢复格式
                                        </Button>
                                      ) : null}
                                    </div>
                                  ) : effectiveEditMode === 'note' &&
                                    (hasNoteOverride ||
                                      hasHiddenOtherActions) ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-0.5">
                                      {hasNoteOverride ? (
                                        <Button
                                          className="!inline-flex !h-5 !min-h-0 !items-center !gap-0.5 !px-1 !py-0 !text-[10px] !font-normal !leading-none"
                                          icon={<Icon icon="reset" size={9} />}
                                          minimal
                                          onClick={() =>
                                            runNoteHistoryGroup(() =>
                                              resetOperationShareNoteFormatting(
                                                round.round,
                                              ),
                                            )
                                          }
                                          small
                                        >
                                          恢复格式
                                        </Button>
                                      ) : null}
                                      <Button
                                        className="!inline-flex !h-5 !min-h-0 !items-center !gap-0.5 !px-1 !py-0 !text-[10px] !font-normal !leading-none"
                                        icon={<Icon icon="reset" size={9} />}
                                        minimal
                                        onClick={() =>
                                          runNoteHistoryGroup(() =>
                                            restoreRoundNote(round.round),
                                          )
                                        }
                                        small
                                      >
                                        恢复自动内容
                                      </Button>
                                    </div>
                                  ) : null}
                                </td>
                              ) : null}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </fieldset>
          ) : (
            <fieldset
              className="mb-5 rounded border border-slate-200 bg-white p-4 dark:border-slate-600 dark:bg-[#383e47]"
              disabled={
                status === 'generating' || authorConfigStatus === 'loading'
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                      生成前编辑
                    </h3>
                    <Button
                      disabled={
                        Object.keys(cardConfig.requiredDiscs).length === 0
                      }
                      icon="reset"
                      minimal
                      onClick={clearRequiredDiscs}
                      small
                    >
                      清除必须标记
                    </Button>
                    <Button
                      disabled={
                        !currentRemoteConfig || hasUnsupportedRemoteConfig
                      }
                      icon="cloud-download"
                      minimal
                      onClick={restoreAuthorConfig}
                      small
                    >
                      恢复作者配置
                    </Button>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    配置会按当前作业自动缓存；可将关键命盘标记为“必须”，也可额外禁用其他命盘。
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-600">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    表格配色
                  </h4>
                  <Button
                    aria-label="恢复预设密探表格配色"
                    disabled={
                      !normalizedOperatorTableColor &&
                      !hasOperatorTableThemeOverrides
                    }
                    icon="reset"
                    minimal
                    onClick={resetOperatorTableTheme}
                    small
                  >
                    恢复预设
                  </Button>
                </div>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  选择上阵密探分享图的整体主题色，可自定义颜色。
                  <span
                    aria-live="polite"
                    className="ml-2 text-slate-500 dark:text-slate-400"
                  >
                    {operatorTableThemeStatus}
                  </span>
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-xs text-slate-400">预设</span>
                  {OPERATION_SHARE_TABLE_THEME_PRESETS.map((preset) => {
                    const presetTheme = getOperationShareTableTheme(
                      preset.baseColor,
                    )
                    const selected =
                      selectedOperatorTableThemePreset.id === preset.id &&
                      (preset.baseColor !== undefined ||
                        cardConfig.operatorTableColor === undefined)
                    const previewColor = presetTheme.bodyBackgrounds[1]

                    return (
                      <button
                        key={preset.id}
                        aria-label={`应用${preset.label}密探表格配色`}
                        aria-pressed={selected}
                        className={`flex h-7 items-center gap-1.5 rounded border px-1.5 text-xs transition-colors ${
                          selected
                            ? 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-600'
                        }`}
                        onClick={() =>
                          updateOperatorTableColor(preset.baseColor)
                        }
                        type="button"
                      >
                        <span
                          aria-hidden
                          className="flex h-3 w-3 shrink-0 overflow-hidden rounded-[2px] border border-black/10"
                        >
                          <span
                            className="h-full w-full"
                            style={{ backgroundColor: previewColor }}
                          />
                        </span>
                        <span>{preset.label}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <label className="flex h-7 items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    <span>自定义</span>
                    <input
                      aria-label="选择密探表格主题色"
                      className="h-5 w-7 cursor-pointer rounded-sm border-0 bg-transparent p-0"
                      onChange={(event) =>
                        updateOperatorTableColor(event.currentTarget.value)
                      }
                      type="color"
                      value={
                        cardConfig.operatorTableColor ??
                        DEFAULT_OPERATION_SHARE_TABLE_BASE_COLOR
                      }
                    />
                    <span className="tabular-nums text-slate-500 dark:text-slate-400">
                      {cardConfig.operatorTableColor ?? '默认'}
                    </span>
                  </label>
                  <Button
                    aria-controls="operation-share-operator-table-theme-advanced"
                    aria-expanded={isOperatorTableThemeAdvancedOpen}
                    aria-label={
                      isOperatorTableThemeAdvancedOpen
                        ? '收起高级自定义'
                        : '展开高级自定义'
                    }
                    className="!text-xs !font-normal !text-slate-500 hover:!text-slate-700 dark:!text-slate-400 dark:hover:!text-slate-200"
                    icon={
                      <Icon
                        icon={
                          isOperatorTableThemeAdvancedOpen
                            ? 'chevron-up'
                            : 'chevron-down'
                        }
                        size={12}
                      />
                    }
                    minimal
                    onClick={() =>
                      setIsOperatorTableThemeAdvancedOpen((current) => !current)
                    }
                    small
                  >
                    高级自定义
                    {hasOperatorTableThemeOverrides
                      ? `（已修改 ${operatorTableThemeOverrideCount} 项）`
                      : ''}
                  </Button>
                </div>
                {isOperatorTableThemeAdvancedOpen ? (
                  <div
                    className="mt-2 w-fit max-w-full rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-600 dark:bg-slate-800/60"
                    id="operation-share-operator-table-theme-advanced"
                  >
                    <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600 dark:text-slate-200">
                      {operatorTableThemeColorFields.map(
                        ({ key, label, value }) => (
                          <label
                            key={key}
                            className="flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-slate-200 bg-white px-1.5 dark:border-slate-600 dark:bg-slate-700"
                          >
                            <input
                              aria-label={`${label}颜色`}
                              className="h-4 w-6 shrink-0 cursor-pointer rounded-sm border border-black/10 bg-transparent p-0"
                              onChange={(event) =>
                                updateOperatorTableThemeOverride(
                                  key,
                                  event.currentTarget.value,
                                )
                              }
                              type="color"
                              value={value}
                            />
                            <span>{label}</span>
                          </label>
                        ),
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              {model.operators.some((operator) => operator.discs.length > 0) ? (
                <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4 dark:border-slate-600 sm:grid-cols-2 md:grid-cols-5">
                  {model.operators.map((operator, operatorIndex) => (
                    <section
                      key={`${operator.rawName}-${operatorIndex}`}
                      className="min-w-0 rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-600 dark:bg-slate-800/60"
                    >
                      <h4 className="break-words text-xs font-semibold leading-5 text-slate-700 dark:text-slate-200">
                        {operator.slot ?? operatorIndex + 1} 号位 {'·'}
                        {operator.name}
                      </h4>
                      {operator.discs.length > 0 ? (
                        <div className="mt-1.5 grid gap-1">
                          {operator.discs.map((disc) => {
                            const key = buildOperationShareDiscKey(
                              operator.slot ?? operatorIndex + 1,
                              disc.slot,
                            )
                            if (disc.forbidden) {
                              return (
                                <div
                                  key={key}
                                  className="flex flex-col items-start gap-1 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-semibold leading-5 text-red-800"
                                >
                                  <span className="shrink-0 rounded bg-red-700 px-1.5 py-0.5 text-xs font-bold text-white">
                                    绝对不能有
                                  </span>
                                  <span>
                                    {disc.slot} 号命盘：{disc.abbreviation}
                                  </span>
                                </div>
                              )
                            }
                            return (
                              <Checkbox
                                key={key}
                                checked={cardConfig.requiredDiscs[key] === true}
                                className="m-0 text-xs leading-5"
                                label={`${disc.slot} 号命盘：${disc.abbreviation}`}
                                onChange={(event) =>
                                  updateRequiredDisc(
                                    key,
                                    event.currentTarget.checked,
                                  )
                                }
                              />
                            )
                          })}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                          未配置命盘
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <p className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-400 dark:border-slate-600 dark:text-slate-500">
                  当前上阵密探未配置命盘。
                </p>
              )}

              {model.operators.length > 0 ? (
                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-600">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        额外禁用命盘
                      </h4>
                      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        从该密探的完整命盘列表中添加。只影响分享图，不修改作业或编辑器中的禁用设置。
                      </p>
                    </div>
                    <Button
                      disabled={
                        Object.keys(cardConfig.extraForbiddenDiscs ?? {})
                          .length === 0
                      }
                      icon="reset"
                      minimal
                      onClick={clearExtraForbiddenDiscs}
                      small
                    >
                      清除额外禁用
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-5">
                    {model.operators.map((operator, operatorIndex) => {
                      const operatorSlot = operator.slot ?? operatorIndex + 1
                      const operatorKey = String(operatorSlot)
                      const selectedExtraDiscNames =
                        resolveOperationShareExtraForbiddenDiscs(
                          operator,
                          cardConfig.extraForbiddenDiscs?.[operatorKey] ?? [],
                        )
                      const configuredDiscNames = new Set(
                        operator.discs
                          .map((disc) => disc.abbreviation)
                          .filter(
                            (discName) => discName !== '未选择命盘',
                          ),
                      )
                      const fullDiscNames = Array.from(
                        new Set(
                          (findOperatorByName(operator.rawName)?.discs ?? [])
                            .map((disc) => disc.abbreviation.trim())
                            .filter(Boolean),
                        ),
                      )
                      const availableDiscNames = fullDiscNames.filter(
                        (discName) =>
                          !configuredDiscNames.has(discName) &&
                          !selectedExtraDiscNames.includes(discName),
                      )
                      const selectedDiscName =
                        extraForbiddenDiscSelections[operatorKey] &&
                        availableDiscNames.includes(
                          extraForbiddenDiscSelections[operatorKey],
                        )
                          ? extraForbiddenDiscSelections[operatorKey]
                          : (availableDiscNames[0] ?? '')

                      return (
                        <section
                          key={`${operator.rawName}-${operatorIndex}-extra-forbidden`}
                          className="min-w-0 rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-600 dark:bg-slate-800/60"
                        >
                          <h4 className="break-words text-xs font-semibold leading-5 text-slate-700 dark:text-slate-200">
                            {operatorSlot} 号位 {'·'}
                            {operator.name}
                          </h4>
                          {availableDiscNames.length > 0 ? (
                            <div className="mt-1.5 grid gap-1">
                              <div className="flex items-center gap-1">
                                <select
                                  aria-label={`${operator.name}额外禁用命盘`}
                                  className="h-7 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-sky-400/20"
                                  value={selectedDiscName}
                                  onChange={(event) => {
                                    const nextDiscName =
                                      event.currentTarget.value
                                    setExtraForbiddenDiscSelections(
                                      (current) => ({
                                        ...current,
                                        [operatorKey]: nextDiscName,
                                      }),
                                    )
                                  }}
                                >
                                  {availableDiscNames.map((discName) => (
                                    <option key={discName} value={discName}>
                                      {discName}
                                    </option>
                                  ))}
                                </select>
                                <Button
                                  aria-label={`添加${operator.name}额外禁用命盘`}
                                  className="!h-7 !w-7 !min-h-7 !min-w-7 shrink-0 !p-0"
                                  disabled={!selectedDiscName}
                                  icon="plus"
                                  onClick={() =>
                                    addExtraForbiddenDisc(
                                      operatorSlot,
                                      selectedDiscName,
                                    )
                                  }
                                  small
                                  title="添加命盘"
                                />
                              </div>
                              {selectedExtraDiscNames.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {selectedExtraDiscNames.map((discName) => (
                                    <button
                                      key={discName}
                                      type="button"
                                      className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-1 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-100 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
                                      onClick={() =>
                                        removeExtraForbiddenDisc(
                                          operatorSlot,
                                          discName,
                                        )
                                      }
                                      title="点击移除额外禁用"
                                    >
                                      <span className="line-through decoration-red-300 dark:decoration-red-700">
                                        {discName}
                                      </span>
                                      <Icon icon="cross" size={9} />
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
                              没有可添加的命盘
                            </p>
                          )}
                        </section>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </fieldset>
          )}

          {status === 'idle' ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded border border-dashed border-slate-300 bg-white text-slate-500 dark:border-slate-600 dark:bg-[#383e47] dark:text-slate-400">
              <span className="text-base font-medium">图片尚未生成</span>
              <span className="text-sm">
                完成上方编辑后，点击“生成图片”预览。
              </span>
            </div>
          ) : null}
          {status === 'generating' ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-slate-600 dark:text-slate-300">
              <Spinner />
              <span>
                {t.components.viewer.OperationViewer.share_image_generating}
              </span>
            </div>
          ) : null}
          {status === 'error' ? (
            <Callout
              intent="danger"
              title={t.components.viewer.OperationViewer.share_image_failed}
            >
              {error}
            </Callout>
          ) : null}
          {status === 'ready' && previewUrl ? (
            <img
              alt={t.components.viewer.OperationViewer.share_image_preview_alt}
              className="mx-auto block h-auto max-w-full shadow"
              src={previewUrl}
            />
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 rounded-b-lg border-t border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-600 dark:bg-[#383e47] md:pb-4">
          <Button onClick={onClose}>
            {t.components.viewer.OperationViewer.share_image_close}
          </Button>
          {canManageAuthorConfig ? (
            <Button
              disabled={
                authorConfigStatus === 'loading' ||
                status === 'generating' ||
                savingCardKind !== undefined ||
                hasUnsupportedRemoteConfig
              }
              icon="floppy-disk"
              loading={savingCardKind === cardKind}
              onClick={() => void saveAuthorConfig()}
            >
              保存作者配置
            </Button>
          ) : null}
          <Button
            disabled={status === 'generating' || !cardNode || !qrDataUrl}
            icon={status === 'idle' ? 'media' : 'refresh'}
            intent={status === 'idle' ? 'primary' : 'none'}
            onClick={() => void generate()}
          >
            {status === 'idle'
              ? '生成图片'
              : t.components.viewer.OperationViewer.share_image_regenerate}
          </Button>
          <Button
            disabled={status !== 'ready'}
            icon="download"
            intent="primary"
            onClick={download}
          >
            {t.components.viewer.OperationViewer.share_image_download}
          </Button>
        </div>
      </div>
      <div aria-hidden className="fixed left-[-12000px] top-0">
        {qrDataUrl ? (
          cardKind === 'actions' ? (
            <OperationShareCard
              cardRef={setCardNode}
              config={cardConfig}
              hideQrCode={effectiveHideQrCode}
              model={model}
              qrDataUrl={qrDataUrl}
              showShortCode={showShortCode}
            />
          ) : (
            <DeployedOperatorsShareCard
              cardRef={setCardNode}
              config={cardConfig}
              hideQrCode={effectiveHideQrCode}
              model={model}
              qrDataUrl={qrDataUrl}
              showShortCode={showShortCode}
            />
          )
        ) : null}
      </div>
    </Dialog>
  )
}

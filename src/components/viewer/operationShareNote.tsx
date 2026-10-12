import { Icon } from '@blueprintjs/core'

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

const NOTE_COLORS = {
  red: '#dc2626',
  blue: '#2563eb',
} as const
const NOTE_HIGHLIGHT_COLOR = '#fef08a'

const NOTE_MIN_FONT_SIZE = 10
const NOTE_MAX_FONT_SIZE = 24
const NOTE_FONT_SIZE_STEP = 2
const NOTE_SELECT_ALL_CHANGE_EVENT = 'operation-share-note-select-all-change'

function isBlankNoteHtml(value: string) {
  return /^(?:<br\s*\/?>|<div>\s*<br\s*\/?>\s*<\/div>|<p>\s*<br\s*\/?>\s*<\/p>)$/i.test(
    value.trim(),
  )
}

export function getOperationShareNotePlainText(value: string) {
  if (!value) return ''
  if (typeof document === 'undefined' || !/<[a-z][\s\S]*>/i.test(value)) {
    return value
  }

  const template = document.createElement('template')
  template.innerHTML = value
  return template.content.textContent ?? ''
}

export function hasOperationShareNoteText(value: string) {
  return getOperationShareNotePlainText(value).trim().length > 0
}

function isAllowedNoteColor(value: string) {
  return /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(
    value,
  )
}

function isAllowedNoteFontSize(value: string) {
  const size = Number.parseFloat(value)
  return (
    Number.isFinite(size) &&
    /^\d+(?:\.\d+)?px$/i.test(value) &&
    size >= NOTE_MIN_FONT_SIZE &&
    size <= NOTE_MAX_FONT_SIZE
  )
}

function getLegacyFontSize(value: string | null) {
  const sizeMap: Record<string, string> = {
    '1': '10px',
    '2': '12px',
    '3': '14px',
    '4': '16px',
    '5': '18px',
    '6': '20px',
    '7': '24px',
  }
  return value ? sizeMap[value] : undefined
}

function getNoteNodeStyle(node: Element): CSSProperties {
  const tagName = node.tagName.toLowerCase()
  const style: CSSProperties = {}
  if (tagName === 'font') {
    const color = node.getAttribute('color')
    const fontSize = getLegacyFontSize(node.getAttribute('size'))
    if (color && isAllowedNoteColor(color)) style.color = color
    if (fontSize) style.fontSize = fontSize
  } else if (tagName === 'span') {
    const color = (node as HTMLElement).style.color
    const fontSize = (node as HTMLElement).style.fontSize
    const backgroundColor = (node as HTMLElement).style.backgroundColor
    if (color && isAllowedNoteColor(color)) style.color = color
    if (fontSize && isAllowedNoteFontSize(fontSize)) style.fontSize = fontSize
    if (backgroundColor && isAllowedNoteColor(backgroundColor)) {
      style.backgroundColor = backgroundColor
    }
  }

  return style
}

function createSafeNoteNodes(nodes: NodeListOf<ChildNode>): Node[] {
  return Array.from(nodes).flatMap((node): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      return [document.createTextNode(node.textContent ?? '')]
    }
    if (!(node instanceof Element)) return []
    const tagName = node.tagName.toLowerCase()
    const children = createSafeNoteNodes(node.childNodes)
    const style = getNoteNodeStyle(node)
    if (
      !['b', 'strong', 'i', 'em', 'div', 'p', 'br', 'span', 'font'].includes(
        tagName,
      )
    ) {
      return children
    }
    const element = document.createElement(
      tagName === 'font' ? 'span' : tagName,
    )
    Object.assign(element.style, style)
    element.append(...children)
    return [element]
  })
}

function renderNoteNodes(nodes: NodeListOf<ChildNode>, keyPrefix: string) {
  return Array.from(nodes).map((node, index) => {
    const key = `${keyPrefix}-${index}`
    if (node.nodeType === 3) return node.textContent ?? ''
    if (!(node instanceof Element)) return null
    const tagName = node.tagName.toLowerCase()
    if (tagName === 'br') return <br key={key} />
    const children = renderNoteNodes(node.childNodes, key)
    if (tagName === 'b' || tagName === 'strong')
      return <strong key={key}>{children}</strong>
    if (tagName === 'i' || tagName === 'em')
      return <em key={key}>{children}</em>
    if (tagName === 'div' || tagName === 'p')
      return <div key={key}>{children}</div>
    const style = getNoteNodeStyle(node)
    if (Object.keys(style).length === 0) return children
    return (
      <span key={key} style={style}>
        {children}
      </span>
    )
  })
}

export function OperationShareNoteContent({ value }: { value: string }) {
  const content = useMemo(() => {
    if (
      !value ||
      typeof document === 'undefined' ||
      !/<[a-z][\s\S]*>/i.test(value)
    ) {
      return value
    }

    const template = document.createElement('template')
    template.innerHTML = value
    return renderNoteNodes(template.content.childNodes, 'note')
  }, [value])

  return <>{content}</>
}

function NoteColorIcon({ color }: { color: string }) {
  return (
    <span className="relative inline-block h-4 w-4 leading-none">
      <span className="absolute inset-x-0 top-0 text-center text-[12px] font-semibold leading-4 text-slate-800 dark:text-slate-100">
        A
      </span>
      <span
        className="absolute inset-x-0.5 bottom-0 h-[3px] rounded-full"
        style={{ backgroundColor: color }}
      />
    </span>
  )
}

function NoteSizeIcon({ larger }: { larger: boolean }) {
  return (
    <span className="relative inline-block h-4 w-4 leading-none">
      <span className="absolute inset-y-0 left-0 text-[12px] font-semibold leading-4 text-slate-800 dark:text-slate-100">
        A
      </span>
      <span className="absolute right-0 top-0 text-[11px] font-semibold leading-3 text-blue-600 dark:text-blue-400">
        {larger ? '+' : '−'}
      </span>
    </span>
  )
}

function NoteHighlightIcon() {
  return (
    <span className="relative block h-3.5 w-3.5 translate-y-0.5">
      <Icon
        className="absolute left-1/2 top-0 -translate-x-1/2 text-slate-800 dark:text-slate-100"
        icon="highlight"
        size={10}
      />
      <span
        className="absolute inset-x-0 bottom-0 h-1 rounded-[2px]"
        style={{ backgroundColor: NOTE_HIGHLIGHT_COLOR }}
      />
    </span>
  )
}

function NoteNoHighlightIcon() {
  return (
    <span className="relative block h-3.5 w-3.5 translate-y-0.5">
      <Icon
        className="absolute left-1/2 top-0 -translate-x-1/2 text-slate-800 dark:text-slate-100"
        icon="highlight"
        size={10}
      />
      <span className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-[2px] border border-slate-400 dark:border-slate-300">
        <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 -rotate-45 rounded-full bg-red-500" />
      </span>
    </span>
  )
}

function NoteUndoIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[13px] w-[13px]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.3}
      viewBox="0 0 20 20"
    >
      <path d="M5.2 6.4h5.6a5 5 0 0 1 0 10H9.3" />
      <path d="M8 3.6 5.2 6.4l2.8 2.8" />
    </svg>
  )
}

function NoteRedoIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[13px] w-[13px]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.3}
      viewBox="0 0 20 20"
    >
      <path d="M14.8 6.4h-5.6a5 5 0 0 0 0 10h1.5" />
      <path d="M12 3.6l2.8 2.8-2.8 2.8" />
    </svg>
  )
}

function NoteFormatButton({
  ariaLabel,
  active = false,
  children,
  disabled = false,
  onClick,
  soft = false,
  wide = false,
}: {
  ariaLabel: string
  active?: boolean
  children: ReactNode
  disabled?: boolean
  onClick: () => void
  soft?: boolean
  wide?: boolean
}) {
  const stateClassName = soft
    ? disabled
      ? 'cursor-not-allowed bg-slate-100 opacity-45 dark:bg-slate-700'
      : active
        ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-200'
        : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600'
    : disabled
      ? 'cursor-not-allowed border border-slate-200 bg-white opacity-35 dark:border-slate-600 dark:bg-slate-800'
      : active
        ? 'border border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/50 dark:text-sky-200'
        : 'border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700'

  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={active || undefined}
      className={`inline-flex h-6 shrink-0 items-center justify-center rounded-md p-0 text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 dark:text-slate-200 ${
        wide ? 'w-auto px-1.5' : 'w-6'
      } ${stateClassName}`}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={ariaLabel}
      type="button"
    >
      {children}
    </button>
  )
}

function getOperationShareNoteEditors() {
  return Array.from(
    document.querySelectorAll<HTMLDivElement>(
      '[data-operation-share-note-editor]',
    ),
  )
}

function getSelectAllNoteEditors() {
  return getOperationShareNoteEditors().filter(
    (editor) => editor.dataset.operationShareNoteSelectAll === 'true',
  )
}

function setOperationShareNoteSelectAll(selected: boolean) {
  getOperationShareNoteEditors().forEach((editor) => {
    if (selected) {
      editor.dataset.operationShareNoteSelectAll = 'true'
      editor.style.boxShadow = '0 0 0 2px rgba(56, 189, 248, 0.95)'
      editor.style.outline = '2px solid rgba(14, 165, 233, 0.65)'
      editor.style.outlineOffset = '1px'
    } else {
      delete editor.dataset.operationShareNoteSelectAll
      editor.style.boxShadow = ''
      editor.style.outline = ''
      editor.style.outlineOffset = ''
    }
  })

  window.dispatchEvent(
    new CustomEvent<boolean>(NOTE_SELECT_ALL_CHANGE_EVENT, {
      detail: selected,
    }),
  )
}

function getActiveNoteEditor() {
  const selection = window.getSelection()
  const anchorNode = selection?.anchorNode
  if (!selection || !anchorNode) return { editor: null, selection, range: null }

  const anchorElement =
    anchorNode instanceof Element ? anchorNode : anchorNode.parentElement
  const editor = anchorElement?.closest(
    '[data-operation-share-note-editor]',
  ) as HTMLDivElement | null
  if (!editor || !editor.contains(anchorNode) || selection.rangeCount === 0) {
    return { editor: null, selection, range: null }
  }

  return {
    editor,
    selection,
    range: selection.getRangeAt(0),
  }
}

function emitNoteEditorInput(editor: HTMLDivElement) {
  editor.dispatchEvent(new Event('input', { bubbles: true }))
}

type NoteInlineStyleProperty = 'backgroundColor' | 'color' | 'fontSize'

function getNoteInlineCssProperty(property: NoteInlineStyleProperty) {
  if (property === 'fontSize') return 'font-size'
  if (property === 'backgroundColor') return 'background-color'
  return 'color'
}

function removeNoteInlineStyleFromFragment(
  fragment: DocumentFragment,
  property: NoteInlineStyleProperty,
) {
  const cssProperty = getNoteInlineCssProperty(property)
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT)
  let node = walker.nextNode()

  while (node) {
    const element = node as HTMLElement
    const tagName = element.tagName.toLowerCase()
    if (tagName === 'font') {
      if (property === 'color') {
        element.removeAttribute('color')
      } else if (property === 'fontSize') {
        element.removeAttribute('size')
      }
    } else if (tagName === 'span') {
      element.style.removeProperty(cssProperty)
      if (!element.getAttribute('style')?.trim()) {
        element.removeAttribute('style')
      }
    }
    node = walker.nextNode()
  }
}

function wrapNoteRangeWithStyle(
  range: Range,
  property: NoteInlineStyleProperty,
  nextValue: string,
) {
  if (range.collapsed) return null

  const fragment = range.extractContents()
  removeNoteInlineStyleFromFragment(fragment, property)

  const span = document.createElement('span')
  span.style.setProperty(getNoteInlineCssProperty(property), nextValue)
  span.appendChild(fragment)
  range.insertNode(span)
  return span
}

function setNoteRangeStyle(
  range: Range,
  property: NoteInlineStyleProperty,
  nextValue: string,
) {
  return wrapNoteRangeWithStyle(range, property, nextValue)
}

function clearNoteRangeStyle(range: Range, property: NoteInlineStyleProperty) {
  if (range.collapsed) return null

  const fragment = range.extractContents()
  const insertedNodes = Array.from(fragment.childNodes)
  removeNoteInlineStyleFromFragment(fragment, property)
  if (insertedNodes.length === 0) return null

  range.insertNode(fragment)
  const nextRange = document.createRange()
  nextRange.setStartBefore(insertedNodes[0])
  nextRange.setEndAfter(insertedNodes[insertedNodes.length - 1])
  return nextRange
}

function getFirstSelectedTextNode(range: Range) {
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    return range.startContainer as Text
  }

  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
  )
  let node = walker.nextNode()
  while (node) {
    if (range.intersectsNode(node) && node.textContent?.trim()) {
      return node as Text
    }
    node = walker.nextNode()
  }
  return null
}

function getNoteRangeFontSize(range: Range, editor: HTMLDivElement) {
  const textNode = getFirstSelectedTextNode(range)
  const sourceElement = textNode?.parentElement ?? editor
  return (
    Number.parseFloat(window.getComputedStyle(sourceElement).fontSize) || 12
  )
}

function getNoteFormattingRange(range: Range, editor: HTMLDivElement) {
  if (!range.collapsed) return range

  const wholeNoteRange = document.createRange()
  wholeNoteRange.selectNodeContents(editor)
  return wholeNoteRange
}

function applyNoteInlineStyle(
  property: NoteInlineStyleProperty,
  nextValue: string,
) {
  const selectAllEditors = getSelectAllNoteEditors()
  if (selectAllEditors.length > 0) {
    selectAllEditors.forEach((editor) => {
      const range = document.createRange()
      range.selectNodeContents(editor)
      if (!setNoteRangeStyle(range, property, nextValue)) return
      emitNoteEditorInput(editor)
    })
    return
  }

  const { editor, selection, range } = getActiveNoteEditor()
  if (!editor || !selection || !range) return

  const formattingRange = getNoteFormattingRange(range, editor)
  const span = setNoteRangeStyle(formattingRange, property, nextValue)
  if (!span) return

  const nextRange = document.createRange()
  nextRange.selectNodeContents(span)
  selection.removeAllRanges()
  selection.addRange(nextRange)
  emitNoteEditorInput(editor)
}

function clearNoteInlineStyle(property: NoteInlineStyleProperty) {
  const selectAllEditors = getSelectAllNoteEditors()
  if (selectAllEditors.length > 0) {
    selectAllEditors.forEach((editor) => {
      const range = document.createRange()
      range.selectNodeContents(editor)
      if (range.collapsed) return

      clearNoteRangeStyle(range, property)
      emitNoteEditorInput(editor)
    })
    return
  }

  const { editor, selection, range } = getActiveNoteEditor()
  if (!editor || !selection || !range) return

  const nextRange = clearNoteRangeStyle(
    getNoteFormattingRange(range, editor),
    property,
  )
  if (!nextRange) return

  selection.removeAllRanges()
  selection.addRange(nextRange)
  emitNoteEditorInput(editor)
}

function clearNoteFormatting() {
  const properties: NoteInlineStyleProperty[] = [
    'color',
    'backgroundColor',
    'fontSize',
  ]
  const clearRangeFormatting = (range: Range) => {
    let nextRange: Range | null = range
    for (const property of properties) {
      if (!nextRange) return null
      nextRange = clearNoteRangeStyle(nextRange, property)
    }
    return nextRange
  }

  const selectAllEditors = getSelectAllNoteEditors()
  if (selectAllEditors.length > 0) {
    selectAllEditors.forEach((editor) => {
      const range = document.createRange()
      range.selectNodeContents(editor)
      if (!clearRangeFormatting(range)) return
      emitNoteEditorInput(editor)
    })
    return
  }

  const { editor, selection, range } = getActiveNoteEditor()
  if (!editor || !selection || !range) return

  const nextRange = clearRangeFormatting(getNoteFormattingRange(range, editor))
  if (!nextRange) return

  selection.removeAllRanges()
  selection.addRange(nextRange)
  emitNoteEditorInput(editor)
}

export function resetOperationShareNoteFormatting(round: number) {
  if (typeof document === 'undefined') return

  const editor = document.querySelector<HTMLDivElement>(
    `[data-operation-share-note-editor][data-operation-share-note-round="${round}"]`,
  )
  if (!editor) return

  const properties: NoteInlineStyleProperty[] = [
    'color',
    'backgroundColor',
    'fontSize',
  ]
  const range = document.createRange()
  range.selectNodeContents(editor)

  let nextRange: Range | null = range
  for (const property of properties) {
    if (!nextRange) return
    nextRange = clearNoteRangeStyle(nextRange, property)
  }

  if (!nextRange) return
  emitNoteEditorInput(editor)
}

function applyNoteFontSize(direction: 1 | -1) {
  const selectAllEditors = getSelectAllNoteEditors()
  if (selectAllEditors.length > 0) {
    selectAllEditors.forEach((editor) => {
      const range = document.createRange()
      range.selectNodeContents(editor)
      if (range.collapsed) return

      const currentFontSize = getNoteRangeFontSize(range, editor)
      const nextFontSize = Math.min(
        NOTE_MAX_FONT_SIZE,
        Math.max(
          NOTE_MIN_FONT_SIZE,
          Math.round(currentFontSize) + direction * NOTE_FONT_SIZE_STEP,
        ),
      )

      if (!setNoteRangeStyle(range, 'fontSize', `${nextFontSize}px`)) {
        return
      }
      emitNoteEditorInput(editor)
    })
    return
  }

  const { editor, range } = getActiveNoteEditor()
  if (!editor || !range) return

  const formattingRange = getNoteFormattingRange(range, editor)
  const currentFontSize = getNoteRangeFontSize(formattingRange, editor)
  const nextFontSize = Math.min(
    NOTE_MAX_FONT_SIZE,
    Math.max(
      NOTE_MIN_FONT_SIZE,
      Math.round(currentFontSize) + direction * NOTE_FONT_SIZE_STEP,
    ),
  )
  const span = setNoteRangeStyle(
    formattingRange,
    'fontSize',
    `${nextFontSize}px`,
  )
  if (!span) return

  const nextRange = document.createRange()
  nextRange.selectNodeContents(span)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(nextRange)
  emitNoteEditorInput(editor)
}

export function OperationShareNoteFormatToolbar({
  canRedo,
  canUndo,
  onRedo,
  onUndo,
  runHistoryGroup,
}: {
  canRedo: boolean
  canUndo: boolean
  onRedo: () => void
  onUndo: () => void
  runHistoryGroup: (action: () => void) => void
}) {
  const [allSelected, setAllSelected] = useState(false)

  useEffect(() => {
    const handleSelectAllChange = (event: Event) => {
      setAllSelected(Boolean((event as CustomEvent<boolean>).detail))
    }
    window.addEventListener(NOTE_SELECT_ALL_CHANGE_EVENT, handleSelectAllChange)
    return () => {
      window.removeEventListener(
        NOTE_SELECT_ALL_CHANGE_EVENT,
        handleSelectAllChange,
      )
      setOperationShareNoteSelectAll(false)
    }
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-1">
      <NoteFormatButton
        active={allSelected}
        ariaLabel={allSelected ? '取消全选所有备注' : '全选所有备注'}
        onClick={() => setOperationShareNoteSelectAll(!allSelected)}
        wide
      >
        <span className="inline-flex items-center gap-1 text-[11px] font-medium leading-none">
          <Icon icon={allSelected ? 'tick' : 'selection'} size={11} />
          {allSelected ? '已全选' : '全选'}
        </span>
      </NoteFormatButton>
      <NoteFormatButton
        ariaLabel="撤销"
        disabled={!canUndo}
        onClick={onUndo}
        soft
      >
        <NoteUndoIcon />
      </NoteFormatButton>
      <NoteFormatButton
        ariaLabel="恢复"
        disabled={!canRedo}
        onClick={onRedo}
        soft
      >
        <NoteRedoIcon />
      </NoteFormatButton>
      <span
        aria-hidden="true"
        className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-600"
      />
      <NoteFormatButton
        ariaLabel="恢复原来的字色"
        onClick={() => runHistoryGroup(() => clearNoteInlineStyle('color'))}
      >
        <NoteColorIcon color="#111827" />
      </NoteFormatButton>
      <NoteFormatButton
        ariaLabel="红字"
        onClick={() =>
          runHistoryGroup(() => applyNoteInlineStyle('color', NOTE_COLORS.red))
        }
      >
        <NoteColorIcon color={NOTE_COLORS.red} />
      </NoteFormatButton>
      <NoteFormatButton
        ariaLabel="蓝字"
        onClick={() =>
          runHistoryGroup(() => applyNoteInlineStyle('color', NOTE_COLORS.blue))
        }
      >
        <NoteColorIcon color={NOTE_COLORS.blue} />
      </NoteFormatButton>
      <NoteFormatButton
        ariaLabel="取消背景色"
        onClick={() =>
          runHistoryGroup(() => clearNoteInlineStyle('backgroundColor'))
        }
      >
        <NoteNoHighlightIcon />
      </NoteFormatButton>
      <NoteFormatButton
        ariaLabel="黄色背景"
        onClick={() =>
          runHistoryGroup(() =>
            applyNoteInlineStyle('backgroundColor', NOTE_HIGHLIGHT_COLOR),
          )
        }
      >
        <NoteHighlightIcon />
      </NoteFormatButton>
      <NoteFormatButton
        ariaLabel="放大文字"
        onClick={() => runHistoryGroup(() => applyNoteFontSize(1))}
      >
        <NoteSizeIcon larger />
      </NoteFormatButton>
      <NoteFormatButton
        ariaLabel="缩小文字"
        onClick={() => runHistoryGroup(() => applyNoteFontSize(-1))}
      >
        <NoteSizeIcon larger={false} />
      </NoteFormatButton>
      <span
        aria-hidden="true"
        className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-600"
      />
      <NoteFormatButton
        ariaLabel="恢复默认格式"
        onClick={() => runHistoryGroup(clearNoteFormatting)}
        wide
      >
        <span className="inline-flex items-center gap-1 text-[10px] font-medium leading-none">
          <Icon icon="reset" size={10} />
          恢复默认格式
        </span>
      </NoteFormatButton>
    </div>
  )
}

export function OperationShareNoteEditor({
  ariaLabel,
  className,
  onBlur,
  onChange,
  placeholder,
  revision,
  round,
  value,
}: {
  ariaLabel: string
  className: string
  onBlur?: () => void
  onChange: (value: string) => void
  placeholder: string
  revision: number
  round: number
  value: string
}) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const isEditingRef = useRef(false)
  const revisionRef = useRef(revision)

  const emitChange = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    if (isBlankNoteHtml(editor.innerHTML)) {
      editor.innerHTML = ''
      onChange('')
      return
    }
    const nextValue = editor.innerHTML
    onChange(nextValue)
  }, [onChange])

  useEffect(() => {
    const editor = editorRef.current
    const revisionChanged = revisionRef.current !== revision
    revisionRef.current = revision
    if (!editor || editor.innerHTML === value) return
    if (!revisionChanged && isEditingRef.current) return

    // 作者配置和本地缓存都不可信；只把预览允许的标签与格式放进活动 DOM。
    if (/<[a-z][\s\S]*>/i.test(value)) {
      const template = document.createElement('template')
      template.innerHTML = value
      editor.replaceChildren(
        ...createSafeNoteNodes(template.content.childNodes),
      )
    } else {
      editor.textContent = value
    }
    if (!revisionChanged || document.activeElement !== editor) return

    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [revision, value])

  return (
    <div className="min-w-0">
      <div
        aria-label={ariaLabel}
        aria-multiline="true"
        className={`${className} empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] dark:empty:before:text-slate-500`}
        contentEditable
        data-operation-share-note-editor
        data-operation-share-note-round={round}
        data-placeholder={placeholder}
        onBlur={() => {
          isEditingRef.current = false
          emitChange()
          onBlur?.()
        }}
        onFocus={() => {
          isEditingRef.current = true
          if (
            editorRef.current?.dataset.operationShareNoteSelectAll === 'true'
          ) {
            setOperationShareNoteSelectAll(false)
          }
        }}
        onInput={emitChange}
        onDrop={(event) => event.preventDefault()}
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData.getData('text/plain')
          if (!text) return

          const selection = window.getSelection()
          if (!selection || selection.rangeCount === 0) return
          const range = selection.getRangeAt(0)
          range.deleteContents()
          const textNode = document.createTextNode(text)
          range.insertNode(textNode)
          range.setStartAfter(textNode)
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)
          emitChange()
        }}
        ref={editorRef}
        role="textbox"
        tabIndex={0}
        suppressContentEditableWarning
      />
    </div>
  )
}

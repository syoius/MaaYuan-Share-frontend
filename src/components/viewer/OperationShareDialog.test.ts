import { getDefaultStore } from 'jotai'
import { CopilotInfoStatusEnum } from 'maa-copilot-client'
import { act, createElement } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { getOperationShareImageConfigs } from '../../apis/operation-share-image-config'
import cnTranslations from '../../i18n/generated/cn'
import { rawTranslationsAtom } from '../../i18n/i18n'
import { CopilotDocV1 } from '../../models/copilot.schema'
import type { Operation } from '../../models/operation'
import OperationShareDialog from './OperationShareDialog'
import {
  createOperationShareQrDataUrl,
  renderOperationShareCardBlob,
} from './operationShareImage'
import {
  readOperationShareCardConfig,
  readOperationShareShortCode,
} from './operationShareModel'

vi.mock('../../apis/operation-share-image-config', () => ({
  getOperationShareImageConfigs: vi.fn(),
  updateOperationShareImageConfig: vi.fn(),
}))

vi.mock('./operationShareImage', () => ({
  createOperationShareQrDataUrl: vi.fn(),
  renderOperationShareCardBlob: vi.fn(),
}))

const mockedGetConfigs = vi.mocked(getOperationShareImageConfigs)
const mockedCreateQr = vi.mocked(createOperationShareQrDataUrl)
const mockedRenderCard = vi.mocked(renderOperationShareCardBlob)
const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}

function createOperation(
  status: CopilotInfoStatusEnum,
  metadata?: Operation['metadata'],
  actions: Array<Record<string, unknown>> = [],
) {
  return {
    id: 100,
    uploader: '测试作者',
    uploaderId: 'user-1',
    status,
    metadata,
    preLevel: { name: '测试关卡' },
    parsedContent: {
      doc: { title: '测试作业', details: '' },
      stageName: '1-1',
      opers: [],
      groups: [],
      actions,
    },
  } as unknown as Operation
}

const singleRoundActions = [
  {
    type: CopilotDocV1.Type.Skill,
    name: '测试密探',
    doc: '第1回合·动作1：测试密探 A [1普]',
  },
]

const multiActionRoundActions = [
  {
    type: CopilotDocV1.Type.Skill,
    name: '测试密探',
    doc: '第1回合·动作1：测试密探 A [1普]',
  },
  {
    type: CopilotDocV1.Type.Skill,
    name: '测试密探',
    doc: '第1回合·动作2：测试密探 ↑ [1大]',
  },
]

/** Blueprint 把 label 文本和 input 放在同一个 <label> 里，按文案定位开关。 */
function findSwitch(labelText: string) {
  const labels = Array.from(document.querySelectorAll('label'))
  for (const label of labels) {
    if (!label.textContent?.includes(labelText)) continue
    const input = label.querySelector('input[type="checkbox"]')
    if (input) return input as HTMLInputElement
  }
  return undefined
}

/** 调色板色块通过 aria-label 定位，例如「应用黄色（有底纹）」。 */
function findSwatch(labelText: string) {
  return Array.from(document.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === labelText,
  ) as HTMLButtonElement | undefined
}

function findButton(labelText: string) {
  return Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === labelText,
  ) as HTMLButtonElement | undefined
}

function findButtonByAriaLabelPrefix(labelText: string) {
  return Array.from(document.querySelectorAll('button')).find((button) =>
    button.getAttribute('aria-label')?.startsWith(labelText),
  ) as HTMLButtonElement | undefined
}

/** 配色网格里的单元格勾选框：Blueprint Checkbox 只有 aria-label，没有可见文案。 */
function findCheckbox(ariaLabel: string) {
  return Array.from(document.querySelectorAll('input[type="checkbox"]')).find(
    (input) => input.getAttribute('aria-label') === ariaLabel,
  ) as HTMLInputElement | undefined
}

describe('operation share dialog short code switch', () => {
  let container: HTMLDivElement
  let root: Root

  beforeAll(() => {
    getDefaultStore().set(rawTranslationsAtom, {
      language: 'cn',
      data: cnTranslations,
    })
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  })

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  })

  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    mockedGetConfigs.mockResolvedValue([])
    mockedCreateQr.mockResolvedValue('data:image/png;base64,qr-code')
    mockedRenderCard.mockResolvedValue(new Blob(['share-image']))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const renderDialog = async (operation: Operation) => {
    await act(async () => {
      root.render(
        createElement(OperationShareDialog, {
          canManageAuthorConfig: true,
          operation,
          onClose: vi.fn(),
        }),
      )
      await new Promise((resolve) => window.setTimeout(resolve, 20))
    })
  }

  it('turns the short code off by default for private operations', async () => {
    await renderDialog(createOperation(CopilotInfoStatusEnum.Private))

    expect(findSwitch('分享神秘代码')?.checked).toBe(false)
    // 默认值来自作业可见性，不应写进本地缓存
    expect(readOperationShareShortCode(100)).toBeUndefined()
  })

  it('keeps the short code on by default for public operations', async () => {
    await renderDialog(createOperation(CopilotInfoStatusEnum.Public))

    expect(findSwitch('分享神秘代码')?.checked).toBe(true)
    expect(readOperationShareShortCode(100)).toBeUndefined()
  })

  it('persists an explicit short code choice', async () => {
    await renderDialog(createOperation(CopilotInfoStatusEnum.Private))

    await act(async () => {
      findSwitch('分享神秘代码')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(findSwitch('分享神秘代码')?.checked).toBe(true)
    expect(readOperationShareShortCode(100)).toBe(true)
  })

  it('disables the in-site QR code once the short code is hidden', async () => {
    await renderDialog(createOperation(CopilotInfoStatusEnum.Private))

    const qrSwitch = findSwitch('分享二维码')
    expect(qrSwitch?.checked).toBe(false)
    expect(qrSwitch?.disabled).toBe(true)
  })

  it('keeps the QR code switch usable when it points to an external repost', async () => {
    await renderDialog(
      createOperation(CopilotInfoStatusEnum.Private, {
        sourceType: 'repost',
        repostUrl: 'https://www.bilibili.com/read/cv29533',
      }),
    )

    expect(findSwitch('分享神秘代码')?.checked).toBe(false)
    expect(findSwitch('分享二维码')?.disabled).toBe(false)
  })

  it('uses the same action color swatches in cell shortcut mode', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    expect(findSwatch('应用黄色')).toBeDefined()
    expect(findSwatch('应用粉色')).toBeDefined()
    expect(findSwatch('应用蓝色')).toBeDefined()
    expect(findSwatch('应用绿色')).toBeDefined()
    expect(findSwatch('应用无操作色')).toBeDefined()
    expect(findSwatch('应用无操作色')?.style.backgroundColor).not.toBe('')
    const noneNoteInput = document.querySelector(
      'input[aria-label="无色敌方名称备注"]',
    ) as HTMLInputElement | null

    expect(noneNoteInput).not.toBeNull()
    expect(noneNoteInput?.value).toBe('')
    expect(findSwatch('应用黄色（有底纹）')).toBeUndefined()
    expect(
      Array.from(
        document.querySelectorAll(
          '[role="group"][aria-label="动作文字颜色"] button',
        ),
      ).map((button) => button.getAttribute('aria-label')),
    ).toEqual(['应用无操作色', '应用粉色', '应用蓝色', '应用黄色', '应用绿色'])

    await act(async () => {
      findButtonByAriaLabelPrefix('按单元格标色')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(findSwitch('增加底纹')).toBeUndefined()
    expect(
      Array.from(
        document.querySelectorAll(
          '[role="group"][aria-label="动作文字颜色"] button',
        ),
      ).map((button) => button.getAttribute('aria-label')),
    ).toEqual(['应用无操作色', '应用粉色', '应用蓝色', '应用黄色', '应用绿色'])
  })

  it('clears an action color when the no-color swatch is applied', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    const actionButton = findButtonByAriaLabelPrefix('1 回合')
    expect(actionButton).not.toBeNull()

    await act(async () => {
      actionButton?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    await act(async () => {
      findSwatch('应用粉色')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(readOperationShareCardConfig(100)?.actionColors).toEqual({
      '1:1': 'pink',
    })

    await act(async () => {
      actionButton?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    await act(async () => {
      findSwatch('应用无操作色')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(readOperationShareCardConfig(100)?.actionColors).toEqual({})
  })

  it('edits the action color notes used by the generated share image', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    const pinkNoteInput = document.querySelector(
      'input[aria-label="粉色敌方名称备注"]',
    ) as HTMLInputElement | null

    expect(pinkNoteInput).not.toBeNull()
    expect(pinkNoteInput?.value).toBe('')
    expect(pinkNoteInput?.placeholder).toBe('1号敌人')

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      valueSetter?.call(pinkNoteInput, '粉色表示关键操作')
      pinkNoteInput?.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(readOperationShareCardConfig(100)?.actionColorNotes).toEqual({
      pink: '粉色表示关键操作',
    })
  })

  it('applies the chosen color to every action in the selected cell', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        multiActionRoundActions,
      ),
    )

    await act(async () => {
      findButtonByAriaLabelPrefix('按单元格标色')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    await act(async () => {
      findButtonByAriaLabelPrefix('1 回合 1 号位')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    await act(async () => {
      findSwatch('应用黄色')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(readOperationShareCardConfig(100)?.actionColors).toEqual({
      '1:1': 'yellow',
      '1:2': 'yellow',
    })
    expect(readOperationShareCardConfig(100)?.cellColors).toEqual({})
  })

  it('selects every action from the round header', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    await act(async () => {
      findCheckbox('选择整个表格')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(
      findButtonByAriaLabelPrefix('1 回合 1 号位')?.getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')
    expect(document.body.textContent).toContain('取消选择（1）')

    await act(async () => {
      findCheckbox('选择整个表格')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(
      findButtonByAriaLabelPrefix('1 回合 1 号位')?.getAttribute(
        'aria-pressed',
      ),
    ).toBe('false')
    expect(document.body.textContent).toContain('取消选择（0）')
  })

  it('switches between color and note modes in the same table', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    const colorNoteInput = document.querySelector(
      '[contenteditable][aria-label="1 回合备注"]',
    ) as HTMLDivElement | null

    expect(colorNoteInput).not.toBeNull()
    expect(findSwatch('应用黄色')).toBeDefined()
    expect(findButtonByAriaLabelPrefix('填入备注')).toBeUndefined()
    expect(findButtonByAriaLabelPrefix('从备注移除')).toBeUndefined()

    await act(async () => {
      if (colorNoteInput) colorNoteInput.textContent = '标注模式下编辑备注'
      colorNoteInput?.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(readOperationShareCardConfig(100)?.roundNoteOverrides).toEqual({
      1: '标注模式下编辑备注',
    })

    await act(async () => {
      findButton('备注模式')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    const noteInput = document.querySelector(
      '[contenteditable][aria-label="1 回合备注"]',
    ) as HTMLDivElement | null
    const noteCell = noteInput?.closest('td')
    const noteTable = noteCell?.closest('table')
    const noteColumn = noteTable?.querySelector('colgroup col:last-child')

    expect(noteInput).not.toBeNull()
    expect(noteTable).not.toBeNull()
    expect(noteTable?.getAttribute('data-edit-mode')).toBe('note')
    expect(
      noteColumn instanceof HTMLElement ? noteColumn.style.width : undefined,
    ).toBe('56%')
    expect(noteCell).toBe(noteCell?.parentElement?.lastElementChild)
    expect(document.body.textContent).not.toContain('回合备注（可直接编辑）')
    expect(findSwatch('应用黄色')).toBeUndefined()
    expect(findButtonByAriaLabelPrefix('按操作标色')).toBeUndefined()
    expect(findButtonByAriaLabelPrefix('按单元格标色')).toBeUndefined()

    await act(async () => {
      if (noteInput) noteInput.textContent = '3A 后检测退场'
      noteInput?.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(readOperationShareCardConfig(100)?.roundNoteOverrides).toEqual({
      1: '3A 后检测退场',
    })

    await act(async () => {
      findButton('标注模式')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    const colorNoteInputAfterSwitch = document.querySelector(
      '[contenteditable][aria-label="1 回合备注"]',
    ) as HTMLDivElement | null

    expect(colorNoteInputAfterSwitch).not.toBeNull()
    expect(colorNoteInputAfterSwitch?.textContent).toBe('3A 后检测退场')
    expect(findSwatch('应用黄色')).toBeDefined()
    expect(findButtonByAriaLabelPrefix('按操作标色')).toBeDefined()
    expect(findButtonByAriaLabelPrefix('按单元格标色')).toBeDefined()
    expect(findButtonByAriaLabelPrefix('填入备注')).toBeUndefined()
    expect(findButtonByAriaLabelPrefix('从备注移除')).toBeUndefined()

    const colorTable = document.querySelector('table[data-edit-mode="color"]')
    const colorNoteColumn = colorTable?.querySelector('colgroup col:last-child')
    expect(colorTable).not.toBeNull()
    expect(
      colorNoteColumn instanceof HTMLElement
        ? colorNoteColumn.style.width
        : undefined,
    ).toBe('16%')
  })

  it('only shows annotation mode after the note column is hidden', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    expect(findButton('标注模式')).toBeDefined()
    expect(findButton('备注模式')).toBeDefined()

    await act(async () => {
      findSwitch('显示备注与其他动作')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(findButton('标注模式')).toBeDefined()
    expect(findButton('备注模式')).toBeUndefined()
    expect(
      document
        .querySelector('table[data-edit-mode="color"]')
        ?.querySelector('textarea[placeholder="修改本回合备注"]'),
    ).toBeNull()
  })

  it('persists a custom table color', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    const colorInput = document.querySelector(
      'input[type="color"][aria-label="选择表格主题色"]',
    ) as HTMLInputElement

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      valueSetter?.call(colorInput, '#336699')
      colorInput.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(readOperationShareCardConfig(100)?.tableColor).toBe('#336699')
    expect(document.body.textContent).toContain('当前：自定义 #336699')
  })

  it('applies a preset table theme without changing action cell colors', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    await act(async () => {
      findSwatch('应用蓝色表格配色')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(readOperationShareCardConfig(100)?.tableColor).toBe('#4d6fa8')
    expect(readOperationShareCardConfig(100)?.cellColors).toEqual({})
  })

  it('resets to the native table theme preset', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    await act(async () => {
      findSwatch('应用紫色表格配色')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    await act(async () => {
      findSwatch('应用原生表格配色')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(readOperationShareCardConfig(100)?.tableColor).toBeUndefined()
  })

  it('keeps the advanced table theme controls collapsed by default', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    expect(findSwatch('展开高级自定义')?.getAttribute('aria-expanded')).toBe(
      'false',
    )
    expect(
      document.querySelector('input[type="color"][aria-label="图片背景颜色"]'),
    ).toBeNull()
    expect(document.body.textContent).toContain('当前：原生')

    await act(async () => {
      findSwatch('展开高级自定义')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(findSwatch('收起高级自定义')?.getAttribute('aria-expanded')).toBe(
      'true',
    )
    expect(
      document.querySelector('input[type="color"][aria-label="图片背景颜色"]'),
    ).toBeDefined()
  })

  it('persists an individual table color override', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    await act(async () => {
      findSwatch('展开高级自定义')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    const colorInput = document.querySelector(
      'input[type="color"][aria-label="图片背景颜色"]',
    ) as HTMLInputElement

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      valueSetter?.call(colorInput, '#fefefd')
      colorInput.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(
      readOperationShareCardConfig(100)?.tableThemeOverrides?.pageBackground,
    ).toBe('#fefefd')
    expect(document.body.textContent).toContain(
      '自定义（基于原生，已修改 1 项）',
    )
  })

  it('restores the preset and clears every table theme override', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    await act(async () => {
      findSwatch('应用蓝色表格配色')?.click()
      findSwatch('展开高级自定义')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    const colorInput = document.querySelector(
      'input[type="color"][aria-label="图片背景颜色"]',
    ) as HTMLInputElement

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      valueSetter?.call(colorInput, '#fefefd')
      colorInput.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(readOperationShareCardConfig(100)?.tableColor).toBe('#4d6fa8')
    expect(
      readOperationShareCardConfig(100)?.tableThemeOverrides?.pageBackground,
    ).toBe('#fefefd')

    await act(async () => {
      findSwatch('恢复预设表格配色')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(readOperationShareCardConfig(100)?.tableColor).toBeUndefined()
    expect(
      readOperationShareCardConfig(100)?.tableThemeOverrides,
    ).toBeUndefined()
    expect(document.body.textContent).toContain('当前：原生')
    expect(findSwatch('展开高级自定义')).toBeDefined()
  })
})

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

  it('offers one swatch per color plus an 增加底纹 switch', async () => {
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
    expect(findSwatch('应用冰灰')).toBeDefined()
    expect(findSwatch('应用黄色（有底纹）')).toBeUndefined()

    // 底纹是全局开关，默认打开
    expect(findSwitch('增加底纹')?.checked).toBe(true)
  })

  it('applies the chosen color to the selected cell', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    await act(async () => {
      findCheckbox('1 回合 1 号位')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    await act(async () => {
      findSwatch('应用黄色')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(readOperationShareCardConfig(100)?.cellColors).toEqual({
      '1:slot-1': 'yellow',
    })
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

  it('toggles the cell pattern switch and persists it', async () => {
    await renderDialog(
      createOperation(
        CopilotInfoStatusEnum.Public,
        undefined,
        singleRoundActions,
      ),
    )

    await act(async () => {
      findSwitch('增加底纹')?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(findSwitch('增加底纹')?.checked).toBe(false)
    expect(readOperationShareCardConfig(100)?.showCellPattern).toBe(false)
  })
})

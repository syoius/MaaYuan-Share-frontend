import { act, createElement } from 'react'
import { Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { OPERATORS } from '../../../models/operator'
import { YuanHubOperatorImport } from './YuanHubOperatorImport'

const mocks = vi.hoisted(() => ({
  userId: 'owner',
  accounts: vi.fn(),
  training: vi.fn(),
  setSettings: vi.fn(),
  presets: vi.fn(),
  savePreset: vi.fn(),
  settings: { token: 'ymatch_' + 'a'.repeat(32), enabled: false },
}))
vi.mock('../../../apis/yuanhub', () => ({
  readYuanHubAccounts: mocks.accounts,
  readYuanHubTraining: mocks.training,
}))
vi.mock('../../../apis/yuanhub-team-preset', () => ({
  readYuanHubTeamPresets: mocks.presets,
  saveYuanHubTeamPreset: mocks.savePreset,
}))
vi.mock('../../../store/operatorMatcher', () => ({
  useOperatorMatcher: () => ({
    userId: mocks.userId,
    settings: mocks.settings,
    setSettings: mocks.setSettings,
  }),
}))
vi.mock('../../../utils/error', () => ({
  formatError: (error: Error) => error.message,
}))
let root: Root
let container: HTMLDivElement
const button = (label: string) =>
  Array.from(document.querySelectorAll('button')).find(
    (item) => item.textContent === label,
  )!
const snapshot = {
  connectionId: 'c',
  accountId: 'a',
  game: '如鸢',
  accountName: '大号',
  syncedAt: '2026-11-06T00:00:00Z',
  operators: [
    {
      id: OPERATORS[0].id,
      owned: true,
      level: 100,
      elite: 17,
      stars: 5,
      attack: 1,
      hp: 2,
      loadouts: [],
    },
  ],
}
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  mocks.userId = 'owner'
  mocks.presets.mockReset().mockResolvedValue([])
  mocks.savePreset.mockReset()
  mocks.setSettings.mockReset()
  mocks.accounts.mockResolvedValue({
    connectionId: 'c',
    accounts: [
      { id: 'a', name: '大号', game: '如鸢' },
      { id: 'b', name: '小号', game: '代号鸢' },
    ],
  })
  mocks.training.mockResolvedValue(snapshot)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})
const open = async (apply = vi.fn(), groupCount = 0) => {
  await act(async () =>
    root.render(
      createElement(YuanHubOperatorImport, {
        currentOperators: [],
        groupCount,
        onApply: apply,
      }),
    ),
  )
  await act(async () => button('从 YuanHub 导入').click())
  return apply
}
it('shows an empty preset state without manual import controls', async () => {
  const apply = await open()
  expect(document.body.textContent).toContain('暂无阵容预设')
  expect(document.body.textContent).not.toContain('手动选择（不使用预设）')
  expect(document.querySelector('input[type="checkbox"]')).toBeNull()
  expect(document.querySelector('input[placeholder="搜索密探名称"]')).toBeNull()
  expect(button('追加所选密探')).toBeUndefined()
  expect(button('新建预设').disabled).toBe(false)
  expect(apply).not.toHaveBeenCalled()
  expect(mocks.setSettings).not.toHaveBeenCalled()
})
it('switching game accounts aborts the pending roster and ignores a late response', async () => {
  let resolve!: (value: typeof snapshot) => void
  mocks.training.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const apply = await open()
  mocks.training.mockReturnValue(new Promise(() => {}))
  const signal = mocks.training.mock.calls.at(-1)![2] as AbortSignal
  const select = document.querySelector<HTMLSelectElement>('select')!
  await act(async () => {
    select.value = 'b'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(signal.aborted).toBe(true)
  await act(async () => resolve(snapshot))
  expect(document.querySelector('input[type="checkbox"]')).toBeNull()
  expect(apply).not.toHaveBeenCalled()
})
it('changing the site user clears the previous training and aborts in-flight reads', async () => {
  const apply = await open()
  const signal = mocks.training.mock.calls.at(-1)![2] as AbortSignal
  mocks.userId = 'other'
  mocks.training.mockReturnValue(new Promise(() => {}))
  await act(async () =>
    root.render(
      createElement(YuanHubOperatorImport, {
        currentOperators: [],
        groupCount: 0,
        onApply: apply,
      }),
    ),
  )
  expect(signal.aborted).toBe(true)
  expect(document.querySelector('input[type="checkbox"]')).toBeNull()
  expect(apply).not.toHaveBeenCalled()
})
it('failed roster reads leave the current draft untouched', async () => {
  mocks.training.mockRejectedValue(new Error('连接已撤销'))
  const apply = await open()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    '连接已撤销',
  )
  expect(apply).not.toHaveBeenCalled()
})

const fiveSnapshot = () => ({
  ...snapshot,
  operators: OPERATORS.slice(0, 5).map((op) => ({
    ...snapshot.operators[0],
    id: op.id,
    loadouts: [
      {
        id: 'first',
        name: '命盘一',
        discs: op.discs.slice(0, 1).map((d) => d.ot_name),
      },
      {
        id: 'second',
        name: '命盘二',
        discs: op.discs.slice(1, 2).map((d) => d.ot_name),
      },
    ],
  })),
})
const savedPreset = () => ({
  id: 'preset',
  connectionId: 'c',
  accountId: 'a',
  game: '如鸢',
  label: '推图',
  version: 2,
  members: OPERATORS.slice(0, 5).map((op) => ({
    operatorId: op.id,
    loadoutId: 'second',
  })),
})
const changeSelect = async (selector: string, value: string) => {
  const select = document.querySelector<HTMLSelectElement>(selector)!
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
const changeInput = async (selector: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(selector)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
it('saves exactly five members with separate loadouts to the active account and reuses the cloud result', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.savePreset.mockImplementation(async (_owner, req) => ({
    ...req,
    id: 'new',
    version: 0,
  }))
  await open()
  await act(async () => button('新建预设').click())
  await changeInput('input[placeholder="例如：日常推图"]', '常用')
  expect(button('保存预设').disabled).toBe(true)
  for (const op of OPERATORS.slice(0, 5)) {
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          `button[aria-label="添加${op.name}"]`,
        )!
        .click(),
    )
  }
  expect(document.querySelectorAll('.yuanhub-member-card')).toHaveLength(5)
  expect(
    document.querySelectorAll('.yuanhub-member-card input[type="radio"]'),
  ).toHaveLength(10)
  expect(document.body.textContent).not.toContain('命盘3')
  await act(async () =>
    document
      .querySelector<HTMLInputElement>(
        `input[aria-label="${OPERATORS[0].name}的命盘2"]`,
      )!
      .click(),
  )
  expect(button('保存预设').disabled).toBe(false)
  await act(async () => button('保存预设').click())
  expect(mocks.savePreset).toHaveBeenCalledWith(
    'owner',
    expect.objectContaining({
      connectionId: 'c',
      accountId: 'a',
      game: '如鸢',
      label: '常用',
      members: OPERATORS.slice(0, 5).map((op, i) => ({
        operatorId: op.id,
        loadoutId: i === 0 ? 'second' : 'first',
      })),
    }),
    expect.any(AbortSignal),
  )
  expect(document.body.textContent).toContain('预设已保存到云端')
  expect(document.body.textContent).toContain('常用')
  expect(mocks.setSettings).not.toHaveBeenCalled()
})
it('loads a cloud preset on reopening and applies selected loadouts with replace mode', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.presets.mockResolvedValue([savedPreset()])
  const apply = await open()
  await act(async () => button('应用预设到当前作业').click())
  expect(apply).toHaveBeenCalledWith(
    OPERATORS.slice(0, 5).map((op) =>
      expect.objectContaining({
        name: op.name,
        discsSelected: [op.discs.length > 1 ? 2 : 0, 0, 0],
      }),
    ),
    'replace',
  )
  await act(async () => button('从 YuanHub 导入').click())
  expect(mocks.presets).toHaveBeenCalledTimes(2)
  expect(document.body.textContent).toContain('推图')
})
it('keeps edits visible after cloud save failure without displaying success', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.presets.mockResolvedValue([savedPreset()])
  mocks.savePreset.mockRejectedValue(
    new Error('预设已在其他设备修改，请刷新后重试'),
  )
  await open()
  await act(async () => button('编辑阵容与命盘').click())
  await changeInput('input[placeholder="例如：日常推图"]', '修改未保存')
  await act(async () => button('保存预设').click())
  expect(document.body.textContent).toContain('其他设备修改')
  expect(
    document.querySelector<HTMLInputElement>(
      'input[placeholder="例如：日常推图"]',
    )!.value,
  ).toBe('修改未保存')
  expect(document.body.textContent).not.toContain('预设已保存到云端')
  expect(mocks.savePreset.mock.calls[0][1]).toMatchObject({
    id: 'preset',
    version: 2,
  })
})
it('blocks applying a preset with a deleted loadout instead of silently substituting the first one', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  const preset = savedPreset()
  preset.members[0].loadoutId = 'deleted'
  mocks.presets.mockResolvedValue([preset])
  await open()
  expect(document.body.textContent).toContain('原命盘方案已不存在')
  expect(button('应用预设到当前作业').disabled).toBe(true)
})
it('clears cloud presets on account switch and rejects late responses from the previous account', async () => {
  let resolve!: (value: ReturnType<typeof savedPreset>[]) => void
  mocks.presets
    .mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    .mockResolvedValue([])
  await open()
  const signal = mocks.presets.mock.calls[0][2] as AbortSignal
  mocks.training.mockResolvedValue({
    ...fiveSnapshot(),
    accountId: 'b',
    accountName: '小号',
    game: '代号鸢',
  })
  await changeSelect('select[id$="-account"]', 'b')
  await act(async () => resolve([savedPreset()]))
  expect(signal.aborted).toBe(true)
  expect(document.body.textContent).not.toContain('推图')
  expect(mocks.presets.mock.calls.at(-1)![1]).toMatchObject({
    accountId: 'b',
    game: '代号鸢',
  })
})
it('shows cloud errors without falling back to manual import and supports retry', async () => {
  mocks.presets.mockRejectedValue(new Error('本站后端尚未部署云端阵容预设接口'))
  const apply = await open()
  expect(document.body.textContent).toContain('尚未部署')
  expect(document.body.textContent).not.toContain('暂无阵容预设')
  expect(document.querySelector('input[type="checkbox"]')).toBeNull()
  expect(button('追加所选密探')).toBeUndefined()
  expect(apply).not.toHaveBeenCalled()
  mocks.presets.mockResolvedValue([])
  await act(async () => button('重试同步预设').click())
  expect(document.body.textContent).toContain('暂无阵容预设')
  expect(document.body.textContent).not.toContain('尚未部署')
})

it('shows missing training and real star slots without fabricated values, and removes a card', async () => {
  const training = fiveSnapshot()
  mocks.training.mockResolvedValue({
    ...training,
    operators: training.operators.map((op, index) =>
      index === 0
        ? {
            ...op,
            attack: undefined,
            hp: 0,
            loadouts: [],
            starSlots: {
              main1: '天府',
              main2: '天府',
              main3: null,
              support1: null,
              support2: null,
              support3: null,
            },
          }
        : op,
    ),
  })
  mocks.presets.mockResolvedValue([savedPreset()])
  await open()
  await act(async () => button('编辑阵容与命盘').click())
  const card = document.querySelector('.yuanhub-member-card')!
  expect(card.querySelectorAll('.yuanhub-star-slot')).toHaveLength(6)
  expect(
    card.querySelectorAll('.yuanhub-star-slot strong')[0].textContent,
  ).toBe('天府')
  expect(
    card.querySelectorAll('.yuanhub-star-slot strong')[1].textContent,
  ).toBe('天府')
  expect(
    card.querySelectorAll('.yuanhub-star-slot strong')[2].textContent,
  ).toBe('空槽')
  expect(
    Array.from(card.querySelectorAll('dd')).map((el) => el.textContent),
  ).toEqual(['100', '未知', '17', '0'])
  expect(
    Array.from(
      card.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ).every((input) => input.disabled),
  ).toBe(true)
  expect(button('保存预设').disabled).toBe(true)
  await act(async () => button('清除命盘选择').click())
  expect(button('保存预设').disabled).toBe(false)
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        `button[aria-label="移除${OPERATORS[0].name}"]`,
      )!
      .click(),
  )
  expect(document.querySelectorAll('.yuanhub-member-card')).toHaveLength(4)
  expect(button('保存预设').disabled).toBe(true)
  expect(document.body.textContent).toContain('还需添加 1 位密探')
  await act(async () => button('添加密探').click())
  expect(document.activeElement).toBe(
    document.querySelector('input[placeholder="搜索密探名称"]'),
  )
})

it('keeps connection and preset controls in one body with a separate footer and read-only preview', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.presets.mockResolvedValue([savedPreset()])
  await open()
  const bodies = document.querySelectorAll('.bp4-dialog-body')
  expect(bodies).toHaveLength(1)
  const body = bodies[0]
  expect(body.querySelector('select[id$="-account"]')).not.toBeNull()
  expect(body.querySelector('select[id$="-preset"]')).not.toBeNull()
  expect(body.querySelector('.matcher-footer')).toBeNull()
  expect(body.querySelector('input[type="radio"]')).toBeNull()
  expect(body.querySelectorAll('.yuanhub-selected-loadout')).toHaveLength(5)
  expect(
    body.querySelectorAll('details:not([open]) .yuanhub-member-stones'),
  ).toHaveLength(5)
  expect(body.textContent).not.toContain('导入方式')
  expect(body.querySelector('select[id$="-mode"]')).toBeNull()
  await act(async () => button('编辑阵容与命盘').click())
  expect(document.querySelectorAll('.bp4-dialog-body')).toHaveLength(1)
  expect(document.querySelector('select[id$="-account"]')).toBeNull()
  expect(document.querySelectorAll('input[type="radio"]')).toHaveLength(10)
})
it('explains capacity and invalid loadout blockers next to the apply button', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.presets.mockResolvedValue([savedPreset()])
  const apply = await open(vi.fn(), 1)
  const applyButton = button('应用预设到当前作业')
  expect(applyButton.disabled).toBe(true)
  const reason = document.getElementById(
    applyButton.getAttribute('aria-describedby')!,
  )!
  expect(reason.closest('.matcher-footer')).not.toBeNull()
  expect(reason.textContent).toContain('不能超过 5 个位置')
  expect(applyButton.disabled).toBe(true)
  expect(apply).not.toHaveBeenCalled()
  const preset = savedPreset()
  preset.members[0].loadoutId = 'deleted'
  mocks.presets.mockResolvedValue([preset])
  await act(async () => button('刷新预设').click())
  expect(document.querySelector('.matcher-footer')!.textContent).toContain(
    '原命盘方案已不存在',
  )
  expect(applyButton.disabled).toBe(true)
})

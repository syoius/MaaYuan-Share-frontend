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
  settings: { token: 'ymatch_' + 'a'.repeat(32), enabled: false },
}))
vi.mock('../../../apis/yuanhub', () => ({
  readYuanHubAccounts: mocks.accounts,
  readYuanHubTraining: mocks.training,
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
const open = async (apply = vi.fn()) => {
  await act(async () =>
    root.render(
      createElement(YuanHubOperatorImport, {
        currentOperators: [],
        groupCount: 0,
        onApply: apply,
      }),
    ),
  )
  await act(async () => button('从 YuanHub 导入').click())
  await act(async () => button('读取游戏账号').click())
  return apply
}
it('imports selected training while matching is disabled without changing matcher settings', async () => {
  const apply = await open()
  await act(async () => button('读取养成档案').click())
  expect(apply).not.toHaveBeenCalled()
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  )
  await act(async () => button('追加所选密探').click())
  expect(apply).toHaveBeenCalledWith(
    [expect.objectContaining({ name: OPERATORS[0].name, attack: 1, hp: 2 })],
    'append',
  )
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
  await act(async () => button('读取养成档案').click())
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
  await act(async () => button('读取养成档案').click())
  const signal = mocks.training.mock.calls.at(-1)![2] as AbortSignal
  mocks.userId = 'other'
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
  await act(async () => button('读取养成档案').click())
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    '连接已撤销',
  )
  expect(apply).not.toHaveBeenCalled()
})

it('changes the actual loadout before applying without merging its alternatives', async () => {
  mocks.training.mockResolvedValue({
    ...snapshot,
    operators: [
      {
        ...snapshot.operators[0],
        loadouts: [
          { id: 'one', name: '一盘', discs: [OPERATORS[0].discs[0].ot_name] },
          { id: 'two', name: '二盘', discs: [OPERATORS[0].discs[1].ot_name] },
        ],
      },
    ],
  })
  const apply = await open()
  await act(async () => button('读取养成档案').click())
  const select = Array.from(document.querySelectorAll('select')).find((item) =>
    item.querySelector('option[value="two"]'),
  )!
  await act(async () => {
    select.value = 'two'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  )
  await act(async () => button('追加所选密探').click())
  expect(apply).toHaveBeenCalledWith(
    [expect.objectContaining({ discsSelected: [2, 0, 0] })],
    'append',
  )
})

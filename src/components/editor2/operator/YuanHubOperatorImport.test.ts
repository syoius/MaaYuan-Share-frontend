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
  vi.spyOn(window, 'confirm').mockReturnValue(true)
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
  vi.restoreAllMocks()
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
const viewMember = async (index: number) => {
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        `button[aria-label="查看${OPERATORS[index].name}"]`,
      )!
      .click(),
  )
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
  expect(document.querySelectorAll('.yuanhub-member-select')).toHaveLength(5)
  expect(document.querySelectorAll('.yuanhub-member-card')).toHaveLength(1)
  expect(
    document.querySelectorAll('.yuanhub-member-card input[type="radio"]'),
  ).toHaveLength(2)
  await viewMember(0)
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
  await act(async () => button('应用到当前作业').click())
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
it.each([
  ['complete', 1, false],
  ['zero', 0, false],
  ['missing', undefined, true],
] as const)(
  'shows the attribute hint only when needed (%s)',
  async (_case, attack, missing) => {
    const training = fiveSnapshot()
    mocks.training.mockResolvedValue({
      ...training,
      operators: training.operators.map((op) => ({ ...op, attack })),
    })
    mocks.presets.mockResolvedValue([savedPreset()])
    await open()
    expect(!!document.querySelector('.yuanhub-missing-attributes')).toBe(
      missing,
    )
    if (missing) {
      expect(
        document.querySelector('.yuanhub-missing-attributes')?.textContent,
      ).toContain('5 名成员')
    }
    const members = document.querySelector('.yuanhub-member-detail')!
    expect(members.querySelectorAll('details')).toHaveLength(1)
    expect(
      Array.from(document.querySelectorAll('.yuanhub-roster-status')).every(
        (status) => status.textContent === (missing ? '待补填' : '已读取'),
      ),
    ).toBe(true)
    expect(
      Array.from(members.querySelectorAll('summary')).every(
        (summary) => summary.textContent === '星石与导入详情',
      ),
    ).toBe(true)
  },
)
it('keeps edits visible after cloud save failure without displaying success', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.presets.mockResolvedValue([savedPreset()])
  mocks.savePreset.mockRejectedValue(
    new Error('预设已在其他设备修改，请刷新后重试'),
  )
  await open()
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('button[aria-label="重命名预设"]')!
      .click(),
  )
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
  expect(button('应用到当前作业').disabled).toBe(true)
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

it('shows missing training and real star slots, and selects the next member after removal', async () => {
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
    Object.fromEntries(
      Array.from(card.querySelectorAll('.yuanhub-member-stats dl > div')).map(
        (row) => [
          row.querySelector('dt')?.textContent,
          row.querySelector('dd')?.textContent,
        ],
      ),
    ),
  ).toEqual({ 等级: '100', 修为: '17', 攻击: '待补填', 生命: '0' })
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
  expect(document.querySelectorAll('.yuanhub-member-select')).toHaveLength(4)
  expect(
    document.querySelector('.yuanhub-member-card')?.getAttribute('aria-label'),
  ).toBe(OPERATORS[1].name)
  expect(button('保存预设').disabled).toBe(true)
  expect(document.body.textContent).toContain('还需添加 1 位密探')
  await act(async () => button('添加密探').click())
  expect(document.activeElement).toBe(
    document.querySelector('input[placeholder="搜索密探名称"]'),
  )
})

it('keeps connection and preset controls in one body with a separate footer and inline editing', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.presets.mockResolvedValue([savedPreset()])
  await open()
  const bodies = document.querySelectorAll('.bp4-dialog-body')
  expect(bodies).toHaveLength(1)
  const body = bodies[0]
  expect(body.querySelector('select[id$="-account"]')).not.toBeNull()
  expect(body.querySelector('select[id$="-preset"]')).not.toBeNull()
  expect(body.querySelector('.matcher-footer')).toBeNull()
  expect(body.querySelectorAll('input[type="radio"]')).toHaveLength(2)
  expect(button('编辑阵容与命盘')).toBeUndefined()
  expect(
    body.querySelectorAll('details:not([open]) .yuanhub-member-stones'),
  ).toHaveLength(1)
  expect(body.textContent).not.toContain('导入方式')
  expect(body.querySelector('select[id$="-mode"]')).toBeNull()
  expect(document.querySelectorAll('.bp4-dialog-body')).toHaveLength(1)
  expect(document.querySelector('select[id$="-account"]')).not.toBeNull()
  expect(document.querySelectorAll('input[type="radio"]')).toHaveLength(2)
})
it('explains capacity and invalid loadout blockers next to the apply button', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.presets.mockResolvedValue([savedPreset()])
  const apply = await open(vi.fn(), 1)
  const applyButton = button('应用到当前作业')
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

it('uses catalog colors for both loadouts and marks only the imported scheme', async () => {
  const training = fiveSnapshot()
  training.operators[0].loadouts[0].discs.push('上游新增词条')
  training.operators[1].loadouts = []
  const saved = savedPreset()
  const preset = {
    ...saved,
    members: saved.members.map((member, index) =>
      index === 1 ? { ...member, loadoutId: null } : member,
    ),
  }
  mocks.training.mockResolvedValue(training)
  mocks.presets.mockResolvedValue([preset])
  await open()
  for (const [index, op] of training.operators.entries()) {
    await viewMember(index)
    const card = document.querySelector('.yuanhub-member-card')!
    const rows = card.querySelectorAll('.yuanhub-loadout-option')
    expect(rows).toHaveLength(2)
    for (const [loadoutIndex, loadout] of op.loadouts.entries()) {
      const chips = rows[loadoutIndex].querySelectorAll('.yuanhub-disc-effect')
      expect(chips).toHaveLength(loadout.discs.length)
      loadout.discs.forEach((name, i) => {
        const color = OPERATORS[index].discs.find(
          (disc) => disc.ot_name === name,
        )?.color
        expect(chips[i].getAttribute('data-color')).toBe(color ?? null)
        expect(chips[i].textContent).toBe(name)
      })
      expect(rows[loadoutIndex].getAttribute('data-selected')).toBe(
        String(loadout.id === preset.members[index].loadoutId),
      )
    }
  }
  await viewMember(1)
  const emptyCard = document.querySelector('.yuanhub-member-card')!
  expect(emptyCard.querySelectorAll('.yuanhub-loadout-selected')).toHaveLength(
    0,
  )
  expect(emptyCard.querySelectorAll('.yuanhub-loadout-empty')).toHaveLength(2)
  expect(emptyCard.textContent).toContain('未选择命盘')
  expect(emptyCard.textContent).toContain('暂无方案')
  await viewMember(0)
  expect(
    document.querySelectorAll(
      '.yuanhub-loadout-option .yuanhub-disc-effect[data-color]',
    ).length,
  ).toBeGreaterThan(0)
})

const selectFirstLoadout = async () => {
  await act(async () =>
    document
      .querySelector<HTMLInputElement>(
        `input[aria-label="${OPERATORS[0].name}的命盘1"]`,
      )!
      .click(),
  )
}
it('applies the inline draft without saving or overwriting the cloud preset', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.presets.mockResolvedValue([savedPreset()])
  const apply = await open()
  await selectFirstLoadout()
  expect(document.body.textContent).toContain('预设有未保存修改')
  await act(async () => button('应用到当前作业').click())
  expect(apply.mock.calls[0][0][0].discsSelected).toEqual([1, 0, 0])
  expect(mocks.savePreset).not.toHaveBeenCalled()
  expect(window.confirm).not.toHaveBeenCalled()
})
it.each([
  'close',
  'account',
  'preset',
  'refresh',
  'training',
  'token',
  'new',
  'undo',
])(
  'preserves unsaved changes when discarding is declined (%s)',
  async (action) => {
    mocks.training.mockResolvedValue(fiveSnapshot())
    mocks.presets.mockResolvedValue([
      savedPreset(),
      { ...savedPreset(), id: 'other', label: '另一套' },
    ])
    await open()
    await selectFirstLoadout()
    vi.mocked(window.confirm).mockReturnValue(false)
    const reads = mocks.training.mock.calls.length
    if (action === 'account') await changeSelect('select[id$="-account"]', 'b')
    else if (action === 'preset')
      await changeSelect('select[id$="-preset"]', 'other')
    else {
      const labels = {
        close: '取消',
        refresh: '刷新预设',
        training: '刷新档案',
        token: '更换连接码',
        new: '新建预设',
        undo: '撤销修改',
      }
      await act(async () =>
        button(labels[action as keyof typeof labels]).click(),
      )
    }
    expect(window.confirm).toHaveBeenCalledOnce()
    expect(
      document.querySelector<HTMLInputElement>(
        `input[aria-label="${OPERATORS[0].name}的命盘1"]`,
      )!.checked,
    ).toBe(true)
    expect(
      document.querySelector<HTMLSelectElement>('select[id$="-account"]')!
        .value,
    ).toBe('a')
    expect(
      document.querySelector<HTMLSelectElement>('select[id$="-preset"]')!.value,
    ).toBe('preset')
    expect(mocks.training).toHaveBeenCalledTimes(reads)
    expect(mocks.presets).toHaveBeenCalledTimes(1)
  },
)
it('undo restores the selected preset and clears the dirty state', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.presets.mockResolvedValue([savedPreset()])
  await open()
  await selectFirstLoadout()
  await act(async () => button('撤销修改').click())
  expect(document.body.textContent).not.toContain('预设有未保存修改')
  expect(
    document.querySelector<HTMLInputElement>(
      `input[aria-label="${OPERATORS[0].name}的命盘2"]`,
    )!.checked,
  ).toBe(true)
  expect(button('保存预设').disabled).toBe(true)
})
it('replaces a member in place and saves a copy without the original id or version', async () => {
  const training = fiveSnapshot()
  training.operators.push({
    ...training.operators[0],
    id: OPERATORS[5].id,
    loadouts: [],
  })
  mocks.training.mockResolvedValue(training)
  mocks.presets.mockResolvedValue([savedPreset()])
  mocks.savePreset.mockImplementation(async (_owner, req) => ({
    ...req,
    id: 'copy',
    version: 0,
  }))
  await open()
  await viewMember(1)
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        `button[aria-label="替换${OPERATORS[1].name}"]`,
      )!
      .click(),
  )
  expect(document.querySelectorAll('.yuanhub-member-select')).toHaveLength(5)
  expect(document.querySelectorAll('.yuanhub-member-card')).toHaveLength(1)
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        `button[aria-label="添加${OPERATORS[5].name}"]`,
      )!
      .click(),
  )
  expect(
    document
      .querySelectorAll('.yuanhub-member-select')[1]
      .getAttribute('aria-label'),
  ).toBe(`查看${OPERATORS[5].name}`)
  expect(
    document.querySelector('.yuanhub-member-card')?.getAttribute('aria-label'),
  ).toBe(OPERATORS[5].name)
  await act(async () => button('另存为新预设').click())
  const request = mocks.savePreset.mock.calls[0][1]
  expect(request.id).toBeUndefined()
  expect(request.version).toBeUndefined()
  expect(request.members[1]).toEqual({
    operatorId: OPERATORS[5].id,
    loadoutId: null,
  })
  expect(
    document.querySelector<HTMLSelectElement>('select[id$="-preset"]')!.value,
  ).toBe('copy')
  expect(document.body.textContent).not.toContain('预设有未保存修改')
})
it('applies an unnamed new five-member draft without creating a cloud preset', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  const apply = await open()
  await act(async () => button('新建预设').click())
  for (const op of OPERATORS.slice(0, 5)) {
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          `button[aria-label="添加${op.name}"]`,
        )!
        .click(),
    )
  }
  expect(button('保存预设').disabled).toBe(true)
  expect(button('应用到当前作业').disabled).toBe(false)
  await act(async () => button('应用到当前作业').click())
  expect(apply).toHaveBeenCalledOnce()
  expect(mocks.savePreset).not.toHaveBeenCalled()
})
it('blocks closing and account changes while a cloud save is pending', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.presets.mockResolvedValue([savedPreset()])
  let resolve!: (value: ReturnType<typeof savedPreset>) => void
  mocks.savePreset.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  await open()
  await selectFirstLoadout()
  await act(async () => button('保存预设').click())
  expect(button('取消').disabled).toBe(true)
  expect(
    document.querySelector<HTMLSelectElement>('select[id$="-account"]')!
      .disabled,
  ).toBe(true)
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('.bp4-dialog-close-button')!
      .click(),
  )
  expect(document.querySelector('.yuanhub-team-members')).not.toBeNull()
  await act(async () =>
    resolve({
      ...savedPreset(),
      members: savedPreset().members.map((m, i) =>
        i ? m : { ...m, loadoutId: 'first' },
      ),
    }),
  )
  expect(button('取消').disabled).toBe(false)
  expect(document.body.textContent).toContain('预设已保存到云端')
})

it('switches member details without losing either member’s unsaved loadout or changing the saved preset', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.presets.mockResolvedValue([savedPreset()])
  const apply = await open()
  await selectFirstLoadout()
  await viewMember(1)
  expect(document.querySelectorAll('.yuanhub-member-card')).toHaveLength(1)
  expect(
    document.querySelector('.yuanhub-member-card')?.getAttribute('aria-label'),
  ).toBe(OPERATORS[1].name)
  await act(async () =>
    document
      .querySelector<HTMLInputElement>(
        `input[aria-label="${OPERATORS[1].name}的命盘1"]`,
      )!
      .click(),
  )
  await viewMember(0)
  expect(
    document.querySelector<HTMLInputElement>(
      `input[aria-label="${OPERATORS[0].name}的命盘1"]`,
    )!.checked,
  ).toBe(true)
  const selected = document.querySelector(
    '.yuanhub-member-select[aria-pressed="true"]',
  )!
  expect(selected.getAttribute('aria-label')).toBe(`查看${OPERATORS[0].name}`)
  expect(
    document
      .getElementById(selected.getAttribute('aria-controls')!)
      ?.contains(document.querySelector('.yuanhub-member-card')),
  ).toBe(true)
  await act(async () => button('应用到当前作业').click())
  expect(
    apply.mock.calls[0][0]
      .slice(0, 2)
      .map((op: { discsSelected: number[] }) => op.discsSelected),
  ).toEqual([
    [1, 0, 0],
    [1, 0, 0],
  ])
  expect(mocks.savePreset).not.toHaveBeenCalled()
  expect(window.confirm).not.toHaveBeenCalled()
})

it('marks an invalid hidden member and allows fixing it from the roster', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  const preset = savedPreset()
  preset.members[3].loadoutId = 'deleted'
  mocks.presets.mockResolvedValue([preset])
  await open()
  expect(
    document.querySelectorAll('.yuanhub-member-select')[3].textContent,
  ).toContain('需修复')
  expect(button('应用到当前作业').disabled).toBe(true)
  await viewMember(3)
  expect(
    document.querySelector('.yuanhub-member-issue')?.textContent,
  ).toContain('原命盘方案已不存在')
  await act(async () =>
    document
      .querySelector<HTMLInputElement>(
        `input[aria-label="${OPERATORS[3].name}的命盘1"]`,
      )!
      .click(),
  )
  expect(
    document.querySelectorAll('.yuanhub-member-select')[3].textContent,
  ).not.toContain('需修复')
  expect(button('应用到当前作业').disabled).toBe(false)
})

it('handles removal of the last member and an empty roster without leaving stale details', async () => {
  mocks.training.mockResolvedValue(fiveSnapshot())
  mocks.presets.mockResolvedValue([savedPreset()])
  await open()
  await viewMember(4)
  for (let index = 4; index >= 0; index--) {
    expect(
      document
        .querySelector('.yuanhub-member-card')
        ?.getAttribute('aria-label'),
    ).toBe(OPERATORS[index].name)
    await act(async () => button('移出阵容').click())
  }
  expect(document.querySelector('.yuanhub-member-card')).toBeNull()
  expect(document.querySelectorAll('.yuanhub-member-select')).toHaveLength(0)
  expect(document.body.textContent).toContain('暂无成员，请添加密探')
  expect(button('应用到当前作业').disabled).toBe(true)
  await act(async () => button('添加密探').click())
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        `button[aria-label="添加${OPERATORS[2].name}"]`,
      )!
      .click(),
  )
  expect(
    document.querySelector('.yuanhub-member-card')?.getAttribute('aria-label'),
  ).toBe(OPERATORS[2].name)
})

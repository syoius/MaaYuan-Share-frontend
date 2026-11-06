import { getDefaultStore } from 'jotai'
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import translations from '../../i18n/generated/cn'
import { rawTranslationsAtom } from '../../i18n/i18n'
import { LevelSelectDialog } from './LevelSelectDialog'

const levels = [
  {
    stageId: 'stage_a',
    levelId: 'stage_a',
    catOne: '地宫',
    catTwo: '',
    catThree: '',
    name: '测试关卡甲',
    width: 0,
    height: 0,
  },
  {
    stageId: 'stage_b',
    levelId: 'stage_b',
    catOne: '活动',
    catTwo: '',
    catThree: '',
    name: '测试关卡乙',
    width: 0,
    height: 0,
  },
]
vi.mock('../../apis/level', () => ({
  useLevels: () => ({ data: levels, isLoading: false }),
}))
let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
const onChange = vi.fn()
const onFilter = vi.fn()
beforeEach(() => {
  getDefaultStore().set(rawTranslationsAtom, {
    language: 'cn',
    data: translations,
  })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  onChange.mockReset()
  onFilter.mockReset()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})
async function render(value = '', keyword = '') {
  const Harness = () => {
    const [open, setOpen] = useState(true)
    return createElement(
      'div',
      {},
      createElement('button', { onClick: () => setOpen(true) }, '重新打开'),
      createElement(LevelSelectDialog, {
        isOpen: open,
        onClose: () => setOpen(false),
        value,
        keyword,
        onChange,
        onFilter,
      }),
    )
  }
  await act(async () => root.render(createElement(Harness)))
}
function levelInput() {
  return document.querySelectorAll<HTMLInputElement>('.bp4-dialog input')[1]
}
async function type(value: string) {
  await act(async () => {
    const input = levelInput()
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(text: string) {
  const button = Array.from(document.querySelectorAll('button')).find(
    (el) => el.textContent === text,
  )
  expect(button, text).toBeTruthy()
  await act(async () => button!.click())
}
it('submits typed text without selecting a suggestion or waiting for debounce', async () => {
  await render()
  await type(' 任意[关卡 ')
  await click('搜索')
  expect(onFilter).toHaveBeenCalledWith('任意[关卡')
  expect(onChange).not.toHaveBeenCalled()
})
it('retains an existing exact stage when submitted without edits', async () => {
  await render('stage_a')
  expect(levelInput().value).toBe('测试关卡甲')
  await click('搜索')
  expect(onChange).toHaveBeenCalledWith('stage_a')
})
it('typing over a selected stage submits the new keyword', async () => {
  await render('stage_a')
  await type('新的关键词')
  await click('搜索')
  expect(onFilter).toHaveBeenCalledWith('新的关键词')
  expect(onChange).not.toHaveBeenCalled()
})
it('cancel discards draft text and reopening restores the applied keyword', async () => {
  await render('', '地宫')
  expect(levelInput().value).toBe('地宫')
  await type('未提交')
  await click('取消')
  expect(onFilter).not.toHaveBeenCalled()
  expect(onChange).not.toHaveBeenCalled()
  await click('重新打开')
  expect(levelInput().value).toBe('地宫')
  await click('搜索')
  expect(onFilter).toHaveBeenCalledWith('地宫')
})
it('clearing the visible input and searching clears the applied stage', async () => {
  await render('stage_a')
  await type('')
  await click('搜索')
  expect(onChange).toHaveBeenCalledWith('')
  expect(onFilter).not.toHaveBeenCalled()
})
it('reset clears the filter once and closes the dialog', async () => {
  await render('', '地宫')
  await click('重置')
  expect(onChange).toHaveBeenCalledWith('')
  expect(onFilter).not.toHaveBeenCalled()
  expect(document.querySelector('.bp4-dialog')).toBeNull()
})

async function chooseOption(text: string) {
  await vi.waitFor(() =>
    expect(
      Array.from(document.querySelectorAll('[role="option"]')).some(
        (el) => el.textContent === text,
      ),
    ).toBe(true),
  )
  const option = Array.from(
    document.querySelectorAll<HTMLElement>('[role="option"]'),
  ).find((el) => el.textContent === text)!
  await act(async () => (option.querySelector('a') ?? option).click())
}
it('submits a selected suggestion as an exact stage', async () => {
  await render()
  await act(async () => levelInput().focus())
  await type('测试关卡乙')
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150))
  })
  await chooseOption('测试关卡乙')
  await click('搜索')
  expect(onChange).toHaveBeenCalledWith('stage_b')
  expect(onFilter).not.toHaveBeenCalled()
})
it('submits a selected category without requiring a stage', async () => {
  await render()
  await act(async () =>
    document.querySelector<HTMLInputElement>('.bp4-dialog input')!.focus(),
  )
  await chooseOption('地宫')
  await click('搜索')
  expect(onFilter).toHaveBeenCalledWith('地宫')
  expect(onChange).not.toHaveBeenCalled()
})

it('submits on the first pointer click while suggestions are open', async () => {
  await render()
  await act(async () => levelInput().focus())
  await type('指针搜索')
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150))
  })
  const button = Array.from(document.querySelectorAll('button')).find(
    (el) => el.textContent === '搜索',
  )!
  await act(async () => {
    for (const event of ['mousedown', 'mouseup', 'click']) {
      button.dispatchEvent(new MouseEvent(event, { bubbles: true }))
    }
  })
  expect(onFilter).toHaveBeenCalledWith('指针搜索')
})

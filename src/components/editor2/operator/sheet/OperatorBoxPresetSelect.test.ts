import { act, createElement } from 'react'
import { Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { OperatorBoxPresetSelect } from './OperatorBoxPresetSelect'

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  presets: [
    {
      id: 'box',
      label: '旧队伍',
      members: Array.from({ length: 7 }, (_, i) => ({
        operatorKey: `密探${i}`,
        order: i,
      })),
    },
  ],
}))
vi.mock('../../../../apis/operator-box-preset', () => ({
  useOperatorBoxPresets: () => ({ data: mocks.presets }),
}))
vi.mock('../../../../apis/operator-box-training-config', () => ({
  loadOperatorBoxTrainingConfigs: mocks.load,
}))
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  mocks.load.mockResolvedValue([{ operatorId: '密探6', level: 88 }])
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

it('keeps every old member and imports only the chosen member with its saved config', async () => {
  const apply = vi.fn()
  await act(async () =>
    root.render(
      createElement(OperatorBoxPresetSelect, {
        currentOperators: [],
        groupCount: 0,
        onApply: apply,
      }),
    ),
  )
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[title="旧队伍"]')!
      .click(),
  )
  const checkboxes = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  )
  expect(checkboxes).toHaveLength(7)
  expect(apply).not.toHaveBeenCalled()
  await act(async () => checkboxes[6].click())
  await act(async () =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent === '追加所选密探')!
      .click(),
  )
  expect(apply).toHaveBeenCalledWith(
    [
      expect.objectContaining({
        name: '密探6',
        requirements: expect.objectContaining({ level: 88 }),
      }),
    ],
    'append',
  )
  expect(mocks.presets[0].members).toHaveLength(7)
})

it('closing a pending read never applies it', async () => {
  let resolve!: (value: unknown[]) => void
  mocks.load.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const apply = vi.fn()
  await act(async () =>
    root.render(
      createElement(OperatorBoxPresetSelect, {
        currentOperators: [],
        groupCount: 0,
        onApply: apply,
      }),
    ),
  )
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('button[title="旧队伍"]')!
      .click(),
  )
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('.bp4-dialog-close-button')!
      .click(),
  )
  await act(async () => resolve([]))
  expect(apply).not.toHaveBeenCalled()
  expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
})

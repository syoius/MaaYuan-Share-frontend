import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { OPERATORS } from '../models/generated/operators.json'
import { Operation } from '../models/operation'
import { OperatorMatcherFilter } from '../models/operatorMatcher'
import { OperationList } from './OperationList'

const state = vi.hoisted(() => ({
  operations: [] as Operation[],
  isReachingEnd: true,
}))
vi.mock('apis/operation', () => ({
  useOperations: () => ({
    operations: state.operations,
    total: state.operations.length,
    isReachingEnd: state.isReachingEnd,
    isValidating: true,
  }),
}))
vi.mock('apis/level', () => ({ useLevels: () => ({ data: [] }) }))
vi.mock('./Suspensable', () => ({
  withSuspensable: (component: unknown) => component,
}))
vi.mock('./OperationCard', () => {
  const Card = ({ operation }: { operation: Operation }) =>
    createElement('li', { 'data-operation-id': operation.id }, operation.id)
  return { OperationCard: Card, NeoOperationCard: Card }
})
vi.mock('./operation-set/AddToOperationSet', () => ({
  AddToOperationSetButton: () => null,
}))
vi.mock('../i18n/i18n', () => ({
  useTranslation: () => ({
    components: {
      OperationList: { load_more: '加载更多' },
      OperatorMatcher: {
        more_hint: '加载更多可继续查找匹配作业。',
      },
    },
  }),
}))

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  state.isReachingEnd = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

it('filters by ownership and exclusions only, and restores all jobs when disabled', async () => {
  const [a, b, missing] = OPERATORS
  state.operations = [
    { opers: [{ name: a.name, requirements: { level: 150 } }] },
    { opers: [missing] },
    { groups: [{ name: '任选', opers: [a, b] }] },
    { opers: [] },
  ].map(
    (parsedContent, index) => ({ id: index + 1, parsedContent }) as Operation,
  )
  const filter: OperatorMatcherFilter = {
    snapshot: {
      connectionId: 'connection',
      accountId: 'account',
      accountName: '测试',
      game: '如鸢',
      syncedAt: new Date().toISOString(),
      operators: {
        [a.id]: { id: a.id, owned: true },
        [b.id]: { id: b.id, owned: true },
      },
    },
  }
  const onUpdate = vi.fn()
  const render = async (operatorMatcher?: OperatorMatcherFilter) => {
    await act(async () =>
      root.render(createElement(OperationList, { operatorMatcher, onUpdate })),
    )
    return Array.from(host.querySelectorAll('[data-operation-id]'), (element) =>
      Number(element.getAttribute('data-operation-id')),
    )
  }
  expect(await render(filter)).toEqual([1, 3])
  expect(onUpdate).toHaveBeenLastCalledWith({ total: 4, matched: 2 })
  expect(host.querySelector('[aria-live]')).toBeNull()
  expect(await render({ ...filter, excludedOperatorIds: [a.id] })).toEqual([3])
  expect(onUpdate).toHaveBeenLastCalledWith({ total: 4, matched: 1 })
  expect(
    await render({ ...filter, excludedOperatorIds: [a.id, b.id] }),
  ).toEqual([])
  expect(onUpdate).toHaveBeenLastCalledWith({ total: 4, matched: 0 })
  expect(await render()).toEqual([1, 2, 3, 4])

  state.isReachingEnd = false
  await render(filter)
  const hint = host.querySelector('p')!
  expect(hint.textContent).toBe('加载更多可继续查找匹配作业。')
  expect(hint.previousElementSibling?.tagName).toBe('UL')
  expect(hint.nextElementSibling?.textContent).toContain('加载更多')
  state.isReachingEnd = true
  await render(filter)
  expect(host.querySelector('p')).toBeNull()
})

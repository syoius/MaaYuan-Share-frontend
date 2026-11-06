import { act, createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Operations } from './Operations'

const state = vi.hoisted(() => ({
  game: undefined as string | undefined,
  tags: [] as string[],
  matched: 28,
}))
vi.mock('../store/operatorMatcher', () => ({
  useOperatorMatcher: () => ({
    filter: state.game ? { snapshot: { game: state.game } } : undefined,
  }),
}))
vi.mock('../i18n/i18n', () => ({
  useTranslation: () => ({
    components: {
      Operations: {},
      OperatorMatcher: {
        matched: ({ count }: { count: number }) => `当前匹配 ${count} 份`,
      },
    },
  }),
}))
vi.mock('apis/operation', () => ({ useRefreshOperations: () => vi.fn() }))
vi.mock('./Suspensable', () => ({
  withSuspensable: (component: unknown) => component,
}))
vi.mock('./OperationList', () => ({
  OperationList: ({
    tags,
    onUpdate,
  }: {
    tags: string[]
    onUpdate: (params: { total: number; matched: number }) => void
  }) => {
    state.tags = tags
    const matched = state.matched
    useEffect(() => {
      onUpdate({ total: 100, matched })
    }, [onUpdate, matched])
    return null
  },
}))
vi.mock('./OperationSetList', () => ({ OperationSetList: () => null }))
vi.mock('./OperationSearchInput', () => ({ OperationSearchInput: () => null }))
vi.mock('./LevelSelectButton', () => ({ LevelSelectButton: () => null }))
vi.mock('./OperatorFilter', () => ({
  OperatorFilter: () => null,
  useOperatorFilter: () => ({ operatorFilter: {} }),
}))
vi.mock('./OperatorMatcher', () => ({
  OperatorMatcher: ({ matchedCount }: { matchedCount?: number }) =>
    matchedCount === undefined
      ? null
      : createElement(
          'span',
          { 'aria-live': 'polite' },
          `当前匹配 ${matchedCount} 份`,
        ),
}))
vi.mock('./TagsFilter', () => ({ TagsFilter: () => null }))
vi.mock('./UserFilter', () => ({ UserFilter: () => null }))

describe('matcher game filter', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    state.game = undefined
    state.tags = []
    state.matched = 28
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  it('selects the account game when enabled or changed and allows manual changes', async () => {
    const render = async () =>
      act(async () => root.render(createElement(Operations)))
    await render()
    expect(state.tags).toEqual([])
    state.game = '如鸢'
    await render()
    expect(state.tags).toEqual(['如鸢'])
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent === '只看代号鸢')!
        .click(),
    )
    expect(state.tags).toEqual(['代号鸢'])
    await render()
    expect(state.tags).toEqual(['代号鸢'])
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((button) => button.textContent === '只看代号鸢')!
        .click(),
    )
    expect(state.tags).toEqual([])
    state.game = '代号鸢'
    await render()
    expect(state.tags).toEqual(['代号鸢'])
    state.game = undefined
    await render()
    expect(state.tags).toEqual(['代号鸢'])
    state.game = '如鸢'
    await render()
    expect(state.tags).toEqual(['如鸢'])
  })

  it('restores the account game when mounted with matching enabled', async () => {
    state.game = '代号鸢'
    await act(async () => root.render(createElement(Operations)))
    expect(state.tags).toEqual(['代号鸢'])
  })

  it('shows the current count inside the filter panel and hides it when disabled', async () => {
    state.game = '如鸢'
    const render = async () =>
      act(async () => root.render(createElement(Operations)))
    await render()
    const count = () => host.querySelector('[aria-live="polite"]')
    expect(count()?.textContent).toBe('当前匹配 28 份')
    expect(count()?.closest('.bp4-card')).not.toBeNull()
    state.matched = 29
    await render()
    expect(count()?.textContent).toBe('当前匹配 29 份')
    state.matched = 0
    await render()
    expect(count()?.textContent).toBe('当前匹配 0 份')
    state.game = undefined
    await render()
    expect(count()).toBeNull()
  })
})

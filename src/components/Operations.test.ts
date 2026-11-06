import { debounce } from 'lodash-es'
import { act, createElement, useState } from 'react'
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

import { OperationSearchInput } from './OperationSearchInput'

vi.mock('../i18n/i18n', () => ({
  useTranslation: () => ({
    components: {
      Operations: {
        search_placeholder: '标题、描述、神秘代码',
        short_code_search_suggestion: ({ shortCode }: { shortCode: string }) =>
          `您是否想要搜索${shortCode}`,
      },
    },
  }),
}))

const reactTestEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}

describe('OperationSearchInput', () => {
  let container: HTMLDivElement
  let root: Root
  let value: string
  const onSubmit = vi.fn()

  const render = async () => {
    const Harness = () => {
      const [keyword, setKeyword] = useState(value)

      return createElement(OperationSearchInput, {
        value: keyword,
        size: 32,
        onChange: setKeyword,
        onBlur: vi.fn(),
        onSubmit,
        onShortCodeSelect: setKeyword,
      })
    }

    await act(async () => root.render(createElement(Harness)))
  }

  beforeAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  })

  afterAll(() => {
    reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  })

  beforeEach(() => {
    value = ''
    onSubmit.mockReset()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it.each(['12345', '123456'])(
    'suggests a short code for %s',
    async (digits) => {
      value = digits
      await render()

      const suggestion = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === `您是否想要搜索maay://${digits}`,
      )

      expect(suggestion).toBeTruthy()
      await act(async () => suggestion?.click())
      expect(
        container.querySelector<HTMLInputElement>('input[type="search"]')
          ?.value,
      ).toBe(`maay://${digits}`)
      expect(container.querySelectorAll('button')).toHaveLength(0)
    },
  )

  it.each(['1234', '1234567', '1234a', 'maay://12345'])(
    'does not suggest a short code for %s',
    async (keyword) => {
      value = keyword
      await render()

      expect(container.querySelectorAll('button')).toHaveLength(0)
    },
  )
  it('submits immediately on Enter, but not while confirming IME input', async () => {
    await render()
    const input = container.querySelector('input')!
    for (const init of [
      { key: 'Enter', isComposing: true },
      { key: 'Enter', keyCode: 229 },
      { key: 'a' },
    ]) {
      await act(async () =>
        input.dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, ...init }),
        ),
      )
    }
    expect(onSubmit).not.toHaveBeenCalled()
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      ),
    )
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
  it('flushes a pending search on Enter without another request after 500 ms', async () => {
    vi.useFakeTimers()
    const search = vi.fn()
    const delayedSearch = debounce(search, 500)
    try {
      await act(async () =>
        root.render(
          createElement(OperationSearchInput, {
            value: '',
            size: 32,
            onChange: delayedSearch,
            onBlur: () => delayedSearch.flush(),
            onSubmit: () => delayedSearch.flush(),
            onShortCodeSelect: vi.fn(),
          }),
        ),
      )
      const input = container.querySelector('input')!
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )!.set!.call(input, '地宫')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(search).not.toHaveBeenCalled()
      await act(async () =>
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        ),
      )
      expect(search).toHaveBeenCalledWith('地宫')
      expect(search).toHaveBeenCalledTimes(1)
      await act(async () => vi.advanceTimersByTime(500))
      expect(search).toHaveBeenCalledTimes(1)
    } finally {
      delayedSearch.cancel()
      vi.useRealTimers()
    }
  })
})

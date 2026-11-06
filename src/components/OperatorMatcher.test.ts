import { useAtom } from 'jotai'
import { atomWithReset } from 'jotai/utils'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readYuanHubAccounts, readYuanHubSnapshot } from '../apis/yuanhub'
import { OPERATORS } from '../models/generated/operators.json'
import { MatcherSettings, getMatcherAccountKey } from '../store/operatorMatcher'
import { OperatorMatcher } from './OperatorMatcher'

vi.mock('../apis/yuanhub', () => ({
  readYuanHubAccounts: vi.fn(),
  readYuanHubSnapshot: vi.fn(),
}))
vi.mock('./OperatorSelect', () => ({
  OperatorSelect: ({
    id,
    disabled,
    operators,
    availableOperators,
    onChange,
  }: {
    id: string
    disabled: boolean
    operators: string[]
    availableOperators: { id: string; name: string }[]
    onChange: (names: string[]) => void
  }) =>
    createElement(
      'select',
      {
        id,
        disabled,
        multiple: true,
        value: operators,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
          onChange(
            Array.from(
              event.currentTarget.selectedOptions,
              (option) => option.value,
            ),
          ),
      },
      availableOperators.map((operator) =>
        createElement(
          'option',
          {
            key: operator.id,
            value: operator.name,
          },
          operator.name,
        ),
      ),
    ),
}))
vi.mock('../i18n/i18n', () => ({
  useTranslation: () => ({
    components: {
      Confirm: { cancel: 'cancel', confirm: 'confirm' },
      OperatorMatcher: new Proxy(
        {},
        {
          get: (_, key) => (key === 'count' ? () => 'count' : String(key)),
        },
      ),
    },
  }),
}))

const initial: MatcherSettings = {
  enabled: true,
  token: 'test-token',
  snapshot: {
    connectionId: 'connection',
    accountId: 'first',
    accountName: 'First',
    game: '代号鸢',
    syncedAt: new Date().toISOString(),
    operators: Object.fromEntries(
      OPERATORS.slice(0, 2).map((operator) => [
        operator.id,
        {
          id: operator.id,
          owned: true,
          level: 1,
          discs: [],
          mainStars: [],
          assistStars: [],
        },
      ]),
    ),
  },
}
const accounts = {
  connectionId: 'connection',
  accounts: [
    { id: 'first', name: 'First', game: '代号鸢' },
    { id: 'second', name: 'Second', game: '如鸢' },
  ],
}

describe('automatic matcher sync', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let current: MatcherSettings
  const click = async (text: string) => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => item.textContent === text,
    )!
    await act(async () => button.click())
  }
  const close = async () => {
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('.bp4-dialog-close-button')!
        .click(),
    )
  }
  const enterToken = async (value: string) => {
    const input = document.querySelector<HTMLInputElement>(
      '#yuanhub-matcher-token',
    )!
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    vi.mocked(readYuanHubAccounts).mockResolvedValue(accounts)
    vi.mocked(readYuanHubSnapshot).mockResolvedValue({
      ...initial.snapshot!,
      syncedAt: '2026-01-01T00:00:00.000Z',
    })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const settingsAtom = atomWithReset(initial)
    function Harness() {
      const [settings, setSettings] = useAtom(settingsAtom)
      current = settings
      return createElement(OperatorMatcher, {
        userId: 'user',
        settings,
        setSettings,
        filter: undefined,
      })
    }
    await act(async () => root.render(createElement(Harness)))
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('shows only settings and the enable switch, without status filters', async () => {
    expect(
      Array.from(
        host.querySelectorAll('button'),
        (button) => button.textContent,
      ),
    ).toEqual(['title'])
    const enabled = host.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!
    expect(enabled.checked).toBe(true)
    await act(async () => enabled.click())
    expect(current.enabled).toBe(false)
    expect(host.querySelectorAll('button')).toHaveLength(1)
    await act(async () => enabled.click())
    expect(current.enabled).toBe(true)
    expect(current.snapshot).toEqual(initial.snapshot)
  })

  it('refreshes the selected roster every time settings are opened', async () => {
    await click('title')
    expect(readYuanHubSnapshot).toHaveBeenCalledWith(
      'test-token',
      'user',
      expect.any(AbortSignal),
      'connection',
      accounts.accounts[0],
    )
    expect(current.snapshot?.syncedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(current.enabled).toBe(true)
    expect(
      document.querySelector<HTMLSelectElement>('#yuanhub-matcher-account')
        ?.disabled,
    ).toBe(false)
    expect(
      document.querySelector('.matcher-footer .matcher-disconnect'),
    ).not.toBeNull()
    const refresh = document.querySelector<HTMLButtonElement>(
      'button[aria-label="sync"]',
    )!
    expect(
      refresh.closest('.matcher-field')?.querySelector('label')?.textContent,
    ).toBe('account')
    await act(async () => refresh.click())
    expect(readYuanHubSnapshot).toHaveBeenCalledTimes(2)
    expect(
      Array.from(document.querySelectorAll('button')).some(
        (button) => button.textContent === 'close',
      ),
    ).toBe(false)
    await close()
    await click('title')
    expect(readYuanHubAccounts).toHaveBeenCalledTimes(3)
    expect(readYuanHubSnapshot).toHaveBeenCalledTimes(3)
    await click('disconnect')
    expect(current.token).toBe(initial.token)
    await click('disconnect_confirm')
    expect(
      Array.from(document.querySelectorAll('button')).some(
        (button) => button.textContent === 'connect',
      ),
    ).toBe(true)
  })

  it('preserves the cached roster and disables matching if sync fails', async () => {
    vi.mocked(readYuanHubAccounts).mockRejectedValueOnce(
      new Error('network failed'),
    )
    await click('title')
    expect(document.body.textContent).toContain('network failed')
    expect(current.snapshot).toEqual(initial.snapshot)
    expect(current.enabled).toBe(false)
    await close()
    await click('title')
    expect(readYuanHubSnapshot).toHaveBeenCalledTimes(1)
    expect(current.enabled).toBe(false)
  })

  it('edits a draft without changing the active connection and can cancel', async () => {
    await click('title')
    expect(document.querySelector('#yuanhub-matcher-token')).toBeNull()
    const saved = current
    await click('change_token')
    expect(document.activeElement?.id).toBe('yuanhub-matcher-token')
    await enterToken('replacement-token')
    expect(current).toBe(saved)
    await click('cancel')
    expect(current).toBe(saved)
    expect(document.querySelector('#yuanhub-matcher-token')).toBeNull()
    expect(document.activeElement?.textContent).toBe('change_token')
    await click('change_token')
    expect(
      document.querySelector<HTMLInputElement>('#yuanhub-matcher-token')?.value,
    ).toBe('')
  })

  it('only replaces the connection after the new roster is read successfully', async () => {
    await click('title')
    const saved = current
    await click('change_token')
    await enterToken('replacement-token')
    vi.mocked(readYuanHubSnapshot).mockRejectedValueOnce(new Error('bad token'))
    await click('connect')
    expect(current).toBe(saved)
    expect(document.body.textContent).toContain('connection_unchanged')
    expect(
      document.querySelector<HTMLInputElement>('#yuanhub-matcher-token')?.value,
    ).toBe('replacement-token')

    const newSnapshot = { ...initial.snapshot!, accountName: 'Replacement' }
    let resolveSnapshot!: (value: typeof newSnapshot) => void
    vi.mocked(readYuanHubSnapshot).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSnapshot = resolve
      }),
    )
    await click('connect')
    expect(current).toBe(saved)
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      'connecting',
    )
    await act(async () => resolveSnapshot(newSnapshot))
    expect(current.token).toBe('replacement-token')
    expect(current.snapshot).toEqual(newSnapshot)
    expect(current.enabled).toBe(true)
    expect(document.querySelector('#yuanhub-matcher-token')).toBeNull()
  })

  it('cancels pending replacement when the dialog closes', async () => {
    await click('title')
    const saved = current
    await click('change_token')
    await enterToken('replacement-token')
    let resolveSnapshot!: (value: NonNullable<typeof initial.snapshot>) => void
    vi.mocked(readYuanHubSnapshot).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSnapshot = resolve
      }),
    )
    await click('connect')
    const signal = vi.mocked(readYuanHubSnapshot).mock.calls.at(-1)![2]
    await close()
    expect(signal.aborted).toBe(true)
    await act(async () => resolveSnapshot(initial.snapshot!))
    expect(current).toBe(saved)
  })

  it('cancels disconnect without clearing local settings', async () => {
    await click('title')
    const saved = current
    await click('disconnect')
    expect(document.body.textContent).toContain('disconnect_description')
    await click('cancel')
    expect(current).toBe(saved)
    expect(
      document
        .querySelector('.bp4-alert')
        ?.closest('.bp4-overlay')
        ?.classList.contains('bp4-overlay-open'),
    ).toBe(false)
  })

  it('preserves a disabled match switch when changing accounts', async () => {
    await click('title')
    const toggle = document.querySelector<HTMLInputElement>(
      '#yuanhub-matcher-enabled',
    )!
    await act(async () => toggle.click())
    expect(current.enabled).toBe(false)
    vi.mocked(readYuanHubSnapshot).mockResolvedValueOnce({
      ...initial.snapshot!,
      accountId: 'second',
      accountName: 'Second',
      game: '如鸢',
    })
    const select = document.querySelector<HTMLSelectElement>(
      '#yuanhub-matcher-account',
    )!
    await act(async () => {
      select.value = 'second'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(current.snapshot?.accountId).toBe('second')
    expect(current.enabled).toBe(false)
  })

  it('saves unused operators inside matching settings and restores the account selection after switching', async () => {
    await click('title')
    const excludedSelect = () =>
      document.querySelector<HTMLSelectElement>('#yuanhub-matcher-excluded')!
    expect(excludedSelect().options.length).toBe(2)
    await act(async () => {
      excludedSelect().value = OPERATORS[0].name
      excludedSelect().dispatchEvent(new Event('change', { bubbles: true }))
    })
    const firstKey = getMatcherAccountKey(current.snapshot!)
    expect(current.excludedByAccount?.[firstKey]).toEqual([OPERATORS[0].id])
    expect(current.snapshot?.operators[OPERATORS[0].id].owned).toBe(true)
    expect(readYuanHubSnapshot).toHaveBeenCalledTimes(1)
    await close()
    await click('title')
    expect(excludedSelect().selectedOptions[0].value).toBe(OPERATORS[0].name)
    vi.mocked(readYuanHubSnapshot).mockResolvedValueOnce({
      ...initial.snapshot!,
      accountId: 'second',
      accountName: 'Second',
      game: '如鸢',
    })
    const accountSelect = document.querySelector<HTMLSelectElement>(
      '#yuanhub-matcher-account',
    )!
    await act(async () => {
      accountSelect.value = 'second'
      accountSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(excludedSelect().selectedOptions.length).toBe(0)
    await act(async () => {
      accountSelect.value = 'first'
      accountSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(excludedSelect().selectedOptions[0].value).toBe(OPERATORS[0].name)
    await click('clear_excluded')
    expect(current.excludedByAccount?.[firstKey]).toEqual([])
    expect(excludedSelect().selectedOptions.length).toBe(0)
  })

  it('keeps an existing roster when the replacement connection has no accounts', async () => {
    await click('title')
    const saved = current
    await click('change_token')
    await enterToken('replacement-token')
    vi.mocked(readYuanHubAccounts).mockResolvedValueOnce({
      connectionId: 'empty-connection',
      accounts: [],
    })
    await click('connect')
    expect(current).toBe(saved)
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'no_accounts',
    )
  })

  it('connects from empty settings and explains an empty account list', async () => {
    await click('title')
    await click('disconnect')
    await click('disconnect_confirm')
    await enterToken('first-token')
    expect(current.token).toBeUndefined()
    vi.mocked(readYuanHubAccounts).mockRejectedValueOnce(new Error('bad token'))
    await click('connect')
    expect(current.token).toBeUndefined()
    vi.mocked(readYuanHubAccounts).mockResolvedValueOnce({
      connectionId: 'empty-connection',
      accounts: [],
    })
    await click('connect')
    expect(current.token).toBe('first-token')
    expect(current.snapshot).toBeUndefined()
    expect(current.enabled).toBe(false)
    expect(document.querySelector('#yuanhub-matcher-token')).toBeNull()
    expect(document.body.textContent).toContain('no_accounts')
  })
})

import { Provider, createStore } from 'jotai'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { authAtom } from './auth'
import {
  emptyMatcherSettings,
  parseMatcherSettings,
  useOperatorMatcher,
} from './operatorMatcher'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
let matcher: ReturnType<typeof useOperatorMatcher>
const key = (user: string) =>
  `maayuan-yuanhub-matcher-v2:${encodeURIComponent(user)}`
const token = 'ymatch_0123456789abcdef0123456789abcdef'

function Harness() {
  matcher = useOperatorMatcher()
  return null
}

async function mount(user: string) {
  localStorage.setItem('maa-copilot-auth', JSON.stringify({ userId: user }))
  const store = createStore()
  store.set(authAtom, { userId: user })
  root = createRoot(host)
  await act(async () => {
    root.render(createElement(Provider, { store }, createElement(Harness)))
  })
  return store
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
})
afterEach(async () => {
  if (root) await act(async () => root.unmount())
  host.remove()
  localStorage.clear()
})

describe('matcher browser storage', () => {
  it('persists a connection code without a roster and restores it on remount', async () => {
    await mount('owner')
    await act(async () =>
      matcher.setSettings({ ...emptyMatcherSettings(), token }),
    )
    expect(JSON.parse(localStorage.getItem(key('owner'))!).token).toBe(token)
    await act(async () => root.unmount())
    await mount('owner')
    expect(matcher.settings.token).toBe(token)
    expect(matcher.settings.enabled).toBe(false)
  })

  it('isolates credentials when the site account changes, including logout', async () => {
    const store = await mount('owner')
    await act(async () =>
      matcher.setSettings({ ...emptyMatcherSettings(), token }),
    )
    await act(async () => store.set(authAtom, { userId: 'other' }))
    expect(matcher.settings.token).toBeUndefined()
    await act(async () => store.set(authAtom, {}))
    expect(matcher.settings.token).toBeUndefined()
    await act(async () => store.set(authAtom, { userId: 'owner' }))
    expect(matcher.settings.token).toBe(token)
  })

  it('clears the code, roster and filter preferences without affecting other users', async () => {
    localStorage.setItem(
      key('other'),
      JSON.stringify({ ...emptyMatcherSettings(), token: 'other-code' }),
    )
    await mount('owner')
    await act(async () =>
      matcher.setSettings({
        ...emptyMatcherSettings(),
        token,
        modes: ['ready'],
        snapshot: {
          connectionId: 'connection',
          accountId: 'account',
          accountName: '测试',
          game: '代号鸢',
          syncedAt: new Date().toISOString(),
          operators: {},
        },
      }),
    )
    await act(async () => matcher.setSettings(emptyMatcherSettings()))
    expect(JSON.parse(localStorage.getItem(key('owner'))!)).toEqual(
      emptyMatcherSettings(),
    )
    expect(JSON.parse(localStorage.getItem(key('other'))!).token).toBe(
      'other-code',
    )
    await act(async () => root.unmount())
    await mount('owner')
    expect(matcher.settings.token).toBeUndefined()
  })

  it('accepts older settings and ignores non-string credentials', () => {
    expect(parseMatcherSettings(emptyMatcherSettings()).token).toBeUndefined()
    expect(
      parseMatcherSettings({ ...emptyMatcherSettings(), token: {} }).token,
    ).toBeUndefined()
    expect(
      parseMatcherSettings({ ...emptyMatcherSettings(), token }).token,
    ).toBe(token)
  })
})

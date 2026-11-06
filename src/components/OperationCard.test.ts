import { Provider, createStore } from 'jotai'
import { CopilotInfoStatusEnum } from 'maa-copilot-client'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import translations from '../i18n/generated/cn'
import { rawTranslationsAtom } from '../i18n/i18n'
import { Operation } from '../models/operation'
import { copyShortCode, handleLazyDownloadJSON } from '../services/operation'
import { downloadJsonEnabledAtom } from '../store/operationPrefs'
import { readOperationIdsAtom } from '../store/readOperations'
import { NeoOperationCard } from './OperationCard'

vi.mock('../apis/level', () => ({ useLevels: () => ({ data: [] }) }))
vi.mock('../services/operation', () => ({
  copyShortCode: vi.fn(),
  handleLazyDownloadJSON: vi.fn(),
}))
vi.mock('./OperatorMatcher', () => ({
  OperatorMatchSummary: () => null,
}))
vi.mock('./operation-set/AddToOperationSet', () => ({
  AddToOperationSetButton: (props: {
    text: string
    className: string
    'aria-label': string
  }) =>
    createElement(
      'button',
      { className: props.className, 'aria-label': props['aria-label'] },
      props.text,
    ),
}))

const operatorWithStats = {
  name: '安期',
  extensions: { stats: { starLevel: 2, hp: 21640, attack: 0 } },
}
const operation: Operation = {
  id: 42,
  type: 'PRTS',
  hotScore: 0,
  available: true,
  ratingLevel: 0,
  notEnoughRating: true,
  ratingRatio: 0,
  ratingType: 0,
  commentsCount: 0,
  content: '',
  dislike: 0,
  commentStatus: 'ENABLED',
  status: CopilotInfoStatusEnum.Public,
  uploaderId: 'author-id',
  uploader: '测试作者',
  uploadTime: new Date('2026-11-01T00:00:00Z'),
  like: 12,
  views: 143,
  metadata: { tags: ['如鸢'], sourceType: 'original' },
  parsedContent: {
    minimumRequired: 'v4.0.0',
    stageName: '测试关卡',
    doc: {
      title: '长标题仍能完整查看的测试作业',
      details: '说明第一行\n说明第二行',
    },
    opers: [operatorWithStats, { name: '董奉' }],
  },
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
let store: ReturnType<typeof createStore>
function Location() {
  const location = useLocation()
  return createElement('output', null, location.pathname + location.search)
}
const render = async (
  props: Partial<Parameters<typeof NeoOperationCard>[0]> = {},
) => {
  await act(async () =>
    root.render(
      createElement(
        Provider,
        { store },
        createElement(
          MemoryRouter,
          { initialEntries: ['/'] },
          createElement(
            'ul',
            null,
            createElement(NeoOperationCard, { operation, ...props }),
          ),
          createElement(Location),
        ),
      ),
    ),
  )
}
const location = () => host.querySelector('output')!.textContent
const click = async (selector: string) => {
  await act(async () => host.querySelector<HTMLElement>(selector)!.click())
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  store = createStore()
  store.set(rawTranslationsAtom, { language: 'cn', data: translations })
  store.set(downloadJsonEnabledAtom, true)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('作业网格卡片', () => {
  it('keeps explicit zero stats distinct from missing values and preserves read/private markers', async () => {
    store.set(readOperationIdsAtom, [operation.id])
    await render({
      operation: { ...operation, status: CopilotInfoStatusEnum.Private },
      showReadStatus: true,
    })
    const [provided, missing] = Array.from(
      host.querySelectorAll('.operation-card-operator'),
    )
    expect(provided.textContent).toContain('血: 21640')
    expect(provided.textContent).toContain('攻: 0')
    expect(
      provided.querySelector('[role="img"]')?.getAttribute('aria-label'),
    ).toBe('2星')
    expect(missing.textContent).toContain('血: —')
    expect(missing.textContent).toContain('攻: —')
    expect(missing.querySelectorAll('svg')).toHaveLength(0)
    expect(host.querySelector('.operation-card-title')?.textContent).toContain(
      '私有已读',
    )
    expect(
      host
        .querySelector('.operation-card-operators')!
        .compareDocumentPosition(
          host.querySelector('.operation-card-description')!,
        ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('shortens multiple URLs without altering surrounding text and keeps the full original URL', async () => {
    const source =
      'https://www.xiaohongshu.com/explore/123?token=long&source=web'
    await render({
      operation: {
        ...operation,
        parsedContent: {
          ...operation.parsedContent,
          doc: {
            title: '测试',
            details: `开头 ${source}\n结尾 https://example.com/another`,
          },
        },
      },
    })
    expect(host.querySelector('.operation-card-excerpt')?.textContent).toBe(
      '开头\n结尾 原文链接',
    )
    const link = host.querySelector<HTMLAnchorElement>(
      '.operation-card-description a[target="_blank"]',
    )!
    expect(link.href).toBe(source)
    expect(link.rel).toBe('noopener noreferrer')
  })

  it('prefers the metadata source and rejects executable URLs', async () => {
    await render({
      operation: {
        ...operation,
        metadata: { repostUrl: 'https://example.com/original' },
      },
    })
    expect(host.querySelector('a[target="_blank"]')?.getAttribute('href')).toBe(
      'https://example.com/original',
    )
    await render({
      operation: {
        ...operation,
        metadata: { repostUrl: 'javascript:alert(1)' },
      },
    })
    expect(host.querySelector('a[target="_blank"]')).toBeNull()
  })

  it('shows one training note instead of empty rows when all values are absent', async () => {
    await render({
      operation: {
        ...operation,
        parsedContent: {
          ...operation.parsedContent,
          opers: [
            { name: '安期' },
            { name: '董奉', requirements: { level: 100 } },
          ],
        },
      },
    })
    expect(host.querySelectorAll('.operation-card-training-note')).toHaveLength(
      1,
    )
    expect(
      host.querySelector('.operation-card-training-note')?.textContent,
    ).toBe('未提供星级及血攻要求')
    expect(
      host.querySelectorAll(
        '.operation-card-operator-stats, .operation-card-stars',
      ),
    ).toHaveLength(0)
    expect(host.querySelectorAll('.operation-card-operator-name')).toHaveLength(
      2,
    )
  })

  it('keeps an explicitly provided zero attack or star level visible', async () => {
    const zeroStats = {
      name: '董奉',
      extensions: { stats: { attack: 0, starLevel: 0 } },
    }
    await render({
      operation: {
        ...operation,
        parsedContent: { ...operation.parsedContent, opers: [zeroStats] },
      },
    })
    expect(host.querySelector('.operation-card-training-note')).toBeNull()
    expect(
      host.querySelector('.operation-card-operator-stats')?.textContent,
    ).toContain('攻: 0')
    expect(
      host.querySelector('.operation-card-stars')?.getAttribute('aria-label'),
    ).toBe('0星')
  })

  it('does not claim training is missing when a group candidate has provided values', async () => {
    await render({
      operation: {
        ...operation,
        parsedContent: {
          ...operation.parsedContent,
          opers: [],
          groups: [{ name: '任选一位', opers: [operatorWithStats] }],
        },
      },
    })
    expect(host.querySelector('.operation-card-training-note')).toBeNull()
  })

  it('cleans share text only in the preview and leaves the full source accessible', async () => {
    const source = 'https://www.xiaohongshu.com/explore/123?xsec_token=original'
    const details = `81 【洞窟攻略 - 作者 | 小红书 - 你的生活兴趣社区】 😝 KRDMYUfz4OfRT96 😝 ${source}\n诸葛亮:建木 飞龙`
    const withShare = {
      ...operation,
      parsedContent: {
        ...operation.parsedContent,
        doc: { title: '测试', details },
      },
    }
    await render({ operation: withShare })
    expect(host.querySelector('.operation-card-excerpt')?.textContent).toBe(
      '诸葛亮:建木 飞龙\n洞窟攻略 - 作者',
    )
    expect(host.querySelector('a[target="_blank"]')?.getAttribute('href')).toBe(
      source,
    )
    expect(withShare.parsedContent.doc.details).toBe(details)
  })

  it('copies and downloads once without navigating, and honors the download preference', async () => {
    await render()
    await click('.operation-card-copy')
    expect(copyShortCode).toHaveBeenCalledTimes(1)
    expect(copyShortCode).toHaveBeenCalledWith(operation)
    expect(location()).toBe('/')
    await click('.operation-card-download')
    expect(handleLazyDownloadJSON).toHaveBeenCalledTimes(1)
    expect(handleLazyDownloadJSON).toHaveBeenCalledWith(
      42,
      operation.parsedContent.doc.title,
      ['如鸢'],
    )
    expect(location()).toBe('/')
    await act(async () => store.set(downloadJsonEnabledAtom, false))
    expect(host.querySelector('.operation-card-download')).toBeNull()
  })

  it('opens details from the card and the description link, while author navigation stays independent', async () => {
    await render()
    await click('.operation-card-description-links a')
    expect(location()).toContain('op=42')
    await click('.operation-card-author a')
    expect(location()).toMatch(/^\/profile\/author-id/)
  })

  it('keeps keyboard focus on native links and buttons without nesting interactive roles', async () => {
    await render()
    const button = host.querySelector('.operation-card-copy')!
    await act(async () =>
      button.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      ),
    )
    expect(location()).toBe('/')
    const title = host.querySelector('.operation-card-title a')!
    expect(title.getAttribute('href')).toBe('/?op=42')
    expect(
      host.querySelector('.operation-card')?.getAttribute('tabindex'),
    ).toBeNull()
    await click('.operation-card-title a')
    expect(location()).toContain('op=42')
  })

  it('keeps multiselect separate from opening details or copying', async () => {
    const onSelect = vi.fn()
    await render({ selectable: true, selected: false, onSelect })
    expect(host.querySelector('.operation-card-actions')).toBeNull()
    await click('button[aria-pressed="false"]')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(operation, true)
    expect(copyShortCode).not.toHaveBeenCalled()
    expect(location()).toBe('/')
    await render({ selectable: true, selected: true, onSelect })
    expect(host.querySelector('button[aria-pressed="true"]')).not.toBeNull()
  })

  it('shows group candidates and handles jobs without a roster or description', async () => {
    await render({
      operation: {
        ...operation,
        parsedContent: {
          ...operation.parsedContent,
          opers: [],
          groups: [
            { name: '任选一位', opers: [{ name: '安期' }, { name: '董奉' }] },
          ],
        },
      },
    })
    expect(host.querySelector('.operation-card-group')?.textContent).toContain(
      '任选一位安期 / 董奉',
    )
    await render({
      operation: {
        ...operation,
        parsedContent: {
          ...operation.parsedContent,
          opers: [],
          doc: { title: '空作业' },
        },
      },
    })
    expect(host.textContent).toContain('无记录')
    expect(host.querySelector('.operation-card-excerpt')).toBeNull()
    expect(
      host.querySelector('.operation-card-description-links a'),
    ).not.toBeNull()
  })
})

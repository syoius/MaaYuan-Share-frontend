import { act, createElement } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OperationShareNoteEditor } from './operationShareNote'

describe('share note editor trust boundary', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
  })

  async function render(value: string) {
    await act(async () => {
      root.render(
        createElement(OperationShareNoteEditor, {
          ariaLabel: '回合备注',
          className: '',
          onChange: vi.fn(),
          placeholder: '',
          revision: 0,
          round: 1,
          value,
        }),
      )
    })
    return container.querySelector('[contenteditable]') as HTMLDivElement
  }

  it('removes executable remote HTML while retaining allowed formatting', async () => {
    const editor = await render(
      '<img src=x onerror="alert(1)"><svg onload="alert(1)"></svg><span onclick="alert(1)" style="color: rgb(220, 38, 38); font-size: 12em; background-image: url(https://evil.invalid/x)">备注</span><b>重点</b><br>下一行',
    )
    expect(
      editor.querySelector('img,svg,[onerror],[onload],[onclick]'),
    ).toBeNull()
    expect(editor.querySelector('span')?.style.color).toBe('rgb(220, 38, 38)')
    expect(editor.innerHTML).not.toContain('background-image')
    expect(editor.querySelector('span')?.style.fontSize).toBe('')
    expect(editor.querySelector('b')?.textContent).toBe('重点')
    expect(editor.querySelector('br')).not.toBeNull()
  })

  it('keeps plain text literal and prevents HTML drops into the live editor', async () => {
    const editor = await render('1 < 2 & 3\n下一行')
    expect(editor.textContent).toBe('1 < 2 & 3\n下一行')
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    editor.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'

import { OperatorRecorderPage } from './operator-recorder'

it('offers editor navigation without rendering any Box configuration controls', () => {
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(OperatorRecorderPage)),
  )
  expect(html).toContain('绣衣楼配置已停用')
  expect(html).toContain('href="/editor"')
  expect(html).not.toMatch(/<input|<select|<button/)
})

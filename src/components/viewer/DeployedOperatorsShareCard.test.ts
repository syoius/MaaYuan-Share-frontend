import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  DeployedOperatorsShareCard,
  orderOperationShareDiscs,
} from './DeployedOperatorsShareCard'
import type { OperationShareModel } from './operationShareModel'
import { createOperationShareCardConfig } from './operationShareModel'

const model: OperationShareModel = {
  title: '测试作业',
  stage: '测试关卡',
  author: '攻略作者',
  source: {
    type: 'original',
    strategyAuthor: '攻略作者',
  },
  shortCode: '12345',
  maayuanUrl: 'https://example.com/?op=12345',
  qrTargetUrl: 'https://example.com/?op=12345',
  qrLabel: '扫码查看 MaaYuan 作业',
  operators: [
    {
      slot: 1,
      name: '上阵密探',
      rawName: 'main_operator',
      avatarId: 'main_operator',
      skill: 2,
      starLevel: 4,
      attack: 1234,
      hp: 5678,
      elite: 2,
      level: 60,
      skillLevel: 10,
      potentiality: 3,
      module: 'A',
      discs: [
        {
          slot: 1,
          abbreviation: '技伤大幅',
          color: '金',
          forbidden: false,
          starStone: '攻击提升',
          assistStar: '生命提升',
        },
      ],
    },
  ],
  groups: [
    {
      name: '不应显示的密探组',
      operators: [],
    },
  ],
  actionSlots: [1],
  rounds: [],
}

describe('deployed operators share card', () => {
  it('hides the QR code by default and can show it', () => {
    const defaultMarkup = renderToStaticMarkup(
      createElement(DeployedOperatorsShareCard, {
        model,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )
    const visibleMarkup = renderToStaticMarkup(
      createElement(DeployedOperatorsShareCard, {
        hideQrCode: false,
        model,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )

    expect(defaultMarkup).not.toContain(model.qrLabel)
    expect(visibleMarkup).toContain(model.qrLabel)
  })

  it('shows the secret code footer block unless it is turned off', () => {
    const defaultMarkup = renderToStaticMarkup(
      createElement(DeployedOperatorsShareCard, {
        model,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )
    const hiddenMarkup = renderToStaticMarkup(
      createElement(DeployedOperatorsShareCard, {
        model,
        qrDataUrl: 'data:image/png;base64,qr-code',
        showShortCode: false,
      }),
    )

    expect(defaultMarkup).toContain('神秘代码')
    expect(defaultMarkup).toContain(model.maayuanUrl)
    expect(hiddenMarkup).not.toContain('神秘代码')
    expect(hiddenMarkup).not.toContain('站内地址')
    expect(hiddenMarkup).not.toContain(model.maayuanUrl)
    expect(hiddenMarkup).toContain('MAAYUAN SHARE')
  })

  it('orders required discs before unmarked and forbidden discs', () => {
    const unmarkedDisc = model.operators[0].discs[0]
    const forbiddenDisc = {
      slot: 2,
      abbreviation: '禁止命盘',
      forbidden: true,
    }
    const requiredDisc = {
      slot: 3,
      abbreviation: '必选命盘',
      forbidden: false,
    }

    expect(
      orderOperationShareDiscs(
        [unmarkedDisc, forbiddenDisc, requiredDisc],
        new Set([3]),
      ),
    ).toEqual([requiredDisc, unmarkedDisc, forbiddenDisc])
    expect(orderOperationShareDiscs([forbiddenDisc])).toEqual([
      forbiddenDisc,
      undefined,
      undefined,
    ])
  })

  it('renders discs in required, unmarked, then forbidden order', () => {
    const config = createOperationShareCardConfig()
    config.requiredDiscs['1:3'] = true
    const orderedModel: OperationShareModel = {
      ...model,
      operators: model.operators.map((operator) => ({
        ...operator,
        discs: [
          ...operator.discs,
          {
            slot: 2,
            abbreviation: '禁止命盘',
            forbidden: true,
          },
          {
            slot: 3,
            abbreviation: '必选命盘',
            forbidden: false,
          },
        ],
      })),
    }

    const markup = renderToStaticMarkup(
      createElement(DeployedOperatorsShareCard, {
        config,
        model: orderedModel,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )

    expect(markup.indexOf('必选命盘')).toBeLessThan(markup.indexOf('禁止命盘'))
    expect(markup.indexOf('技伤大幅')).toBeLessThan(markup.indexOf('禁止命盘'))
  })

  it('hides the unselected disc label while retaining its stones', () => {
    const unselectedDiscModel: OperationShareModel = {
      ...model,
      operators: model.operators.map((operator) => ({
        ...operator,
        discs: operator.discs.map((disc) => ({
          ...disc,
          abbreviation: '未选择命盘',
        })),
      })),
    }
    const markup = renderToStaticMarkup(
      createElement(DeployedOperatorsShareCard, {
        model: unselectedDiscModel,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )

    expect(markup).not.toContain('未选择命盘')
    expect(markup).toContain('攻击提升')
    expect(markup).toContain('生命提升')
    expect(markup).not.toContain('⭐ 主星 ·')
    expect(markup).not.toContain('✨ 辅星 ·')
  })

  it('renders only deployed operators with stats, discs, and stones', () => {
    const markup = renderToStaticMarkup(
      createElement(DeployedOperatorsShareCard, {
        model,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )

    expect(markup).toContain('MaaYuan · 上阵密探')
    expect(markup).toContain('生命')
    expect(markup).toContain('攻击')
    expect(markup).toContain('等级')
    expect(markup).toContain('修为')
    expect(markup).toContain('化极')
    expect(markup).toContain('命盘')
    expect(markup).toContain('主星')
    expect(markup).toContain('辅星')
    expect(markup).toContain('1234')
    expect(markup).toContain('5678')
    expect(markup).toContain('技伤大幅')
    expect(markup).toContain('攻击提升')
    expect(markup).toContain('生命提升')
    expect(markup).not.toContain('⭐ 主星 ·')
    expect(markup).not.toContain('✨ 辅星 ·')
    expect(markup).toContain('text-[27px]')
    expect(markup).toContain('text-[24px]')
    expect(markup).toContain('text-[22px]')
    expect(markup).toContain('aria-label="化极 4"')
    expect(markup.match(/<svg/g)).toHaveLength(4)
    expect(markup.match(/background:#f3e3c9/g)).toHaveLength(8)
    expect(markup).not.toContain('#ddc09e')
    expect(markup.match(/<tr/g)).toHaveLength(10)
    expect(markup).toContain('<tr aria-label="密探头像"')
    expect(markup).toContain('<tr aria-label="列标题"')
    expect(markup.indexOf('aria-label="密探头像"')).toBeLessThan(
      markup.indexOf('aria-label="列标题"'),
    )
    expect(markup).toContain('aspect-square h-auto w-full')
    expect(markup).not.toContain('命盘一')
    expect(markup).not.toContain('命盘二')
    expect(markup).not.toContain('命盘三')
    expect(markup).not.toContain('rowspan="3"')
    expect(markup).not.toContain('grid-template-rows')
    expect(markup).not.toContain('不应显示的密探组')
  })

  it('marks configured discs as required', () => {
    const config = createOperationShareCardConfig()
    config.requiredDiscs['1:1'] = true

    const markup = renderToStaticMarkup(
      createElement(DeployedOperatorsShareCard, {
        config,
        model,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )

    expect(markup).toContain('核心命盘：技伤大幅')
    expect(markup).not.toContain('>核心<')
    expect(markup).toMatch(
      /aria-label="核心命盘：技伤大幅" class="inline-flex max-w-full items-center justify-center gap-1">/,
    )
    expect(markup).toContain('技伤大幅')
  })

  it('renders forbidden discs as an absolute prohibition instead of required', () => {
    const config = createOperationShareCardConfig()
    config.requiredDiscs['1:1'] = true
    const forbiddenModel: OperationShareModel = {
      ...model,
      operators: model.operators.map((operator) => ({
        ...operator,
        discs: operator.discs.map((disc) => ({
          ...disc,
          forbidden: true,
        })),
      })),
    }

    const markup = renderToStaticMarkup(
      createElement(DeployedOperatorsShareCard, {
        config,
        model: forbiddenModel,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )

    expect(markup).toContain('禁用命盘：技伤大幅')
    expect(markup).not.toContain('>禁用<')
    expect(markup).toMatch(
      /aria-label="禁用命盘：技伤大幅" class="inline-flex max-w-full items-center justify-center gap-1" style="color:#8f2117">/,
    )
    expect(markup).toContain(
      'font-black leading-snug line-through decoration-2',
    )
    expect(markup).not.toContain('核心命盘')
  })
})

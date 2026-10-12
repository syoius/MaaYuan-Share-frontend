import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  OperationShareCard,
  getOperationShareActionCellBackground,
  getOperationShareActionFillColor,
  getOperationShareActionLabel,
  getOperationShareCellVisualStyle,
  getOperationShareNoteActionLabel,
  getOperationShareOperatorStarLabel,
  getOperationShareRoundDisplay,
  getOperationShareRoundNoteText,
} from './OperationShareCard'
import {
  OPERATION_SHARE_CELL_COLOR_KEYS,
  OPERATION_SHARE_CELL_PALETTE,
  type OperationShareModel,
  createOperationShareCardConfig,
} from './operationShareModel'
import {
  OPERATION_SHARE_TABLE_THEME_PRESETS,
  getOperationShareTableTheme,
} from './operationShareTheme'

const model: OperationShareModel = {
  title: '测试作业',
  stage: '测试关卡',
  author: '攻略作者',
  source: { type: 'original', strategyAuthor: '攻略作者' },
  shortCode: '12345',
  maayuanUrl: 'https://example.com/?op=12345',
  qrTargetUrl: 'https://example.com/?op=12345',
  qrLabel: '扫码查看 MaaYuan 作业',
  operators: [],
  groups: [],
  actionSlots: [],
  rounds: [],
}

describe('operation share card styles', () => {
  it('keeps table theme presets distinct from action cell colors', () => {
    const actionCellColors = new Set(
      Object.values(OPERATION_SHARE_CELL_PALETTE).map(({ hex }) =>
        hex.toLowerCase(),
      ),
    )
    const tableThemeColors = OPERATION_SHARE_TABLE_THEME_PRESETS.flatMap(
      ({ baseColor }) => {
        const theme = getOperationShareTableTheme(baseColor)
        return [
          theme.headerBackground,
          theme.bodyBackgrounds[0],
          theme.bodyBackgrounds[1],
          theme.border,
        ]
      },
    )

    expect(OPERATION_SHARE_TABLE_THEME_PRESETS.map(({ id }) => id)).toEqual([
      'native',
      'blue',
      'green',
      'orange',
      'purple',
      'pink',
    ])
    tableThemeColors.forEach((color) => {
      expect(actionCellColors.has(color.toLowerCase())).toBe(false)
    })
  })

  it('hides the QR code by default and can show it', () => {
    const defaultMarkup = renderToStaticMarkup(
      createElement(OperationShareCard, {
        model,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )
    const visibleMarkup = renderToStaticMarkup(
      createElement(OperationShareCard, {
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
      createElement(OperationShareCard, {
        model,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )
    const hiddenMarkup = renderToStaticMarkup(
      createElement(OperationShareCard, {
        model,
        qrDataUrl: 'data:image/png;base64,qr-code',
        showShortCode: false,
      }),
    )

    // 「神秘代码」与「站内地址」携带同一个作业 id，必须一起隐藏
    expect(defaultMarkup).toContain('神秘代码')
    expect(defaultMarkup).toContain(model.maayuanUrl)
    expect(hiddenMarkup).not.toContain('神秘代码')
    expect(hiddenMarkup).not.toContain('站内地址')
    expect(hiddenMarkup).not.toContain(model.maayuanUrl)
    expect(hiddenMarkup).toContain('MAAYUAN SHARE')
  })

  it('renders full-cell avatars above a separate column-label row', () => {
    const config = createOperationShareCardConfig()
    const cardModel: OperationShareModel = {
      ...model,
      actionSlots: [1],
      operators: [
        {
          slot: 1,
          name: '测试密探',
          rawName: 'test-operator',
          avatarId: 'test-operator',
          level: 60,
          elite: 2,
          skillLevel: 10,
          potentiality: 1,
          discs: [],
        },
      ],
    }

    const markup = renderToStaticMarkup(
      createElement(OperationShareCard, {
        config,
        model: cardModel,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )

    expect(markup).toContain('<tr aria-label="密探头像"')
    expect(markup).toContain('<tr aria-label="列标题"')
    expect(markup.indexOf('aria-label="密探头像"')).toBeLessThan(
      markup.indexOf('aria-label="列标题"'),
    )
    expect(markup).toContain('aspect-square h-auto w-full')
  })

  it('alternates the deployed-operator palette for uncolored action cells', () => {
    expect(getOperationShareActionCellBackground({}, 1, 1)).toBe('#f3e3c9')
    expect(getOperationShareActionCellBackground({}, 2, 1)).toBe('#ddc09e')
    expect(getOperationShareActionCellBackground({}, 3, 1)).toBe('#f3e3c9')
  })

  it('uses the configured cell color instead of the neutral background', () => {
    expect(
      getOperationShareActionCellBackground({ '2:slot-1': 'blue' }, 2, 1),
    ).toBe('blue')
  })

  it('fills action labels in the generated image while keeping the original text color', () => {
    const config = createOperationShareCardConfig()
    config.actionColors['1:1'] = 'pink'
    const cardModel: OperationShareModel = {
      ...model,
      actionSlots: [1],
      rounds: [
        {
          round: 1,
          slots: { 1: [{ raw: '10圈', order: 1, label: '0圈' }] },
          others: [],
        },
      ],
    }

    const markup = renderToStaticMarkup(
      createElement(OperationShareCard, {
        config,
        model: cardModel,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )

    expect(getOperationShareActionFillColor('pink')).toBe(
      OPERATION_SHARE_CELL_PALETTE.pink.hex,
    )
    expect(getOperationShareActionFillColor(undefined, 2)).toBe(
      OPERATION_SHARE_CELL_PALETTE.pink.hex,
    )
    expect(markup).not.toContain('color:#be185d')
    expect(markup).toContain(
      `background-color:${OPERATION_SHARE_CELL_PALETTE.pink.hex}`,
    )
    expect(markup).toContain('border-radius:4px')
    expect(markup).toContain('white-space:nowrap')
    expect(markup).toContain('10圈</span><wbr/>')
  })

  it('renders editable notes for every action color used in the image', () => {
    const config = createOperationShareCardConfig()
    config.actionColors['1:1'] = 'pink'
    config.actionColorNotes.pink = '粉色表示关键操作'
    const cardModel: OperationShareModel = {
      ...model,
      actionSlots: [1],
      rounds: [
        {
          round: 1,
          slots: {
            1: [
              { raw: '10圈', order: 1, label: '0圈' },
              {
                raw: '20圈',
                order: 2,
                label: '0圈',
                targetIndex: 3,
              },
            ],
          },
          others: [],
        },
      ],
    }

    const markup = renderToStaticMarkup(
      createElement(OperationShareCard, {
        config,
        model: cardModel,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )

    expect(markup).toContain('粉色表示关键操作')
    expect(markup).toContain('2号敌人')
    expect(markup).not.toContain('打 1 号敌人')
  })

  it('derives alternating table colors from a custom base color', () => {
    const tableTheme = getOperationShareTableTheme('#336699')

    expect(tableTheme.bodyBackgrounds).toEqual(['#c2d1e0', '#8fabc7'])
    expect(getOperationShareActionCellBackground({}, 1, 1, '#336699')).toBe(
      tableTheme.bodyBackgrounds[0],
    )
    expect(getOperationShareActionCellBackground({}, 2, 1, '#336699')).toBe(
      tableTheme.bodyBackgrounds[1],
    )
    expect(tableTheme.pageBackground).toBe('#f3f6f9')
    expect(
      getOperationShareCellVisualStyle(
        tableTheme.bodyBackgrounds[0],
        false,
        tableTheme,
      ),
    ).toEqual({
      backgroundColor: tableTheme.bodyBackgrounds[0],
      color: tableTheme.text,
    })
  })

  it('uses a muted pink table theme instead of the action cell pink', () => {
    const tableTheme = getOperationShareTableTheme('#a8607b')

    expect(tableTheme.headerBackground).toBe('#e8d6dd')
    expect(tableTheme.bodyBackgrounds).toEqual(['#faf5f7', '#ecdce2'])
    expect(tableTheme.bodyBackgrounds).not.toContain('#ffe3ed')
  })

  it('keeps the green table light row paler than the action cell green', () => {
    const tableTheme = getOperationShareTableTheme('#4b7d5b')

    expect(tableTheme.bodyBackgrounds[0]).toBe('#f4f7f5')
    expect(tableTheme.bodyBackgrounds).not.toContain('#e1edc1')
  })

  it('keeps the blue table light row distinct from the ice action cell', () => {
    const tableTheme = getOperationShareTableTheme('#4d6fa8')

    expect(tableTheme.bodyBackgrounds[0]).toBe('#f8f9fc')
    expect(tableTheme.bodyBackgrounds).not.toContain('#d8e8ee')
  })

  it('keeps an individually colored cell above the table theme', () => {
    expect(
      getOperationShareActionCellBackground(
        { '2:slot-1': 'blue' },
        2,
        1,
        '#336699',
      ),
    ).toBe('blue')
  })

  it('applies individual table theme overrides on top of the base color', () => {
    const tableTheme = getOperationShareTableTheme('#336699', {
      border: '#123456',
      darkRowBackground: '#eeeeee',
      headerBackground: '#f4f4f4',
      lightRowBackground: '#fafafa',
      pageBackground: '#fffefd',
      text: '#222222',
    })

    expect(tableTheme).toMatchObject({
      bodyBackgrounds: ['#fafafa', '#eeeeee'],
      border: '#123456',
      headerBackground: '#f4f4f4',
      headerText: '#222222',
      pageBackground: '#fffefd',
      text: '#222222',
    })
  })

  it('adds a distinct pattern to every color only when the switch is on', () => {
    const plain = OPERATION_SHARE_CELL_COLOR_KEYS.map((colorKey) =>
      getOperationShareCellVisualStyle(colorKey, false),
    )
    const patterned = OPERATION_SHARE_CELL_COLOR_KEYS.map((colorKey) =>
      getOperationShareCellVisualStyle(colorKey, true),
    )

    // 关闭「增加底纹」时全部退化为纯色块
    expect(plain.every((style) => !style.backgroundImage)).toBe(true)
    expect(plain.map((style) => style.backgroundColor)).toEqual(
      OPERATION_SHARE_CELL_COLOR_KEYS.map(
        (colorKey) => OPERATION_SHARE_CELL_PALETTE[colorKey].hex,
      ),
    )

    // 打开后每个颜色都有纹样，且底色与关闭时一致、文字对比度一致
    expect(patterned.every((style) => Boolean(style.backgroundImage))).toBe(
      true,
    )
    expect(patterned.map((style) => style.backgroundColor)).toEqual(
      plain.map((style) => style.backgroundColor),
    )
    expect(
      [...plain, ...patterned].every((style) => style.color === '#231f20'),
    ).toBe(true)

    // 纹样互不相同，保证黑白打印/色盲下靠纹样即可区分颜色
    expect(new Set(patterned.map((style) => style.backgroundImage)).size).toBe(
      OPERATION_SHARE_CELL_COLOR_KEYS.length,
    )
  })

  it('applies the pattern to colored cells only when the switch is on', () => {
    const cardModel: OperationShareModel = {
      ...model,
      actionSlots: [1],
      rounds: [{ round: 1, slots: { 1: [] }, others: [] }],
    }
    const config = createOperationShareCardConfig()
    config.cellColors['1:slot-1'] = 'ice'

    const renderCard = (showCellPattern: boolean) =>
      renderToStaticMarkup(
        createElement(OperationShareCard, {
          config: { ...config, showCellPattern },
          model: cardModel,
          qrDataUrl: 'data:image/png;base64,qr-code',
        }),
      )

    const patternedMarkup = renderCard(true)
    expect(patternedMarkup).toContain('background-color:#d8e8ee')
    expect(patternedMarkup).toContain('background-image:radial-gradient')
    expect(patternedMarkup).toContain('color:#231f20')

    const plainMarkup = renderCard(false)
    expect(plainMarkup).toContain('background-color:#d8e8ee')
    expect(plainMarkup).not.toContain('background-image:')
  })

  it('uses the operator star level for the avatar badge', () => {
    expect(getOperationShareOperatorStarLabel({ starLevel: 4 })).toBe('4 星')
    expect(getOperationShareOperatorStarLabel({})).toBeUndefined()
  })

  it('normalizes star restart labels in the generated image', () => {
    expect(
      ['橙', '紫', '蓝'].map((color, index) =>
        getOperationShareActionLabel({
          raw: `重开:无${color}星`,
          order: index + 1,
          label: `无${color}星`,
        }),
      ),
    ).toEqual(['1无橙星重开', '2无紫星重开', '3无蓝星重开'])
  })

  it('shows only the fallen slot in death restart labels', () => {
    expect(
      getOperationShareActionLabel({
        raw: '重开:检测3号位阵亡',
        order: 12,
        label: '检测3号位阵亡',
      }),
    ).toBe('3号位阵亡就重开')
  })

  it('shows the slot and replication condition in parrot restart labels', () => {
    expect(
      getOperationShareActionLabel({
        raw: '重开:检测2号位鹦鹉',
        order: 5,
        label: '检测2号位鹦鹉',
      }),
    ).toBe('2号位鹦鹉未被复制就重开')
  })

  it('renumbers visible actions after target switches are hidden', () => {
    const attack = { raw: '1普', order: 2, label: 'A' }
    const round = {
      round: 1,
      slots: { 1: [attack] },
      others: [{ raw: '额外:右侧目标', order: 1, label: '左滑' }],
    }

    const display = getOperationShareRoundDisplay(round, {
      showOtherActions: true,
      showTargetSwitches: false,
    })

    expect(display.otherActions).toEqual([])
    expect(
      getOperationShareActionLabel(
        attack,
        display.displayOrderByActionOrder.get(attack.order),
      ),
    ).toBe('1A')
  })

  it('counts visible target switches in operation numbering', () => {
    const firstAttack = { raw: '1普', order: 2, label: 'A' }
    const secondAttack = { raw: '2普', order: 4, label: 'A' }
    const targetSwitch = {
      raw: '额外:右侧目标',
      order: 1,
      label: '左滑',
    }
    const round = {
      round: 1,
      slots: { 1: [firstAttack], 2: [secondAttack] },
      others: [
        targetSwitch,
        { raw: '重开:检测1号位阵亡', order: 3, label: '检测1号位阵亡' },
      ],
    }

    const display = getOperationShareRoundDisplay(round, {
      showOtherActions: true,
      showTargetSwitches: true,
    })

    expect(display.otherActions).toEqual([targetSwitch])
    expect(
      getOperationShareActionLabel(
        targetSwitch,
        display.displayOrderByActionOrder.get(targetSwitch.order),
      ),
    ).toBe('1左滑')
    expect(
      getOperationShareActionLabel(
        firstAttack,
        display.displayOrderByActionOrder.get(firstAttack.order),
      ),
    ).toBe('2A')
    expect(
      getOperationShareActionLabel(
        secondAttack,
        display.displayOrderByActionOrder.get(secondAttack.order),
      ),
    ).toBe('3A')
  })

  it('keeps target switches out of notes while using their action numbering', () => {
    const attack = { raw: '1普', order: 2, label: 'A' }
    const targetSwitch = {
      raw: '额外:右侧目标',
      order: 1,
      label: '左滑',
    }
    const round = {
      round: 1,
      slots: { 1: [attack] },
      others: [
        targetSwitch,
        { raw: '重开:检测1号位阵亡', order: 3, label: '检测1号位阵亡' },
      ],
    }

    const config = createOperationShareCardConfig()
    config.showTargetSwitches = true

    expect(getOperationShareRoundNoteText(round, config)).toBe(
      '2A后1号位阵亡就重开',
    )
  })

  it('renders target switches in a separate other-actions column', () => {
    const config = createOperationShareCardConfig()
    config.showNotes = true
    config.showTargetSwitches = true
    const cardModel: OperationShareModel = {
      ...model,
      actionSlots: [1],
      rounds: [
        {
          round: 1,
          slots: { 1: [{ raw: '1普', order: 2, label: 'A' }] },
          others: [{ raw: '额外:右侧目标', order: 1, label: '左滑' }],
        },
      ],
    }

    const markup = renderToStaticMarkup(
      createElement(OperationShareCard, {
        config,
        model: cardModel,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )

    expect(markup).toContain('其他动作')
    expect(markup).toContain('备注')
    expect(markup).toContain('w-[104px]')
    expect(markup).toContain('w-[80px]')
    expect(markup).toContain('w-[212px]')
    expect(markup).toContain('1左滑')
    expect(markup).toContain('2A')

    const hiddenSwitchMarkup = renderToStaticMarkup(
      createElement(OperationShareCard, {
        config: { ...config, showTargetSwitches: false },
        model: cardModel,
        qrDataUrl: 'data:image/png;base64,qr-code',
      }),
    )

    expect(hiddenSwitchMarkup).not.toContain('其他动作')
    expect(hiddenSwitchMarkup).not.toContain('1左滑')
    expect(hiddenSwitchMarkup).toContain('w-[302px]')
    expect(hiddenSwitchMarkup).toContain('1A')
  })

  it('uses contextual operation labels in editable round notes', () => {
    const operatorActions = ['1普', '1普', '1普', '1普', '1普'].map(
      (raw, index) => ({
        raw,
        order: index + 2,
        label: 'A',
      }),
    )
    const dragonDetection = {
      raw: '重开:检测1号位龙气',
      order: 24,
      label: '检测1号位龙气',
    }
    const round = {
      round: 1,
      slots: { 1: operatorActions },
      others: [
        { raw: '重开:无橙星', order: 1, label: '无橙星' },
        dragonDetection,
      ],
    }
    const config = createOperationShareCardConfig()
    config.notes[1] = '手动备注'
    const display = getOperationShareRoundDisplay(round, config)

    expect(getOperationShareRoundNoteText(round, config)).toBe(
      '无橙星重开 5A后检测1号位龙气\n手动备注',
    )
    expect(
      getOperationShareNoteActionLabel(
        round,
        dragonDetection,
        display.displayOrderByActionOrder,
      ),
    ).toBe('5A后检测1号位龙气')
    expect(getOperationShareActionLabel(dragonDetection)).toBe(
      '24检测1号位龙气',
    )

    const elevenOperatorActions = Array.from({ length: 11 }, (_, index) => ({
      raw: '1普',
      order: index + 2,
      label: 'A',
    }))
    const elevenActionRound = {
      round: 1,
      slots: { 1: elevenOperatorActions },
      others: [
        {
          raw: '重开:检测1号位退场',
          order: 13,
          label: '检测1号位退场',
        },
      ],
    }
    const elevenActionDisplay = getOperationShareRoundDisplay(
      elevenActionRound,
      config,
    )

    expect(
      getOperationShareNoteActionLabel(
        elevenActionRound,
        elevenActionRound.others[0],
        elevenActionDisplay.displayOrderByActionOrder,
      ),
    ).toBe('11A后检测1号位退场')

    config.roundNoteOverrides = {
      1: '21在某操作后，检测周泰退场',
    }

    expect(getOperationShareRoundNoteText(round, config)).toBe(
      '21在某操作后，检测周泰退场',
    )
  })

  it('renumbers actions when an earlier waiting action is absent', () => {
    const attack = { raw: '1普', order: 2, label: 'A' }
    const display = getOperationShareRoundDisplay(
      { round: 1, slots: { 1: [attack] }, others: [] },
      { showOtherActions: true, showTargetSwitches: true },
    )

    expect(
      getOperationShareActionLabel(
        attack,
        display.displayOrderByActionOrder.get(attack.order),
      ),
    ).toBe('1A')
  })
})

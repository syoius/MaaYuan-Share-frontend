import { CopilotInfoStatusEnum } from 'maa-copilot-client'
import { describe, expect, it, vi } from 'vitest'

import { CopilotDocV1 } from '../../models/copilot.schema'
import type { Operation } from '../../models/operation'
import { OPERATORS } from '../../models/operator'
import {
  OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION,
  OPERATION_SHARE_CARD_KEYS,
  OPERATION_SHARE_CELL_COLOR_KEYS,
  ObjectUrlStore,
  buildOperationShareCardConfigPayload,
  buildOperationShareCellKey,
  buildOperationShareDiscKey,
  buildOperationShareFilename,
  buildOperationShareModel,
  buildOperationShareUrl,
  calculateSharePixelRatio,
  createOperationShareCardConfig,
  filterOperationShareActions,
  getOperationShareCellSelectionState,
  getRenderableOperationShareConfigs,
  loadOperationShareCardConfig,
  mergeOperationShareRemoteConfigs,
  readOperationShareShortCode,
  resolveOperationShareCardConfig,
  resolveOperationShareShortCode,
  saveOperationShareCardConfig,
  saveOperationShareShortCode,
  updateOperationShareCellSelection,
} from './operationShareModel'

function createOperation(): Operation {
  return {
    uploader: '测试作者',
    preLevel: { name: '测试关卡' },
    parsedContent: {
      doc: { title: '测试作业', details: '' },
      stageName: '1-1',
      opers: [{ name: '测试密探', skill: 2 }],
      groups: [{ name: '替补组', opers: [{ name: '替补密探' }] }],
      actions: [],
    },
  } as unknown as Operation
}

describe('operation share model', () => {
  it('maps metadata, operators, groups and empty actions', () => {
    const model = buildOperationShareModel(createOperation(), 'cn')

    expect(model.title).toBe('测试作业')
    expect(model.stage).toBe('测试关卡')
    expect(model.author).toBe('测试作者')
    expect(model.operators[0]).toMatchObject({
      slot: 1,
      skill: 2,
      rawName: '测试密探',
    })
    expect(model.groups[0].operators[0].rawName).toBe('替补密探')
    expect(model.rounds).toEqual([])
  })

  it('hides concrete requirements for unrestricted operators', () => {
    const operation = createOperation()
    const operator = operation.parsedContent.opers?.[0] as
      (CopilotDocV1.Operator & { unrestricted?: boolean }) | undefined
    if (!operator) throw new Error('测试密探不存在')
    operator.unrestricted = true

    const model = buildOperationShareModel(operation, 'cn')

    expect(model.operators[0]).toMatchObject({
      starLevel: undefined,
      attack: undefined,
      hp: undefined,
      elite: undefined,
      level: undefined,
      skillLevel: undefined,
      potentiality: undefined,
      discs: [],
    })
  })

  it('reads star_level from operation content instead of static rarity', () => {
    const operation = createOperation()
    const operator = operation.parsedContent.opers?.[0] as
      (CopilotDocV1.Operator & { star_level?: number }) | undefined
    if (!operator) throw new Error('测试密探不存在')
    operator.star_level = 4

    const model = buildOperationShareModel(operation, 'cn')

    expect(model.operators[0].starLevel).toBe(4)
  })

  it('maps deployed operator requirements, stats, discs, and stones', () => {
    const info = OPERATORS.find((operator) => operator.discs.length >= 2)
    if (!info) throw new Error('缺少带命盘的测试密探')
    const operation = createOperation()
    operation.parsedContent.opers = [
      {
        name: info.name,
        skill: 2,
        requirements: {
          elite: 1,
          level: 50,
          skillLevel: 8,
          potentiality: 4,
          module: CopilotDocV1.Module.A,
        },
        discsSelected: [1, -2, 0],
        discStarStones: ['主星一', '主星二', ''],
        discAssistStars: ['辅星一', '辅星二', ''],
        extensions: {
          stats: {
            starLevel: 5,
            attack: 4321,
            hp: 9876,
          },
        },
      } as unknown as CopilotDocV1.Operator,
    ]

    const operator = buildOperationShareModel(operation, 'cn').operators[0]

    expect(operator).toMatchObject({
      skill: 2,
      elite: 1,
      level: 50,
      skillLevel: 8,
      potentiality: 4,
      starLevel: 5,
      attack: 4321,
      hp: 9876,
      discs: [
        {
          slot: 1,
          abbreviation: info.discs[0].abbreviation,
          forbidden: false,
          starStone: '主星一',
          assistStar: '辅星一',
        },
        {
          slot: 2,
          abbreviation: info.discs[1].abbreviation,
          forbidden: true,
          starStone: '主星二',
          assistStar: '辅星二',
        },
      ],
    })
  })

  it('falls back to extension disc slots when legacy arrays are absent', () => {
    const info = OPERATORS.find((operator) => operator.discs.length > 0)
    if (!info) throw new Error('缺少带命盘的测试密探')
    const operation = createOperation()
    operation.parsedContent.opers = [
      {
        name: info.name,
        extensions: {
          discs: {
            slots: [
              {
                index: 0,
                disc: 1,
                starStone: '扩展主星',
                assistStar: '扩展辅星',
              },
            ],
          },
        },
      } as unknown as CopilotDocV1.Operator,
    ]

    expect(
      buildOperationShareModel(operation, 'cn').operators[0].discs[0],
    ).toMatchObject({
      abbreviation: info.discs[0].abbreviation,
      starStone: '扩展主星',
      assistStar: '扩展辅星',
    })
  })

  it('includes the original author only for reposted operations', () => {
    const operation = createOperation()
    operation.metadata = {
      sourceType: 'repost',
      repostAuthor: '原作者昵称',
    }

    expect(buildOperationShareModel(operation, 'cn').originalAuthor).toBe(
      '原作者昵称',
    )

    operation.metadata.sourceType = 'original'
    expect(
      buildOperationShareModel(operation, 'cn').originalAuthor,
    ).toBeUndefined()
  })

  it('uses an original operation source URL as the share QR target', () => {
    const operation = createOperation()
    operation.metadata = {
      sourceType: 'original',
      repostUrl: 'https://space.bilibili.com/123',
    }

    expect(buildOperationShareModel(operation, 'cn')).toMatchObject({
      source: {
        type: 'original',
        originalUrl: 'https://space.bilibili.com/123',
      },
      qrTargetUrl: 'https://space.bilibili.com/123',
      qrLabel: '扫码访问作者平台',
    })
  })

  it('uses stable fallbacks for incomplete legacy operations', () => {
    const operation = createOperation()
    operation.uploader = ''
    operation.parsedContent.doc.title = ''
    operation.parsedContent.stageName = ''
    operation.preLevel = undefined
    operation.parsedContent.opers = undefined
    operation.parsedContent.groups = undefined

    const model = buildOperationShareModel(operation, 'cn')
    expect(model).toMatchObject({
      title: '未命名作业',
      stage: '未知关卡',
      author: '匿名作者',
      operators: [],
      groups: [],
    })
  })

  it('keeps action order and compact symbols consistent with the action table', () => {
    const operation = createOperation()
    operation.parsedContent.actions = [
      {
        type: CopilotDocV1.Type.Skill,
        name: '测试密探',
        doc: '第1回合·动作1：测试密探 A [1普]',
      },
      {
        type: CopilotDocV1.Type.Skill,
        name: '测试密探',
        doc: '第1回合·动作2：测试密探 ↑ [1大]',
      },
    ]

    const model = buildOperationShareModel(operation, 'cn')

    expect(model.rounds[0]?.slots[1]).toEqual([
      { raw: '1普', order: 1, label: 'A' },
      { raw: '1大', order: 2, label: '↑' },
    ])
  })

  it('places left and right target switching actions in the other column', () => {
    const operation = createOperation()
    operation.parsedContent.actions = [
      {
        type: CopilotDocV1.Type.MoveCamera,
        distance: [-1, 0],
        doc: '第1回合·动作1：切换至左侧目标 [额外:左侧目标]',
      },
      {
        type: CopilotDocV1.Type.Skill,
        name: '测试密探',
        doc: '第1回合·动作2：测试密探 A [1普]',
      },
      {
        type: CopilotDocV1.Type.MoveCamera,
        distance: [1, 0],
        doc: '第1回合·动作3：切换至右侧目标 [额外:右侧目标]',
      },
    ]

    const round = buildOperationShareModel(operation, 'cn').rounds[0]

    expect(round?.slots[1]).toEqual([{ raw: '1普', order: 2, label: 'A' }])
    expect(round?.others).toEqual([
      { raw: '额外:左侧目标', order: 1, label: '右滑' },
      { raw: '额外:右侧目标', order: 3, label: '左滑' },
    ])
  })

  it('places death restart actions in the other column', () => {
    const operation = createOperation()
    operation.parsedContent.actions = [
      {
        type: CopilotDocV1.Type.Output,
        doc: '第1回合·动作1：检测3号位阵亡 [重开:检测3号位阵亡]',
      },
    ]

    const model = buildOperationShareModel(operation, 'cn')
    const round = model.rounds[0]

    expect(round?.slots[3]).toEqual([])
    expect(round?.others).toEqual([
      {
        raw: '重开:检测3号位阵亡',
        order: 1,
        label: '检测3号位阵亡',
      },
    ])
    expect(model.actionSlots).toEqual([1])
  })

  it('places parrot restart actions in the other column', () => {
    const operation = createOperation()
    operation.parsedContent.actions = [
      {
        type: CopilotDocV1.Type.Output,
        doc: '第1回合·动作1：检测2号位鹦鹉 [重开:检测2号位鹦鹉]',
      },
    ]

    const model = buildOperationShareModel(operation, 'cn')
    const round = model.rounds[0]

    expect(round?.slots[2]).toEqual([])
    expect(round?.others).toEqual([
      {
        raw: '重开:检测2号位鹦鹉',
        order: 1,
        label: '检测2号位鹦鹉',
      },
    ])
    expect(model.actionSlots).toEqual([1])
  })

  it('hides waiting actions from every share image column', () => {
    const operation = createOperation()
    operation.parsedContent.actions = [
      {
        type: CopilotDocV1.Type.Output,
        doc: '第1回合·动作1：等待1000毫秒 [额外:等待:1000]',
      },
      {
        type: CopilotDocV1.Type.Skill,
        name: '测试密探',
        doc: '第1回合·动作2：测试密探 A [1普]',
      },
    ]

    const round = buildOperationShareModel(operation, 'cn').rounds[0]

    expect(round?.slots[1]).toEqual([{ raw: '1普', order: 2, label: 'A' }])
    expect(round?.others).toEqual([])
  })
})

describe('renderable operation share configs', () => {
  it('returns only supported author configs under their matching card kind', () => {
    expect(
      getRenderableOperationShareConfigs([
        {
          cardKey: 'actions',
          schemaVersion: 1,
          revision: 2,
          payload: { showNotes: true, notes: { 1: '作者备注' } },
        },
        {
          cardKey: 'deployed-operators',
          schemaVersion: 2,
          revision: 1,
          payload: { requiredDiscs: { '1:1': true } },
        },
        {
          cardKey: 'unknown-card',
          schemaVersion: 1,
          revision: 1,
          payload: {},
        },
      ]),
    ).toEqual({
      actions: {
        ...createOperationShareCardConfig(),
        showNotes: true,
        notes: { 1: '作者备注' },
      },
    })
  })

  it('keeps action and deployed-operator author configs independent', () => {
    expect(
      getRenderableOperationShareConfigs([
        {
          cardKey: 'actions',
          schemaVersion: 1,
          revision: 1,
          payload: { showOtherActions: false },
        },
        {
          cardKey: 'deployed-operators',
          schemaVersion: 1,
          revision: 1,
          payload: { requiredDiscs: { '2:3': true } },
        },
      ]),
    ).toMatchObject({
      actions: { showOtherActions: false, requiredDiscs: {} },
      operators: {
        showOtherActions: true,
        requiredDiscs: { '2:3': true },
      },
    })
  })
})

describe('share image utilities', () => {
  function createMemoryStorage() {
    const values = new Map<string, string>()
    return {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value)
      }),
    }
  }

  it('creates independent editable card configurations', () => {
    const first = createOperationShareCardConfig()
    const second = createOperationShareCardConfig()

    first.notes[1] = '第一回合备注'

    expect(first).toMatchObject({
      showTargetSwitches: true,
      showOtherActions: true,
      showNotes: false,
    })
    expect(second.notes).toEqual({})
  })

  it('builds stable cell keys and filters target switching actions on demand', () => {
    const actions = [
      { raw: '额外:左侧目标', order: 1, label: '右滑' },
      { raw: '额外:开大', order: 2, label: '大' },
    ]

    expect(buildOperationShareCellKey(2, 'slot-3')).toBe('2:slot-3')
    expect(filterOperationShareActions(actions, false)).toEqual([
      { raw: '额外:开大', order: 2, label: '大' },
    ])
    expect(filterOperationShareActions(actions, true)).toBe(actions)
  })

  it('builds stable deployed operator disc keys', () => {
    expect(buildOperationShareDiscKey(2, 3)).toBe('2:3')
  })

  it('selects and clears a whole row or column while preserving other cells', () => {
    const groupKeys = ['1:slot-1', '1:slot-2']
    const unrelatedKey = '2:slot-1'
    const selected = updateOperationShareCellSelection(
      new Set([unrelatedKey]),
      groupKeys,
      true,
    )

    expect([...selected]).toEqual([unrelatedKey, ...groupKeys])
    expect(getOperationShareCellSelectionState(selected, groupKeys)).toEqual({
      checked: true,
      indeterminate: false,
    })

    const cleared = updateOperationShareCellSelection(
      selected,
      groupKeys,
      false,
    )
    expect([...cleared]).toEqual([unrelatedKey])
  })

  it('reports partially selected rows and columns as indeterminate', () => {
    expect(
      getOperationShareCellSelectionState(new Set(['1:slot-1']), [
        '1:slot-1',
        '1:slot-2',
      ]),
    ).toEqual({ checked: false, indeterminate: true })
  })

  it('persists an explicit short code choice per operation', () => {
    const storage = createMemoryStorage()

    expect(readOperationShareShortCode(100, storage)).toBeUndefined()
    expect(saveOperationShareShortCode(100, false, storage)).toBe(true)
    expect(readOperationShareShortCode(100, storage)).toBe(false)
    expect(readOperationShareShortCode(101, storage)).toBeUndefined()

    expect(saveOperationShareShortCode(100, true, storage)).toBe(true)
    expect(readOperationShareShortCode(100, storage)).toBe(true)
  })

  it('ignores stored short code values that are not booleans', () => {
    const storage = createMemoryStorage()
    storage.setItem('maa-copilot-operation-share-short-code:100', 'yes')

    expect(readOperationShareShortCode(100, storage)).toBeUndefined()
  })

  it('defaults the short code to hidden only for private operations', () => {
    expect(
      resolveOperationShareShortCode(
        { status: CopilotInfoStatusEnum.Private },
        undefined,
      ),
    ).toBe(false)
    expect(
      resolveOperationShareShortCode(
        { status: CopilotInfoStatusEnum.Public },
        undefined,
      ),
    ).toBe(true)
    expect(
      resolveOperationShareShortCode({ status: undefined }, undefined),
    ).toBe(true)
  })

  it('lets an explicit short code choice override the visibility default', () => {
    expect(
      resolveOperationShareShortCode(
        { status: CopilotInfoStatusEnum.Private },
        true,
      ),
    ).toBe(true)
    expect(
      resolveOperationShareShortCode(
        { status: CopilotInfoStatusEnum.Public },
        false,
      ),
    ).toBe(false)
  })

  it('persists editable card settings per operation', () => {
    const storage = createMemoryStorage()
    const config = createOperationShareCardConfig()
    config.showTargetSwitches = false
    config.showOtherActions = false
    config.showNotes = true
    config.tableColor = '#336699'
    config.tableThemeOverrides = {
      border: '#123456',
      pageBackground: '#fefefd',
    }
    config.notes[2] = '第二回合先等待'
    config.cellColors['2:slot-3'] = 'blue'
    config.requiredDiscs['2:1'] = true

    expect(saveOperationShareCardConfig(100, config, storage)).toBe(true)
    expect(loadOperationShareCardConfig(100, storage)).toEqual(config)
    expect(loadOperationShareCardConfig(101, storage)).toEqual(
      createOperationShareCardConfig(),
    )
  })

  it('splits action and deployed operator payloads by card kind', () => {
    const config = createOperationShareCardConfig()
    config.showNotes = true
    config.notes[2] = '等待技能结束'
    config.cellColors['2:slot-1'] = 'pink'
    config.requiredDiscs['1:3'] = true

    expect(buildOperationShareCardConfigPayload('actions', config)).toEqual({
      showTargetSwitches: true,
      showOtherActions: true,
      showNotes: true,
      showCellPattern: true,
      tableColor: undefined,
      tableThemeOverrides: undefined,
      notes: { 2: '等待技能结束' },
      cellColors: { '2:slot-1': 'pink' },
    })
    expect(buildOperationShareCardConfigPayload('operators', config)).toEqual({
      requiredDiscs: { '1:3': true },
    })
  })

  it('merges independently versioned remote card payloads', () => {
    expect(
      mergeOperationShareRemoteConfigs([
        {
          cardKey: OPERATION_SHARE_CARD_KEYS.actions,
          schemaVersion: OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION,
          revision: 2,
          payload: { showNotes: true, notes: { 1: '作者备注' } },
        },
        {
          cardKey: OPERATION_SHARE_CARD_KEYS.operators,
          schemaVersion: OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION,
          revision: 4,
          payload: { requiredDiscs: { '2:1': true } },
        },
      ]),
    ).toEqual({
      showTargetSwitches: true,
      showOtherActions: true,
      showNotes: true,
      showCellPattern: true,
      tableColor: undefined,
      tableThemeOverrides: undefined,
      notes: { 1: '作者备注' },
      cellColors: {},
      requiredDiscs: { '2:1': true },
    })
  })

  it('ignores unsupported remote versions and preserves local overrides per card kind', () => {
    const author = mergeOperationShareRemoteConfigs([
      {
        cardKey: OPERATION_SHARE_CARD_KEYS.actions,
        schemaVersion: OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION + 1,
        revision: 2,
        payload: { showNotes: true, notes: { 1: '未来版本' } },
      },
      {
        cardKey: OPERATION_SHARE_CARD_KEYS.operators,
        schemaVersion: OPERATION_SHARE_CARD_CONFIG_SCHEMA_VERSION,
        revision: 1,
        payload: { requiredDiscs: { '1:1': true } },
      },
    ])
    const local = createOperationShareCardConfig()
    local.showOtherActions = false

    expect(resolveOperationShareCardConfig(local, author)).toEqual({
      showTargetSwitches: true,
      showOtherActions: false,
      showNotes: false,
      showCellPattern: true,
      tableColor: undefined,
      tableThemeOverrides: undefined,
      notes: {},
      cellColors: {},
      requiredDiscs: { '1:1': true },
    })
  })

  it('falls back safely when cached settings are invalid', () => {
    const storage = createMemoryStorage()
    storage.getItem.mockReturnValueOnce('{invalid json')

    expect(loadOperationShareCardConfig(100, storage)).toEqual(
      createOperationShareCardConfig(),
    )

    storage.getItem.mockReturnValueOnce(
      JSON.stringify({
        version: 1,
        config: {
          showTargetSwitches: false,
          showOtherActions: false,
          showNotes: true,
          tableColor: '#369',
          notes: { 1: 'x'.repeat(200), invalid: 3 },
          cellColors: {
            '1:others': '#F4D9D1',
            '2:notes': '#f2dfb9',
            'bad-key': '#ffffff',
            '3:slot-1': '#D8E9E4',
            '4:slot-2': '#AECBD4',
            '5:slot-3': '#abcdef',
            '6:slot-1': 'YELLOW',
            '7:slot-2': 'green',
          },
          requiredDiscs: {
            '1:1': true,
            '2:3': false,
            'bad-key': true,
          },
        },
      }),
    )

    expect(loadOperationShareCardConfig(100, storage)).toEqual({
      showTargetSwitches: false,
      showOtherActions: false,
      showNotes: true,
      showCellPattern: true,
      tableColor: '#336699',
      tableThemeOverrides: undefined,
      notes: { 1: 'x'.repeat(160) },
      cellColors: {
        '3:slot-1': 'green',
        '4:slot-2': 'blue',
        '6:slot-1': 'yellow',
        '7:slot-2': 'green',
      },
      requiredDiscs: { '1:1': true },
    })
  })

  it('migrates the legacy hex palette to color names', () => {
    const storage = createMemoryStorage()
    storage.getItem.mockReturnValueOnce(
      JSON.stringify({
        version: 1,
        config: {
          cellColors: {
            '1:slot-1': '#fff3c9',
            '1:slot-2': '#ffe3ed',
            '1:slot-3': '#c3e8ff',
            '1:slot-4': '#e1edc1',
            '1:slot-5': '#edf8ff',
            '2:slot-1': '#e69f00',
            '2:slot-2': '#009e73',
          },
        },
      }),
    )

    // 旧版本把颜色存成 hex，统一按色系归一为颜色名；
    // 是否带底纹改由 showCellPattern 控制。
    expect(loadOperationShareCardConfig(100, storage).cellColors).toEqual({
      '1:slot-1': 'yellow',
      '1:slot-2': 'pink',
      '1:slot-3': 'blue',
      '1:slot-4': 'green',
      '1:slot-5': 'ice',
      '2:slot-1': 'yellow',
      '2:slot-2': 'green',
    })
  })

  it('accepts every color name and drops unknown values', () => {
    const storage = createMemoryStorage()
    const cellColors: Record<string, string> = {}
    OPERATION_SHARE_CELL_COLOR_KEYS.forEach((colorKey, index) => {
      cellColors[`1:slot-${index + 1}`] = colorKey
    })
    cellColors['2:slot-1'] = 'YELLOW'
    cellColors['2:slot-2'] = 'yellow-plain'
    storage.getItem.mockReturnValueOnce(
      JSON.stringify({ version: 1, config: { cellColors } }),
    )

    const normalized = loadOperationShareCardConfig(100, storage).cellColors

    expect(Object.keys(normalized)).toHaveLength(
      OPERATION_SHARE_CELL_COLOR_KEYS.length + 1,
    )
    // 颜色名大小写不敏感
    expect(normalized['2:slot-1']).toBe('yellow')
    // 未知值（例如已废弃的词形）必须丢弃，避免写进作者配置
    expect(normalized['2:slot-2']).toBeUndefined()
  })

  it('defaults the cell pattern switch to on and keeps an explicit choice', () => {
    const storage = createMemoryStorage()
    storage.getItem.mockReturnValueOnce(
      JSON.stringify({ version: 1, config: { cellColors: {} } }),
    )

    expect(loadOperationShareCardConfig(100, storage).showCellPattern).toBe(
      true,
    )

    storage.getItem.mockReturnValueOnce(
      JSON.stringify({ version: 1, config: { showCellPattern: false } }),
    )

    expect(loadOperationShareCardConfig(100, storage).showCellPattern).toBe(
      false,
    )
  })

  it('shows the other actions column for caches created before the option existed', () => {
    const storage = createMemoryStorage()
    storage.getItem.mockReturnValueOnce(
      JSON.stringify({
        version: 1,
        config: {
          showTargetSwitches: false,
          showNotes: false,
          notes: {},
          cellColors: {},
        },
      }),
    )

    expect(loadOperationShareCardConfig(100, storage)).toMatchObject({
      showOtherActions: true,
      requiredDiscs: {},
    })
  })

  it('builds the QR code URL from the current origin and operation id', () => {
    expect(buildOperationShareUrl(29533, 'https://share.maayuan.top')).toBe(
      'https://share.maayuan.top/?op=29533',
    )
  })

  it('sanitizes download filenames', () => {
    expect(
      buildOperationShareFilename({ stage: '1/2', title: '攻略:<>"' }),
    ).toBe('1-2-攻略----.png')
  })

  it('adds a deployed operator suffix to operator share image filenames', () => {
    expect(
      buildOperationShareFilename(
        { stage: '测试关卡', title: '测试作业' },
        'operators',
      ),
    ).toBe('测试关卡-测试作业-上阵密探.png')
  })

  it('keeps generated canvas height within the configured limit', () => {
    expect(calculateSharePixelRatio(4000)).toBe(2)
    expect(calculateSharePixelRatio(10000)).toBe(1.6)
    expect(calculateSharePixelRatio(20000)).toBe(1)
    expect(calculateSharePixelRatio(0)).toBe(2)
  })

  it('revokes object URLs when replacing and disposing previews', () => {
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })
    const store = new ObjectUrlStore()

    expect(store.replace(new Blob(['first']))).toBe('blob:first')
    expect(store.replace(new Blob(['second']))).toBe('blob:second')
    store.revoke()

    expect(revokeObjectURL).toHaveBeenNthCalledWith(1, 'blob:first')
    expect(revokeObjectURL).toHaveBeenNthCalledWith(2, 'blob:second')
  })
})

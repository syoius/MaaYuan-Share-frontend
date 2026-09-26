import QRCode from 'qrcode'
import ReactDOM from 'react-dom/client'

import { OperationShareCard } from './components/viewer/OperationShareCard'
import {
  OPERATION_SHARE_CELL_COLOR_KEYS,
  type OperationShareModel,
  createOperationShareCardConfig,
} from './components/viewer/operationShareModel'
import './styles/blueprint.less'
import './styles/global.css'

const operators = [
  ['杨修', 'char_001_yangxiu'],
  ['贾诩', 'char_002_jiaxu'],
  ['孙尚香', 'char_003_sunshangxiang'],
  ['郭嘉', 'char_004_guojia'],
  ['鲁肃', 'char_005_lusu'],
] as const

// 第 1 回合给 5 个颜色各上一个单元格，
// 下面会分别渲染「增加底纹」开 / 关两张图，方便目测对比。
const shareCellColorDemo = (() => {
  const config = createOperationShareCardConfig()

  OPERATION_SHARE_CELL_COLOR_KEYS.forEach((colorKey, colorIndex) => {
    config.cellColors[`1:slot-${colorIndex + 1}`] = colorKey
  })

  return config
})()

async function render() {
  const maayuanUrl = 'https://share.maayuan.top/?op=29533'
  const originalUrl = 'https://www.bilibili.com/read/cv29533'
  // 改这里可以预览关闭「分享神秘代码」后的页脚布局
  const showShortCode = true
  const qrDataUrl = await QRCode.toDataURL(originalUrl)
  const model: OperationShareModel = {
    title: '22 期地宫 40 层张郃稳定通关作业',
    stage: '地宫 40 层',
    author: 'MaaYuan 作者',
    originalAuthor: '原作者昵称',
    source: {
      type: 'repost',
      strategyAuthor: '原作者昵称',
      sharer: 'MaaYuan 作者',
      platform: '哔哩哔哩',
      originalUrl,
    },
    shortCode: '29533',
    maayuanUrl,
    qrTargetUrl: originalUrl,
    qrLabel: '扫码查看原贴',
    operators: operators.map(([name, avatarId], index) => ({
      slot: index + 1,
      name,
      rawName: name,
      avatarId,
      starLevel: index + 1,
      skill: 2,
      elite: 2,
      level: 60,
      skillLevel: 10,
      potentiality: 1,
      discs: [],
    })),
    groups: [],
    actionSlots: [1, 2, 3, 4, 5],
    rounds: [1, 2].map((round) => ({
      round,
      slots: Object.fromEntries(
        [1, 2, 3, 4, 5].map((slot) => [
          slot,
          [{ raw: '1普', order: slot, label: String(slot) }],
        ]),
      ),
      others: [],
    })),
  }
  document.body.style.cssText = 'padding:40px;background:#dfe4e2'
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <>
      <OperationShareCard
        config={{ ...shareCellColorDemo, showCellPattern: true }}
        model={model}
        qrDataUrl={qrDataUrl}
        showShortCode={showShortCode}
      />
      <OperationShareCard
        config={{ ...shareCellColorDemo, showCellPattern: false }}
        model={model}
        qrDataUrl={qrDataUrl}
        showShortCode={showShortCode}
      />
    </>,
  )
}

void render()

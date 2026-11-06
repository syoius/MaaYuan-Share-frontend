import { Callout } from '@blueprintjs/core'

import { Link } from 'react-router-dom'

export const OperatorRecorderPage = () => (
  <main className="mx-auto max-w-3xl px-4 py-8">
    <h1 className="text-2xl">绣衣楼配置已停用</h1>
    <Callout>
      新的密探养成请在 YuanHub 维护，然后在作业编辑器中选择「从 YuanHub 导入」。
      已有绣衣楼预设及配置保留，可在作业编辑器或原有筛选中继续套用，不再新增或修改。
    </Callout>
    <p>
      <Link to="/editor">前往作业编辑器</Link>
    </p>
  </main>
)

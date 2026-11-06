import { HTMLSelect } from '@blueprintjs/core'

import { useId, useState } from 'react'

import type { YuanHubTrainingSnapshot } from '../../../models/yuanhubTraining'
import {
  OperatorImportPreview,
  OperatorImportTarget,
} from './OperatorImportPreview'
import { yuanHubImportCandidate } from './yuanhubImportModel'

export function YuanHubDirectImport({
  snapshot,
  ...target
}: OperatorImportTarget & { snapshot: YuanHubTrainingSnapshot }) {
  const formId = useId()
  const [loadouts, setLoadouts] = useState<Record<string, string>>({})
  const candidates = snapshot.operators
    .filter((entry) => entry.owned !== false)
    .map((entry) =>
      yuanHubImportCandidate(
        entry,
        loadouts[entry.id] ?? entry.loadouts[0]?.id,
      ),
    )
  return (
    <OperatorImportPreview
      {...target}
      candidates={candidates}
      renderOptions={(id) => {
        const entry = snapshot.operators.find((op) => op.id === id)!
        return (
          entry.loadouts.length > 0 && (
            <label htmlFor={`${formId}-${id}`} className="block text-sm">
              {candidates.find((c) => c.key === id)?.label}的实际命盘
              <HTMLSelect
                id={`${formId}-${id}`}
                fill
                value={loadouts[id] ?? entry.loadouts[0].id}
                onChange={(e) => {
                  const value = e.currentTarget.value
                  setLoadouts((old) => ({ ...old, [id]: value }))
                }}
              >
                {entry.loadouts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}：{l.discs.join('、') || '未配置'}
                  </option>
                ))}
              </HTMLSelect>
            </label>
          )
        )
      }}
    />
  )
}

import {
  Button,
  Callout,
  Checkbox,
  HTMLSelect,
  InputGroup,
} from '@blueprintjs/core'

import { ReactNode, useId, useState } from 'react'

import { formatError } from '../../../utils/error'
import type { EditorOperator } from '../types'
import {
  OperatorImportCandidate,
  OperatorImportMode,
  mergeImportedOperators,
} from './yuanhubImportModel'

export interface OperatorImportTarget {
  currentOperators: EditorOperator[]
  groupCount: number
  onApply: (operators: EditorOperator[], mode: OperatorImportMode) => void
}

export function OperatorImportPreview({
  candidates,
  currentOperators,
  groupCount,
  onApply,
  renderOptions,
}: OperatorImportTarget & {
  candidates: OperatorImportCandidate[]
  renderOptions?: (key: string) => ReactNode
}) {
  const modeId = useId()
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<OperatorImportMode>('append')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const available = Math.max(
    0,
    5 - groupCount - (mode === 'append' ? currentOperators.length : 0),
  )
  const apply = () => {
    try {
      const operators = selected.map(
        (key) => candidates.find((item) => item.key === key)?.operator,
      )
      if (operators.some((op) => !op))
        throw new Error('档案已变化，请重新选择密探')
      const incoming = operators as EditorOperator[]
      mergeImportedOperators(currentOperators, incoming, groupCount, mode)
      onApply(incoming, mode)
    } catch (caught) {
      setError(formatError(caught))
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <label htmlFor={modeId}>
        导入方式
        <HTMLSelect
          id={modeId}
          fill
          value={mode}
          onChange={(e) => {
            setMode(e.currentTarget.value as OperatorImportMode)
            setSelected([])
            setError('')
          }}
        >
          <option value="append">追加密探（保留当前阵容）</option>
          <option value="replace">
            替换当前固定阵容（保留候选分组，可撤销）
          </option>
        </HTMLSelect>
      </label>
      <p className="m-0">
        已选择 {selected.length} / {available} 位；候选分组占 {groupCount}{' '}
        个位置。
      </p>
      <InputGroup
        aria-label="搜索导入密探"
        placeholder="搜索密探名称"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <ul className="m-0 max-h-[35dvh] list-none space-y-3 overflow-y-auto p-0">
        {candidates
          .filter((item) => item.label.includes(query.trim()))
          .map((item) => {
            const checked = selected.includes(item.key)
            const duplicate =
              mode === 'append' &&
              currentOperators.some((op) => op.name === item.operator?.name)
            return (
              <li
                key={item.key}
                className="border-b border-gray-200 pb-3 dark:border-gray-700"
              >
                <Checkbox
                  checked={checked}
                  disabled={
                    !item.operator ||
                    duplicate ||
                    (!checked && selected.length >= available)
                  }
                  onChange={() =>
                    setSelected((keys) =>
                      checked
                        ? keys.filter((key) => key !== item.key)
                        : [...keys, item.key],
                    )
                  }
                >
                  {item.label}
                  {duplicate ? '（阵容中已有）' : ''}
                </Checkbox>
                {renderOptions?.(item.key)}
                {item.operator && (
                  <p className="my-1 text-sm opacity-75">
                    等级 {item.operator.requirements?.level ?? '未知'} · 修为{' '}
                    {item.operator.requirements?.elite ?? '未知'} · 星级{' '}
                    {item.operator.starLevel ?? '未知'} · 攻击{' '}
                    {item.operator.attack ?? '未知'} · 生命{' '}
                    {item.operator.hp ?? '未知'}
                  </p>
                )}
                {item.warnings.length > 0 && (
                  <p className="my-1 text-sm" role="note">
                    {item.warnings.join('；')}
                  </p>
                )}
              </li>
            )
          })}
      </ul>
      {!candidates.length && <p>没有可导入的密探。</p>}
      {error && (
        <Callout intent="danger" role="alert">
          {error}
        </Callout>
      )}
      <Button
        intent="primary"
        disabled={!selected.length || selected.length > available}
        onClick={apply}
      >
        {mode === 'append' ? '追加所选密探' : '确认替换固定阵容'}
      </Button>
    </div>
  )
}

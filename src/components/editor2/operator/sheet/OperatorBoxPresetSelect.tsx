import { Button, Callout, Dialog, DialogBody } from '@blueprintjs/core'

import { useAtomValue } from 'jotai'
import { useEffect, useRef, useState } from 'react'

import { useOperatorBoxPresets } from '../../../../apis/operator-box-preset'
import { loadOperatorBoxTrainingConfigs } from '../../../../apis/operator-box-training-config'
import { getOperatorBoxKeys } from '../../../../models/operator-box-preset'
import { authAtom } from '../../../../store/auth'
import { formatError } from '../../../../utils/error'
import { createOperator } from '../../reconciliation'
import {
  OperatorImportPreview,
  OperatorImportTarget,
} from '../OperatorImportPreview'
import { applyOperatorTrainingConfig } from '../operatorTrainingConfigModel'
import type { OperatorImportCandidate } from '../yuanhubImportModel'

export function OperatorBoxPresetSelect(props: OperatorImportTarget) {
  const { userId } = useAtomValue(authAtom)
  const { data: presets = [], error, isLoading } = useOperatorBoxPresets()
  const [selected, setSelected] = useState<string>()
  const [candidates, setCandidates] = useState<OperatorImportCandidate[]>()
  const [loadError, setLoadError] = useState('')
  const sequence = useRef({ id: 0 })
  useEffect(() => {
    setSelected(undefined)
    setCandidates(undefined)
    const requests = sequence.current
    return () => {
      requests.id++
    }
  }, [userId])
  const close = () => {
    sequence.current.id++
    setSelected(undefined)
    setCandidates(undefined)
  }
  const load = async (id: string) => {
    const preset = presets.find((item) => item.id === id)
    if (!preset) return
    const request = ++sequence.current.id
    setSelected(preset.label)
    setCandidates(undefined)
    setLoadError('')
    try {
      const configs = await loadOperatorBoxTrainingConfigs(id)
      if (request !== sequence.current.id) return
      setCandidates(
        getOperatorBoxKeys(preset).map((name) => {
          const base = createOperator({ name })
          const config = configs.find((item) => item.operatorId === name)
          return {
            key: name,
            label: name,
            warnings: [],
            operator: config ? applyOperatorTrainingConfig(base, config) : base,
          }
        }),
      )
    } catch (caught) {
      if (request === sequence.current.id) setLoadError(formatError(caught))
    }
  }
  return (
    <>
      {isLoading ? (
        <Button minimal disabled loading>
          读取旧预设
        </Button>
      ) : error ? (
        <Callout intent="danger">{formatError(error)}</Callout>
      ) : (
        presets.map((preset) => (
          <Button
            minimal
            key={preset.id}
            icon="people"
            title={preset.label}
            onClick={() => void load(preset.id)}
          >
            旧预设：{preset.label}
          </Button>
        ))
      )}
      <Dialog
        isOpen={selected !== undefined}
        onClose={close}
        canOutsideClickClose={false}
        title={`套用旧预设：${selected ?? ''}`}
        className="!w-[92vw] sm:!w-[640px]"
        style={{ maxHeight: '90dvh' }}
      >
        <DialogBody className="overflow-y-auto">
          <p>旧预设仅供读取。选择本次使用的密探，原预设成员与配置不会改变。</p>
          {loadError ? (
            <Callout intent="danger" role="alert">
              {loadError}
            </Callout>
          ) : candidates ? (
            <OperatorImportPreview
              {...props}
              candidates={candidates}
              onApply={(operators, mode) => {
                props.onApply(operators, mode)
                close()
              }}
            />
          ) : (
            <p role="status">正在读取配置…</p>
          )}
        </DialogBody>
      </Dialog>
    </>
  )
}

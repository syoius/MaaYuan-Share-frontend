import { Button, Dialog, DialogBody, DialogFooter } from '@blueprintjs/core'

import { FC, useState } from 'react'

import { useTranslation } from '../../i18n/i18n'
import { LevelSelect as LevelSelectV2 } from './LevelSelect'

interface Props {
  isOpen: boolean
  onClose: () => void
  value?: string
  keyword?: string
  onChange: (stageId: string) => void
  onFilter?: (keyword: string) => void
}

export const LevelSelectDialog: FC<Props> = (props) =>
  props.isOpen ? <LevelSearchDialog {...props} /> : null

const LevelSearchDialog: FC<Props> = ({
  isOpen,
  onClose,
  value,
  keyword,
  onChange,
  onFilter,
}) => {
  const t = useTranslation()
  const [pendingStageId, setPendingStageId] = useState(value ?? '')
  const [pendingKeyword, setPendingKeyword] = useState(
    value ? '' : (keyword ?? ''),
  )

  const submit = () => {
    if (pendingStageId) {
      onChange(pendingStageId)
    } else if (pendingKeyword.trim()) {
      onFilter?.(pendingKeyword.trim())
    } else {
      onChange('')
    }
    onClose()
  }

  const resetAll = () => {
    onChange('')
    onClose()
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t.components.LevelSelect.level}
    >
      <DialogBody>
        <LevelSelectV2
          value={pendingStageId}
          initialQuery={value ? undefined : (keyword ?? '')}
          onSearchQueryChange={(query) => {
            setPendingKeyword(query)
            setPendingStageId('')
          }}
          onChange={(stageId) => {
            setPendingStageId(stageId)
            setPendingKeyword('')
          }}
          onFilterChange={(query) => {
            setPendingKeyword(query)
            setPendingStageId('')
          }}
        />
      </DialogBody>
      <DialogFooter
        actions={
          <>
            <Button minimal icon="cross" onClick={onClose}>
              取消
            </Button>
            <Button intent="primary" icon="tick" onClick={submit}>
              搜索
            </Button>
            <Button className="ml-2" onClick={resetAll}>
              重置
            </Button>
          </>
        }
      />
    </Dialog>
  )
}

export default LevelSelectDialog

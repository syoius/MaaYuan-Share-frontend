import { Button, NonIdealState } from '@blueprintjs/core'
import { Tooltip2 } from '@blueprintjs/popover2'

import {
  UseOperationSetsParams,
  deleteOperationSet,
  useOperationSetSearch,
  useRefreshOperationSets,
} from 'apis/operation-set'
import { ComponentType } from 'react'

import { Confirm } from 'components/Confirm'
import { OperationSetCard } from 'components/OperationSetCard'
import { withSuspensable } from 'components/Suspensable'

import { useTranslation } from '../../i18n/i18n'
import { SearchError } from '../SearchError'

interface AdminOperationSetListProps extends UseOperationSetsParams {}

export const AdminOperationSetList: ComponentType<AdminOperationSetListProps> =
  withSuspensable(({ ...params }) => {
    const t = useTranslation()
    const refresh = useRefreshOperationSets()

    const {
      operationSets,
      isReachingEnd,
      isValidating,
      setSize,
      error,
      retry,
    } = useOperationSetSearch({
      ...params,
      suspense: false,
    })

    return (
      <>
        {operationSets.map((opset) => (
          <div key={opset.id} className="mb-4 sm:mb-2 last:mb-0">
            <OperationSetCard operationSet={opset} />
            <div className="flex flex-wrap justify-end gap-2 mt-2 sm:mt-1">
              <Confirm
                intent="danger"
                confirmButtonText={t.common.delete}
                canOutsideClickCancel
                canEscapeKeyCancel
                trigger={({ handleClick }) => (
                  <Tooltip2 placement="bottom" content={t.common.delete}>
                    <Button
                      small
                      icon="trash"
                      intent="danger"
                      onClick={handleClick}
                    >
                      {t.common.delete}
                    </Button>
                  </Tooltip2>
                )}
                onConfirm={async () => {
                  await deleteOperationSet({ id: opset.id })
                  refresh()
                }}
              />
            </div>
          </div>
        ))}

        {error && (
          <SearchError error={error} retry={retry} loading={isValidating} />
        )}

        {!error && isReachingEnd && operationSets.length === 0 && (
          <NonIdealState
            icon="slash"
            title={t.components.OperationSetList.no_job_sets_found}
          />
        )}

        {!error && !isReachingEnd && (
          <Button
            loading={isValidating}
            text={t.components.OperationSetList.load_more}
            icon="more"
            className="mt-2"
            large
            fill
            onClick={() => setSize((size) => size + 1)}
          />
        )}
      </>
    )
  })

AdminOperationSetList.displayName = 'AdminOperationSetList'

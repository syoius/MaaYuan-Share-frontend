import { Button, NonIdealState } from '@blueprintjs/core'

import { useTranslation } from '../i18n/i18n'
import { formatError } from '../utils/error'

export const SearchError = ({
  error,
  retry,
  loading,
}: {
  error: unknown
  retry: () => Promise<unknown>
  loading: boolean
}) => {
  const t = useTranslation()
  return (
    <div role="alert">
      <NonIdealState
        icon="issue"
        title={t.components.Suspensable.loadFailed}
        description={formatError(error)}
        className="py-8"
        action={
          <Button icon="refresh" loading={loading} onClick={() => void retry()}>
            {t.components.Suspensable.retry}
          </Button>
        }
      />
    </div>
  )
}

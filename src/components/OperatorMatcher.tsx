import {
  Button,
  Callout,
  Dialog,
  DialogBody,
  FormGroup,
  HTMLSelect,
  Icon,
  InputGroup,
  Switch,
} from '@blueprintjs/core'

import { useEffect, useMemo, useRef, useState } from 'react'

import { readYuanHubAccounts, readYuanHubSnapshot } from '../apis/yuanhub'
import { useTranslation } from '../i18n/i18n'
import { OPERATORS } from '../models/generated/operators.json'
import {
  OperationMatchResult,
  YuanHubAccounts,
} from '../models/operatorMatcher'
import {
  emptyMatcherSettings,
  getMatcherAccountKey,
  useOperatorMatcher,
} from '../store/operatorMatcher'
import { Confirm } from './Confirm'
import { OperatorSelect } from './OperatorSelect'

import './OperatorMatcher.css'

export function OperatorMatchSummary({
  result,
}: {
  result?: OperationMatchResult
}) {
  const t = useTranslation().components.OperatorMatcher
  if (!result) return null
  if (!result.reasons.length)
    return (
      <div className="text-sm leading-relaxed">
        <strong>{t[result.mode]}</strong>
      </div>
    )
  return (
    <details className="text-sm leading-relaxed">
      <summary
        className="cursor-pointer"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <strong>{t[result.mode]}</strong> · {result.reasons[0]}
      </summary>
      <ul className="pl-5 list-disc">
        {result.reasons.map((reason, index) => (
          <li key={index}>{reason}</li>
        ))}
      </ul>
    </details>
  )
}

export function OperatorMatcher({
  userId,
  settings,
  setSettings,
}: ReturnType<typeof useOperatorMatcher>) {
  const t = useTranslation().components.OperatorMatcher
  const [open, setOpen] = useState(false)
  const token = settings.token ?? ''
  const [draftToken, setDraftToken] = useState(token)
  const [editingToken, setEditingToken] = useState(false)
  const [connection, setConnection] = useState<YuanHubAccounts>()
  const [accountId, setAccountId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController>()
  const tokenInput = useRef<HTMLInputElement>(null)
  const changeTokenButton = useRef<HTMLButtonElement>(null)
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (open)
      (editingToken ? tokenInput.current : changeTokenButton.current)?.focus()
  }, [editingToken, open])
  const snapshot = settings.snapshot
  const hasConnection = Boolean(connection || snapshot)
  const matcherAccountKey = snapshot && getMatcherAccountKey(snapshot)
  const excludedOperatorIds =
    (matcherAccountKey && settings.excludedByAccount?.[matcherAccountKey]) || []
  const availableOperators = useMemo(
    () =>
      snapshot
        ? OPERATORS.filter(
            (operator) =>
              snapshot.operators[operator.id] &&
              snapshot.operators[operator.id].owned !== false,
          )
        : [],
    [snapshot],
  )
  const setExcludedOperators = (names: string[]) => {
    if (!matcherAccountKey || loading || editingToken) return
    const ids = OPERATORS.filter((operator) =>
      names.includes(operator.name),
    ).map((operator) => operator.id)
    setSettings((current) => ({
      ...current,
      excludedByAccount: {
        ...current.excludedByAccount,
        [matcherAccountKey]: ids,
      },
    }))
  }

  const closeDialog = () => {
    if (editingToken) {
      request.current?.abort()
      setLoading(false)
    }
    setOpen(false)
    setEditingToken(false)
    setError('')
  }

  const disconnect = () => {
    request.current?.abort()
    request.current = undefined
    setLoading(false)
    setConnection(undefined)
    setAccountId('')
    setError('')
    setDraftToken('')
    setEditingToken(true)
    setSettings(emptyMatcherSettings())
  }
  const sync = async (selectedId?: string, newToken?: string) => {
    const requestToken = (newToken ?? token).trim()
    const changingConnection = newToken !== undefined
    if (!userId || !requestToken) return
    const enableAfterSync = snapshot ? settings.enabled : true
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    if (!changingConnection)
      setSettings((current) => ({ ...current, enabled: false }))
    const timeout = setTimeout(() => {
      controller.abort()
      setLoading(false)
      setError(t.failed)
      if (!changingConnection)
        setSettings((current) => ({ ...current, enabled: false }))
    }, 40000)
    controller.signal.addEventListener('abort', () => clearTimeout(timeout), {
      once: true,
    })
    try {
      const list =
        selectedId && connection && !changingConnection
          ? connection
          : await readYuanHubAccounts(requestToken, userId, controller.signal)
      if (controller.signal.aborted) return
      if (!changingConnection) setConnection(list)
      const targetId = changingConnection
        ? undefined
        : (selectedId ?? (accountId || snapshot?.accountId))
      const account = targetId
        ? list.accounts.find((a) => a.id === targetId)
        : list.accounts[0]
      if (!account) {
        if (list.accounts.length || snapshot) {
          setError(list.accounts.length ? t.failed : t.no_accounts)
        } else {
          setConnection(list)
          setAccountId('')
          setSettings((current) => ({
            ...current,
            token: requestToken,
            enabled: false,
          }))
          setEditingToken(false)
        }
        return
      }
      const updatedSnapshot = await readYuanHubSnapshot(
        requestToken,
        userId,
        controller.signal,
        list.connectionId,
        account,
      )
      if (!controller.signal.aborted) {
        setConnection(list)
        setAccountId(account.id)
        setEditingToken(false)
        setDraftToken(requestToken)
        setSettings((current) => ({
          ...current,
          token: requestToken,
          enabled: enableAfterSync,
          snapshot: updatedSnapshot,
        }))
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : t.failed)
        // 失败后保留上次档案供查看，但停止用旧账号/旧权限继续筛选。
        if (!changingConnection)
          setSettings((current) => ({ ...current, enabled: false }))
      }
    } finally {
      clearTimeout(timeout)
      if (request.current === controller) setLoading(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        minimal
        icon="comparison"
        active={Boolean(settings.enabled && snapshot)}
        onClick={() => {
          setOpen(true)
          setDraftToken(token)
          setEditingToken(!hasConnection)
          if (!loading) void sync()
        }}
      >
        {t.title}
      </Button>
      {snapshot && (
        <>
          <Switch
            className="!mb-0"
            checked={settings.enabled}
            disabled={loading}
            label={t.enabled}
            onChange={(event) => {
              const enabled = event.currentTarget.checked
              setSettings((current) => ({ ...current, enabled }))
            }}
          />
        </>
      )}
      <Dialog
        isOpen={open}
        onClose={closeDialog}
        canOutsideClickClose={false}
        title={t.title}
        className="operator-matcher-dialog"
        style={{ maxHeight: '90vh' }}
      >
        <DialogBody className="matcher-body">
          {!userId ? (
            <Callout>{t.login}</Callout>
          ) : (
            <>
              {hasConnection && !editingToken ? (
                <div className="matcher-connection">
                  <div className="matcher-label-row">
                    <strong>{t.connection_saved}</strong>
                    <Button
                      outlined
                      className="matcher-secondary"
                      elementRef={changeTokenButton}
                      disabled={loading}
                      onClick={() => {
                        setDraftToken('')
                        setError('')
                        setEditingToken(true)
                      }}
                    >
                      {t.change_token}
                    </Button>
                  </div>
                  <p className="matcher-help">{t.token_help}</p>
                </div>
              ) : (
                <div className="matcher-field">
                  <div className="matcher-label-row">
                    <label htmlFor="yuanhub-matcher-token">{t.token}</label>
                    <a
                      href={`${import.meta.env.VITE_YUANHUB_URL || 'https://beta-hub.maayuan.com'}/user/profile?connect=operator-match`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.create_token} <Icon icon="share" size={12} />
                    </a>
                  </div>
                  <InputGroup
                    id="yuanhub-matcher-token"
                    type="password"
                    autoComplete="off"
                    aria-describedby="yuanhub-token-help"
                    value={draftToken}
                    placeholder={t.token_placeholder}
                    inputRef={tokenInput}
                    disabled={loading}
                    onChange={(event) => {
                      setDraftToken(event.currentTarget.value)
                      setError('')
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !loading)
                        void sync(undefined, draftToken)
                    }}
                  />
                  <p id="yuanhub-token-help" className="matcher-help">
                    {t.token_help}
                  </p>
                  {hasConnection && (
                    <p className="matcher-help">{t.replace_help}</p>
                  )}
                </div>
              )}
              {(connection || snapshot) && (
                <div className="matcher-field">
                  <div className="matcher-label-row">
                    <label htmlFor="yuanhub-matcher-account">{t.account}</label>
                    {!editingToken && (
                      <Button
                        outlined
                        className="matcher-secondary"
                        icon="refresh"
                        aria-label={t.sync}
                        loading={loading}
                        disabled={!userId || !token.trim()}
                        onClick={() => void sync()}
                      >
                        {t.refresh}
                      </Button>
                    )}
                  </div>
                  <FormGroup>
                    {connection && !connection.accounts.length ? (
                      <Callout>{t.no_accounts}</Callout>
                    ) : (
                      <HTMLSelect
                        id="yuanhub-matcher-account"
                        fill
                        disabled={loading || !connection || editingToken}
                        value={accountId || snapshot?.accountId || ''}
                        options={
                          connection
                            ? [
                                ...(snapshot &&
                                !connection.accounts.some(
                                  (a) => a.id === snapshot.accountId,
                                )
                                  ? [
                                      {
                                        value: snapshot.accountId,
                                        label: `${snapshot.accountName} · ${snapshot.game}`,
                                        disabled: true,
                                      },
                                    ]
                                  : []),
                                ...connection.accounts.map((a) => ({
                                  value: a.id,
                                  label: `${a.name} · ${a.game}`,
                                })),
                              ]
                            : snapshot
                              ? [
                                  {
                                    value: snapshot.accountId,
                                    label: `${snapshot.accountName} · ${snapshot.game}`,
                                  },
                                ]
                              : []
                        }
                        onChange={(event) => {
                          const id = event.currentTarget.value
                          void sync(id)
                        }}
                      />
                    )}
                  </FormGroup>
                  {snapshot && (
                    <div aria-live="polite">
                      <p className="matcher-help matcher-metadata">
                        <span>
                          {t.count({
                            count: Object.keys(snapshot.operators).length,
                          })}
                        </span>
                        <span
                          title={new Date(snapshot.syncedAt).toLocaleString()}
                        >
                          {t.synced}{' '}
                          {new Date(snapshot.syncedAt).toLocaleDateString()}{' '}
                          {new Date(snapshot.syncedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </p>
                      {Object.keys(snapshot.operators).length === 0 && (
                        <Callout className="mt-3">{t.empty}</Callout>
                      )}
                    </div>
                  )}
                  {!connection && snapshot && (
                    <p className="matcher-help">{t.refresh_accounts}</p>
                  )}
                </div>
              )}
              {snapshot && (
                <div className="matcher-exclusions">
                  <div className="matcher-label-row">
                    <label htmlFor="yuanhub-matcher-excluded">
                      {t.excluded_operators}
                    </label>
                    <Button
                      outlined
                      className="matcher-secondary"
                      disabled={
                        loading || editingToken || !excludedOperatorIds.length
                      }
                      onClick={() => setExcludedOperators([])}
                    >
                      {t.clear_excluded}
                    </Button>
                  </div>
                  <OperatorSelect
                    key={matcherAccountKey}
                    id="yuanhub-matcher-excluded"
                    disabled={loading || editingToken}
                    availableOperators={availableOperators}
                    browseOnFocus
                    placeholder={t.excluded_placeholder}
                    operators={OPERATORS.filter((operator) =>
                      excludedOperatorIds.includes(operator.id),
                    ).map((operator) => operator.name)}
                    onChange={setExcludedOperators}
                  />
                </div>
              )}
              {loading && (
                <p className="matcher-help" role="status">
                  {editingToken ? t.connecting : t.syncing}
                </p>
              )}
              {error && (
                <Callout intent="danger" role="alert">
                  {error}
                  {snapshot && (
                    <p className="matcher-error-help">
                      {editingToken ? t.connection_unchanged : t.sync_failed}
                    </p>
                  )}
                  {!editingToken && (
                    <Button minimal onClick={() => void sync()}>
                      {t.retry}
                    </Button>
                  )}
                </Callout>
              )}
              <div className="matcher-preferences">
                <div className="matcher-toggle-row">
                  <label htmlFor="yuanhub-matcher-enabled">{t.enabled}</label>
                  <Switch
                    id="yuanhub-matcher-enabled"
                    aria-label={t.enabled}
                    checked={settings.enabled}
                    disabled={!snapshot || loading || editingToken}
                    onChange={(event) => {
                      const enabled = event.currentTarget.checked
                      setSettings((current) => ({ ...current, enabled }))
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </DialogBody>
        {userId && (
          <div className="matcher-footer">
            {(hasConnection || token) && (
              <Confirm
                intent="danger"
                confirmButtonText={t.disconnect_confirm}
                onConfirm={disconnect}
                trigger={({ handleClick }) => (
                  <Button
                    outlined
                    intent="danger"
                    className="matcher-disconnect"
                    disabled={loading}
                    onClick={handleClick}
                  >
                    {t.disconnect}
                  </Button>
                )}
              >
                <h3>{t.disconnect_title}</h3>
                <p>{t.disconnect_description}</p>
              </Confirm>
            )}
            {(editingToken || !hasConnection) && (
              <div className="matcher-actions">
                {hasConnection && (
                  <Button
                    outlined
                    className="matcher-secondary"
                    onClick={() => {
                      request.current?.abort()
                      setLoading(false)
                      setEditingToken(false)
                      setError('')
                    }}
                  >
                    {t.cancel}
                  </Button>
                )}
                <Button
                  intent="primary"
                  loading={loading}
                  disabled={!draftToken.trim()}
                  onClick={() => void sync(undefined, draftToken)}
                >
                  {t.connect}
                </Button>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  )
}

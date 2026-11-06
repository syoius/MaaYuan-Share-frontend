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

import { useEffect, useRef, useState } from 'react'

import { readYuanHubAccounts, readYuanHubSnapshot } from '../apis/yuanhub'
import { useTranslation } from '../i18n/i18n'
import {
  MATCH_MODES,
  OperationMatchResult,
  YuanHubAccounts,
} from '../models/operatorMatcher'
import {
  emptyMatcherSettings,
  useOperatorMatcher,
} from '../store/operatorMatcher'

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
  const [connection, setConnection] = useState<YuanHubAccounts>()
  const [accountId, setAccountId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController>()
  useEffect(() => () => request.current?.abort(), [])
  const snapshot = settings.snapshot
  const stale =
    snapshot &&
    Date.now() - Date.parse(snapshot.updatedAt ?? snapshot.syncedAt) >
      7 * 86400000

  const disconnect = () => {
    request.current?.abort()
    request.current = undefined
    setLoading(false)
    setConnection(undefined)
    setAccountId('')
    setError('')
    setSettings(emptyMatcherSettings())
  }
  const sync = async (selectedId?: string) => {
    if (!userId || !token.trim()) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    setSettings((current) => ({
      ...current,
      enabled: false,
      snapshot: undefined,
    }))
    const timeout = setTimeout(() => {
      controller.abort()
      setLoading(false)
      setError(t.failed)
      setSettings((current) => ({ ...current, enabled: false }))
    }, 40000)
    controller.signal.addEventListener('abort', () => clearTimeout(timeout), {
      once: true,
    })
    try {
      const list =
        selectedId && connection
          ? connection
          : await readYuanHubAccounts(token, userId, controller.signal)
      if (controller.signal.aborted) return
      setConnection(list)
      const account =
        list.accounts.find(
          (a) => a.id === (selectedId ?? (accountId || snapshot?.accountId)),
        ) ?? (selectedId ? undefined : list.accounts[0])
      setAccountId(account?.id ?? '')
      if (!account) return
      const snapshot = await readYuanHubSnapshot(
        token,
        userId,
        controller.signal,
        list.connectionId,
        account,
      )
      if (!controller.signal.aborted)
        setSettings((current) => ({ ...current, enabled: true, snapshot }))
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : t.failed)
        // 失败后保留上次档案供查看，但停止用旧账号/旧权限继续筛选。
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
        onClick={() => setOpen(true)}
      >
        {t.title}
      </Button>
      {snapshot && (
        <>
          <Switch
            className="!mb-0"
            checked={settings.enabled}
            label={t.enabled}
            onChange={(event) => {
              const enabled = event.currentTarget.checked
              setSettings((current) => ({ ...current, enabled }))
            }}
          />
          {settings.enabled &&
            MATCH_MODES.map((mode) => (
              <Button
                key={mode}
                small
                minimal
                active={settings.modes.includes(mode)}
                aria-pressed={settings.modes.includes(mode)}
                disabled={
                  settings.modes.length === 1 && settings.modes[0] === mode
                }
                onClick={() =>
                  setSettings((current) => ({
                    ...current,
                    modes: current.modes.includes(mode)
                      ? current.modes.filter((m) => m !== mode)
                      : [...current.modes, mode],
                  }))
                }
              >
                {t[mode]}
              </Button>
            ))}
        </>
      )}
      <Dialog
        isOpen={open}
        onClose={() => setOpen(false)}
        title={t.title}
        className="operator-matcher-dialog"
        style={{ maxHeight: '90vh' }}
      >
        <DialogBody className="matcher-body">
          {!userId ? (
            <Callout>{t.login}</Callout>
          ) : (
            <>
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
                  value={token}
                  placeholder={t.token_placeholder}
                  onChange={(event) => {
                    const token = event.currentTarget.value
                    request.current?.abort()
                    setLoading(false)
                    setConnection(undefined)
                    setAccountId('')
                    setError('')
                    setSettings((current) => ({
                      ...current,
                      token,
                      enabled: false,
                      snapshot: undefined,
                    }))
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !loading) void sync()
                  }}
                />
                <p id="yuanhub-token-help" className="matcher-help">
                  {t.token_help}
                </p>
              </div>
              {(connection || snapshot) && (
                <div className="matcher-field">
                  <FormGroup
                    label={t.account}
                    labelFor="yuanhub-matcher-account"
                  >
                    {connection && !connection.accounts.length ? (
                      <Callout>{t.no_accounts}</Callout>
                    ) : (
                      <HTMLSelect
                        id="yuanhub-matcher-account"
                        fill
                        disabled={loading || !connection}
                        value={accountId || snapshot?.accountId || ''}
                        options={
                          connection
                            ? connection.accounts.map((a) => ({
                                value: a.id,
                                label: `${a.name} · ${a.game}`,
                              }))
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
                          setAccountId(id)
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
                        <span>
                          {t.synced}{' '}
                          {new Date(snapshot.syncedAt).toLocaleString()}
                        </span>
                      </p>
                      {Object.keys(snapshot.operators).length === 0 && (
                        <Callout className="mt-3">{t.empty}</Callout>
                      )}
                      {stale && (
                        <p className="matcher-warning">
                          <Icon icon="warning-sign" size={16} />
                          <span>{t.stale}</span>
                        </p>
                      )}
                    </div>
                  )}
                  {!connection && snapshot && (
                    <p className="matcher-help">{t.refresh_accounts}</p>
                  )}
                </div>
              )}
              {error && (
                <Callout intent="danger" role="alert">
                  {error}
                </Callout>
              )}
              <div className="matcher-preferences">
                <div className="matcher-toggle-row">
                  <label htmlFor="yuanhub-matcher-enabled">{t.enabled}</label>
                  <Switch
                    id="yuanhub-matcher-enabled"
                    aria-label={t.enabled}
                    checked={settings.enabled}
                    disabled={!snapshot || loading}
                    onChange={(event) => {
                      const enabled = event.currentTarget.checked
                      setSettings((current) => ({ ...current, enabled }))
                    }}
                  />
                </div>
                <p className="matcher-help">{t.match_help}</p>
                <details className="matcher-details">
                  <summary>
                    {t.details} <Icon icon="chevron-down" size={14} />
                  </summary>
                  <div>
                    <p>{t.rules}</p>
                    <p>{t.limitations}</p>
                    <p>{t.scope}</p>
                    <p>{t.privacy}</p>
                  </div>
                </details>
              </div>
            </>
          )}
        </DialogBody>
        <div className="matcher-footer">
          {(snapshot || connection || token || loading) && (
            <Button minimal className="matcher-disconnect" onClick={disconnect}>
              {t.disconnect}
            </Button>
          )}
          <div className="matcher-actions">
            <Button minimal onClick={() => setOpen(false)}>
              {t.close}
            </Button>
            <Button
              intent="primary"
              loading={loading}
              disabled={!userId || !token.trim()}
              onClick={() => void sync()}
            >
              {connection || snapshot ? t.sync : t.connect}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

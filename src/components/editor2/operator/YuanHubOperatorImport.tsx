import {
  Button,
  Callout,
  Dialog,
  DialogBody,
  HTMLSelect,
  InputGroup,
} from '@blueprintjs/core'

import { useEffect, useId, useRef, useState } from 'react'

import { readYuanHubAccounts, readYuanHubTraining } from '../../../apis/yuanhub'
import type { YuanHubAccounts } from '../../../models/operatorMatcher'
import type { YuanHubTrainingSnapshot } from '../../../models/yuanhubTraining'
import { useOperatorMatcher } from '../../../store/operatorMatcher'
import { formatError } from '../../../utils/error'
import type { OperatorImportTarget } from './OperatorImportPreview'
import { YuanHubTeamPresets } from './YuanHubTeamPresets'

import '../../OperatorMatcher.css'
import './YuanHubOperatorImport.css'

export function YuanHubOperatorImport(props: OperatorImportTarget) {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)
  const [editing, setEditing] = useState(false)
  const { userId, settings } = useOperatorMatcher()
  const close = () => {
    if (editing && !window.confirm('放弃尚未保存的阵容修改？')) return
    setOpen(false)
    setEditing(false)
  }
  return (
    <>
      <Button
        minimal
        icon="import"
        onClick={() => {
          setSession((value) => value + 1)
          setOpen(true)
        }}
      >
        从 YuanHub 导入
      </Button>
      <Dialog
        isOpen={open}
        onClose={close}
        canOutsideClickClose={false}
        title={editing ? '编辑阵容预设' : '从 YuanHub 导入养成'}
        className={`operator-matcher-dialog yuanhub-import-dialog${editing ? ' yuanhub-team-edit-dialog' : ''}`}
        style={{ maxHeight: '90dvh' }}
      >
        {open &&
          (userId ? (
            <ImportSession
              key={`${userId}:${session}`}
              {...props}
              userId={userId}
              initialToken={settings.token ?? ''}
              initialAccountId={settings.snapshot?.accountId}
              onEditingChange={setEditing}
              onClose={close}
              onApply={(operators, mode) => {
                props.onApply(operators, mode)
                setOpen(false)
                setEditing(false)
              }}
            />
          ) : (
            <DialogBody className="matcher-body">
              <Callout>请先登录本站，再使用 YuanHub 连接码导入。</Callout>
            </DialogBody>
          ))}
      </Dialog>
    </>
  )
}

function ImportSession({
  userId,
  initialToken,
  initialAccountId,
  onEditingChange,
  onClose,
  ...target
}: OperatorImportTarget & {
  userId: string
  initialToken: string
  initialAccountId?: string
  onEditingChange: (value: boolean) => void
  onClose: () => void
}) {
  const formId = useId()
  const [token, setToken] = useState(initialToken)
  const [editingToken, setEditingToken] = useState(!initialToken)
  const [connection, setConnection] = useState<YuanHubAccounts>()
  const [accountId, setAccountId] = useState('')
  const [snapshot, setSnapshot] = useState<YuanHubTrainingSnapshot>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController>()
  const sync = async (selectedId?: string) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    setSnapshot(undefined)
    const timeout = window.setTimeout(() => {
      controller.abort()
      setBusy(false)
      setError('读取超时，请重试')
    }, 20000)
    controller.signal.addEventListener('abort', () => clearTimeout(timeout), {
      once: true,
    })
    try {
      const data = await readYuanHubAccounts(token, userId, controller.signal)
      if (controller.signal.aborted) return
      setConnection(data)
      const account =
        data.accounts.find(
          (a) => a.id === (selectedId ?? (accountId || initialAccountId)),
        ) ?? data.accounts[0]
      setAccountId(account?.id ?? '')
      setEditingToken(false)
      if (account) {
        const training = await readYuanHubTraining(
          token,
          userId,
          controller.signal,
          data.connectionId,
          account,
        )
        if (!controller.signal.aborted) setSnapshot(training)
      }
    } catch (caught) {
      if (!controller.signal.aborted) setError(formatError(caught))
    } finally {
      clearTimeout(timeout)
      if (request.current === controller) setBusy(false)
    }
  }
  useEffect(() => {
    onEditingChange(false)
    if (initialToken) void sync(initialAccountId)
    return () => {
      request.current?.abort()
    }
    // 连接由本次弹窗会话持有，匹配设置变化不覆盖正在编辑的账号。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const connectionContent = (
    <>
      {!editingToken ? (
        <div className="matcher-label-row yuanhub-connection-status">
          <span>
            {token === initialToken
              ? 'YuanHub 只读连接已保存'
              : 'YuanHub 只读连接已就绪'}
          </span>
          <Button
            minimal
            disabled={busy}
            onClick={() => {
              setEditingToken(true)
              setError('')
            }}
          >
            更换连接码
          </Button>
        </div>
      ) : (
        <div className="matcher-field">
          <div className="matcher-label-row">
            <label htmlFor={`${formId}-token`}>作业匹配连接码</label>
            <a
              href={`${import.meta.env.VITE_YUANHUB_URL || 'https://beta-hub.maayuan.com'}/user/profile?connect=operator-match`}
              target="_blank"
              rel="noopener noreferrer"
            >
              在 YuanHub 获取只读连接码
            </a>
          </div>
          <InputGroup
            id={`${formId}-token`}
            type="password"
            autoComplete="off"
            value={token}
            placeholder="ymatch_…"
            disabled={busy}
            onChange={(e) => {
              setToken(e.currentTarget.value)
              setSnapshot(undefined)
              setConnection(undefined)
              setAccountId('')
            }}
          />
          <p className="matcher-help">
            连接码仅用于只读访问，不上传至预设云存储。新输入的连接码仅用于本次导入。
          </p>
          <Button
            intent="primary"
            loading={busy}
            disabled={!token.trim()}
            onClick={() => void sync()}
          >
            读取游戏账号
          </Button>
        </div>
      )}
      {connection && !editingToken && (
        <div className="matcher-field yuanhub-account-field">
          <label htmlFor={`${formId}-account`}>游戏账号</label>
          <div className="yuanhub-account-controls">
            {connection.accounts.length ? (
              <HTMLSelect
                id={`${formId}-account`}
                fill
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.currentTarget.value)
                  void sync(e.currentTarget.value)
                }}
              >
                {connection.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.game}
                  </option>
                ))}
              </HTMLSelect>
            ) : (
              <Callout>此连接没有游戏账号，请先在 YuanHub 添加账号。</Callout>
            )}
            <Button
              outlined
              icon="refresh"
              className="matcher-secondary"
              loading={busy}
              onClick={() => void sync()}
            >
              刷新档案
            </Button>
          </div>
          {snapshot && (
            <p className="matcher-help">
              {snapshot.operators.filter((op) => op.owned !== false).length}{' '}
              名密探档案 · 本站同步于{' '}
              {new Date(snapshot.syncedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
      {busy && (
        <p className="matcher-help" role="status">
          正在读取游戏账号与养成档案…
        </p>
      )}
      {error && (
        <Callout intent="danger" role="alert">
          {error}
          <Button minimal onClick={() => void sync()}>
            重试
          </Button>
        </Callout>
      )}
    </>
  )
  return (
    <>
      {snapshot && !editingToken ? (
        <YuanHubTeamPresets
          key={JSON.stringify([
            snapshot.connectionId,
            snapshot.accountId,
            snapshot.game,
            snapshot.syncedAt,
          ])}
          {...target}
          snapshot={snapshot}
          userId={userId}
          onEditingChange={onEditingChange}
          connectionContent={connectionContent}
          onClose={onClose}
        />
      ) : (
        <>
          <DialogBody className="matcher-body">{connectionContent}</DialogBody>
          <div className="matcher-footer">
            <span className="matcher-help">
              仅复制到当前作业，不改写 YuanHub。
            </span>
            <Button outlined className="matcher-secondary" onClick={onClose}>
              取消
            </Button>
          </div>
        </>
      )}
    </>
  )
}

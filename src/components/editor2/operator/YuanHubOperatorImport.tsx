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
import {
  OperatorImportPreview,
  OperatorImportTarget,
} from './OperatorImportPreview'
import { yuanHubImportCandidate } from './yuanhubImportModel'

export function YuanHubOperatorImport(props: OperatorImportTarget) {
  const [open, setOpen] = useState(false)
  const { userId, settings } = useOperatorMatcher()
  return (
    <>
      <Button minimal icon="import" onClick={() => setOpen(true)}>
        从 YuanHub 导入
      </Button>
      <Dialog
        isOpen={open}
        onClose={() => setOpen(false)}
        canOutsideClickClose={false}
        title="从 YuanHub 导入养成"
        className="!w-[92vw] sm:!w-[640px]"
        style={{ maxHeight: '90dvh' }}
      >
        <DialogBody className="overflow-y-auto">
          {open &&
            (userId ? (
              <ImportSession
                key={userId}
                {...props}
                userId={userId}
                initialToken={settings.token ?? ''}
                onApply={(operators, mode) => {
                  props.onApply(operators, mode)
                  setOpen(false)
                }}
              />
            ) : (
              <Callout>请先登录本站，再使用 YuanHub 连接码导入。</Callout>
            ))}
        </DialogBody>
      </Dialog>
    </>
  )
}

function ImportSession({
  userId,
  initialToken,
  ...target
}: OperatorImportTarget & { userId: string; initialToken: string }) {
  const formId = useId()
  const [token, setToken] = useState(initialToken)
  const [connection, setConnection] = useState<YuanHubAccounts>()
  const [accountId, setAccountId] = useState('')
  const [snapshot, setSnapshot] = useState<YuanHubTrainingSnapshot>()
  const [loadouts, setLoadouts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController>()
  useEffect(() => () => request.current?.abort(), [])

  const cancel = () => {
    request.current?.abort()
    setSnapshot(undefined)
    setLoadouts({})
    setError('')
    setBusy(false)
  }
  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    setSnapshot(undefined)
    setLoadouts({})
    try {
      await action(controller.signal)
    } catch (caught) {
      if (!controller.signal.aborted) setError(formatError(caught))
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  const connect = () =>
    run(async (signal) => {
      setConnection(undefined)
      setAccountId('')
      const data = await readYuanHubAccounts(token, userId, signal)
      if (!signal.aborted) {
        setConnection(data)
        setAccountId(data.accounts[0]?.id ?? '')
      }
    })
  const refresh = () =>
    run(async (signal) => {
      const account = connection?.accounts.find((item) => item.id === accountId)
      if (!connection || !account) throw new Error('请选择游戏账号')
      const data = await readYuanHubTraining(
        token,
        userId,
        signal,
        connection.connectionId,
        account,
      )
      if (!signal.aborted) setSnapshot(data)
    })
  const candidates =
    snapshot?.operators
      .filter((entry) => entry.owned !== false)
      .map((entry) =>
        yuanHubImportCandidate(
          entry,
          loadouts[entry.id] ?? entry.loadouts[0]?.id,
        ),
      ) ?? []
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="m-0">
        只读取并复制到当前作业，不改写
        YuanHub、旧预设或首页匹配设置。缺失信息需手动填写。
      </p>
      <a
        href={`${import.meta.env.VITE_YUANHUB_URL || 'https://beta-hub.maayuan.com'}/user/profile?connect=operator-match`}
        target="_blank"
        rel="noopener noreferrer"
      >
        在 YuanHub 获取只读连接码
      </a>
      <label htmlFor={`${formId}-token`}>
        作业匹配连接码
        <InputGroup
          id={`${formId}-token`}
          type="password"
          autoComplete="off"
          value={token}
          placeholder="ymatch_…"
          onChange={(e) => {
            cancel()
            setConnection(undefined)
            setAccountId('')
            setToken(e.currentTarget.value)
          }}
        />
      </label>
      <Button
        disabled={!token.trim()}
        loading={busy && !connection}
        onClick={connect}
      >
        读取游戏账号
      </Button>
      {connection &&
        (connection.accounts.length ? (
          <div className="flex flex-wrap items-end gap-2">
            <label htmlFor={`${formId}-account`} className="min-w-0 grow">
              游戏账号
              <HTMLSelect
                id={`${formId}-account`}
                fill
                value={accountId}
                onChange={(e) => {
                  cancel()
                  setAccountId(e.currentTarget.value)
                }}
              >
                {connection.accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.game}
                  </option>
                ))}
              </HTMLSelect>
            </label>
            <Button loading={busy} disabled={!accountId} onClick={refresh}>
              读取养成档案
            </Button>
          </div>
        ) : (
          <Callout>此连接没有游戏账号，请先在 YuanHub 添加账号。</Callout>
        ))}
      {error && (
        <Callout intent="danger" role="alert">
          {error}
        </Callout>
      )}
      {snapshot && (
        <>
          <p className="m-0 text-sm">
            {snapshot.accountName} · {snapshot.game}
            。导入的是档案值，请按作业要求调整；星级不包含完整化极与觉醒信息。
          </p>
          <OperatorImportPreview
            key={snapshot.syncedAt}
            {...target}
            candidates={candidates}
            renderOptions={(id) => {
              const entry = snapshot.operators.find((op) => op.id === id)!
              return (
                entry.loadouts.length > 0 && (
                  <label
                    htmlFor={`${formId}-disc-${id}`}
                    className="block text-sm"
                  >
                    {candidates.find((c) => c.key === id)?.label}的实际命盘
                    <HTMLSelect
                      id={`${formId}-disc-${id}`}
                      fill
                      value={loadouts[id] ?? entry.loadouts[0].id}
                      onChange={(e) => {
                        const value = e.currentTarget.value
                        setLoadouts((old) => ({ ...old, [id]: value }))
                      }}
                    >
                      {entry.loadouts.map((loadout) => (
                        <option key={loadout.id} value={loadout.id}>
                          {loadout.name}：{loadout.discs.join('、') || '未配置'}
                        </option>
                      ))}
                    </HTMLSelect>
                  </label>
                )
              )
            }}
          />
        </>
      )}
    </div>
  )
}
